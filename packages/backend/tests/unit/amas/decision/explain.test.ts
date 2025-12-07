/**
 * AMAS Decision Layer - Explainability Engine Unit Tests
 *
 * Tests for the explainability/explanation generation functions
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  generateExplanation,
  generateDetailedExplanation,
  generateShortExplanation,
  generateSuggestion,
  generateEnhancedExplanation,
  FactorContribution,
  EnhancedExplanation
} from '../../../../src/amas/decision/explain';
import { UserState, StrategyParams, Action } from '../../../../src/amas/types';
import {
  MIN_ATTENTION,
  HIGH_FATIGUE,
  LOW_MOTIVATION
} from '../../../../src/amas/config/action-space';

describe('ExplainabilityEngine', () => {
  // ==================== Test Fixtures ====================

  const defaultUserState: UserState = {
    A: 0.8,
    F: 0.2,
    M: 0.5,
    C: { mem: 0.7, speed: 0.6, stability: 0.7 },
    conf: 0.8,
    ts: Date.now()
  };

  const lowAttentionState: UserState = {
    A: 0.2, // Below MIN_ATTENTION (0.3)
    F: 0.3,
    M: 0.3,
    C: { mem: 0.6, speed: 0.5, stability: 0.6 },
    conf: 0.6,
    ts: Date.now()
  };

  const highFatigueState: UserState = {
    A: 0.6,
    F: 0.8, // Above HIGH_FATIGUE (0.6)
    M: 0.3,
    C: { mem: 0.5, speed: 0.4, stability: 0.5 },
    conf: 0.5,
    ts: Date.now()
  };

  const lowMotivationState: UserState = {
    A: 0.6,
    F: 0.4,
    M: -0.5, // Below LOW_MOTIVATION (-0.3)
    C: { mem: 0.6, speed: 0.5, stability: 0.6 },
    conf: 0.6,
    ts: Date.now()
  };

  const lowMemoryState: UserState = {
    A: 0.7,
    F: 0.3,
    M: 0.4,
    C: { mem: 0.4, speed: 0.5, stability: 0.3 }, // mem < 0.6, stability < 0.5
    conf: 0.6,
    ts: Date.now()
  };

  const defaultOldParams: StrategyParams = {
    interval_scale: 1.0,
    new_ratio: 0.3,
    difficulty: 'mid',
    batch_size: 10,
    hint_level: 1
  };

  const defaultNewParams: StrategyParams = {
    interval_scale: 1.0,
    new_ratio: 0.3,
    difficulty: 'mid',
    batch_size: 10,
    hint_level: 1
  };

  // ==================== generateExplanation Tests ====================

  describe('generateExplanation', () => {
    it('should return default message when state is good and no changes', () => {
      const result = generateExplanation(defaultUserState, defaultOldParams, defaultNewParams);
      expect(result).toBe('当前状态良好，维持现有策略。');
    });

    it('should identify low attention contribution', () => {
      const result = generateExplanation(lowAttentionState, defaultOldParams, defaultNewParams);
      expect(result).toContain('注意力');
    });

    it('should identify high fatigue contribution', () => {
      const result = generateExplanation(highFatigueState, defaultOldParams, defaultNewParams);
      expect(result).toContain('疲劳度');
    });

    it('should identify low motivation contribution', () => {
      const result = generateExplanation(lowMotivationState, defaultOldParams, defaultNewParams);
      expect(result).toContain('动机');
    });

    it('should identify low memory contribution', () => {
      const result = generateExplanation(lowMemoryState, defaultOldParams, defaultNewParams);
      expect(result).toContain('记忆力');
    });

    it('should identify low stability contribution', () => {
      const result = generateExplanation(lowMemoryState, defaultOldParams, defaultNewParams);
      expect(result).toContain('稳定性');
    });

    it('should describe new_ratio decrease', () => {
      const newParams: StrategyParams = { ...defaultOldParams, new_ratio: 0.1 };
      const result = generateExplanation(defaultUserState, defaultOldParams, newParams);
      expect(result).toContain('新词比例');
      expect(result).toContain('降至');
    });

    it('should describe new_ratio increase', () => {
      const newParams: StrategyParams = { ...defaultOldParams, new_ratio: 0.5 };
      const result = generateExplanation(defaultUserState, defaultOldParams, newParams);
      expect(result).toContain('新词比例');
      expect(result).toContain('升至');
    });

    it('should describe batch_size decrease', () => {
      const newParams: StrategyParams = { ...defaultOldParams, batch_size: 5 };
      const result = generateExplanation(defaultUserState, defaultOldParams, newParams);
      expect(result).toContain('批量');
      expect(result).toContain('降至');
    });

    it('should describe batch_size increase', () => {
      const newParams: StrategyParams = { ...defaultOldParams, batch_size: 15 };
      const result = generateExplanation(defaultUserState, defaultOldParams, newParams);
      expect(result).toContain('批量');
      expect(result).toContain('提升至');
    });

    it('should describe hint_level increase', () => {
      const newParams: StrategyParams = { ...defaultOldParams, hint_level: 2 };
      const result = generateExplanation(defaultUserState, defaultOldParams, newParams);
      expect(result).toContain('增加提示');
    });

    it('should describe hint_level decrease', () => {
      const newParams: StrategyParams = { ...defaultOldParams, hint_level: 0 };
      const result = generateExplanation(defaultUserState, defaultOldParams, newParams);
      expect(result).toContain('降低提示');
    });

    it('should describe interval_scale increase (>5% delta)', () => {
      const newParams: StrategyParams = { ...defaultOldParams, interval_scale: 1.2 };
      const result = generateExplanation(defaultUserState, defaultOldParams, newParams);
      expect(result).toContain('复习间隔延长');
    });

    it('should describe interval_scale decrease (>5% delta)', () => {
      const newParams: StrategyParams = { ...defaultOldParams, interval_scale: 0.8 };
      const result = generateExplanation(defaultUserState, defaultOldParams, newParams);
      expect(result).toContain('复习间隔缩短');
    });

    it('should not describe interval_scale change when delta <= 5%', () => {
      const newParams: StrategyParams = { ...defaultOldParams, interval_scale: 1.04 };
      const result = generateExplanation(defaultUserState, defaultOldParams, newParams);
      expect(result).not.toContain('复习间隔');
    });

    it('should describe difficulty change', () => {
      const newParams: StrategyParams = { ...defaultOldParams, difficulty: 'easy' };
      const result = generateExplanation(defaultUserState, defaultOldParams, newParams);
      expect(result).toContain('难度调整为简单');
    });

    it('should describe difficulty change to hard', () => {
      const newParams: StrategyParams = { ...defaultOldParams, difficulty: 'hard' };
      const result = generateExplanation(defaultUserState, defaultOldParams, newParams);
      expect(result).toContain('难度调整为困难');
    });

    it('should handle combined state issues and strategy changes', () => {
      const newParams: StrategyParams = {
        interval_scale: 0.8,
        new_ratio: 0.1,
        difficulty: 'easy',
        batch_size: 5,
        hint_level: 2
      };
      const result = generateExplanation(lowAttentionState, defaultOldParams, newParams);
      expect(result).toContain('检测到');
      expect(result).toContain('已');
    });
  });

  // ==================== generateDetailedExplanation Tests ====================

  describe('generateDetailedExplanation', () => {
    it('should return DecisionExplanation with factors, changes, and text', () => {
      const result = generateDetailedExplanation(lowAttentionState, defaultOldParams, defaultNewParams);

      expect(result).toHaveProperty('factors');
      expect(result).toHaveProperty('changes');
      expect(result).toHaveProperty('text');
    });

    it('should include attention factor when low', () => {
      const result = generateDetailedExplanation(lowAttentionState, defaultOldParams, defaultNewParams);

      const attentionFactor = result.factors.find(f => f.name === '注意力');
      expect(attentionFactor).toBeDefined();
      expect(attentionFactor?.value).toBe(lowAttentionState.A);
    });

    it('should include fatigue factor when high', () => {
      const result = generateDetailedExplanation(highFatigueState, defaultOldParams, defaultNewParams);

      const fatigueFactor = result.factors.find(f => f.name === '疲劳度');
      expect(fatigueFactor).toBeDefined();
      expect(fatigueFactor?.value).toBe(highFatigueState.F);
    });

    it('should include motivation factor when low', () => {
      const result = generateDetailedExplanation(lowMotivationState, defaultOldParams, defaultNewParams);

      const motivationFactor = result.factors.find(f => f.name === '动机');
      expect(motivationFactor).toBeDefined();
      expect(motivationFactor?.value).toBe(lowMotivationState.M);
    });

    it('should include changes list when params changed', () => {
      const newParams: StrategyParams = { ...defaultOldParams, batch_size: 5, difficulty: 'easy' };
      const result = generateDetailedExplanation(defaultUserState, defaultOldParams, newParams);

      expect(result.changes.length).toBeGreaterThan(0);
    });

    it('should return empty changes when no params changed', () => {
      const result = generateDetailedExplanation(defaultUserState, defaultOldParams, defaultNewParams);
      expect(result.changes).toEqual([]);
    });

    it('should sort factors by percentage descending', () => {
      // Create a state with multiple issues
      const multiIssueState: UserState = {
        A: 0.2, // Low attention - high percentage
        F: 0.9, // High fatigue - high percentage
        M: -0.2, // Slightly low motivation - lower percentage
        C: { mem: 0.4, speed: 0.5, stability: 0.3 },
        conf: 0.5,
        ts: Date.now()
      };

      const result = generateDetailedExplanation(multiIssueState, defaultOldParams, defaultNewParams);

      // Factors should be sorted by percentage (descending)
      for (let i = 0; i < result.factors.length - 1; i++) {
        expect(result.factors[i].percentage).toBeGreaterThanOrEqual(result.factors[i + 1].percentage);
      }
    });
  });

  // ==================== generateShortExplanation Tests ====================

  describe('generateShortExplanation', () => {
    it('should return "状态良好" for good state', () => {
      const result = generateShortExplanation(defaultUserState);
      expect(result).toBe('状态良好');
    });

    it('should return "注意力低" for low attention', () => {
      const result = generateShortExplanation(lowAttentionState);
      expect(result).toContain('注意力低');
    });

    it('should return "疲劳度高" for high fatigue', () => {
      const result = generateShortExplanation(highFatigueState);
      expect(result).toContain('疲劳度高');
    });

    it('should return "动机不足" for low motivation', () => {
      const result = generateShortExplanation(lowMotivationState);
      expect(result).toContain('动机不足');
    });

    it('should combine multiple issues with "、"', () => {
      const criticalState: UserState = {
        A: 0.2,
        F: 0.8,
        M: -0.5,
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        conf: 0.4,
        ts: Date.now()
      };
      const result = generateShortExplanation(criticalState);
      expect(result).toContain('、');
      expect(result).toContain('注意力低');
      expect(result).toContain('疲劳度高');
      expect(result).toContain('动机不足');
    });
  });

  // ==================== generateSuggestion Tests ====================

  describe('generateSuggestion', () => {
    it('should return null for good state', () => {
      const result = generateSuggestion(defaultUserState);
      expect(result).toBeNull();
    });

    it('should suggest rest for high fatigue', () => {
      const result = generateSuggestion(highFatigueState);
      expect(result).toContain('休息');
    });

    it('should suggest reduced difficulty for low motivation', () => {
      const result = generateSuggestion(lowMotivationState);
      expect(result).toContain('难度');
    });

    it('should suggest reduced content for low attention', () => {
      const result = generateSuggestion(lowAttentionState);
      expect(result).toContain('减少内容');
    });

    it('should prioritize high fatigue over other issues', () => {
      const criticalState: UserState = {
        A: 0.2,
        F: 0.8, // High fatigue takes priority
        M: -0.5,
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        conf: 0.4,
        ts: Date.now()
      };
      const result = generateSuggestion(criticalState);
      expect(result).toContain('休息');
    });

    it('should prioritize low motivation over low attention', () => {
      const mixedState: UserState = {
        A: 0.2,
        F: 0.4, // Normal fatigue
        M: -0.5, // Low motivation
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        conf: 0.4,
        ts: Date.now()
      };
      const result = generateSuggestion(mixedState);
      expect(result).toContain('难度');
    });
  });

  // ==================== generateEnhancedExplanation Tests ====================

  describe('generateEnhancedExplanation', () => {
    const defaultDecisionContext = {
      algorithm: 'linucb',
      confidence: 0.75,
      phase: 'normal'
    };

    it('should return EnhancedExplanation with all required fields', () => {
      const result = generateEnhancedExplanation(
        defaultUserState,
        defaultOldParams,
        defaultNewParams,
        defaultDecisionContext
      );

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('primaryReason');
      expect(result).toHaveProperty('factorContributions');
      expect(result).toHaveProperty('algorithmInfo');
    });

    it('should include algorithm info from context', () => {
      const result = generateEnhancedExplanation(
        defaultUserState,
        defaultOldParams,
        defaultNewParams,
        defaultDecisionContext
      );

      expect(result.algorithmInfo.algorithm).toBe('linucb');
      expect(result.algorithmInfo.confidence).toBe(0.75);
      expect(result.algorithmInfo.phase).toBe('normal');
    });

    it('should use default confidence when not provided', () => {
      const result = generateEnhancedExplanation(
        defaultUserState,
        defaultOldParams,
        defaultNewParams,
        { algorithm: 'thompson' }
      );

      expect(result.algorithmInfo.confidence).toBe(0.5);
    });

    it('should include factor contributions for low attention', () => {
      const lowAttentionStateEnhanced: UserState = {
        ...defaultUserState,
        A: 0.3 // < 0.4 threshold for negative impact
      };

      const result = generateEnhancedExplanation(
        lowAttentionStateEnhanced,
        defaultOldParams,
        defaultNewParams,
        defaultDecisionContext
      );

      const attentionFactor = result.factorContributions.find(f => f.factor === '注意力');
      expect(attentionFactor).toBeDefined();
      expect(attentionFactor?.impact).toBe('negative');
    });

    it('should include factor contributions for high attention', () => {
      const highAttentionState: UserState = {
        ...defaultUserState,
        A: 0.9 // > 0.8 threshold for positive impact
      };

      const result = generateEnhancedExplanation(
        highAttentionState,
        defaultOldParams,
        defaultNewParams,
        defaultDecisionContext
      );

      const attentionFactor = result.factorContributions.find(f => f.factor === '注意力');
      expect(attentionFactor).toBeDefined();
      expect(attentionFactor?.impact).toBe('positive');
    });

    it('should include factor contributions for high fatigue', () => {
      const highFatigueStateEnhanced: UserState = {
        ...defaultUserState,
        F: 0.7 // > 0.6 threshold
      };

      const result = generateEnhancedExplanation(
        highFatigueStateEnhanced,
        defaultOldParams,
        defaultNewParams,
        defaultDecisionContext
      );

      const fatigueFactor = result.factorContributions.find(f => f.factor === '疲劳度');
      expect(fatigueFactor).toBeDefined();
      expect(fatigueFactor?.impact).toBe('negative');
    });

    it('should include factor contributions for low motivation', () => {
      const lowMotivationStateEnhanced: UserState = {
        ...defaultUserState,
        M: -0.3 // < -0.2 threshold
      };

      const result = generateEnhancedExplanation(
        lowMotivationStateEnhanced,
        defaultOldParams,
        defaultNewParams,
        defaultDecisionContext
      );

      const motivationFactor = result.factorContributions.find(f => f.factor === '学习动力');
      expect(motivationFactor).toBeDefined();
      expect(motivationFactor?.impact).toBe('negative');
    });

    it('should include factor contributions for high motivation', () => {
      const highMotivationState: UserState = {
        ...defaultUserState,
        M: 0.6 // > 0.5 threshold
      };

      const result = generateEnhancedExplanation(
        highMotivationState,
        defaultOldParams,
        defaultNewParams,
        defaultDecisionContext
      );

      const motivationFactor = result.factorContributions.find(f => f.factor === '学习动力');
      expect(motivationFactor).toBeDefined();
      expect(motivationFactor?.impact).toBe('positive');
    });

    it('should include factor contributions for low memory', () => {
      const lowMemState: UserState = {
        ...defaultUserState,
        C: { mem: 0.4, speed: 0.6, stability: 0.6 } // mem < 0.5
      };

      const result = generateEnhancedExplanation(
        lowMemState,
        defaultOldParams,
        defaultNewParams,
        defaultDecisionContext
      );

      const memFactor = result.factorContributions.find(f => f.factor === '记忆水平');
      expect(memFactor).toBeDefined();
      expect(memFactor?.impact).toBe('negative');
    });

    it('should include factor contributions for high memory', () => {
      const highMemState: UserState = {
        ...defaultUserState,
        C: { mem: 0.9, speed: 0.6, stability: 0.6 } // mem > 0.8
      };

      const result = generateEnhancedExplanation(
        highMemState,
        defaultOldParams,
        defaultNewParams,
        defaultDecisionContext
      );

      const memFactor = result.factorContributions.find(f => f.factor === '记忆水平');
      expect(memFactor).toBeDefined();
      expect(memFactor?.impact).toBe('positive');
    });

    it('should include alternative actions when provided', () => {
      const topActions: Array<{ action: Action; score: number }> = [
        { action: { interval_scale: 1.0, new_ratio: 0.2, difficulty: 'easy', batch_size: 5, hint_level: 2 }, score: 0.9 },
        { action: { interval_scale: 1.0, new_ratio: 0.3, difficulty: 'mid', batch_size: 8, hint_level: 1 }, score: 0.8 },
        { action: { interval_scale: 1.2, new_ratio: 0.4, difficulty: 'hard', batch_size: 12, hint_level: 0 }, score: 0.7 }
      ];

      const result = generateEnhancedExplanation(
        defaultUserState,
        defaultOldParams,
        defaultNewParams,
        { ...defaultDecisionContext, topActions }
      );

      expect(result.alternativeActions).toBeDefined();
      expect(result.alternativeActions?.length).toBeLessThanOrEqual(3);
    });

    it('should generate correct alternative reasons', () => {
      const topActions: Array<{ action: Action; score: number }> = [
        { action: { interval_scale: 1.0, new_ratio: 0.2, difficulty: 'easy', batch_size: 5, hint_level: 2 }, score: 0.9 },
        { action: { interval_scale: 1.0, new_ratio: 0.3, difficulty: 'hard', batch_size: 15, hint_level: 0 }, score: 0.8 }
      ];

      const result = generateEnhancedExplanation(
        defaultUserState,
        defaultOldParams,
        defaultNewParams,
        { ...defaultDecisionContext, topActions }
      );

      expect(result.alternativeActions?.[0].reason).toBe('最接近的备选方案');
      // Second alternative should have specific reasons
      expect(result.alternativeActions?.[1].reason.length).toBeGreaterThan(0);
    });

    it('should return default primary reason when no factors', () => {
      const result = generateEnhancedExplanation(
        defaultUserState,
        defaultOldParams,
        defaultNewParams,
        defaultDecisionContext
      );

      // When state is good, primary reason should indicate maintaining strategy
      expect(result.primaryReason).toBeTruthy();
    });

    it('should limit factor contributions to 5', () => {
      // Create a state that triggers many factors
      const multiIssueState: UserState = {
        A: 0.3,
        F: 0.7,
        M: -0.3,
        C: { mem: 0.4, speed: 0.5, stability: 0.5 },
        conf: 0.4,
        ts: Date.now()
      };

      const result = generateEnhancedExplanation(
        multiIssueState,
        defaultOldParams,
        defaultNewParams,
        defaultDecisionContext
      );

      expect(result.factorContributions.length).toBeLessThanOrEqual(5);
    });

    it('should sort factor contributions by percentage', () => {
      const multiIssueState: UserState = {
        A: 0.3,
        F: 0.7,
        M: -0.3,
        C: { mem: 0.4, speed: 0.5, stability: 0.5 },
        conf: 0.4,
        ts: Date.now()
      };

      const result = generateEnhancedExplanation(
        multiIssueState,
        defaultOldParams,
        defaultNewParams,
        defaultDecisionContext
      );

      for (let i = 0; i < result.factorContributions.length - 1; i++) {
        expect(result.factorContributions[i].percentage)
          .toBeGreaterThanOrEqual(result.factorContributions[i + 1].percentage);
      }
    });

    describe('time-based factors', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('should include positive time factor for morning hours (6-9)', () => {
        // Set time to 8 AM
        vi.setSystemTime(new Date('2024-01-01T08:00:00'));

        const result = generateEnhancedExplanation(
          defaultUserState,
          defaultOldParams,
          defaultNewParams,
          defaultDecisionContext
        );

        const timeFactor = result.factorContributions.find(f => f.factor === '时段');
        expect(timeFactor).toBeDefined();
        expect(timeFactor?.impact).toBe('positive');
        expect(timeFactor?.description).toContain('早晨');
      });

      it('should include negative time factor for late night hours (22-5)', () => {
        // Set time to 11 PM
        vi.setSystemTime(new Date('2024-01-01T23:00:00'));

        const result = generateEnhancedExplanation(
          defaultUserState,
          defaultOldParams,
          defaultNewParams,
          defaultDecisionContext
        );

        const timeFactor = result.factorContributions.find(f => f.factor === '时段');
        expect(timeFactor).toBeDefined();
        expect(timeFactor?.impact).toBe('negative');
        expect(timeFactor?.description).toContain('深夜');
      });

      it('should include negative time factor for early morning hours (0-5)', () => {
        // Set time to 3 AM
        vi.setSystemTime(new Date('2024-01-01T03:00:00'));

        const result = generateEnhancedExplanation(
          defaultUserState,
          defaultOldParams,
          defaultNewParams,
          defaultDecisionContext
        );

        const timeFactor = result.factorContributions.find(f => f.factor === '时段');
        expect(timeFactor).toBeDefined();
        expect(timeFactor?.impact).toBe('negative');
      });
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('should handle extreme user state values', () => {
      const extremeState: UserState = {
        A: 0,
        F: 1,
        M: -1,
        C: { mem: 0, speed: 0, stability: 0 },
        conf: 0,
        ts: Date.now()
      };

      expect(() => generateExplanation(extremeState, defaultOldParams, defaultNewParams)).not.toThrow();
      expect(() => generateDetailedExplanation(extremeState, defaultOldParams, defaultNewParams)).not.toThrow();
      expect(() => generateShortExplanation(extremeState)).not.toThrow();
      expect(() => generateSuggestion(extremeState)).not.toThrow();
    });

    it('should handle perfect user state', () => {
      const perfectState: UserState = {
        A: 1,
        F: 0,
        M: 1,
        C: { mem: 1, speed: 1, stability: 1 },
        conf: 1,
        ts: Date.now()
      };

      const explanation = generateExplanation(perfectState, defaultOldParams, defaultNewParams);
      expect(explanation).toBe('当前状态良好，维持现有策略。');

      const shortExplanation = generateShortExplanation(perfectState);
      expect(shortExplanation).toBe('状态良好');

      const suggestion = generateSuggestion(perfectState);
      expect(suggestion).toBeNull();
    });

    it('should handle boundary values correctly', () => {
      // Test exactly at thresholds
      const boundaryState: UserState = {
        A: MIN_ATTENTION, // Exactly at threshold
        F: HIGH_FATIGUE,  // Exactly at threshold
        M: LOW_MOTIVATION, // Exactly at threshold
        C: { mem: 0.6, speed: 0.5, stability: 0.5 },
        conf: 0.5,
        ts: Date.now()
      };

      const result = generateShortExplanation(boundaryState);
      // At threshold values, should not trigger warnings (> or < comparisons)
      expect(result).toBe('状态良好');
    });

    it('should handle missing stability in CognitiveProfile', () => {
      const stateWithoutStability: UserState = {
        A: 0.8,
        F: 0.2,
        M: 0.5,
        C: { mem: 0.7, speed: 0.6 } as any, // Missing stability
        conf: 0.8,
        ts: Date.now()
      };

      expect(() => generateDetailedExplanation(stateWithoutStability, defaultOldParams, defaultNewParams))
        .not.toThrow();
    });
  });
});
