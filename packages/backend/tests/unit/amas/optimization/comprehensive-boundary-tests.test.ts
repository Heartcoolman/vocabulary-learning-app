/**
 * 综合边界条件测试套件
 *
 * 作为边界条件专家，本测试套件针对所有优化代码进行5轮边界测试
 *
 * 测试维度:
 * 1. 数据边界 - 空数组/空对象/null/undefined/0值/负值/超大数据量/极小数据量
 * 2. 数值边界 - 最大值/最小值/精度问题/整数溢出/NaN/Infinity
 * 3. 字符串边界 - 空字符串/超长字符串/特殊字符/Unicode
 * 4. 时间边界 - 时区/夏令时/过去未来日期/时间戳边界值
 * 5. 并发边界 - 多请求同时/快速连续调用/竞态条件
 * 6. 用户状态边界 - 新用户/超级用户/边缘状态/异常状态
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BayesianOptimizer,
  ParamBound,
} from '../../../../src/amas/optimization/bayesian-optimizer';
import { MultiObjectiveOptimizer } from '../../../../src/amas/optimization/multi-objective-optimizer';
import { EnsembleLearningFramework } from '../../../../src/amas/decision/ensemble';
import {
  UserState,
  Action,
  LearningObjectives,
  MultiObjectiveMetrics,
} from '../../../../src/amas/types';

// ==================== 辅助函数 ====================

/**
 * 创建有效的用户状态（用于测试）
 */
function createValidUserState(overrides: Partial<UserState> = {}): UserState {
  return {
    A: 0.8,
    F: 0.2,
    M: 0.5,
    C: { mem: 0.7, speed: 0.6 },
    ...overrides,
  };
}

/**
 * 创建有效的动作
 */
function createValidAction(overrides: Partial<Action> = {}): Action {
  return {
    interval_scale: 1.0,
    new_ratio: 0.3,
    difficulty: 'medium',
    batch_size: 10,
    hint_level: 1,
    ...overrides,
  };
}

/**
 * 创建有效的学习目标
 */
function createValidObjectives(overrides: Partial<LearningObjectives> = {}): LearningObjectives {
  return {
    mode: 'daily',
    primaryObjective: 'retention',
    weightShortTerm: 0.3,
    weightLongTerm: 0.5,
    weightEfficiency: 0.2,
    ...overrides,
  };
}

// ==================== 第1轮测试：数据边界 ====================

