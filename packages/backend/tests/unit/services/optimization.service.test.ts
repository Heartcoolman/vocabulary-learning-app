/**
 * Optimization Service Unit Tests
 * 
 * Note: OptimizationService constructor calls initializeOptimizer() async without await,
 * so the optimizer instance is null initially. Tests are designed to handle this behavior.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock feature flag - default to false to test disabled behavior
const mockIsBayesianOptimizerEnabled = vi.fn().mockReturnValue(false);

vi.mock('../../../src/amas/config/feature-flags', () => ({
  isBayesianOptimizerEnabled: () => mockIsBayesianOptimizerEnabled()
}));

vi.mock('../../../src/config/database', () => ({
  default: {
    answerRecord: {
      findMany: vi.fn().mockResolvedValue([
        { isCorrect: true, responseTime: 2000 },
        { isCorrect: true, responseTime: 2500 },
        { isCorrect: false, responseTime: 4000 }
      ])
    },
    bayesianOptimizerState: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({})
    }
  }
}));

// Mock the BayesianOptimizer class
const mockOptimizerInstance = {
  suggestNext: vi.fn().mockReturnValue([0.25, 0.3, 2, 1]),
  paramsToObject: vi.fn().mockReturnValue({ 
    new_ratio: 0.25, 
    difficulty: 2, 
    interval_scale: 1.0, 
    hint_level: 1 
  }),
  objectToParams: vi.fn().mockReturnValue([0.25, 0.3, 2, 1]),
  recordEvaluation: vi.fn(),
  getBest: vi.fn().mockReturnValue({ 
    params: [0.25, 0.3, 2, 1], 
    value: 0.85 
  }),
  getState: vi.fn().mockReturnValue({ 
    observations: [
      { params: [0.2, 0.3, 2, 1], value: 0.8, timestamp: Date.now() },
      { params: [0.25, 0.3, 2, 1], value: 0.85, timestamp: Date.now() }
    ], 
    best: { params: [0.25, 0.3, 2, 1], value: 0.85 }
  })
};

vi.mock('../../../src/amas', () => {
  return {
    BayesianOptimizer: vi.fn().mockImplementation(function() {
      return mockOptimizerInstance;
    }),
    defaultBayesianOptimizer: mockOptimizerInstance
  };
});

import prisma from '../../../src/config/database';

describe('OptimizationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsBayesianOptimizerEnabled.mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('when optimizer is disabled', () => {
    let optimizationService: any;

    beforeEach(async () => {
      mockIsBayesianOptimizerEnabled.mockReturnValue(false);
      vi.resetModules();
      const module = await import('../../../src/services/optimization.service');
      optimizationService = module.optimizationService;
    });

    it('suggestNextParams should return null', () => {
      const result = optimizationService.suggestNextParams();
      expect(result).toBeNull();
    });

    it('getBestParams should return null', () => {
      const result = optimizationService.getBestParams();
      expect(result).toBeNull();
    });

    it('getOptimizationHistory should return empty history', () => {
      const result = optimizationService.getOptimizationHistory();

      expect(result.observations).toHaveLength(0);
      expect(result.evaluationCount).toBe(0);
      expect(result.bestParams).toBeNull();
      expect(result.bestValue).toBeNull();
    });

    it('isEnabled should return false', () => {
      const result = optimizationService.isEnabled();
      expect(result).toBe(false);
    });

    it('getParamSpace should return parameter space definition', () => {
      const result = optimizationService.getParamSpace();

      expect(result).toBeDefined();
      expect(result.new_ratio).toBeDefined();
      expect(result.new_ratio.min).toBe(0.0);
      expect(result.new_ratio.max).toBe(0.5);
      expect(result.difficulty).toBeDefined();
      expect(result.interval_scale).toBeDefined();
      expect(result.hint_level).toBeDefined();
    });

    it('getDiagnostics should return correct status', () => {
      const result = optimizationService.getDiagnostics();

      expect(result).toBeDefined();
      expect(result.enabled).toBe(false);
      expect(result.isOptimizing).toBe(false);
      expect(result.evaluationCount).toBe(0);
      expect(result.paramSpace).toBeDefined();
    });

    it('recordEvaluation should do nothing when disabled', async () => {
      const params = { new_ratio: 0.3, difficulty: 2, interval_scale: 1.0, hint_level: 1 };
      
      await optimizationService.recordEvaluation(params, 0.9);

      expect(mockOptimizerInstance.recordEvaluation).not.toHaveBeenCalled();
    });

    it('resetOptimizer should do nothing when disabled', async () => {
      await optimizationService.resetOptimizer();

      expect(prisma.bayesianOptimizerState.deleteMany).not.toHaveBeenCalled();
    });

    it('runOptimizationCycle should return null suggested and false evaluated', async () => {
      const result = await optimizationService.runOptimizationCycle();

      expect(result.suggested).toBeNull();
      expect(result.evaluated).toBe(false);
    });
  });

  describe('OptimizationService class definition', () => {
    it('should export OptimizationService class', async () => {
      const module = await import('../../../src/services/optimization.service');
      expect(module.OptimizationService).toBeDefined();
    });

    it('should export optimizationService singleton', async () => {
      const module = await import('../../../src/services/optimization.service');
      expect(module.optimizationService).toBeDefined();
    });
  });

  describe('parameter space validation', () => {
    let optimizationService: any;

    beforeEach(async () => {
      vi.resetModules();
      const module = await import('../../../src/services/optimization.service');
      optimizationService = module.optimizationService;
    });

    it('should have valid interval_scale bounds', () => {
      const paramSpace = optimizationService.getParamSpace();
      
      expect(paramSpace.interval_scale.min).toBe(0.5);
      expect(paramSpace.interval_scale.max).toBe(2.0);
    });

    it('should have valid new_ratio bounds', () => {
      const paramSpace = optimizationService.getParamSpace();
      
      expect(paramSpace.new_ratio.min).toBe(0.0);
      expect(paramSpace.new_ratio.max).toBe(0.5);
    });

    it('should have valid difficulty bounds', () => {
      const paramSpace = optimizationService.getParamSpace();
      
      expect(paramSpace.difficulty.min).toBe(1);
      expect(paramSpace.difficulty.max).toBe(3);
    });

    it('should have valid hint_level bounds', () => {
      const paramSpace = optimizationService.getParamSpace();
      
      expect(paramSpace.hint_level.min).toBe(0);
      expect(paramSpace.hint_level.max).toBe(2);
    });
  });

  describe('diagnostics structure', () => {
    let optimizationService: any;

    beforeEach(async () => {
      vi.resetModules();
      const module = await import('../../../src/services/optimization.service');
      optimizationService = module.optimizationService;
    });

    it('should return all required diagnostic fields', () => {
      const diagnostics = optimizationService.getDiagnostics();

      expect(diagnostics).toHaveProperty('enabled');
      expect(diagnostics).toHaveProperty('isOptimizing');
      expect(diagnostics).toHaveProperty('evaluationCount');
      expect(diagnostics).toHaveProperty('paramSpace');
      expect(diagnostics).toHaveProperty('bestParams');
      expect(diagnostics).toHaveProperty('bestValue');
    });

    it('isOptimizing should be false when no optimization is running', () => {
      const diagnostics = optimizationService.getDiagnostics();
      expect(diagnostics.isOptimizing).toBe(false);
    });
  });
});
