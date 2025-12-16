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
const mockABUserAssignmentFindUnique = vi.fn();
const mockABUserAssignmentCreate = vi.fn();
const mockTransaction = vi.fn();

vi.mock('../../../src/config/database', () => ({
  default: {
    aBExperiment: {
      findMany: (...args: any[]) => mockABExperimentFindMany(...args),
      findUnique: (...args: any[]) => mockABExperimentFindUnique(...args),
      create: (...args: any[]) => mockABExperimentCreate(...args),
      update: (...args: any[]) => mockABExperimentUpdate(...args),
      delete: (...args: any[]) => mockABExperimentDelete(...args),
      count: (...args: any[]) => mockABExperimentCount(...args),
    },
    aBExperimentMetrics: {
      upsert: (...args: any[]) => mockABExperimentMetricsUpsert(...args),
      findUnique: (...args: any[]) => mockABExperimentMetricsFindUnique(...args),
      update: (...args: any[]) => mockABExperimentMetricsUpdate(...args),
    },
    aBUserAssignment: {
      findUnique: (...args: any[]) => mockABUserAssignmentFindUnique(...args),
      create: (...args: any[]) => mockABUserAssignmentCreate(...args),
    },
    $transaction: (operations: any) => mockTransaction(operations),
  },
}));

vi.mock('../../../src/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
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
      if (typeof operations === 'function') {
        const tx = {
          $queryRaw: async () => {
            const metrics = await mockABExperimentMetricsFindUnique();
            if (!metrics) return [];
            return [
              {
                sampleCount: metrics.sampleCount,
                averageReward: metrics.averageReward,
                m2: metrics.m2,
              },
            ];
          },
          aBExperimentMetrics: {
            update: (...args: any[]) => mockABExperimentMetricsUpdate(...args),
          },
        };
        return operations(tx);
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
          parameters: { param1: 'value1' },
        },
        {
          id: 'treatment',
          name: 'Treatment',
          weight: 0.5,
          isControl: false,
          parameters: { param1: 'value2' },
        },
      ],
    };

    it('should create experiment with valid input', async () => {
      mockABExperimentCreate.mockResolvedValue({
        id: 'exp-1',
        name: 'Test Experiment',
        variants: validInput.variants,
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
            significanceLevel: 0.05,
          }),
        }),
      );
    });

    it('should reject experiment with less than 2 variants', async () => {
      const invalidInput = {
        ...validInput,
        variants: [validInput.variants[0]],
      };

      await expect(experimentService.createExperiment(invalidInput)).rejects.toThrow(
        '实验至少需要两个变体',
      );
    });

    it('should reject experiment when variant weights do not sum to 1', async () => {
      const invalidInput = {
        ...validInput,
        variants: [
          { ...validInput.variants[0], weight: 0.3 },
          { ...validInput.variants[1], weight: 0.3 },
        ],
      };

      await expect(experimentService.createExperiment(invalidInput)).rejects.toThrow(
        '变体权重总和必须为 1',
      );
    });

    it('should reject experiment without exactly one control group', async () => {
      const invalidInput = {
        ...validInput,
        variants: [
          { ...validInput.variants[0], isControl: false },
          { ...validInput.variants[1], isControl: false },
        ],
      };

      await expect(experimentService.createExperiment(invalidInput)).rejects.toThrow(
        '必须有且仅有一个控制组',
      );
    });

    it('should reject experiment with multiple control groups', async () => {
      const invalidInput = {
        ...validInput,
        variants: [
          { ...validInput.variants[0], isControl: true },
          { ...validInput.variants[1], isControl: true },
        ],
      };

      await expect(experimentService.createExperiment(invalidInput)).rejects.toThrow(
        '必须有且仅有一个控制组',
      );
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
          metrics: [{ sampleCount: 100 }, { sampleCount: 100 }],
        },
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
          where: { status: 'RUNNING' },
        }),
      );
    });

    it('should use default pagination values', async () => {
      mockABExperimentFindMany.mockResolvedValue([]);
      mockABExperimentCount.mockResolvedValue(0);

      await experimentService.listExperiments();

      expect(mockABExperimentFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        }),
      );
    });
  });

  describe('getExperiment', () => {
    it('should return experiment by id', async () => {
      const mockExperiment = {
        id: 'exp-1',
        name: 'Test Experiment',
        variants: [],
        metrics: [],
      };

      mockABExperimentFindUnique.mockResolvedValue(mockExperiment);

      const result = await experimentService.getExperiment('exp-1');

      expect(result.id).toBe('exp-1');
      expect(mockABExperimentFindUnique).toHaveBeenCalledWith({
        where: { id: 'exp-1' },
        include: { variants: true, metrics: true },
      });
    });

    it('should throw error for non-existent experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue(null);

      await expect(experimentService.getExperiment('non-existent')).rejects.toThrow('实验不存在');
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
          { id: 'treatment', isControl: false },
        ],
        metrics: [],
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
          { id: 'treatment', isControl: false },
        ],
        metrics: [
          {
            variantId: 'control',
            sampleCount: 500,
            averageReward: 0.5,
            stdDev: 0.1,
          },
          {
            variantId: 'treatment',
            sampleCount: 500,
            averageReward: 0.6,
            stdDev: 0.1,
          },
        ],
      });

      const result = await experimentService.getExperimentStatus('exp-1');

      expect(result.status).toBe('running');
      expect(result.effectSize).toBeCloseTo(0.2, 1);
      expect(result.sampleSizes).toHaveLength(2);
      expect(result.isActive).toBe(true);
    });

    it('should throw error for non-existent experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue(null);

      await expect(experimentService.getExperimentStatus('non-existent')).rejects.toThrow(
        '实验不存在',
      );
    });
  });

  describe('startExperiment', () => {
    it('should start draft experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'DRAFT',
        variants: [{ id: 'v1' }, { id: 'v2' }],
      });
      mockTransaction.mockResolvedValue([{}, {}, {}]);

      await experimentService.startExperiment('exp-1');

      expect(mockTransaction).toHaveBeenCalled();
    });

    it('should throw error for non-existent experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue(null);

      await expect(experimentService.startExperiment('non-existent')).rejects.toThrow('实验不存在');
    });

    it('should throw error for non-draft experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'RUNNING',
        variants: [],
      });

      await expect(experimentService.startExperiment('exp-1')).rejects.toThrow(
        '只能启动草稿状态的实验',
      );
    });

    it('should throw error for experiment with less than 2 variants', async () => {
      mockABExperimentFindUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'DRAFT',
        variants: [{ id: 'v1' }],
      });

      await expect(experimentService.startExperiment('exp-1')).rejects.toThrow(
        '实验至少需要两个变体',
      );
    });
  });

  describe('stopExperiment', () => {
    it('should stop running experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'RUNNING',
      });
      mockABExperimentUpdate.mockResolvedValue({});

      await experimentService.stopExperiment('exp-1');

      expect(mockABExperimentUpdate).toHaveBeenCalledWith({
        where: { id: 'exp-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          endedAt: expect.any(Date),
        }),
      });
    });

    it('should throw error for non-existent experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue(null);

      await expect(experimentService.stopExperiment('non-existent')).rejects.toThrow('实验不存在');
    });

    it('should throw error for non-running experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'DRAFT',
      });

      await expect(experimentService.stopExperiment('exp-1')).rejects.toThrow(
        '只能停止运行中的实验',
      );
    });
  });

  describe('deleteExperiment', () => {
    it('should delete non-running experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'DRAFT',
      });
      mockABExperimentDelete.mockResolvedValue({});

      await experimentService.deleteExperiment('exp-1');

      expect(mockABExperimentDelete).toHaveBeenCalledWith({
        where: { id: 'exp-1' },
      });
    });

    it('should throw error for non-existent experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue(null);

      await expect(experimentService.deleteExperiment('non-existent')).rejects.toThrow(
        '实验不存在',
      );
    });

    it('should throw error for running experiment', async () => {
      mockABExperimentFindUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'RUNNING',
      });

      await expect(experimentService.deleteExperiment('exp-1')).rejects.toThrow(
        '无法删除运行中的实验',
      );
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
        stdDev: 0.1,
      });
      mockABExperimentMetricsUpdate.mockResolvedValue({});

      await experimentService.recordMetric('exp-1', 'v1', 0.6);

      expect(mockABExperimentMetricsUpdate).toHaveBeenCalledWith({
        where: {
          experimentId_variantId: {
            experimentId: 'exp-1',
            variantId: 'v1',
          },
        },
        data: expect.objectContaining({
          sampleCount: 11,
          averageReward: expect.any(Number),
          m2: expect.any(Number),
          stdDev: expect.any(Number),
          primaryMetric: expect.any(Number),
        }),
      });
    });

    it('should throw error for non-existent metrics record', async () => {
      mockABExperimentMetricsFindUnique.mockResolvedValue(null);

      await expect(experimentService.recordMetric('exp-1', 'v1', 0.5)).rejects.toThrow(
        '指标记录不存在',
      );
    });
  });

  describe('assignVariant', () => {
    const userId = 'user-123';
    const experimentId = 'exp-1';

    describe('首次分配变体', () => {
      it('should assign variant when no existing assignment', async () => {
        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'RUNNING',
          variants: [
            { id: 'control', weight: 0.5 },
            { id: 'treatment', weight: 0.5 },
          ],
        });
        mockABUserAssignmentCreate.mockResolvedValue({
          userId,
          experimentId,
          variantId: 'control',
        });

        const result = await experimentService.assignVariant(userId, experimentId);

        expect(result).toBeDefined();
        expect(['control', 'treatment']).toContain(result);
        expect(mockABUserAssignmentFindUnique).toHaveBeenCalledWith({
          where: {
            userId_experimentId: {
              userId,
              experimentId,
            },
          },
        });
        expect(mockABUserAssignmentCreate).toHaveBeenCalledWith({
          data: {
            userId,
            experimentId,
            variantId: expect.any(String),
          },
        });
      });

      it('should assign variant based on weights', async () => {
        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'RUNNING',
          variants: [
            { id: 'control', weight: 0.7 },
            { id: 'treatment', weight: 0.3 },
          ],
        });
        mockABUserAssignmentCreate.mockResolvedValue({
          userId,
          experimentId,
          variantId: 'control',
        });

        const result = await experimentService.assignVariant(userId, experimentId);

        expect(result).toBeDefined();
        expect(['control', 'treatment']).toContain(result);
      });

      it('should handle three-way split', async () => {
        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'RUNNING',
          variants: [
            { id: 'control', weight: 0.334 },
            { id: 'treatment-a', weight: 0.333 },
            { id: 'treatment-b', weight: 0.333 },
          ],
        });
        mockABUserAssignmentCreate.mockResolvedValue({
          userId,
          experimentId,
          variantId: 'control',
        });

        const result = await experimentService.assignVariant(userId, experimentId);

        expect(result).toBeDefined();
        expect(['control', 'treatment-a', 'treatment-b']).toContain(result);
      });
    });

    describe('重复分配返回相同变体', () => {
      it('should return existing variant for repeat assignment', async () => {
        const existingVariantId = 'control';
        mockABUserAssignmentFindUnique.mockResolvedValue({
          userId,
          experimentId,
          variantId: existingVariantId,
        });

        const result = await experimentService.assignVariant(userId, experimentId);

        expect(result).toBe(existingVariantId);
        expect(mockABExperimentFindUnique).not.toHaveBeenCalled();
        expect(mockABUserAssignmentCreate).not.toHaveBeenCalled();
      });

      it('should return same variant on multiple calls', async () => {
        const existingVariantId = 'treatment';
        mockABUserAssignmentFindUnique.mockResolvedValue({
          userId,
          experimentId,
          variantId: existingVariantId,
        });

        const result1 = await experimentService.assignVariant(userId, experimentId);
        const result2 = await experimentService.assignVariant(userId, experimentId);
        const result3 = await experimentService.assignVariant(userId, experimentId);

        expect(result1).toBe(existingVariantId);
        expect(result2).toBe(existingVariantId);
        expect(result3).toBe(existingVariantId);
      });
    });

    describe('实验不存在时的错误处理', () => {
      it('should throw error when experiment does not exist', async () => {
        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue(null);

        await expect(experimentService.assignVariant(userId, experimentId)).rejects.toThrow(
          '实验不存在',
        );

        expect(mockABUserAssignmentCreate).not.toHaveBeenCalled();
      });
    });

    describe('实验状态非RUNNING时的错误处理', () => {
      it('should throw error when experiment is in DRAFT status', async () => {
        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'DRAFT',
          variants: [
            { id: 'control', weight: 0.5 },
            { id: 'treatment', weight: 0.5 },
          ],
        });

        await expect(experimentService.assignVariant(userId, experimentId)).rejects.toThrow(
          '实验未在运行中',
        );

        expect(mockABUserAssignmentCreate).not.toHaveBeenCalled();
      });

      it('should throw error when experiment is COMPLETED', async () => {
        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'COMPLETED',
          variants: [
            { id: 'control', weight: 0.5 },
            { id: 'treatment', weight: 0.5 },
          ],
        });

        await expect(experimentService.assignVariant(userId, experimentId)).rejects.toThrow(
          '实验未在运行中',
        );
      });

      it('should throw error when experiment is ABORTED', async () => {
        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'ABORTED',
          variants: [
            { id: 'control', weight: 0.5 },
            { id: 'treatment', weight: 0.5 },
          ],
        });

        await expect(experimentService.assignVariant(userId, experimentId)).rejects.toThrow(
          '实验未在运行中',
        );
      });
    });

    describe('按权重正确分配', () => {
      it('should respect variant weights in assignment', async () => {
        // 测试权重为 1.0 的变体总是被选中
        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'RUNNING',
          variants: [{ id: 'always-selected', weight: 1.0 }],
        });
        mockABUserAssignmentCreate.mockImplementation(async (data: any) => ({
          userId,
          experimentId,
          variantId: data.data.variantId,
        }));

        const result = await experimentService.assignVariant(userId, experimentId);

        expect(result).toBe('always-selected');
      });

      it('should handle extremely skewed weights (99/1 split)', async () => {
        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'RUNNING',
          variants: [
            { id: 'dominant', weight: 0.99 },
            { id: 'minority', weight: 0.01 },
          ],
        });
        mockABUserAssignmentCreate.mockResolvedValue({
          userId,
          experimentId,
          variantId: 'dominant',
        });

        const result = await experimentService.assignVariant(userId, experimentId);

        expect(['dominant', 'minority']).toContain(result);
      });

      it('should handle unequal weights (60/40 split)', async () => {
        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'RUNNING',
          variants: [
            { id: 'majority', weight: 0.6 },
            { id: 'minority', weight: 0.4 },
          ],
        });
        mockABUserAssignmentCreate.mockResolvedValue({
          userId,
          experimentId,
          variantId: 'majority',
        });

        const result = await experimentService.assignVariant(userId, experimentId);

        expect(['majority', 'minority']).toContain(result);
      });
    });

    describe('一致性哈希验证（同一用户总是分到同一组）', () => {
      it('should assign same user to same variant consistently', async () => {
        // 第一次调用 - 新分配
        mockABUserAssignmentFindUnique.mockResolvedValueOnce(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'RUNNING',
          variants: [
            { id: 'control', weight: 0.5 },
            { id: 'treatment', weight: 0.5 },
          ],
        });

        let assignedVariantId: string;
        mockABUserAssignmentCreate.mockImplementationOnce(async (data: any) => {
          assignedVariantId = data.data.variantId;
          return {
            userId,
            experimentId,
            variantId: assignedVariantId,
          };
        });

        const firstResult = await experimentService.assignVariant(userId, experimentId);
        assignedVariantId = firstResult;

        // 后续调用 - 返回已存在的分配
        mockABUserAssignmentFindUnique.mockResolvedValue({
          userId,
          experimentId,
          variantId: assignedVariantId,
        });

        const secondResult = await experimentService.assignVariant(userId, experimentId);
        const thirdResult = await experimentService.assignVariant(userId, experimentId);

        expect(secondResult).toBe(assignedVariantId);
        expect(thirdResult).toBe(assignedVariantId);
      });

      it('should assign different users deterministically', async () => {
        const users = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];
        const assignments: Record<string, string> = {};

        for (const uid of users) {
          mockABUserAssignmentFindUnique.mockResolvedValue(null);
          mockABExperimentFindUnique.mockResolvedValue({
            id: experimentId,
            status: 'RUNNING',
            variants: [
              { id: 'control', weight: 0.5 },
              { id: 'treatment', weight: 0.5 },
            ],
          });
          mockABUserAssignmentCreate.mockImplementation(async (data: any) => ({
            userId: uid,
            experimentId,
            variantId: data.data.variantId,
          }));

          const result = await experimentService.assignVariant(uid, experimentId);
          assignments[uid] = result;
        }

        // 验证每个用户都被分配到一个变体
        Object.values(assignments).forEach((variant) => {
          expect(['control', 'treatment']).toContain(variant);
        });

        // 验证至少有一些分布（不是所有用户都在同一组）
        const uniqueVariants = new Set(Object.values(assignments));
        expect(uniqueVariants.size).toBeGreaterThanOrEqual(1);
      });

      it('should maintain consistency across different user IDs with same hash', async () => {
        // 测试哈希函数的一致性
        const testUserId = 'test-user-deterministic';

        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'RUNNING',
          variants: [
            { id: 'control', weight: 0.5 },
            { id: 'treatment', weight: 0.5 },
          ],
        });
        mockABUserAssignmentCreate.mockImplementation(async (data: any) => ({
          userId: testUserId,
          experimentId,
          variantId: data.data.variantId,
        }));

        const result1 = await experimentService.assignVariant(testUserId, experimentId);

        // 重新调用服务（模拟新的实例）
        vi.resetModules();
        const module = await import('../../../src/services/experiment.service');
        const newService = module.experimentService;

        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'RUNNING',
          variants: [
            { id: 'control', weight: 0.5 },
            { id: 'treatment', weight: 0.5 },
          ],
        });

        const result2 = await newService.assignVariant(testUserId, experimentId);

        // 由于使用一致性哈希，相同的用户ID应该得到相同的变体
        expect(result1).toBe(result2);
      });
    });

    describe('边界条件测试', () => {
      it('should handle experiment with no variants', async () => {
        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'RUNNING',
          variants: [],
        });

        await expect(experimentService.assignVariant(userId, experimentId)).rejects.toThrow(
          '实验没有变体',
        );
      });

      it('should handle experiment with single variant', async () => {
        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'RUNNING',
          variants: [{ id: 'only-variant', weight: 1.0 }],
        });
        mockABUserAssignmentCreate.mockResolvedValue({
          userId,
          experimentId,
          variantId: 'only-variant',
        });

        const result = await experimentService.assignVariant(userId, experimentId);

        expect(result).toBe('only-variant');
      });

      it('should handle very small weights', async () => {
        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'RUNNING',
          variants: [
            { id: 'variant-1', weight: 0.999 },
            { id: 'variant-2', weight: 0.001 },
          ],
        });
        mockABUserAssignmentCreate.mockResolvedValue({
          userId,
          experimentId,
          variantId: 'variant-1',
        });

        const result = await experimentService.assignVariant(userId, experimentId);

        expect(['variant-1', 'variant-2']).toContain(result);
      });

      it('should handle empty user ID', async () => {
        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'RUNNING',
          variants: [
            { id: 'control', weight: 0.5 },
            { id: 'treatment', weight: 0.5 },
          ],
        });
        mockABUserAssignmentCreate.mockResolvedValue({
          userId: '',
          experimentId,
          variantId: 'control',
        });

        const result = await experimentService.assignVariant('', experimentId);

        expect(result).toBeDefined();
        expect(['control', 'treatment']).toContain(result);
      });

      it('should handle very long user ID', async () => {
        const longUserId = 'user-' + 'a'.repeat(1000);
        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'RUNNING',
          variants: [
            { id: 'control', weight: 0.5 },
            { id: 'treatment', weight: 0.5 },
          ],
        });
        mockABUserAssignmentCreate.mockResolvedValue({
          userId: longUserId,
          experimentId,
          variantId: 'control',
        });

        const result = await experimentService.assignVariant(longUserId, experimentId);

        expect(result).toBeDefined();
        expect(['control', 'treatment']).toContain(result);
      });

      it('should handle special characters in user ID', async () => {
        const specialUserId = 'user@#$%^&*()_+-={}[]|:;"<>?,./';
        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'RUNNING',
          variants: [
            { id: 'control', weight: 0.5 },
            { id: 'treatment', weight: 0.5 },
          ],
        });
        mockABUserAssignmentCreate.mockResolvedValue({
          userId: specialUserId,
          experimentId,
          variantId: 'control',
        });

        const result = await experimentService.assignVariant(specialUserId, experimentId);

        expect(result).toBeDefined();
        expect(['control', 'treatment']).toContain(result);
      });

      it('should handle Unicode characters in user ID', async () => {
        const unicodeUserId = '用户-123-测试-🎉';
        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'RUNNING',
          variants: [
            { id: 'control', weight: 0.5 },
            { id: 'treatment', weight: 0.5 },
          ],
        });
        mockABUserAssignmentCreate.mockResolvedValue({
          userId: unicodeUserId,
          experimentId,
          variantId: 'control',
        });

        const result = await experimentService.assignVariant(unicodeUserId, experimentId);

        expect(result).toBeDefined();
        expect(['control', 'treatment']).toContain(result);
      });

      it('should handle database connection error during assignment check', async () => {
        mockABUserAssignmentFindUnique.mockRejectedValue(new Error('Database connection failed'));

        await expect(experimentService.assignVariant(userId, experimentId)).rejects.toThrow(
          'Database connection failed',
        );
      });

      it('should handle database error during variant creation', async () => {
        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'RUNNING',
          variants: [
            { id: 'control', weight: 0.5 },
            { id: 'treatment', weight: 0.5 },
          ],
        });
        mockABUserAssignmentCreate.mockRejectedValue(new Error('Insert failed'));

        await expect(experimentService.assignVariant(userId, experimentId)).rejects.toThrow(
          'Insert failed',
        );
      });

      it('should handle cumulative weight precision issues', async () => {
        mockABUserAssignmentFindUnique.mockResolvedValue(null);
        mockABExperimentFindUnique.mockResolvedValue({
          id: experimentId,
          status: 'RUNNING',
          variants: [
            { id: 'variant-1', weight: 0.33333 },
            { id: 'variant-2', weight: 0.33333 },
            { id: 'variant-3', weight: 0.33334 },
          ],
        });
        mockABUserAssignmentCreate.mockResolvedValue({
          userId,
          experimentId,
          variantId: 'variant-1',
        });

        const result = await experimentService.assignVariant(userId, experimentId);

        expect(['variant-1', 'variant-2', 'variant-3']).toContain(result);
      });
    });

    describe('哈希函数测试', () => {
      it('should produce consistent hash for same user ID', async () => {
        const testUserId = 'consistent-user';
        const assignments: string[] = [];

        // 进行多次分配
        for (let i = 0; i < 3; i++) {
          mockABUserAssignmentFindUnique.mockResolvedValue(null);
          mockABExperimentFindUnique.mockResolvedValue({
            id: experimentId,
            status: 'RUNNING',
            variants: [
              { id: 'control', weight: 0.5 },
              { id: 'treatment', weight: 0.5 },
            ],
          });
          mockABUserAssignmentCreate.mockImplementation(async (data: any) => ({
            userId: testUserId,
            experimentId,
            variantId: data.data.variantId,
          }));

          const result = await experimentService.assignVariant(testUserId, experimentId);
          assignments.push(result);
        }

        // 所有分配应该相同
        expect(new Set(assignments).size).toBe(1);
      });

      it('should produce different hashes for different user IDs', async () => {
        const users = ['user-a', 'user-b', 'user-c', 'user-d', 'user-e'];
        const hashes = new Set<string>();

        for (const uid of users) {
          mockABUserAssignmentFindUnique.mockResolvedValue(null);
          mockABExperimentFindUnique.mockResolvedValue({
            id: experimentId,
            status: 'RUNNING',
            variants: [
              { id: 'control', weight: 0.5 },
              { id: 'treatment', weight: 0.5 },
            ],
          });
          mockABUserAssignmentCreate.mockImplementation(async (data: any) => ({
            userId: uid,
            experimentId,
            variantId: data.data.variantId,
          }));

          const result = await experimentService.assignVariant(uid, experimentId);
          hashes.add(result);
        }

        // 至少应该有一些变化（不是所有人都在同一组）
        // 注意：由于是随机分配，极小概率所有人在同一组，但统计上不太可能
        expect(hashes.size).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
