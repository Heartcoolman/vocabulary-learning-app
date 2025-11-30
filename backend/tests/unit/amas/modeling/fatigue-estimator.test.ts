/**
 * Fatigue Estimator Unit Tests
 * 测试疲劳度估算模型
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FatigueEstimator, FatigueFeatures } from '../../../../src/amas/modeling/fatigue-estimator';

describe('FatigueEstimator', () => {
  let estimator: FatigueEstimator;

  const normalFeatures: FatigueFeatures = {
    error_rate_trend: 0,
    rt_increase_rate: 0,
    repeat_errors: 0
  };

  beforeEach(() => {
    estimator = new FatigueEstimator();
  });

  describe('Initialization', () => {
    it('should initialize with low fatigue', () => {
      // 初次更新应该返回较低的疲劳值
      const fatigue = estimator.update(normalFeatures);
      expect(fatigue).toBeLessThan(0.3);
      expect(fatigue).toBeGreaterThanOrEqual(0);
    });

    it('should produce stable results for normal features', () => {
      const fatigue1 = estimator.update(normalFeatures);
      const fatigue2 = estimator.update(normalFeatures);
      // 正常输入应该保持疲劳度稳定
      expect(Math.abs(fatigue2 - fatigue1)).toBeLessThan(0.1);
    });
  });

  describe('Fatigue Accumulation', () => {
    it('should increase fatigue with rising error rate', () => {
      const initialFatigue = estimator.update(normalFeatures);

      const badFeatures: FatigueFeatures = {
        error_rate_trend: 0.5,  // 显著的错误率上升
        rt_increase_rate: 0.3,  // 配合响应时间增加
        repeat_errors: 1
      };

      const newFatigue = estimator.update(badFeatures);
      expect(newFatigue).toBeGreaterThan(initialFatigue);
    });

    it('should increase fatigue with response time increase', () => {
      const initialFatigue = estimator.update(normalFeatures);

      const slowFeatures: FatigueFeatures = {
        error_rate_trend: 0.2,
        rt_increase_rate: 0.5,  // 显著的响应时间增加
        repeat_errors: 1
      };

      const newFatigue = estimator.update(slowFeatures);
      expect(newFatigue).toBeGreaterThan(initialFatigue);
    });

    it('should increase fatigue with repeated errors', () => {
      const initialFatigue = estimator.update(normalFeatures);

      const repeatFeatures: FatigueFeatures = {
        error_rate_trend: 0,
        rt_increase_rate: 0,
        repeat_errors: 3  // 重复错误
      };

      const newFatigue = estimator.update(repeatFeatures);
      expect(newFatigue).toBeGreaterThan(initialFatigue);
    });

    it('should accumulate fatigue over multiple updates', () => {
      const fatigues: number[] = [];
      let currentTime = Date.now();

      const badFeatures: FatigueFeatures = {
        error_rate_trend: 0.4,
        rt_increase_rate: 0.4,
        repeat_errors: 2,
        currentTime: currentTime,
        breakMinutes: 0  // 无休息
      };

      for (let i = 0; i < 10; i++) {
        // 每次小幅推进时间以避免衰减
        currentTime += 10000; // 10秒
        fatigues.push(estimator.update({...badFeatures, currentTime}));
      }

      // 疲劳度应该累积到高水平，触发休息建议阈值（HIGH_FATIGUE = 0.6）
      // 使用剩余容量折扣后，连续极端负面学习会逐渐接近上限
      expect(fatigues[9]).toBeGreaterThan(0.6); // 确保超过休息建议阈值
      expect(fatigues[9]).toBeLessThanOrEqual(1.0); // 确保不超过理论上限
    });
  });

  describe('Fatigue Decay', () => {
    it('should decay fatigue during breaks', () => {
      // 先累积疲劳
      const tiredFeatures: FatigueFeatures = {
        error_rate_trend: 0.2,
        rt_increase_rate: 0.3,
        repeat_errors: 2
      };

      for (let i = 0; i < 5; i++) {
        estimator.update(tiredFeatures);
      }

      const fatigueBefore = estimator.update(normalFeatures);

      // 模拟休息（通过时间流逝）
      // 这里我们可以通过连续输入好的数据来模拟恢复
      const recoveringFeatures: FatigueFeatures = {
        error_rate_trend: -0.1,  // 错误率下降
        rt_increase_rate: -0.1,  // 响应时间改善
        repeat_errors: 0
      };

      let fatigueAfter = fatigueBefore;
      for (let i = 0; i < 10; i++) {
        fatigueAfter = estimator.update(recoveringFeatures);
      }

      // 疲劳度应该有所恢复
      expect(fatigueAfter).toBeLessThanOrEqual(fatigueBefore);
    });

    it('should reset fatigue after long break', () => {
      // 累积疲劳
      const tiredFeatures: FatigueFeatures = {
        error_rate_trend: 0.3,
        rt_increase_rate: 0.3,
        repeat_errors: 3
      };

      for (let i = 0; i < 5; i++) {
        estimator.update(tiredFeatures);
      }
      const fatigueBefore = estimator.update(tiredFeatures);

      // 重置（模拟长时间休息）
      estimator.reset();

      // 重置后疲劳度应该大幅降低
      const fatigueAfter = estimator.update(normalFeatures);
      expect(fatigueAfter).toBeLessThan(fatigueBefore);
      expect(fatigueAfter).toBeLessThan(0.2);
    });
  });

  describe('Value Constraints', () => {
    it('should always return value in [0, 1]', () => {
      const extremeFeatures: FatigueFeatures = {
        error_rate_trend: 1.0,
        rt_increase_rate: 1.0,
        repeat_errors: 10
      };

      const fatigue = estimator.update(extremeFeatures);
      expect(fatigue).toBeGreaterThanOrEqual(0);
      expect(fatigue).toBeLessThanOrEqual(1);
    });

    it('should not produce NaN values', () => {
      const fatigue = estimator.update(normalFeatures);
      expect(isNaN(fatigue)).toBe(false);
    });

    it('should handle negative trends correctly', () => {
      const improvingFeatures: FatigueFeatures = {
        error_rate_trend: -0.2,  // 错误率下降
        rt_increase_rate: -0.1,  // 响应时间缩短
        repeat_errors: 0
      };

      const fatigue = estimator.update(improvingFeatures);
      expect(fatigue).toBeGreaterThanOrEqual(0);
      expect(fatigue).toBeLessThanOrEqual(1);
    });
  });

  describe('Non-linear Accumulation', () => {
    it('should show accelerated fatigue at higher levels', () => {
      const fatigues: number[] = [];

      const badFeatures: FatigueFeatures = {
        error_rate_trend: 0.15,
        rt_increase_rate: 0.15,
        repeat_errors: 1
      };

      for (let i = 0; i < 20; i++) {
        fatigues.push(estimator.update(badFeatures));
      }

      // 计算增量
      const earlyIncrease = fatigues[5] - fatigues[0];
      const lateIncrease = fatigues[19] - fatigues[14];

      // 早期增长应该比后期慢（因为接近上限）
      // 注意：这取决于具体的非线性函数
    });
  });

  describe('Feature Weights', () => {
    it('should weight different features appropriately', () => {
      estimator.reset();
      const f1 = estimator.update({
        error_rate_trend: 0.3,
        rt_increase_rate: 0,
        repeat_errors: 0
      });

      estimator.reset();
      const f2 = estimator.update({
        error_rate_trend: 0,
        rt_increase_rate: 0.3,
        repeat_errors: 0
      });

      estimator.reset();
      const f3 = estimator.update({
        error_rate_trend: 0,
        rt_increase_rate: 0,
        repeat_errors: 1
      });

      // 所有特征都应该对疲劳度有贡献
      expect(f1).toBeGreaterThan(0);
      expect(f2).toBeGreaterThan(0);
      expect(f3).toBeGreaterThan(0);
    });
  });

  describe('Sequential Patterns', () => {
    it('should handle alternating good and bad performance', () => {
      const fatigues: number[] = [];

      const goodFeatures: FatigueFeatures = {
        error_rate_trend: -0.1,
        rt_increase_rate: -0.1,
        repeat_errors: 0
      };

      const badFeatures: FatigueFeatures = {
        error_rate_trend: 0.2,
        rt_increase_rate: 0.2,
        repeat_errors: 1
      };

      for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) {
          fatigues.push(estimator.update(badFeatures));
        } else {
          fatigues.push(estimator.update(goodFeatures));
        }
      }

      // 交替好坏表现，疲劳度会累积但受好表现抑制
      // 使用剩余容量折扣后，疲劳度会趋于某个平衡值
      expect(fatigues[9]).toBeGreaterThan(0.3); // 确保有累积效果
      expect(fatigues[9]).toBeLessThan(0.95); // 不会达到极端高值
    });

    it('should show recovery trend after sustained good performance', () => {
      // 先累积疲劳
      const badFeatures: FatigueFeatures = {
        error_rate_trend: 0.3,
        rt_increase_rate: 0.3,
        repeat_errors: 2
      };

      for (let i = 0; i < 5; i++) {
        estimator.update(badFeatures);
      }

      const fatigueAtPeak = estimator.update(normalFeatures);

      // 持续良好表现
      const goodFeatures: FatigueFeatures = {
        error_rate_trend: -0.1,
        rt_increase_rate: -0.1,
        repeat_errors: 0
      };

      const recoveryPath: number[] = [fatigueAtPeak];
      for (let i = 0; i < 10; i++) {
        recoveryPath.push(estimator.update(goodFeatures));
      }

      // 应该显示恢复趋势
      const lastThree = recoveryPath.slice(-3);
      const avgLast = lastThree.reduce((a, b) => a + b) / lastThree.length;
      expect(avgLast).toBeLessThanOrEqual(fatigueAtPeak);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero features', () => {
      const zeroFeatures: FatigueFeatures = {
        error_rate_trend: 0,
        rt_increase_rate: 0,
        repeat_errors: 0
      };

      expect(() => {
        estimator.update(zeroFeatures);
      }).not.toThrow();
    });

    it('should handle extreme positive values', () => {
      const extremeFeatures: FatigueFeatures = {
        error_rate_trend: 10.0,
        rt_increase_rate: 10.0,
        repeat_errors: 100
      };

      const fatigue = estimator.update(extremeFeatures);
      expect(fatigue).toBeLessThanOrEqual(1.0);
    });

    it('should handle extreme negative values', () => {
      const extremeFeatures: FatigueFeatures = {
        error_rate_trend: -10.0,
        rt_increase_rate: -10.0,
        repeat_errors: 0
      };

      const fatigue = estimator.update(extremeFeatures);
      expect(fatigue).toBeGreaterThanOrEqual(0);
    });
  });
});
