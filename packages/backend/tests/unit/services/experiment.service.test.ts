/**
 * Experiment Service Unit Tests
 * A/B 测试实验管理服务单元测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock dependencies
const mockABExperimentFindMany = vi.fn();
const mockABExperimentFindUnique = vi.fn();
const mockABExperimentCreate = vi.fn();
const mockABExperimentUpdate = vi.fn();
const mockABExperimentDelete = vi.fn();
const mockABExperimentCount = vi.fn();
const mockABExperimentMetricsUpsert = vi.fn();
const mockABExperimentMetricsFindUnique = vi.fn();
const mockABExperimentMetricsUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock('../../../src/config/database', () => ({
  default: {
    aBExperiment: {
      findMany: (...args: any[]) => mockABExperimentFindMany(...args),
      findUnique: (...args: any[]) => mockABExperimentFindUnique(...args),
      create: (...args: any[]) => mockABExperimentCreate(...args),
      update: (...args: any[]) => mockABExperimentUpdate(...args),
      delete: (...args: any[]) => mockABExperimentDelete(...args),
      count: (...args: any[]) => mockABExperimentCount(...args)
    },
    aBExperimentMetrics: {
      upsert: (...args: any[]) => mockABExperimentMetricsUpsert(...args),
      findUnique: (...args: any[]) => mockABExperimentMetricsFindUnique(...args),
      update: (...args: any[]) => mockABExperimentMetricsUpdate(...args)
    },
    $transaction: (operations: any) => mockTransaction(operations)
  }
}));

vi.mock('../../../src/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('ExperimentService', () => {
  let experimentService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Setup transaction mock
    mockTransaction.mockImplementation(async (operations) => {
      if (Array.isArray(operations)) {
        return Promise.all(operations);
      }
      return operations;
    });

    const module = await import('../../../src/services/experiment.service');
    experimentService = module.experimentService;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('createExperiment', () => {
    const validInput = {
      name: 'Test Experiment',
      description: 'Test description',
      trafficAllocation: 'WEIGHTED' as const,
      minSampleSize: 1000,
      significanceLevel: 0.05,
      minimumDetectableEffect: 0.1,
      autoDecision: false,
      variants: [
        {
          id: 'control',
          name: 'Control',
          weight: 0.5,
          isControl: true,
          parameters: { param1: 'value1' }
        },
        {
          id: 'treatment',
          name: 'Treatment',
          weight: 0.5,
          isControl: false,
          parameters: { param1: 'value2' }
        }
      ]
    };

    it('should create experiment with valid input', async () => {
      mockABExperimentCreate.mockResolvedValue({
        id: 'exp-1',
        name: 'Test Experiment',
        variants: validInput.variants
      });

      const result = await experimentService.createExperiment(validInput);

      expect(result.id).toBe('exp-1');
      expect(result.name).toBe('Test Experiment');
      expect(mockABExperimentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Test Experiment',
            description: 'Test description',
            minSampleSize: 1000,
            significanceLevel: 0.05
          })
        })
      );
    });

    it('should reject experiment with less than 2 variants', async () => {
      const invalidInput = {
        ...validInput,
        variants: [validInput.variants[0]]
      };

      await expect(experimentService.createExperiment(invalidInput))
        .rejects.toThrow('实验至少需要两个变体');
    });

    it('should reject experiment when variant weights do not sum to 1', async () => {
      const invalidInput = {
        ...validInput,
        variants: [
          { ...validInput.variants[0], weight: 0.3 },
          { ...validInput.variants[1], weight: 0.3 }
        ]
      };

      await expect(experimentService.createExperiment(invalidInput))
        .rejects.toThrow('变体权重总和必须为 1');
    });

    it('should reject experiment without exactly one control group', async () => {
      const invalidInput = {
        ...validInput,
        variants: [
          { ...validInput.variants[0], isControl: false },
          { ...validInput.variants[1], isControl: false }
        ]
      };

      await expect(experimentService.createExperiment(invalidInput))
        .rejects.toThrow('必须有且仅有一个控制组');
    });

    it('should reject experiment with multiple control groups', async () => {
      const invalidInput = {
        ...validInput,
        variants: [
          { ...validInput.variants[0], isControl: true },
          { ...validInput.variants[1], isControl: true }
        ]
      };

      await expect(experimentService.createExperiment(invalidInput))
        .rejects.toThrow('必须有且仅有一个控制组');
    });
  });

  describe('listExperiments', () => {
    it('should return paginated experiment list', async () => {
      const mockExperiments = [
        {
          id: 'exp-1',
          name: 'Experiment 1',
          description: 'Test',
          status: 'RUNNING',
          trafficAllocation: 'WEIGHTED',
          minSampleSize: 1000,
          significanceLevel: 0.05,
          startedAt: new Date(),
          endedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          variants: [{ id: 'v1' }, { id: 'v2' }],
          metrics: [{ sampleCount: 100 }, { sampleCount: 100 }]
        }
      ];

      mockABExperimentFindMany.mockResolvedValue(mockExperiments);
      mockABExperimentCount.mockResolvedValue(1);

      const result = await experimentService.listExperiments({ page: 1, pageSize: 20 });

      expect(result.experiments).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.experiments[0].variantCount).toBe(2);
      expect(result.experiments[0].totalSamples).toBe(200);
    });

    it('should filter experiments by status', async () => {
      mockABExperimentFindMany.mockResolvedValue([]);
      mockABExperimentCount.mockResolvedValue(0);

      await experimentService.listExperiments({ status: 'RUNNING' });

      expect(mockABExperimentFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'RUNNING' }
        })
      );
    });

    it('should use default pagination values', async () => {
      mockABExperimentFindMany.mockResolvedValue([]);
      mockABExperimentCount.mockResolvedValue(0);

      await experimentService.listExperiments();

      expect(mockABExperimentFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20
        })
      );
    });
  });

  describe('getExperiment', () => {
    it('should return experiment by id', async () => {
      const mockExperiment = {
        id: 'exp-1',
        name: 'Test Experiment',
        variants: [],
        metrics: []
      };

      mockABExperimentFindUnique.mockResolvedValue(mockExperiment);

      const result = await experimentService.getExperiment('exp-1');

      expect(result.id).toBe('exp-1');
      expect(mockABExperimentFindUnique).toHaveBeenCalledWith({
        where: { id: 'exp-1' },
        include: { variants: true, metrics: true }
      });
    });

    it('should throw error for non-existent experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue(null);

      await expect(experimentService.getExperiment('non-existent'))
        .rejects.toThrow('实验不存在');
    });
  });

  describe('getExperimentStatus', () => {
    it('should return default status when no data available', async () => {
      mockABExperimentFindUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'RUNNING',
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.1,
        minSampleSize: 1000,
        variants: [
          { id: 'control', isControl: true },
          { id: 'treatment', isControl: false }
        ],
        metrics: []
      });

      const result = await experimentService.getExperimentStatus('exp-1');

      expect(result.status).toBe('running');
      expect(result.pValue).toBe(1);
      expect(result.isSignificant).toBe(false);
      expect(result.recommendation).toBe('数据不足，无法进行分析');
    });

    it('should calculate statistics when data is available', async () => {
      mockABExperimentFindUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'RUNNING',
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.1,
        minSampleSize: 100,
        variants: [
          { id: 'control', isControl: true },
          { id: 'treatment', isControl: false }
        ],
        metrics: [
          {
            variantId: 'control',
            sampleCount: 500,
            averageReward: 0.5,
            stdDev: 0.1
          },
          {
            variantId: 'treatment',
            sampleCount: 500,
            averageReward: 0.6,
            stdDev: 0.1
          }
        ]
      });

      const result = await experimentService.getExperimentStatus('exp-1');

      expect(result.status).toBe('running');
      expect(result.effectSize).toBeCloseTo(0.2, 1);
      expect(result.sampleSizes).toHaveLength(2);
      expect(result.isActive).toBe(true);
    });

    it('should throw error for non-existent experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue(null);

      await expect(experimentService.getExperimentStatus('non-existent'))
        .rejects.toThrow('实验不存在');
    });
  });

  describe('startExperiment', () => {
    it('should start draft experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'DRAFT',
        variants: [{ id: 'v1' }, { id: 'v2' }]
      });
      mockTransaction.mockResolvedValue([{}, {}, {}]);

      await experimentService.startExperiment('exp-1');

      expect(mockTransaction).toHaveBeenCalled();
    });

    it('should throw error for non-existent experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue(null);

      await expect(experimentService.startExperiment('non-existent'))
        .rejects.toThrow('实验不存在');
    });

    it('should throw error for non-draft experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'RUNNING',
        variants: []
      });

      await expect(experimentService.startExperiment('exp-1'))
        .rejects.toThrow('只能启动草稿状态的实验');
    });

    it('should throw error for experiment with less than 2 variants', async () => {
      mockABExperimentFindUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'DRAFT',
        variants: [{ id: 'v1' }]
      });

      await expect(experimentService.startExperiment('exp-1'))
        .rejects.toThrow('实验至少需要两个变体');
    });
  });

  describe('stopExperiment', () => {
    it('should stop running experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'RUNNING'
      });
      mockABExperimentUpdate.mockResolvedValue({});

      await experimentService.stopExperiment('exp-1');

      expect(mockABExperimentUpdate).toHaveBeenCalledWith({
        where: { id: 'exp-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          endedAt: expect.any(Date)
        })
      });
    });

    it('should throw error for non-existent experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue(null);

      await expect(experimentService.stopExperiment('non-existent'))
        .rejects.toThrow('实验不存在');
    });

    it('should throw error for non-running experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'DRAFT'
      });

      await expect(experimentService.stopExperiment('exp-1'))
        .rejects.toThrow('只能停止运行中的实验');
    });
  });

  describe('deleteExperiment', () => {
    it('should delete non-running experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'DRAFT'
      });
      mockABExperimentDelete.mockResolvedValue({});

      await experimentService.deleteExperiment('exp-1');

      expect(mockABExperimentDelete).toHaveBeenCalledWith({
        where: { id: 'exp-1' }
      });
    });

    it('should throw error for non-existent experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue(null);

      await expect(experimentService.deleteExperiment('non-existent'))
        .rejects.toThrow('实验不存在');
    });

    it('should throw error for running experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'RUNNING'
      });

      await expect(experimentService.deleteExperiment('exp-1'))
        .rejects.toThrow('无法删除运行中的实验');
    });
  });

  describe('recordMetric', () => {
    it('should update metrics using Welford algorithm', async () => {
      mockABExperimentMetricsFindUnique.mockResolvedValue({
        experimentId: 'exp-1',
        variantId: 'v1',
        sampleCount: 10,
        averageReward: 0.5,
        m2: 0.25,
        stdDev: 0.1
      });
      mockABExperimentMetricsUpdate.mockResolvedValue({});

      await experimentService.recordMetric('exp-1', 'v1', 0.6);

      expect(mockABExperimentMetricsUpdate).toHaveBeenCalledWith({
        where: {
          experimentId_variantId: {
            experimentId: 'exp-1',
            variantId: 'v1'
          }
        },
        data: expect.objectContaining({
          sampleCount: 11,
          averageReward: expect.any(Number),
          m2: expect.any(Number),
          stdDev: expect.any(Number),
          primaryMetric: expect.any(Number)
        })
      });
    });

    it('should throw error for non-existent metrics record', async () => {
      mockABExperimentMetricsFindUnique.mockResolvedValue(null);

      await expect(experimentService.recordMetric('exp-1', 'v1', 0.5))
        .rejects.toThrow('指标记录不存在');
    });
  });
});
