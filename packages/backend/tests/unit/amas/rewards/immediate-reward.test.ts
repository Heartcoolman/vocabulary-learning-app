/**
 * ImmediateRewardEvaluator Unit Tests
 * 即时奖励计算逻辑单元测试
 *
 * 测试覆盖:
 * - 基础奖励计算
 * - 速度奖励逻辑
 * - 难度奖励逻辑
 * - 遗忘曲线调整
 * - 鼓励文案生成
 * - 解释性文本生成
 * - 边界情况和异常处理
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ImmediateRewardEvaluator,
  ExtendedRawEvent,
  ExtendedUserState,
  ImmediateReward,
} from '../../../../src/amas/rewards/immediate-reward';
import { RawEvent, UserState } from '../../../../src/amas/types';
import { WordLearningState } from '@prisma/client';

describe('ImmediateRewardEvaluator', () => {
  let evaluator: ImmediateRewardEvaluator;

  beforeEach(() => {
    evaluator = new ImmediateRewardEvaluator();
  });

  // ==================== 初始化测试 ====================

  describe('initialization', () => {
    it('应该成功创建实例', () => {
      expect(evaluator).toBeDefined();
      expect(evaluator).toBeInstanceOf(ImmediateRewardEvaluator);
    });

    it('应该有默认的奖励配置文件', () => {
      // 设置配置文件不应该抛出错误
      expect(() => evaluator.setRewardProfile('standard')).not.toThrow();
      expect(() => evaluator.setRewardProfile('cram')).not.toThrow();
      expect(() => evaluator.setRewardProfile('relaxed')).not.toThrow();
    });
  });

  // ==================== 基础奖励计算测试 ====================

  describe('computeImmediate - basic reward', () => {
    it('回答正确时应该返回正奖励', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0,
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.6, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      };

      const result = evaluator.computeImmediate(event, state);

      expect(result.value).toBeGreaterThan(0);
      expect(result.breakdown?.correctness).toBe(1.0);
      expect(result.timestamp).toBeDefined();
    });

    it('回答错误时应该返回负奖励', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: false,
        responseTime: 5000,
        retryCount: 1,
      };

      const state: UserState = {
        A: 0.5,
        F: 0.5,
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        M: 0.0,
        conf: 0.6,
        ts: Date.now(),
      };

      const result = evaluator.computeImmediate(event, state);

      expect(result.value).toBeLessThan(0);
      expect(result.breakdown?.correctness).toBe(-1.0);
    });

    it('奖励值应该被限制在 [-1, 1] 范围内', () => {
      const event: ExtendedRawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 500, // 非常快
        retryCount: 0,
        wordDifficulty: 0.7, // 高难度
      };

      const state: ExtendedUserState = {
        A: 0.9,
        F: 0.1,
        C: { mem: 0.7, speed: 0.8, stability: 0.9 },
        M: 0.8,
        conf: 0.9,
        ts: Date.now(),
        avgResponseTime: 3000,
      };

      const result = evaluator.computeImmediate(event, state);

      expect(result.value).toBeGreaterThanOrEqual(-1);
      expect(result.value).toBeLessThanOrEqual(1);
    });
  });

  // ==================== 速度奖励测试 ====================

  describe('speed bonus calculation', () => {
    it('非常快的反应时间应该给予最高速度奖励 (+0.3)', () => {
      const event: ExtendedRawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 1000, // 小于0.5倍基线
        retryCount: 0,
      };

      const state: ExtendedUserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
        avgResponseTime: 3000, // 基线3秒
      };

      const result = evaluator.computeImmediate(event, state);

      // 基础奖励1 + 速度奖励0.3，其他因素应该小于等于0.4
      expect(result.breakdown?.speed).toBeCloseTo(0.3, 1);
      // computeImmediate 会将奖励值限制在 [-1, 1]
      expect(result.value).toBe(1.0);
    });

    it('快速反应应该给予较高速度奖励 (0.2-0.3)', () => {
      const event: ExtendedRawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2000, // 0.5-0.8倍基线
        retryCount: 0,
      };

      const state: ExtendedUserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
        avgResponseTime: 3000,
      };

      const result = evaluator.computeImmediate(event, state);

      expect(result.breakdown?.speed).toBeGreaterThanOrEqual(0.2);
      expect(result.breakdown?.speed).toBeLessThanOrEqual(0.3);
    });

    it('正常速度应该给予少量或无速度奖励', () => {
      const event: ExtendedRawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 3000, // 接近基线
        retryCount: 0,
      };

      const state: ExtendedUserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
        avgResponseTime: 3000,
      };

      const result = evaluator.computeImmediate(event, state);

      expect(result.breakdown?.speed).toBeLessThanOrEqual(0.1);
      expect(result.breakdown?.speed).toBeGreaterThanOrEqual(0);
    });

    it('慢速反应应该给予负速度奖励', () => {
      const event: ExtendedRawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 4000, // 1.2-1.5倍基线
        retryCount: 0,
      };

      const state: ExtendedUserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
        avgResponseTime: 3000,
      };

      const result = evaluator.computeImmediate(event, state);

      expect(result.breakdown?.speed).toBeLessThan(0);
      expect(result.breakdown?.speed).toBeGreaterThanOrEqual(-0.2);
    });

    it('非常慢的反应应该给予最大负速度奖励 (-0.3)', () => {
      const event: ExtendedRawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 5000, // >1.5倍基线
        retryCount: 0,
      };

      const state: ExtendedUserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
        avgResponseTime: 3000,
      };

      const result = evaluator.computeImmediate(event, state);

      expect(result.breakdown?.speed).toBeCloseTo(-0.3, 1);
    });

    it('没有平均反应时间时应该使用默认基线3秒', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 1000, // 小于默认基线的0.5倍
        retryCount: 0,
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
        // 没有 avgResponseTime
      };

      const result = evaluator.computeImmediate(event, state);

      // 应该使用默认基线计算，1000ms < 3000ms * 0.5
      expect(result.breakdown?.speed).toBeCloseTo(0.3, 1);
    });
  });

  // ==================== 难度奖励测试 ====================

  describe('difficulty bonus calculation', () => {
    it('难度匹配用户能力时应该给予最高难度奖励', () => {
      const event: ExtendedRawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0,
        wordDifficulty: 0.7, // 难度0.7
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 }, // 记忆力0.7
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      };

      const result = evaluator.computeImmediate(event, state);

      // 难度完全匹配，奖励应该接近 +0.2
      expect(result.breakdown?.frustration).toBeCloseTo(0.2, 1);
    });

    it('难度略低于能力时应该给予少量奖励', () => {
      const event: ExtendedRawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0,
        wordDifficulty: 0.5,
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      };

      const result = evaluator.computeImmediate(event, state);

      // 差距0.2，match = 0.8，bonus = (0.8 - 0.5) * 0.4 = 0.12
      expect(result.breakdown?.frustration).toBeGreaterThan(0);
      expect(result.breakdown?.frustration).toBeLessThan(0.2);
    });

    it('难度远低于能力时应该给予负奖励（无聊）', () => {
      const event: ExtendedRawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0,
        wordDifficulty: 0.2,
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.8, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      };

      const result = evaluator.computeImmediate(event, state);

      expect(result.breakdown?.frustration).toBeLessThan(0);
    });

    it('难度远高于能力时应该给予负奖励（挫败）', () => {
      const event: ExtendedRawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0,
        wordDifficulty: 0.9,
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.3, speed: 0.5, stability: 0.5 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      };

      const result = evaluator.computeImmediate(event, state);

      expect(result.breakdown?.frustration).toBeLessThan(0);
    });

    it('没有提供难度时应该使用默认值0.5', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0,
        // 没有 wordDifficulty
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.5, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      };

      const result = evaluator.computeImmediate(event, state);

      // 难度0.5，能力0.5，完全匹配
      expect(result.breakdown?.frustration).toBeCloseTo(0.2, 1);
    });
  });

  // ==================== 遗忘曲线调整测试 ====================

  describe('forgetting curve adjustment', () => {
    it('半衰期短且答对时应该给予较高奖励', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0,
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      };

      // 模拟短半衰期（容易遗忘）
      const wordState = {
        halfLife: 0.5, // 0.5天
      } as WordLearningState;

      const eventWithWordState = { ...event, wordState };
      const result = evaluator.computeImmediate(eventWithWordState, state);

      // 短半衰期答对，应该获得较高的遗忘曲线调整奖励
      expect(result.breakdown?.engagement).toBeGreaterThan(0);
      expect(result.breakdown?.engagement).toBeLessThanOrEqual(0.2);
    });

    it('半衰期长且答对时应该给予较低奖励', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0,
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      };

      // 模拟长半衰期（不易遗忘）
      const wordState = {
        halfLife: 60.0, // 60天
      } as WordLearningState;

      const eventWithWordState = { ...event, wordState };
      const result = evaluator.computeImmediate(eventWithWordState, state);

      // 长半衰期答对，遗忘曲线调整奖励应该接近0
      expect(result.breakdown?.engagement).toBeGreaterThanOrEqual(0);
      expect(result.breakdown?.engagement).toBeLessThan(0.1);
    });

    it('半衰期短且答错时应该给予轻微惩罚', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: false,
        responseTime: 3000,
        retryCount: 1,
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      };

      const wordState = {
        halfLife: 0.5,
      } as WordLearningState;

      const eventWithWordState = { ...event, wordState };
      const result = evaluator.computeImmediate(eventWithWordState, state);

      // 短半衰期答错，惩罚应该较轻
      expect(result.breakdown?.engagement).toBeLessThanOrEqual(0);
      expect(result.breakdown?.engagement).toBeGreaterThanOrEqual(-0.1);
    });

    it('半衰期长且答错时应该给予较重惩罚', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: false,
        responseTime: 3000,
        retryCount: 1,
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      };

      const wordState = {
        halfLife: 60.0,
      } as WordLearningState;

      const eventWithWordState = { ...event, wordState };
      const result = evaluator.computeImmediate(eventWithWordState, state);

      // 长半衰期答错，惩罚应该较重
      expect(result.breakdown?.engagement).toBeLessThan(0);
      expect(result.breakdown?.engagement).toBeGreaterThanOrEqual(-0.2);
    });

    it('没有半衰期信息时应该使用默认值1.0', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0,
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      };

      const result = evaluator.computeImmediate(event, state);

      // 使用默认半衰期，应该有一定的奖励
      expect(result.breakdown?.engagement).toBeDefined();
    });
  });

  // ==================== 鼓励文案生成测试 ====================

  describe('encouragement text generation', () => {
    it('高奖励值应该生成积极的鼓励文案', () => {
      const event: ExtendedRawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 1000,
        retryCount: 0,
        wordDifficulty: 0.7,
      };

      const state: ExtendedUserState = {
        A: 0.9,
        F: 0.1,
        C: { mem: 0.7, speed: 0.8, stability: 0.9 },
        M: 0.8,
        conf: 0.9,
        ts: Date.now(),
        avgResponseTime: 3000,
      };

      const result = evaluator.computeImmediate(event, state);

      expect(result.reason).toBeDefined();
      expect(result.reason.length).toBeGreaterThan(0);
      // 高奖励应该包含积极词汇
      expect(
        result.reason.includes('完美') ||
          result.reason.includes('很好') ||
          result.reason.includes('棒'),
      ).toBe(true);
    });

    it('中等奖励值应该生成鼓励性文案', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2500,
        retryCount: 0,
      };

      const state: UserState = {
        A: 0.7,
        F: 0.3,
        C: { mem: 0.6, speed: 0.6, stability: 0.7 },
        M: 0.5,
        conf: 0.7,
        ts: Date.now(),
      };

      const result = evaluator.computeImmediate(event, state);

      expect(result.reason).toBeDefined();
      expect(result.reason.length).toBeGreaterThan(0);
    });

    it('负奖励值应该生成安慰性文案', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: false,
        responseTime: 5000,
        retryCount: 2,
      };

      const state: UserState = {
        A: 0.5,
        F: 0.6,
        C: { mem: 0.4, speed: 0.4, stability: 0.5 },
        M: -0.3,
        conf: 0.5,
        ts: Date.now(),
      };

      const result = evaluator.computeImmediate(event, state);

      expect(result.reason).toBeDefined();
      // 负奖励应该包含安慰词汇
      expect(
        result.reason.includes('不要气馁') ||
          result.reason.includes('没关系') ||
          result.reason.includes('慢慢来'),
      ).toBe(true);
    });

    it('连续答错后答对应该生成特殊鼓励文案', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2500,
        retryCount: 0,
      };

      const state: ExtendedUserState = {
        A: 0.6,
        F: 0.5,
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        M: 0.2,
        conf: 0.6,
        ts: Date.now(),
        consecutiveWrong: 3, // 连续答错3次
      };

      const result = evaluator.computeImmediate(event, state);

      expect(result.reason).toContain('终于答对了');
      expect(result.reason).toContain('坚持');
    });
  });

  // ==================== 解释性文本生成测试 ====================

  describe('explanation text generation', () => {
    it('应该生成包含正确性的解释', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0,
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      };

      // 使用旧版方法测试解释性文本
      const result = evaluator.computeImmediateLegacy(event, state);

      expect(result.explanation).toContain('回答正确');
    });

    it('应该在反应快时包含速度反馈', () => {
      const event: ExtendedRawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 1000,
        retryCount: 0,
      };

      const state: ExtendedUserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
        avgResponseTime: 3000,
      };

      const result = evaluator.computeImmediateLegacy(event, state);

      expect(result.explanation).toContain('速度');
    });

    it('应该在难度匹配时包含难度反馈', () => {
      const event: ExtendedRawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0,
        wordDifficulty: 0.7,
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      };

      const result = evaluator.computeImmediateLegacy(event, state);

      expect(result.explanation).toContain('难度');
    });

    it('应该生成完整的解释文本', () => {
      const event: ExtendedRawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 1000,
        retryCount: 0,
        wordDifficulty: 0.7,
      };

      const state: ExtendedUserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
        avgResponseTime: 3000,
      };

      const wordState = {
        halfLife: 0.5,
      } as WordLearningState;

      const result = evaluator.computeImmediateLegacy(
        { ...event, wordState } as never,
        state,
        wordState,
      );

      expect(result.explanation).toBeDefined();
      expect(result.explanation.length).toBeGreaterThan(0);
      // 应该包含多个反馈点
      expect(result.explanation.split('，').length).toBeGreaterThan(1);
    });
  });

  // ==================== Legacy 方法兼容性测试 ====================

  describe('computeImmediateLegacy - backward compatibility', () => {
    it('旧版方法应该返回完整的 ImmediateReward 结构', () => {
      const event: ExtendedRawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0,
        wordDifficulty: 0.7,
      };

      const state: ExtendedUserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
        avgResponseTime: 3000,
      };

      const result = evaluator.computeImmediateLegacy(event, state);

      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('encouragement');
      expect(result).toHaveProperty('explanation');
      expect(result).toHaveProperty('factors');
      expect(result).toHaveProperty('timestamp');

      expect(result.factors).toHaveProperty('base');
      expect(result.factors).toHaveProperty('speedBonus');
      expect(result.factors).toHaveProperty('difficultyBonus');
      expect(result.factors).toHaveProperty('forgettingDelta');
    });

    it('新旧方法应该产生一致的奖励值', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0,
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      };

      const newResult = evaluator.computeImmediate(event, state);
      const legacyResult = evaluator.computeImmediateLegacy(event, state);

      expect(newResult.value).toBeCloseTo(legacyResult.value, 2);
    });
  });

  // ==================== 边界情况测试 ====================

  describe('edge cases', () => {
    it('应该处理极端快速反应（< 100ms）', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 50,
        retryCount: 0,
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.9, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      };

      expect(() => evaluator.computeImmediate(event, state)).not.toThrow();
      const result = evaluator.computeImmediate(event, state);
      expect(result.value).toBeLessThanOrEqual(1);
    });

    it('应该处理极端慢速反应（> 60秒）', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 65000,
        retryCount: 0,
      };

      const state: UserState = {
        A: 0.3,
        F: 0.7,
        C: { mem: 0.5, speed: 0.2, stability: 0.5 },
        M: 0.0,
        conf: 0.5,
        ts: Date.now(),
      };

      expect(() => evaluator.computeImmediate(event, state)).not.toThrow();
      const result = evaluator.computeImmediate(event, state);
      expect(result.value).toBeGreaterThanOrEqual(-1);
    });

    it('应该处理极端半衰期值', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0,
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      };

      const extremeShort = {
        halfLife: 0.01,
      } as WordLearningState;

      const extremeLong = {
        halfLife: 365,
      } as WordLearningState;

      expect(() =>
        evaluator.computeImmediate({ ...event, wordState: extremeShort }, state),
      ).not.toThrow();

      expect(() =>
        evaluator.computeImmediate({ ...event, wordState: extremeLong }, state),
      ).not.toThrow();
    });

    it('应该处理所有状态字段为极端值的情况', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: false,
        responseTime: 10000,
        retryCount: 5,
      };

      const extremeState: ExtendedUserState = {
        A: 0,
        F: 1,
        C: { mem: 0, speed: 0, stability: 0 },
        M: -1,
        conf: 0,
        ts: Date.now(),
        avgResponseTime: 1000,
        consecutiveWrong: 10,
      };

      expect(() => evaluator.computeImmediate(event, extremeState)).not.toThrow();
      const result = evaluator.computeImmediate(event, extremeState);

      expect(result.value).toBeGreaterThanOrEqual(-1);
      expect(result.value).toBeLessThanOrEqual(1);
      expect(result.reason).toBeDefined();
    });

    it('应该处理缺少所有可选字段的情况', () => {
      const minimalEvent: RawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0,
      };

      const minimalState: UserState = {
        A: 0.5,
        F: 0.5,
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        M: 0,
        conf: 0.5,
        ts: Date.now(),
      };

      expect(() => evaluator.computeImmediate(minimalEvent, minimalState)).not.toThrow();
      const result = evaluator.computeImmediate(minimalEvent, minimalState);

      expect(result).toBeDefined();
      expect(result.value).toBeDefined();
      expect(result.reason).toBeDefined();
    });
  });

  // ==================== 奖励分解测试 ====================

  describe('reward breakdown', () => {
    it('应该返回详细的奖励分解', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0,
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      };

      const result = evaluator.computeImmediate(event, state);

      expect(result.breakdown).toBeDefined();
      expect(result.breakdown?.correctness).toBeDefined();
      expect(result.breakdown?.speed).toBeDefined();
      expect(result.breakdown?.frustration).toBeDefined();
      expect(result.breakdown?.engagement).toBeDefined();
    });

    it('分解各项之和应该合理地接近总奖励值', () => {
      const event: ExtendedRawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 1500,
        retryCount: 0,
        wordDifficulty: 0.6,
      };

      const state: ExtendedUserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.6, speed: 0.7, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
        avgResponseTime: 2500,
      };

      const result = evaluator.computeImmediate(event, state);
      const breakdown = result.breakdown!;

      // 计算分解之和（在限制范围前）
      const sum =
        (breakdown.correctness ?? 0) +
        (breakdown.speed ?? 0) +
        (breakdown.frustration ?? 0) +
        (breakdown.engagement ?? 0);

      // 由于最终value会被限制在[-1,1]，所以只检查分解值是否合理
      expect(Math.abs(sum)).toBeLessThan(3); // 合理范围
    });
  });

  // ==================== 性能测试 ====================

  describe('performance', () => {
    it('应该能快速计算大量奖励（< 1ms per call）', () => {
      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0,
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      };

      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        evaluator.computeImmediate(event, state);
      }

      const duration = performance.now() - startTime;
      const avgTime = duration / iterations;

      expect(avgTime).toBeLessThan(1); // 平均每次计算 < 1ms
    });
  });

  // ==================== 配置文件测试 ====================

  describe('reward profile configuration', () => {
    it('应该能设置不同的奖励配置文件', () => {
      const profiles = ['standard', 'cram', 'relaxed', 'custom'];

      profiles.forEach((profile) => {
        expect(() => evaluator.setRewardProfile(profile)).not.toThrow();
      });
    });

    it('设置配置文件后计算应该正常工作', () => {
      evaluator.setRewardProfile('cram');

      const event: RawEvent = {
        wordId: 'test1',
        isCorrect: true,
        responseTime: 2000,
        retryCount: 0,
      };

      const state: UserState = {
        A: 0.8,
        F: 0.2,
        C: { mem: 0.7, speed: 0.8, stability: 0.8 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      };

      expect(() => evaluator.computeImmediate(event, state)).not.toThrow();
      const result = evaluator.computeImmediate(event, state);
      expect(result.value).toBeDefined();
    });
  });
});