describe('边界测试第1轮：数据边界', () => {
  describe('BayesianOptimizer - 数据边界', () => {
    let optimizer: BayesianOptimizer;

    beforeEach(() => {
      optimizer = new BayesianOptimizer();
    });

    it('应处理空观测历史', () => {
      expect(optimizer.getObservations()).toEqual([]);
      expect(optimizer.getBest()).toBeNull();
      expect(optimizer.getEvaluationCount()).toBe(0);
    });

    it('应处理null参数（边界case）', () => {
      // @ts-expect-error 测试null参数
      expect(() => optimizer.setState(null)).not.toThrow();
      expect(optimizer.getEvaluationCount()).toBe(0);
    });

    it('应处理undefined参数', () => {
      // @ts-expect-error 测试undefined参数
      expect(() => optimizer.setState(undefined)).not.toThrow();
      expect(optimizer.getEvaluationCount()).toBe(0);
    });

    it('应处理空对象状态', () => {
      // @ts-expect-error 测试空对象
      optimizer.setState({});
      expect(optimizer.getEvaluationCount()).toBe(0);
    });

    it('应处理超大数据集（100个观测）', () => {
      for (let i = 0; i < 100; i++) {
        const params = optimizer.suggestNext();
        optimizer.recordEvaluation(params, Math.random());
      }

      expect(optimizer.getEvaluationCount()).toBe(100);
      expect(optimizer.getBest()).not.toBeNull();
      const posterior = optimizer.getPosterior([0.5, 0.1, 0.8, 0.4]);
      expect(Number.isFinite(posterior.mean)).toBe(true);
      expect(Number.isFinite(posterior.std)).toBe(true);
    });

    it('应处理极小数据集（单个观测）', () => {
      const params = optimizer.suggestNext();
      optimizer.recordEvaluation(params, 0.75);

      expect(optimizer.getEvaluationCount()).toBe(1);
      expect(optimizer.getBest()?.value).toBe(0.75);
    });

    it('应处理零值评估', () => {
      const params = optimizer.suggestNext();
      optimizer.recordEvaluation(params, 0);

      expect(optimizer.getBest()?.value).toBe(0);
      expect(optimizer.getEvaluationCount()).toBe(1);
    });

    it('应处理负值评估', () => {
      optimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], -1.5);
      optimizer.recordEvaluation([0.6, 0.12, 0.75, 0.5], -0.5);

      const best = optimizer.getBest();
      expect(best?.value).toBe(-0.5); // 较大的负值
    });

    it('应处理数组长度不匹配（错误case）', () => {
      expect(() => {
        optimizer.recordEvaluation([0.5, 0.1], 1.0); // 只有2个维度而非4个
      }).toThrow('参数维度不匹配');
    });
  });

  describe('MultiObjectiveOptimizer - 数据边界', () => {
    it('应处理零值状态', () => {
      const state = createValidUserState({ A: 0, F: 0, M: 0, C: { mem: 0, speed: 0 } });
      const score = MultiObjectiveOptimizer.calculateShortTermScore(0.5, 2000, state);

      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('应处理空约束对象', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: 0.4,
        weightLongTerm: 0.4,
        weightEfficiency: 0.2,
      };

      const metrics: MultiObjectiveMetrics = {
        shortTermScore: 0.3,
        longTermScore: 0.3,
        efficiencyScore: 0.3,
        aggregatedScore: 0.3,
        ts: Date.now(),
      };

      const result = MultiObjectiveOptimizer.checkConstraints(metrics, objectives, 60000);
      expect(result.satisfied).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('应处理null/undefined metrics字段', () => {
      const objectives = createValidObjectives();

      // @ts-expect-error 测试边界case
      const metrics: MultiObjectiveMetrics = {
        shortTermScore: null,
        longTermScore: undefined,
        efficiencyScore: 0.5,
        aggregatedScore: 0,
        ts: Date.now(),
      };

      // 应该优雅处理，不抛出错误
      expect(() => {
        MultiObjectiveOptimizer.aggregateObjectives(metrics, objectives);
      }).not.toThrow();
    });
  });

  describe('EnsembleLearningFramework - 数据边界', () => {
    let ensemble: EnsembleLearningFramework;

    beforeEach(() => {
      ensemble = new EnsembleLearningFramework();
    });

    it('应处理空动作列表（错误case）', () => {
      const state = createValidUserState();
      const context = { phase: 'normal' as const };

      expect(() => {
        ensemble.selectAction(state, [], context);
      }).toThrow('动作列表不能为空');
    });

    it('应处理单个动作', () => {
      const state = createValidUserState();
      const actions = [createValidAction()];
      const context = { phase: 'classify' as const };

      const selection = ensemble.selectAction(state, actions, context);
      expect(selection.action).toEqual(actions[0]);
    });

    it('应处理大量动作（100个）', () => {
      const state = createValidUserState();
      const actions = Array.from({ length: 100 }, (_, i) =>
        createValidAction({ batch_size: i + 1 }),
      );
      const context = { phase: 'classify' as const };

      const selection = ensemble.selectAction(state, actions, context);
      expect(actions).toContainEqual(selection.action);
    });

    it('应处理null状态恢复', () => {
      // @ts-expect-error 测试null参数
      expect(() => ensemble.setState(null)).not.toThrow();
    });

    it('应处理空对象状态', () => {
      // @ts-expect-error 测试空对象
      expect(() => ensemble.setState({})).not.toThrow();
    });
  });
});

// ==================== 第2轮测试：数值边界 ====================

