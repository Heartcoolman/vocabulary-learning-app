/**
 * Optimization Service Tests
 * 优化服务单元测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock modules before importing service
const mockOptimizerInstance = {
  // 实际的 BayesianOptimizer 方法
  suggestNext: vi.fn().mockReturnValue([1.2, 0.35, 2, 1]),  // 返回 number[]
  recordEvaluation: vi.fn(),
  paramsToObject: vi.fn().mockImplementation((params: number[]) => ({
    interval_scale: params[0],
    new_ratio: params[1],
    difficulty: params[2],
    hint_level: params[3]
  })),
  objectToParams: vi.fn().mockImplementation((obj: Record<string, number>) => [
    obj.interval_scale,
    obj.new_ratio,
    obj.difficulty,
    obj.hint_level
  ]),
  getState: vi.fn().mockReturnValue({
    observations: [
      { params: [1.0, 0.3, 2, 1], value: 0.7, timestamp: Date.now() }
    ],
    bestParams: [1.2, 0.35, 2, 1],
    bestValue: 0.85,
    paramSpace: [
      { name: 'interval_scale', min: 0.5, max: 2.0 },
      { name: 'new_ratio', min: 0.0, max: 0.5 },
      { name: 'difficulty', min: 1, max: 3 },
      { name: 'hint_level', min: 0, max: 2 }
    ]
  }),
  getBest: vi.fn().mockReturnValue({
    params: [1.2, 0.35, 2, 1],
    value: 0.85
  }),
  reset: vi.fn(),
  setState: vi.fn()
};

const mockPrisma = {
  bayesianOptimizerState: {
    upsert: vi.fn().mockResolvedValue({}),
    findUnique: vi.fn().mockResolvedValue(null),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 })
  },
  answerRecord: {
    findMany: vi.fn().mockResolvedValue([])
  }
};

let mockFeatureFlagEnabled = true;

vi.mock('../../../src/config/database', () => ({
  default: mockPrisma
}));

vi.mock('../../../src/amas/config/feature-flags', () => ({
  isBayesianOptimizerEnabled: () => mockFeatureFlagEnabled
}));

vi.mock('../../../src/amas', () => {
  return {
    BayesianOptimizer: function() {
      return mockOptimizerInstance;
    }
  };
});

describe('OptimizationService', () => {
  let OptimizationService: typeof import('../../../src/services/optimization.service').OptimizationService;
  let service: InstanceType<typeof OptimizationService>;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    mockFeatureFlagEnabled = true;

    // Reset mock implementations
    mockOptimizerInstance.suggestNext.mockReturnValue([1.2, 0.35, 2, 1]);
    mockOptimizerInstance.paramsToObject.mockImplementation((params: number[]) => ({
      interval_scale: params[0],
      new_ratio: params[1],
      difficulty: params[2],
      hint_level: params[3]
    }));
    mockOptimizerInstance.getState.mockReturnValue({
      observations: [
        { params: [1.0, 0.3, 2, 1], value: 0.7, timestamp: Date.now() }
      ],
      bestParams: [1.2, 0.35, 2, 1],
      bestValue: 0.85,
      paramSpace: [
        { name: 'interval_scale', min: 0.5, max: 2.0 },
        { name: 'new_ratio', min: 0.0, max: 0.5 },
        { name: 'difficulty', min: 1, max: 3 },
        { name: 'hint_level', min: 0, max: 2 }
      ]
    });
    mockOptimizerInstance.getBest.mockReturnValue({
      params: [1.2, 0.35, 2, 1],
      value: 0.85
    });

    mockPrisma.bayesianOptimizerState.findUnique.mockResolvedValue(null);
    mockPrisma.bayesianOptimizerState.upsert.mockResolvedValue({});

    // Re-import module to get fresh instance
    vi.resetModules();
    const module = await import('../../../src/services/optimization.service');
    OptimizationService = module.OptimizationService;
    service = new OptimizationService();

    // Wait for async initialization
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('suggestNextParams', () => {
    it('应该返回推荐的参数组合', () => {
      const result = service.suggestNextParams();

      expect(result).toEqual({
        interval_scale: 1.2,
        new_ratio: 0.35,
        difficulty: 2,
        hint_level: 1
      });
    });

    it('功能禁用时应该返回null', async () => {
      mockFeatureFlagEnabled = false;
      vi.resetModules();
      const module = await import('../../../src/services/optimization.service');
      const disabledService = new module.OptimizationService();

      const result = disabledService.suggestNextParams();

      expect(result).toBeNull();
    });
  });

  describe('recordEvaluation', () => {
    it('应该记录参数评估结果', async () => {
      const params = { interval_scale: 1.2, new_ratio: 0.35, difficulty: 2, hint_level: 1 };
      const value = 0.85;

      await service.recordEvaluation(params, value);

      // Service 会调用 objectToParams 转换参数，然后传给 recordEvaluation
      expect(mockOptimizerInstance.objectToParams).toHaveBeenCalledWith(params);
      expect(mockOptimizerInstance.recordEvaluation).toHaveBeenCalledWith([1.2, 0.35, 2, 1], value);
      expect(mockPrisma.bayesianOptimizerState.upsert).toHaveBeenCalled();
    });

    it('功能禁用时应该静默返回', async () => {
      mockFeatureFlagEnabled = false;
      vi.resetModules();
      const module = await import('../../../src/services/optimization.service');
      const disabledService = new module.OptimizationService();

      await disabledService.recordEvaluation({}, 0.5);

      expect(mockOptimizerInstance.recordEvaluation).not.toHaveBeenCalled();
    });
  });

  describe('getBestParams', () => {
    it('应该返回当前最优参数', () => {
      const result = service.getBestParams();

      expect(result).toEqual({
        params: {
          interval_scale: 1.2,
          new_ratio: 0.35,
          difficulty: 2,
          hint_level: 1
        },
        value: 0.85
      });
    });

    it('没有最优参数时应该返回null', () => {
      mockOptimizerInstance.getBest.mockReturnValue(null);

      const result = service.getBestParams();

      expect(result).toBeNull();
    });
  });

  describe('getOptimizationHistory', () => {
    it('应该返回优化历史', () => {
      const result = service.getOptimizationHistory();

      expect(result).toHaveProperty('observations');
      expect(result).toHaveProperty('bestParams');
      expect(result).toHaveProperty('bestValue');
      expect(result).toHaveProperty('evaluationCount');
      expect(result.evaluationCount).toBe(1);
    });

    it('功能禁用时应该返回空历史', async () => {
      mockFeatureFlagEnabled = false;
      vi.resetModules();
      const module = await import('../../../src/services/optimization.service');
      const disabledService = new module.OptimizationService();

      const result = disabledService.getOptimizationHistory();

      expect(result.observations).toEqual([]);
      expect(result.evaluationCount).toBe(0);
    });
  });

  describe('runOptimizationCycle', () => {
    it('应该执行优化周期并返回结果', async () => {
      // Mock 足够的学习记录
      mockPrisma.answerRecord.findMany.mockResolvedValue(
        Array(15).fill(null).map((_, i) => ({
          isCorrect: i % 2 === 0,
          responseTime: 3000 + i * 500
        }))
      );

      const result = await service.runOptimizationCycle();

      expect(result.suggested).toBeTruthy();
      expect(result.evaluated).toBe(true);
    });

    it('数据不足时不执行评估', async () => {
      mockPrisma.answerRecord.findMany.mockResolvedValue([
        { isCorrect: true, responseTime: 3000 }
      ]);

      const result = await service.runOptimizationCycle();

      expect(result.suggested).toBeTruthy();
      expect(result.evaluated).toBe(false);
    });

    it('功能禁用时应该返回空结果', async () => {
      mockFeatureFlagEnabled = false;
      vi.resetModules();
      const module = await import('../../../src/services/optimization.service');
      const disabledService = new module.OptimizationService();

      const result = await disabledService.runOptimizationCycle();

      expect(result.suggested).toBeNull();
      expect(result.evaluated).toBe(false);
    });
  });

  describe('saveState', () => {
    it('应该保存优化器状态到数据库', async () => {
      await service.saveState();

      expect(mockPrisma.bayesianOptimizerState.upsert).toHaveBeenCalledWith({
        where: { id: 'global' },
        create: expect.objectContaining({
          id: 'global'
        }),
        update: expect.any(Object)
      });
    });
  });

  describe('loadState', () => {
    it('应该从数据库恢复优化器状态', async () => {
      const savedState = {
        id: 'global',
        observations: [
          { params: { interval_scale: 1.0 }, value: 0.7 }
        ],
        bestParams: { interval_scale: 1.2 },
        bestValue: 0.85,
        evaluationCount: 1
      };

      mockPrisma.bayesianOptimizerState.findUnique.mockResolvedValue(savedState);

      await service.loadState();

      // 验证观测被重放
      expect(mockOptimizerInstance.recordEvaluation).toHaveBeenCalled();
    });

    it('没有保存状态时应该静默返回', async () => {
      mockPrisma.bayesianOptimizerState.findUnique.mockResolvedValue(null);
      mockOptimizerInstance.recordEvaluation.mockClear();

      await service.loadState();

      // 不应该有观测重放（初始化时已经调用过一次 loadState）
      expect(mockOptimizerInstance.recordEvaluation).not.toHaveBeenCalled();
    });
  });

  describe('resetOptimizer', () => {
    it('应该重置优化器并清除数据库状态', async () => {
      await service.resetOptimizer();

      expect(mockPrisma.bayesianOptimizerState.deleteMany).toHaveBeenCalledWith({
        where: { id: 'global' }
      });
    });
  });

  describe('getParamSpace', () => {
    it('应该返回参数空间定义', () => {
      const paramSpace = service.getParamSpace();

      expect(paramSpace).toHaveProperty('interval_scale');
      expect(paramSpace).toHaveProperty('new_ratio');
      expect(paramSpace).toHaveProperty('difficulty');
      expect(paramSpace).toHaveProperty('hint_level');

      expect(paramSpace.interval_scale).toEqual({ min: 0.5, max: 2.0 });
      expect(paramSpace.new_ratio).toEqual({ min: 0.0, max: 0.5 });
    });
  });

  describe('isEnabled', () => {
    it('功能启用时应该返回true', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('功能禁用时应该返回false', async () => {
      mockFeatureFlagEnabled = false;
      vi.resetModules();
      const module = await import('../../../src/services/optimization.service');
      const disabledService = new module.OptimizationService();

      expect(disabledService.isEnabled()).toBe(false);
    });
  });

  describe('getDiagnostics', () => {
    it('应该返回完整的诊断信息', () => {
      const diagnostics = service.getDiagnostics();

      expect(diagnostics).toHaveProperty('enabled');
      expect(diagnostics).toHaveProperty('isOptimizing');
      expect(diagnostics).toHaveProperty('evaluationCount');
      expect(diagnostics).toHaveProperty('paramSpace');
      expect(diagnostics).toHaveProperty('bestParams');
      expect(diagnostics).toHaveProperty('bestValue');

      expect(diagnostics.enabled).toBe(true);
      expect(diagnostics.isOptimizing).toBe(false);
    });
  });

  describe('evaluateRecentLearningEffect', () => {
    it('应该正确计算学习效果分数', async () => {
      const records = [
        { isCorrect: true, responseTime: 2000 },
        { isCorrect: true, responseTime: 3000 },
        { isCorrect: false, responseTime: 5000 },
        { isCorrect: true, responseTime: 4000 },
        { isCorrect: true, responseTime: 3500 },
        { isCorrect: true, responseTime: 3200 },
        { isCorrect: true, responseTime: 2800 },
        { isCorrect: false, responseTime: 8000 },
        { isCorrect: true, responseTime: 3100 },
        { isCorrect: true, responseTime: 2900 }
      ];

      mockPrisma.answerRecord.findMany.mockResolvedValue(records);

      const result = await service.runOptimizationCycle();

      expect(result.evaluated).toBe(true);
      expect(mockOptimizerInstance.recordEvaluation).toHaveBeenCalled();
    });

    it('响应时间为null时应该使用默认速度分', async () => {
      const records = Array(15).fill(null).map(() => ({
        isCorrect: true,
        responseTime: null
      }));

      mockPrisma.answerRecord.findMany.mockResolvedValue(records);

      const result = await service.runOptimizationCycle();

      expect(result.evaluated).toBe(true);
    });
  });
});
