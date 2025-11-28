/**
 * Evaluation Service Tests
 * 评估服务单元测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// 定义枚举常量避免 vi.resetModules 问题
const ABExperimentStatus = {
  DRAFT: 'DRAFT',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  ABORTED: 'ABORTED'
} as const;

const ABTrafficAllocation = {
  EVEN: 'EVEN',
  WEIGHTED: 'WEIGHTED',
  DYNAMIC: 'DYNAMIC'
} as const;

// Mock Prisma
const mockPrisma = {
  causalObservation: {
    create: vi.fn(),
    findMany: vi.fn(),
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
    findFirst: vi.fn()
  },
  aBUserAssignment: {
    findUnique: vi.fn(),
    create: vi.fn()
  },
  aBExperimentMetrics: {
    upsert: vi.fn(),
    findMany: vi.fn()
  }
};

let mockCausalEnabled = true;
let mockABTestEnabled = true;

vi.mock('../../../src/config/database', () => ({
  default: mockPrisma
}));

vi.mock('../../../src/amas/config/feature-flags', () => ({
  isCausalInferenceEnabled: () => mockCausalEnabled,
  isABTestEngineEnabled: () => mockABTestEnabled
}));

// Mock CausalInference
const mockCausalInstance = {
  addObservation: vi.fn(),
  estimate: vi.fn().mockReturnValue({
    ate: 0.15,
    ci: [0.05, 0.25],
    pValue: 0.02,
    method: 'doubly_robust'
  }),
  exportState: vi.fn().mockReturnValue({
    observations: [],
    config: {}
  })
};

// Mock ABTestEngine
const mockABTestEngineInstance = {
  assignVariant: vi.fn(),
  recordMetric: vi.fn(),
  analyzeExperiment: vi.fn()
};

vi.mock('../../../src/amas', () => {
  return {
    CausalInference: function() {
      return mockCausalInstance;
    },
    createABTestEngine: function() {
      return mockABTestEngineInstance;
    }
  };
});

describe('EvaluationService', () => {
  let EvaluationService: typeof import('../../../src/services/evaluation.service').EvaluationService;
  let service: InstanceType<typeof EvaluationService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCausalEnabled = true;
    mockABTestEnabled = true;

    // Reset mock implementations
    mockCausalInstance.estimate.mockReturnValue({
      ate: 0.15,
      ci: [0.05, 0.25],
      pValue: 0.02,
      method: 'doubly_robust'
    });

    vi.resetModules();
    const module = await import('../../../src/services/evaluation.service');
    EvaluationService = module.EvaluationService;
    service = new EvaluationService();
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ==================== 因果推断测试 ====================

  describe('recordCausalObservation', () => {
    it('应该成功记录因果观测数据', async () => {
      const observation = {
        userId: 'user-123',
        features: { accuracy: 0.8, speed: 0.6 },
        treatment: 1,
        outcome: 0.75
      };

      const mockCreated = {
        id: 'obs-123',
        ...observation,
        timestamp: BigInt(Date.now()),
        createdAt: new Date()
      };

      mockPrisma.causalObservation.create.mockResolvedValue(mockCreated);

      const result = await service.recordCausalObservation(observation);

      expect(result).toEqual(mockCreated);
      expect(mockPrisma.causalObservation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: observation.userId,
          features: observation.features,
          treatment: observation.treatment,
          outcome: observation.outcome
        })
      });
    });

    it('功能禁用时应该返回null', async () => {
      mockCausalEnabled = false;
      vi.resetModules();
      const module = await import('../../../src/services/evaluation.service');
      const disabledService = new module.EvaluationService();

      const result = await disabledService.recordCausalObservation({
        features: {},
        treatment: 0,
        outcome: 0
      });

      expect(result).toBeNull();
    });
  });

  describe('estimateStrategyEffect', () => {
    it('应该返回因果效应估计', async () => {
      mockPrisma.causalObservation.findMany.mockResolvedValue([
        { features: { a: 1 }, treatment: 0, outcome: 0.5 },
        { features: { a: 1 }, treatment: 1, outcome: 0.7 }
      ]);

      const result = await service.estimateStrategyEffect();

      expect(result).toHaveProperty('ate');
      expect(result).toHaveProperty('ci');
      expect(result).toHaveProperty('pValue');
    });

    it('功能禁用时应该返回null', async () => {
      mockCausalEnabled = false;
      vi.resetModules();
      const module = await import('../../../src/services/evaluation.service');
      const disabledService = new module.EvaluationService();

      const result = await disabledService.estimateStrategyEffect();

      expect(result).toBeNull();
    });
  });

  describe('compareStrategies', () => {
    it('应该返回策略对比结果', async () => {
      mockPrisma.causalObservation.findMany.mockResolvedValue([
        { features: { a: 1 }, treatment: 0, outcome: 0.5 },
        { features: { a: 1 }, treatment: 1, outcome: 0.7 }
      ]);

      const result = await service.compareStrategies();

      expect(result).toHaveProperty('estimate');
      expect(result).toHaveProperty('recommendation');
      expect(result).toHaveProperty('confidence');
    });
  });

  // ==================== A/B测试管理测试 ====================

  describe('createExperiment', () => {
    it('应该成功创建A/B测试实验', async () => {
      const config = {
        name: '新词比例测试',
        description: '测试不同新词比例的效果',
        variants: [
          { name: '控制组', weight: 0.5, isControl: true, parameters: { new_ratio: 0.3 } },
          { name: '实验组', weight: 0.5, isControl: false, parameters: { new_ratio: 0.5 } }
        ],
        minSampleSize: 100,
        significanceLevel: 0.05
      };

      const mockExperiment = {
        id: 'exp-123',
        name: config.name,
        description: config.description,
        status: ABExperimentStatus.DRAFT,
        trafficAllocation: ABTrafficAllocation.WEIGHTED,
        minSampleSize: 100,
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.05,
        autoDecision: false,
        startedAt: null,
        endedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        variants: []
      };

      mockPrisma.aBExperiment.create.mockResolvedValue(mockExperiment);
      mockPrisma.aBVariant.create.mockResolvedValue({});

      const result = await service.createExperiment(config);

      expect(result).toEqual(mockExperiment);
      expect(mockPrisma.aBExperiment.create).toHaveBeenCalled();
    });

    it('功能禁用时应该抛出错误', async () => {
      mockABTestEnabled = false;
      vi.resetModules();
      const module = await import('../../../src/services/evaluation.service');
      const disabledService = new module.EvaluationService();

      await expect(disabledService.createExperiment({
        name: 'test',
        variants: []
      })).rejects.toThrow('A/B测试引擎未启用');
    });

    it('变体数量少于2时应该抛出错误', async () => {
      await expect(service.createExperiment({
        name: 'test',
        variants: [{ name: 'only-one', weight: 1.0, isControl: true, parameters: {} }]
      })).rejects.toThrow('至少需要2个变体');
    });
  });

  describe('startExperiment', () => {
    it('应该成功启动实验', async () => {
      const experimentId = 'exp-123';
      const mockExperiment = {
        id: experimentId,
        status: ABExperimentStatus.DRAFT,
        variants: [
          { id: 'v1', name: 'control' },
          { id: 'v2', name: 'treatment' }
        ]
      };

      mockPrisma.aBExperiment.findUnique.mockResolvedValue(mockExperiment);
      mockPrisma.aBExperiment.update.mockResolvedValue({
        ...mockExperiment,
        status: ABExperimentStatus.RUNNING,
        startedAt: new Date()
      });

      const result = await service.startExperiment(experimentId);

      expect(result.status).toBe(ABExperimentStatus.RUNNING);
      expect(result.startedAt).toBeTruthy();
    });

    it('实验不存在时应该抛出错误', async () => {
      mockPrisma.aBExperiment.findUnique.mockResolvedValue(null);

      await expect(service.startExperiment('non-existent'))
        .rejects.toThrow('实验不存在');
    });

    it('已启动的实验不能重复启动', async () => {
      mockPrisma.aBExperiment.findUnique.mockResolvedValue({
        id: 'exp-123',
        status: ABExperimentStatus.RUNNING
      });

      await expect(service.startExperiment('exp-123'))
        .rejects.toThrow('实验已启动或已结束');
    });
  });

  describe('assignVariant', () => {
    const experimentId = 'exp-123';
    const userId = 'user-123';

    it('应该返回已存在的变体分配', async () => {
      const existingAssignment = {
        userId,
        experimentId,
        variantId: 'v1',
        variant: { id: 'v1', name: 'control', parameters: { new_ratio: 0.3 } }
      };

      mockPrisma.aBUserAssignment.findUnique.mockResolvedValue(existingAssignment);

      const result = await service.assignVariant(userId, experimentId);

      expect(result).toEqual(existingAssignment.variant);
      expect(mockPrisma.aBUserAssignment.create).not.toHaveBeenCalled();
    });

    it('应该为新用户分配变体', async () => {
      mockPrisma.aBUserAssignment.findUnique.mockResolvedValue(null);

      const mockExperiment = {
        id: experimentId,
        status: ABExperimentStatus.RUNNING,
        trafficAllocation: ABTrafficAllocation.WEIGHTED,
        variants: [
          { id: 'v1', name: 'control', weight: 0.5, isControl: true },
          { id: 'v2', name: 'treatment', weight: 0.5, isControl: false }
        ]
      };

      mockPrisma.aBExperiment.findUnique.mockResolvedValue(mockExperiment);
      mockPrisma.aBUserAssignment.create.mockResolvedValue({
        userId,
        experimentId,
        variantId: 'v1'
      });

      const result = await service.assignVariant(userId, experimentId);

      expect(result).toBeTruthy();
      expect(mockPrisma.aBUserAssignment.create).toHaveBeenCalled();
    });

    it('实验未运行时应该返回null', async () => {
      mockPrisma.aBUserAssignment.findUnique.mockResolvedValue(null);
      mockPrisma.aBExperiment.findUnique.mockResolvedValue({
        id: experimentId,
        status: ABExperimentStatus.DRAFT
      });

      const result = await service.assignVariant(userId, experimentId);

      expect(result).toBeNull();
    });
  });

  describe('recordExperimentMetrics', () => {
    it('应该使用Welford算法更新指标', async () => {
      const variantId = 'v1';
      const experimentId = 'exp-123';
      const reward = 0.8;

      mockPrisma.aBExperimentMetrics.upsert.mockResolvedValue({
        id: 'metrics-1',
        experimentId,
        variantId,
        sampleCount: 11
      });

      await service.recordExperimentMetrics(variantId, experimentId, reward);

      expect(mockPrisma.aBExperimentMetrics.upsert).toHaveBeenCalled();
    });
  });

  describe('analyzeExperiment', () => {
    it('应该返回实验分析结果', async () => {
      const experimentId = 'exp-123';

      mockPrisma.aBExperiment.findUnique.mockResolvedValue({
        id: experimentId,
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.05,
        minSampleSize: 100
      });

      mockPrisma.aBExperimentMetrics.findMany.mockResolvedValue([
        {
          variantId: 'v1',
          sampleCount: 150,
          averageReward: 0.6,
          stdDev: 0.1,
          variant: { id: 'v1', isControl: true }
        },
        {
          variantId: 'v2',
          sampleCount: 150,
          averageReward: 0.7,
          stdDev: 0.12,
          variant: { id: 'v2', isControl: false }
        }
      ]);

      const result = await service.analyzeExperiment(experimentId);

      expect(result).toHaveProperty('significanceTest');
      expect(result).toHaveProperty('recommendation');
      expect(result).toHaveProperty('metrics');
    });

    it('实验不存在时应该抛出错误', async () => {
      mockPrisma.aBExperiment.findUnique.mockResolvedValue(null);

      await expect(service.analyzeExperiment('non-existent'))
        .rejects.toThrow('实验不存在');
    });

    it('数据不足时应该返回继续收集建议', async () => {
      mockPrisma.aBExperiment.findUnique.mockResolvedValue({
        id: 'exp-123',
        minSampleSize: 100
      });

      mockPrisma.aBExperimentMetrics.findMany.mockResolvedValue([
        { variantId: 'v1', sampleCount: 10, variant: { isControl: true } },
        { variantId: 'v2', sampleCount: 10, variant: { isControl: false } }
      ]);

      const result = await service.analyzeExperiment('exp-123');

      expect(result.recommendation).toContain('继续收集数据');
    });
  });

  describe('completeExperiment', () => {
    it('应该成功结束实验', async () => {
      mockPrisma.aBExperiment.findUnique.mockResolvedValue({
        id: 'exp-123',
        status: ABExperimentStatus.RUNNING
      });

      mockPrisma.aBExperiment.update.mockResolvedValue({
        id: 'exp-123',
        status: ABExperimentStatus.COMPLETED,
        endedAt: new Date()
      });

      const result = await service.completeExperiment('exp-123');

      expect(result.status).toBe(ABExperimentStatus.COMPLETED);
    });
  });

  describe('listExperiments', () => {
    it('应该返回实验列表', async () => {
      const experiments = [
        { id: 'exp-1', name: 'Test 1', status: ABExperimentStatus.RUNNING },
        { id: 'exp-2', name: 'Test 2', status: ABExperimentStatus.DRAFT }
      ];

      mockPrisma.aBExperiment.findMany.mockResolvedValue(experiments);

      const result = await service.listExperiments();

      expect(result).toEqual(experiments);
    });

    it('应该按状态筛选实验', async () => {
      mockPrisma.aBExperiment.findMany.mockResolvedValue([]);

      await service.listExperiments({ status: ABExperimentStatus.RUNNING as any });

      expect(mockPrisma.aBExperiment.findMany).toHaveBeenCalledWith({
        where: { status: ABExperimentStatus.RUNNING },
        include: { variants: true },
        orderBy: { createdAt: 'desc' }
      });
    });
  });

  describe('getDiagnostics', () => {
    it('应该返回诊断信息', async () => {
      mockPrisma.causalObservation.count.mockResolvedValue(100);
      mockPrisma.aBExperiment.findMany.mockResolvedValue([
        { status: ABExperimentStatus.RUNNING }
      ]);

      const result = await service.getDiagnostics();

      expect(result).toHaveProperty('causalInference');
      expect(result).toHaveProperty('abTesting');
      expect(result.causalInference.observationCount).toBe(100);
      expect(result.abTesting.runningExperiments).toBe(1);
    });
  });
});