describe('边界测试第2轮：数值边界', () => {
  describe('BayesianOptimizer - 数值边界', () => {
    it('应处理最大值参数边界', () => {
      const largeSpace: ParamBound[] = [
        { name: 'param', min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER },
      ];
      const optimizer = new BayesianOptimizer({ paramSpace: largeSpace });
      const suggestion = optimizer.suggestNext();

      expect(Number.isFinite(suggestion[0])).toBe(true);
      expect(suggestion[0]).toBeGreaterThanOrEqual(Number.MIN_SAFE_INTEGER);
      expect(suggestion[0]).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    });

    it('应处理极小参数范围', () => {
      const tinySpace: ParamBound[] = [{ name: 'tiny', min: 1e-10, max: 1e-9 }];
      const optimizer = new BayesianOptimizer({ paramSpace: tinySpace });
      const suggestion = optimizer.suggestNext();

      expect(suggestion[0]).toBeGreaterThanOrEqual(1e-10);
      expect(suggestion[0]).toBeLessThanOrEqual(1e-9);
    });

    it('应处理NaN评估值', () => {
      const optimizer = new BayesianOptimizer();
      const params = optimizer.suggestNext();
      optimizer.recordEvaluation(params, NaN);

      // 应记录但可能影响最优值计算
      const best = optimizer.getBest();
      // NaN无法比较，所以行为依赖实现
      expect(best).toBeDefined();
    });

    it('应处理Infinity评估值', () => {
      const optimizer = new BayesianOptimizer();
      optimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], Infinity);
      optimizer.recordEvaluation([0.6, 0.12, 0.75, 0.5], -Infinity);

      const best = optimizer.getBest();
      expect(best?.value).toBe(Infinity);
    });

    it('应处理浮点数精度问题', () => {
      const optimizer = new BayesianOptimizer();

      // 0.1 + 0.2 在JavaScript中不等于0.3，存在精度问题
      const impreciseValue = 0.1 + 0.2;
      optimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], impreciseValue);

      const best = optimizer.getBest();
      // 应该能处理这种精度误差
      expect(best?.value).toBeCloseTo(0.3, 10);
    });

    it('应处理接近整数溢出的beta值', () => {
      const optimizer = new BayesianOptimizer({ beta: Number.MAX_VALUE / 2 });
      optimizer.recordEvaluation([0.5, 0.1, 0.8, 0.4], 0.5);

      const ucb = optimizer.computeUCB([0.6, 0.12, 0.75, 0.5]);
      // 即使beta极大，UCB也应该是有限值
      expect(Number.isFinite(ucb)).toBe(true);
    });
  });

  describe('MultiObjectiveOptimizer - 数值边界', () => {
    it('应处理准确率超过1.0', () => {
      const state = createValidUserState();
      const score = MultiObjectiveOptimizer.calculateShortTermScore(1.5, 2000, state);

      expect(Number.isFinite(score)).toBe(true);
    });

    it('应处理负准确率', () => {
      const state = createValidUserState();
      const score = MultiObjectiveOptimizer.calculateShortTermScore(-0.5, 2000, state);

      expect(Number.isFinite(score)).toBe(true);
    });

    it('应处理响应时间为Infinity', () => {
      const state = createValidUserState();
      const score = MultiObjectiveOptimizer.calculateShortTermScore(0.8, Infinity, state);

      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('应处理响应时间为NaN', () => {
      const state = createValidUserState();
      const score = MultiObjectiveOptimizer.calculateShortTermScore(0.8, NaN, state);

      // 可能返回NaN或处理为默认值
      // 关键是不应抛出错误
      expect(typeof score).toBe('number');
    });

    it('应处理极小权重值', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: 1e-15,
        weightLongTerm: 1e-15,
        weightEfficiency: 1e-15,
      };

      const metrics = {
        shortTermScore: 0.8,
        longTermScore: 0.7,
        efficiencyScore: 0.6,
      };

      const score = MultiObjectiveOptimizer.aggregateObjectives(metrics, objectives);
      expect(Number.isFinite(score)).toBe(true);
    });

    it('应处理权重和为0的情况', () => {
      const objectives: LearningObjectives = {
        mode: 'custom',
        primaryObjective: 'accuracy',
        weightShortTerm: 0,
        weightLongTerm: 0,
        weightEfficiency: 0,
      };

      const normalized = MultiObjectiveOptimizer.normalizeWeights(objectives);

      // 应返回均等权重
      expect(normalized.weightShortTerm).toBeCloseTo(1 / 3, 5);
      expect(normalized.weightLongTerm).toBeCloseTo(1 / 3, 5);
      expect(normalized.weightEfficiency).toBeCloseTo(1 / 3, 5);
    });
  });

  describe('EnsembleLearningFramework - 数值边界', () => {
    let ensemble: EnsembleLearningFramework;

    beforeEach(() => {
      ensemble = new EnsembleLearningFramework();
    });

    it('应处理极端奖励值（+Infinity）', () => {
      const state = createValidUserState();
      const action = createValidAction();
      const context = { phase: 'normal' as const };

      expect(() => {
        ensemble.update(state, action, Infinity, context);
      }).not.toThrow();
    });

    it('应处理极端奖励值（-Infinity）', () => {
      const state = createValidUserState();
      const action = createValidAction();
      const context = { phase: 'normal' as const };

      expect(() => {
        ensemble.update(state, action, -Infinity, context);
      }).not.toThrow();
    });

    it('应处理NaN奖励值', () => {
      const state = createValidUserState();
      const action = createValidAction();
      const context = { phase: 'normal' as const };

      expect(() => {
        ensemble.update(state, action, NaN, context);
      }).not.toThrow();
    });

    it('应处理奖励值超出[-1, 1]范围', () => {
      const state = createValidUserState();
      const action = createValidAction();
      const context = { phase: 'normal' as const };

      // 应该自动截断到[-1, 1]范围
      ensemble.update(state, action, 10, context);
      ensemble.update(state, action, -10, context);

      // 不应抛出错误
      expect(ensemble.getUpdateCount()).toBeGreaterThan(0);
    });

    it('应处理所有权重设为极小值', () => {
      ensemble.setWeights({
        thompson: 1e-10,
        linucb: 1e-10,
        actr: 1e-10,
        heuristic: 1e-10,
      });

      const weights = ensemble.getWeights();
      const sum = weights.thompson + weights.linucb + weights.actr + weights.heuristic;

      // 权重应归一化到和为1
      expect(sum).toBeCloseTo(1.0, 5);
    });
  });
});

