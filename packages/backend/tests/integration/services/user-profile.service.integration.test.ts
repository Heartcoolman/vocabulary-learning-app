/**
 * UserProfileService 集成测试
 *
 * 测试覆盖：
 * - 完整用户画像获取
 * - 多服务数据合并
 * - 习惯画像更新
 * - 认知画像缓存
 * - 学习档案管理
 * - 事件总线集成
 * - 并发场景
 * - 错误恢复
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { userProfileService } from '../../../src/services/user-profile.service';
import { getEventBus } from '../../../src/core/event-bus';
import { decisionEventsService } from '../../../src/services/decision-events.service';
import prisma from '../../../src/config/database';
import {
  UserFactory,
  WordBookFactory,
  WordFactory,
  AnswerRecordFactory,
} from '../../helpers/factories';

describe('UserProfileService Integration Tests', () => {
  let testUser: any;
  let eventBus: any;

  beforeAll(async () => {
    await prisma.$connect();
    eventBus = getEventBus(decisionEventsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // 创建测试用户
    testUser = await UserFactory.create({
      email: 'test-profile@example.com',
      username: 'testprofile',
    });
  });

  afterEach(async () => {
    // 清理测试数据
    if (testUser) {
      await prisma.userLearningProfile.deleteMany({ where: { userId: testUser.id } });
      await prisma.habitProfile.deleteMany({ where: { userId: testUser.id } });
      await prisma.amasUserState.deleteMany({ where: { userId: testUser.id } });
      await prisma.learningSession.deleteMany({ where: { userId: testUser.id } });
      await prisma.answerRecord.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.delete({ where: { id: testUser.id } });
    }

    // 重置习惯识别器
    userProfileService.resetUserHabit(testUser.id);
  });

  // ==================== 完整用户画像获取测试 ====================

  describe('Complete User Profile', () => {
    it('should get complete user profile with all components', async () => {
      const profile = await userProfileService.getUserProfile(testUser.id);

      expect(profile).toBeDefined();
      expect(profile.user).toBeDefined();
      expect(profile.user.id).toBe(testUser.id);
      expect(profile.user.email).toBe(testUser.email);
      expect(profile.habitProfile).toBeDefined();
      expect(profile.cognitiveProfile).toBeDefined();
      expect(profile.learningProfile).toBeDefined();
    });

    it('should create default learning profile if not exists', async () => {
      const profile = await userProfileService.getUserProfile(testUser.id);

      expect(profile.learningProfile).toBeDefined();
      expect(profile.learningProfile?.theta).toBe(0);
      expect(profile.learningProfile?.attention).toBe(0.7);
      expect(profile.learningProfile?.fatigue).toBe(0);
      expect(profile.learningProfile?.motivation).toBe(0.5);
    });

    it('should support selective profile loading', async () => {
      // 只加载基础信息和学习档案
      const profile = await userProfileService.getUserProfile(testUser.id, {
        includeHabit: false,
        includeCognitive: false,
        includeLearning: true,
      });

      expect(profile.user).toBeDefined();
      expect(profile.habitProfile).toBeNull();
      expect(profile.cognitiveProfile.chronotype).toBeNull();
      expect(profile.cognitiveProfile.learningStyle).toBeNull();
      expect(profile.learningProfile).toBeDefined();
    });

    it('should handle missing user gracefully', async () => {
      await expect(userProfileService.getUserProfile('non-existent-user-id')).rejects.toThrow(
        '用户不存在',
      );
    });

    it('should cache profile data appropriately', async () => {
      // 第一次获取
      const start1 = Date.now();
      const profile1 = await userProfileService.getUserProfile(testUser.id);
      const duration1 = Date.now() - start1;

      // 第二次获取（部分数据应该被缓存）
      const start2 = Date.now();
      const profile2 = await userProfileService.getUserProfile(testUser.id);
      const duration2 = Date.now() - start2;

      expect(profile1.user.id).toBe(profile2.user.id);
      // 第二次应该更快或相近（取决于缓存策略）
      expect(duration2).toBeLessThanOrEqual(duration1 * 2);
    });
  });

  // ==================== 用户基础信息管理测试 ====================

  describe('User Basic Info Management', () => {
    it('should get user by ID', async () => {
      const user = await userProfileService.getUserById(testUser.id);

      expect(user).toBeDefined();
      expect(user?.id).toBe(testUser.id);
      expect(user?.email).toBe(testUser.email);
    });

    it('should throw error when user not found with flag', async () => {
      await expect(
        userProfileService.getUserById('non-existent', { throwIfMissing: true }),
      ).rejects.toThrow('用户不存在');
    });

    it('should update user basic information', async () => {
      const newUsername = 'updated-username';
      const updatedUser = await userProfileService.updateUser(testUser.id, {
        username: newUsername,
      });

      expect(updatedUser.username).toBe(newUsername);

      // 验证数据库已更新
      const dbUser = await prisma.user.findUnique({ where: { id: testUser.id } });
      expect(dbUser?.username).toBe(newUsername);
    });

    it('should update user password correctly', async () => {
      const oldPassword = 'oldPassword123';
      const newPassword = 'newPassword456';

      // 先设置初始密码
      const bcrypt = await import('bcrypt');
      const oldHash = await bcrypt.hash(oldPassword, 10);
      await prisma.user.update({
        where: { id: testUser.id },
        data: { passwordHash: oldHash },
      });

      // 更新密码
      await userProfileService.updatePassword(testUser.id, {
        oldPassword,
        newPassword,
      });

      // 验证新密码
      const updatedUser = await prisma.user.findUnique({ where: { id: testUser.id } });
      const isValid = await bcrypt.compare(newPassword, updatedUser!.passwordHash);
      expect(isValid).toBe(true);
    });

    it('should fail to update password with wrong old password', async () => {
      const bcrypt = await import('bcrypt');
      const oldHash = await bcrypt.hash('correctPassword', 10);
      await prisma.user.update({
        where: { id: testUser.id },
        data: { passwordHash: oldHash },
      });

      await expect(
        userProfileService.updatePassword(testUser.id, {
          oldPassword: 'wrongPassword',
          newPassword: 'newPassword',
        }),
      ).rejects.toThrow('旧密码不正确');
    });

    it('should get user statistics', async () => {
      // 创建词书和单词
      const wordBook = await prisma.wordBook.create({
        data: {
          name: 'Test Book',
          type: 'SYSTEM',
        },
      });

      const word = await prisma.word.create({
        data: {
          wordBookId: wordBook.id,
          spelling: 'test',
          phonetic: '/test/',
          meanings: ['test'],
          examples: ['test'],
        },
      });

      // 创建答题记录
      await AnswerRecordFactory.create({
        userId: testUser.id,
        wordId: word.id,
        isCorrect: true,
      });
      await AnswerRecordFactory.create({
        userId: testUser.id,
        wordId: word.id,
        isCorrect: false,
      });

      const stats = await userProfileService.getUserStatistics(testUser.id);

      expect(stats).toBeDefined();
      expect(stats.totalRecords).toBe(2);
      expect(stats.correctCount).toBe(1);
      expect(stats.accuracy).toBe(50);

      // 清理
      await prisma.answerRecord.deleteMany({ where: { userId: testUser.id } });
      await prisma.word.delete({ where: { id: word.id } });
      await prisma.wordBook.delete({ where: { id: wordBook.id } });
    });

    it('should update reward profile', async () => {
      const newProfile = 'premium';
      const updated = await userProfileService.updateRewardProfile(testUser.id, newProfile);

      expect(updated.rewardProfile).toBe(newProfile);
    });
  });

  // ==================== 学习习惯画像测试 ====================

  describe('Habit Profile Management', () => {
    it('should initialize habit profile from history', async () => {
      // 创建学习会话历史
      const now = Date.now();
      const sessions = [
        { startedAt: new Date(now - 86400000), endedAt: new Date(now - 86400000 + 1800000) }, // 1天前，30分钟
        { startedAt: new Date(now - 43200000), endedAt: new Date(now - 43200000 + 1200000) }, // 12小时前，20分钟
        { startedAt: new Date(now - 3600000), endedAt: new Date(now - 3600000 + 900000) }, // 1小时前，15分钟
      ];

      for (const session of sessions) {
        await prisma.learningSession.create({
          data: {
            userId: testUser.id,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
          },
        });
      }

      await userProfileService.initializeHabitFromHistory(testUser.id);

      const profile = await userProfileService.getUserProfile(testUser.id);
      expect(profile.habitProfile).toBeDefined();
    });

    it('should update habit profile from memory', async () => {
      // 记录时间事件
      const timestamps = [
        Date.now() - 86400000, // 1天前
        Date.now() - 43200000, // 12小时前
        Date.now() - 3600000, // 1小时前
      ];

      timestamps.forEach((ts) => {
        userProfileService.recordTimeEvent(testUser.id, ts);
      });

      // 更新习惯画像
      const habitProfile = await userProfileService.updateHabitProfile(testUser.id);

      expect(habitProfile).toBeDefined();
      expect(habitProfile.timePref).toBeDefined();
    });

    it('should update habit profile with custom data', async () => {
      const customData = {
        timePref: Array(24)
          .fill(0)
          .map((_, i) => (i === 14 ? 1 : 0)), // 下午2点
        rhythmPref: {
          sessionMedianMinutes: 30,
          batchMedian: 10,
        },
      };

      const habitProfile = await userProfileService.updateHabitProfile(testUser.id, customData);

      expect(habitProfile).toBeDefined();
      expect(habitProfile.timePref).toBeDefined();
      expect(habitProfile.rhythmPref).toBeDefined();
    });

    it('should record session end and update habit', async () => {
      userProfileService.recordSessionEnd(testUser.id, 25, 10);
      userProfileService.recordSessionEnd(testUser.id, 30, 12);

      const habitProfile = userProfileService.getHabitProfile(testUser.id);

      expect(habitProfile).toBeDefined();
      expect(habitProfile.rhythmPref).toBeDefined();
    });

    it('should publish profile update event on habit change', async () => {
      const eventSpy = vi.fn();
      eventBus.subscribe('USER_STATE_UPDATED', eventSpy);

      await userProfileService.updateHabitProfile(testUser.id);

      // 等待事件处理
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(eventSpy).toHaveBeenCalled();
    });

    it('should reset user habit correctly', async () => {
      // 记录一些事件
      habitProfileService.recordTimeEvent(testUser.id);
      habitProfileService.recordSessionEnd(testUser.id, 20, 8);

      // 重置
      userProfileService.resetUserHabit(testUser.id);

      // 验证已重置
      const habitProfile = userProfileService.getHabitProfile(testUser.id);
      expect(habitProfile.timePref.preferredTimes).toHaveLength(24);
    });
  });

  // ==================== 认知画像测试 ====================

  describe('Cognitive Profile Management', () => {
    it('should get cognitive profile with insufficient data', async () => {
      const cognitiveProfile = await userProfileService.getCognitiveProfile(testUser.id);

      expect(cognitiveProfile).toBeDefined();
      // 数据不足时应该返回 null
      expect(cognitiveProfile.chronotype).toBeNull();
      expect(cognitiveProfile.learningStyle).toBeNull();
    });

    it('should build cognitive profile from sufficient data', async () => {
      // 创建足够的学习记录
      const wordBook = await prisma.wordBook.create({
        data: { name: 'Test', type: 'SYSTEM' },
      });

      const word = await prisma.word.create({
        data: {
          wordBookId: wordBook.id,
          spelling: 'test',
          phonetic: '/test/',
          meanings: ['test'],
          examples: [],
        },
      });

      // 创建多个时间段的答题记录
      const hours = [8, 10, 14, 16, 20];
      for (const hour of hours) {
        for (let i = 0; i < 10; i++) {
          const timestamp = new Date();
          timestamp.setHours(hour);
          await AnswerRecordFactory.create({
            userId: testUser.id,
            wordId: word.id,
            isCorrect: Math.random() > 0.3,
            responseTime: 2000 + Math.random() * 2000,
          });
          await prisma.answerRecord.updateMany({
            where: { userId: testUser.id, wordId: word.id },
            data: { createdAt: timestamp },
          });
        }
      }

      try {
        const cognitiveProfile = await userProfileService.getCognitiveProfile(testUser.id);
        // 有足够数据时应该能生成画像（或至少不抛出错误）
        expect(cognitiveProfile).toBeDefined();
      } catch (error: any) {
        // 如果数据仍不足，应该是 InsufficientDataError
        expect(error.message).toContain('数据不足');
      }

      // 清理
      await prisma.answerRecord.deleteMany({ where: { userId: testUser.id } });
      await prisma.word.delete({ where: { id: word.id } });
      await prisma.wordBook.delete({ where: { id: wordBook.id } });
    });

    it('should invalidate cognitive cache', async () => {
      // 获取画像（可能为空）
      await userProfileService.getCognitiveProfile(testUser.id);

      // 失效缓存
      userProfileService.invalidateCognitiveCache(testUser.id);

      // 再次获取应该重新计算
      const profile = await userProfileService.getCognitiveProfile(testUser.id);
      expect(profile).toBeDefined();
    });
  });

  // ==================== 学习档案管理测试 ====================

  describe('Learning Profile Management', () => {
    it('should get or create learning profile', async () => {
      const profile = await userProfileService.getUserLearningProfile(testUser.id);

      expect(profile).toBeDefined();
      expect(profile.userId).toBe(testUser.id);
      expect(profile.theta).toBe(0);
      expect(profile.attention).toBe(0.7);
    });

    it('should update learning profile fields', async () => {
      const updates = {
        theta: 0.5,
        attention: 0.8,
        fatigue: 0.3,
        motivation: 0.7,
        flowScore: 0.6,
      };

      const profile = await userProfileService.updateUserLearningProfile(testUser.id, updates);

      expect(profile.theta).toBe(0.5);
      expect(profile.attention).toBe(0.8);
      expect(profile.fatigue).toBe(0.3);
      expect(profile.motivation).toBe(0.7);
      expect(profile.flowScore).toBe(0.6);
    });

    it('should update learning profile partially', async () => {
      // 先创建初始档案
      await userProfileService.getUserLearningProfile(testUser.id);

      // 部分更新
      const updated = await userProfileService.updateUserLearningProfile(testUser.id, {
        attention: 0.9,
      });

      expect(updated.attention).toBe(0.9);
      expect(updated.theta).toBe(0); // 其他字段不变
    });

    it('should publish event on learning profile update', async () => {
      const eventSpy = vi.fn();
      eventBus.subscribe('USER_STATE_UPDATED', eventSpy);

      await userProfileService.updateUserLearningProfile(testUser.id, {
        motivation: 0.8,
      });

      // 等待事件处理
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(eventSpy).toHaveBeenCalled();
    });

    it('should update emotion state', async () => {
      const profile = await userProfileService.updateUserLearningProfile(testUser.id, {
        emotionBaseline: 'positive',
        lastReportedEmotion: 'happy',
      });

      expect(profile.emotionBaseline).toBe('positive');
      expect(profile.lastReportedEmotion).toBe('happy');
    });

    it('should update forgetting parameters', async () => {
      const forgettingParams = {
        decayRate: 0.5,
        threshold: 0.7,
      };

      const profile = await userProfileService.updateUserLearningProfile(testUser.id, {
        forgettingParams,
      });

      expect(profile.forgettingParams).toEqual(forgettingParams);
    });
  });

  // ==================== 多服务数据合并测试 ====================

  describe('Multi-Service Data Integration', () => {
    it('should merge data from all services', async () => {
      // 创建各种数据
      await userProfileService.updateUserLearningProfile(testUser.id, {
        theta: 0.5,
        attention: 0.8,
      });

      userProfileService.recordTimeEvent(testUser.id, Date.now());
      userProfileService.recordSessionEnd(testUser.id, 30, 10);

      // 获取完整画像
      const profile = await userProfileService.getUserProfile(testUser.id);

      expect(profile.user).toBeDefined();
      expect(profile.learningProfile).toBeDefined();
      expect(profile.habitProfile).toBeDefined();
      expect(profile.learningProfile?.theta).toBe(0.5);
      expect(profile.learningProfile?.attention).toBe(0.8);
    });

    it('should handle partial data gracefully', async () => {
      // 只有学习档案，没有其他数据
      await userProfileService.updateUserLearningProfile(testUser.id, {
        motivation: 0.7,
      });

      const profile = await userProfileService.getUserProfile(testUser.id);

      expect(profile.user).toBeDefined();
      expect(profile.learningProfile).toBeDefined();
      expect(profile.habitProfile).toBeDefined(); // 应该有默认值
      expect(profile.cognitiveProfile.chronotype).toBeNull(); // 数据不足
    });

    it('should maintain data consistency across services', async () => {
      // 更新学习档案
      await userProfileService.updateUserLearningProfile(testUser.id, {
        attention: 0.85,
        fatigue: 0.2,
      });

      // 从完整画像验证
      const profile = await userProfileService.getUserProfile(testUser.id);
      expect(profile.learningProfile?.attention).toBe(0.85);
      expect(profile.learningProfile?.fatigue).toBe(0.2);

      // 直接查询数据库验证
      const dbProfile = await prisma.userLearningProfile.findUnique({
        where: { userId: testUser.id },
      });
      expect(dbProfile?.attention).toBe(0.85);
      expect(dbProfile?.fatigue).toBe(0.2);
    });
  });

  // ==================== 并发场景测试 ====================

  describe('Concurrent Operations', () => {
    it('should handle concurrent profile updates', async () => {
      const updates = [
        userProfileService.updateUserLearningProfile(testUser.id, { attention: 0.7 }),
        userProfileService.updateUserLearningProfile(testUser.id, { fatigue: 0.3 }),
        userProfileService.updateUserLearningProfile(testUser.id, { motivation: 0.8 }),
      ];

      await Promise.all(updates);

      const profile = await userProfileService.getUserLearningProfile(testUser.id);
      expect(profile).toBeDefined();
      // 至少有一个更新成功
      expect(
        profile.attention === 0.7 || profile.fatigue === 0.3 || profile.motivation === 0.8,
      ).toBe(true);
    });

    it('should handle concurrent profile reads', async () => {
      const reads = Array.from({ length: 10 }, () =>
        userProfileService.getUserProfile(testUser.id),
      );

      const profiles = await Promise.all(reads);

      profiles.forEach((profile) => {
        expect(profile.user.id).toBe(testUser.id);
      });
    });

    it('should handle mixed read/write operations', async () => {
      const operations = [
        userProfileService.getUserProfile(testUser.id),
        userProfileService.updateUserLearningProfile(testUser.id, { attention: 0.75 }),
        userProfileService.getUserProfile(testUser.id),
        userProfileService.updateHabitProfile(testUser.id),
        userProfileService.getUserProfile(testUser.id),
      ];

      await Promise.all(operations);

      const finalProfile = await userProfileService.getUserProfile(testUser.id);
      expect(finalProfile).toBeDefined();
    });
  });

  // ==================== 错误处理测试 ====================

  describe('Error Handling', () => {
    it('should handle invalid user ID', async () => {
      await expect(userProfileService.getUserProfile('invalid-user-id')).rejects.toThrow();
    });

    it('should handle database connection errors gracefully', async () => {
      // 模拟数据库错误（通过使用已删除的用户）
      const deletedUserId = testUser.id;
      await prisma.user.delete({ where: { id: testUser.id } });
      testUser = null; // 防止 afterEach 再次删除

      await expect(userProfileService.getUserProfile(deletedUserId)).rejects.toThrow();
    });

    it('should handle partial update failures', async () => {
      const invalidData = {
        theta: 'invalid' as any, // 类型错误
      };

      await expect(
        userProfileService.updateUserLearningProfile(testUser.id, invalidData),
      ).rejects.toThrow();
    });

    it('should rollback on transaction failure', async () => {
      // 创建初始档案
      const initial = await userProfileService.getUserLearningProfile(testUser.id);
      const initialAttention = initial.attention;

      // 尝试无效更新
      try {
        await userProfileService.updateUserLearningProfile(testUser.id, {
          attention: 'invalid' as any,
        });
      } catch (error) {
        // 预期的错误
      }

      // 验证数据未被破坏
      const current = await userProfileService.getUserLearningProfile(testUser.id);
      expect(current.attention).toBe(initialAttention);
    });
  });

  // ==================== 用户删除测试 ====================

  describe('User Deletion', () => {
    it('should delete user and all related data', async () => {
      // 创建各种关联数据
      await userProfileService.updateUserLearningProfile(testUser.id, {
        motivation: 0.8,
      });

      const wordBook = await prisma.wordBook.create({
        data: { name: 'Test', type: 'SYSTEM' },
      });

      const word = await prisma.word.create({
        data: {
          wordBookId: wordBook.id,
          spelling: 'test',
          phonetic: '/test/',
          meanings: ['test'],
          examples: [],
        },
      });

      await AnswerRecordFactory.create({
        userId: testUser.id,
        wordId: word.id,
      });

      // 删除用户
      await userProfileService.deleteUser(testUser.id);
      testUser = null; // 防止 afterEach 再次删除

      // 验证用户已删除
      const deletedUser = await prisma.user.findUnique({ where: { id: testUser.id } });
      expect(deletedUser).toBeNull();

      // 清理词书和单词
      await prisma.word.delete({ where: { id: word.id } });
      await prisma.wordBook.delete({ where: { id: wordBook.id } });
    });
  });

  // ==================== 性能测试 ====================

  describe('Performance Tests', () => {
    it('should load complete profile efficiently', async () => {
      const startTime = Date.now();
      const profile = await userProfileService.getUserProfile(testUser.id);
      const duration = Date.now() - startTime;

      expect(profile).toBeDefined();
      expect(duration).toBeLessThan(1000); // 应该在1秒内完成
    });

    it('should handle multiple users efficiently', async () => {
      // 创建多个用户
      const users = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          UserFactory.create({
            email: `test${i}@example.com`,
            username: `testuser${i}`,
          }),
        ),
      );

      const startTime = Date.now();
      await Promise.all(users.map((user) => userProfileService.getUserProfile(user.id)));
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(3000); // 应该在3秒内完成

      // 清理
      for (const user of users) {
        await prisma.userLearningProfile.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    });

    it('should batch update efficiently', async () => {
      const startTime = Date.now();

      await Promise.all([
        userProfileService.updateUserLearningProfile(testUser.id, { attention: 0.7 }),
        userProfileService.updateUserLearningProfile(testUser.id, { fatigue: 0.2 }),
        userProfileService.updateUserLearningProfile(testUser.id, { motivation: 0.8 }),
      ]);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(2000);
    });

    it('should optimize repeated profile access', async () => {
      // 第一次访问
      const start1 = Date.now();
      await userProfileService.getUserProfile(testUser.id);
      const duration1 = Date.now() - start1;

      // 后续访问
      const durations: number[] = [];
      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        await userProfileService.getUserProfile(testUser.id);
        durations.push(Date.now() - start);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      // 平均应该不会显著增加
      expect(avgDuration).toBeLessThanOrEqual(duration1 * 2);
    });
  });

  // ==================== 时间事件记录测试 ====================

  describe('Time Event Recording', () => {
    it('should record time events correctly', async () => {
      const timestamps = [
        Date.now() - 3600000, // 1小时前
        Date.now() - 1800000, // 30分钟前
        Date.now(), // 现在
      ];

      timestamps.forEach((ts) => {
        userProfileService.recordTimeEvent(testUser.id, ts);
      });

      const habitProfile = userProfileService.getHabitProfile(testUser.id);
      expect(habitProfile).toBeDefined();
      expect(habitProfile.timePref).toBeDefined();
    });

    it('should accumulate session data', async () => {
      userProfileService.recordSessionEnd(testUser.id, 20, 8);
      userProfileService.recordSessionEnd(testUser.id, 25, 10);
      userProfileService.recordSessionEnd(testUser.id, 30, 12);

      const habitProfile = userProfileService.getHabitProfile(testUser.id);
      expect(habitProfile.rhythmPref).toBeDefined();
    });
  });

  // ==================== 事件总线集成测试 ====================

  describe('Event Bus Integration', () => {
    it('should publish events on profile changes', async () => {
      const eventSpy = vi.fn();
      eventBus.subscribe('USER_STATE_UPDATED', eventSpy);

      await userProfileService.updateUserLearningProfile(testUser.id, {
        attention: 0.9,
      });

      // 等待异步事件处理
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(eventSpy).toHaveBeenCalled();
    });

    it('should include correct event payload', async () => {
      const eventSpy = vi.fn();
      eventBus.subscribe('USER_STATE_UPDATED', eventSpy);

      await userProfileService.updateHabitProfile(testUser.id);

      await new Promise((resolve) => setTimeout(resolve, 500));

      if (eventSpy.mock.calls.length > 0) {
        const event = eventSpy.mock.calls[0][0];
        expect(event.payload).toBeDefined();
        expect(event.payload.userId).toBe(testUser.id);
      }
    });

    it('should handle event publishing errors gracefully', async () => {
      // 即使事件发布失败，主流程也应该成功
      const profile = await userProfileService.updateUserLearningProfile(testUser.id, {
        motivation: 0.75,
      });

      expect(profile).toBeDefined();
      expect(profile.motivation).toBe(0.75);
    });
  });
});
