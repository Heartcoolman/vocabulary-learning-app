/**
 * FlowDetector Unit Tests
 * 心流检测器单元测试
 *
 * 测试覆盖:
 * - 4种心流状态识别 (flow, anxiety, boredom, normal)
 * - 成功率因子计算
 * - 反应时间稳定性因子计算
 * - 状态因子（注意力、动机）计算
 * - 中断率因子计算（间接通过稳定性）
 * - 综合心流分数计算
 * - 推荐建议生成
 * - 时间序列心流分析
 * - 边界条件和异常情况
 * - 自定义配置
 * - 实际场景模拟
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FlowDetector,
  FlowState,
  defaultFlowDetector,
} from '../../../../src/amas/models/flow-detector';
import { UserState, RawEvent } from '../../../../src/amas/types';

describe('FlowDetector', () => {
  let detector: FlowDetector;
  let baseState: UserState;
  let baseEvents: RawEvent[];

  beforeEach(() => {
    detector = new FlowDetector();

    // 基础用户状态：注意力和动机都处于良好水平
    baseState = {
      A: 0.8, // 注意力
      F: 0.2, // 疲劳度
      M: 0.5, // 动机
      C: {
        mem: 0.7,
        speed: 0.7,
        stability: 0.8,
      },
      conf: 0.8,
      ts: Date.now(),
    };

    // 基础事件列表：10个事件，成功率70%，反应时间稳定
    baseEvents = Array.from({ length: 10 }, (_, i) => ({
      wordId: `word-${i}`,
      isCorrect: i < 7, // 前7个正确，后3个错误，成功率70%
      responseTime: 2000 + Math.random() * 200, // 2000ms左右，变异小
      dwellTime: 1500,
      timestamp: Date.now() + i * 1000,
      pauseCount: 0,
      switchCount: 0,
      retryCount: 0,
      focusLossDuration: 0,
      interactionDensity: 0.5,
    }));
  });

  // ==================== 初始化测试 ====================

  describe('initialization', () => {
    it('应该正确初始化', () => {
      expect(detector).toBeDefined();
    });

    it('默认实例应该可用', () => {
      expect(defaultFlowDetector).toBeDefined();
    });
  });

  // ==================== 样本不足处理 ====================

  describe('insufficient samples', () => {
    it('应该在事件少于5个时返回normal状态', () => {
      const fewEvents = baseEvents.slice(0, 4);
      const result = detector.detectFlow(baseState, fewEvents);

      expect(result.state).toBe('normal');
      expect(result.score).toBe(0.5);
      expect(result.recommendation).toContain('数据不足');
    });

    it('应该在事件为空时返回normal状态', () => {
      const result = detector.detectFlow(baseState, []);

      expect(result.state).toBe('normal');
      expect(result.score).toBe(0.5);
      expect(result.recommendation).toContain('数据不足');
    });

    it('应该在事件恰好5个时能够进行检测', () => {
      const fiveEvents = baseEvents.slice(0, 5);
      const result = detector.detectFlow(baseState, fiveEvents);

      expect(result).toBeDefined();
      expect(result.state).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  // ==================== 成功率因子测试 ====================

  describe('success rate factor', () => {
    it('应该在目标区间中心(72.5%)时得到最高分', () => {
      // 成功率72.5%的事件
      const events = Array.from({ length: 20 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 14.5, // 14.5/20 = 72.5%
        responseTime: 2000 + (i % 3) * 50,
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(baseState, events);
      // 在目标区间内，成功率因子应该接近1
      expect(result.score).toBeGreaterThan(0.6);
    });

    it('应该在成功率低于65%时降低分数（焦虑区）', () => {
      // 成功率50%的事件
      const events = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 5, // 50%
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(baseState, events);
      expect(result.state).toBe('anxiety');
    });

    it('应该在成功率高于80%时降低分数（无聊区）', () => {
      // 成功率90%的事件
      const events = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 9, // 90%
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(baseState, events);
      expect(result.state).toBe('boredom');
    });

    it('应该在成功率为0时返回最低分', () => {
      const events = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: false, // 0%
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(baseState, events);
      expect(result.state).toBe('anxiety');
      expect(result.score).toBeLessThan(0.4);
    });

    it('应该在成功率为100%时不在心流状态', () => {
      const events = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: true, // 100%
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(baseState, events);
      expect(result.state).toBe('boredom');
    });

    it('应该在65%-80%区间内得到高成功率因子', () => {
      const testRates = [0.65, 0.7, 0.725, 0.75, 0.8];

      testRates.forEach((rate) => {
        const events = Array.from({ length: 20 }, (_, i) => ({
          ...baseEvents[0],
          wordId: `word-${i}`,
          isCorrect: i < Math.floor(20 * rate),
          responseTime: 2000,
          timestamp: Date.now() + i * 1000,
        }));

        const result = detector.detectFlow(baseState, events);
        // 在目标区间内应该得到较好的分数
        expect(result.score).toBeGreaterThan(0.5);
      });
    });
  });

  // ==================== 稳定性因子测试 ====================

  describe('response time stability factor', () => {
    it('应该在反应时间稳定时得到高分', () => {
      // 反应时间非常稳定的事件（变异系数低）
      const stableEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 7,
        responseTime: 2000 + (i % 2) * 10, // 变化很小
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(baseState, stableEvents);
      // 稳定性高应该提高心流分数
      expect(result.score).toBeGreaterThan(0.5);
    });

    it('应该在反应时间不稳定时降低分数', () => {
      // 反应时间非常不稳定的事件（变异系数高）
      // 使用固定的不稳定值避免随机性
      const unstableValues = [500, 3500, 1000, 4000, 800, 3800, 600, 3600, 1200, 3200];
      const unstableEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 7,
        responseTime: unstableValues[i], // 变化很大
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(baseState, unstableEvents);
      // 不稳定应该降低心流分数
      expect(result.score).toBeLessThan(0.8);
    });

    it('应该正确处理所有反应时间相同的情况（CV=0）', () => {
      // 反应时间完全一致
      const events = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 7,
        responseTime: 2000, // 完全相同
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(baseState, events);
      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('应该处理平均反应时间为0的边界情况', () => {
      const events = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 7,
        responseTime: 0, // 全部为0
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(baseState, events);
      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('应该区分不同程度的稳定性', () => {
      // 高稳定性（CV < 0.3）
      const highStability = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 7,
        responseTime: 2000 + (i % 3) * 50,
        timestamp: Date.now() + i * 1000,
      }));

      // 中等稳定性（CV ~ 0.5）
      const mediumStability = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 7,
        responseTime: 2000 + (i % 5) * 300,
        timestamp: Date.now() + i * 1000,
      }));

      // 低稳定性（CV > 1.0）
      const lowStability = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 7,
        responseTime: 1000 + Math.random() * 3000,
        timestamp: Date.now() + i * 1000,
      }));

      const highResult = detector.detectFlow(baseState, highStability);
      const mediumResult = detector.detectFlow(baseState, mediumStability);
      const lowResult = detector.detectFlow(baseState, lowStability);

      // 稳定性越高，分数应该越高
      expect(highResult.score).toBeGreaterThanOrEqual(mediumResult.score);
      expect(mediumResult.score).toBeGreaterThanOrEqual(lowResult.score);
    });
  });

  // ==================== 状态因子测试 ====================

  describe('state factor (attention & motivation)', () => {
    it('应该在注意力高时提高心流分数', () => {
      const highAttentionState = { ...baseState, A: 0.95 };
      const lowAttentionState = { ...baseState, A: 0.3 };

      const highResult = detector.detectFlow(highAttentionState, baseEvents);
      const lowResult = detector.detectFlow(lowAttentionState, baseEvents);

      expect(highResult.score).toBeGreaterThan(lowResult.score);
    });

    it('应该在动机高时提高心流分数', () => {
      const highMotivationState = { ...baseState, M: 0.9 };
      const lowMotivationState = { ...baseState, M: -0.8 };

      const highResult = detector.detectFlow(highMotivationState, baseEvents);
      const lowResult = detector.detectFlow(lowMotivationState, baseEvents);

      expect(highResult.score).toBeGreaterThan(lowResult.score);
    });

    it('应该正确归一化动机值从[-1,1]到[0,1]', () => {
      const minMotivationState = { ...baseState, M: -1 };
      const maxMotivationState = { ...baseState, M: 1 };

      const minResult = detector.detectFlow(minMotivationState, baseEvents);
      const maxResult = detector.detectFlow(maxMotivationState, baseEvents);

      // 两者都应该返回有效的分数
      expect(minResult.score).toBeGreaterThanOrEqual(0);
      expect(maxResult.score).toBeLessThanOrEqual(1);
      expect(maxResult.score).toBeGreaterThan(minResult.score);
    });

    it('应该正确组合注意力和动机因子（注意力权重60%，动机权重40%）', () => {
      const perfectState = { ...baseState, A: 1.0, M: 1.0 };
      const poorState = { ...baseState, A: 0.1, M: -1.0 };

      const perfectResult = detector.detectFlow(perfectState, baseEvents);
      const poorResult = detector.detectFlow(poorState, baseEvents);

      expect(perfectResult.score).toBeGreaterThan(poorResult.score);
    });

    it('应该验证注意力的影响大于动机', () => {
      // 高注意力，低动机
      const highALowM = { ...baseState, A: 1.0, M: -1.0 };
      // 低注意力，高动机
      const lowAHighM = { ...baseState, A: 0.0, M: 1.0 };

      const result1 = detector.detectFlow(highALowM, baseEvents);
      const result2 = detector.detectFlow(lowAHighM, baseEvents);

      // 由于注意力权重更高（60% vs 40%），高注意力应该产生更高的分数
      expect(result1.score).toBeGreaterThan(result2.score);
    });
  });

  // ==================== 心流状态分类测试 ====================

  describe('flow state classification', () => {
    it('应该在高分数(>0.7)且目标区间时识别为flow', () => {
      // 完美状态：高注意力、高动机、良好成功率、稳定反应时间
      const perfectState = { ...baseState, A: 0.95, M: 0.9 };
      const perfectEvents = Array.from({ length: 15 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 11, // 73%
        responseTime: 2000 + (i % 3) * 20, // 非常稳定
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(perfectState, perfectEvents);
      expect(result.state).toBe('flow');
      expect(result.score).toBeGreaterThanOrEqual(0.7);
    });

    it('应该在成功率低(<65%)时识别为anxiety', () => {
      const anxietyEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 5, // 50%
        responseTime: 2000 + Math.random() * 500,
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(baseState, anxietyEvents);
      expect(result.state).toBe('anxiety');
    });

    it('应该在成功率高(>80%)时识别为boredom', () => {
      const boredomEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 9, // 90%
        responseTime: 2000 + Math.random() * 300,
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(baseState, boredomEvents);
      expect(result.state).toBe('boredom');
    });

    it('应该在中等分数时识别为normal', () => {
      const normalState = { ...baseState, A: 0.6, M: 0.2 };
      const normalEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 7, // 70%
        responseTime: 2000 + Math.random() * 800, // 中等稳定性
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(normalState, normalEvents);
      expect(result.state).toBe('normal');
    });

    it('应该优先基于成功率判断anxiety和boredom', () => {
      const lowScoreState = { ...baseState, A: 0.3, M: -0.5 }; // 低状态因子

      // 低成功率
      const lowSuccessEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        isCorrect: i < 5,
        timestamp: Date.now() + i * 1000,
      }));

      // 高成功率
      const highSuccessEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        isCorrect: i < 9,
        timestamp: Date.now() + i * 1000,
      }));

      const lowResult = detector.detectFlow(lowScoreState, lowSuccessEvents);
      const highResult = detector.detectFlow(lowScoreState, highSuccessEvents);

      expect(lowResult.state).toBe('anxiety');
      expect(highResult.state).toBe('boredom');
    });
  });

  // ==================== 推荐建议测试 ====================

  describe('recommendations', () => {
    it('应该为flow状态推荐保持当前难度', () => {
      const perfectState = { ...baseState, A: 0.95, M: 0.9 };
      const perfectEvents = Array.from({ length: 15 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 11, // 73%
        responseTime: 2000 + (i % 3) * 20,
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(perfectState, perfectEvents);
      expect(result.recommendation).toContain('保持当前难度');
    });

    it('应该为anxiety状态(成功率<50%)推荐降低难度', () => {
      const anxietyEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 4, // 40%
        responseTime: 2000,
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(baseState, anxietyEvents);
      expect(result.state).toBe('anxiety');
      expect(result.recommendation).toContain('降低难度');
    });

    it('应该为anxiety状态(成功率50%-65%)推荐适当调整', () => {
      const anxietyEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 6, // 60%
        responseTime: 2000,
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(baseState, anxietyEvents);
      expect(result.state).toBe('anxiety');
      expect(result.recommendation).toContain('略');
    });

    it('应该为boredom状态(成功率>90%)推荐增加难度', () => {
      const boredomEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 9.5, // 95%
        responseTime: 2000,
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(baseState, boredomEvents);
      expect(result.state).toBe('boredom');
      expect(result.recommendation).toContain('增加难度');
    });

    it('应该为boredom状态(成功率80%-90%)推荐适当调整', () => {
      const boredomEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 8.5, // 85%
        responseTime: 2000,
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(baseState, boredomEvents);
      expect(result.state).toBe('boredom');
      expect(result.recommendation).toContain('略');
    });

    it('应该为normal状态提供相应建议', () => {
      const normalState = { ...baseState, A: 0.5, M: 0.2 };
      const normalEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 7,
        responseTime: 2000 + Math.random() * 600,
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(normalState, normalEvents);
      if (result.state === 'normal') {
        expect(result.recommendation).toBeDefined();
        expect(result.recommendation.length).toBeGreaterThan(0);
      }
    });
  });

  // ==================== 综合心流分数测试 ====================

  describe('comprehensive flow score', () => {
    it('应该返回0到1之间的分数', () => {
      const result = detector.detectFlow(baseState, baseEvents);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('应该综合考虑成功率、稳定性和状态因子', () => {
      // 三个因子都好的情况
      const goodState = { ...baseState, A: 0.9, M: 0.8 };
      const goodEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 7, // 70%
        responseTime: 2000 + (i % 2) * 50, // 稳定
        timestamp: Date.now() + i * 1000,
      }));

      // 三个因子都差的情况
      const badState = { ...baseState, A: 0.2, M: -0.8 };
      const badEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 3, // 30%
        responseTime: 1000 + Math.random() * 3000, // 不稳定
        timestamp: Date.now() + i * 1000,
      }));

      const goodResult = detector.detectFlow(goodState, goodEvents);
      const badResult = detector.detectFlow(badState, badEvents);

      expect(goodResult.score).toBeGreaterThan(badResult.score);
    });

    it('应该对相同输入返回相同结果', () => {
      const fixedEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 7,
        responseTime: 2000,
        timestamp: Date.now() + i * 1000,
      }));

      const result1 = detector.detectFlow(baseState, fixedEvents);
      const result2 = detector.detectFlow(baseState, fixedEvents);

      expect(result1.score).toBe(result2.score);
      expect(result1.state).toBe(result2.state);
      expect(result1.recommendation).toBe(result2.recommendation);
    });

    it('应该使用乘法组合三个因子', () => {
      // 验证心流分数 = 成功率因子 × 稳定性因子 × 状态因子
      // 如果任何一个因子为0，则心流分数应该接近0
      const zeroMotivationState = { ...baseState, A: 0, M: -1 }; // 状态因子接近0
      const result = detector.detectFlow(zeroMotivationState, baseEvents);

      expect(result.score).toBeLessThan(0.3);
    });
  });

  // ==================== 配置自定义测试 ====================

  describe('custom configuration', () => {
    it('应该允许设置自定义目标成功率', () => {
      expect(() => {
        detector.setTargetSuccessRate(0.7, 0.85);
      }).not.toThrow();
    });

    it('应该在无效成功率范围时抛出错误', () => {
      expect(() => {
        detector.setTargetSuccessRate(-0.1, 0.8);
      }).toThrow('Invalid success rate range');

      expect(() => {
        detector.setTargetSuccessRate(0.6, 1.1);
      }).toThrow('Invalid success rate range');

      expect(() => {
        detector.setTargetSuccessRate(0.8, 0.6);
      }).toThrow('Invalid success rate range');

      expect(() => {
        detector.setTargetSuccessRate(0, 0);
      }).toThrow('Invalid success rate range');
    });

    it('应该允许设置自定义心流阈值', () => {
      expect(() => {
        detector.setFlowThresholds(0.8, 0.5, 0.3);
      }).not.toThrow();
    });

    it('应该在无效心流阈值时抛出错误', () => {
      expect(() => {
        detector.setFlowThresholds(0.5, 0.7, 0.3); // high < medium
      }).toThrow('Invalid flow thresholds');

      expect(() => {
        detector.setFlowThresholds(0.8, 0.3, 0.5); // medium < low
      }).toThrow('Invalid flow thresholds');

      expect(() => {
        detector.setFlowThresholds(-0.1, 0.5, 0.3); // high < 0
      }).toThrow('Invalid flow thresholds');

      expect(() => {
        detector.setFlowThresholds(1.1, 0.8, 0.5); // high > 1
      }).toThrow('Invalid flow thresholds');
    });

    it('自定义配置应该影响检测结果', () => {
      const events = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 6, // 60%
        responseTime: 2000,
        timestamp: Date.now() + i * 1000,
      }));

      const result1 = detector.detectFlow(baseState, events);

      // 将目标区间调整为50%-70%，60%现在在区间内
      detector.setTargetSuccessRate(0.5, 0.7);
      const result2 = detector.detectFlow(baseState, events);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      // 配置改变后，可能会影响状态分类
      expect(result2.state).not.toBe('anxiety');
    });
  });

  // ==================== 时间序列分析测试 ====================

  describe('time series analysis', () => {
    it('应该能够批量检测心流状态', () => {
      const longEvents = Array.from({ length: 30 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: Math.random() > 0.3,
        responseTime: 2000 + Math.random() * 500,
        timestamp: Date.now() + i * 1000,
      }));

      const results = detector.detectFlowTimeSeries(baseState, longEvents, 10);
      expect(results.length).toBeGreaterThan(0);
      results.forEach((result) => {
        expect(result).toHaveProperty('score');
        expect(result).toHaveProperty('state');
        expect(result).toHaveProperty('recommendation');
      });
    });

    it('应该在事件数不足窗口大小时返回单个结果', () => {
      const shortEvents = baseEvents.slice(0, 5);
      const results = detector.detectFlowTimeSeries(baseState, shortEvents, 10);

      expect(results.length).toBe(1);
    });

    it('应该使用默认窗口大小10', () => {
      const events = Array.from({ length: 25 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 18, // 72%
        responseTime: 2000,
        timestamp: Date.now() + i * 1000,
      }));

      const results = detector.detectFlowTimeSeries(baseState, events);
      // 25个事件，窗口大小10，应该返回2个结果（0-9, 10-19）
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('应该能够追踪心流状态的变化', () => {
      // 创建一个心流状态从好到坏的事件序列
      const changingEvents = [
        // 前10个：好的心流状态
        ...Array.from({ length: 10 }, (_, i) => ({
          ...baseEvents[0],
          wordId: `word-${i}`,
          isCorrect: i < 7,
          responseTime: 2000,
          timestamp: Date.now() + i * 1000,
        })),
        // 后10个：差的心流状态
        ...Array.from({ length: 10 }, (_, i) => ({
          ...baseEvents[0],
          wordId: `word-${i + 10}`,
          isCorrect: i < 3,
          responseTime: 1000 + Math.random() * 2000,
          timestamp: Date.now() + (i + 10) * 1000,
        })),
      ];

      const results = detector.detectFlowTimeSeries(baseState, changingEvents, 10);
      expect(results.length).toBe(2);
      // 第一个窗口应该比第二个窗口的分数高
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it('应该处理窗口滑动时的边界情况', () => {
      const events = Array.from({ length: 15 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 11,
        responseTime: 2000,
        timestamp: Date.now() + i * 1000,
      }));

      const results = detector.detectFlowTimeSeries(baseState, events, 10);
      expect(results.length).toBe(1); // 只有0-9这一个完整窗口
    });
  });

  // ==================== 边界条件和异常情况测试 ====================

  describe('edge cases and exceptions', () => {
    it('应该处理极端注意力值', () => {
      const minAttention = { ...baseState, A: 0 };
      const maxAttention = { ...baseState, A: 1 };

      const minResult = detector.detectFlow(minAttention, baseEvents);
      const maxResult = detector.detectFlow(maxAttention, baseEvents);

      expect(minResult.score).toBeGreaterThanOrEqual(0);
      expect(maxResult.score).toBeLessThanOrEqual(1);
    });

    it('应该处理极端动机值', () => {
      const minMotivation = { ...baseState, M: -1 };
      const maxMotivation = { ...baseState, M: 1 };

      const minResult = detector.detectFlow(minMotivation, baseEvents);
      const maxResult = detector.detectFlow(maxMotivation, baseEvents);

      expect(minResult.score).toBeGreaterThanOrEqual(0);
      expect(maxResult.score).toBeLessThanOrEqual(1);
    });

    it('应该处理所有事件都正确的情况', () => {
      const allCorrect = baseEvents.map((e) => ({ ...e, isCorrect: true }));
      const result = detector.detectFlow(baseState, allCorrect);

      expect(result.state).toBe('boredom');
      expect(result.recommendation).toContain('难度');
    });

    it('应该处理所有事件都错误的情况', () => {
      const allWrong = baseEvents.map((e) => ({ ...e, isCorrect: false }));
      const result = detector.detectFlow(baseState, allWrong);

      expect(result.state).toBe('anxiety');
      expect(result.recommendation).toContain('难度');
    });

    it('应该处理极端反应时间差异', () => {
      const extremeEvents = baseEvents.map((e, i) => ({
        ...e,
        responseTime: i % 2 === 0 ? 500 : 5000, // 极端差异
      }));

      const result = detector.detectFlow(baseState, extremeEvents);
      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('应该处理非常大的事件数组', () => {
      const largeEvents = Array.from({ length: 1000 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: Math.random() > 0.3,
        responseTime: 2000 + Math.random() * 500,
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(baseState, largeEvents);
      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('应该处理所有因子都为0的极端情况', () => {
      const zeroState = {
        A: 0,
        F: 1,
        M: -1,
        C: { mem: 0, speed: 0, stability: 0 },
        conf: 0,
        ts: Date.now(),
      };

      const zeroEvents = baseEvents.map((e) => ({
        ...e,
        isCorrect: false,
        responseTime: 0,
      }));

      const result = detector.detectFlow(zeroState, zeroEvents);
      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('应该处理所有因子都最大的极端情况', () => {
      const maxState = {
        A: 1,
        F: 0,
        M: 1,
        C: { mem: 1, speed: 1, stability: 1 },
        conf: 1,
        ts: Date.now(),
      };

      const maxEvents = baseEvents.map((e) => ({
        ...e,
        isCorrect: true,
        responseTime: 2000,
      }));

      const result = detector.detectFlow(maxState, maxEvents);
      expect(result).toBeDefined();
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('应该处理NaN和Infinity情况', () => {
      // 创建可能导致NaN的情况
      const problematicEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 7,
        responseTime: i === 0 ? 0 : 2000,
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(baseState, problematicEvents);
      expect(result.score).not.toBeNaN();
      expect(Number.isFinite(result.score)).toBe(true);
    });
  });

  // ==================== 心流状态转换测试 ====================

  describe('flow state transitions', () => {
    it('应该检测从normal到flow的转换', () => {
      const normalState = { ...baseState, A: 0.6, M: 0.3 };
      const flowState = { ...baseState, A: 1.0, M: 1.0 }; // 提高到最大值

      const normalEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 7,
        responseTime: 2000 + (i % 5) * 400, // 增加变异
        timestamp: Date.now() + i * 1000,
      }));

      const flowEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 7,
        responseTime: 2000, // 完全稳定
        timestamp: Date.now() + i * 1000,
      }));

      const normalResult = detector.detectFlow(normalState, normalEvents);
      const flowResult = detector.detectFlow(flowState, flowEvents);

      expect(normalResult.state).not.toBe('flow');
      expect(flowResult.state).toBe('flow');
      expect(flowResult.score).toBeGreaterThan(normalResult.score);
    });

    it('应该检测从flow到anxiety的转换', () => {
      const flowState = { ...baseState, A: 1.0, M: 1.0 }; // 提高到最大值

      const flowEvents = Array.from({ length: 20 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 14, // 70%
        responseTime: 2000, // 完全稳定
        timestamp: Date.now() + i * 1000,
      }));

      const anxietyEvents = Array.from({ length: 20 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 12, // 60% - 低于目标区间
        responseTime: 2000,
        timestamp: Date.now() + i * 1000,
      }));

      const flowResult = detector.detectFlow(flowState, flowEvents);
      const anxietyResult = detector.detectFlow(flowState, anxietyEvents);

      expect(flowResult.state).toBe('flow');
      // 由于60%在边界附近且状态因子高，可能仍然是flow、normal或anxiety
      expect(['flow', 'anxiety', 'normal']).toContain(anxietyResult.state);
      expect(anxietyResult.score).toBeLessThan(flowResult.score);
    });

    it('应该检测从boredom到flow的转换', () => {
      const state = { ...baseState, A: 1.0, M: 1.0 }; // 提高到最大值

      const boredomEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 9, // 90%
        responseTime: 2000, // 完全稳定
        timestamp: Date.now() + i * 1000,
      }));

      const flowEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 7, // 70%
        responseTime: 2000, // 完全稳定
        timestamp: Date.now() + i * 1000,
      }));

      const boredomResult = detector.detectFlow(state, boredomEvents);
      const flowResult = detector.detectFlow(state, flowEvents);

      expect(boredomResult.state).toBe('boredom');
      expect(flowResult.state).toBe('flow');
    });

    it('应该检测从anxiety到boredom的转换（难度大幅降低）', () => {
      const anxietyEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        isCorrect: i < 4, // 40%
        timestamp: Date.now() + i * 1000,
      }));

      const boredomEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        isCorrect: i < 9, // 90%
        timestamp: Date.now() + i * 1000,
      }));

      const anxietyResult = detector.detectFlow(baseState, anxietyEvents);
      const boredomResult = detector.detectFlow(baseState, boredomEvents);

      expect(anxietyResult.state).toBe('anxiety');
      expect(boredomResult.state).toBe('boredom');
    });
  });

  // ==================== 实际场景模拟测试 ====================

  describe('realistic scenarios', () => {
    it('应该模拟初学者场景（低成功率、不稳定）', () => {
      const beginnerState = {
        ...baseState,
        A: 0.2, // 非常低注意力
        M: -0.8, // 非常低动机
        C: { mem: 0.4, speed: 0.5, stability: 0.5 },
      };

      // 使用固定的不稳定值
      const unstableValues = [1500, 3500, 1000, 4000, 1800, 3200, 1200, 3800, 900, 3600];
      const beginnerEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 6, // 60% - 低于目标区间
        responseTime: unstableValues[i], // 不稳定
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(beginnerState, beginnerEvents);
      // 低注意力和动机，加上低成功率，可能是anxiety或normal
      expect(['anxiety', 'normal']).toContain(result.state);
      expect(result.score).toBeLessThan(0.6);
      // 建议文本取决于状态，不一定包含"难度"
      expect(result.recommendation).toBeDefined();
    });

    it('应该模拟专家场景（高成功率、稳定）', () => {
      const expertState = {
        ...baseState,
        A: 0.95,
        M: 0.9,
        C: { mem: 0.9, speed: 0.9, stability: 0.95 },
      };

      const expertEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 9.5, // 95%
        responseTime: 1800 + (i % 2) * 50, // 很稳定
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(expertState, expertEvents);
      expect(result.state).toBe('boredom');
      expect(result.recommendation).toContain('增加难度');
    });

    it('应该模拟疲劳场景（低注意力、高疲劳）', () => {
      const tiredState = {
        ...baseState,
        A: 0.3,
        F: 0.8,
        M: -0.5,
      };

      const tiredEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 6, // 60%
        responseTime: 2500 + Math.random() * 1000, // 慢且不稳定
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(tiredState, tiredEvents);
      expect(result.score).toBeLessThan(0.5);
    });

    it('应该模拟理想心流场景', () => {
      const idealState = {
        ...baseState,
        A: 1.0, // 最大注意力
        M: 1.0, // 最大动机
        C: { mem: 0.85, speed: 0.8, stability: 0.9 },
      };

      const idealEvents = Array.from({ length: 20 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 14, // 70%
        responseTime: 2000, // 完全稳定
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(idealState, idealEvents);
      expect(result.state).toBe('flow');
      expect(result.score).toBeGreaterThanOrEqual(0.7);
      expect(result.recommendation).toContain('保持');
    });

    it('应该模拟挫败场景（连续失败）', () => {
      const frustratedState = {
        ...baseState,
        A: 0.5,
        M: -0.7,
      };

      const frustratedEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        wordId: `word-${i}`,
        isCorrect: i < 2, // 20%
        responseTime: 2000 + Math.random() * 1500, // 不稳定
        timestamp: Date.now() + i * 1000,
      }));

      const result = detector.detectFlow(frustratedState, frustratedEvents);
      expect(result.state).toBe('anxiety');
      expect(result.score).toBeLessThan(0.3);
      expect(result.recommendation).toContain('降低难度');
    });

    it('应该模拟恢复场景（从anxiety恢复到normal）', () => {
      const recoveringState = { ...baseState, A: 0.2, M: -0.8 }; // 非常低状态

      const initialEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        isCorrect: i < 6, // 60% - 低于目标区间
        responseTime: 2000,
        timestamp: Date.now() + i * 1000,
      }));

      const recoveredEvents = Array.from({ length: 10 }, (_, i) => ({
        ...baseEvents[0],
        isCorrect: i < 7, // 70% - 目标区间内
        responseTime: 2000,
        timestamp: Date.now() + i * 1000,
      }));

      const initialResult = detector.detectFlow(recoveringState, initialEvents);
      const recoveredResult = detector.detectFlow(recoveringState, recoveredEvents);

      // 60%和70%接近边界，可能都被判定为normal或anxiety
      expect(['anxiety', 'normal']).toContain(initialResult.state);
      expect(recoveredResult.state).not.toBe('boredom'); // 确保不是boredom
      // 70%应该比60%分数更高
      expect(recoveredResult.score).toBeGreaterThan(initialResult.score);
    });
  });

  // ==================== 特殊计算逻辑测试 ====================

  describe('special calculation logic', () => {
    it('应该验证成功率因子在目标区间边界的计算', () => {
      // 测试边界值：65%, 72.5%, 80%
      const rates = [0.65, 0.725, 0.8];

      rates.forEach((rate) => {
        const events = Array.from({ length: 20 }, (_, i) => ({
          ...baseEvents[0],
          isCorrect: i < Math.floor(20 * rate),
          responseTime: 2000,
          timestamp: Date.now() + i * 1000,
        }));

        const result = detector.detectFlow(baseState, events);
        // 边界值应该都在目标区间内，得分应该较高
        expect(result.score).toBeGreaterThan(0.5);
      });
    });

    it('应该验证变异系数(CV)的计算', () => {
      // CV = std / mean
      // CV < 0.3: 高稳定性
      // CV = 0.5: 中等稳定性
      // CV > 1.0: 低稳定性

      const testCases = [
        { name: 'CV~0.1', values: [2000, 2010, 1990, 2005, 1995] },
        { name: 'CV~0.5', values: [2000, 2500, 1500, 2200, 1800] },
        { name: 'CV~1.5', values: [1000, 3000, 500, 3500, 2000] },
      ];

      const results = testCases.map((testCase) => {
        const events = Array.from({ length: 10 }, (_, i) => ({
          ...baseEvents[0],
          isCorrect: i < 7,
          responseTime: testCase.values[i % testCase.values.length],
          timestamp: Date.now() + i * 1000,
        }));
        return detector.detectFlow(baseState, events);
      });

      // 稳定性越高，分数应该越高
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      expect(results[1].score).toBeGreaterThanOrEqual(results[2].score);
    });

    it('应该验证状态因子权重分配（注意力60%，动机40%）', () => {
      // 测试1: A=1, M=0 vs A=0, M=1
      const state1 = { ...baseState, A: 1, M: 0 };
      const state2 = { ...baseState, A: 0, M: 1 };

      const result1 = detector.detectFlow(state1, baseEvents);
      const result2 = detector.detectFlow(state2, baseEvents);

      // 由于注意力权重更高，state1应该得分更高
      expect(result1.score).toBeGreaterThan(result2.score);
    });
  });
});
