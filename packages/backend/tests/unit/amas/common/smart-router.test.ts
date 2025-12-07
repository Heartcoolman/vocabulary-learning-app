/**
 * Smart Router Unit Tests
 *
 * Tests for the intelligent routing selector that chooses between
 * Native (Rust) and TypeScript implementations based on operation complexity
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SmartRouter,
  RouteDecision,
  OperationComplexity,
  OperationConfig,
} from '../../../../src/amas/common/smart-router';

describe('SmartRouter', () => {
  beforeEach(() => {
    // Reset to default configuration before each test
    SmartRouter.resetToDefaults();
    SmartRouter.resetStats();
  });

  afterEach(() => {
    SmartRouter.disableStats();
  });

  // ==================== Basic Decision Tests ====================

  describe('decide', () => {
    describe('simple operations (should use TypeScript)', () => {
      it('should use TypeScript for thompson.getExpectedReward', () => {
        const decision = SmartRouter.decide('thompson.getExpectedReward');
        expect(decision).toBe(RouteDecision.USE_TYPESCRIPT);
      });

      it('should use TypeScript for thompson.sampleBeta', () => {
        const decision = SmartRouter.decide('thompson.sampleBeta');
        expect(decision).toBe(RouteDecision.USE_TYPESCRIPT);
      });

      it('should use TypeScript for actr.retrievalProbability', () => {
        const decision = SmartRouter.decide('actr.retrievalProbability');
        expect(decision).toBe(RouteDecision.USE_TYPESCRIPT);
      });

      it('should use TypeScript for actr.computeRecallProbability', () => {
        const decision = SmartRouter.decide('actr.computeRecallProbability');
        expect(decision).toBe(RouteDecision.USE_TYPESCRIPT);
      });

      it('should use TypeScript for causal.getPropensityScore', () => {
        const decision = SmartRouter.decide('causal.getPropensityScore');
        expect(decision).toBe(RouteDecision.USE_TYPESCRIPT);
      });

      it('should use TypeScript for thompson.update', () => {
        const decision = SmartRouter.decide('thompson.update');
        expect(decision).toBe(RouteDecision.USE_TYPESCRIPT);
      });

      it('should use TypeScript for actr.update', () => {
        const decision = SmartRouter.decide('actr.update');
        expect(decision).toBe(RouteDecision.USE_TYPESCRIPT);
      });
    });

    describe('complex operations (should use Native)', () => {
      it('should use Native for causal.bootstrapSE', () => {
        const decision = SmartRouter.decide('causal.bootstrapSE');
        expect(decision).toBe(RouteDecision.USE_NATIVE);
      });

      it('should use Native for causal.fitPropensity', () => {
        const decision = SmartRouter.decide('causal.fitPropensity');
        expect(decision).toBe(RouteDecision.USE_NATIVE);
      });

      it('should use Native for causal.fit', () => {
        const decision = SmartRouter.decide('causal.fit');
        expect(decision).toBe(RouteDecision.USE_NATIVE);
      });

      it('should use Native for actr.computeOptimalInterval', () => {
        const decision = SmartRouter.decide('actr.computeOptimalInterval');
        expect(decision).toBe(RouteDecision.USE_NATIVE);
      });

      it('should use Native for actr.predictOptimalInterval', () => {
        const decision = SmartRouter.decide('actr.predictOptimalInterval');
        expect(decision).toBe(RouteDecision.USE_NATIVE);
      });

      it('should use Native for linucb.update', () => {
        const decision = SmartRouter.decide('linucb.update');
        expect(decision).toBe(RouteDecision.USE_NATIVE);
      });

      it('should use Native for linucb.updateBatch', () => {
        const decision = SmartRouter.decide('linucb.updateBatch');
        expect(decision).toBe(RouteDecision.USE_NATIVE);
      });
    });

    describe('medium operations (threshold-based)', () => {
      it('should use TypeScript for actr.computeActivation with small data', () => {
        const decision = SmartRouter.decide('actr.computeActivation', { dataSize: 100 });
        expect(decision).toBe(RouteDecision.USE_TYPESCRIPT);
      });

      it('should use Native for actr.computeActivation with large data', () => {
        const decision = SmartRouter.decide('actr.computeActivation', { dataSize: 1000 });
        expect(decision).toBe(RouteDecision.USE_NATIVE);
      });

      it('should use TypeScript for actr.computeActivation at threshold boundary (below)', () => {
        const decision = SmartRouter.decide('actr.computeActivation', { dataSize: 499 });
        expect(decision).toBe(RouteDecision.USE_TYPESCRIPT);
      });

      it('should use Native for actr.computeActivation at threshold boundary (at)', () => {
        const decision = SmartRouter.decide('actr.computeActivation', { dataSize: 500 });
        expect(decision).toBe(RouteDecision.USE_NATIVE);
      });

      it('should use TypeScript for thompson.selectAction with few actions', () => {
        const decision = SmartRouter.decide('thompson.selectAction', { dataSize: 10 });
        expect(decision).toBe(RouteDecision.USE_TYPESCRIPT);
      });

      it('should use Native for thompson.selectAction with many actions', () => {
        const decision = SmartRouter.decide('thompson.selectAction', { dataSize: 30 });
        expect(decision).toBe(RouteDecision.USE_NATIVE);
      });

      it('should use TypeScript for thompson.batchSample with small batch', () => {
        const decision = SmartRouter.decide('thompson.batchSample', { dataSize: 20 });
        expect(decision).toBe(RouteDecision.USE_TYPESCRIPT);
      });

      it('should use Native for thompson.batchSample with large batch', () => {
        const decision = SmartRouter.decide('thompson.batchSample', { dataSize: 100 });
        expect(decision).toBe(RouteDecision.USE_NATIVE);
      });

      it('should use TypeScript for causal.estimateATE with small sample', () => {
        const decision = SmartRouter.decide('causal.estimateATE', { dataSize: 100 });
        expect(decision).toBe(RouteDecision.USE_TYPESCRIPT);
      });

      it('should use Native for causal.estimateATE with large sample', () => {
        const decision = SmartRouter.decide('causal.estimateATE', { dataSize: 500 });
        expect(decision).toBe(RouteDecision.USE_NATIVE);
      });
    });

    describe('native availability handling', () => {
      it('should use TypeScript when native is not available', () => {
        const decision = SmartRouter.decide('causal.bootstrapSE', { nativeAvailable: false });
        expect(decision).toBe(RouteDecision.USE_TYPESCRIPT);
      });

      it('should use Native when native is available for complex operations', () => {
        const decision = SmartRouter.decide('causal.bootstrapSE', { nativeAvailable: true });
        expect(decision).toBe(RouteDecision.USE_NATIVE);
      });

      it('should still use TypeScript for simple operations even when native is available', () => {
        const decision = SmartRouter.decide('thompson.getExpectedReward', { nativeAvailable: true });
        expect(decision).toBe(RouteDecision.USE_TYPESCRIPT);
      });
    });

    describe('unconfigured operations', () => {
      it('should default to Native for unconfigured operations', () => {
        const decision = SmartRouter.decide('unknown.operation');
        expect(decision).toBe(RouteDecision.USE_NATIVE);
      });

      it('should use TypeScript for unconfigured operations when native unavailable', () => {
        const decision = SmartRouter.decide('unknown.operation', { nativeAvailable: false });
        expect(decision).toBe(RouteDecision.USE_TYPESCRIPT);
      });
    });
  });

  // ==================== Convenience Methods ====================

  describe('shouldUseNative', () => {
    it('should return true for complex operations', () => {
      expect(SmartRouter.shouldUseNative('causal.bootstrapSE')).toBe(true);
    });

    it('should return false for simple operations', () => {
      expect(SmartRouter.shouldUseNative('thompson.getExpectedReward')).toBe(false);
    });
  });

  describe('shouldUseTypeScript', () => {
    it('should return false for complex operations', () => {
      expect(SmartRouter.shouldUseTypeScript('causal.bootstrapSE')).toBe(false);
    });

    it('should return true for simple operations', () => {
      expect(SmartRouter.shouldUseTypeScript('thompson.getExpectedReward')).toBe(true);
    });
  });

  // ==================== Batch Decision ====================

  describe('decideBatch', () => {
    it('should return correct decisions for multiple operations', () => {
      const operations = [
        { operation: 'thompson.getExpectedReward' },
        { operation: 'causal.bootstrapSE' },
        { operation: 'actr.computeActivation', options: { dataSize: 1000 } },
      ];

      const results = SmartRouter.decideBatch(operations);

      expect(results.get('thompson.getExpectedReward')).toBe(RouteDecision.USE_TYPESCRIPT);
      expect(results.get('causal.bootstrapSE')).toBe(RouteDecision.USE_NATIVE);
      expect(results.get('actr.computeActivation')).toBe(RouteDecision.USE_NATIVE);
    });
  });

  // ==================== Configuration Management ====================

  describe('configuration', () => {
    describe('registerOperation', () => {
      it('should register a new operation', () => {
        SmartRouter.registerOperation('custom.operation', {
          complexity: OperationComplexity.COMPLEX,
          forceRoute: RouteDecision.USE_NATIVE,
        });

        const config = SmartRouter.getConfig('custom.operation');
        expect(config).toBeDefined();
        expect(config?.complexity).toBe(OperationComplexity.COMPLEX);
      });

      it('should override existing operation config', () => {
        SmartRouter.registerOperation('thompson.sampleBeta', {
          complexity: OperationComplexity.COMPLEX,
          forceRoute: RouteDecision.USE_NATIVE,
        });

        const decision = SmartRouter.decide('thompson.sampleBeta');
        expect(decision).toBe(RouteDecision.USE_NATIVE);
      });
    });

    describe('registerOperations', () => {
      it('should register multiple operations from array', () => {
        const configs: Array<[string, OperationConfig]> = [
          ['custom.op1', { complexity: OperationComplexity.SIMPLE }],
          ['custom.op2', { complexity: OperationComplexity.COMPLEX }],
        ];

        SmartRouter.registerOperations(configs);

        expect(SmartRouter.hasConfig('custom.op1')).toBe(true);
        expect(SmartRouter.hasConfig('custom.op2')).toBe(true);
      });

      it('should register multiple operations from Map', () => {
        const configs = new Map<string, OperationConfig>([
          ['custom.op3', { complexity: OperationComplexity.SIMPLE }],
          ['custom.op4', { complexity: OperationComplexity.COMPLEX }],
        ]);

        SmartRouter.registerOperations(configs);

        expect(SmartRouter.hasConfig('custom.op3')).toBe(true);
        expect(SmartRouter.hasConfig('custom.op4')).toBe(true);
      });
    });

    describe('unregisterOperation', () => {
      it('should remove an operation', () => {
        SmartRouter.registerOperation('temp.operation', {
          complexity: OperationComplexity.SIMPLE,
        });
        expect(SmartRouter.hasConfig('temp.operation')).toBe(true);

        const removed = SmartRouter.unregisterOperation('temp.operation');
        expect(removed).toBe(true);
        expect(SmartRouter.hasConfig('temp.operation')).toBe(false);
      });

      it('should return false for non-existent operation', () => {
        const removed = SmartRouter.unregisterOperation('non.existent');
        expect(removed).toBe(false);
      });
    });

    describe('getConfig', () => {
      it('should return config for existing operation', () => {
        const config = SmartRouter.getConfig('causal.bootstrapSE');
        expect(config).toBeDefined();
        expect(config?.complexity).toBe(OperationComplexity.COMPLEX);
        expect(config?.forceRoute).toBe(RouteDecision.USE_NATIVE);
      });

      it('should return undefined for non-existent operation', () => {
        const config = SmartRouter.getConfig('non.existent');
        expect(config).toBeUndefined();
      });
    });

    describe('hasConfig', () => {
      it('should return true for configured operations', () => {
        expect(SmartRouter.hasConfig('causal.bootstrapSE')).toBe(true);
      });

      it('should return false for unconfigured operations', () => {
        expect(SmartRouter.hasConfig('non.existent')).toBe(false);
      });
    });

    describe('getAllConfigs', () => {
      it('should return a copy of all configurations', () => {
        const configs = SmartRouter.getAllConfigs();
        expect(configs instanceof Map).toBe(true);
        expect(configs.size).toBeGreaterThan(0);
      });

      it('should not affect original when modifying returned map', () => {
        const configs = SmartRouter.getAllConfigs();
        const originalSize = configs.size;

        configs.delete('causal.bootstrapSE');

        const newConfigs = SmartRouter.getAllConfigs();
        expect(newConfigs.size).toBe(originalSize);
      });
    });

    describe('getOperationNames', () => {
      it('should return array of operation names', () => {
        const names = SmartRouter.getOperationNames();
        expect(Array.isArray(names)).toBe(true);
        expect(names).toContain('causal.bootstrapSE');
        expect(names).toContain('thompson.sampleBeta');
      });
    });

    describe('resetToDefaults', () => {
      it('should restore default configuration', () => {
        // Modify configuration
        SmartRouter.registerOperation('custom.op', {
          complexity: OperationComplexity.SIMPLE,
        });
        SmartRouter.unregisterOperation('causal.bootstrapSE');

        // Reset
        SmartRouter.resetToDefaults();

        // Verify defaults restored
        expect(SmartRouter.hasConfig('custom.op')).toBe(false);
        expect(SmartRouter.hasConfig('causal.bootstrapSE')).toBe(true);
      });
    });
  });

  // ==================== Statistics ====================

  describe('statistics', () => {
    beforeEach(() => {
      SmartRouter.enableStats();
      SmartRouter.resetStats();
    });

    afterEach(() => {
      SmartRouter.disableStats();
    });

    it('should track decisions when stats enabled', () => {
      SmartRouter.decide('causal.bootstrapSE');
      SmartRouter.decide('thompson.getExpectedReward');
      SmartRouter.decide('actr.computeActivation', { dataSize: 1000 });

      const stats = SmartRouter.getStats();
      expect(stats.totalDecisions).toBe(3);
      expect(stats.nativeDecisions).toBe(2);
      expect(stats.typescriptDecisions).toBe(1);
    });

    it('should track per-operation decisions', () => {
      SmartRouter.decide('causal.bootstrapSE');
      SmartRouter.decide('causal.bootstrapSE');
      SmartRouter.decide('thompson.getExpectedReward');

      const stats = SmartRouter.getStats();
      const bootstrapStats = stats.decisions.get('causal.bootstrapSE');
      const expectedStats = stats.decisions.get('thompson.getExpectedReward');

      expect(bootstrapStats?.native).toBe(2);
      expect(bootstrapStats?.typescript).toBe(0);
      expect(expectedStats?.native).toBe(0);
      expect(expectedStats?.typescript).toBe(1);
    });

    it('should not track decisions when stats disabled', () => {
      SmartRouter.disableStats();

      SmartRouter.decide('causal.bootstrapSE');
      SmartRouter.decide('thompson.getExpectedReward');

      const stats = SmartRouter.getStats();
      expect(stats.totalDecisions).toBe(0);
    });

    it('should reset stats correctly', () => {
      SmartRouter.decide('causal.bootstrapSE');
      SmartRouter.decide('thompson.getExpectedReward');

      SmartRouter.resetStats();

      const stats = SmartRouter.getStats();
      expect(stats.totalDecisions).toBe(0);
      expect(stats.nativeDecisions).toBe(0);
      expect(stats.typescriptDecisions).toBe(0);
      expect(stats.decisions.size).toBe(0);
    });
  });

  // ==================== Diagnostics ====================

  describe('explainDecision', () => {
    it('should explain forced route decisions', () => {
      const explanation = SmartRouter.explainDecision('causal.bootstrapSE');
      expect(explanation).toContain('causal.bootstrapSE');
      expect(explanation).toContain(RouteDecision.USE_NATIVE);
      expect(explanation).toContain('native');
    });

    it('should explain threshold-based decisions', () => {
      const explanation = SmartRouter.explainDecision('actr.computeActivation', { dataSize: 100 });
      expect(explanation).toContain('actr.computeActivation');
      expect(explanation).toContain('500'); // threshold
    });

    it('should indicate unconfigured operations', () => {
      const explanation = SmartRouter.explainDecision('unknown.operation');
      expect(explanation).toContain('unknown.operation');
      expect(explanation).toContain('');
    });
  });

  // ==================== Export/Import ====================

  describe('exportConfig', () => {
    it('should export configuration as JSON object', () => {
      const exported = SmartRouter.exportConfig();
      expect(typeof exported).toBe('object');
      expect(exported['causal.bootstrapSE']).toBeDefined();
      expect(exported['causal.bootstrapSE'].complexity).toBe(OperationComplexity.COMPLEX);
    });
  });

  describe('importConfig', () => {
    it('should import configuration and merge by default', () => {
      const customConfig = {
        'custom.imported': {
          complexity: OperationComplexity.SIMPLE,
          forceRoute: RouteDecision.USE_TYPESCRIPT,
        },
      };

      SmartRouter.importConfig(customConfig);

      expect(SmartRouter.hasConfig('custom.imported')).toBe(true);
      expect(SmartRouter.hasConfig('causal.bootstrapSE')).toBe(true); // Original still exists
    });

    it('should replace all configuration when merge=false', () => {
      const customConfig = {
        'only.this': {
          complexity: OperationComplexity.SIMPLE,
        },
      };

      SmartRouter.importConfig(customConfig, false);

      expect(SmartRouter.hasConfig('only.this')).toBe(true);
      expect(SmartRouter.hasConfig('causal.bootstrapSE')).toBe(false);

      // Restore defaults for other tests
      SmartRouter.resetToDefaults();
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('should handle zero dataSize', () => {
      const decision = SmartRouter.decide('actr.computeActivation', { dataSize: 0 });
      expect(decision).toBe(RouteDecision.USE_TYPESCRIPT);
    });

    it('should handle negative dataSize', () => {
      const decision = SmartRouter.decide('actr.computeActivation', { dataSize: -10 });
      expect(decision).toBe(RouteDecision.USE_TYPESCRIPT);
    });

    it('should handle very large dataSize', () => {
      const decision = SmartRouter.decide('actr.computeActivation', { dataSize: 1000000 });
      expect(decision).toBe(RouteDecision.USE_NATIVE);
    });

    it('should handle undefined options', () => {
      const decision = SmartRouter.decide('actr.computeActivation');
      expect(decision).toBe(RouteDecision.USE_TYPESCRIPT); // Default dataSize is 0
    });

    it('should handle empty string operation', () => {
      const decision = SmartRouter.decide('');
      expect(decision).toBe(RouteDecision.USE_NATIVE); // Unconfigured, default to native
    });
  });

  // ==================== Performance Routing Table Verification ====================

  describe('performance routing table', () => {
    it('should route Bootstrap (3318x speedup) to Native', () => {
      expect(SmartRouter.decide('causal.bootstrapSE')).toBe(RouteDecision.USE_NATIVE);
    });

    it('should route fitPropensity (107x speedup) to Native', () => {
      expect(SmartRouter.decide('causal.fitPropensity')).toBe(RouteDecision.USE_NATIVE);
    });

    it('should route getExpectedValue (14x slower in Native) to TypeScript', () => {
      expect(SmartRouter.decide('thompson.getExpectedReward')).toBe(RouteDecision.USE_TYPESCRIPT);
    });

    it('should route retrievalProbability (11x slower in Native) to TypeScript', () => {
      expect(SmartRouter.decide('actr.retrievalProbability')).toBe(RouteDecision.USE_TYPESCRIPT);
    });
  });
});
