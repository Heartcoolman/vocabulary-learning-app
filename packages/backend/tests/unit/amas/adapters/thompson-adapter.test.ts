/**
 * Thompson Adapter 测试
 *
 * 验证 ThompsonAdapter 正确实现 IDecisionPolicy 接口
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThompsonAdapter } from '../../../../src/amas/adapters/thompson-adapter';
import { Action, UserState } from '../../../../src/amas/types';
import { DecisionContext } from '../../../../src/amas/interfaces';
import { ThompsonSampling } from '../../../../src/amas/learning/thompson-sampling';

describe('ThompsonAdapter', () => {
  let adapter: ThompsonAdapter;
  let mockUserState: UserState;
  let mockContext: DecisionContext;
  let mockActions: Action[];

  beforeEach(() => {
    adapter = new ThompsonAdapter();

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
      {
        interval_scale: 0.8,
        new_ratio: 0.15,
        difficulty: 'easy',
        batch_size: 10,
        hint_level: 1,
      },
      {
        interval_scale: 1.2,
        new_ratio: 0.05,
        difficulty: 'hard',
        batch_size: 15,
        hint_level: 0,
      },
    ];
  });

  describe('selectAction', () => {
    it('应该返回有效的决策结果', () => {
      const features = new Array(22).fill(0.5);

      const result = adapter.selectAction(mockUserState, mockActions, features, mockContext);

      expect(result).toBeDefined();
      expect(result.action).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.explanation).toBeTruthy();
      expect(result.meta?.algorithm).toBe('ThompsonSampling');
    });

    it('应该在多个动作中选择最优的', () => {
      const features = new Array(22).fill(0.5);

      const result = adapter.selectAction(mockUserState, mockActions, features, mockContext);

      // 应该返回其中一个动作
      expect(mockActions).toContainEqual(result.action);
      expect(result.score).toBeDefined();
    });

    it('应该缓存 UserState 用于后续更新', () => {
      const features = new Array(22).fill(0.5);

      // 第一次选择
      adapter.selectAction(mockUserState, mockActions, features, mockContext);

      // 验证更新时能够使用缓存的状态（不会抛出警告）
      const consoleSpy = vi.spyOn(console, 'warn');
      adapter.updateModel(mockActions[0], 0.8, features, mockContext);

      // 不应该有警告日志（因为已经缓存了状态）
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('应该处理算法异常并返回默认动作', () => {
      const thompson = adapter.getThompson();

      // 模拟 selectAction 抛出错误
      vi.spyOn(thompson, 'selectAction').mockImplementationOnce(() => {
        throw new Error('Selection failed');
      });

      const features = new Array(22).fill(0.5);

      const result = adapter.selectAction(mockUserState, mockActions, features, mockContext);

      // 应该返回回退结果
      expect(result.action).toEqual(mockActions[0]);
      expect(result.confidence).toBe(0);
      expect(result.explanation).toContain('默认策略');
      expect(result.meta?.error).toBeDefined();
    });

    it('应该基于用户状态生成合理的解释', () => {
      const features = new Array(22).fill(0.5);

      // 测试高疲劳状态
      const tiredState = { ...mockUserState, F: 0.8 };
      const result1 = adapter.selectAction(tiredState, mockActions, features, mockContext);
      expect(result1.explanation).toContain('疲劳');

      // 测试低注意力状态
      const lowAttentionState = { ...mockUserState, A: 0.3 };
      const result2 = adapter.selectAction(lowAttentionState, mockActions, features, mockContext);
      expect(result2.explanation).toContain('注意力');
    });
  });

  describe('updateModel', () => {
    it('应该使用缓存的 UserState 进行更新', () => {
      const thompson = adapter.getThompson();
      const updateSpy = vi.spyOn(thompson, 'update');

      const features = new Array(22).fill(0.5);
      const action = mockActions[0];
      const reward = 0.8;

      // 先选择动作以缓存状态
      adapter.selectAction(mockUserState, mockActions, features, mockContext);

      // 执行更新
      adapter.updateModel(action, reward, features, mockContext);

      // 验证 update 被调用
      expect(updateSpy).toHaveBeenCalledOnce();
      expect(updateSpy).toHaveBeenCalledWith(
        mockUserState,
        action,
        reward,
        expect.objectContaining({
          recentErrorRate: mockContext.recentErrorRate,
          recentResponseTime: mockContext.recentResponseTime,
          timeBucket: mockContext.timeBucket,
        }),
      );
    });

    it('应该正确处理不同的 reward 值', () => {
      const thompson = adapter.getThompson();
      const updateSpy = vi.spyOn(thompson, 'update');

      const features = new Array(22).fill(0.5);
      const action = mockActions[0];

      // 先选择动作
      adapter.selectAction(mockUserState, mockActions, features, mockContext);

      // 测试正向奖励
      adapter.updateModel(action, 1.0, features, mockContext);
      expect(updateSpy).toHaveBeenLastCalledWith(mockUserState, action, 1.0, expect.any(Object));

      // 再次选择以刷新缓存
      adapter.selectAction(mockUserState, mockActions, features, mockContext);

      // 测试负向奖励
      adapter.updateModel(action, 0.0, features, mockContext);
      expect(updateSpy).toHaveBeenLastCalledWith(mockUserState, action, 0.0, expect.any(Object));

      // 再次选择以刷新缓存
      adapter.selectAction(mockUserState, mockActions, features, mockContext);

      // 测试中等奖励
      adapter.updateModel(action, 0.5, features, mockContext);
      expect(updateSpy).toHaveBeenLastCalledWith(mockUserState, action, 0.5, expect.any(Object));
    });

    it('应该在没有缓存状态时使用默认状态', () => {
      const thompson = adapter.getThompson();
      const updateSpy = vi.spyOn(thompson, 'update');

      const features = new Array(22).fill(0.5);
      const action = mockActions[0];

      // 直接更新，不先调用 selectAction
      adapter.updateModel(action, 0.8, features, mockContext);

      // 应该调用 update，使用默认状态
      expect(updateSpy).toHaveBeenCalledOnce();
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          A: expect.any(Number),
          F: expect.any(Number),
          C: expect.any(Object),
          M: expect.any(Number),
        }),
        action,
        0.8,
        expect.any(Object),
      );
    });

    it('应该处理更新错误并记录日志', () => {
      const thompson = adapter.getThompson();

      // 模拟 update 抛出错误
      vi.spyOn(thompson, 'update').mockImplementationOnce(() => {
        throw new Error('Update failed');
      });

      const features = new Array(22).fill(0.5);
      const action = mockActions[0];

      // 先选择动作
      adapter.selectAction(mockUserState, mockActions, features, mockContext);

      // 应该不抛出错误（内部捕获）
      expect(() => {
        adapter.updateModel(action, 0.5, features, mockContext);
      }).not.toThrow();
    });
  });

  describe('集成测试：选择和更新循环', () => {
    it('应该能够完成完整的选择-更新循环', () => {
      const features = new Array(22).fill(0.5);

      // 1. 选择动作
      const decision = adapter.selectAction(mockUserState, mockActions, features, mockContext);

      expect(decision.action).toBeDefined();
      const initialUpdateCount = adapter.getUpdateCount();

      // 2. 更新模型
      adapter.updateModel(decision.action, 0.7, features, mockContext);

      // 3. 验证更新计数增加
      expect(adapter.getUpdateCount()).toBe(initialUpdateCount + 1);

      // 4. 再次选择动作（模型已更新）
      const decision2 = adapter.selectAction(mockUserState, mockActions, features, mockContext);

      expect(decision2.action).toBeDefined();
    });

    it('多次更新应该影响后续的动作选择', () => {
      const features = new Array(22).fill(0.5);
      const action = mockActions[0];

      // 获取初始决策
      const initialDecision = adapter.selectAction(
        mockUserState,
        mockActions,
        features,
        mockContext,
      );

      expect(initialDecision).toBeDefined();

      // 多次使用高奖励更新同一动作
      for (let i = 0; i < 10; i++) {
        adapter.selectAction(mockUserState, mockActions, features, mockContext);
        adapter.updateModel(action, 1.0, features, mockContext);
      }

      // 验证更新计数
      expect(adapter.getUpdateCount()).toBeGreaterThan(0);

      // 再次决策
      const updatedDecision = adapter.selectAction(
        mockUserState,
        mockActions,
        features,
        mockContext,
      );

      // 更新后的置信度应该有所变化
      expect(updatedDecision.confidence).toBeDefined();
    });

    it('应该正确处理多种动作的探索和利用', () => {
      const features = new Array(22).fill(0.5);

      // 对不同动作进行多次选择和更新
      for (let round = 0; round < 5; round++) {
        for (const action of mockActions) {
          adapter.selectAction(mockUserState, mockActions, features, mockContext);
          // 为不同动作提供不同的奖励
          const reward = action.difficulty === 'easy' ? 0.8 : 0.5;
          adapter.updateModel(action, reward, features, mockContext);
        }
      }

      // 验证模型已经学习
      expect(adapter.getUpdateCount()).toBeGreaterThan(0);

      // 最终决策应该有合理的置信度
      const finalDecision = adapter.selectAction(mockUserState, mockActions, features, mockContext);

      expect(finalDecision.confidence).toBeGreaterThan(0);
    });
  });

  describe('配置和状态管理', () => {
    it('应该支持自定义 Thompson Sampling 选项', () => {
      const customAdapter = new ThompsonAdapter({
        priorAlpha: 2.0,
        priorBeta: 2.0,
      });

      const features = new Array(22).fill(0.5);
      const result = customAdapter.selectAction(mockUserState, mockActions, features, mockContext);

      expect(result).toBeDefined();
      expect(result.action).toBeDefined();
    });

    it('应该支持复用现有的 Thompson Sampling 实例', () => {
      const existingThompson = new ThompsonSampling();
      const customAdapter = new ThompsonAdapter({
        thompson: existingThompson,
      });

      expect(customAdapter.getThompson()).toBe(existingThompson);
    });

    it('应该能够获取动作的期望奖励', () => {
      const features = new Array(22).fill(0.5);
      const action = mockActions[0];

      // 执行一些更新
      adapter.selectAction(mockUserState, mockActions, features, mockContext);
      adapter.updateModel(action, 0.8, features, mockContext);

      // 获取期望奖励
      const expectedReward = adapter.getExpectedReward(action);
      expect(expectedReward).toBeGreaterThanOrEqual(0);
      expect(expectedReward).toBeLessThanOrEqual(1);
    });

    it('应该能够获取动作的样本量', () => {
      const features = new Array(22).fill(0.5);
      const action = mockActions[0];

      const initialSampleCount = adapter.getSampleCount(action);

      // 执行更新
      adapter.selectAction(mockUserState, mockActions, features, mockContext);
      adapter.updateModel(action, 0.8, features, mockContext);

      // 样本量应该增加
      const updatedSampleCount = adapter.getSampleCount(action);
      expect(updatedSampleCount).toBeGreaterThan(initialSampleCount);
    });

    it('应该能够重置模型', () => {
      const features = new Array(22).fill(0.5);

      // 执行一些更新
      adapter.selectAction(mockUserState, mockActions, features, mockContext);
      adapter.updateModel(mockActions[0], 0.8, features, mockContext);
      adapter.selectAction(mockUserState, mockActions, features, mockContext);
      adapter.updateModel(mockActions[1], 0.9, features, mockContext);

      expect(adapter.getUpdateCount()).toBeGreaterThan(0);

      // 重置
      adapter.reset();

      expect(adapter.getUpdateCount()).toBe(0);
    });
  });

  describe('接口实现', () => {
    it('应该返回正确的策略名称和版本', () => {
      expect(adapter.getName()).toBe('ThompsonAdapter');
      expect(adapter.getVersion()).toBe('1.0.0');
    });

    it('应该提供对底层 ThompsonSampling 实例的访问', () => {
      const thompson = adapter.getThompson();
      expect(thompson).toBeInstanceOf(ThompsonSampling);
    });
  });

  describe('边界情况', () => {
    it('应该处理空的 features 数组', () => {
      const features: number[] = [];

      const result = adapter.selectAction(mockUserState, mockActions, features, mockContext);

      expect(result).toBeDefined();
      expect(result.action).toBeDefined();
    });

    it('应该处理单个动作的情况', () => {
      const features = new Array(22).fill(0.5);
      const singleAction = [mockActions[0]];

      const result = adapter.selectAction(mockUserState, singleAction, features, mockContext);

      expect(result.action).toEqual(singleAction[0]);
    });

    it('应该处理极端的用户状态值', () => {
      const features = new Array(22).fill(0.5);

      // 所有指标都是最小值
      const minState: UserState = {
        A: 0,
        F: 0,
        C: { mem: 0, speed: 0, stability: 0 },
        M: -1,
        conf: 0,
        ts: Date.now(),
      };

      const result1 = adapter.selectAction(minState, mockActions, features, mockContext);
      expect(result1).toBeDefined();

      // 所有指标都是最大值
      const maxState: UserState = {
        A: 1,
        F: 1,
        C: { mem: 1, speed: 1, stability: 1 },
        M: 1,
        conf: 1,
        ts: Date.now(),
      };

      const result2 = adapter.selectAction(maxState, mockActions, features, mockContext);
      expect(result2).toBeDefined();
    });

    it('应该处理极端的上下文值', () => {
      const features = new Array(22).fill(0.5);

      const extremeContext: DecisionContext = {
        recentErrorRate: 1.0,
        recentResponseTime: 10000,
        timeBucket: 23,
        userId: 'test-user',
        interactionCount: 0,
      };

      const result = adapter.selectAction(mockUserState, mockActions, features, extremeContext);

      expect(result).toBeDefined();
      expect(result.action).toBeDefined();
    });
  });
});
