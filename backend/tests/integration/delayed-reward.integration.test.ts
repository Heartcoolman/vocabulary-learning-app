/**
 * 延迟奖励系统集成测试
 * 测试FeatureVector持久化和延迟奖励处理的完整流程
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import prisma from '../../src/config/database';
import { amasService } from '../../src/services/amas.service';
import {
  DelayedRewardService,
  EnqueueDelayedRewardParams
} from '../../src/services/delayed-reward.service';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import {
  resetAllMetrics,
  getMetricsJson
} from '../../src/services/metrics.service';

describe('Delayed Reward Integration Tests', () => {
  let testUserId: string;
  let testWordId: string;
  let delayedRewardService: DelayedRewardService;

  beforeAll(async () => {
    // 创建测试用户
    const hashedPassword = await bcrypt.hash('Test123456', 10);
    const testUser = await prisma.user.create({
      data: {
        username: `test_delayed_${faker.string.alphanumeric(8)}`,
        email: `test_delayed_${faker.string.alphanumeric(8)}@example.com`,
        passwordHash: hashedPassword,
        role: 'USER'
      }
    });
    testUserId = testUser.id;

    // 创建测试词书和单词
    const wordbook = await prisma.wordBook.create({
      data: {
        name: 'Delayed Reward Test Wordbook',
        description: '用于延迟奖励集成测试',
        type: 'SYSTEM',
        wordCount: 1,
        isPublic: true
      }
    });

    const word = await prisma.word.create({
      data: {
        spelling: 'delayed',
        phonetic: '/dɪˈleɪd/',
        meanings: ['延迟的'],
        examples: ['Delayed rewards are important.'],
        wordBookId: wordbook.id
      }
    });
    testWordId = word.id;

    delayedRewardService = new DelayedRewardService();
  });

  afterAll(async () => {
    // 清理测试数据
    await prisma.rewardQueue.deleteMany({
      where: { userId: testUserId }
    });
    await prisma.featureVector.deleteMany({
      where: {
        session: {
          userId: testUserId
        }
      }
    });
    await prisma.learningSession.deleteMany({
      where: { userId: testUserId }
    });
    await prisma.amasUserState.deleteMany({
      where: { userId: testUserId }
    });
    await prisma.amasUserModel.deleteMany({
      where: { userId: testUserId }
    });
    await prisma.word.deleteMany({
      where: { spelling: 'delayed' }
    });
    await prisma.wordBook.deleteMany({
      where: { name: 'Delayed Reward Test Wordbook' }
    });
    await prisma.user.deleteMany({
      where: { id: testUserId }
    });
  });

  beforeEach(() => {
    resetAllMetrics();
  });

  describe('Feature Vector Persistence', () => {
    it('should persist feature vector when sessionId is provided', async () => {
      // 创建学习会话
      const session = await prisma.learningSession.create({
        data: {
          userId: testUserId
        }
      });

      // 处理学习事件
      const result = await amasService.processLearningEvent(
        testUserId,
        {
          wordId: testWordId,
          isCorrect: true,
          responseTime: 2500,
          dwellTime: 1000
        },
        session.id
      );

      // 验证结果包含featureVector
      expect(result.featureVector).toBeDefined();
      expect(result.featureVector?.values.length).toBeGreaterThan(0);

      // 验证FeatureVector已持久化到数据库 (使用findFirst因为是复合主键)
      const savedVector = await prisma.featureVector.findFirst({
        where: { sessionId: session.id }
      });

      expect(savedVector).not.toBeNull();
      expect(savedVector?.featureVersion).toBe(result.featureVector?.version);

      // 验证指标
      const metrics = getMetricsJson();
      const featureVectorMetric = metrics['amas_feature_vector_saved_total'] as {
        values: Record<string, number>;
      };
      expect(featureVectorMetric.values['status="success"']).toBeGreaterThanOrEqual(1);
    });

    it('should not persist feature vector when sessionId is not provided', async () => {
      const sessionsBefore = await prisma.learningSession.count({
        where: { userId: testUserId }
      });

      // 处理学习事件（不提供sessionId）
      const result = await amasService.processLearningEvent(testUserId, {
        wordId: testWordId,
        isCorrect: true,
        responseTime: 2000
      });

      // 结果仍然包含featureVector
      expect(result.featureVector).toBeDefined();

      // 但不应创建新的持久化记录
      const sessionsAfter = await prisma.learningSession.count({
        where: { userId: testUserId }
      });

      // 会话数量不变（没有自动创建）
      expect(sessionsAfter).toBe(sessionsBefore);
    });
  });

  describe('Delayed Reward Queue', () => {
    it('should enqueue delayed reward with idempotency', async () => {
      const session = await prisma.learningSession.create({
        data: { userId: testUserId }
      });

      const params: EnqueueDelayedRewardParams = {
        sessionId: session.id,
        userId: testUserId,
        dueTs: new Date(Date.now() + 60000), // 1分钟后
        reward: 0.5,
        idempotencyKey: `test_${uuidv4()}`
      };

      // 第一次入队
      const reward1 = await delayedRewardService.enqueueDelayedReward(params);
      expect(reward1).toBeDefined();
      expect(reward1.status).toBe('PENDING');

      // 第二次入队（相同idempotencyKey）
      const reward2 = await delayedRewardService.enqueueDelayedReward(params);
      expect(reward2.id).toBe(reward1.id); // 应返回相同记录
    });

    it('should process pending rewards', async () => {
      // 创建会话和特征向量
      const session = await prisma.learningSession.create({
        data: { userId: testUserId }
      });

      // 先处理一个事件来创建特征向量
      await amasService.processLearningEvent(
        testUserId,
        {
          wordId: testWordId,
          isCorrect: true,
          responseTime: 2000
        },
        session.id
      );

      // 入队一个立即到期的奖励
      const params: EnqueueDelayedRewardParams = {
        sessionId: session.id,
        userId: testUserId,
        dueTs: new Date(), // 立即到期
        reward: 0.3,
        idempotencyKey: `process_test_${uuidv4()}`
      };

      await delayedRewardService.enqueueDelayedReward(params);

      // 处理到期的奖励
      await delayedRewardService.processPendingRewards(async (task) => {
        // 模拟奖励应用
        expect(task.userId).toBe(testUserId);
        expect(task.reward).toBe(0.3);
      });

      // 验证奖励状态已更新为DONE
      const updatedRewards = await prisma.rewardQueue.findMany({
        where: {
          userId: testUserId,
          idempotencyKey: params.idempotencyKey
        }
      });

      expect(updatedRewards.length).toBe(1);
      expect(updatedRewards[0].status).toBe('DONE');
    });

    it('should retry failed rewards', async () => {
      const session = await prisma.learningSession.create({
        data: { userId: testUserId }
      });

      // 入队一个立即到期的奖励
      const params: EnqueueDelayedRewardParams = {
        sessionId: session.id,
        userId: testUserId,
        dueTs: new Date(),
        reward: 0.4,
        idempotencyKey: `retry_test_${uuidv4()}`
      };

      await delayedRewardService.enqueueDelayedReward(params);

      // 第一次处理失败
      await delayedRewardService.processPendingRewards(async () => {
        throw new Error('Simulated failure');
      });

      // 验证状态回退到PENDING并记录错误
      const reward = await prisma.rewardQueue.findFirst({
        where: { idempotencyKey: params.idempotencyKey }
      });

      expect(reward?.status).toBe('PENDING');
      expect(reward?.lastError).toContain('Simulated failure');
    });
  });

  describe('End-to-End Flow', () => {
    it('should complete full delayed reward flow', async () => {
      // 1. 创建学习会话
      const session = await prisma.learningSession.create({
        data: { userId: testUserId }
      });

      // 2. 处理学习事件（持久化FeatureVector）
      const result = await amasService.processLearningEvent(
        testUserId,
        {
          wordId: testWordId,
          isCorrect: true,
          responseTime: 3000,
          dwellTime: 1500,
          pauseCount: 1
        },
        session.id
      );

      expect(result.featureVector).toBeDefined();

      // 3. 入队延迟奖励
      const rewardParams: EnqueueDelayedRewardParams = {
        sessionId: session.id,
        userId: testUserId,
        dueTs: new Date(),
        reward: result.reward,
        idempotencyKey: `e2e_test_${uuidv4()}`
      };

      const queuedReward = await delayedRewardService.enqueueDelayedReward(
        rewardParams
      );

      expect(queuedReward.status).toBe('PENDING');

      // 4. 验证FeatureVector存在 (使用findFirst因为是复合主键)
      const featureVector = await prisma.featureVector.findFirst({
        where: { sessionId: session.id }
      });

      expect(featureVector).not.toBeNull();
      const features = featureVector?.features as {
        values: number[];
        labels: string[];
      };
      expect(features.values.length).toBeGreaterThan(0);

      // 5. 查询奖励状态
      const rewards = await delayedRewardService.getRewardStatus(session.id);
      expect(rewards.length).toBeGreaterThan(0);
      expect(rewards[0].sessionId).toBe(session.id);
    });
  });
});
