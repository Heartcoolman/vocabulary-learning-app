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

  // A/B Testing 功能已移除，相关测试已删除
  // 原因：EvaluationService 已精简为仅支持因果推断功能;

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
