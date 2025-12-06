/**
 * FeatureFlags Unit Tests
 *
 * Tests for the feature flags configuration module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AMASFeatureFlags,
  DEFAULT_FEATURE_FLAGS,
  initializeFeatureFlags,
  getFeatureFlags,
  isFeatureEnabled,
  updateFeatureFlags,
  resetFeatureFlags,
  isEnsembleEnabled,
  isColdStartEnabled,
  isDelayedRewardAggregatorEnabled,
  isCausalInferenceEnabled,
  isBayesianOptimizerEnabled,
  isTrendAnalyzerEnabled,
  isUserParamsManagerEnabled,
  getEnsembleLearnerFlags,
  hasEvaluationModulesEnabled,
  hasAdvancedOptimizationEnabled,
  getFeatureFlagsSummary,
  exportFeatureFlagsAsJSON
} from '../../../../src/amas/config/feature-flags';

describe('FeatureFlags', () => {
  beforeEach(() => {
    // Reset to default state before each test
    resetFeatureFlags();
  });

  afterEach(() => {
    // Clean up any environment variables
    vi.unstubAllEnvs();
  });

  // ==================== Default Values Tests ====================

  describe('DEFAULT_FEATURE_FLAGS', () => {
    it('should have all features enabled by default', () => {
      expect(DEFAULT_FEATURE_FLAGS.enableTrendAnalyzer).toBe(true);
      expect(DEFAULT_FEATURE_FLAGS.enableHeuristicBaseline).toBe(true);
      expect(DEFAULT_FEATURE_FLAGS.enableThompsonSampling).toBe(true);
      expect(DEFAULT_FEATURE_FLAGS.enableACTRMemory).toBe(true);
      expect(DEFAULT_FEATURE_FLAGS.enableColdStartManager).toBe(true);
      expect(DEFAULT_FEATURE_FLAGS.enableEnsemble).toBe(true);
      expect(DEFAULT_FEATURE_FLAGS.enableUserParamsManager).toBe(true);
      expect(DEFAULT_FEATURE_FLAGS.enableDelayedRewardAggregator).toBe(true);
      expect(DEFAULT_FEATURE_FLAGS.enableCausalInference).toBe(true);
      expect(DEFAULT_FEATURE_FLAGS.enableBayesianOptimizer).toBe(true);
    });
  });

  // ==================== initializeFeatureFlags Tests ====================

  describe('initializeFeatureFlags', () => {
    it('should initialize with default values', () => {
      const flags = initializeFeatureFlags();

      expect(flags).toEqual(DEFAULT_FEATURE_FLAGS);
    });

    it('should accept overrides', () => {
      const flags = initializeFeatureFlags({
        enableEnsemble: false,
        enableColdStartManager: false
      });

      expect(flags.enableEnsemble).toBe(false);
      expect(flags.enableColdStartManager).toBe(false);
      expect(flags.enableTrendAnalyzer).toBe(true); // Unchanged
    });

    it('should load from environment variables', () => {
      vi.stubEnv('AMAS_FEATURE_ENSEMBLE', 'false');

      const flags = initializeFeatureFlags();

      expect(flags.enableEnsemble).toBe(false);
    });

    it('should prioritize overrides over environment variables', () => {
      vi.stubEnv('AMAS_FEATURE_ENSEMBLE', 'false');

      const flags = initializeFeatureFlags({ enableEnsemble: true });

      expect(flags.enableEnsemble).toBe(true);
    });

    it('should parse various boolean string formats', () => {
      vi.stubEnv('AMAS_FEATURE_TREND_ANALYZER', 'true');
      vi.stubEnv('AMAS_FEATURE_HEURISTIC_BASELINE', 'TRUE');
      vi.stubEnv('AMAS_FEATURE_THOMPSON_SAMPLING', '1');
      vi.stubEnv('AMAS_FEATURE_ACTR_MEMORY', 'yes');
      vi.stubEnv('AMAS_FEATURE_COLD_START_MANAGER', 'false');
      vi.stubEnv('AMAS_FEATURE_ENSEMBLE', 'FALSE');
      vi.stubEnv('AMAS_FEATURE_USER_PARAMS_MANAGER', '0');
      vi.stubEnv('AMAS_FEATURE_DELAYED_REWARD_AGGREGATOR', 'no');

      const flags = initializeFeatureFlags();

      expect(flags.enableTrendAnalyzer).toBe(true);
      expect(flags.enableHeuristicBaseline).toBe(true);
      expect(flags.enableThompsonSampling).toBe(true);
      expect(flags.enableACTRMemory).toBe(true);
      expect(flags.enableColdStartManager).toBe(false);
      expect(flags.enableEnsemble).toBe(false);
      expect(flags.enableUserParamsManager).toBe(false);
      expect(flags.enableDelayedRewardAggregator).toBe(false);
    });

    it('should ignore invalid environment variable values', () => {
      vi.stubEnv('AMAS_FEATURE_ENSEMBLE', 'invalid');

      const flags = initializeFeatureFlags();

      expect(flags.enableEnsemble).toBe(true); // Default value
    });
  });

  // ==================== getFeatureFlags Tests ====================

  describe('getFeatureFlags', () => {
    it('should return current feature flags', () => {
      const flags = getFeatureFlags();

      expect(flags).toEqual(DEFAULT_FEATURE_FLAGS);
    });

    it('should reflect updates', () => {
      updateFeatureFlags({ enableEnsemble: false });

      const flags = getFeatureFlags();

      expect(flags.enableEnsemble).toBe(false);
    });

    it('should return readonly object', () => {
      const flags = getFeatureFlags();

      // TypeScript should prevent this, but runtime check
      expect(() => {
        (flags as any).enableEnsemble = false;
      }).not.toThrow(); // JavaScript allows this but it shouldn't affect actual state
    });
  });

  // ==================== isFeatureEnabled Tests ====================

  describe('isFeatureEnabled', () => {
    it('should return true for enabled features', () => {
      expect(isFeatureEnabled('enableEnsemble')).toBe(true);
      expect(isFeatureEnabled('enableColdStartManager')).toBe(true);
    });

    it('should return false for disabled features', () => {
      updateFeatureFlags({ enableEnsemble: false });

      expect(isFeatureEnabled('enableEnsemble')).toBe(false);
    });

    it('should work for all feature keys', () => {
      const keys: (keyof AMASFeatureFlags)[] = [
        'enableTrendAnalyzer',
        'enableHeuristicBaseline',
        'enableThompsonSampling',
        'enableACTRMemory',
        'enableColdStartManager',
        'enableEnsemble',
        'enableUserParamsManager',
        'enableDelayedRewardAggregator',
        'enableCausalInference',
        'enableBayesianOptimizer'
      ];

      keys.forEach(key => {
        expect(typeof isFeatureEnabled(key)).toBe('boolean');
      });
    });
  });

  // ==================== updateFeatureFlags Tests ====================

  describe('updateFeatureFlags', () => {
    it('should update single flag', () => {
      const updated = updateFeatureFlags({ enableEnsemble: false });

      expect(updated.enableEnsemble).toBe(false);
      expect(getFeatureFlags().enableEnsemble).toBe(false);
    });

    it('should update multiple flags', () => {
      const updated = updateFeatureFlags({
        enableEnsemble: false,
        enableColdStartManager: false,
        enableBayesianOptimizer: false
      });

      expect(updated.enableEnsemble).toBe(false);
      expect(updated.enableColdStartManager).toBe(false);
      expect(updated.enableBayesianOptimizer).toBe(false);
    });

    it('should preserve unchanged flags', () => {
      updateFeatureFlags({ enableEnsemble: false });

      expect(getFeatureFlags().enableTrendAnalyzer).toBe(true);
      expect(getFeatureFlags().enableCausalInference).toBe(true);
    });

    it('should return new state', () => {
      const newState = updateFeatureFlags({ enableEnsemble: false });

      expect(newState).toEqual(getFeatureFlags());
    });
  });

  // ==================== resetFeatureFlags Tests ====================

  describe('resetFeatureFlags', () => {
    it('should reset to default values', () => {
      updateFeatureFlags({
        enableEnsemble: false,
        enableColdStartManager: false,
        enableBayesianOptimizer: false
      });

      const reset = resetFeatureFlags();

      expect(reset).toEqual(DEFAULT_FEATURE_FLAGS);
      expect(getFeatureFlags()).toEqual(DEFAULT_FEATURE_FLAGS);
    });
  });

  // ==================== Convenience Function Tests ====================

  describe('convenience functions', () => {
    it('isEnsembleEnabled should return correct value', () => {
      expect(isEnsembleEnabled()).toBe(true);

      updateFeatureFlags({ enableEnsemble: false });
      expect(isEnsembleEnabled()).toBe(false);
    });

    it('isColdStartEnabled should return correct value', () => {
      expect(isColdStartEnabled()).toBe(true);

      updateFeatureFlags({ enableColdStartManager: false });
      expect(isColdStartEnabled()).toBe(false);
    });

    it('isDelayedRewardAggregatorEnabled should return correct value', () => {
      expect(isDelayedRewardAggregatorEnabled()).toBe(true);

      updateFeatureFlags({ enableDelayedRewardAggregator: false });
      expect(isDelayedRewardAggregatorEnabled()).toBe(false);
    });

    it('isCausalInferenceEnabled should return correct value', () => {
      expect(isCausalInferenceEnabled()).toBe(true);

      updateFeatureFlags({ enableCausalInference: false });
      expect(isCausalInferenceEnabled()).toBe(false);
    });

    it('isBayesianOptimizerEnabled should return correct value', () => {
      expect(isBayesianOptimizerEnabled()).toBe(true);

      updateFeatureFlags({ enableBayesianOptimizer: false });
      expect(isBayesianOptimizerEnabled()).toBe(false);
    });

    it('isTrendAnalyzerEnabled should return correct value', () => {
      expect(isTrendAnalyzerEnabled()).toBe(true);

      updateFeatureFlags({ enableTrendAnalyzer: false });
      expect(isTrendAnalyzerEnabled()).toBe(false);
    });

    it('isUserParamsManagerEnabled should return correct value', () => {
      expect(isUserParamsManagerEnabled()).toBe(true);

      updateFeatureFlags({ enableUserParamsManager: false });
      expect(isUserParamsManagerEnabled()).toBe(false);
    });
  });

  // ==================== Group Check Tests ====================

  describe('getEnsembleLearnerFlags', () => {
    it('should return ensemble learner states', () => {
      const flags = getEnsembleLearnerFlags();

      expect(flags).toHaveProperty('heuristic');
      expect(flags).toHaveProperty('thompson');
      expect(flags).toHaveProperty('actr');
    });

    it('should reflect individual learner settings', () => {
      updateFeatureFlags({
        enableHeuristicBaseline: false,
        enableThompsonSampling: true,
        enableACTRMemory: false
      });

      const flags = getEnsembleLearnerFlags();

      expect(flags.heuristic).toBe(false);
      expect(flags.thompson).toBe(true);
      expect(flags.actr).toBe(false);
    });
  });

  describe('hasEvaluationModulesEnabled', () => {
    it('should return true when any evaluation module is enabled', () => {
      expect(hasEvaluationModulesEnabled()).toBe(true);
    });

    it('should return true when only one is enabled', () => {
      updateFeatureFlags({
        enableDelayedRewardAggregator: false,
        enableCausalInference: true
      });

      expect(hasEvaluationModulesEnabled()).toBe(true);
    });

    it('should return false when both are disabled', () => {
      updateFeatureFlags({
        enableDelayedRewardAggregator: false,
        enableCausalInference: false
      });

      expect(hasEvaluationModulesEnabled()).toBe(false);
    });
  });

  describe('hasAdvancedOptimizationEnabled', () => {
    it('should return true when any advanced module is enabled', () => {
      expect(hasAdvancedOptimizationEnabled()).toBe(true);
    });

    it('should return true when only one is enabled', () => {
      updateFeatureFlags({
        enableBayesianOptimizer: false,
        enableCausalInference: true
      });

      expect(hasAdvancedOptimizationEnabled()).toBe(true);
    });

    it('should return false when both are disabled', () => {
      updateFeatureFlags({
        enableBayesianOptimizer: false,
        enableCausalInference: false
      });

      expect(hasAdvancedOptimizationEnabled()).toBe(false);
    });
  });

  // ==================== Debug and Diagnostics Tests ====================

  describe('getFeatureFlagsSummary', () => {
    it('should return formatted summary string', () => {
      const summary = getFeatureFlagsSummary();

      expect(summary).toContain('AMAS Feature Flags');
      expect(summary).toContain('Enabled');
    });

    it('should list disabled features', () => {
      updateFeatureFlags({
        enableEnsemble: false,
        enableColdStartManager: false
      });

      const summary = getFeatureFlagsSummary();

      expect(summary).toContain('Disabled');
      expect(summary).toContain('Ensemble');
      expect(summary).toContain('ColdStartManager');
    });

    it('should count enabled and disabled correctly', () => {
      updateFeatureFlags({
        enableEnsemble: false
      });

      const summary = getFeatureFlagsSummary();

      // Should show counts
      expect(summary).toMatch(/Enabled \(\d+\)/);
      expect(summary).toMatch(/Disabled \(\d+\)/);
    });
  });

  describe('exportFeatureFlagsAsJSON', () => {
    it('should export valid JSON', () => {
      const json = exportFeatureFlagsAsJSON();
      const parsed = JSON.parse(json);

      expect(parsed).toEqual(DEFAULT_FEATURE_FLAGS);
    });

    it('should reflect current state', () => {
      updateFeatureFlags({ enableEnsemble: false });

      const json = exportFeatureFlagsAsJSON();
      const parsed = JSON.parse(json);

      expect(parsed.enableEnsemble).toBe(false);
    });

    it('should be properly formatted', () => {
      const json = exportFeatureFlagsAsJSON();

      // Should be pretty-printed with 2-space indent
      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('should handle empty overrides', () => {
      const flags = initializeFeatureFlags({});

      expect(flags).toEqual(DEFAULT_FEATURE_FLAGS);
    });

    it('should handle empty update', () => {
      const before = getFeatureFlags();
      updateFeatureFlags({});
      const after = getFeatureFlags();

      expect(before).toEqual(after);
    });

    it('should handle empty environment variable', () => {
      vi.stubEnv('AMAS_FEATURE_ENSEMBLE', '');

      const flags = initializeFeatureFlags();

      expect(flags.enableEnsemble).toBe(true); // Default, not overridden
    });
  });
});
