/**
 * 遗忘预警 SSE 推送集成测试
 *
 * 测试场景：
 * 1. ForgettingAlertWorker 创建预警
 * 2. EventBus 发布 FORGETTING_RISK_HIGH 事件
 * 3. RealtimeService 接收事件并通过 SSE 推送给用户
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PrismaClient, WordState } from '@prisma/client';
import { getEventBus, resetEventBus } from '../../src/core/event-bus';
import { decisionEventsService } from '../../src/services/decision-events.service';
import realtimeService from '../../src/services/realtime.service';
import type { RealtimeEvent } from '@danci/shared/types';

const prisma = new PrismaClient();

describe('遗忘预警 SSE 推送集成测试', () => {
  let testUserId: string;
  let testWordId: string;
  let testWordBookId: string;

  beforeAll(async () => {
    // 创建测试用户
    const testUser = await prisma.user.create({
      data: {
        email: `forgetting-alert-test-${Date.now()}@test.com`,
        username: 'ForgettingAlertTestUser',
        passwordHash: 'test-hash',
      },
    });
    testUserId = testUser.id;

    // 创建测试词书
    const testWordBook = await prisma.wordBook.create({
      data: {
        name: 'Forgetting Alert Test Book',
        type: 'CUSTOM',
        userId: testUserId,
      },
    });
    testWordBookId = testWordBook.id;

    // 创建测试单词
    const testWord = await prisma.word.create({
      data: {
        spelling: 'abandon',
        phonetic: '/əˈbændən/',
        meanings: ['放弃', '遗弃'],
        examples: ['He abandoned his car in the snow.'],
        wordBookId: testWordBookId,
      },
    });
    testWordId = testWord.id;

    // 创建学习状态（模拟一个即将遗忘的单词）
    await prisma.wordLearningState.create({
      data: {
        userId: testUserId,
        wordId: testWordId,
        state: WordState.LEARNING,
        halfLife: 2.0, // 半衰期 2 天
        lastReviewDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 天前复习的
        nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 建议明天复习
      },
    });
  });

  afterAll(async () => {
    // 清理测试数据
    await prisma.wordLearningState.deleteMany({ where: { userId: testUserId } });
    await prisma.forgettingAlert.deleteMany({ where: { userId: testUserId } });
    await prisma.word.deleteMany({ where: { wordBookId: testWordBookId } });
    await prisma.wordBook.delete({ where: { id: testWordBookId } });
    await prisma.user.delete({ where: { id: testUserId } });

    // 重置 EventBus
    resetEventBus();

    await prisma.$disconnect();
  });

  beforeEach(() => {
    // 清理事件总线
    resetEventBus();
  });

  it('应该在创建预警时通过 SSE 推送给用户', async () => {
    // 模拟用户订阅 SSE
    const receivedEvents: RealtimeEvent[] = [];

    const unsubscribe = realtimeService.subscribe(
      {
        userId: testUserId,
        eventTypes: ['forgetting-alert'],
      },
      (event) => {
        receivedEvents.push(event);
      },
    );

    try {
      // 获取 EventBus 实例
      const eventBus = getEventBus(decisionEventsService);

      // 创建 ForgettingAlert 记录
      const alert = await prisma.forgettingAlert.create({
        data: {
          userId: testUserId,
          wordId: testWordId,
          predictedForgetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          recallProbability: 0.25,
          status: 'ACTIVE',
        },
      });

      // 模拟 Worker 发布事件
      await eventBus.publish({
        type: 'FORGETTING_RISK_HIGH',
        payload: {
          userId: testUserId,
          wordId: testWordId,
          recallProbability: 0.25,
          riskLevel: 'medium',
          lastReviewDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          suggestedReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          timestamp: new Date(),
        },
      });

      // 等待异步事件处理
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 验证 SSE 事件已推送
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].type).toBe('forgetting-alert');
      expect(receivedEvents[0].payload).toMatchObject({
        wordId: testWordId,
        word: 'abandon',
        riskLevel: 'medium',
      });
      expect(receivedEvents[0].payload.recallProbability).toBeCloseTo(0.25, 2);
      expect(receivedEvents[0].payload.message).toContain('abandon');
    } finally {
      unsubscribe();
    }
  });

  it('应该根据风险等级构建不同的消息', async () => {
    const receivedEvents: RealtimeEvent[] = [];

    const unsubscribe = realtimeService.subscribe(
      {
        userId: testUserId,
        eventTypes: ['forgetting-alert'],
      },
      (event) => {
        receivedEvents.push(event);
      },
    );

    try {
      const eventBus = getEventBus(decisionEventsService);

      // 测试高风险
      await eventBus.publish({
        type: 'FORGETTING_RISK_HIGH',
        payload: {
          userId: testUserId,
          wordId: testWordId,
          recallProbability: 0.15,
          riskLevel: 'high',
          lastReviewDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          suggestedReviewDate: new Date(),
          timestamp: new Date(),
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].payload.riskLevel).toBe('high');
      expect(receivedEvents[0].payload.message).toContain('高风险遗忘');
      expect(receivedEvents[0].payload.message).toContain('立即复习');
    } finally {
      unsubscribe();
    }
  });

  it('应该只向订阅的用户推送', async () => {
    // 创建另一个测试用户
    const otherUser = await prisma.user.create({
      data: {
        email: `other-user-${Date.now()}@test.com`,
        username: 'OtherUser',
        passwordHash: 'test-hash',
      },
    });

    const receivedEvents: RealtimeEvent[] = [];
    const otherReceivedEvents: RealtimeEvent[] = [];

    const unsubscribe1 = realtimeService.subscribe(
      {
        userId: testUserId,
        eventTypes: ['forgetting-alert'],
      },
      (event) => {
        receivedEvents.push(event);
      },
    );

    const unsubscribe2 = realtimeService.subscribe(
      {
        userId: otherUser.id,
        eventTypes: ['forgetting-alert'],
      },
      (event) => {
        otherReceivedEvents.push(event);
      },
    );

    try {
      const eventBus = getEventBus(decisionEventsService);

      // 只向 testUserId 发布事件
      await eventBus.publish({
        type: 'FORGETTING_RISK_HIGH',
        payload: {
          userId: testUserId,
          wordId: testWordId,
          recallProbability: 0.25,
          riskLevel: 'medium',
          lastReviewDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          suggestedReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          timestamp: new Date(),
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // 验证只有目标用户收到事件
      expect(receivedEvents).toHaveLength(1);
      expect(otherReceivedEvents).toHaveLength(0);
    } finally {
      unsubscribe1();
      unsubscribe2();
      await prisma.user.delete({ where: { id: otherUser.id } });
    }
  });

  it('应该正确格式化时间差', async () => {
    const receivedEvents: RealtimeEvent[] = [];

    const unsubscribe = realtimeService.subscribe(
      {
        userId: testUserId,
        eventTypes: ['forgetting-alert'],
      },
      (event) => {
        receivedEvents.push(event);
      },
    );

    try {
      const eventBus = getEventBus(decisionEventsService);

      // 测试不同的时间差
      const testCases = [
        { hours: 0.5, expectedPattern: /1小时内/ },
        { hours: 5, expectedPattern: /5小时后/ },
        { hours: 48, expectedPattern: /2天后/ },
      ];

      for (const testCase of testCases) {
        receivedEvents.length = 0; // 清空

        await eventBus.publish({
          type: 'FORGETTING_RISK_HIGH',
          payload: {
            userId: testUserId,
            wordId: testWordId,
            recallProbability: 0.25,
            riskLevel: 'low',
            lastReviewDate: new Date(),
            suggestedReviewDate: new Date(Date.now() + testCase.hours * 60 * 60 * 1000),
            timestamp: new Date(),
          },
        });

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(receivedEvents).toHaveLength(1);
        expect(receivedEvents[0].payload.message).toMatch(testCase.expectedPattern);
      }
    } finally {
      unsubscribe();
    }
  });
});
