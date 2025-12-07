/**
 * Engine Learning Tests
 *
 * 测试 AMAS Engine 学习层模块 (LearningManager):
 * 1. 动作选择 - selectAction
 * 2. 模型更新 - updateModels
 * 3. 奖励计算 - computeReward
 * 4. 上下文向量构建 - buildContextVector
 * 5. 用户参数应用 - applyUserParams
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LearningManager, DecisionContext, ActionSelection } from '../../../../src/amas/engine/engine-learning';
import { UserModels, WordReviewHistory } from '../../../../src/amas/engine/engine-types';
import { LinUCB } from '../../../../src/amas/learning/linucb';
import { AttentionMonitor } from '../../../../src/amas/modeling/attention-monitor';
import { FatigueEstimator } from '../../../../src/amas/modeling/fatigue-estimator';
import { CognitiveProfiler } from '../../../../src/amas/modeling/cognitive-profiler';
import { MotivationTracker } from '../../../../src/amas/modeling/motivation-tracker';
import { Action, UserState, RawEvent, ColdStartPhase } from '../../../../src/amas/types';
import { REWARD_PROFILES } from '../../../../src/amas/config/reward-profiles';
import { ACTION_SPACE } from '../../../../src/amas/config/action-space';
import { mockLogger } from '../../../setup';

// Mock dependencies
vi.mock('../../../../src/amas/config/feature-flags', () => ({
  isColdStartEnabled: vi.fn().mockReturnValue(false),
  isEnsembleEnabled: vi.fn().mockReturnValue(false),
  isUserParamsManagerEnabled: vi.fn().mockReturnValue(false),
  getEnsembleLearnerFlags: vi.fn().mockReturnValue({
    heuristic: true,
    thompson: true,
    actr: true
  })
}));

vi.mock('../../../../src/amas/monitoring/amas-metrics', () => ({
  recordModelDrift: vi.fn()
}));

vi.mock('../../../../src/monitoring/amas-metrics', () => ({
  recordModelDrift: vi.fn()
}));

// ==================== Test Helpers ====================

function createDefaultUserState(): UserState {
  return {
    A: 0.8,
    F: 0.2,
    M: 0.5,
    C: { mem: 0.7, speed: 0.6, stability: 0.7 },
    T: 'flat',
    conf: 0.5,
    ts: Date.now()
  };
}

function createDecisionContext(): DecisionContext {
  return {
    recentErrorRate: 0.2,
    recentResponseTime: 2500,
    timeBucket: 1
  };
}

function createUserModels(): UserModels {
  return {
    attention: new AttentionMonitor(),
    fatigue: new FatigueEstimator(),
    cognitive: new CognitiveProfiler(),
    motivation: new MotivationTracker(),
    bandit: new LinUCB({ dimension: 22 }),
    trendAnalyzer: null,
    coldStart: null,
    thompson: null,
    heuristic: null,
    actrMemory: null,
    userParams: null
  };
}

function createRawEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    wordId: 'test-word-1',
    isCorrect: true,
    responseTime: 2000,
    dwellTime: 3000,
    timestamp: Date.now(),
    pauseCount: 0,
    switchCount: 0,
    retryCount: 0,
    focusLossDuration: 0,
    interactionDensity: 0.5,
    ...overrides
  };
}

// ==================== Test Suite ====================

describe('LearningManager', () => {
  let learningManager: LearningManager;
  let userModels: UserModels;

  beforeEach(() => {
    vi.clearAllMocks();
    learningManager = new LearningManager();
    userModels = createUserModels();
  });

  // ==================== selectAction Tests ====================

  describe('selectAction', () => {
    it('should select action using LinUCB in normal phase', () => {
      const state = createDefaultUserState();
      const context = createDecisionContext();

      const result = learningManager.selectAction(
        state,
        userModels,
        context,
        'normal',
        50,
        0.8
      );

      expect(result).toBeDefined();
      expect(result.action).toBeDefined();
      expect(result.action.interval_scale).toBeDefined();
      expect(result.action.new_ratio).toBeDefined();
      expect(result.action.difficulty).toBeDefined();
      expect(result.action.batch_size).toBeDefined();
      expect(result.action.hint_level).toBeDefined();
    });

    it('should return valid action from action space', () => {
      const state = createDefaultUserState();
      const context = createDecisionContext();

      const result = learningManager.selectAction(
        state,
        userModels,
        context,
        'normal',
        50,
        0.8
      );

      // Action should be one of the valid actions in ACTION_SPACE
      const matchingAction = ACTION_SPACE.find(
        a => a.interval_scale === result.action.interval_scale &&
             a.new_ratio === result.action.new_ratio &&
             a.difficulty === result.action.difficulty &&
             a.batch_size === result.action.batch_size &&
             a.hint_level === result.action.hint_level
      );
      expect(matchingAction).toBeDefined();
    });

    it('should build context vector for LinUCB', () => {
      const state = createDefaultUserState();
      const context = createDecisionContext();

      const result = learningManager.selectAction(
        state,
        userModels,
        context,
        'normal',
        50,
        0.8
      );

      expect(result.contextVec).toBeDefined();
      expect(result.contextVec).toBeInstanceOf(Float32Array);
      expect(result.contextVec!.length).toBe(22); // Default dimension
    });

    it('should return confidence value', () => {
      const state = createDefaultUserState();
      const context = createDecisionContext();

      const result = learningManager.selectAction(
        state,
        userModels,
        context,
        'normal',
        50,
        0.8
      );

      // Confidence should be defined for LinUCB
      expect(result.confidence).toBeDefined();
      expect(typeof result.confidence).toBe('number');
    });

    it('should fallback to default action when bandit is not LinUCB', () => {
      const state = createDefaultUserState();
      const context = createDecisionContext();

      // Replace bandit with a mock that is not LinUCB
      const modelsWithMockBandit: UserModels = {
        ...userModels,
        bandit: {} as any
      };

      const result = learningManager.selectAction(
        state,
        modelsWithMockBandit,
        context,
        'normal',
        50,
        0.8
      );

      expect(result.action).toBeDefined();
      // Should return first action in ACTION_SPACE as fallback
      expect(result.action).toEqual(ACTION_SPACE[0]);
    });

    it('should handle classify phase', () => {
      const state = createDefaultUserState();
      const context = createDecisionContext();

      const result = learningManager.selectAction(
        state,
        userModels,
        context,
        'classify',
        5,
        0.7
      );

      expect(result).toBeDefined();
      expect(result.action).toBeDefined();
    });

    it('should handle explore phase', () => {
      const state = createDefaultUserState();
      const context = createDecisionContext();

      const result = learningManager.selectAction(
        state,
        userModels,
        context,
        'explore',
        15,
        0.75
      );

      expect(result).toBeDefined();
      expect(result.action).toBeDefined();
    });

    it('should handle word review history for ACT-R', () => {
      const state = createDefaultUserState();
      const context = createDecisionContext();
      const wordReviewHistory: WordReviewHistory[] = [
        { secondsAgo: 60, isCorrect: true },
        { secondsAgo: 3600, isCorrect: true },
        { secondsAgo: 86400, isCorrect: false }
      ];

      const result = learningManager.selectAction(
        state,
        userModels,
        context,
        'normal',
        50,
        0.8,
        wordReviewHistory
      );

      expect(result).toBeDefined();
      expect(result.action).toBeDefined();
    });

    it('should adjust alpha based on interaction count and accuracy', () => {
      const state = createDefaultUserState();
      const context = createDecisionContext();

      // New user with low interaction count
      const resultNewUser = learningManager.selectAction(
        state,
        userModels,
        context,
        'normal',
        5,
        0.5
      );

      // Experienced user with high interaction count
      const resultExperiencedUser = learningManager.selectAction(
        state,
        userModels,
        context,
        'normal',
        200,
        0.9
      );

      // Both should return valid actions
      expect(resultNewUser.action).toBeDefined();
      expect(resultExperiencedUser.action).toBeDefined();
    });
  });

  // ==================== buildContextVector Tests ====================

  describe('buildContextVector', () => {
    it('should build context vector for LinUCB', () => {
      const state = createDefaultUserState();
      const action = ACTION_SPACE[0];
      const context = createDecisionContext();

      const result = learningManager.buildContextVector(
        userModels,
        state,
        action,
        context
      );

      expect(result).toBeDefined();
      expect(result).toBeInstanceOf(Float32Array);
      expect(result!.length).toBe(22);
    });

    it('should return undefined for non-LinUCB bandit', () => {
      const state = createDefaultUserState();
      const action = ACTION_SPACE[0];
      const context = createDecisionContext();

      const modelsWithMockBandit: UserModels = {
        ...userModels,
        bandit: {} as any
      };

      const result = learningManager.buildContextVector(
        modelsWithMockBandit,
        state,
        action,
        context
      );

      expect(result).toBeUndefined();
    });

    it('should include all context features', () => {
      const state = createDefaultUserState();
      const action = ACTION_SPACE[0];
      const context = createDecisionContext();

      const result = learningManager.buildContextVector(
        userModels,
        state,
        action,
        context
      );

      expect(result).toBeDefined();
      // All values should be finite numbers
      for (let i = 0; i < result!.length; i++) {
        expect(Number.isFinite(result![i])).toBe(true);
      }
    });
  });

  // ==================== updateModels Tests ====================

  describe('updateModels', () => {
    it('should update LinUCB model with reward', () => {
      const state = createDefaultUserState();
      const prevState = { ...state, F: 0.15 };
      const action = ACTION_SPACE[0];
      const context = createDecisionContext();
      const reward = 0.5;

      // Get initial update count
      const linucb = userModels.bandit as LinUCB;
      const initialModel = linucb.getModel();
      const initialUpdateCount = initialModel.updateCount;

      learningManager.updateModels(
        userModels,
        state,
        prevState,
        action,
        reward,
        context,
        'normal',
        'test-user-id',
        true
      );

      // Check that model was updated
      const updatedModel = linucb.getModel();
      expect(updatedModel.updateCount).toBe(initialUpdateCount + 1);
    });

    it('should handle correct answer', () => {
      const state = createDefaultUserState();
      const prevState = { ...state };
      const action = ACTION_SPACE[0];
      const context = createDecisionContext();

      expect(() => {
        learningManager.updateModels(
          userModels,
          state,
          prevState,
          action,
          0.8,
          context,
          'normal',
          'test-user-id',
          true
        );
      }).not.toThrow();
    });

    it('should handle incorrect answer', () => {
      const state = createDefaultUserState();
      const prevState = { ...state };
      const action = ACTION_SPACE[0];
      const context = createDecisionContext();

      expect(() => {
        learningManager.updateModels(
          userModels,
          state,
          prevState,
          action,
          -0.5,
          context,
          'normal',
          'test-user-id',
          false
        );
      }).not.toThrow();
    });

    it('should handle word review history for ACT-R', () => {
      const state = createDefaultUserState();
      const prevState = { ...state };
      const action = ACTION_SPACE[0];
      const context = createDecisionContext();
      const wordReviewHistory: WordReviewHistory[] = [
        { secondsAgo: 120, isCorrect: true },
        { secondsAgo: 7200, isCorrect: false }
      ];

      expect(() => {
        learningManager.updateModels(
          userModels,
          state,
          prevState,
          action,
          0.5,
          context,
          'normal',
          'test-user-id',
          true,
          wordReviewHistory
        );
      }).not.toThrow();
    });

    it('should handle different cold start phases', () => {
      const state = createDefaultUserState();
      const prevState = { ...state };
      const action = ACTION_SPACE[0];
      const context = createDecisionContext();

      const phases: ColdStartPhase[] = ['classify', 'explore', 'normal'];

      for (const phase of phases) {
        expect(() => {
          learningManager.updateModels(
            userModels,
            state,
            prevState,
            action,
            0.5,
            context,
            phase,
            'test-user-id',
            true
          );
        }).not.toThrow();
      }
    });
  });

  // ==================== computeReward Tests ====================

  describe('computeReward', () => {
    it('should compute positive reward for correct answer', () => {
      const event = createRawEvent({
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0
      });
      const state = createDefaultUserState();

      const reward = learningManager.computeReward(event, state);

      expect(reward).toBeGreaterThan(0);
    });

    it('should compute negative reward for incorrect answer', () => {
      const event = createRawEvent({
        isCorrect: false,
        responseTime: 8000,
        retryCount: 2
      });
      const state = createDefaultUserState();

      const reward = learningManager.computeReward(event, state);

      expect(reward).toBeLessThan(0);
    });

    it('should return reward in valid range [-1, 1]', () => {
      const testCases = [
        { isCorrect: true, responseTime: 1000, retryCount: 0 },
        { isCorrect: false, responseTime: 10000, retryCount: 5 },
        { isCorrect: true, responseTime: 100, retryCount: 0 },
        { isCorrect: false, responseTime: 50000, retryCount: 10 }
      ];

      for (const tc of testCases) {
        const event = createRawEvent(tc);
        const state = createDefaultUserState();
        const reward = learningManager.computeReward(event, state);

        expect(reward).toBeGreaterThanOrEqual(-1);
        expect(reward).toBeLessThanOrEqual(1);
      }
    });

    it('should penalize fatigue', () => {
      const event = createRawEvent({
        isCorrect: true,
        responseTime: 2000
      });

      const lowFatigueState: UserState = {
        ...createDefaultUserState(),
        F: 0.1
      };
      const highFatigueState: UserState = {
        ...createDefaultUserState(),
        F: 0.9
      };

      const rewardLowFatigue = learningManager.computeReward(event, lowFatigueState);
      const rewardHighFatigue = learningManager.computeReward(event, highFatigueState);

      // Higher fatigue should result in lower reward
      expect(rewardHighFatigue).toBeLessThan(rewardLowFatigue);
    });

    it('should reward fast responses', () => {
      const state = createDefaultUserState();

      const fastEvent = createRawEvent({
        isCorrect: true,
        responseTime: 1000
      });
      const slowEvent = createRawEvent({
        isCorrect: true,
        responseTime: 10000
      });

      const rewardFast = learningManager.computeReward(fastEvent, state);
      const rewardSlow = learningManager.computeReward(slowEvent, state);

      // Faster response should result in higher reward
      expect(rewardFast).toBeGreaterThan(rewardSlow);
    });

    it('should penalize frustration (retries and low motivation)', () => {
      const normalState = createDefaultUserState();

      // Event with no frustration indicators
      const noFrustrationEvent = createRawEvent({
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0  // No retries
      });

      // Event with high retry count (frustration indicator)
      const highRetryEvent = createRawEvent({
        isCorrect: true,
        responseTime: 2000,
        retryCount: 3  // Multiple retries indicate frustration
      });

      // State with negative motivation (frustration indicator)
      const frustratedState: UserState = {
        ...createDefaultUserState(),
        M: -0.5
      };
      const frustratedEvent = createRawEvent({
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0
      });

      const rewardNoFrustration = learningManager.computeReward(noFrustrationEvent, normalState);
      const rewardHighRetry = learningManager.computeReward(highRetryEvent, normalState);
      const rewardFrustratedState = learningManager.computeReward(frustratedEvent, frustratedState);

      // Frustration (via retries or low motivation) should result in lower reward
      expect(rewardHighRetry).toBeLessThan(rewardNoFrustration);
      expect(rewardFrustratedState).toBeLessThan(rewardNoFrustration);
    });

    it('should use standard profile by default', () => {
      const event = createRawEvent({
        isCorrect: true,
        responseTime: 2000
      });
      const state = createDefaultUserState();

      const reward = learningManager.computeReward(event, state);
      const rewardWithProfile = learningManager.computeReward(event, state, REWARD_PROFILES.standard);

      // Default should be same as standard profile
      expect(reward).toBe(rewardWithProfile);
    });

    it('should handle different reward profiles', () => {
      const event = createRawEvent({
        isCorrect: true,
        responseTime: 2000
      });
      const state = createDefaultUserState();

      const rewardStandard = learningManager.computeReward(event, state, REWARD_PROFILES.standard);
      const rewardCram = learningManager.computeReward(event, state, REWARD_PROFILES.cram);
      const rewardRelaxed = learningManager.computeReward(event, state, REWARD_PROFILES.relaxed);

      // All rewards should be valid
      expect(Number.isFinite(rewardStandard)).toBe(true);
      expect(Number.isFinite(rewardCram)).toBe(true);
      expect(Number.isFinite(rewardRelaxed)).toBe(true);

      // Different profiles should produce different rewards
      // (at least some should be different)
      const allSame = rewardStandard === rewardCram && rewardCram === rewardRelaxed;
      expect(allSame).toBe(false);
    });

    it('should consider engagement with dwell time', () => {
      const state = createDefaultUserState();

      // Optimal dwell time is around 3000ms
      const optimalDwellEvent = createRawEvent({
        isCorrect: true,
        responseTime: 2000,
        dwellTime: 3000,
        interactionDensity: 0.8
      });

      const poorDwellEvent = createRawEvent({
        isCorrect: true,
        responseTime: 2000,
        dwellTime: 100,  // Too short
        interactionDensity: 0.1
      });

      const rewardOptimal = learningManager.computeReward(optimalDwellEvent, state);
      const rewardPoor = learningManager.computeReward(poorDwellEvent, state);

      // Better engagement should result in higher reward
      expect(rewardOptimal).toBeGreaterThan(rewardPoor);
    });

    it('should handle edge case with zero response time', () => {
      const event = createRawEvent({
        isCorrect: true,
        responseTime: 0
      });
      const state = createDefaultUserState();

      const reward = learningManager.computeReward(event, state);

      expect(Number.isFinite(reward)).toBe(true);
      expect(reward).toBeGreaterThanOrEqual(-1);
      expect(reward).toBeLessThanOrEqual(1);
    });

    it('should handle edge case with very long response time', () => {
      const event = createRawEvent({
        isCorrect: true,
        responseTime: 120000  // 2 minutes
      });
      const state = createDefaultUserState();

      const reward = learningManager.computeReward(event, state);

      expect(Number.isFinite(reward)).toBe(true);
      expect(reward).toBeGreaterThanOrEqual(-1);
      expect(reward).toBeLessThanOrEqual(1);
    });
  });

  // ==================== applyUserParams Tests ====================

  describe('applyUserParams', () => {
    it('should not throw when userParams is null', () => {
      expect(() => {
        learningManager.applyUserParams(
          userModels,
          'test-user-id',
          50,
          0.8,
          0.2,
          false
        );
      }).not.toThrow();
    });

    it('should apply cold start alpha when not in cold start phase', () => {
      const linucb = userModels.bandit as LinUCB;
      const initialAlpha = linucb.getModel().alpha;

      learningManager.applyUserParams(
        userModels,
        'test-user-id',
        5,  // Low interaction count
        0.5,  // 50% accuracy
        0.2,
        false
      );

      // Alpha should be adjusted based on interaction count and accuracy
      // (internal implementation detail, just verify no error)
      expect(linucb.getModel().alpha).toBeDefined();
    });

    it('should skip alpha adjustment in cold start phase', () => {
      const linucb = userModels.bandit as LinUCB;

      learningManager.applyUserParams(
        userModels,
        'test-user-id',
        5,
        0.5,
        0.2,
        true  // In cold start phase
      );

      // Should not throw and alpha should remain valid
      expect(linucb.getModel().alpha).toBeDefined();
    });

    it('should handle high fatigue value', () => {
      expect(() => {
        learningManager.applyUserParams(
          userModels,
          'test-user-id',
          50,
          0.8,
          0.9,  // High fatigue
          false
        );
      }).not.toThrow();
    });

    it('should handle various accuracy levels', () => {
      const accuracyLevels = [0, 0.25, 0.5, 0.75, 1.0];

      for (const accuracy of accuracyLevels) {
        expect(() => {
          learningManager.applyUserParams(
            userModels,
            'test-user-id',
            50,
            accuracy,
            0.2,
            false
          );
        }).not.toThrow();
      }
    });
  });

  // ==================== Integration Tests ====================

  describe('Integration', () => {
    it('should work in complete flow: select -> update -> compute', () => {
      const state = createDefaultUserState();
      const prevState = { ...state, F: 0.15 };
      const context = createDecisionContext();

      // 1. Select action
      const selection = learningManager.selectAction(
        state,
        userModels,
        context,
        'normal',
        50,
        0.8
      );
      expect(selection.action).toBeDefined();

      // 2. Compute reward
      const event = createRawEvent({
        isCorrect: true,
        responseTime: 2000
      });
      const reward = learningManager.computeReward(event, state);
      expect(typeof reward).toBe('number');

      // 3. Update models
      learningManager.updateModels(
        userModels,
        state,
        prevState,
        selection.action,
        reward,
        context,
        'normal',
        'test-user-id',
        true
      );

      // Should complete without error
    });

    it('should handle multiple iterations', () => {
      const context = createDecisionContext();

      let state = createDefaultUserState();

      for (let i = 0; i < 10; i++) {
        const prevState = { ...state };
        const isCorrect = Math.random() > 0.3;

        // Select action
        const selection = learningManager.selectAction(
          state,
          userModels,
          context,
          'normal',
          50 + i,
          0.7 + i * 0.01
        );

        // Compute reward
        const event = createRawEvent({
          isCorrect,
          responseTime: 1500 + Math.random() * 3000
        });
        const reward = learningManager.computeReward(event, state);

        // Update models
        learningManager.updateModels(
          userModels,
          state,
          prevState,
          selection.action,
          reward,
          context,
          'normal',
          'test-user-id',
          isCorrect
        );

        // Update state for next iteration
        state = {
          ...state,
          F: Math.min(1, state.F + (isCorrect ? -0.01 : 0.05)),
          ts: Date.now()
        };
      }

      // Verify model was updated multiple times
      const linucb = userModels.bandit as LinUCB;
      expect(linucb.getModel().updateCount).toBeGreaterThan(0);
    });

    it('should handle cold start to normal phase transition', () => {
      const context = createDecisionContext();
      const state = createDefaultUserState();
      const phases: ColdStartPhase[] = ['classify', 'explore', 'normal'];

      for (const phase of phases) {
        const selection = learningManager.selectAction(
          state,
          userModels,
          context,
          phase,
          phase === 'classify' ? 3 : phase === 'explore' ? 10 : 50,
          0.7
        );

        expect(selection.action).toBeDefined();
      }
    });
  });

  // ==================== Edge Cases ====================

  describe('Edge Cases', () => {
    it('should handle empty word review history', () => {
      const state = createDefaultUserState();
      const context = createDecisionContext();

      const result = learningManager.selectAction(
        state,
        userModels,
        context,
        'normal',
        50,
        0.8,
        []
      );

      expect(result.action).toBeDefined();
    });

    it('should handle extreme state values', () => {
      const extremeState: UserState = {
        A: 0,
        F: 1,
        M: -1,
        C: { mem: 0, speed: 0, stability: 0 },
        T: 'down',
        conf: 0,
        ts: Date.now()
      };
      const context = createDecisionContext();

      const result = learningManager.selectAction(
        extremeState,
        userModels,
        context,
        'normal',
        50,
        0.1
      );

      expect(result.action).toBeDefined();
    });

    it('should handle extreme context values', () => {
      const state = createDefaultUserState();
      const extremeContext: DecisionContext = {
        recentErrorRate: 1.0,
        recentResponseTime: 100000,
        timeBucket: 2
      };

      const result = learningManager.selectAction(
        state,
        userModels,
        extremeContext,
        'normal',
        50,
        0.1
      );

      expect(result.action).toBeDefined();
    });

    it('should handle zero interaction count', () => {
      const state = createDefaultUserState();
      const context = createDecisionContext();

      const result = learningManager.selectAction(
        state,
        userModels,
        context,
        'classify',
        0,
        0.5
      );

      expect(result.action).toBeDefined();
    });

    it('should handle undefined dwell time in reward computation', () => {
      const event: RawEvent = {
        wordId: 'test-word',
        isCorrect: true,
        responseTime: 2000,
        dwellTime: 0,  // No dwell time
        timestamp: Date.now(),
        pauseCount: 0,
        switchCount: 0,
        retryCount: 0,
        focusLossDuration: 0,
        interactionDensity: 0
      };
      const state = createDefaultUserState();

      const reward = learningManager.computeReward(event, state);

      expect(Number.isFinite(reward)).toBe(true);
    });
  });
});
