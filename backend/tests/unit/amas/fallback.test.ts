/**
 * Fallback Strategies Tests
 * 降级策略单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  safeDefaultStrategy,
  rulesBasedFallback,
  timeAwareFallback,
  intelligentFallback
} from '../../../src/amas/decision/fallback';
import { UserState } from '../../../src/amas/types';

describe('Fallback Strategies', () => {
  const createMockState = (overrides?: Partial<UserState>): UserState => ({
    A: 0.7, // 注意力
    F: 0.3, // 疲劳度
    M: 0.2, // 动机
    C: {
      mem: 0.7,
      speed: 0.6,
      stability: 0.7
    },
    conf: 0.8,
    ts: Date.now(),
    ...overrides
  });

  describe('safeDefaultStrategy', () => {
    it('应该返回安全默认策略', () => {
      const result = safeDefaultStrategy('circuit_open');

      expect(result.degraded).toBe(true);
      expect(result.reason).toBe('circuit_open');
      expect(result.strategy).toEqual({
        interval_scale: 1.0,
        new_ratio: 0.2,
        difficulty: 'mid',
        batch_size: 8,
        hint_level: 1
      });
      expect(result.explanation).toContain('安全默认策略');
    });
  });

  describe('rulesBasedFallback', () => {
    it('当状态为null时应该返回安全默认', () => {
      const result = rulesBasedFallback(null, 'exception');

      expect(result.degraded).toBe(true);
      expect(result.strategy.difficulty).toBe('mid');
    });

    it('应该为高疲劳应用保护策略', () => {
      const state = createMockState({ F: 0.7 });
      const result = rulesBasedFallback(state, 'exception');

      expect(result.strategy.interval_scale).toBe(1.2);
      expect(result.strategy.new_ratio).toBe(0.1);
      expect(result.strategy.difficulty).toBe('easy');
      expect(result.strategy.batch_size).toBe(5);
      expect(result.strategy.hint_level).toBe(2);
      expect(result.explanation).toContain('疲劳度较高');
    });

    it('应该为低动机应用鼓励策略', () => {
      const state = createMockState({ M: -0.4 });
      const result = rulesBasedFallback(state, 'exception');

      expect(result.strategy.difficulty).toBe('easy');
      expect(result.strategy.new_ratio).toBe(0.15);
      expect(result.strategy.hint_level).toBe(2);
      expect(result.explanation).toContain('动机偏低');
    });

    it('应该为低注意力应用短批次策略', () => {
      const state = createMockState({ A: 0.3 });
      const result = rulesBasedFallback(state, 'exception');

      expect(result.strategy.interval_scale).toBe(0.8);
      expect(result.strategy.new_ratio).toBe(0.1);
      expect(result.strategy.batch_size).toBe(5);
      expect(result.explanation).toContain('注意力不集中');
    });

    it('应该为低记忆力应用巩固策略', () => {
      const state = createMockState({
        C: { mem: 0.5, speed: 0.6, stability: 0.7 }
      });
      const result = rulesBasedFallback(state, 'exception');

      expect(result.strategy.interval_scale).toBe(0.8);
      expect(result.strategy.new_ratio).toBe(0.1);
      expect(result.explanation).toContain('巩固策略');
    });

    it('应该为高能力状态应用挑战策略', () => {
      const state = createMockState({
        A: 0.8,
        F: 0.2,
        M: 0.5,
        C: { mem: 0.8, speed: 0.7, stability: 0.8 }
      });
      const result = rulesBasedFallback(state, 'exception');

      expect(result.strategy.interval_scale).toBe(1.2);
      expect(result.strategy.new_ratio).toBe(0.3);
      expect(result.strategy.batch_size).toBe(12);
      expect(result.strategy.hint_level).toBe(0);
      expect(result.explanation).toContain('挑战性策略');
    });

    it('应该为正常状态返回标准策略', () => {
      const state = createMockState();
      const result = rulesBasedFallback(state, 'exception');

      expect(result.strategy.interval_scale).toBe(1.0);
      expect(result.strategy.new_ratio).toBe(0.2);
      expect(result.strategy.difficulty).toBe('mid');
    });
  });

  describe('timeAwareFallback', () => {
    it('应该为早晨时段(6-9)使用温和策略', () => {
      const state = createMockState();
      const result = timeAwareFallback(state, 'exception', 8);

      expect(result.strategy.difficulty).toBe('easy');
      expect(result.strategy.new_ratio).toBe(0.15);
      expect(result.strategy.batch_size).toBe(6);
      expect(result.explanation).toContain('早晨时段');
    });

    it('应该为午后时段(13-15)使用标准策略', () => {
      const state = createMockState();
      const result = timeAwareFallback(state, 'exception', 14);

      expect(result.strategy.new_ratio).toBe(0.25);
      expect(result.strategy.difficulty).toBe('mid');
      expect(result.strategy.batch_size).toBe(10);
      expect(result.explanation).toContain('午后时段');
    });

    it('应该为晚间时段(19-22)使用巩固策略', () => {
      const state = createMockState();
      const result = timeAwareFallback(state, 'exception', 20);

      expect(result.strategy.interval_scale).toBe(1.2);
      expect(result.strategy.new_ratio).toBe(0.15);
      expect(result.explanation).toContain('晚间时段');
    });

    it('应该为深夜时段(22-6)使用轻负荷策略', () => {
      const state = createMockState();
      const result = timeAwareFallback(state, 'exception', 23);

      expect(result.strategy.difficulty).toBe('easy');
      expect(result.strategy.new_ratio).toBe(0.1);
      expect(result.strategy.batch_size).toBe(5);
      expect(result.strategy.hint_level).toBe(2);
      expect(result.explanation).toContain('深夜时段');
    });

    it('应该为其他时段使用规则策略', () => {
      const state = createMockState();
      const result = timeAwareFallback(state, 'exception', 10);

      expect(result.degraded).toBe(true);
    });
  });

  describe('intelligentFallback', () => {
    it('应该为冷启动阶段(<20次交互)使用安全默认', () => {
      const state = createMockState();
      const result = intelligentFallback(state, 'exception', {
        interactionCount: 15
      });

      expect(result.strategy.interval_scale).toBe(1.0);
      expect(result.strategy.difficulty).toBe('mid');
    });

    it('应该为高错误率降低难度', () => {
      const state = createMockState();
      const result = intelligentFallback(state, 'exception', {
        interactionCount: 50,
        recentErrorRate: 0.6
      });

      expect(result.strategy.difficulty).toBe('easy');
      expect(result.strategy.new_ratio).toBe(0.1);
      expect(result.strategy.hint_level).toBe(2);
      expect(result.explanation).toContain('错误率较高');
    });

    it('应该优先使用时间敏感策略', () => {
      const state = createMockState();
      const result = intelligentFallback(state, 'exception', {
        interactionCount: 50,
        hour: 8
      });

      expect(result.explanation).toContain('早晨时段');
    });

    it('应该默认使用规则策略', () => {
      const state = createMockState({ F: 0.7 });
      const result = intelligentFallback(state, 'exception', {
        interactionCount: 50
      });

      expect(result.explanation).toContain('疲劳度较高');
    });
  });

  describe('降级原因', () => {
    it('应该正确传递降级原因', () => {
      const reasons = [
        'circuit_open',
        'timeout',
        'exception',
        'missing_features',
        'model_unavailable',
        'degraded_state'
      ] as const;

      for (const reason of reasons) {
        const result = safeDefaultStrategy(reason);
        expect(result.reason).toBe(reason);
      }
    });
  });

  describe('策略一致性', () => {
    it('所有降级策略应该标记degraded为true', () => {
      const state = createMockState();

      expect(safeDefaultStrategy('exception').degraded).toBe(true);
      expect(rulesBasedFallback(state, 'exception').degraded).toBe(true);
      expect(timeAwareFallback(state, 'exception').degraded).toBe(true);
      expect(intelligentFallback(state, 'exception').degraded).toBe(true);
    });

    it('所有降级策略应该包含explanation', () => {
      const state = createMockState();

      expect(safeDefaultStrategy('exception').explanation).toBeTruthy();
      expect(rulesBasedFallback(state, 'exception').explanation).toBeTruthy();
      expect(timeAwareFallback(state, 'exception').explanation).toBeTruthy();
      expect(intelligentFallback(state, 'exception').explanation).toBeTruthy();
    });

    it('所有策略参数应该在合理范围内', () => {
      const state = createMockState();
      const strategies = [
        safeDefaultStrategy('exception'),
        rulesBasedFallback(state, 'exception'),
        timeAwareFallback(state, 'exception', 10),
        intelligentFallback(state, 'exception')
      ];

      for (const result of strategies) {
        const { strategy } = result;
        expect(strategy.interval_scale).toBeGreaterThanOrEqual(0.5);
        expect(strategy.interval_scale).toBeLessThanOrEqual(1.5);
        expect(strategy.new_ratio).toBeGreaterThanOrEqual(0.1);
        expect(strategy.new_ratio).toBeLessThanOrEqual(0.4);
        expect(['easy', 'mid', 'hard']).toContain(strategy.difficulty);
        expect(strategy.batch_size).toBeGreaterThanOrEqual(5);
        expect(strategy.batch_size).toBeLessThanOrEqual(16);
        expect([0, 1, 2]).toContain(strategy.hint_level);
      }
    });
  });
});
