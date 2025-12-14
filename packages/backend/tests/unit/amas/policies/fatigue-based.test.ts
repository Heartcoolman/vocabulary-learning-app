/**
 * FatigueBasedPolicy Unit Tests
 * 疲劳度策略单元测试
 *
 * 测试覆盖:
 * - 策略初始化
 * - 疲劳度计算
 * - 策略参数调整
 * - 压力指数计算
 * - 休息建议
 * - 边界情况
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FatigueBasedPolicy,
  createFatigueBasedPolicy,
} from '../../../../src/amas/policies/fatigue-based';
import { UserState, StrategyParams, DifficultyLevel } from '../../../../src/amas/types';

describe('FatigueBasedPolicy', () => {
  let policy: FatigueBasedPolicy;

  beforeEach(() => {
    policy = new FatigueBasedPolicy();
  });

  // ==================== 初始化测试 ====================

  describe('initialization', () => {
    it('应该成功创建实例', () => {
      expect(policy).toBeDefined();
      expect(policy).toBeInstanceOf(FatigueBasedPolicy);
    });

    it('应该有正确的策略名称', () => {
      expect(policy.getName()).toBe('FatigueBasedPolicy');
    });

    it('应该有版本信息', () => {
      const version = policy.getVersion();
      expect(version).toBeDefined();
      expect(typeof version).toBe('string');
      expect(version).toMatch(/^\d+\.\d+\.\d+$/); // 匹配语义化版本号
    });

    it('应该有策略描述', () => {
      const description = policy.getDescription();
      expect(description).toBeDefined();
      expect(typeof description).toBe('string');
      expect(description.length).toBeGreaterThan(0);
      expect(description).toContain('疲劳');
    });
  });

  // ==================== 高压力状态测试 ====================

  describe('high stress state (stress index > 0.7)', () => {
    it('高疲劳度应该触发轻松模式', () => {
      const state: UserState = {
        A: 0.3, // 低注意力
        F: 0.9, // 高疲劳度
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        M: -0.3, // 低动机
        conf: 0.5,
        ts: Date.now(),
      };

      const params = policy.decide(state);

      // 轻松模式特征
      expect(params.batch_size).toBe(5);
      expect(params.difficulty).toBe('easy');
      expect(params.hint_level).toBe(2);
      expect(params.interval_scale).toBe(0.8); // 缩短间隔
      expect(params.new_ratio).toBe(0.1); // 少量新词
    });

    it('低注意力高疲劳应该触发轻松模式', () => {
      const state: UserState = {
        A: 0.2, // 极低注意力
        F: 0.7, // 高疲劳度
        C: { mem: 0.6, speed: 0.6, stability: 0.6 },
        M: 0, // 中等动机
        conf: 0.6,
        ts: Date.now(),
      };

      const params = policy.decide(state);

      expect(params.batch_size).toBe(5);
      expect(params.difficulty).toBe('easy');
      expect(params.hint_level).toBe(2);
    });

    it('极低动机应该触发轻松模式', () => {
      const state: UserState = {
        A: 0.5,
        F: 0.6,
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        M: -0.8, // 极低动机
        conf: 0.5,
        ts: Date.now(),
      };

      const params = policy.decide(state);

      expect(params.batch_size).toBe(5);
      expect(params.difficulty).toBe('easy');
      expect(params.hint_level).toBe(2);
    });

    it('轻松模式应该增加复习频率', () => {
      const state: UserState = {
        A: 0.3,
        F: 0.9,
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        M: -0.5,
        conf: 0.5,
        ts: Date.now(),
      };

      const params = policy.decide(state);

      // 间隔缩放 < 1 表示增加复习频率
      expect(params.interval_scale).toBe(0.8);
    });

    it('轻松模式应该减少新词比例', () => {
      const state: UserState = {
        A: 0.3,
        F: 0.9,
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        M: -0.5,
        conf: 0.5,
        ts: Date.now(),
      };

      const params = policy.decide(state);

      expect(params.new_ratio).toBe(0.1);
    });
  });

  // ==================== 中等压力状态测试 ====================

  describe('medium stress state (0.4 < stress index <= 0.7)', () => {
    it('中等疲劳度应该触发平衡模式', () => {
      const state: UserState = {
        A: 0.6, // 中等注意力
        F: 0.5, // 中等疲劳度
        C: { mem: 0.6, speed: 0.6, stability: 0.6 },
        M: 0.3, // 中等偏低动机
        conf: 0.6,
        ts: Date.now(),
      };

      const params = policy.decide(state);

      // 平衡模式特征
      expect(params.batch_size).toBe(8);
      expect(params.difficulty).toBe('mid');
      expect(params.hint_level).toBe(1);
      expect(params.interval_scale).toBe(1.0); // 标准间隔
      expect(params.new_ratio).toBe(0.2);
    });

    it('平衡模式应该使用标准间隔', () => {
      const state: UserState = {
        A: 0.6,
        F: 0.4,
        C: { mem: 0.6, speed: 0.6, stability: 0.6 },
        M: 0.2,
        conf: 0.6,
        ts: Date.now(),
      };

      const params = policy.decide(state);

      expect(params.interval_scale).toBe(1.0);
    });

    it('平衡模式应该使用中等批量', () => {
      const state: UserState = {
        A: 0.6,
        F: 0.5,
        C: { mem: 0.6, speed: 0.6, stability: 0.6 },
        M: 0.3,
        conf: 0.6,
        ts: Date.now(),
      };

      const params = policy.decide(state);

      expect(params.batch_size).toBe(8);
    });
  });

  // ==================== 低压力状态测试 ====================

  describe('low stress state (stress index <= 0.4)', () => {
    it('低疲劳度应该触发挑战模式', () => {
      const state: UserState = {
        A: 0.9, // 高注意力
        F: 0.1, // 低疲劳度
        C: { mem: 0.8, speed: 0.8, stability: 0.8 },
        M: 0.8, // 高动机
        conf: 0.9,
        ts: Date.now(),
      };

      const params = policy.decide(state);

      // 挑战模式特征
      expect(params.batch_size).toBe(12);
      expect(params.hint_level).toBe(0);
      expect(params.interval_scale).toBe(1.2); // 延长间隔
      expect(params.new_ratio).toBeGreaterThanOrEqual(0.2);
    });

    it('高记忆力应该提高难度', () => {
      const state: UserState = {
        A: 0.9,
        F: 0.1,
        C: { mem: 0.8, speed: 0.8, stability: 0.8 }, // 高记忆力
        M: 0.8,
        conf: 0.9,
        ts: Date.now(),
      };

      const params = policy.decide(state);

      expect(params.difficulty).toBe('hard');
    });

    it('中等记忆力应该保持中等难度', () => {
      const state: UserState = {
        A: 0.9,
        F: 0.1,
        C: { mem: 0.6, speed: 0.8, stability: 0.8 }, // 中等记忆力
        M: 0.8,
        conf: 0.9,
        ts: Date.now(),
      };

      const params = policy.decide(state);

      expect(params.difficulty).toBe('mid');
    });

    it('高速度应该增加新词比例', () => {
      const state: UserState = {
        A: 0.9,
        F: 0.1,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 }, // 高速度
        M: 0.8,
        conf: 0.9,
        ts: Date.now(),
      };

      const params = policy.decide(state);

      expect(params.new_ratio).toBe(0.3);
    });

    it('低速度应该使用标准新词比例', () => {
      const state: UserState = {
        A: 0.9,
        F: 0.1,
        C: { mem: 0.7, speed: 0.5, stability: 0.8 }, // 低速度
        M: 0.8,
        conf: 0.9,
        ts: Date.now(),
      };

      const params = policy.decide(state);

      expect(params.new_ratio).toBe(0.2);
    });

    it('挑战模式应该延长复习间隔', () => {
      const state: UserState = {
        A: 0.9,
        F: 0.1,
        C: { mem: 0.8, speed: 0.8, stability: 0.8 },
        M: 0.8,
        conf: 0.9,
        ts: Date.now(),
      };

      const params = policy.decide(state);

      expect(params.interval_scale).toBe(1.2);
    });

    it('挑战模式应该取消提示', () => {
      const state: UserState = {
        A: 0.9,
        F: 0.1,
        C: { mem: 0.8, speed: 0.8, stability: 0.8 },
        M: 0.8,
        conf: 0.9,
        ts: Date.now(),
      };

      const params = policy.decide(state);

      expect(params.hint_level).toBe(0);
    });
  });

  // ==================== 压力指数计算测试 ====================

  describe('stress index calculation', () => {
    it('应该综合考虑疲劳度、注意力和动机', () => {
      // 高压力状态
      const highStressState: UserState = {
        A: 0.2, // 低注意力
        F: 0.9, // 高疲劳度
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        M: -0.8, // 低动机
        conf: 0.5,
        ts: Date.now(),
      };

      const highStressParams = policy.decide(highStressState);

      // 低压力状态
      const lowStressState: UserState = {
        A: 0.9, // 高注意力
        F: 0.1, // 低疲劳度
        C: { mem: 0.8, speed: 0.8, stability: 0.8 },
        M: 0.8, // 高动机
        conf: 0.9,
        ts: Date.now(),
      };

      const lowStressParams = policy.decide(lowStressState);

      // 高压力应该更保守
      expect(highStressParams.batch_size).toBeLessThan(lowStressParams.batch_size);
      expect(highStressParams.hint_level).toBeGreaterThan(lowStressParams.hint_level);
    });

    it('疲劳度权重应该最高（0.5）', () => {
      // 只有高疲劳度
      const fatigueOnlyState: UserState = {
        A: 1.0,
        F: 1.0, // 最高疲劳度
        C: { mem: 1.0, speed: 1.0, stability: 1.0 },
        M: 1.0,
        conf: 1.0,
        ts: Date.now(),
      };

      const params = policy.decide(fatigueOnlyState);

      // 应该触发轻松模式
      expect(params.batch_size).toBe(5);
      expect(params.difficulty).toBe('easy');
    });

    it('注意力权重应该为0.3', () => {
      // 只有低注意力
      const attentionOnlyState: UserState = {
        A: 0.0, // 最低注意力
        F: 0.0,
        C: { mem: 1.0, speed: 1.0, stability: 1.0 },
        M: 1.0,
        conf: 1.0,
        ts: Date.now(),
      };

      const params = policy.decide(attentionOnlyState);

      // 低注意力应该影响策略
      expect(params.batch_size).toBeLessThanOrEqual(8);
    });

    it('动机权重应该为0.2', () => {
      // 只有低动机
      const motivationOnlyState: UserState = {
        A: 1.0,
        F: 0.0,
        C: { mem: 1.0, speed: 1.0, stability: 1.0 },
        M: -1.0, // 最低动机
        conf: 1.0,
        ts: Date.now(),
      };

      const params = policy.decide(motivationOnlyState);

      // 低动机应该影响策略但影响较小
      expect(params).toBeDefined();
    });
  });

  // ==================== 参数范围验证测试 ====================

  describe('parameter range validation', () => {
    it('所有参数应该在有效范围内', () => {
      const states: UserState[] = [
        // 高压力
        {
          A: 0.2,
          F: 0.9,
          C: { mem: 0.3, speed: 0.3, stability: 0.3 },
          M: -0.8,
          conf: 0.3,
          ts: Date.now(),
        },
        // 中等压力
        {
          A: 0.6,
          F: 0.5,
          C: { mem: 0.6, speed: 0.6, stability: 0.6 },
          M: 0.3,
          conf: 0.6,
          ts: Date.now(),
        },
        // 低压力
        {
          A: 0.9,
          F: 0.1,
          C: { mem: 0.9, speed: 0.9, stability: 0.9 },
          M: 0.9,
          conf: 0.9,
          ts: Date.now(),
        },
      ];

      states.forEach((state) => {
        const params = policy.decide(state);

        // batch_size 应该在合理范围内
        expect(params.batch_size).toBeGreaterThan(0);
        expect(params.batch_size).toBeLessThanOrEqual(20);

        // difficulty 应该是有效值
        expect(['easy', 'mid', 'hard']).toContain(params.difficulty);

        // hint_level 应该在 0-2 之间
        expect(params.hint_level).toBeGreaterThanOrEqual(0);
        expect(params.hint_level).toBeLessThanOrEqual(2);

        // interval_scale 应该在合理范围内
        expect(params.interval_scale).toBeGreaterThan(0);
        expect(params.interval_scale).toBeLessThanOrEqual(2);

        // new_ratio 应该在 0-1 之间
        expect(params.new_ratio).toBeGreaterThanOrEqual(0);
        expect(params.new_ratio).toBeLessThanOrEqual(1);
      });
    });

    it('应该返回所有必需的参数', () => {
      const state: UserState = {
        A: 0.7,
        F: 0.3,
        C: { mem: 0.7, speed: 0.7, stability: 0.7 },
        M: 0.5,
        conf: 0.7,
        ts: Date.now(),
      };

      const params = policy.decide(state);

      expect(params).toHaveProperty('batch_size');
      expect(params).toHaveProperty('difficulty');
      expect(params).toHaveProperty('hint_level');
      expect(params).toHaveProperty('interval_scale');
      expect(params).toHaveProperty('new_ratio');
    });
  });

  // ==================== 边界情况测试 ====================

  describe('edge cases', () => {
    it('应该处理所有状态为0的情况', () => {
      const zeroState: UserState = {
        A: 0,
        F: 0,
        C: { mem: 0, speed: 0, stability: 0 },
        M: 0,
        conf: 0,
        ts: Date.now(),
      };

      expect(() => policy.decide(zeroState)).not.toThrow();
      const params = policy.decide(zeroState);
      expect(params).toBeDefined();
    });

    it('应该处理所有状态为最大值的情况', () => {
      const maxState: UserState = {
        A: 1,
        F: 1,
        C: { mem: 1, speed: 1, stability: 1 },
        M: 1,
        conf: 1,
        ts: Date.now(),
      };

      expect(() => policy.decide(maxState)).not.toThrow();
      const params = policy.decide(maxState);
      expect(params).toBeDefined();
    });

    it('应该处理动机为负值的情况', () => {
      const negativeMotivation: UserState = {
        A: 0.7,
        F: 0.3,
        C: { mem: 0.7, speed: 0.7, stability: 0.7 },
        M: -0.5, // 负动机
        conf: 0.7,
        ts: Date.now(),
      };

      expect(() => policy.decide(negativeMotivation)).not.toThrow();
      const params = policy.decide(negativeMotivation);
      expect(params).toBeDefined();
    });

    it('应该处理认知能力不平衡的情况', () => {
      const unbalancedCognitive: UserState = {
        A: 0.7,
        F: 0.3,
        C: {
          mem: 0.9, // 高记忆力
          speed: 0.3, // 低速度
          stability: 0.5, // 中等稳定性
        },
        M: 0.5,
        conf: 0.7,
        ts: Date.now(),
      };

      expect(() => policy.decide(unbalancedCognitive)).not.toThrow();
      const params = policy.decide(unbalancedCognitive);
      expect(params).toBeDefined();
    });
  });

  // ==================== 上下文参数测试 ====================

  describe('context parameters', () => {
    it('应该接受可选的上下文参数', () => {
      const state: UserState = {
        A: 0.7,
        F: 0.3,
        C: { mem: 0.7, speed: 0.7, stability: 0.7 },
        M: 0.5,
        conf: 0.7,
        ts: Date.now(),
      };

      const context = {
        sessionDuration: 30, // 30分钟会话
        wordCount: 50,
        errorRate: 0.2,
      };

      expect(() => policy.decide(state, context)).not.toThrow();
      const params = policy.decide(state, context);
      expect(params).toBeDefined();
    });

    it('没有上下文参数也应该正常工作', () => {
      const state: UserState = {
        A: 0.7,
        F: 0.3,
        C: { mem: 0.7, speed: 0.7, stability: 0.7 },
        M: 0.5,
        conf: 0.7,
        ts: Date.now(),
      };

      expect(() => policy.decide(state)).not.toThrow();
      const params = policy.decide(state);
      expect(params).toBeDefined();
    });
  });

  // ==================== 策略一致性测试 ====================

  describe('policy consistency', () => {
    it('相同状态应该产生相同的策略参数', () => {
      const state: UserState = {
        A: 0.7,
        F: 0.3,
        C: { mem: 0.7, speed: 0.7, stability: 0.7 },
        M: 0.5,
        conf: 0.7,
        ts: Date.now(),
      };

      const params1 = policy.decide(state);
      const params2 = policy.decide(state);

      expect(params1).toEqual(params2);
    });

    it('状态微小变化应该产生稳定的策略', () => {
      const state1: UserState = {
        A: 0.7,
        F: 0.3,
        C: { mem: 0.7, speed: 0.7, stability: 0.7 },
        M: 0.5,
        conf: 0.7,
        ts: Date.now(),
      };

      const state2: UserState = {
        A: 0.71,
        F: 0.31,
        C: { mem: 0.71, speed: 0.71, stability: 0.71 },
        M: 0.51,
        conf: 0.71,
        ts: Date.now(),
      };

      const params1 = policy.decide(state1);
      const params2 = policy.decide(state2);

      // 微小变化不应该导致策略剧变
      expect(params1.batch_size).toBe(params2.batch_size);
      expect(params1.difficulty).toBe(params2.difficulty);
    });
  });

  // ==================== 工厂函数测试 ====================

  describe('factory function', () => {
    it('工厂函数应该创建新实例', () => {
      const instance1 = createFatigueBasedPolicy();
      const instance2 = createFatigueBasedPolicy();

      expect(instance1).toBeDefined();
      expect(instance2).toBeDefined();
      expect(instance1).not.toBe(instance2); // 不同实例
    });

    it('工厂函数创建的实例应该正常工作', () => {
      const instance = createFatigueBasedPolicy();

      const state: UserState = {
        A: 0.7,
        F: 0.3,
        C: { mem: 0.7, speed: 0.7, stability: 0.7 },
        M: 0.5,
        conf: 0.7,
        ts: Date.now(),
      };

      const params = instance.decide(state);

      expect(params).toBeDefined();
      expect(params).toHaveProperty('batch_size');
      expect(params).toHaveProperty('difficulty');
    });
  });

  // ==================== 压力级别转换测试 ====================

  describe('stress level transitions', () => {
    it('从轻松模式过渡到平衡模式', () => {
      // 初始：高压力（轻松模式）
      const highStressState: UserState = {
        A: 0.3,
        F: 0.8,
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        M: -0.2,
        conf: 0.5,
        ts: Date.now(),
      };

      const relaxedParams = policy.decide(highStressState);
      expect(relaxedParams.batch_size).toBe(5);

      // 改善后：中等压力（平衡模式）
      const mediumStressState: UserState = {
        A: 0.6,
        F: 0.5,
        C: { mem: 0.6, speed: 0.6, stability: 0.6 },
        M: 0.3,
        conf: 0.6,
        ts: Date.now(),
      };

      const balancedParams = policy.decide(mediumStressState);
      expect(balancedParams.batch_size).toBe(8);
      expect(balancedParams.batch_size).toBeGreaterThan(relaxedParams.batch_size);
    });

    it('从平衡模式过渡到挑战模式', () => {
      // 中等压力（平衡模式）
      const mediumStressState: UserState = {
        A: 0.6,
        F: 0.5,
        C: { mem: 0.6, speed: 0.6, stability: 0.6 },
        M: 0.3,
        conf: 0.6,
        ts: Date.now(),
      };

      const balancedParams = policy.decide(mediumStressState);
      expect(balancedParams.batch_size).toBe(8);

      // 状态良好：低压力（挑战模式）
      const lowStressState: UserState = {
        A: 0.9,
        F: 0.1,
        C: { mem: 0.8, speed: 0.8, stability: 0.8 },
        M: 0.8,
        conf: 0.9,
        ts: Date.now(),
      };

      const challengeParams = policy.decide(lowStressState);
      expect(challengeParams.batch_size).toBe(12);
      expect(challengeParams.batch_size).toBeGreaterThan(balancedParams.batch_size);
    });

    it('从挑战模式回退到平衡模式', () => {
      // 低压力（挑战模式）
      const lowStressState: UserState = {
        A: 0.9,
        F: 0.1,
        C: { mem: 0.8, speed: 0.8, stability: 0.8 },
        M: 0.8,
        conf: 0.9,
        ts: Date.now(),
      };

      const challengeParams = policy.decide(lowStressState);
      expect(challengeParams.batch_size).toBe(12);

      // 疲劳增加：回到中等压力
      const increasedFatigueState: UserState = {
        A: 0.6,
        F: 0.5,
        C: { mem: 0.7, speed: 0.7, stability: 0.7 },
        M: 0.3,
        conf: 0.7,
        ts: Date.now(),
      };

      const balancedParams = policy.decide(increasedFatigueState);
      expect(balancedParams.batch_size).toBe(8);
      expect(balancedParams.batch_size).toBeLessThan(challengeParams.batch_size);
    });
  });

  // ==================== 难度调整策略测试 ====================

  describe('difficulty adjustment', () => {
    it('低压力 + 高记忆力 = 困难模式', () => {
      const state: UserState = {
        A: 0.9,
        F: 0.1,
        C: { mem: 0.8, speed: 0.7, stability: 0.8 }, // 高记忆力
        M: 0.8,
        conf: 0.9,
        ts: Date.now(),
      };

      const params = policy.decide(state);
      expect(params.difficulty).toBe('hard');
    });

    it('低压力 + 中等记忆力 = 中等难度', () => {
      const state: UserState = {
        A: 0.9,
        F: 0.1,
        C: { mem: 0.65, speed: 0.7, stability: 0.8 }, // 中等记忆力
        M: 0.8,
        conf: 0.9,
        ts: Date.now(),
      };

      const params = policy.decide(state);
      expect(params.difficulty).toBe('mid');
    });

    it('低压力 + 低记忆力 = 中等难度', () => {
      const state: UserState = {
        A: 0.9,
        F: 0.1,
        C: { mem: 0.4, speed: 0.7, stability: 0.8 }, // 低记忆力
        M: 0.8,
        conf: 0.9,
        ts: Date.now(),
      };

      const params = policy.decide(state);
      expect(params.difficulty).toBe('mid');
    });

    it('中等压力 = 始终中等难度', () => {
      const states: UserState[] = [
        {
          A: 0.6,
          F: 0.5,
          C: { mem: 0.3, speed: 0.6, stability: 0.6 },
          M: 0.3,
          conf: 0.6,
          ts: Date.now(),
        },
        {
          A: 0.6,
          F: 0.5,
          C: { mem: 0.9, speed: 0.6, stability: 0.6 },
          M: 0.3,
          conf: 0.6,
          ts: Date.now(),
        },
      ];

      states.forEach((state) => {
        const params = policy.decide(state);
        expect(params.difficulty).toBe('mid');
      });
    });

    it('高压力 = 始终简单难度', () => {
      const states: UserState[] = [
        {
          A: 0.2,
          F: 0.9,
          C: { mem: 0.3, speed: 0.3, stability: 0.3 },
          M: -0.5,
          conf: 0.3,
          ts: Date.now(),
        },
        {
          A: 0.2,
          F: 0.9,
          C: { mem: 0.9, speed: 0.9, stability: 0.9 },
          M: -0.5,
          conf: 0.9,
          ts: Date.now(),
        },
      ];

      states.forEach((state) => {
        const params = policy.decide(state);
        expect(params.difficulty).toBe('easy');
      });
    });
  });

  // ==================== 实际场景模拟测试 ====================

  describe('real-world scenarios', () => {
    it('早晨刚开始学习（精力充沛）', () => {
      const morningState: UserState = {
        A: 0.9,
        F: 0.1,
        C: { mem: 0.8, speed: 0.8, stability: 0.8 },
        M: 0.8,
        conf: 0.9,
        ts: Date.now(),
      };

      const params = policy.decide(morningState);

      expect(params.batch_size).toBe(12); // 大批量
      expect(params.difficulty).toBe('hard'); // 高难度
      expect(params.hint_level).toBe(0); // 无提示
      expect(params.new_ratio).toBeGreaterThanOrEqual(0.2); // 适量新词
    });

    it('长时间学习后（疲劳状态）', () => {
      const tiredState: UserState = {
        A: 0.4,
        F: 0.8,
        C: { mem: 0.6, speed: 0.5, stability: 0.6 },
        M: 0.1,
        conf: 0.6,
        ts: Date.now(),
      };

      const params = policy.decide(tiredState);

      expect(params.batch_size).toBe(5); // 小批量
      expect(params.difficulty).toBe('easy'); // 简单难度
      expect(params.hint_level).toBe(2); // 完整提示
      expect(params.new_ratio).toBe(0.1); // 少量新词
    });

    it('学习进展顺利（建立信心）', () => {
      const confidentState: UserState = {
        A: 0.8,
        F: 0.3,
        C: { mem: 0.75, speed: 0.8, stability: 0.8 },
        M: 0.7,
        conf: 0.85,
        ts: Date.now(),
      };

      const params = policy.decide(confidentState);

      expect(params.batch_size).toBe(12); // 可以多学
      expect(params.difficulty).toBe('hard'); // 可以挑战
      expect(params.new_ratio).toBeGreaterThanOrEqual(0.2); // 接受新词
    });

    it('遇到挫折（需要鼓励）', () => {
      const frustratedState: UserState = {
        A: 0.5,
        F: 0.6,
        C: { mem: 0.4, speed: 0.4, stability: 0.4 },
        M: -0.4,
        conf: 0.4,
        ts: Date.now(),
      };

      const params = policy.decide(frustratedState);

      expect(params.batch_size).toBe(5); // 减少压力
      expect(params.difficulty).toBe('easy'); // 降低难度
      expect(params.hint_level).toBe(2); // 增加帮助
      expect(params.new_ratio).toBe(0.1); // 巩固为主
    });
  });
});