// ==================== 第3轮测试：时间边界 ====================

describe('边界测试第3轮：时间边界', () => {
  describe('时间戳边界值', () => {
    it('应处理Unix纪元时间（0）', () => {
      const optimizer = new BayesianOptimizer();
      const state = optimizer.getState();

      // 修改时间戳为0
      state.observations = [{ params: [0.5, 0.1, 0.8, 0.4], value: 0.75, timestamp: 0 }];

      expect(() => optimizer.setState(state)).not.toThrow();
    });

    it('应处理未来时间戳', () => {
      const futureTime = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000; // 100年后
      const optimizer = new BayesianOptimizer();

      const params = optimizer.suggestNext();
      optimizer.recordEvaluation(params, 0.5);

      const state = optimizer.getState();
      state.observations[0].timestamp = futureTime;

      expect(() => optimizer.setState(state)).not.toThrow();
    });

    it('应处理负时间戳', () => {
      const optimizer = new BayesianOptimizer();
      const params = optimizer.suggestNext();
      optimizer.recordEvaluation(params, 0.5);

      const state = optimizer.getState();
      state.observations[0].timestamp = -1000;

      expect(() => optimizer.setState(state)).not.toThrow();
    });

    it('应处理时间戳为NaN', () => {
      const optimizer = new BayesianOptimizer();
      const params = optimizer.suggestNext();
      optimizer.recordEvaluation(params, 0.5);

      const state = optimizer.getState();
      state.observations[0].timestamp = NaN;

      expect(() => optimizer.setState(state)).not.toThrow();
    });
  });

  describe('会话时间边界', () => {
    it('应处理零会话时间', () => {
      const objectives = createValidObjectives({ maxDailyTime: 60 });
      const metrics: MultiObjectiveMetrics = {
        shortTermScore: 0.8,
        longTermScore: 0.7,
        efficiencyScore: 0.6,
        aggregatedScore: 0.7,
        ts: Date.now(),
      };

      const result = MultiObjectiveOptimizer.checkConstraints(metrics, objectives, 0);
      expect(result.satisfied).toBe(true);
    });

    it('应处理负会话时间', () => {
      const objectives = createValidObjectives({ maxDailyTime: 60 });
      const metrics: MultiObjectiveMetrics = {
        shortTermScore: 0.8,
        longTermScore: 0.7,
        efficiencyScore: 0.6,
        aggregatedScore: 0.7,
        ts: Date.now(),
      };

      const result = MultiObjectiveOptimizer.checkConstraints(metrics, objectives, -5000);
      expect(result.satisfied).toBe(true);
    });

    it('应处理超长会话时间（24小时）', () => {
      const objectives = createValidObjectives({ maxDailyTime: 60 }); // 最大60分钟
      const metrics: MultiObjectiveMetrics = {
        shortTermScore: 0.8,
        longTermScore: 0.7,
        efficiencyScore: 0.6,
        aggregatedScore: 0.7,
        ts: Date.now(),
      };

      const result = MultiObjectiveOptimizer.checkConstraints(
        metrics,
        objectives,
        24 * 60 * 60 * 1000, // 24小时
      );

      // 应该有违反maxDailyTime的约束
      expect(result.satisfied).toBe(false);
      expect(result.violations.some((v) => v.constraint === 'maxDailyTime')).toBe(true);
    });
  });
});

