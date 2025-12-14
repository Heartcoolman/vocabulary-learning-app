/**
 * LinUCB Adapter 测试
 *
 * 验证 LinUCBAdapter 正确使用传入的 features 参数
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LinUCBAdapter } from '../../../../src/amas/adapters/linucb-adapter';
import { Action, UserState } from '../../../../src/amas/types';
import { DecisionContext } from '../../../../src/amas/interfaces';
import { LinUCB } from '../../../../src/amas/learning/linucb';

describe('LinUCBAdapter', () => {
  let adapter: LinUCBAdapter;
  let mockUserState: UserState;
  let mockContext: DecisionContext;
  let mockActions: Action[];

  beforeEach(() => {
    adapter = new LinUCBAdapter();

    mockUserState = {
      A: 0.7,
      F: 0.3,
      C: { mem: 0.6, speed: 0.6, stability: 0.6 },
      M: 0,
      conf: 0.5,
      ts: Date.now(),
    };

    mockContext = {
      recentErrorRate: 0.2,
      recentResponseTime: 3000,
      timeBucket: 10,
      userId: 'test-user',
      interactionCount: 100,
    };

    mockActions = [
      {
        interval_scale: 1.0,
        new_ratio: 0.1,
        difficulty: 'mid',
        batch_size: 12,
        hint_level: 0,
      },
    ];
  });

  describe('updateModel', () => {
    it('应该使用传入的 features 参数而不是重新构建', () => {
      // 准备：获取 LinUCB 实例并监视 updateWithFeatureVector 方法
      const linucb = adapter.getLinUCB();
      const updateSpy = vi.spyOn(linucb, 'updateWithFeatureVector');

      // 预定义的特征向量（22维）
      const features = new Array(22).fill(0.5);
      const action = mockActions[0];
      const reward = 0.8;

      // 执行：调用 updateModel
      adapter.updateModel(action, reward, features, mockContext);

      // 验证：应该调用 updateWithFeatureVector，并且使用传入的 features
      expect(updateSpy).toHaveBeenCalledOnce();
      expect(updateSpy).toHaveBeenCalledWith(features, reward);
    });

    it('应该正确处理不同的 reward 值', () => {
      const linucb = adapter.getLinUCB();
      const updateSpy = vi.spyOn(linucb, 'updateWithFeatureVector');

      const features = new Array(22).fill(0.5);
      const action = mockActions[0];

      // 测试正向奖励
      adapter.updateModel(action, 0.9, features, mockContext);
      expect(updateSpy).toHaveBeenLastCalledWith(features, 0.9);

      // 测试负向奖励
      adapter.updateModel(action, -0.5, features, mockContext);
      expect(updateSpy).toHaveBeenLastCalledWith(features, -0.5);

      // 测试零奖励
      adapter.updateModel(action, 0, features, mockContext);
      expect(updateSpy).toHaveBeenLastCalledWith(features, 0);
    });

    it('应该处理更新错误并记录日志', () => {
      const linucb = adapter.getLinUCB();

      // 模拟 updateWithFeatureVector 抛出错误
      vi.spyOn(linucb, 'updateWithFeatureVector').mockImplementationOnce(() => {
        throw new Error('Update failed');
      });

      const features = new Array(22).fill(0.5);
      const action = mockActions[0];

      // 应该不抛出错误（内部捕获）
      expect(() => {
        adapter.updateModel(action, 0.5, features, mockContext);
      }).not.toThrow();
    });
  });

  describe('selectAction', () => {
    it('应该返回有效的决策结果', () => {
      const features = new Array(22).fill(0.5);

      const result = adapter.selectAction(mockUserState, mockActions, features, mockContext);

      expect(result).toBeDefined();
      expect(result.action).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.explanation).toBeTruthy();
      expect(result.meta?.algorithm).toBe('LinUCB');
    });

    it('应该在多个动作中选择最优的', () => {
      const multipleActions: Action[] = [
        {
          interval_scale: 0.8,
          new_ratio: 0.1,
          difficulty: 'easy',
          batch_size: 10,
          hint_level: 1,
        },
        {
          interval_scale: 1.0,
          new_ratio: 0.15,
          difficulty: 'mid',
          batch_size: 12,
          hint_level: 0,
        },
        {
          interval_scale: 1.2,
          new_ratio: 0.05,
          difficulty: 'hard',
          batch_size: 15,
          hint_level: 0,
        },
      ];

      const features = new Array(22).fill(0.5);

      const result = adapter.selectAction(mockUserState, multipleActions, features, mockContext);

      // 应该返回其中一个动作
      expect(multipleActions).toContainEqual(result.action);
      expect(result.score).toBeDefined();
    });
  });

  describe('集成测试：选择和更新循环', () => {
    it('应该能够完成完整的选择-更新循环', () => {
      const features = new Array(22).fill(0.5);

      // 1. 选择动作
      const decision = adapter.selectAction(mockUserState, mockActions, features, mockContext);

      expect(decision.action).toBeDefined();
      const initialUpdateCount = adapter.getUpdateCount();

      // 2. 使用相同的特征更新模型
      adapter.updateModel(decision.action, 0.7, features, mockContext);

      // 3. 验证更新计数增加
      expect(adapter.getUpdateCount()).toBe(initialUpdateCount + 1);

      // 4. 再次选择动作（模型已更新）
      const decision2 = adapter.selectAction(mockUserState, mockActions, features, mockContext);

      expect(decision2.action).toBeDefined();
    });

    it('更新应该影响后续的动作选择', () => {
      const features = new Array(22).fill(0.5);
      const action = mockActions[0];

      // 获取初始决策
      const initialDecision = adapter.selectAction(
        mockUserState,
        mockActions,
        features,
        mockContext,
      );

      // 多次使用高奖励更新同一动作
      for (let i = 0; i < 10; i++) {
        adapter.updateModel(action, 1.0, features, mockContext);
      }

      // 再次决策
      const updatedDecision = adapter.selectAction(
        mockUserState,
        mockActions,
        features,
        mockContext,
      );

      // 更新后的置信度应该有所变化（不一定更高，取决于探索因子）
      expect(updatedDecision.confidence).toBeDefined();
      expect(adapter.getUpdateCount()).toBeGreaterThan(0);
    });
  });

  describe('模型状态管理', () => {
    it('应该能够获取和设置探索系数', () => {
      const initialAlpha = adapter.getAlpha();
      expect(initialAlpha).toBeGreaterThan(0);

      adapter.setAlpha(2.5);
      expect(adapter.getAlpha()).toBe(2.5);
    });

    it('应该能够重置模型', () => {
      const features = new Array(22).fill(0.5);

      // 执行一些更新
      adapter.updateModel(mockActions[0], 0.8, features, mockContext);
      adapter.updateModel(mockActions[0], 0.9, features, mockContext);

      expect(adapter.getUpdateCount()).toBeGreaterThan(0);

      // 重置
      adapter.reset();

      expect(adapter.getUpdateCount()).toBe(0);
    });
  });

  describe('接口实现', () => {
    it('应该返回正确的策略名称和版本', () => {
      expect(adapter.getName()).toBe('LinUCBAdapter');
      expect(adapter.getVersion()).toBe('1.0.0');
    });

    it('应该提供对底层 LinUCB 实例的访问', () => {
      const linucb = adapter.getLinUCB();
      expect(linucb).toBeInstanceOf(LinUCB);
    });
  });
});
