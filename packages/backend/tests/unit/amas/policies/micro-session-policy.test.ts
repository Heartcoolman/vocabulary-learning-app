/**
 * MicroSessionPolicy Unit Tests
 * 碎片时间适配策略单元测试
 *
 * 测试覆盖:
 * - 选词逻辑
 * - 评分算法
 * - 数量限制
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MicroSessionPolicy,
  createMicroSessionPolicy,
  defaultMicroSessionPolicy,
} from '../../../../src/amas/policies/micro-session-policy';
import {
  WordCandidate,
  SelectionContext,
} from '../../../../src/amas/policies/word-selector.interface';

describe('MicroSessionPolicy', () => {
  let policy: MicroSessionPolicy;

  beforeEach(() => {
    policy = new MicroSessionPolicy();
  });

  // ==================== 初始化测试 ====================

  describe('initialization', () => {
    it('应该使用默认最大单词数量5初始化', () => {
      const config = policy.getConfig();
      expect(config.maxWords).toBe(5);
    });

    it('应该接受自定义最大单词数量', () => {
      const customPolicy = new MicroSessionPolicy(8);
      const config = customPolicy.getConfig();
      expect(config.maxWords).toBe(8);
    });

    it('应该限制最大单词数量在1-10之间', () => {
      const tooSmall = new MicroSessionPolicy(0);
      expect(tooSmall.getConfig().maxWords).toBe(1);

      const tooLarge = new MicroSessionPolicy(15);
      expect(tooLarge.getConfig().maxWords).toBe(10);
    });

    it('应该正确设置策略名称', () => {
      expect(policy.getName()).toBe('MicroSessionPolicy');
    });

    it('应该正确返回配置信息', () => {
      const config = policy.getConfig();
      expect(config).toHaveProperty('maxWords');
      expect(config).toHaveProperty('weights');
      expect(config).toHaveProperty('shortWordLength');
      expect(config.shortWordLength).toBe(8);
    });
  });

  // ==================== 选词逻辑测试 ====================

  describe('selectWords', () => {
    it('应该在无候选词时返回空结果', () => {
      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: Date.now(),
      };

      const result = policy.selectWords([], context);
      expect(result.selectedWordIds).toHaveLength(0);
      expect(result.reason).toBe('无可用单词');
    });

    it('应该在候选词数量不超过目标数量时返回全部', () => {
      const candidates: WordCandidate[] = [
        { wordId: 'word1', length: 5 },
        { wordId: 'word2', length: 6 },
        { wordId: 'word3', length: 7 },
      ];

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: Date.now(),
      };

      const result = policy.selectWords(candidates, context);
      expect(result.selectedWordIds).toHaveLength(3);
      expect(result.selectedWordIds).toContain('word1');
      expect(result.selectedWordIds).toContain('word2');
      expect(result.selectedWordIds).toContain('word3');
    });

    it('应该选择优先级最高的N个单词', () => {
      const now = Date.now();
      const candidates: WordCandidate[] = [
        {
          wordId: 'word1',
          length: 5,
          forgettingRisk: 0.3,
          memoryStrength: 0.7,
          reviewCount: 3,
        },
        {
          wordId: 'word2',
          length: 15,
          forgettingRisk: 0.9,
          memoryStrength: 0.2,
          reviewCount: 1,
        },
        {
          wordId: 'word3',
          length: 6,
          forgettingRisk: 0.8,
          memoryStrength: 0.3,
          reviewCount: 2,
        },
        {
          wordId: 'word4',
          length: 20,
          forgettingRisk: 0.5,
          memoryStrength: 0.6,
          reviewCount: 5,
        },
        {
          wordId: 'word5',
          length: 7,
          forgettingRisk: 0.95,
          memoryStrength: 0.1,
          reviewCount: 0,
        },
        {
          wordId: 'word6',
          length: 8,
          forgettingRisk: 0.85,
          memoryStrength: 0.25,
          reviewCount: 1,
        },
      ];

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
        targetCount: 3,
      };

      const result = policy.selectWords(candidates, context);
      expect(result.selectedWordIds).toHaveLength(3);
      expect(result.scores).toBeDefined();
      expect(result.scores!.size).toBeGreaterThan(0);
    });

    it('应该优先选择短词', () => {
      const now = Date.now();
      const candidates: WordCandidate[] = [
        {
          wordId: 'short1',
          length: 5,
          forgettingRisk: 0.5,
          memoryStrength: 0.5,
          reviewCount: 2,
        },
        {
          wordId: 'long1',
          length: 20,
          forgettingRisk: 0.5,
          memoryStrength: 0.5,
          reviewCount: 2,
        },
      ];

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
        targetCount: 1,
      };

      const result = policy.selectWords(candidates, context);
      expect(result.selectedWordIds[0]).toBe('short1');
    });

    it('应该优先选择高遗忘风险的单词', () => {
      const now = Date.now();
      const candidates: WordCandidate[] = [
        {
          wordId: 'low-risk',
          length: 6,
          forgettingRisk: 0.2,
          memoryStrength: 0.8,
          reviewCount: 5,
        },
        {
          wordId: 'high-risk',
          length: 6,
          forgettingRisk: 0.9,
          memoryStrength: 0.2,
          reviewCount: 1,
        },
      ];

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
        targetCount: 1,
      };

      const result = policy.selectWords(candidates, context);
      expect(result.selectedWordIds[0]).toBe('high-risk');
    });

    it('应该尊重上下文中的targetCount', () => {
      const candidates: WordCandidate[] = Array.from({ length: 10 }, (_, i) => ({
        wordId: `word${i}`,
        length: 6,
        forgettingRisk: 0.5,
        memoryStrength: 0.5,
        reviewCount: 2,
      }));

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: Date.now(),
        targetCount: 3,
      };

      const result = policy.selectWords(candidates, context);
      expect(result.selectedWordIds).toHaveLength(3);
    });

    it('应该不超过策略配置的maxWords', () => {
      const policy = new MicroSessionPolicy(3);
      const candidates: WordCandidate[] = Array.from({ length: 10 }, (_, i) => ({
        wordId: `word${i}`,
        length: 6,
        forgettingRisk: 0.5,
        memoryStrength: 0.5,
        reviewCount: 2,
      }));

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: Date.now(),
        targetCount: 8,
      };

      const result = policy.selectWords(candidates, context);
      expect(result.selectedWordIds).toHaveLength(3);
    });
  });

  // ==================== 评分算法测试 ====================

  describe('scoring algorithm', () => {
    it('应该为短词给予更高分数', () => {
      const now = Date.now();
      const shortWord: WordCandidate = {
        wordId: 'short',
        length: 5,
        forgettingRisk: 0.5,
        memoryStrength: 0.5,
        reviewCount: 2,
      };

      const longWord: WordCandidate = {
        wordId: 'long',
        length: 15,
        forgettingRisk: 0.5,
        memoryStrength: 0.5,
        reviewCount: 2,
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([shortWord, longWord], context);
      const shortScore = scores.find((s) => s.wordId === 'short')!.score;
      const longScore = scores.find((s) => s.wordId === 'long')!.score;

      expect(shortScore).toBeGreaterThan(longScore);
    });

    it('应该为高遗忘风险单词给予更高分数', () => {
      const now = Date.now();
      const highRisk: WordCandidate = {
        wordId: 'high-risk',
        length: 6,
        forgettingRisk: 0.9,
        memoryStrength: 0.5,
        reviewCount: 2,
      };

      const lowRisk: WordCandidate = {
        wordId: 'low-risk',
        length: 6,
        forgettingRisk: 0.1,
        memoryStrength: 0.5,
        reviewCount: 2,
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([highRisk, lowRisk], context);
      const highScore = scores.find((s) => s.wordId === 'high-risk')!.score;
      const lowScore = scores.find((s) => s.wordId === 'low-risk')!.score;

      expect(highScore).toBeGreaterThan(lowScore);
    });

    it('应该为记忆薄弱单词给予更高分数', () => {
      const now = Date.now();
      const weakMemory: WordCandidate = {
        wordId: 'weak',
        length: 6,
        forgettingRisk: 0.5,
        memoryStrength: 0.2,
        reviewCount: 1,
      };

      const strongMemory: WordCandidate = {
        wordId: 'strong',
        length: 6,
        forgettingRisk: 0.5,
        memoryStrength: 0.8,
        reviewCount: 10,
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([weakMemory, strongMemory], context);
      const weakScore = scores.find((s) => s.wordId === 'weak')!.score;
      const strongScore = scores.find((s) => s.wordId === 'strong')!.score;

      expect(weakScore).toBeGreaterThan(strongScore);
    });

    it('应该正确计算综合评分', () => {
      const now = Date.now();
      const candidate: WordCandidate = {
        wordId: 'test',
        length: 8,
        forgettingRisk: 0.7,
        memoryStrength: 0.3,
        reviewCount: 2,
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([candidate], context);
      const score = scores[0];

      expect(score.score).toBeGreaterThan(0);
      expect(score.score).toBeLessThanOrEqual(1);
      expect(score.details).toHaveProperty('forgettingRisk');
      expect(score.details).toHaveProperty('shortWordBonus');
      expect(score.details).toHaveProperty('memoryWeakness');
    });

    it('应该处理缺少可选字段的候选词', () => {
      const now = Date.now();
      const minimal: WordCandidate = {
        wordId: 'minimal',
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([minimal], context);
      expect(scores).toHaveLength(1);
      expect(scores[0].score).toBeGreaterThan(0);
    });

    it('短词奖励应该在length<=8时给满分', () => {
      const now = Date.now();
      const candidate: WordCandidate = {
        wordId: 'test',
        length: 8,
        forgettingRisk: 0,
        memoryStrength: 1,
        reviewCount: 0,
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([candidate], context);
      expect(scores[0].details.shortWordBonus).toBe(1.0);
    });

    it('短词奖励应该在length>8时线性递减', () => {
      const now = Date.now();
      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const word9: WordCandidate = {
        wordId: 'word9',
        length: 9,
        forgettingRisk: 0,
        memoryStrength: 1,
        reviewCount: 0,
      };

      const word12: WordCandidate = {
        wordId: 'word12',
        length: 12,
        forgettingRisk: 0,
        memoryStrength: 1,
        reviewCount: 0,
      };

      const word15: WordCandidate = {
        wordId: 'word15',
        length: 15,
        forgettingRisk: 0,
        memoryStrength: 1,
        reviewCount: 0,
      };

      const scores = policy.scoreAll([word9, word12, word15], context);
      const bonus9 = scores.find((s) => s.wordId === 'word9')!.details.shortWordBonus;
      const bonus12 = scores.find((s) => s.wordId === 'word12')!.details.shortWordBonus;
      const bonus15 = scores.find((s) => s.wordId === 'word15')!.details.shortWordBonus;

      expect(bonus9).toBeLessThan(1.0);
      expect(bonus12).toBeLessThan(bonus9);
      expect(bonus15).toBeLessThan(bonus12);
    });
  });

  // ==================== 数量限制测试 ====================

  describe('quantity limits', () => {
    it('应该允许设置最大单词数量', () => {
      policy.setMaxWords(8);
      expect(policy.getConfig().maxWords).toBe(8);
    });

    it('应该限制设置的最大单词数量在1-10之间', () => {
      policy.setMaxWords(0);
      expect(policy.getConfig().maxWords).toBe(1);

      policy.setMaxWords(15);
      expect(policy.getConfig().maxWords).toBe(10);
    });

    it('应该在多次调用setMaxWords后保持正确值', () => {
      policy.setMaxWords(3);
      expect(policy.getConfig().maxWords).toBe(3);

      policy.setMaxWords(7);
      expect(policy.getConfig().maxWords).toBe(7);
    });
  });

  // ==================== 边界情况测试 ====================

  describe('edge cases', () => {
    it('应该处理所有候选词分数相同的情况', () => {
      const now = Date.now();
      const candidates: WordCandidate[] = Array.from({ length: 5 }, (_, i) => ({
        wordId: `word${i}`,
        length: 6,
        forgettingRisk: 0.5,
        memoryStrength: 0.5,
        reviewCount: 2,
      }));

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
        targetCount: 3,
      };

      const result = policy.selectWords(candidates, context);
      expect(result.selectedWordIds).toHaveLength(3);
    });

    it('应该处理未复习过的单词', () => {
      const now = Date.now();
      const candidate: WordCandidate = {
        wordId: 'new-word',
        length: 6,
        reviewCount: 0,
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([candidate], context);
      expect(scores[0].score).toBeGreaterThan(0);
      expect(scores[0].details.memoryWeakness).toBe(1.0);
    });

    it('应该处理没有lastReviewTime的单词', () => {
      const now = Date.now();
      const candidate: WordCandidate = {
        wordId: 'no-review-time',
        length: 6,
        reviewCount: 3,
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([candidate], context);
      expect(scores[0].score).toBeGreaterThan(0);
    });

    it('应该处理没有timestamp的context', () => {
      const candidates: WordCandidate[] = [
        { wordId: 'word1', length: 6 },
        { wordId: 'word2', length: 7 },
      ];

      const context: SelectionContext = {
        userId: 'test-user',
      };

      const result = policy.selectWords(candidates, context);
      expect(result.selectedWordIds).toHaveLength(2);
    });
  });

  // ==================== 工厂函数和默认实例测试 ====================

  describe('factory and defaults', () => {
    it('工厂函数应该创建新实例', () => {
      const instance1 = createMicroSessionPolicy();
      const instance2 = createMicroSessionPolicy();
      expect(instance1).not.toBe(instance2);
    });

    it('工厂函数应该接受自定义maxWords', () => {
      const instance = createMicroSessionPolicy(7);
      expect(instance.getConfig().maxWords).toBe(7);
    });

    it('默认实例应该可用', () => {
      expect(defaultMicroSessionPolicy).toBeDefined();
      expect(defaultMicroSessionPolicy.getName()).toBe('MicroSessionPolicy');
    });
  });

  // ==================== scoreAll方法测试 ====================

  describe('scoreAll', () => {
    it('应该返回所有候选词的详细评分', () => {
      const now = Date.now();
      const candidates: WordCandidate[] = [
        { wordId: 'word1', length: 5, forgettingRisk: 0.5, memoryStrength: 0.5, reviewCount: 2 },
        { wordId: 'word2', length: 10, forgettingRisk: 0.7, memoryStrength: 0.3, reviewCount: 1 },
      ];

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll(candidates, context);
      expect(scores).toHaveLength(2);

      scores.forEach((score) => {
        expect(score).toHaveProperty('wordId');
        expect(score).toHaveProperty('score');
        expect(score).toHaveProperty('details');
        expect(score.details).toHaveProperty('forgettingRisk');
        expect(score.details).toHaveProperty('shortWordBonus');
        expect(score.details).toHaveProperty('memoryWeakness');
        expect(score.details).toHaveProperty('length');
        expect(score.details).toHaveProperty('reviewCount');
      });
    });

    it('应该为空数组返回空结果', () => {
      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: Date.now(),
      };

      const scores = policy.scoreAll([], context);
      expect(scores).toHaveLength(0);
    });
  });

  // ==================== 遗忘风险计算测试 ====================

  describe('forgetting risk calculation', () => {
    it('应该使用提供的forgettingRisk值', () => {
      const now = Date.now();
      const candidate: WordCandidate = {
        wordId: 'test',
        length: 6,
        forgettingRisk: 0.75,
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([candidate], context);
      expect(scores[0].details.forgettingRisk).toBe(0.75);
    });

    it('对于没有复习过的单词应该返回最高风险', () => {
      const now = Date.now();
      const candidate: WordCandidate = {
        wordId: 'new-word',
        length: 6,
        // 没有 lastReviewTime 和 forgettingRisk
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([candidate], context);
      expect(scores[0].details.forgettingRisk).toBe(1.0);
    });

    it('应该基于时间和复习次数计算遗忘风险', () => {
      const now = Date.now();
      const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

      const candidate: WordCandidate = {
        wordId: 'reviewed-word',
        length: 6,
        lastReviewTime: threeDaysAgo,
        reviewCount: 2,
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([candidate], context);
      // 风险应该在0-1之间，且随时间增加
      expect(scores[0].details.forgettingRisk).toBeGreaterThan(0);
      expect(scores[0].details.forgettingRisk).toBeLessThanOrEqual(1);
    });

    it('复习次数越多，遗忘风险应该越低', () => {
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      const lowReviewCount: WordCandidate = {
        wordId: 'word1',
        length: 6,
        lastReviewTime: oneDayAgo,
        reviewCount: 1,
      };

      const highReviewCount: WordCandidate = {
        wordId: 'word2',
        length: 6,
        lastReviewTime: oneDayAgo,
        reviewCount: 5,
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([lowReviewCount, highReviewCount], context);
      const risk1 = scores.find((s) => s.wordId === 'word1')!.details.forgettingRisk;
      const risk2 = scores.find((s) => s.wordId === 'word2')!.details.forgettingRisk;

      expect(risk1).toBeGreaterThan(risk2);
    });
  });

  // ==================== 记忆薄弱度计算测试 ====================

  describe('memory weakness calculation', () => {
    it('应该直接使用提供的memoryStrength', () => {
      const now = Date.now();
      const candidate: WordCandidate = {
        wordId: 'test',
        length: 6,
        memoryStrength: 0.7,
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([candidate], context);
      expect(scores[0].details.memoryWeakness).toBeCloseTo(0.3, 5); // 1 - 0.7
    });

    it('对于没有reviewCount的单词应该返回最高薄弱度', () => {
      const now = Date.now();
      const candidate: WordCandidate = {
        wordId: 'new-word',
        length: 6,
        // 没有 memoryStrength 和 reviewCount
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([candidate], context);
      expect(scores[0].details.memoryWeakness).toBe(1.0);
    });

    it('复习次数越多，记忆薄弱度应该越低', () => {
      const now = Date.now();
      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const lowReview: WordCandidate = {
        wordId: 'word1',
        length: 6,
        reviewCount: 1,
      };

      const highReview: WordCandidate = {
        wordId: 'word2',
        length: 6,
        reviewCount: 10,
      };

      const scores = policy.scoreAll([lowReview, highReview], context);
      const weakness1 = scores.find((s) => s.wordId === 'word1')!.details.memoryWeakness;
      const weakness2 = scores.find((s) => s.wordId === 'word2')!.details.memoryWeakness;

      expect(weakness1).toBeGreaterThan(weakness2);
    });

    it('记忆薄弱度应该有最小值0.2', () => {
      const now = Date.now();
      const candidate: WordCandidate = {
        wordId: 'well-learned',
        length: 6,
        reviewCount: 20, // 很多复习次数
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([candidate], context);
      expect(scores[0].details.memoryWeakness).toBeGreaterThanOrEqual(0.2);
    });
  });

  // ==================== 短词奖励详细测试 ====================

  describe('short word bonus detailed', () => {
    it('应该为没有length信息的单词返回中等分数', () => {
      const now = Date.now();
      const candidate: WordCandidate = {
        wordId: 'test',
        // 没有 length
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([candidate], context);
      expect(scores[0].details.shortWordBonus).toBe(0.5);
    });

    it('长度为8的单词应该得满分', () => {
      const now = Date.now();
      const candidate: WordCandidate = {
        wordId: 'test',
        length: 8,
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([candidate], context);
      expect(scores[0].details.shortWordBonus).toBe(1.0);
    });

    it('长度为9-12的单词应该线性递减', () => {
      const now = Date.now();
      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const word10: WordCandidate = { wordId: 'word10', length: 10 };
      const scores = policy.scoreAll([word10], context);

      // length=10 应该在 0.25 和 1.0 之间
      expect(scores[0].details.shortWordBonus).toBeGreaterThan(0.25);
      expect(scores[0].details.shortWordBonus).toBeLessThan(1.0);
    });

    it('长度大于12的单词应该得低分', () => {
      const now = Date.now();
      const candidate: WordCandidate = {
        wordId: 'test',
        length: 15,
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([candidate], context);
      expect(scores[0].details.shortWordBonus).toBeLessThan(0.25);
    });

    it('极长单词的奖励应该不低于0', () => {
      const now = Date.now();
      const candidate: WordCandidate = {
        wordId: 'test',
        length: 30,
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([candidate], context);
      expect(scores[0].details.shortWordBonus).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== 综合场景测试 ====================

  describe('comprehensive scenarios', () => {
    it('应该正确处理混合场景：新词、复习词、高风险词', () => {
      const now = Date.now();
      const candidates: WordCandidate[] = [
        {
          wordId: 'new-word',
          length: 5,
          reviewCount: 0,
        },
        {
          wordId: 'review-word',
          length: 6,
          lastReviewTime: now - 24 * 60 * 60 * 1000, // 1天前
          reviewCount: 3,
          memoryStrength: 0.6,
        },
        {
          wordId: 'high-risk-word',
          length: 7,
          forgettingRisk: 0.95,
          memoryStrength: 0.1,
          reviewCount: 2,
        },
        {
          wordId: 'long-word',
          length: 15,
          forgettingRisk: 0.5,
          memoryStrength: 0.5,
          reviewCount: 5,
        },
      ];

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
        targetCount: 2,
      };

      const result = policy.selectWords(candidates, context);

      // 应该选择2个单词
      expect(result.selectedWordIds).toHaveLength(2);

      // 应该有评分信息
      expect(result.scores).toBeDefined();

      // 高风险短词应该被优先选择
      expect(result.selectedWordIds).toContain('high-risk-word');
    });

    it('应该在碎片时间场景下选择最合适的单词', () => {
      const now = Date.now();
      const candidates: WordCandidate[] = [
        {
          wordId: 'short-high-risk',
          length: 5,
          forgettingRisk: 0.8,
          memoryStrength: 0.2,
          reviewCount: 1,
        },
        {
          wordId: 'long-high-risk',
          length: 15,
          forgettingRisk: 0.85,
          memoryStrength: 0.15,
          reviewCount: 1,
        },
        {
          wordId: 'short-low-risk',
          length: 6,
          forgettingRisk: 0.2,
          memoryStrength: 0.8,
          reviewCount: 10,
        },
        {
          wordId: 'medium-medium',
          length: 10,
          forgettingRisk: 0.5,
          memoryStrength: 0.5,
          reviewCount: 5,
        },
      ];

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
        targetCount: 2,
        isMicroSession: true,
      };

      const result = policy.selectWords(candidates, context);

      expect(result.selectedWordIds).toHaveLength(2);

      // 短词+高风险应该得分最高
      const scores = policy.scoreAll(candidates, context);
      const topScore = Math.max(...scores.map((s) => s.score));
      const topWord = scores.find((s) => s.score === topScore);

      expect(topWord?.wordId).toBe('short-high-risk');
    });

    it('应该正确计算权重组合', () => {
      const now = Date.now();
      const candidate: WordCandidate = {
        wordId: 'test',
        length: 6, // 短词: shortWordBonus = 1.0
        forgettingRisk: 0.8, // 高风险
        memoryStrength: 0.3, // 薄弱: weakness = 0.7
        reviewCount: 2,
      };

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      const scores = policy.scoreAll([candidate], context);
      const score = scores[0];

      // 验证评分公式: score = forgettingRisk × 0.5 + shortWordBonus × 0.3 + memoryWeakness × 0.2
      const expectedScore =
        score.details.forgettingRisk * 0.5 +
        score.details.shortWordBonus * 0.3 +
        score.details.memoryWeakness * 0.2;

      expect(score.score).toBeCloseTo(expectedScore, 5);
    });
  });

  // ==================== 性能和稳定性测试 ====================

  describe('performance and stability', () => {
    it('应该能处理大量候选词', () => {
      const now = Date.now();
      const candidates: WordCandidate[] = Array.from({ length: 100 }, (_, i) => ({
        wordId: `word${i}`,
        length: 5 + (i % 10),
        forgettingRisk: Math.random(),
        memoryStrength: Math.random(),
        reviewCount: i % 10,
      }));

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
        targetCount: 5,
      };

      const startTime = Date.now();
      const result = policy.selectWords(candidates, context);
      const duration = Date.now() - startTime;

      expect(result.selectedWordIds).toHaveLength(5);
      expect(duration).toBeLessThan(100); // 应该在100ms内完成
    });

    it('应该能稳定排序相同分数的单词', () => {
      const now = Date.now();
      const candidates: WordCandidate[] = [
        { wordId: 'word1', length: 6, forgettingRisk: 0.5, memoryStrength: 0.5, reviewCount: 2 },
        { wordId: 'word2', length: 6, forgettingRisk: 0.5, memoryStrength: 0.5, reviewCount: 2 },
        { wordId: 'word3', length: 6, forgettingRisk: 0.5, memoryStrength: 0.5, reviewCount: 2 },
      ];

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: now,
      };

      // 多次运行应该得到一致的结果
      const result1 = policy.selectWords(candidates, context);
      const result2 = policy.selectWords(candidates, context);

      expect(result1.selectedWordIds).toEqual(result2.selectedWordIds);
    });

    it('应该处理极端的timestamp值', () => {
      const candidates: WordCandidate[] = [
        { wordId: 'word1', length: 6, lastReviewTime: 0, reviewCount: 2 },
      ];

      const context: SelectionContext = {
        userId: 'test-user',
        timestamp: Date.now(),
      };

      expect(() => {
        policy.selectWords(candidates, context);
      }).not.toThrow();
    });
  });
});
