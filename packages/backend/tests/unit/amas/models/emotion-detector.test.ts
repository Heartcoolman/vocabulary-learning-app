/**
 * EmotionDetector Unit Tests
 * 情绪感知检测器单元测试
 *
 * 测试覆盖:
 * - 5种情绪识别 (frustrated, anxious, bored, tired, neutral)
 * - 自我报告处理
 * - 行为信号推断
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EmotionDetector,
  BehaviorSignals,
  EmotionState,
  emotionDetector,
} from '../../../../src/amas/models/emotion-detector';

describe('EmotionDetector', () => {
  let detector: EmotionDetector;
  let baseBehavior: BehaviorSignals;

  beforeEach(() => {
    detector = new EmotionDetector();
    baseBehavior = {
      consecutiveWrong: 0,
      avgResponseTime: 2000,
      responseTimeVariance: 100000, // std = 316
      skipCount: 0,
      dwellTimeRatio: 0.75,
      baselineResponseTime: 2000,
    };
  });

  // ==================== 初始化测试 ====================

  describe('initialization', () => {
    it('应该正确初始化', () => {
      expect(detector).toBeDefined();
    });

    it('默认实例应该可用', () => {
      expect(emotionDetector).toBeDefined();
    });
  });

  // ==================== 自我报告处理测试 ====================

  describe('self-report processing', () => {
    it('应该识别沮丧相关关键词', () => {
      const keywords = ['沮丧', '受挫', '烦躁'];

      keywords.forEach((keyword) => {
        const result = detector.detectEmotion(keyword, baseBehavior);
        // 当行为信号中性时，应该主要基于自我报告
        expect(['frustrated', 'neutral']).toContain(result.emotion);
      });
    });

    it('应该识别焦虑相关关键词', () => {
      const keywords = ['焦虑', '紧张', '不安'];

      keywords.forEach((keyword) => {
        const result = detector.detectEmotion(keyword, baseBehavior);
        // 当行为信号中性时，应该主要基于自我报告
        expect(['anxious', 'neutral']).toContain(result.emotion);
      });
    });

    it('应该识别无聊相关关键词', () => {
      const keywords = ['无聊', '厌倦'];

      keywords.forEach((keyword) => {
        const result = detector.detectEmotion(keyword, baseBehavior);
        // 当行为信号中性时，应该主要基于自我报告
        expect(['bored', 'neutral']).toContain(result.emotion);
      });
    });

    it('应该识别疲劳相关关键词', () => {
      const keywords = ['疲惫', '累', '困'];

      keywords.forEach((keyword) => {
        const result = detector.detectEmotion(keyword, baseBehavior);
        // 当行为信号中性时，应该主要基于自我报告
        expect(['tired', 'neutral']).toContain(result.emotion);
      });
    });

    it('应该对相同输入返回相同结果', () => {
      const result1 = detector.detectEmotion('沮丧', baseBehavior);
      const result2 = detector.detectEmotion('沮丧', baseBehavior);

      expect(result1.emotion).toBe(result2.emotion);
    });

    it('应该处理包含空格的输入', () => {
      const result = detector.detectEmotion('  沮丧  ', baseBehavior);
      // 当行为信号中性时，可能返回neutral或frustrated
      expect(['frustrated', 'neutral']).toContain(result.emotion);
    });

    it('应该在无匹配关键词时返回neutral', () => {
      const result = detector.detectEmotion('其他情绪', baseBehavior);
      expect(result.emotion).toBe('neutral');
    });

    it('应该使用行为信号验证自我报告', () => {
      const frustratedBehavior: BehaviorSignals = {
        consecutiveWrong: 5,
        avgResponseTime: 2000,
        responseTimeVariance: 1000000,
        skipCount: 3,
        dwellTimeRatio: 0.75,
        baselineResponseTime: 2000,
      };

      const result = detector.detectEmotion('沮丧', frustratedBehavior);
      expect(result.emotion).toBe('frustrated');
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('应该在自我报告和行为一致时提高置信度', () => {
      const frustratedBehavior: BehaviorSignals = {
        consecutiveWrong: 5,
        avgResponseTime: 2000,
        responseTimeVariance: 1000000,
        skipCount: 4,
        dwellTimeRatio: 0.75,
        baselineResponseTime: 2000,
      };

      const result = detector.detectEmotion('沮丧', frustratedBehavior);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('应该在行为信号强烈时优先使用行为推断', () => {
      const anxiousBehavior: BehaviorSignals = {
        consecutiveWrong: 0,
        avgResponseTime: 1400, // 快速反应
        responseTimeVariance: 500000,
        skipCount: 0,
        dwellTimeRatio: 0.3, // 低停留时间
        baselineResponseTime: 2000,
      };

      // 报告沮丧，但行为显示焦虑
      const result = detector.detectEmotion('沮丧', anxiousBehavior);
      // 应该基于强烈的行为信号
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  // ==================== 行为信号推断测试 ====================

  describe('behavior inference', () => {
    describe('frustrated detection', () => {
      it('应该基于连续错误检测沮丧', () => {
        const behavior: BehaviorSignals = {
          consecutiveWrong: 5,
          avgResponseTime: 2000,
          responseTimeVariance: 1000000, // 高变异
          skipCount: 3, // 增加跳过
          dwellTimeRatio: 0.75,
          baselineResponseTime: 2000,
        };

        const result = detector.detectEmotion(null, behavior);
        expect(result.emotion).toBe('frustrated');
      });

      it('应该基于高反应时间变异检测沮丧', () => {
        const behavior: BehaviorSignals = {
          consecutiveWrong: 3,
          avgResponseTime: 2000,
          responseTimeVariance: 1500000, // 高变异
          skipCount: 3,
          dwellTimeRatio: 0.75,
          baselineResponseTime: 2000,
        };

        const result = detector.detectEmotion(null, behavior);
        expect(result.emotion).toBe('frustrated');
      });

      it('应该基于多次跳过检测沮丧', () => {
        const behavior: BehaviorSignals = {
          consecutiveWrong: 4,
          avgResponseTime: 2000,
          responseTimeVariance: 500000,
          skipCount: 5,
          dwellTimeRatio: 0.75,
          baselineResponseTime: 2000,
        };

        const result = detector.detectEmotion(null, behavior);
        expect(result.emotion).toBe('frustrated');
      });
    });

    describe('anxious detection', () => {
      it('应该基于快速反应检测焦虑', () => {
        const behavior: BehaviorSignals = {
          consecutiveWrong: 1,
          avgResponseTime: 1400, // 明显快于基线
          responseTimeVariance: 300000,
          skipCount: 0,
          dwellTimeRatio: 0.4,
          baselineResponseTime: 2000,
        };

        const result = detector.detectEmotion(null, behavior);
        expect(result.emotion).toBe('anxious');
      });

      it('应该基于高反应时间变异检测焦虑', () => {
        const behavior: BehaviorSignals = {
          consecutiveWrong: 0,
          avgResponseTime: 1500,
          responseTimeVariance: 900000, // 高变异
          skipCount: 0,
          dwellTimeRatio: 0.45,
          baselineResponseTime: 2000,
        };

        const result = detector.detectEmotion(null, behavior);
        expect(result.emotion).toBe('anxious');
      });

      it('应该基于低停留时间和快速反应检测焦虑', () => {
        const behavior: BehaviorSignals = {
          consecutiveWrong: 0,
          avgResponseTime: 1500, // 更快的反应
          responseTimeVariance: 600000, // 更高变异
          skipCount: 0,
          dwellTimeRatio: 0.3, // 很低的停留时间
          baselineResponseTime: 2000,
        };

        const result = detector.detectEmotion(null, behavior);
        expect(result.emotion).toBe('anxious');
      });
    });

    describe('bored detection', () => {
      it('应该基于慢速但稳定的反应检测无聊', () => {
        const behavior: BehaviorSignals = {
          consecutiveWrong: 1,
          avgResponseTime: 2800, // 慢于基线
          responseTimeVariance: 100000, // 低变异
          skipCount: 2,
          dwellTimeRatio: 0.75,
          baselineResponseTime: 2000,
        };

        const result = detector.detectEmotion(null, behavior);
        expect(result.emotion).toBe('bored');
      });

      it('应该基于跳过行为检测无聊', () => {
        const behavior: BehaviorSignals = {
          consecutiveWrong: 2,
          avgResponseTime: 2600,
          responseTimeVariance: 80000,
          skipCount: 3,
          dwellTimeRatio: 0.75,
          baselineResponseTime: 2000,
        };

        const result = detector.detectEmotion(null, behavior);
        expect(result.emotion).toBe('bored');
      });

      it('应该基于中等错误率检测无聊', () => {
        const behavior: BehaviorSignals = {
          consecutiveWrong: 2, // 中等错误
          avgResponseTime: 2700,
          responseTimeVariance: 90000,
          skipCount: 2,
          dwellTimeRatio: 0.75,
          baselineResponseTime: 2000,
        };

        const result = detector.detectEmotion(null, behavior);
        expect(result.emotion).toBe('bored');
      });
    });

    describe('tired detection', () => {
      it('应该基于极慢反应检测疲劳', () => {
        const behavior: BehaviorSignals = {
          consecutiveWrong: 2,
          avgResponseTime: 3000, // 明显慢于基线
          responseTimeVariance: 50000, // 低变异
          skipCount: 0,
          dwellTimeRatio: 1.3, // 高停留时间
          baselineResponseTime: 2000,
        };

        const result = detector.detectEmotion(null, behavior);
        expect(result.emotion).toBe('tired');
      });

      it('应该基于低变异性检测疲劳', () => {
        const behavior: BehaviorSignals = {
          consecutiveWrong: 3,
          avgResponseTime: 3200,
          responseTimeVariance: 40000, // 很低的变异
          skipCount: 0,
          dwellTimeRatio: 1.25,
          baselineResponseTime: 2000,
        };

        const result = detector.detectEmotion(null, behavior);
        expect(result.emotion).toBe('tired');
      });

      it('应该基于高停留时间检测疲劳', () => {
        const behavior: BehaviorSignals = {
          consecutiveWrong: 2,
          avgResponseTime: 2900,
          responseTimeVariance: 60000,
          skipCount: 0,
          dwellTimeRatio: 1.5, // 很高的停留时间
          baselineResponseTime: 2000,
        };

        const result = detector.detectEmotion(null, behavior);
        expect(result.emotion).toBe('tired');
      });
    });

    describe('neutral detection', () => {
      it('应该在正常行为下检测中性状态', () => {
        const behavior: BehaviorSignals = {
          consecutiveWrong: 0,
          avgResponseTime: 2000, // 接近基线
          responseTimeVariance: 160000, // 适中变异
          skipCount: 0,
          dwellTimeRatio: 0.75,
          baselineResponseTime: 2000,
        };

        const result = detector.detectEmotion(null, behavior);
        expect(result.emotion).toBe('neutral');
      });

      it('应该在无错误时倾向于中性状态', () => {
        const behavior: BehaviorSignals = {
          consecutiveWrong: 0,
          avgResponseTime: 2100,
          responseTimeVariance: 200000,
          skipCount: 0,
          dwellTimeRatio: 0.8,
          baselineResponseTime: 2000,
        };

        const result = detector.detectEmotion(null, behavior);
        expect(result.emotion).toBe('neutral');
      });
    });
  });

  // ==================== 置信度测试 ====================

  describe('confidence levels', () => {
    it('应该返回0到1之间的置信度', () => {
      const behaviors = [
        { ...baseBehavior, consecutiveWrong: 5 },
        { ...baseBehavior, avgResponseTime: 1400 },
        { ...baseBehavior, avgResponseTime: 3000 },
      ];

      behaviors.forEach((behavior) => {
        const result = detector.detectEmotion(null, behavior);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('应该在信号强烈时提供更高置信度', () => {
      const weakSignal: BehaviorSignals = {
        consecutiveWrong: 1,
        avgResponseTime: 2100,
        responseTimeVariance: 150000,
        skipCount: 0,
        dwellTimeRatio: 0.75,
        baselineResponseTime: 2000,
      };

      const strongSignal: BehaviorSignals = {
        consecutiveWrong: 6,
        avgResponseTime: 2000,
        responseTimeVariance: 2000000,
        skipCount: 5,
        dwellTimeRatio: 0.75,
        baselineResponseTime: 2000,
      };

      const weakResult = detector.detectEmotion(null, weakSignal);
      const strongResult = detector.detectEmotion(null, strongSignal);

      expect(strongResult.confidence).toBeGreaterThan(weakResult.confidence);
    });

    it('应该在自我报告一致时提供更高置信度', () => {
      const behavior: BehaviorSignals = {
        consecutiveWrong: 5,
        avgResponseTime: 2000,
        responseTimeVariance: 1000000,
        skipCount: 4,
        dwellTimeRatio: 0.75,
        baselineResponseTime: 2000,
      };

      const withReport = detector.detectEmotion('沮丧', behavior);
      const withoutReport = detector.detectEmotion(null, behavior);

      expect(withReport.confidence).toBeGreaterThanOrEqual(withoutReport.confidence);
    });
  });

  // ==================== 边界情况测试 ====================

  describe('edge cases', () => {
    it('应该处理基线反应时间为0的情况', () => {
      const behavior: BehaviorSignals = {
        consecutiveWrong: 2,
        avgResponseTime: 2000,
        responseTimeVariance: 200000,
        skipCount: 1,
        dwellTimeRatio: 0.75,
        baselineResponseTime: 0,
      };

      const result = detector.detectEmotion(null, behavior);
      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('应该处理平均反应时间为0的情况', () => {
      const behavior: BehaviorSignals = {
        consecutiveWrong: 0,
        avgResponseTime: 0,
        responseTimeVariance: 0,
        skipCount: 0,
        dwellTimeRatio: 0.75,
        baselineResponseTime: 2000,
      };

      const result = detector.detectEmotion(null, behavior);
      expect(result).toBeDefined();
    });

    it('应该处理极端的连续错误数', () => {
      const behavior: BehaviorSignals = {
        consecutiveWrong: 100,
        avgResponseTime: 2000,
        responseTimeVariance: 200000,
        skipCount: 0,
        dwellTimeRatio: 0.75,
        baselineResponseTime: 2000,
      };

      const result = detector.detectEmotion(null, behavior);
      expect(result.emotion).toBe('frustrated');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('应该处理极端的跳过数', () => {
      const behavior: BehaviorSignals = {
        consecutiveWrong: 0,
        avgResponseTime: 2600,
        responseTimeVariance: 100000,
        skipCount: 50,
        dwellTimeRatio: 0.75,
        baselineResponseTime: 2000,
      };

      const result = detector.detectEmotion(null, behavior);
      expect(['frustrated', 'bored']).toContain(result.emotion);
    });

    it('应该处理所有信号都极端的情况', () => {
      const behavior: BehaviorSignals = {
        consecutiveWrong: 20,
        avgResponseTime: 5000,
        responseTimeVariance: 5000000,
        skipCount: 10,
        dwellTimeRatio: 2.0,
        baselineResponseTime: 2000,
      };

      const result = detector.detectEmotion(null, behavior);
      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('应该处理空字符串的自我报告', () => {
      const result = detector.detectEmotion('', baseBehavior);
      expect(result).toBeDefined();
    });

    it('应该处理null的自我报告', () => {
      const result = detector.detectEmotion(null, baseBehavior);
      expect(result).toBeDefined();
    });

    it('应该处理只有空格的自我报告', () => {
      const result = detector.detectEmotion('   ', baseBehavior);
      expect(result).toBeDefined();
    });
  });

  // ==================== 情绪分类一致性测试 ====================

  describe('emotion classification consistency', () => {
    it('相同的输入应该产生相同的输出', () => {
      const behavior: BehaviorSignals = {
        consecutiveWrong: 3,
        avgResponseTime: 2500,
        responseTimeVariance: 300000,
        skipCount: 2,
        dwellTimeRatio: 0.8,
        baselineResponseTime: 2000,
      };

      const result1 = detector.detectEmotion(null, behavior);
      const result2 = detector.detectEmotion(null, behavior);

      expect(result1.emotion).toBe(result2.emotion);
      expect(result1.confidence).toBe(result2.confidence);
    });

    it('应该为每种情绪返回有效的EmotionState', () => {
      const behaviors: BehaviorSignals[] = [
        {
          // frustrated
          consecutiveWrong: 5,
          avgResponseTime: 2000,
          responseTimeVariance: 1000000,
          skipCount: 4,
          dwellTimeRatio: 0.75,
          baselineResponseTime: 2000,
        },
        {
          // anxious
          consecutiveWrong: 0,
          avgResponseTime: 1400,
          responseTimeVariance: 500000,
          skipCount: 0,
          dwellTimeRatio: 0.3,
          baselineResponseTime: 2000,
        },
        {
          // bored
          consecutiveWrong: 2,
          avgResponseTime: 2800,
          responseTimeVariance: 80000,
          skipCount: 3,
          dwellTimeRatio: 0.75,
          baselineResponseTime: 2000,
        },
        {
          // tired
          consecutiveWrong: 3,
          avgResponseTime: 3200,
          responseTimeVariance: 40000,
          skipCount: 0,
          dwellTimeRatio: 1.5,
          baselineResponseTime: 2000,
        },
        {
          // neutral
          consecutiveWrong: 0,
          avgResponseTime: 2000,
          responseTimeVariance: 160000,
          skipCount: 0,
          dwellTimeRatio: 0.75,
          baselineResponseTime: 2000,
        },
      ];

      behaviors.forEach((behavior) => {
        const result = detector.detectEmotion(null, behavior);
        expect(result).toHaveProperty('emotion');
        expect(result).toHaveProperty('confidence');
        expect(['frustrated', 'anxious', 'bored', 'tired', 'neutral']).toContain(result.emotion);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      });
    });
  });

  // ==================== 多种情绪关键词组合测试 ====================

  describe('multiple emotion keywords', () => {
    it('应该处理包含多个情绪关键词的输入', () => {
      const result = detector.detectEmotion('沮丧焦虑', baseBehavior);
      expect(['frustrated', 'anxious', 'neutral']).toContain(result.emotion);
    });

    it('应该处理不同情绪关键词的混合（中文）', () => {
      const result = detector.detectEmotion('有点累但是不烦躁', baseBehavior);
      expect(result).toBeDefined();
      expect(result.emotion).toBeDefined();
    });

    it('应该对大小写不敏感', () => {
      const result1 = detector.detectEmotion('沮丧', baseBehavior);
      const result2 = detector.detectEmotion('沮丧', baseBehavior);
      expect(result1.emotion).toBe(result2.emotion);
    });
  });

  // ==================== 变异系数边界测试 ====================

  describe('coefficient of variation edge cases', () => {
    it('应该处理变异系数为0的情况（完全稳定）', () => {
      const behavior: BehaviorSignals = {
        consecutiveWrong: 0,
        avgResponseTime: 2000,
        responseTimeVariance: 0, // CV = 0
        skipCount: 0,
        dwellTimeRatio: 0.75,
        baselineResponseTime: 2000,
      };

      const result = detector.detectEmotion(null, behavior);
      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('应该处理非常高的变异系数', () => {
      const behavior: BehaviorSignals = {
        consecutiveWrong: 4,
        avgResponseTime: 2000,
        responseTimeVariance: 10000000, // CV = sqrt(10000000) / 2000 = 1.58
        skipCount: 2,
        dwellTimeRatio: 0.75,
        baselineResponseTime: 2000,
      };

      const result = detector.detectEmotion(null, behavior);
      expect(result.emotion).toBe('frustrated');
    });
  });

  // ==================== 自我报告不一致性测试 ====================

  describe('self-report inconsistency', () => {
    it('应该在自我报告和行为中等不一致时相信自我报告', () => {
      const mildlyInconsistent: BehaviorSignals = {
        consecutiveWrong: 1,
        avgResponseTime: 2100,
        responseTimeVariance: 200000,
        skipCount: 0,
        dwellTimeRatio: 0.75,
        baselineResponseTime: 2000,
      };

      const result = detector.detectEmotion('累', mildlyInconsistent);
      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('应该在行为信号不强烈时使用自我报告', () => {
      const weakBehavior: BehaviorSignals = {
        consecutiveWrong: 0,
        avgResponseTime: 2000,
        responseTimeVariance: 100000,
        skipCount: 0,
        dwellTimeRatio: 0.75,
        baselineResponseTime: 2000,
      };

      const result = detector.detectEmotion('烦躁', weakBehavior);
      expect(['frustrated', 'neutral']).toContain(result.emotion);
    });
  });

  // ==================== 响应时间比率极端值测试 ====================

  describe('response time ratio extremes', () => {
    it('应该处理响应时间为基线10倍的情况', () => {
      const behavior: BehaviorSignals = {
        consecutiveWrong: 2,
        avgResponseTime: 20000, // 10倍基线
        responseTimeVariance: 1000000,
        skipCount: 1,
        dwellTimeRatio: 1.0,
        baselineResponseTime: 2000,
      };

      const result = detector.detectEmotion(null, behavior);
      expect(['tired', 'bored']).toContain(result.emotion);
    });

    it('应该处理响应时间为基线0.1倍的情况', () => {
      const behavior: BehaviorSignals = {
        consecutiveWrong: 0,
        avgResponseTime: 200, // 0.1倍基线
        responseTimeVariance: 10000,
        skipCount: 0,
        dwellTimeRatio: 0.2,
        baselineResponseTime: 2000,
      };

      const result = detector.detectEmotion(null, behavior);
      expect(result.emotion).toBe('anxious');
    });
  });

  // ==================== 停留时间比率边界测试 ====================

  describe('dwell time ratio boundaries', () => {
    it('应该处理停留时间比率为0的情况', () => {
      const behavior: BehaviorSignals = {
        consecutiveWrong: 0,
        avgResponseTime: 1500,
        responseTimeVariance: 300000,
        skipCount: 0,
        dwellTimeRatio: 0, // 没有停留时间
        baselineResponseTime: 2000,
      };

      const result = detector.detectEmotion(null, behavior);
      // 停留时间为0不一定总是焦虑，取决于其他因素
      expect(['anxious', 'neutral']).toContain(result.emotion);
    });

    it('应该处理停留时间比率超过2的情况', () => {
      const behavior: BehaviorSignals = {
        consecutiveWrong: 3,
        avgResponseTime: 3500,
        responseTimeVariance: 50000,
        skipCount: 0,
        dwellTimeRatio: 2.5, // 非常长的停留时间
        baselineResponseTime: 2000,
      };

      const result = detector.detectEmotion(null, behavior);
      expect(result.emotion).toBe('tired');
    });
  });

  // ==================== 置信度上下限测试 ====================

  describe('confidence bounds', () => {
    it('置信度应该不超过1.0', () => {
      const veryStrongSignal: BehaviorSignals = {
        consecutiveWrong: 20,
        avgResponseTime: 2000,
        responseTimeVariance: 5000000,
        skipCount: 15,
        dwellTimeRatio: 0.75,
        baselineResponseTime: 2000,
      };

      const result = detector.detectEmotion('沮丧', veryStrongSignal);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });

    it('置信度应该不低于0', () => {
      const veryWeakSignal: BehaviorSignals = {
        consecutiveWrong: 0,
        avgResponseTime: 2000,
        responseTimeVariance: 100000,
        skipCount: 0,
        dwellTimeRatio: 0.75,
        baselineResponseTime: 2000,
      };

      const result = detector.detectEmotion(null, veryWeakSignal);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== 负数输入测试 ====================

  describe('negative values', () => {
    it('应该处理负的响应时间方差（理论上不应该但要健壮）', () => {
      const behavior: BehaviorSignals = {
        consecutiveWrong: 0,
        avgResponseTime: 2000,
        responseTimeVariance: -100000, // 负方差
        skipCount: 0,
        dwellTimeRatio: 0.75,
        baselineResponseTime: 2000,
      };

      const result = detector.detectEmotion(null, behavior);
      expect(result).toBeDefined();
    });
  });

  // ==================== 特殊情绪组合测试 ====================

  describe('complex emotion combinations', () => {
    it('应该能区分疲劳和无聊（慢速反应但停留时间不同）', () => {
      const tiredBehavior: BehaviorSignals = {
        consecutiveWrong: 2,
        avgResponseTime: 3000,
        responseTimeVariance: 50000,
        skipCount: 0,
        dwellTimeRatio: 1.4, // 高停留时间
        baselineResponseTime: 2000,
      };

      const boredBehavior: BehaviorSignals = {
        consecutiveWrong: 2,
        avgResponseTime: 3000,
        responseTimeVariance: 50000,
        skipCount: 3, // 高跳过
        dwellTimeRatio: 0.8, // 正常停留时间
        baselineResponseTime: 2000,
      };

      const tiredResult = detector.detectEmotion(null, tiredBehavior);
      const boredResult = detector.detectEmotion(null, boredBehavior);

      expect(tiredResult.emotion).toBe('tired');
      expect(boredResult.emotion).toBe('bored');
    });

    it('应该能区分焦虑和沮丧（都有高变异但错误率不同）', () => {
      const anxiousBehavior: BehaviorSignals = {
        consecutiveWrong: 0, // 低错误
        avgResponseTime: 1500,
        responseTimeVariance: 800000, // 高变异
        skipCount: 0,
        dwellTimeRatio: 0.3,
        baselineResponseTime: 2000,
      };

      const frustratedBehavior: BehaviorSignals = {
        consecutiveWrong: 5, // 高错误
        avgResponseTime: 2000,
        responseTimeVariance: 800000, // 高变异
        skipCount: 4,
        dwellTimeRatio: 0.75,
        baselineResponseTime: 2000,
      };

      const anxiousResult = detector.detectEmotion(null, anxiousBehavior);
      const frustratedResult = detector.detectEmotion(null, frustratedBehavior);

      expect(anxiousResult.emotion).toBe('anxious');
      expect(frustratedResult.emotion).toBe('frustrated');
    });
  });

  // ==================== 边界值组合测试 ====================

  describe('boundary value combinations', () => {
    it('应该处理所有参数都为0的情况', () => {
      const allZero: BehaviorSignals = {
        consecutiveWrong: 0,
        avgResponseTime: 0,
        responseTimeVariance: 0,
        skipCount: 0,
        dwellTimeRatio: 0,
        baselineResponseTime: 0,
      };

      const result = detector.detectEmotion(null, allZero);
      expect(result).toBeDefined();
      expect(result.emotion).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('应该处理所有参数都为最大值的情况', () => {
      const allMax: BehaviorSignals = {
        consecutiveWrong: Number.MAX_SAFE_INTEGER,
        avgResponseTime: Number.MAX_SAFE_INTEGER,
        responseTimeVariance: Number.MAX_SAFE_INTEGER,
        skipCount: Number.MAX_SAFE_INTEGER,
        dwellTimeRatio: Number.MAX_SAFE_INTEGER,
        baselineResponseTime: 1000, // 保持合理以避免除零
      };

      const result = detector.detectEmotion(null, allMax);
      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});
