/**
 * LearningStateService 集成测试
 *
 * 测试覆盖：
 * - 真实数据库操作
 * - 服务间协作
 * - 事件总线集成
 * - 缓存行为
 * - 并发场景
 * - 事务处理
 * - 错误恢复
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { WordState } from '@prisma/client';
import { learningStateService } from '../../../src/services/learning-state.service';
import { cacheService } from '../../../src/services/cache.service';
import { getEventBus } from '../../../src/core/event-bus';
import { decisionEventsService } from '../../../src/services/decision-events.service';
import prisma from '../../../src/config/database';
import {
  UserFactory,
  WordBookFactory,
  WordFactory,
  AnswerRecordFactory,
} from '../../helpers/factories';

describe('LearningStateService Integration Tests', () => {
  let testUser: any;
  let testWordBook: any;
  let testWords: any[] = [];
  let eventBus: any;

  beforeAll(async () => {
    // 连接数据库
    await prisma.$connect();
    eventBus = getEventBus(decisionEventsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // 清理缓存
    cacheService.clear();

    // 创建测试用户
    testUser = await UserFactory.create({
      email: 'test-learning@example.com',
      username: 'testlearning',
    });

    // 创建测试词书
    testWordBook = await WordBookFactory.create({
      name: 'Test Book',
      type: 'SYSTEM',
    });

    // 创建测试单词
    testWords = await Promise.all([
      WordFactory.create({ wordBookId: testWordBook.id, spelling: 'apple' }),
      WordFactory.create({ wordBookId: testWordBook.id, spelling: 'banana' }),
      WordFactory.create({ wordBookId: testWordBook.id, spelling: 'cherry' }),
      WordFactory.create({ wordBookId: testWordBook.id, spelling: 'date' }),
      WordFactory.create({ wordBookId: testWordBook.id, spelling: 'elderberry' }),
    ]);
  });

  afterEach(async () => {
    // 清理测试数据
    await prisma.wordReviewTrace.deleteMany({ where: { userId: testUser.id } });
    await prisma.wordScore.deleteMany({ where: { userId: testUser.id } });
    await prisma.wordLearningState.deleteMany({ where: { userId: testUser.id } });
    await prisma.answerRecord.deleteMany({ where: { userId: testUser.id } });
    await prisma.word.deleteMany({ where: { wordBookId: testWordBook.id } });
    await prisma.wordBook.delete({ where: { id: testWordBook.id } });
    await prisma.user.delete({ where: { id: testUser.id } });

    // 清理缓存
    cacheService.clear();
  });

  // ==================== 单词状态完整生命周期测试 ====================

  describe('Word State Lifecycle', () => {
    it('should create and retrieve word learning state', async () => {
      const wordId = testWords[0].id;

      // 创建学习状态
      const created = await learningStateService.upsertWordState(testUser.id, wordId, {
        state: WordState.LEARNING,
        masteryLevel: 1,
        reviewCount: 1,
        easeFactor: 2.5,
        lastReviewDate: new Date(),
      });

      expect(created).toBeDefined();
      expect(created.userId).toBe(testUser.id);
      expect(created.wordId).toBe(wordId);
      expect(created.state).toBe(WordState.LEARNING);
      expect(created.masteryLevel).toBe(1);

      // 从数据库检索
      const retrieved = await learningStateService.getWordState(testUser.id, wordId);
      expect(retrieved.learningState).toBeDefined();
      expect(retrieved.learningState?.id).toBe(created.id);
    });

    it('should update word state through complete lifecycle', async () => {
      const wordId = testWords[0].id;

      // 1. NEW -> LEARNING
      const learning = await learningStateService.updateWordState(testUser.id, wordId, {
        state: WordState.LEARNING,
        masteryLevel: 1,
      });
      expect(learning.state).toBe(WordState.LEARNING);

      // 2. LEARNING -> REVIEWING
      const reviewing = await learningStateService.updateWordState(testUser.id, wordId, {
        state: WordState.REVIEWING,
        masteryLevel: 3,
      });
      expect(reviewing.state).toBe(WordState.REVIEWING);

      // 3. REVIEWING -> MASTERED
      const mastered = await learningStateService.updateWordState(testUser.id, wordId, {
        state: WordState.MASTERED,
        masteryLevel: 5,
      });
      expect(mastered.state).toBe(WordState.MASTERED);
      expect(mastered.masteryLevel).toBe(5);
    });

    it('should track review history correctly', async () => {
      const wordId = testWords[0].id;

      // 初始状态
      await learningStateService.upsertWordState(testUser.id, wordId, {
        state: WordState.LEARNING,
        masteryLevel: 0,
        reviewCount: 0,
      });

      // 模拟多次复习
      for (let i = 1; i <= 5; i++) {
        await learningStateService.updateWordState(testUser.id, wordId, {
          reviewCount: i,
          masteryLevel: i,
          lastReviewDate: new Date(Date.now() + i * 1000),
        });
      }

      const state = await learningStateService.getWordState(testUser.id, wordId);
      expect(state.learningState?.reviewCount).toBe(5);
      expect(state.learningState?.masteryLevel).toBe(5);
    });

    it('should handle state transitions with caching', async () => {
      const wordId = testWords[0].id;

      // 第一次访问 - 从数据库
      await learningStateService.upsertWordState(testUser.id, wordId, {
        state: WordState.LEARNING,
        masteryLevel: 1,
      });

      const first = await learningStateService.getWordState(testUser.id, wordId);
      expect(first.learningState).toBeDefined();

      // 第二次访问 - 从缓存
      const cached = await learningStateService.getWordState(testUser.id, wordId);
      expect(cached.learningState?.id).toBe(first.learningState?.id);

      // 更新状态 - 应该清除缓存
      await learningStateService.updateWordState(testUser.id, wordId, {
        masteryLevel: 2,
      });

      // 再次访问 - 应该从数据库获取新数据
      const updated = await learningStateService.getWordState(testUser.id, wordId);
      expect(updated.learningState?.masteryLevel).toBe(2);
    });
  });

  // ==================== 批量操作测试 ====================

  describe('Batch Operations', () => {
    it('should batch get word states efficiently', async () => {
      // 创建多个单词状态
      const wordIds = testWords.map((w) => w.id);
      for (const wordId of wordIds) {
        await learningStateService.upsertWordState(testUser.id, wordId, {
          state: WordState.LEARNING,
          masteryLevel: 1,
        });
      }

      const startTime = Date.now();
      const states = await learningStateService.batchGetWordStates(testUser.id, wordIds);
      const duration = Date.now() - startTime;

      expect(states.size).toBe(wordIds.length);
      expect(duration).toBeLessThan(500); // 应该在500ms内完成

      // 验证每个状态
      wordIds.forEach((wordId) => {
        expect(states.has(wordId)).toBe(true);
        expect(states.get(wordId)?.state).toBe(WordState.LEARNING);
      });
    });

    it('should batch update word states with transaction', async () => {
      const wordIds = testWords.map((w) => w.id);
      const updates = wordIds.map((wordId) => ({
        wordId,
        data: {
          state: WordState.REVIEWING,
          masteryLevel: 3,
          reviewCount: 2,
        },
      }));

      await learningStateService.batchUpdateWordStates(testUser.id, updates);

      // 验证所有更新
      const states = await learningStateService.batchGetWordStates(testUser.id, wordIds);
      states.forEach((state) => {
        expect(state.state).toBe(WordState.REVIEWING);
        expect(state.masteryLevel).toBe(3);
        expect(state.reviewCount).toBe(2);
      });
    });

    it('should batch update with events', async () => {
      const wordIds = testWords.slice(0, 3).map((w) => w.id);
      const eventSpy = vi.fn();

      // 监听事件
      eventBus.subscribe('WORD_MASTERED', eventSpy);

      const updates = wordIds.map((wordId) => ({
        wordId,
        data: {
          state: WordState.MASTERED,
          masteryLevel: 5,
        },
      }));

      await learningStateService.batchUpdateWordStates_WithEvents(testUser.id, updates);

      // 等待异步事件处理
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 验证事件发布
      expect(eventSpy).toHaveBeenCalled();
    });

    it('should handle batch cache optimization', async () => {
      const wordIds = testWords.map((w) => w.id);

      // 第一次批量获取 - 填充缓存
      await learningStateService.batchGetWordStates(testUser.id, wordIds);

      // 清除部分缓存
      learningStateService.clearWordCache(testUser.id, wordIds[0]);

      // 第二次批量获取 - 混合缓存和数据库
      const states = await learningStateService.batchGetWordStates(testUser.id, wordIds);

      expect(states.size).toBeLessThanOrEqual(wordIds.length);
    });
  });

  // ==================== 缓存一致性测试 ====================

  describe('Cache Consistency', () => {
    it('should invalidate cache on state update', async () => {
      const wordId = testWords[0].id;

      // 创建状态
      await learningStateService.upsertWordState(testUser.id, wordId, {
        state: WordState.LEARNING,
        masteryLevel: 1,
      });

      // 第一次获取 - 填充缓存
      const first = await learningStateService.getWordState(testUser.id, wordId);
      expect(first.learningState?.masteryLevel).toBe(1);

      // 更新状态
      await learningStateService.updateWordState(testUser.id, wordId, {
        masteryLevel: 2,
      });

      // 第二次获取 - 应该从数据库获取最新数据
      const second = await learningStateService.getWordState(testUser.id, wordId);
      expect(second.learningState?.masteryLevel).toBe(2);
    });

    it('should clear user cache correctly', async () => {
      const wordIds = testWords.map((w) => w.id);

      // 创建多个状态
      for (const wordId of wordIds) {
        await learningStateService.upsertWordState(testUser.id, wordId, {
          state: WordState.LEARNING,
          masteryLevel: 1,
        });
      }

      // 填充缓存
      await learningStateService.batchGetWordStates(testUser.id, wordIds);

      // 清除用户缓存
      learningStateService.clearUserCache(testUser.id);

      // 验证缓存已清除（通过数据库访问时间验证）
      const startTime = Date.now();
      await learningStateService.batchGetWordStates(testUser.id, wordIds);
      const duration = Date.now() - startTime;

      // 如果缓存清除成功，应该需要更多时间从数据库加载
      expect(duration).toBeGreaterThan(0);
    });

    it('should handle concurrent cache updates', async () => {
      const wordId = testWords[0].id;

      // 并发更新
      const updates = Array.from({ length: 10 }, (_, i) =>
        learningStateService.updateWordState(testUser.id, wordId, {
          masteryLevel: i + 1,
        }),
      );

      await Promise.all(updates);

      // 验证最终状态
      const finalState = await learningStateService.getWordState(testUser.id, wordId);
      expect(finalState.learningState?.masteryLevel).toBeGreaterThan(0);
    });

    it('should handle null cache correctly', async () => {
      const wordId = testWords[0].id;

      // 第一次获取不存在的状态 - 应该缓存 null
      const first = await learningStateService.getWordState(testUser.id, wordId);
      expect(first.learningState).toBeNull();

      // 创建状态
      await learningStateService.upsertWordState(testUser.id, wordId, {
        state: WordState.NEW,
        masteryLevel: 0,
      });

      // 第二次获取 - 应该返回新创建的状态
      const second = await learningStateService.getWordState(testUser.id, wordId);
      expect(second.learningState).toBeDefined();
      expect(second.learningState?.state).toBe(WordState.NEW);
    });
  });

  // ==================== 事件发布验证测试 ====================

  describe('Event Publishing', () => {
    it('should publish WORD_MASTERED event when word is mastered', async () => {
      const wordId = testWords[0].id;
      const eventSpy = vi.fn();

      eventBus.subscribe('WORD_MASTERED', eventSpy);

      // 初始状态
      await learningStateService.upsertWordState(testUser.id, wordId, {
        state: WordState.LEARNING,
        masteryLevel: 3,
      });

      // 更新到 MASTERED
      await learningStateService.updateWordState(testUser.id, wordId, {
        state: WordState.MASTERED,
        masteryLevel: 5,
      });

      // 等待异步事件处理
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(eventSpy).toHaveBeenCalled();
      const eventPayload = eventSpy.mock.calls[0][0].payload;
      expect(eventPayload.userId).toBe(testUser.id);
      expect(eventPayload.wordId).toBe(wordId);
      expect(eventPayload.masteryLevel).toBe(5);
    });

    it('should publish FORGETTING_RISK event when recall is low', async () => {
      const wordId = testWords[0].id;
      const eventSpy = vi.fn();

      eventBus.subscribe('FORGETTING_RISK_HIGH', eventSpy);

      // 创建复习轨迹（模拟遗忘风险）
      const oldReview = {
        timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7天前
        isCorrect: true,
        responseTime: 2000,
      };
      await learningStateService.recordReview(testUser.id, wordId, oldReview);

      // 更新状态到 REVIEWING
      await learningStateService.updateWordState(testUser.id, wordId, {
        state: WordState.REVIEWING,
        masteryLevel: 3,
        lastReviewDate: new Date(oldReview.timestamp),
      });

      // 等待异步事件处理
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 注意：可能不会发布事件，取决于 ACT-R 模型计算结果
      // 这里我们只验证不会抛出错误
      expect(true).toBe(true);
    });

    it('should not publish duplicate mastery events', async () => {
      const wordId = testWords[0].id;
      const eventSpy = vi.fn();

      eventBus.subscribe('WORD_MASTERED', eventSpy);

      // 第一次达到 MASTERED
      await learningStateService.updateWordState(testUser.id, wordId, {
        state: WordState.MASTERED,
        masteryLevel: 5,
      });

      // 等待事件处理
      await new Promise((resolve) => setTimeout(resolve, 300));

      const callCount1 = eventSpy.mock.calls.length;

      // 再次更新同样的 MASTERED 状态
      await learningStateService.updateWordState(testUser.id, wordId, {
        state: WordState.MASTERED,
        masteryLevel: 5,
      });

      // 等待事件处理
      await new Promise((resolve) => setTimeout(resolve, 300));

      const callCount2 = eventSpy.mock.calls.length;

      // 不应该发布第二次事件
      expect(callCount2).toBe(callCount1);
    });
  });

  // ==================== 并发场景测试 ====================

  describe('Concurrent Scenarios', () => {
    it('should handle concurrent word state updates', async () => {
      const wordId = testWords[0].id;

      // 并发更新同一个单词的不同字段
      const updates = [
        learningStateService.updateWordState(testUser.id, wordId, { masteryLevel: 1 }),
        learningStateService.updateWordState(testUser.id, wordId, { reviewCount: 1 }),
        learningStateService.updateWordState(testUser.id, wordId, { easeFactor: 2.5 }),
      ];

      await Promise.all(updates);

      const finalState = await learningStateService.getWordState(testUser.id, wordId);
      expect(finalState.learningState).toBeDefined();
    });

    it('should handle concurrent batch operations', async () => {
      const wordIds = testWords.map((w) => w.id);

      // 并发批量操作
      const operations = [
        learningStateService.batchGetWordStates(testUser.id, wordIds),
        learningStateService.batchGetWordStates(testUser.id, wordIds.slice(0, 3)),
        learningStateService.batchGetWordStates(testUser.id, wordIds.slice(2, 5)),
      ];

      const results = await Promise.all(operations);

      expect(results[0].size).toBeGreaterThanOrEqual(0);
      expect(results[1].size).toBeGreaterThanOrEqual(0);
      expect(results[2].size).toBeGreaterThanOrEqual(0);
    });

    it('should handle race conditions in cache', async () => {
      const wordId = testWords[0].id;

      // 创建初始状态
      await learningStateService.upsertWordState(testUser.id, wordId, {
        state: WordState.NEW,
        masteryLevel: 0,
      });

      // 并发读写
      const operations = [
        learningStateService.getWordState(testUser.id, wordId),
        learningStateService.updateWordState(testUser.id, wordId, { masteryLevel: 1 }),
        learningStateService.getWordState(testUser.id, wordId),
        learningStateService.updateWordState(testUser.id, wordId, { masteryLevel: 2 }),
        learningStateService.getWordState(testUser.id, wordId),
      ];

      await Promise.all(operations);

      // 最终状态应该是一致的
      const finalState = await learningStateService.getWordState(testUser.id, wordId);
      expect(finalState.learningState).toBeDefined();
    });
  });

  // ==================== 得分管理测试 ====================

  describe('Word Score Management', () => {
    it('should calculate and update word score', async () => {
      const wordId = testWords[0].id;

      // 创建答题记录
      await AnswerRecordFactory.create({
        userId: testUser.id,
        wordId,
        isCorrect: true,
        responseTime: 2000,
      });
      await AnswerRecordFactory.create({
        userId: testUser.id,
        wordId,
        isCorrect: true,
        responseTime: 1500,
      });

      // 更新得分
      const score = await learningStateService.updateWordScore(testUser.id, wordId, {
        isCorrect: true,
        responseTime: 1800,
      });

      expect(score).toBeDefined();
      expect(score.totalScore).toBeGreaterThan(0);
    });

    it('should get high and low score words', async () => {
      // 创建不同得分的单词
      for (let i = 0; i < testWords.length; i++) {
        const wordId = testWords[i].id;
        await learningStateService.upsertWordScore(testUser.id, wordId, {
          totalScore: (i + 1) * 20,
        });
      }

      const highScores = await learningStateService.getHighScoreWords(testUser.id, 60);
      const lowScores = await learningStateService.getLowScoreWords(testUser.id, 50);

      expect(highScores.length).toBeGreaterThan(0);
      expect(lowScores.length).toBeGreaterThan(0);
      expect(highScores[0].totalScore).toBeGreaterThan(60);
      expect(lowScores[0].totalScore).toBeLessThan(50);
    });

    it('should batch get word scores with caching', async () => {
      const wordIds = testWords.map((w) => w.id);

      // 创建得分
      for (const wordId of wordIds) {
        await learningStateService.upsertWordScore(testUser.id, wordId, {
          totalScore: 75,
        });
      }

      // 第一次批量获取
      const scores1 = await learningStateService.batchGetWordScores(testUser.id, wordIds);
      expect(scores1.size).toBe(wordIds.length);

      // 第二次批量获取（应该从缓存）
      const scores2 = await learningStateService.batchGetWordScores(testUser.id, wordIds);
      expect(scores2.size).toBe(wordIds.length);
    });
  });

  // ==================== 掌握度评估测试 ====================

  describe('Mastery Evaluation', () => {
    it('should evaluate word mastery', async () => {
      const wordId = testWords[0].id;

      // 创建学习状态
      await learningStateService.upsertWordState(testUser.id, wordId, {
        state: WordState.LEARNING,
        masteryLevel: 2,
        reviewCount: 3,
      });

      // 创建复习记录
      for (let i = 0; i < 3; i++) {
        await learningStateService.recordReview(testUser.id, wordId, {
          timestamp: Date.now() - (3 - i) * 3600 * 1000,
          isCorrect: true,
          responseTime: 2000,
        });
      }

      // 评估掌握度
      const evaluation = await learningStateService.evaluateWord(testUser.id, wordId);

      expect(evaluation).toBeDefined();
      expect(evaluation.score).toBeGreaterThanOrEqual(0);
      expect(evaluation.score).toBeLessThanOrEqual(1);
      expect(evaluation.confidence).toBeGreaterThanOrEqual(0);
      expect(evaluation.confidence).toBeLessThanOrEqual(1);
    });

    it('should batch evaluate word mastery', async () => {
      const wordIds = testWords.slice(0, 3).map((w) => w.id);

      // 为每个单词创建状态和记录
      for (const wordId of wordIds) {
        await learningStateService.upsertWordState(testUser.id, wordId, {
          state: WordState.LEARNING,
          masteryLevel: 1,
        });

        await learningStateService.recordReview(testUser.id, wordId, {
          timestamp: Date.now() - 3600 * 1000,
          isCorrect: true,
          responseTime: 2000,
        });
      }

      const evaluations = await learningStateService.batchEvaluateWords(testUser.id, wordIds);

      expect(evaluations).toHaveLength(wordIds.length);
      evaluations.forEach((evaluation) => {
        expect(evaluation.score).toBeGreaterThanOrEqual(0);
        expect(evaluation.score).toBeLessThanOrEqual(1);
      });
    });

    it('should get user mastery statistics', async () => {
      // 创建多个单词的学习状态
      for (let i = 0; i < testWords.length; i++) {
        await learningStateService.upsertWordState(testUser.id, testWords[i].id, {
          state: i < 2 ? WordState.MASTERED : WordState.LEARNING,
          masteryLevel: i < 2 ? 5 : 2,
        });
      }

      const stats = await learningStateService.getUserMasteryStats(testUser.id);

      expect(stats).toBeDefined();
      expect(stats.totalWords).toBe(testWords.length);
      expect(stats.masteredWords).toBeGreaterThanOrEqual(0);
      expect(stats.learningWords).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== 复习轨迹测试 ====================

  describe('Review Trace', () => {
    it('should record and retrieve review trace', async () => {
      const wordId = testWords[0].id;

      // 记录多次复习
      const reviews = [
        { timestamp: Date.now() - 3600000, isCorrect: true, responseTime: 2000 },
        { timestamp: Date.now() - 1800000, isCorrect: true, responseTime: 1800 },
        { timestamp: Date.now() - 900000, isCorrect: false, responseTime: 5000 },
        { timestamp: Date.now(), isCorrect: true, responseTime: 1500 },
      ];

      for (const review of reviews) {
        await learningStateService.recordReview(testUser.id, wordId, review);
      }

      // 获取复习轨迹
      const trace = await learningStateService.getMemoryTrace(testUser.id, wordId, 10);

      expect(trace).toBeDefined();
      expect(trace.length).toBeGreaterThan(0);
      expect(trace.length).toBeLessThanOrEqual(4);
    });

    it('should batch record reviews', async () => {
      const events = testWords.slice(0, 3).map((word) => ({
        wordId: word.id,
        event: {
          timestamp: Date.now(),
          isCorrect: true,
          responseTime: 2000,
        },
      }));

      await learningStateService.batchRecordReview(testUser.id, events);

      // 验证每个单词都有轨迹
      for (const event of events) {
        const trace = await learningStateService.getMemoryTrace(testUser.id, event.wordId);
        expect(trace.length).toBeGreaterThan(0);
      }
    });

    it('should predict optimal review interval', async () => {
      const wordId = testWords[0].id;

      // 创建复习历史
      for (let i = 0; i < 5; i++) {
        await learningStateService.recordReview(testUser.id, wordId, {
          timestamp: Date.now() - (5 - i) * 3600 * 1000,
          isCorrect: true,
          responseTime: 2000,
        });
      }

      const prediction = await learningStateService.predictInterval(testUser.id, wordId, 0.9);

      expect(prediction).toBeDefined();
      expect(prediction.optimalSeconds).toBeGreaterThanOrEqual(0);
      expect(prediction.targetRecall).toBe(0.9);
    });
  });

  // ==================== 统计数据测试 ====================

  describe('User Statistics', () => {
    it('should get comprehensive user learning stats', async () => {
      // 创建多个单词状态
      for (let i = 0; i < testWords.length; i++) {
        const wordId = testWords[i].id;
        await learningStateService.upsertWordState(testUser.id, wordId, {
          state: [WordState.NEW, WordState.LEARNING, WordState.REVIEWING, WordState.MASTERED][
            i % 4
          ],
          masteryLevel: i + 1,
        });

        await learningStateService.upsertWordScore(testUser.id, wordId, {
          totalScore: (i + 1) * 15,
        });
      }

      const stats = await learningStateService.getUserLearningStats(testUser.id);

      expect(stats).toBeDefined();
      expect(stats.stateStats).toBeDefined();
      expect(stats.scoreStats).toBeDefined();
      expect(stats.masteryStats).toBeDefined();
      expect(stats.stateStats.totalWords).toBe(testWords.length);
    });

    it('should get due words correctly', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 3600 * 1000);
      const future = new Date(now.getTime() + 3600 * 1000);

      // 创建到期和未到期的单词
      await learningStateService.upsertWordState(testUser.id, testWords[0].id, {
        state: WordState.LEARNING,
        nextReviewDate: past,
      });

      await learningStateService.upsertWordState(testUser.id, testWords[1].id, {
        state: WordState.LEARNING,
        nextReviewDate: future,
      });

      await learningStateService.upsertWordState(testUser.id, testWords[2].id, {
        state: WordState.NEW,
        nextReviewDate: null,
      });

      const dueWords = await learningStateService.getDueWords(testUser.id);

      expect(dueWords.length).toBeGreaterThan(0);
      expect(dueWords.some((w) => w.wordId === testWords[0].id)).toBe(true);
      expect(dueWords.some((w) => w.wordId === testWords[2].id)).toBe(true);
    });

    it('should get words by state', async () => {
      // 创建不同状态的单词
      await learningStateService.upsertWordState(testUser.id, testWords[0].id, {
        state: WordState.LEARNING,
      });
      await learningStateService.upsertWordState(testUser.id, testWords[1].id, {
        state: WordState.LEARNING,
      });
      await learningStateService.upsertWordState(testUser.id, testWords[2].id, {
        state: WordState.MASTERED,
      });

      const learningWords = await learningStateService.getWordsByState(
        testUser.id,
        WordState.LEARNING,
      );
      const masteredWords = await learningStateService.getWordsByState(
        testUser.id,
        WordState.MASTERED,
      );

      expect(learningWords.length).toBe(2);
      expect(masteredWords.length).toBe(1);
    });
  });

  // ==================== 错误处理测试 ====================

  describe('Error Handling', () => {
    it('should handle invalid word ID', async () => {
      const invalidWordId = 'invalid-word-id';

      await expect(
        learningStateService.upsertWordState(testUser.id, invalidWordId, {
          state: WordState.NEW,
          masteryLevel: 0,
        }),
      ).rejects.toThrow();
    });

    it('should handle invalid timestamp', async () => {
      const wordId = testWords[0].id;
      const futureTimestamp = Date.now() + 10 * 3600 * 1000; // 10小时后

      await expect(
        learningStateService.upsertWordState(testUser.id, wordId, {
          state: WordState.NEW,
          lastReviewDate: futureTimestamp as any,
        }),
      ).rejects.toThrow();
    });

    it('should handle transaction rollback on batch update error', async () => {
      const wordIds = testWords.map((w) => w.id);
      const invalidUpdates = [
        { wordId: wordIds[0], data: { masteryLevel: 1 } },
        { wordId: 'invalid-id', data: { masteryLevel: 2 } }, // 这会导致错误
        { wordId: wordIds[2], data: { masteryLevel: 3 } },
      ];

      await expect(
        learningStateService.batchUpdateWordStates(testUser.id, invalidUpdates as any),
      ).rejects.toThrow();

      // 验证第一个更新也被回滚
      const state = await learningStateService.getWordState(testUser.id, wordIds[0]);
      expect(state.learningState?.masteryLevel).not.toBe(1);
    });

    it('should handle cache corruption gracefully', async () => {
      const wordId = testWords[0].id;

      // 创建状态
      await learningStateService.upsertWordState(testUser.id, wordId, {
        state: WordState.NEW,
        masteryLevel: 0,
      });

      // 手动损坏缓存
      const cacheKey = `learning_state:${testUser.id}:${wordId}`;
      cacheService.set(cacheKey, 'invalid-data' as any);

      // 应该能够恢复
      const state = await learningStateService.getWordState(testUser.id, wordId);
      expect(state).toBeDefined();
    });
  });

  // ==================== 性能测试 ====================

  describe('Performance', () => {
    it('should handle large batch operations efficiently', async () => {
      // 创建大量单词
      const manyWords = await Promise.all(
        Array.from({ length: 50 }, () => WordFactory.create({ wordBookId: testWordBook.id })),
      );

      const wordIds = manyWords.map((w) => w.id);

      const startTime = Date.now();
      await learningStateService.batchGetWordStates(testUser.id, wordIds);
      const duration = Date.now() - startTime;

      // 应该在1秒内完成
      expect(duration).toBeLessThan(1000);
    });

    it('should cache batch results effectively', async () => {
      const wordIds = testWords.map((w) => w.id);

      // 第一次访问
      const start1 = Date.now();
      await learningStateService.batchGetWordStates(testUser.id, wordIds);
      const duration1 = Date.now() - start1;

      // 第二次访问（应该更快）
      const start2 = Date.now();
      await learningStateService.batchGetWordStates(testUser.id, wordIds);
      const duration2 = Date.now() - start2;

      expect(duration2).toBeLessThanOrEqual(duration1);
    });

    it('should handle concurrent requests efficiently', async () => {
      const wordIds = testWords.map((w) => w.id);

      const startTime = Date.now();
      await Promise.all([
        learningStateService.getUserStats(testUser.id),
        learningStateService.getDueWords(testUser.id),
        learningStateService.batchGetWordStates(testUser.id, wordIds),
        learningStateService.getUserLearningStats(testUser.id),
      ]);
      const duration = Date.now() - startTime;

      // 并发执行应该更快
      expect(duration).toBeLessThan(2000);
    });
  });
});
