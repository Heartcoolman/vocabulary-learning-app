import { describe, it, expect, beforeEach } from 'vitest';
import { LinUcbNative, Difficulty } from '../index.js';

describe('LinUCBNative', () => {
  let linucb: InstanceType<typeof LinUcbNative>;

  beforeEach(() => {
    linucb = new LinUcbNative(0.3, 1.0);
  });

  describe('Initialization (2.6.1)', () => {
    it('should initialize with correct dimensions', () => {
      const model = linucb.getModel();
      expect(model.d).toBe(22);
    });

    it('should initialize A as lambda * I', () => {
      const model = linucb.getModel();
      const d = model.d;
      for (let i = 0; i < d; i++) {
        for (let j = 0; j < d; j++) {
          const expected = i === j ? model.lambda : 0.0;
          expect(model.A[i * d + j]).toBeCloseTo(expected, 10);
        }
      }
    });

    it('should initialize b as zero vector', () => {
      const model = linucb.getModel();
      for (let i = 0; i < model.d; i++) {
        expect(model.b[i]).toBe(0);
      }
    });

    it('should initialize L as sqrt(lambda) * I', () => {
      const model = linucb.getModel();
      const sqrtLambda = Math.sqrt(model.lambda);
      const d = model.d;
      for (let i = 0; i < d; i++) {
        for (let j = 0; j < d; j++) {
          const expected = i === j ? sqrtLambda : 0.0;
          expect(model.L[i * d + j]).toBeCloseTo(expected, 10);
        }
      }
    });

    it('should accept custom alpha and lambda', () => {
      const custom = new LinUcbNative(0.5, 2.0);
      expect(custom.alpha).toBe(0.5);
      expect(custom.getModel().lambda).toBe(2.0);
    });

    it('should use default values when not provided', () => {
      const defaultLinucb = new LinUcbNative();
      expect(defaultLinucb.alpha).toBe(0.3);
      expect(defaultLinucb.getModel().lambda).toBe(1.0);
    });
  });

  describe('selectAction (2.6.2)', () => {
    const state = {
      masteryLevel: 0.5,
      recentAccuracy: 0.7,
      studyStreak: 5,
      totalInteractions: 100,
      averageResponseTime: 2000,
    };

    const actions = [
      { wordId: 'word1', difficulty: 'recognition', scheduledAt: undefined },
      { wordId: 'word2', difficulty: 'recall', scheduledAt: undefined },
      { wordId: 'word3', difficulty: 'spelling', scheduledAt: undefined },
    ];

    const context = {
      timeOfDay: 0.5,
      dayOfWeek: 3,
      sessionDuration: 1800,
      fatigueFactor: 0.2,
    };

    it('should return valid ActionSelection', () => {
      const result = linucb.selectAction(state, actions, context);

      expect(result.selectedIndex).toBeGreaterThanOrEqual(0);
      expect(result.selectedIndex).toBeLessThan(actions.length);
      expect(result.selectedAction).toBeDefined();
      expect(result.selectedAction.wordId).toBe(actions[result.selectedIndex].wordId);
      expect(typeof result.exploitation).toBe('number');
      expect(typeof result.exploration).toBe('number');
      expect(typeof result.score).toBe('number');
      expect(result.allScores.length).toBe(actions.length);
    });

    it('should select action with highest UCB score', () => {
      const result = linucb.selectAction(state, actions, context);
      const maxScore = Math.max(...result.allScores);
      expect(result.score).toBeCloseTo(maxScore, 10);
    });

    it('should handle single action', () => {
      const singleAction = [actions[0]];
      const result = linucb.selectAction(state, singleAction, context);
      expect(result.selectedIndex).toBe(0);
    });

    it('should handle all difficulty types', () => {
      const allDifficulties = [
        { wordId: 'w1', difficulty: 'recognition', scheduledAt: undefined },
        { wordId: 'w2', difficulty: 'recall', scheduledAt: undefined },
        { wordId: 'w3', difficulty: 'spelling', scheduledAt: undefined },
        { wordId: 'w4', difficulty: 'listening', scheduledAt: undefined },
        { wordId: 'w5', difficulty: 'usage', scheduledAt: undefined },
      ];

      const result = linucb.selectAction(state, allDifficulties, context);
      expect(result.allScores.length).toBe(5);
    });
  });

  describe('update (2.6.3)', () => {
    const state = {
      masteryLevel: 0.5,
      recentAccuracy: 0.7,
      studyStreak: 5,
      totalInteractions: 100,
      averageResponseTime: 2000,
    };

    const action = { wordId: 'word1', difficulty: 'recall', scheduledAt: undefined };
    const context = { timeOfDay: 0.5, dayOfWeek: 3, sessionDuration: 1800, fatigueFactor: 0.2 };

    it('should increment updateCount after update', () => {
      expect(linucb.updateCount).toBe(0);
      linucb.update(state, action, 1.0, context);
      expect(linucb.updateCount).toBe(1);
    });

    it('should modify A matrix after update', () => {
      const before = linucb.getModel().A.slice();
      linucb.update(state, action, 1.0, context);
      const after = linucb.getModel().A;

      // A should change (A += x * x^T)
      let changed = false;
      for (let i = 0; i < before.length; i++) {
        if (Math.abs(before[i] - after[i]) > 1e-10) {
          changed = true;
          break;
        }
      }
      expect(changed).toBe(true);
    });

    it('should modify b vector after update', () => {
      const before = linucb.getModel().b.slice();
      linucb.update(state, action, 1.0, context);
      const after = linucb.getModel().b;

      // b should change (b += r * x)
      let changed = false;
      for (let i = 0; i < before.length; i++) {
        if (Math.abs(before[i] - after[i]) > 1e-10) {
          changed = true;
          break;
        }
      }
      expect(changed).toBe(true);
    });

    it('should handle batch updates', () => {
      const featureVecs = [
        new Array(22).fill(0.1),
        new Array(22).fill(0.2),
        new Array(22).fill(0.3),
      ];
      const rewards = [0.8, 0.9, 0.7];

      const count = linucb.updateBatch(featureVecs, rewards);
      expect(count).toBe(3);
      expect(linucb.updateCount).toBe(3);
    });

    it('should handle Float64Array update', () => {
      const featureVec = new Float64Array(22).fill(0.5);
      linucb.updateWithFloat64Array(featureVec, 0.9);
      expect(linucb.updateCount).toBe(1);
    });
  });

  describe('Numerical Stability (2.6.4)', () => {
    const state = {
      masteryLevel: 0.5,
      recentAccuracy: 0.7,
      studyStreak: 5,
      totalInteractions: 100,
      averageResponseTime: 2000,
    };

    const action = { wordId: 'word1', difficulty: 'recall', scheduledAt: undefined };
    const context = { timeOfDay: 0.5, dayOfWeek: 3, sessionDuration: 1800, fatigueFactor: 0.2 };

    it('should remain healthy after 1000 updates', () => {
      for (let i = 0; i < 1000; i++) {
        linucb.update(state, action, Math.random(), context);
      }

      expect(linucb.selfTest()).toBe(true);
      const diag = linucb.diagnose();
      expect(diag.isHealthy).toBe(true);
    });

    it('should handle extreme mastery levels', () => {
      const extremeState = { ...state, masteryLevel: 0.0001 };
      linucb.update(extremeState, action, 1.0, context);
      expect(linucb.selfTest()).toBe(true);

      const extremeState2 = { ...state, masteryLevel: 0.9999 };
      linucb.update(extremeState2, action, 1.0, context);
      expect(linucb.selfTest()).toBe(true);
    });

    it('should handle zero reward', () => {
      linucb.update(state, action, 0.0, context);
      expect(linucb.selfTest()).toBe(true);
    });

    it('should handle negative reward', () => {
      linucb.update(state, action, -1.0, context);
      expect(linucb.selfTest()).toBe(true);
    });

    it('should maintain model health with varying inputs', () => {
      for (let i = 0; i < 100; i++) {
        const varState = {
          masteryLevel: Math.random(),
          recentAccuracy: Math.random(),
          studyStreak: Math.floor(Math.random() * 30),
          totalInteractions: Math.floor(Math.random() * 1000),
          averageResponseTime: Math.random() * 10000,
        };

        const difficulties = ['recognition', 'recall', 'spelling', 'listening', 'usage'];
        const varAction = {
          wordId: `word${i}`,
          difficulty: difficulties[Math.floor(Math.random() * 5)],
          scheduledAt: undefined,
        };

        const varContext = {
          timeOfDay: Math.random(),
          dayOfWeek: Math.floor(Math.random() * 7),
          sessionDuration: Math.random() * 7200,
          fatigueFactor: Math.random(),
        };

        linucb.update(varState, varAction, Math.random() * 2 - 1, varContext);
      }

      expect(linucb.selfTest()).toBe(true);
    });
  });

  describe('Model Management', () => {
    it('should get and set model correctly', () => {
      const state = {
        masteryLevel: 0.5,
        recentAccuracy: 0.7,
        studyStreak: 5,
        totalInteractions: 100,
        averageResponseTime: 2000,
      };
      const action = { wordId: 'word1', difficulty: 'recall', scheduledAt: undefined };
      const context = { timeOfDay: 0.5, dayOfWeek: 3, sessionDuration: 1800, fatigueFactor: 0.2 };

      // Update original
      linucb.update(state, action, 1.0, context);
      const model = linucb.getModel();

      // Create new instance and set model
      const newLinucb = new LinUcbNative();
      newLinucb.setModel(model);

      const newModel = newLinucb.getModel();
      expect(newModel.updateCount).toBe(model.updateCount);
      expect(newModel.alpha).toBe(model.alpha);
    });

    it('should reset correctly', () => {
      linucb.update(
        {
          masteryLevel: 0.5,
          recentAccuracy: 0.7,
          studyStreak: 5,
          totalInteractions: 100,
          averageResponseTime: 2000,
        },
        { wordId: 'w1', difficulty: 'recall', scheduledAt: undefined },
        1.0,
        { timeOfDay: 0.5, dayOfWeek: 3, sessionDuration: 1800, fatigueFactor: 0.2 },
      );

      expect(linucb.updateCount).toBe(1);

      linucb.reset();

      expect(linucb.updateCount).toBe(0);
      const model = linucb.getModel();
      for (const val of model.b) {
        expect(val).toBe(0);
      }
    });
  });

  describe('Cold Start Alpha', () => {
    it('should return higher alpha for fewer interactions', () => {
      const alpha5 = LinUcbNative.getColdStartAlpha(5, 0.6, 0.1);
      const alpha50 = LinUcbNative.getColdStartAlpha(50, 0.6, 0.1);
      const alpha500 = LinUcbNative.getColdStartAlpha(500, 0.6, 0.1);

      expect(alpha5).toBeGreaterThan(alpha50);
      expect(alpha50).toBeGreaterThan(alpha500);
    });

    it('should increase alpha for extreme accuracy', () => {
      const alphaLow = LinUcbNative.getColdStartAlpha(100, 0.2, 0.1);
      const alphaMid = LinUcbNative.getColdStartAlpha(100, 0.6, 0.1);
      const alphaHigh = LinUcbNative.getColdStartAlpha(100, 0.95, 0.1);

      expect(alphaLow).toBeGreaterThan(alphaMid);
      expect(alphaHigh).toBeGreaterThan(alphaMid);
    });

    it('should decrease alpha with fatigue', () => {
      const alphaNoFatigue = LinUcbNative.getColdStartAlpha(100, 0.6, 0.0);
      const alphaHighFatigue = LinUcbNative.getColdStartAlpha(100, 0.6, 0.8);

      expect(alphaNoFatigue).toBeGreaterThan(alphaHighFatigue);
    });
  });
});
