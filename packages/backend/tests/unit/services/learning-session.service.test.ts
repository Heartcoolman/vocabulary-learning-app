/**
 * Learning Session Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { SessionType } from '@prisma/client';

// Mock dependencies
const mockLearningSessionCreate = vi.fn();
const mockLearningSessionUpdate = vi.fn();
const mockLearningSessionFindUnique = vi.fn();
const mockLearningSessionFindFirst = vi.fn();
const mockLearningSessionFindMany = vi.fn();
const mockLearningSessionCount = vi.fn();

vi.mock('../../../src/config/database', () => ({
  default: {
    learningSession: {
      create: (...args: any[]) => mockLearningSessionCreate(...args),
      update: (...args: any[]) => mockLearningSessionUpdate(...args),
      findUnique: (...args: any[]) => mockLearningSessionFindUnique(...args),
      findFirst: (...args: any[]) => mockLearningSessionFindFirst(...args),
      findMany: (...args: any[]) => mockLearningSessionFindMany(...args),
      count: (...args: any[]) => mockLearningSessionCount(...args),
    },
  },
}));

vi.mock('../../../src/core/event-bus', () => ({
  getEventBus: vi.fn(() => ({
    publish: vi.fn(),
  })),
}));

vi.mock('../../../src/services/decision-events.service', () => ({
  decisionEventsService: {},
}));

describe('LearningSessionService', () => {
  let learningSessionService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const module = await import('../../../src/services/learning-session.service');
    learningSessionService = module.learningSessionService;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('createSession', () => {
    it('应该创建学习会话', async () => {
      const userId = 'user-1';
      const sessionType = 'NORMAL' as SessionType;
      const targetMasteryCount = 20;

      mockLearningSessionCreate.mockResolvedValue({
        id: 'session-1',
        userId,
        sessionType,
        targetMasteryCount,
        startedAt: new Date(),
        totalQuestions: 0,
        actualMasteryCount: 0,
        contextShifts: 0,
      });

      const result = await learningSessionService.createSession(userId, {
        sessionType,
        targetMasteryCount,
      });

      expect(result).toEqual({ sessionId: 'session-1' });
      expect(mockLearningSessionCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          sessionType,
          targetMasteryCount,
        }),
      });
    });

    it('应该使用默认配置创建会话', async () => {
      const userId = 'user-1';

      mockLearningSessionCreate.mockResolvedValue({
        id: 'session-1',
        userId,
        sessionType: 'NORMAL',
        targetMasteryCount: null,
        startedAt: new Date(),
        totalQuestions: 0,
        actualMasteryCount: 0,
        contextShifts: 0,
      });

      const result = await learningSessionService.createSession(userId);

      expect(result).toEqual({ sessionId: 'session-1' });
      expect(mockLearningSessionCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          sessionType: 'NORMAL',
        }),
      });
    });
  });

  describe('startSession', () => {
    it('应该启动会话并发布事件', async () => {
      const sessionId = 'session-1';
      const mockSession = {
        id: sessionId,
        userId: 'user-1',
        sessionType: 'NORMAL',
        targetMasteryCount: 20,
        startedAt: new Date(),
        endedAt: null,
      };

      mockLearningSessionFindUnique.mockResolvedValue(mockSession);

      await learningSessionService.startSession(sessionId);

      expect(mockLearningSessionFindUnique).toHaveBeenCalledWith({
        where: { id: sessionId },
        select: expect.any(Object),
      });
    });

    it('应该在会话不存在时抛出错误', async () => {
      const sessionId = 'non-existent-session';

      mockLearningSessionFindUnique.mockResolvedValue(null);

      await expect(learningSessionService.startSession(sessionId)).rejects.toThrow(
        `会话不存在: ${sessionId}`,
      );
    });

    it('应该在会话已结束时抛出错误', async () => {
      const sessionId = 'session-1';
      const mockSession = {
        id: sessionId,
        userId: 'user-1',
        sessionType: 'NORMAL',
        targetMasteryCount: 20,
        startedAt: new Date(),
        endedAt: new Date(),
      };

      mockLearningSessionFindUnique.mockResolvedValue(mockSession);

      await expect(learningSessionService.startSession(sessionId)).rejects.toThrow(
        `会话已结束: ${sessionId}`,
      );
    });
  });

  describe('endSession', () => {
    it('应该结束会话并返回统计数据', async () => {
      const sessionId = 'session-1';
      const startedAt = new Date(Date.now() - 3600000); // 1小时前
      const mockSession = {
        id: sessionId,
        userId: 'user-1',
        sessionType: 'NORMAL' as SessionType,
        targetMasteryCount: 20,
        startedAt,
        endedAt: new Date(),
        totalQuestions: 15,
        actualMasteryCount: 10,
        flowPeakScore: 0.8,
        avgCognitiveLoad: 0.6,
        contextShifts: 2,
        answerRecords: [{ id: 'record-1' }, { id: 'record-2' }],
      };

      mockLearningSessionUpdate.mockResolvedValue(mockSession);

      const stats = await learningSessionService.endSession(sessionId);

      expect(stats).toMatchObject({
        id: sessionId,
        userId: 'user-1',
        totalQuestions: 15,
        actualMasteryCount: 10,
      });
      expect(stats.duration).toBeGreaterThan(0);
      expect(mockLearningSessionUpdate).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: { endedAt: expect.any(Date) },
        include: { answerRecords: { select: { id: true } } },
      });
    });
  });

  describe('updateProgress', () => {
    it('应该更新会话进度', async () => {
      const sessionId = 'session-1';
      const progress = {
        totalQuestions: 10,
        actualMasteryCount: 5,
        flowPeakScore: 0.7,
      };

      mockLearningSessionUpdate.mockResolvedValue({});

      await learningSessionService.updateProgress(sessionId, progress);

      expect(mockLearningSessionUpdate).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: progress,
      });
    });

    it('应该只更新提供的字段', async () => {
      const sessionId = 'session-1';
      const progress = { totalQuestions: 10 };

      mockLearningSessionUpdate.mockResolvedValue({});

      await learningSessionService.updateProgress(sessionId, progress);

      expect(mockLearningSessionUpdate).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: { totalQuestions: 10 },
      });
    });
  });

  describe('getSessionStats', () => {
    it('应该返回会话统计数据', async () => {
      const sessionId = 'session-1';
      const startedAt = new Date(Date.now() - 3600000);
      const mockSession = {
        id: sessionId,
        userId: 'user-1',
        sessionType: 'NORMAL' as SessionType,
        targetMasteryCount: 20,
        startedAt,
        endedAt: new Date(),
        totalQuestions: 15,
        actualMasteryCount: 10,
        flowPeakScore: 0.8,
        avgCognitiveLoad: 0.6,
        contextShifts: 2,
        answerRecords: [{ id: 'record-1' }],
      };

      mockLearningSessionFindUnique.mockResolvedValue(mockSession);

      const stats = await learningSessionService.getSessionStats(sessionId);

      expect(stats).toMatchObject({
        id: sessionId,
        userId: 'user-1',
        totalQuestions: 15,
        actualMasteryCount: 10,
        answerRecordCount: 1,
      });
    });

    it('应该在会话不存在时抛出错误', async () => {
      const sessionId = 'non-existent-session';

      mockLearningSessionFindUnique.mockResolvedValue(null);

      await expect(learningSessionService.getSessionStats(sessionId)).rejects.toThrow(
        `会话不存在: ${sessionId}`,
      );
    });
  });

  describe('getActiveSession', () => {
    it('应该返回用户的活跃会话', async () => {
      const userId = 'user-1';
      const mockSession = {
        id: 'session-1',
        userId,
        sessionType: 'NORMAL' as SessionType,
        startedAt: new Date(),
        endedAt: null,
        totalQuestions: 5,
        actualMasteryCount: 3,
        targetMasteryCount: 20,
        flowPeakScore: null,
        avgCognitiveLoad: null,
        contextShifts: 0,
        answerRecords: [{ id: 'record-1' }],
      };

      mockLearningSessionFindFirst.mockResolvedValue(mockSession);

      const session = await learningSessionService.getActiveSession(userId);

      expect(session).toMatchObject({
        id: 'session-1',
        userId,
      });
      expect(mockLearningSessionFindFirst).toHaveBeenCalledWith({
        where: {
          userId,
          endedAt: null,
        },
        orderBy: { startedAt: 'desc' },
        include: { answerRecords: { select: { id: true } } },
      });
    });

    it('应该在没有活跃会话时返回 null', async () => {
      const userId = 'user-1';

      mockLearningSessionFindFirst.mockResolvedValue(null);

      const session = await learningSessionService.getActiveSession(userId);

      expect(session).toBeNull();
    });
  });

  describe('getUserSessions', () => {
    it('应该返回用户的会话列表', async () => {
      const userId = 'user-1';
      const mockSessions = [
        {
          id: 'session-1',
          userId,
          sessionType: 'NORMAL' as SessionType,
          startedAt: new Date(),
          endedAt: new Date(),
          totalQuestions: 10,
          actualMasteryCount: 8,
          targetMasteryCount: 20,
          flowPeakScore: 0.7,
          avgCognitiveLoad: 0.5,
          contextShifts: 1,
          answerRecords: [{ id: 'record-1' }],
        },
      ];

      mockLearningSessionFindMany.mockResolvedValue(mockSessions);

      const sessions = await learningSessionService.getUserSessions(userId);

      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        id: 'session-1',
        userId,
      });
    });

    it('应该支持分页', async () => {
      const userId = 'user-1';

      mockLearningSessionFindMany.mockResolvedValue([]);

      await learningSessionService.getUserSessions(userId, {
        limit: 10,
        offset: 20,
      });

      expect(mockLearningSessionFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        }),
      );
    });
  });

  describe('getUserSessionCount', () => {
    it('应该返回用户的会话总数', async () => {
      const userId = 'user-1';

      mockLearningSessionCount.mockResolvedValue(42);

      const count = await learningSessionService.getUserSessionCount(userId);

      expect(count).toBe(42);
      expect(mockLearningSessionCount).toHaveBeenCalledWith({
        where: {
          userId,
          endedAt: { not: null },
        },
      });
    });
  });

  describe('detectFlow', () => {
    it('应该触发心流检测钩子', async () => {
      const sessionId = 'session-1';
      const userId = 'user-1';
      const metrics = {
        challengeLevel: 0.7,
        skillLevel: 0.6,
        concentration: 0.8,
      };

      mockLearningSessionFindUnique.mockResolvedValue({
        flowPeakScore: null,
      });
      mockLearningSessionUpdate.mockResolvedValue({});

      const flowScore = await learningSessionService.detectFlow(sessionId, userId, metrics);

      expect(flowScore).toBeGreaterThanOrEqual(0);
      expect(flowScore).toBeLessThanOrEqual(1);
    });
  });

  describe('trackEmotion', () => {
    it('应该触发情绪追踪钩子', async () => {
      const sessionId = 'session-1';
      const userId = 'user-1';
      const event = {
        type: 'answer' as const,
        isCorrect: true,
        responseTime: 2000,
      };

      await expect(
        learningSessionService.trackEmotion(sessionId, userId, event),
      ).resolves.not.toThrow();
    });
  });

  describe('钩子注册', () => {
    it('应该支持注册心流检测钩子', () => {
      const hook = vi.fn();

      expect(() => {
        learningSessionService.registerFlowDetectionHook(hook);
      }).not.toThrow();
    });

    it('应该支持注册情绪追踪钩子', () => {
      const hook = vi.fn();

      expect(() => {
        learningSessionService.registerEmotionTrackingHook(hook);
      }).not.toThrow();
    });
  });
});
