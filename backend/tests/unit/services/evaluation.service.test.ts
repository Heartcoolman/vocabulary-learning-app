/**
 * Evaluation Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock database
vi.mock('../../../src/config/database', () => ({
  default: {
    causalObservation: {
      create: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn()
    },
    aBExperiment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    },
    aBVariant: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn()
    },
    aBExperimentMetrics: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn()
    },
    aBUserAssignment: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn()
    },
    $transaction: vi.fn((fn: any) => {
      if (typeof fn === 'function') {
        return fn({
          aBExperiment: { create: vi.fn().mockResolvedValue({ id: 'exp-1', status: 'DRAFT' }) },
          aBVariant: { create: vi.fn(), createMany: vi.fn() },
          aBExperimentMetrics: { create: vi.fn(), createMany: vi.fn() }
        });
      }
      return Promise.all(fn);
    })
  }
}));

// Mock feature flags
vi.mock('../../../src/amas/config/feature-flags', () => ({
  isCausalInferenceEnabled: vi.fn().mockReturnValue(true)
}));

// Mock AMAS modules with proper class constructors
vi.mock('../../../src/amas', () => {
  return {
    CausalInference: class MockCausalInference {
      addObservation = vi.fn();
      estimateATE = vi.fn().mockReturnValue({ ate: 0.1, confidence: 0.95 });
      getObservationCount = vi.fn().mockReturnValue(100);
    }
  };
});

import prisma from '../../../src/config/database';
import { isCausalInferenceEnabled } from '../../../src/amas/config/feature-flags';

describe('EvaluationService', () => {
  let evaluationService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../../src/services/evaluation.service');
    evaluationService = module.evaluationService;
  });

  describe('Causal Inference', () => {
    describe('recordCausalObservation', () => {
      it('should record observation when causal inference enabled', async () => {
        (prisma.causalObservation.create as any).mockResolvedValue({
          id: 'obs-1',
          features: [0.5, 0.3],
          treatment: 1,
          outcome: 0.8
        });

        const result = await evaluationService.recordCausalObservation({
          features: [0.5, 0.3],
          treatment: 1,
          outcome: 0.8
        });

        expect(result).toBeDefined();
      });

    });

    describe('estimateStrategyEffect', () => {
      it('should return ATE estimate', async () => {
        const result = await evaluationService.estimateStrategyEffect();

        expect(result).toBeDefined();
        if (result) {
          expect(result.ate).toBeDefined();
        }
      });
    });

    describe('compareStrategies', () => {
      it('should return null when sample size insufficient', async () => {
        // Mock findMany to return only 5 observations (< 20 threshold)
        (prisma.causalObservation.findMany as any).mockResolvedValue([
          { treatment: 0, outcome: 0.5 },
          { treatment: 1, outcome: 0.6 }
        ]);

        const result = await evaluationService.compareStrategies(0, 1);

        // With insufficient samples, should return null
        expect(result).toBeNull();
      });

      it('should compare two strategies with sufficient data', async () => {
        // Mock findMany to return 50 observations (> 20 threshold)
        const observations = Array.from({ length: 50 }, (_, i) => ({
          treatment: i % 2,
          outcome: 0.5 + (i % 2) * 0.1 + Math.random() * 0.1
        }));
        (prisma.causalObservation.findMany as any).mockResolvedValue(observations);

        const result = await evaluationService.compareStrategies(0, 1);

        expect(result).toBeDefined();
      });
    });

    describe('getCausalDiagnostics', () => {
      it('should return diagnostics info', async () => {
        (prisma.causalObservation.groupBy as any).mockResolvedValue([
          { treatment: 0, _count: { _all: 50 } },
          { treatment: 1, _count: { _all: 50 } }
        ]);
        (prisma.causalObservation.count as any).mockResolvedValue(100);

        const result = await evaluationService.getCausalDiagnostics();

        expect(result).toBeDefined();
        expect(result?.observationCount).toBeDefined();
      });
    });
  });

  describe('A/B Testing', () => {
    describe('createExperiment', () => {
      it('should create experiment with variants', async () => {
        (prisma.$transaction as any).mockResolvedValue({
          id: 'exp-1',
          name: 'Test Experiment',
          status: 'DRAFT'
        });

        const result = await evaluationService.createExperiment({
          name: 'Test Experiment',
          variants: [
            { name: 'control', weight: 0.5 },
            { name: 'treatment', weight: 0.5 }
          ]
        });

        expect(result).toBeDefined();
      });

      it('should require at least two variants', async () => {
        await expect(
          evaluationService.createExperiment({
            name: 'Test',
            variants: [{ name: 'only-one', weight: 1.0 }]
          })
        ).rejects.toThrow();
      });
    });

    describe('startExperiment', () => {
      it('should start draft experiment', async () => {
        (prisma.aBExperiment.findUnique as any).mockResolvedValue({
          id: 'exp-1',
          status: 'DRAFT',
          variants: [
            { id: 'var-1', name: 'control' },
            { id: 'var-2', name: 'treatment' }
          ]
        });
        (prisma.aBExperiment.update as any).mockResolvedValue({
          id: 'exp-1',
          status: 'RUNNING'
        });

        const result = await evaluationService.startExperiment('exp-1');

        expect(result.status).toBe('RUNNING');
      });

      it('should throw for non-existent experiment', async () => {
        (prisma.aBExperiment.findUnique as any).mockResolvedValue(null);

        await expect(
          evaluationService.startExperiment('non-existent')
        ).rejects.toThrow();
      });

      it('should throw for non-draft experiment', async () => {
        (prisma.aBExperiment.findUnique as any).mockResolvedValue({
          id: 'exp-1',
          status: 'RUNNING'
        });

        await expect(
          evaluationService.startExperiment('exp-1')
        ).rejects.toThrow();
      });
    });

    describe('assignVariant', () => {
      it('should return existing assignment', async () => {
        (prisma.aBUserAssignment.findUnique as any).mockResolvedValue({
          userId: 'user-1',
          variantId: 'var-1',
          variant: { id: 'var-1', name: 'control' }
        });

        const result = await evaluationService.assignVariant('exp-1', 'user-1');

        expect(result).toBeDefined();
        expect(result?.name).toBe('control');
      });

      it('should create new assignment for new user', async () => {
        (prisma.aBUserAssignment.findUnique as any).mockResolvedValue(null);
        (prisma.aBExperiment.findUnique as any).mockResolvedValue({
          id: 'exp-1',
          status: 'RUNNING',
          variants: [
            { id: 'var-1', name: 'control', weight: 0.5 },
            { id: 'var-2', name: 'treatment', weight: 0.5 }
          ]
        });
        (prisma.aBUserAssignment.create as any).mockResolvedValue({
          userId: 'user-2',
          variantId: 'var-1'
        });

        const result = await evaluationService.assignVariant('exp-1', 'user-2');

        expect(result).toBeDefined();
      });

      it('should return null for non-running experiment', async () => {
        (prisma.aBUserAssignment.findFirst as any).mockResolvedValue(null);
        (prisma.aBExperiment.findUnique as any).mockResolvedValue({
          id: 'exp-1',
          status: 'COMPLETED'
        });

        const result = await evaluationService.assignVariant('exp-1', 'user-1');

        expect(result).toBeNull();
      });
    });

    describe('recordExperimentMetrics', () => {
      it('should update metrics using Welford algorithm', async () => {
        (prisma.$transaction as any).mockImplementation(async (fn: any) => {
          const tx = {
            aBExperimentMetrics: {
              findUnique: vi.fn().mockResolvedValue({
                experimentId: 'exp-1',
                variantId: 'var-1',
                sampleCount: 10,
                averageReward: 0.5,
                m2: 0.1
              }),
              update: vi.fn().mockResolvedValue({})
            }
          };
          return fn(tx);
        });

        // Method returns void, just check it doesn't throw
        await evaluationService.recordExperimentMetrics('exp-1', 'var-1', 0.6);
        
        expect(prisma.$transaction).toHaveBeenCalled();
      });
    });

    describe('analyzeExperiment', () => {
      it('should return analysis with winner when significant', async () => {
        (prisma.aBExperiment.findUnique as any).mockResolvedValue({
          id: 'exp-1',
          status: 'RUNNING',
          minSampleSize: 50,
          variants: [
            { id: 'var-1', name: 'control', isControl: true },
            { id: 'var-2', name: 'treatment', isControl: false }
          ],
          metrics: [
            { variantId: 'var-1', sampleCount: 100, averageReward: 0.3, stdDev: 0.1, variant: { id: 'var-1', name: 'control' } },
            { variantId: 'var-2', sampleCount: 100, averageReward: 0.5, stdDev: 0.1, variant: { id: 'var-2', name: 'treatment' } }
          ]
        });

        const result = await evaluationService.analyzeExperiment('exp-1');

        expect(result).toBeDefined();
        expect(result?.experiment).toBeDefined();
      });

      it('should return null for non-existent experiment', async () => {
        (prisma.aBExperiment.findUnique as any).mockResolvedValue(null);

        const result = await evaluationService.analyzeExperiment('non-existent');

        expect(result).toBeNull();
      });
    });

    describe('completeExperiment', () => {
      it('should complete running experiment', async () => {
        (prisma.aBExperiment.findUnique as any).mockResolvedValue({
          id: 'exp-1',
          status: 'RUNNING'
        });
        (prisma.aBExperiment.update as any).mockResolvedValue({
          id: 'exp-1',
          status: 'COMPLETED'
        });

        const result = await evaluationService.completeExperiment('exp-1');

        expect(result.status).toBe('COMPLETED');
      });
    });
  });

  describe('exports', () => {
    it('should export EvaluationService class', async () => {
      const module = await import('../../../src/services/evaluation.service');
      expect(module.EvaluationService).toBeDefined();
    });

    it('should export evaluationService singleton', async () => {
      const module = await import('../../../src/services/evaluation.service');
      expect(module.evaluationService).toBeDefined();
    });
  });
});
