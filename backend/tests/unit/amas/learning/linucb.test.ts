/**
 * LinUCB Algorithm Unit Tests
 * 测试LinUCB在线学习算法的核心功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LinUCB } from '../../../../src/amas/learning/linucb';
import { UserState, Action } from '../../../../src/amas/types';
import { ACTION_SPACE, DEFAULT_DIMENSION } from '../../../../src/amas/config/action-space';

describe('LinUCB Algorithm', () => {
  let linucb: LinUCB;

  const mockState: UserState = {
    A: 0.7,
    F: 0.3,
    C: { mem: 0.6, speed: 0.7, stability: 0.65 },
    M: 0.1,
    conf: 0.8,
    ts: Date.now()
  };

  const mockContext = {
    recentErrorRate: 0.2,
    recentResponseTime: 3000,
    timeBucket: 1
  };

  function buildContextInput(state: UserState, action: Action): any {
    return {
      state,
      action,
      recentErrorRate: mockContext.recentErrorRate,
      recentResponseTime: mockContext.recentResponseTime,
      timeBucket: mockContext.timeBucket
    };
  }

  beforeEach(() => {
    linucb = new LinUCB();
  });

  describe('Initialization', () => {
    it('should initialize with correct model dimensions', () => {
      const model = linucb.getModel();
      expect(model.d).toBe(DEFAULT_DIMENSION);
      expect(model.A.length).toBe(DEFAULT_DIMENSION * DEFAULT_DIMENSION);
      expect(model.b.length).toBe(DEFAULT_DIMENSION);
      expect(model.L.length).toBe(DEFAULT_DIMENSION * DEFAULT_DIMENSION);
    });

    it('should initialize A as identity matrix', () => {
      const model = linucb.getModel();
      for (let i = 0; i < DEFAULT_DIMENSION; i++) {
        for (let j = 0; j < DEFAULT_DIMENSION; j++) {
          const idx = i * DEFAULT_DIMENSION + j;
          if (i === j) {
            expect(model.A[idx]).toBe(1.0);
          } else {
            expect(model.A[idx]).toBe(0.0);
          }
        }
      }
    });

    it('should initialize b as zero vector', () => {
      const model = linucb.getModel();
      for (let i = 0; i < DEFAULT_DIMENSION; i++) {
        expect(model.b[i]).toBe(0.0);
      }
    });

    it('should initialize update count to zero', () => {
      const model = linucb.getModel();
      expect(model.updateCount).toBe(0);
    });
  });

  describe('Context Vector Building', () => {
    it('should build correct feature vector with action features', () => {
      const action: Action = ACTION_SPACE[0];
      const context = linucb.buildContextVector(buildContextInput(mockState, action));

      expect(context.length).toBe(DEFAULT_DIMENSION);

      // 检查状态特征 (6维)
      expect(context[0]).toBeCloseTo(mockState.A, 5);
      expect(context[1]).toBeCloseTo(mockState.F, 5);
      expect(context[2]).toBeCloseTo(mockState.C.mem, 5);
      expect(context[3]).toBeCloseTo(mockState.C.speed, 5);
      expect(context[4]).toBeCloseTo(mockState.M, 5);
      expect(context[5]).toBeCloseTo(mockContext.recentErrorRate, 5);

      // 检查动作特征 (2维) - 关键修复
      expect(context[6]).toBeCloseTo(action.interval_scale, 5);
      expect(context[7]).toBeCloseTo(action.new_ratio, 5);

      // 检查偏置项
      expect(context[DEFAULT_DIMENSION - 1]).toBe(1.0);
    });

    it('should produce different vectors for different actions', () => {
      const action1 = ACTION_SPACE[0];
      const action2 = ACTION_SPACE[1];

      const vec1 = linucb.buildContextVector(buildContextInput(mockState, action1));
      const vec2 = linucb.buildContextVector(buildContextInput(mockState, action2));

      // 确保不同的动作产生不同的特征向量
      const hasDifference = Array.from(vec1).some((v, i) => v !== vec2[i]);
      expect(hasDifference).toBe(true);
    });

    it('should clamp state values to valid ranges', () => {
      const extremeState: UserState = {
        A: 1.5,  // > 1
        F: -0.2, // < 0
        C: { mem: 2.0, speed: -1.0, stability: 0.5 },
        M: -2.0, // < -1
        conf: 0.5,
        ts: Date.now()
      };

      const context = linucb.buildContextVector(buildContextInput(extremeState, ACTION_SPACE[0]));

      expect(context[0]).toBeGreaterThanOrEqual(0);
      expect(context[0]).toBeLessThanOrEqual(1);
      expect(context[1]).toBeGreaterThanOrEqual(0);
      expect(context[4]).toBeGreaterThanOrEqual(-1);
      expect(context[4]).toBeLessThanOrEqual(1);
    });
  });

  describe('Action Selection', () => {
    it('should select an action from action space', () => {
      const action = linucb.selectFromActionSpace(mockState, mockContext);
      expect(ACTION_SPACE).toContainEqual(action);
    });

    it('should select different actions based on state', () => {
      // 测试不同状态会影响动作选择
      const action1 = linucb.selectFromActionSpace(mockState, mockContext);

      const tiredState: UserState = {
        ...mockState,
        F: 0.8,  // 高疲劳
        A: 0.3   // 低注意力
      };
      const action2 = linucb.selectFromActionSpace(tiredState, mockContext);

      // 应该都是有效的动作
      expect(ACTION_SPACE).toContainEqual(action1);
      expect(ACTION_SPACE).toContainEqual(action2);
    });

    it('should handle cold start exploration phase', () => {
      linucb.setAlpha(2.0); // 高探索率
      const action = linucb.selectFromActionSpace(mockState, mockContext);
      expect(action).toBeDefined();
      expect(ACTION_SPACE).toContainEqual(action);
    });
  });

  describe('Model Update', () => {
    it('should update model parameters after learning', () => {
      const action = ACTION_SPACE[0];
      const reward = 0.5;

      const modelBefore = linucb.getModel();
      const updateCountBefore = modelBefore.updateCount;

      linucb.update(mockState, action, reward, mockContext);

      const modelAfter = linucb.getModel();
      expect(modelAfter.updateCount).toBe(updateCountBefore + 1);

      // A矩阵应该被更新
      const hasChanged = Array.from(modelAfter.A).some((v, i) =>
        Math.abs(v - modelBefore.A[i]) > 1e-10
      );
      expect(hasChanged).toBe(true);
    });

    it('should synchronize Cholesky decomposition after update', () => {
      const action = ACTION_SPACE[0];
      const reward = 0.5;

      linucb.update(mockState, action, reward, mockContext);

      const model = linucb.getModel();
      // L矩阵不应该全是零（应该被更新了）
      const hasNonZero = Array.from(model.L).some(v => Math.abs(v) > 1e-10);
      expect(hasNonZero).toBe(true);
    });

    it('should accumulate reward information in b vector', () => {
      const action = ACTION_SPACE[0];
      const reward = 1.0;

      const modelBefore = linucb.getModel();
      const bSumBefore = Array.from(modelBefore.b).reduce((a, b) => a + b, 0);

      linucb.update(mockState, action, reward, mockContext);

      const modelAfter = linucb.getModel();
      const bSumAfter = Array.from(modelAfter.b).reduce((a, b) => a + b, 0);

      // 正奖励应该增加b向量的值
      expect(bSumAfter).toBeGreaterThan(bSumBefore);
    });

    it('should handle multiple sequential updates', () => {
      const updates = [
        { action: ACTION_SPACE[0], reward: 0.8 },
        { action: ACTION_SPACE[1], reward: 0.5 },
        { action: ACTION_SPACE[2], reward: 0.3 },
        { action: ACTION_SPACE[0], reward: 0.9 }
      ];

      updates.forEach(({ action, reward }) => {
        linucb.update(mockState, action, reward, mockContext);
      });

      const model = linucb.getModel();
      expect(model.updateCount).toBe(updates.length);
    });
  });

  describe('Cold Start Strategy', () => {
    it('should use conservative alpha for early interactions', () => {
      const alpha = linucb.getColdStartAlpha(5, 0.5, 0.2);
      expect(alpha).toBe(0.5); // 早期使用保守策略
    });

    it('should use exploration phase alpha between 15-50 interactions', () => {
      // 好的表现应该使用高探索
      const alphaGood = linucb.getColdStartAlpha(30, 0.8, 0.2);
      expect(alphaGood).toBe(2.0);

      // 差的表现使用低探索
      const alphaPoor = linucb.getColdStartAlpha(30, 0.5, 0.2);
      expect(alphaPoor).toBe(1.0);
    });

    it('should stabilize after 50 interactions', () => {
      const alpha = linucb.getColdStartAlpha(60, 0.5, 0.2);
      expect(alpha).toBe(0.7); // 正常运行阶段
    });

    it('should trigger higher exploration for good performance', () => {
      const alphaHigh = linucb.getColdStartAlpha(20, 0.8, 0.2);
      const alphaLow = linucb.getColdStartAlpha(20, 0.5, 0.6);

      // 高正确率+低疲劳 = 高探索
      expect(alphaHigh).toBeGreaterThan(alphaLow);
    });
  });

  describe('Model Persistence', () => {
    it('should be able to save and restore model state', () => {
      // 执行一些更新
      for (let i = 0; i < 5; i++) {
        linucb.update(mockState, ACTION_SPACE[i % 3], 0.5, mockContext);
      }

      const savedModel = linucb.getModel();

      // 创建新实例并恢复
      const newLinucb = new LinUCB();
      newLinucb.setModel(savedModel);

      const restoredModel = newLinucb.getModel();

      expect(restoredModel.updateCount).toBe(savedModel.updateCount);
      expect(restoredModel.A).toEqual(savedModel.A);
      expect(restoredModel.b).toEqual(savedModel.b);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset to initial state', () => {
      // 执行更新
      linucb.update(mockState, ACTION_SPACE[0], 0.5, mockContext);

      // 重置
      linucb.reset();

      const model = linucb.getModel();
      expect(model.updateCount).toBe(0);

      // A应该恢复为单位矩阵
      for (let i = 0; i < DEFAULT_DIMENSION; i++) {
        for (let j = 0; j < DEFAULT_DIMENSION; j++) {
          const idx = i * DEFAULT_DIMENSION + j;
          if (i === j) {
            expect(model.A[idx]).toBe(1.0);
          } else {
            expect(model.A[idx]).toBe(0.0);
          }
        }
      }

      // b应该恢复为零向量
      for (let i = 0; i < DEFAULT_DIMENSION; i++) {
        expect(model.b[i]).toBe(0.0);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero reward', () => {
      const action = ACTION_SPACE[0];
      expect(() => {
        linucb.update(mockState, action, 0, mockContext);
      }).not.toThrow();
    });

    it('should handle negative reward', () => {
      const action = ACTION_SPACE[0];
      expect(() => {
        linucb.update(mockState, action, -0.5, mockContext);
      }).not.toThrow();
    });

    it('should handle extreme state values gracefully', () => {
      const extremeState: UserState = {
        A: 0,
        F: 1,
        C: { mem: 0, speed: 0, stability: 0 },
        M: -1,
        conf: 0,
        ts: Date.now()
      };

      expect(() => {
        linucb.selectFromActionSpace(extremeState, mockContext);
      }).not.toThrow();
    });
  });
});
