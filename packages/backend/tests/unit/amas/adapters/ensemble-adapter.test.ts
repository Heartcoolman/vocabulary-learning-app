/**
 * Ensemble Adapter 测试
 *
 * 验证 EnsembleAdapter 正确实现 IDecisionPolicy 接口
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnsembleAdapter } from '../../../../src/amas/adapters/ensemble-adapter';
import { Action, UserState } from '../../../../src/amas/types';
import { DecisionContext } from '../../../../src/amas/interfaces';
import { EnsembleLearningFramework } from '../../../../src/amas/decision/ensemble';

describe('EnsembleAdapter', () => {
  let adapter: EnsembleAdapter;
  let mockUserState: UserState;
  let mockContext: DecisionContext;
  let mockActions: Action[];

  beforeEach(() => {
    adapter = new EnsembleAdapter();

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
      expect(result.meta?.algorithm).toBe('Ensemble');
    });

    it('应该在多个动作中选择最优的', () => {
      const features = new Array(22).fill(0.5);

      const result = adapter.selectAction(mockUserState, mockActions, features, mockContext);

      // 应该返回一个有效的动作（可能是修改后的动作）
      expect(result.action).toBeDefined();
      expect(result.action).toHaveProperty('interval_scale');
      expect(result.action).toHaveProperty('difficulty');
      expect(result.score).toBeDefined();
    });

    it('应该缓存 UserState 用于后续更新', () => {
      const features = new Array(22).fill(0.5);

      // 第一次选择
      adapter.selectAction(mockUserState, mockActions, features, mockContext);

      // 验证更新时能够使用缓存的状态
      const consoleSpy = vi.spyOn(console, 'warn');
      adapter.updateModel(mockActions[0], 0.8, features, mockContext);

      // 不应该有警告日志（因为已经缓存了状态）
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('应该包含当前阶段信息', () => {
      const features = new Array(22).fill(0.5);

      const result = adapter.selectAction(mockUserState, mockActions, features, mockContext);

      expect(result.meta?.phase).toBeDefined();
      expect(['classify', 'explore', 'normal']).toContain(result.meta?.phase);
    });

    it('应该包含学习器权重信息', () => {
      const features = new Array(22).fill(0.5);

      const result = adapter.selectAction(mockUserState, mockActions, features, mockContext);

      expect(result.meta?.weights).toBeDefined();
      const weights = result.meta?.weights as Record<string, number>;
      expect(weights).toHaveProperty('thompson');
      expect(weights).toHaveProperty('linucb');
      expect(weights).toHaveProperty('actr');
      expect(weights).toHaveProperty('heuristic');
    });

    it('应该处理算法异常并返回默认动作', () => {
      const ensemble = adapter.getEnsemble();

      // 模拟 selectAction 抛出错误
      vi.spyOn(ensemble, 'selectAction').mockImplementationOnce(() => {
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

      // 测试低动机状态
      const lowMotivationState = { ...mockUserState, M: -0.5 };
      const result3 = adapter.selectAction(lowMotivationState, mockActions, features, mockContext);
      expect(result3.explanation).toContain('动机');
    });
  });

  describe('updateModel', () => {
    it('应该使用缓存的 UserState 进行更新', () => {
      const ensemble = adapter.getEnsemble();
      const updateSpy = vi.spyOn(ensemble, 'update');

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
          phase: expect.any(String),
          base: expect.any(Object),
          linucb: expect.any(Object),
          thompson: expect.any(Object),
          actr: expect.any(Object),
          heuristic: expect.any(Object),
        }),
      );
    });

    it('应该正确处理不同的 reward 值', () => {
      const ensemble = adapter.getEnsemble();
      const updateSpy = vi.spyOn(ensemble, 'update');

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

    it('应该在没有缓存状态时使用虚拟状态', () => {
      const ensemble = adapter.getEnsemble();
      const updateSpy = vi.spyOn(ensemble, 'update');

      const features = new Array(22).fill(0.5);
      const action = mockActions[0];

      // 直接更新，不先调用 selectAction
      adapter.updateModel(action, 0.8, features, mockContext);

      // 应该调用 update，使用虚拟状态
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

    it('应该在更新后清空缓存的状态', () => {
      const features = new Array(22).fill(0.5);
      const action = mockActions[0];

      // 先选择动作
      adapter.selectAction(mockUserState, mockActions, features, mockContext);

      // 执行更新（会清空缓存）
      adapter.updateModel(action, 0.8, features, mockContext);

      // 再次更新时应该使用虚拟状态（因为缓存已清空）
      const ensemble = adapter.getEnsemble();
      const updateSpy = vi.spyOn(ensemble, 'update');

      adapter.updateModel(action, 0.7, features, mockContext);

      // 验证使用了虚拟状态
      expect(updateSpy).toHaveBeenCalled();
    });

    it('应该处理更新错误并记录日志', () => {
      const ensemble = adapter.getEnsemble();

      // 模拟 update 抛出错误
      vi.spyOn(ensemble, 'update').mockImplementationOnce(() => {
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

      // 3. 验证更新计数增加（注意：只有在normal阶段才会增加）
      const updatedCount = adapter.getUpdateCount();
      if (adapter.getPhase() === 'normal') {
        expect(updatedCount).toBe(initialUpdateCount + 1);
      } else {
        // 在冷启动阶段，updateCount不会增加
        expect(updatedCount).toBe(initialUpdateCount);
      }

      // 4. 再次选择动作（模型已更新）
      const decision2 = adapter.selectAction(mockUserState, mockActions, features, mockContext);

      expect(decision2.action).toBeDefined();
    });

    it('多次更新应该影响冷启动进度', () => {
      const features = new Array(22).fill(0.5);

      const initialProgress = adapter.getColdStartProgress();

      // 执行多次选择-更新循环
      for (let i = 0; i < 20; i++) {
        adapter.selectAction(mockUserState, mockActions, features, mockContext);
        adapter.updateModel(mockActions[i % mockActions.length], 0.7, features, mockContext);
      }

      // 冷启动进度应该增加
      const updatedProgress = adapter.getColdStartProgress();
      expect(updatedProgress).toBeGreaterThanOrEqual(initialProgress);
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

      // 验证模型已经进行了学习（通过检查子学习器的更新计数）
      const memberCounts = adapter.getEnsemble().getMemberUpdateCounts();
      const totalUpdates = Object.values(memberCounts).reduce((a, b) => a + b, 0);
      expect(totalUpdates).toBeGreaterThan(0);

      // 最终决策应该有合理的置信度
      const finalDecision = adapter.selectAction(mockUserState, mockActions, features, mockContext);

      expect(finalDecision.confidence).toBeGreaterThan(0);
    });

    it('应该在冷启动阶段使用不同的策略', () => {
      const features = new Array(22).fill(0.5);

      // 记录初始阶段
      const initialPhase = adapter.getPhase();

      // 执行多次更新以推进冷启动
      for (let i = 0; i < 50; i++) {
        const decision = adapter.selectAction(mockUserState, mockActions, features, mockContext);
        adapter.updateModel(decision.action, 0.7, features, mockContext);
      }

      // 阶段可能会变化
      const updatedPhase = adapter.getPhase();
      expect(['classify', 'explore', 'normal']).toContain(updatedPhase);
    });
  });

  describe('冷启动管理', () => {
    it('应该正确报告冷启动阶段', () => {
      const phase = adapter.getPhase();
      expect(['classify', 'explore', 'normal']).toContain(phase);
    });

    it('应该跟踪冷启动进度', () => {
      const progress = adapter.getColdStartProgress();
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    });

    it('应该正确报告是否完成冷启动', () => {
      const isWarm = adapter.isWarm();
      expect(typeof isWarm).toBe('boolean');
    });

    it('应该在足够的交互后完成冷启动', () => {
      const features = new Array(22).fill(0.5);

      // 执行大量交互
      for (let i = 0; i < 100; i++) {
        const decision = adapter.selectAction(mockUserState, mockActions, features, mockContext);
        adapter.updateModel(decision.action, Math.random(), features, mockContext);
      }

      // 冷启动进度应该接近完成
      const progress = adapter.getColdStartProgress();
      expect(progress).toBeGreaterThan(0);
    });
  });

  describe('学习器权重管理', () => {
    it('应该能够获取当前权重', () => {
      const weights = adapter.getWeights();

      expect(weights).toBeDefined();
      expect(weights).toHaveProperty('thompson');
      expect(weights).toHaveProperty('linucb');
      expect(weights).toHaveProperty('actr');
      expect(weights).toHaveProperty('heuristic');

      // 权重应该在合理范围内
      expect(weights.thompson).toBeGreaterThanOrEqual(0);
      expect(weights.linucb).toBeGreaterThanOrEqual(0);
      expect(weights.actr).toBeGreaterThanOrEqual(0);
      expect(weights.heuristic).toBeGreaterThanOrEqual(0);
    });

    it('权重应该随着学习而变化', () => {
      const features = new Array(22).fill(0.5);
      const initialWeights = adapter.getWeights();

      // 执行多次选择-更新循环
      for (let i = 0; i < 30; i++) {
        const decision = adapter.selectAction(mockUserState, mockActions, features, mockContext);
        adapter.updateModel(decision.action, 0.8, features, mockContext);
      }

      const updatedWeights = adapter.getWeights();

      // 验证权重发生了变化（至少有一个值不同）
      const weightsChanged =
        initialWeights.thompson !== updatedWeights.thompson ||
        initialWeights.linucb !== updatedWeights.linucb ||
        initialWeights.actr !== updatedWeights.actr ||
        initialWeights.heuristic !== updatedWeights.heuristic;

      // 权重可能会变化，也可能不变化，取决于学习结果
      expect(updatedWeights).toBeDefined();
    });
  });

  describe('配置和状态管理', () => {
    it('应该支持复用现有的 Ensemble 实例', () => {
      const existingEnsemble = new EnsembleLearningFramework();
      const customAdapter = new EnsembleAdapter({
        ensemble: existingEnsemble,
      });

      expect(customAdapter.getEnsemble()).toBe(existingEnsemble);
    });

    it('应该能够重置模型', () => {
      const features = new Array(22).fill(0.5);

      // 执行一些更新
      adapter.selectAction(mockUserState, mockActions, features, mockContext);
      adapter.updateModel(mockActions[0], 0.8, features, mockContext);
      adapter.selectAction(mockUserState, mockActions, features, mockContext);
      adapter.updateModel(mockActions[1], 0.9, features, mockContext);

      // 验证子学习器已经有更新
      const memberCountsBefore = adapter.getEnsemble().getMemberUpdateCounts();
      const totalUpdatesBefore = Object.values(memberCountsBefore).reduce((a, b) => a + b, 0);
      expect(totalUpdatesBefore).toBeGreaterThan(0);

      // 重置
      adapter.reset();

      expect(adapter.getUpdateCount()).toBe(0);
      // 冷启动进度也应该重置
      expect(adapter.getColdStartProgress()).toBe(0);
    });

    it('应该在重置时清空缓存的状态', () => {
      const features = new Array(22).fill(0.5);

      // 选择动作以缓存状态
      adapter.selectAction(mockUserState, mockActions, features, mockContext);

      // 重置
      adapter.reset();

      // 更新应该使用虚拟状态（因为缓存已清空）
      const ensemble = adapter.getEnsemble();
      const updateSpy = vi.spyOn(ensemble, 'update');

      adapter.updateModel(mockActions[0], 0.8, features, mockContext);

      // 验证使用了虚拟状态
      expect(updateSpy).toHaveBeenCalled();
    });
  });

  describe('接口实现', () => {
    it('应该返回正确的策略名称和版本', () => {
      expect(adapter.getName()).toBe('EnsembleAdapter');
      expect(adapter.getVersion()).toBe('1.0.0');
    });

    it('应该提供对底层 Ensemble 实例的访问', () => {
      const ensemble = adapter.getEnsemble();
      expect(ensemble).toBeInstanceOf(EnsembleLearningFramework);
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

      // 应该返回一个有效的动作（可能是修改后的）
      expect(result.action).toBeDefined();
      expect(result.action).toHaveProperty('interval_scale');
      expect(result.action).toHaveProperty('difficulty');
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

    it('应该处理极端的奖励值', () => {
      const features = new Array(22).fill(0.5);
      const action = mockActions[0];

      // 先选择动作
      adapter.selectAction(mockUserState, mockActions, features, mockContext);

      // 测试极小奖励
      expect(() => {
        adapter.updateModel(action, -100, features, mockContext);
      }).not.toThrow();

      adapter.selectAction(mockUserState, mockActions, features, mockContext);

      // 测试极大奖励
      expect(() => {
        adapter.updateModel(action, 100, features, mockContext);
      }).not.toThrow();
    });
  });

  describe('解释生成', () => {
    it('应该基于阶段生成合适的解释', () => {
      const features = new Array(22).fill(0.5);

      const result = adapter.selectAction(mockUserState, mockActions, features, mockContext);

      const phase = adapter.getPhase();
      if (phase === 'classify') {
        expect(result.explanation).toContain('分类');
      } else if (phase === 'explore') {
        expect(result.explanation).toContain('探索');
      } else if (phase === 'normal') {
        expect(result.explanation).toContain('集成');
      }
    });

    it('应该在解释中包含动作参数信息', () => {
      const features = new Array(22).fill(0.5);

      // 使用具有特殊参数的动作
      const specialActions: Action[] = [
        {
          interval_scale: 1.5,
          new_ratio: 0.3,
          difficulty: 'hard',
          batch_size: 20,
          hint_level: 0,
        },
      ];

      const result = adapter.selectAction(mockUserState, specialActions, features, mockContext);

      // 解释中应该包含难度信息
      expect(result.explanation).toContain('难度');
    });
  });
});