// ==================== 第4轮测试：并发边界 ====================

describe('边界测试第4轮：并发边界', () => {
  describe('BayesianOptimizer - 并发测试', () => {
    it('应处理快速连续调用suggestNext', () => {
      const optimizer = new BayesianOptimizer();
      const suggestions: number[][] = [];

      // 快速连续调用10次
      for (let i = 0; i < 10; i++) {
        suggestions.push(optimizer.suggestNext());
      }

      expect(suggestions.length).toBe(10);
      suggestions.forEach((s) => {
        expect(s.length).toBe(4);
        s.forEach((v) => expect(Number.isFinite(v)).toBe(true));
      });
    });

    it('应处理交替调用suggest和record', () => {
      const optimizer = new BayesianOptimizer();

      for (let i = 0; i < 20; i++) {
        const params = optimizer.suggestNext();
        optimizer.recordEvaluation(params, Math.random());
      }

      expect(optimizer.getEvaluationCount()).toBe(20);
    });

    it('应处理批量建议后的状态一致性', () => {
      const optimizer = new BayesianOptimizer();

      // 添加一些观测
      for (let i = 0; i < 5; i++) {
        const params = optimizer.suggestNext();
        optimizer.recordEvaluation(params, Math.random());
      }

      const countBefore = optimizer.getEvaluationCount();
      const batch = optimizer.suggestBatch(10);
      const countAfter = optimizer.getEvaluationCount();

      // suggestBatch不应改变评估计数
      expect(countAfter).toBe(countBefore);
      expect(batch.length).toBe(10);
    });
  });

  describe('EnsembleLearningFramework - 并发测试', () => {
    let ensemble: EnsembleLearningFramework;

    beforeEach(() => {
      ensemble = new EnsembleLearningFramework();
    });

    it('应处理快速连续的select-update循环', () => {
      const state = createValidUserState();
      const actions = [createValidAction()];
      const context = { phase: 'classify' as const };

      for (let i = 0; i < 50; i++) {
        const selection = ensemble.selectAction(state, actions, context);
        ensemble.update(state, selection.action, Math.random() * 2 - 1, context);
      }

      expect(ensemble.getUpdateCount()).toBeGreaterThan(0);
    });

    it('应处理状态保存和恢复的竞态', () => {
      const state = createValidUserState();
      const actions = [createValidAction()];
      const context = { phase: 'classify' as const };

      // 快速交替执行和状态操作
      for (let i = 0; i < 10; i++) {
        const selection = ensemble.selectAction(state, actions, context);
        ensemble.update(state, selection.action, 0.5, context);

        const savedState = ensemble.getState();
        ensemble.setState(savedState);
      }

      expect(ensemble.getUpdateCount()).toBeGreaterThan(0);
    });
  });
});

// ==================== 第5轮测试：用户状态边界 ====================

