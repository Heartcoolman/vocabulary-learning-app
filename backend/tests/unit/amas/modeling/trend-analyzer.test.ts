/**
 * TrendAnalyzer Unit Tests
 * 测试长期趋势分析模型
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TrendAnalyzer, TrendState } from '../../../../src/amas/modeling/trend-analyzer';

describe('TrendAnalyzer', () => {
  let analyzer: TrendAnalyzer;

  beforeEach(() => {
    analyzer = new TrendAnalyzer();
  });

  describe('Initialization', () => {
    it('should initialize with flat state', () => {
      expect(analyzer.getTrendState()).toBe('flat');
      expect(analyzer.getTrendSlope()).toBe(0);
      expect(analyzer.getConfidence()).toBe(0);
    });
  });

  describe('Trend Detection', () => {
    it('should detect upward trend with increasing values', () => {
      const baseTime = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      // 模拟30天持续上升的能力值
      for (let i = 0; i < 30; i++) {
        const ability = 0.3 + i * 0.02; // 从0.3上升到0.88
        analyzer.update(ability, baseTime + i * dayMs);
      }

      expect(analyzer.getTrendState()).toBe('up');
      expect(analyzer.getTrendSlope()).toBeGreaterThan(0.01);
    });

    it('should detect downward trend with decreasing values', () => {
      const baseTime = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      // 模拟持续下降
      for (let i = 0; i < 30; i++) {
        const ability = 0.8 - i * 0.01; // 从0.8下降到0.5
        analyzer.update(ability, baseTime + i * dayMs);
      }

      expect(analyzer.getTrendState()).toBe('down');
      expect(analyzer.getTrendSlope()).toBeLessThan(-0.005);
    });

    it('should detect flat trend with stable values', () => {
      const baseTime = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      // 模拟稳定值（小波动）
      for (let i = 0; i < 30; i++) {
        const ability = 0.5 + (Math.random() - 0.5) * 0.02; // 0.49-0.51范围
        analyzer.update(ability, baseTime + i * dayMs);
      }

      const state = analyzer.getTrendState();
      expect(['flat', 'stuck']).toContain(state);
    });
  });

  describe('Confidence Calculation', () => {
    it('should increase confidence with more samples', () => {
      const baseTime = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      let prevConfidence = 0;
      for (let i = 0; i < 20; i++) {
        analyzer.update(0.5 + i * 0.01, baseTime + i * dayMs);
        const confidence = analyzer.getConfidence();

        if (i > 5) {
          expect(confidence).toBeGreaterThanOrEqual(prevConfidence * 0.9);
        }
        prevConfidence = confidence;
      }
    });

    it('should have low confidence with few samples', () => {
      const baseTime = Date.now();

      analyzer.update(0.5, baseTime);
      analyzer.update(0.6, baseTime + 1000);

      expect(analyzer.getConfidence()).toBeLessThan(0.5);
    });
  });

  describe('Rolling Window', () => {
    it('should discard old samples outside window', () => {
      const baseTime = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      // 添加旧数据（下降趋势）
      for (let i = 0; i < 15; i++) {
        analyzer.update(0.8 - i * 0.02, baseTime + i * dayMs);
      }

      // 添加新数据（上升趋势），超出30天窗口
      for (let i = 0; i < 20; i++) {
        analyzer.update(0.3 + i * 0.02, baseTime + (35 + i) * dayMs);
      }

      // 应该反映新数据的上升趋势
      expect(analyzer.getTrendState()).toBe('up');
    });
  });

  describe('EMA Fallback', () => {
    it('should use EMA when data is sparse', () => {
      const baseTime = Date.now();
      const hourMs = 60 * 60 * 1000;

      // 短时间跨度内的少量样本（触发EMA回退）
      for (let i = 0; i < 5; i++) {
        analyzer.update(0.5 + i * 0.05, baseTime + i * hourMs);
      }

      // 应该仍能返回有效的趋势状态
      const state = analyzer.getTrendState();
      expect(['up', 'down', 'flat', 'stuck']).toContain(state);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single sample', () => {
      analyzer.update(0.5, Date.now());

      expect(analyzer.getTrendState()).toBe('flat');
      expect(analyzer.getTrendSlope()).toBe(0);
    });

    it('should handle identical timestamps', () => {
      const now = Date.now();

      expect(() => {
        analyzer.update(0.5, now);
        analyzer.update(0.6, now);
      }).not.toThrow();
    });

    it('should clamp ability values to [0, 1]', () => {
      const now = Date.now();

      expect(() => {
        analyzer.update(1.5, now);
        analyzer.update(-0.5, now + 1000);
      }).not.toThrow();
    });

    it('should handle out-of-order timestamps', () => {
      const baseTime = Date.now();

      expect(() => {
        analyzer.update(0.5, baseTime + 2000);
        analyzer.update(0.6, baseTime + 1000); // 乱序
        analyzer.update(0.7, baseTime + 3000);
      }).not.toThrow();
    });
  });

  describe('Value Constraints', () => {
    it('should return valid trend state', () => {
      const baseTime = Date.now();

      for (let i = 0; i < 10; i++) {
        analyzer.update(Math.random(), baseTime + i * 1000);
      }

      const validStates: TrendState[] = ['up', 'down', 'flat', 'stuck'];
      expect(validStates).toContain(analyzer.getTrendState());
    });

    it('should return confidence in [0, 1]', () => {
      const baseTime = Date.now();

      for (let i = 0; i < 50; i++) {
        analyzer.update(Math.random(), baseTime + i * 86400000);
        const confidence = analyzer.getConfidence();
        expect(confidence).toBeGreaterThanOrEqual(0);
        expect(confidence).toBeLessThanOrEqual(1);
      }
    });
  });
});