describe('边界测试第5轮：用户状态边界', () => {
  describe('新用户场景（无历史数据）', () => {
    it('BayesianOptimizer应为新用户提供合理建议', () => {
      const optimizer = new BayesianOptimizer();
      const suggestion = optimizer.suggestNext();

      expect(suggestion).toBeDefined();
      expect(suggestion.length).toBe(4);
      expect(optimizer.getEvaluationCount()).toBe(0);
    });

    it('EnsembleLearningFramework应处理新用户冷启动', () => {
      const ensemble = new EnsembleLearningFramework();
      const state = createValidUserState();
      const actions = [createValidAction(), createValidAction({ batch_size: 5 })];
      const context = { phase: 'classify' as const };

      const selection = ensemble.selectAction(state, actions, context);

      expect(selection).toBeDefined();
      expect(selection.action).toBeDefined();
      expect(selection.meta?.ensemblePhase).toBe('classify');
    });

    it('MultiObjectiveOptimizer应处理全零指标的新用户', () => {
      const score = MultiObjectiveOptimizer.calculateLongTermScore(0, 0, 0);
      expect(score).toBe(0);
    });
  });

  describe('超级用户场景（大量历史数据）', () => {
    it('BayesianOptimizer应处理超级用户的大量观测', () => {
      const optimizer = new BayesianOptimizer();

      // 模拟超级用户：500次观测
      for (let i = 0; i < 500; i++) {
        const params = optimizer.suggestNext();
        optimizer.recordEvaluation(params, Math.sin(i / 50) * 0.5 + 0.5);
      }

      expect(optimizer.getEvaluationCount()).toBe(500);
      const best = optimizer.getBest();
      expect(best).not.toBeNull();

      // 后验计算应仍然有效
      const posterior = optimizer.getPosterior([0.5, 0.1, 0.8, 0.4]);
      expect(Number.isFinite(posterior.mean)).toBe(true);
      expect(Number.isFinite(posterior.std)).toBe(true);
    });

    it('EnsembleLearningFramework应处理超级用户的大量更新', () => {
      const ensemble = new EnsembleLearningFramework();
      const state = createValidUserState();
      const actions = [createValidAction()];
      const context = { phase: 'normal' as const };

      // 模拟超级用户：1000次更新
      for (let i = 0; i < 1000; i++) {
        const selection = ensemble.selectAction(state, actions, context);
        ensemble.update(state, selection.action, Math.random() * 2 - 1, context);
      }

      expect(ensemble.getUpdateCount()).toBe(1000);
      const weights = ensemble.getWeights();

      // 权重应仍然归一化
      const sum = weights.thompson + weights.linucb + weights.actr + weights.heuristic;
      expect(sum).toBeCloseTo(1.0, 5);
    });
  });

  describe('边缘状态用户（卡阈值）', () => {
    it('应处理恰好在约束边界的用户', () => {
      const objectives: LearningObjectives = {
        mode: 'exam',
        primaryObjective: 'accuracy',
        weightShortTerm: 0.6,
        weightLongTerm: 0.3,
        weightEfficiency: 0.1,
        minAccuracy: 0.8,
      };

      const metrics: MultiObjectiveMetrics = {
        shortTermScore: 0.8, // 恰好等于minAccuracy
        longTermScore: 0.7,
        efficiencyScore: 0.6,
        aggregatedScore: 0.7,
        ts: Date.now(),
      };

      const result = MultiObjectiveOptimizer.checkConstraints(metrics, objectives, 30 * 60 * 1000);

      // 边界值应该满足约束（>=）
      expect(result.satisfied).toBe(true);
    });

    it('应处理略低于约束边界的用户', () => {
      const objectives: LearningObjectives = {
        mode: 'exam',
        primaryObjective: 'accuracy',
        weightShortTerm: 0.6,
        weightLongTerm: 0.3,
        weightEfficiency: 0.1,
        minAccuracy: 0.8,
      };

      const metrics: MultiObjectiveMetrics = {
        shortTermScore: 0.79999, // 略低于minAccuracy
        longTermScore: 0.7,
        efficiencyScore: 0.6,
        aggregatedScore: 0.7,
        ts: Date.now(),
      };

      const result = MultiObjectiveOptimizer.checkConstraints(metrics, objectives, 30 * 60 * 1000);

      // 应该违反约束
      expect(result.satisfied).toBe(false);
      expect(result.violations.some((v) => v.constraint === 'minAccuracy')).toBe(true);
    });
  });

  describe('异常状态用户', () => {
    it('应处理疲劳度为1.0的用户', () => {
      const state = createValidUserState({ F: 1.0 });
      const score = MultiObjectiveOptimizer.calculateShortTermScore(0.8, 2000, state);

      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('应处理注意力为负的用户', () => {
      const state = createValidUserState({ A: -0.5 });
      const score = MultiObjectiveOptimizer.calculateShortTermScore(0.8, 2000, state);

      expect(Number.isFinite(score)).toBe(true);
    });

    it('应处理所有指标为极端值的用户', () => {
      const state: UserState = {
        A: 100,
        F: 100,
        M: 100,
        C: { mem: 100, speed: 100 },
      };

      const score = MultiObjectiveOptimizer.calculateShortTermScore(2.0, -1000, state);
      expect(Number.isFinite(score)).toBe(true);
    });

    it('应处理认知能力为null的用户', () => {
      // @ts-expect-error 测试异常状态
      const state: UserState = {
        A: 0.8,
        F: 0.2,
        M: 0.5,
        C: null,
      };

      // 应该优雅处理，不抛出错误
      expect(() => {
        MultiObjectiveOptimizer.calculateShortTermScore(0.8, 2000, state);
      }).not.toThrow();
    });
  });
});

// ==================== 综合压力测试 ====================

describe('综合压力测试', () => {
  it('应处理混合边界条件的复杂场景', () => {
    const optimizer = new BayesianOptimizer();
    const ensemble = new EnsembleLearningFramework();

    // 混合各种边界条件
    const testCases = [
      { params: [0, 0, 0, 0], value: 0 },
      { params: [1, 1, 1, 1], value: 1 },
      { params: [0.5, 0.1, 0.8, 0.4], value: -1 },
      { params: [0.3, 0.15, 0.6, 0.7], value: Infinity },
      { params: [0.7, 0.05, 0.9, 0.2], value: NaN },
    ];

    testCases.forEach((testCase, i) => {
      optimizer.recordEvaluation(testCase.params, testCase.value);

      // 同时测试ensemble
      const state = createValidUserState({
        A: testCase.params[0],
        F: testCase.params[1],
        M: testCase.params[2],
      });
      const actions = [createValidAction()];
      const context = { phase: i < 2 ? ('classify' as const) : ('normal' as const) };

      const selection = ensemble.selectAction(state, actions, context);
      ensemble.update(state, selection.action, testCase.value, context);
    });

    // 验证系统仍然运行正常
    expect(optimizer.getEvaluationCount()).toBe(5);
    expect(ensemble.getUpdateCount()).toBeGreaterThan(0);

    // 后验计算应该仍然有效（即使有NaN/Infinity）
    const posterior = optimizer.getPosterior([0.5, 0.1, 0.8, 0.4]);
    expect(posterior).toBeDefined();
  });

  it('应处理长时间运行的连续操作', () => {
    const optimizer = new BayesianOptimizer({ maxEvaluations: 200 });
    const ensemble = new EnsembleLearningFramework();

    for (let i = 0; i < 100; i++) {
      // BayesianOptimizer操作
      const params = optimizer.suggestNext();
      const value = Math.sin(i / 10) * 0.5 + 0.5 + (Math.random() - 0.5) * 0.1;
      optimizer.recordEvaluation(params, value);

      // EnsembleLearningFramework操作
      const state = createValidUserState({
        A: Math.random(),
        F: Math.random(),
        M: Math.random(),
      });
      const actions = [
        createValidAction(),
        createValidAction({ batch_size: 5 }),
        createValidAction({ difficulty: 'hard' }),
      ];
      const context = { phase: i < 10 ? ('classify' as const) : ('normal' as const) };

      const selection = ensemble.selectAction(state, actions, context);
      ensemble.update(state, selection.action, value, context);

      // 定期状态保存和恢复
      if (i % 10 === 0) {
        const optimizerState = optimizer.getState();
        const ensembleState = ensemble.getState();

        const newOptimizer = new BayesianOptimizer();
        const newEnsemble = new EnsembleLearningFramework();

        newOptimizer.setState(optimizerState);
        newEnsemble.setState(ensembleState);

        expect(newOptimizer.getEvaluationCount()).toBe(optimizer.getEvaluationCount());
        expect(newEnsemble.getUpdateCount()).toBe(ensemble.getUpdateCount());
      }
    }

    // 验证最终状态
    expect(optimizer.getEvaluationCount()).toBe(100);
    expect(optimizer.getBest()).not.toBeNull();
    expect(ensemble.getUpdateCount()).toBeGreaterThan(0);
    expect(ensemble.isWarm()).toBe(true);
  });
});
