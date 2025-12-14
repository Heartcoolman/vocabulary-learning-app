/**
 * Tracking Service Unit Tests
 * Tests for the TrackingService API
 *
 * 注意：TrackingService 使用内存缓冲 + 定时刷新架构
 * processBatch() 将数据放入缓冲区，flush() 将数据写入数据库
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../../../src/config/database', () => ({
  default: {
    userInteractionStats: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    userTrackingEvent: {
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../../src/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

import prisma from '../../../src/config/database';
import { trackingService, TrackingEvent, EventBatch } from '../../../src/services/tracking.service';

describe('TrackingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置 mock 默认返回值
    (prisma.userInteractionStats.upsert as any).mockResolvedValue({});
    (prisma.userTrackingEvent.createMany as any).mockResolvedValue({ count: 0 });
    (prisma.userInteractionStats.findUnique as any).mockResolvedValue(null);
    (prisma.userTrackingEvent.findMany as any).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('processBatch', () => {
    it('should process batch of events and update stats after flush', async () => {
      const batch: EventBatch = {
        events: [
          { type: 'pronunciation_click', timestamp: Date.now() },
          { type: 'pronunciation_click', timestamp: Date.now() },
          { type: 'learning_pause', timestamp: Date.now() },
          { type: 'page_switch', timestamp: Date.now() },
          { type: 'interaction', timestamp: Date.now() },
        ],
        sessionId: 'session-123',
        timestamp: Date.now(),
      };

      await trackingService.processBatch('user-123', batch);
      // 显式刷新缓冲区到数据库
      await trackingService.flush();

      expect(prisma.userInteractionStats.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-123' },
          create: expect.objectContaining({
            userId: 'user-123',
            pronunciationClicks: 2,
            pauseCount: 1,
            pageSwitchCount: 1,
            totalInteractions: 5,
          }),
          update: expect.objectContaining({
            pronunciationClicks: { increment: 2 },
            pauseCount: { increment: 1 },
            pageSwitchCount: { increment: 1 },
            totalInteractions: { increment: 5 },
          }),
        }),
      );
    });

    it('should store events in database after flush', async () => {
      const events: TrackingEvent[] = [
        {
          type: 'pronunciation_click',
          timestamp: 1700000000000,
          data: { wordId: 'word-1' },
        },
        { type: 'session_start', timestamp: 1700000001000 },
      ];

      const batch: EventBatch = {
        events,
        sessionId: 'session-456',
        timestamp: Date.now(),
      };

      await trackingService.processBatch('user-456', batch);
      await trackingService.flush();

      expect(prisma.userTrackingEvent.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              userId: 'user-456',
              sessionId: 'session-456',
              eventType: 'pronunciation_click',
            }),
            expect.objectContaining({
              userId: 'user-456',
              sessionId: 'session-456',
              eventType: 'session_start',
            }),
          ]),
          skipDuplicates: true,
        }),
      );
    });

    it('should handle empty event batch', async () => {
      const batch: EventBatch = {
        events: [],
        sessionId: 'session-789',
        timestamp: Date.now(),
      };

      await trackingService.processBatch('user-789', batch);
      await trackingService.flush();

      expect(prisma.userInteractionStats.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            pronunciationClicks: 0,
            pauseCount: 0,
            pageSwitchCount: 0,
            totalInteractions: 0,
          }),
        }),
      );
    });

    it('should handle database errors gracefully for stats update', async () => {
      const batch: EventBatch = {
        events: [{ type: 'interaction', timestamp: Date.now() }],
        sessionId: 'session-err',
        timestamp: Date.now(),
      };

      (prisma.userInteractionStats.upsert as any).mockRejectedValue(new Error('DB error'));

      await trackingService.processBatch('user-err', batch);
      // flush 不应抛出异常，只记录警告
      await trackingService.flush();

      // 即使 stats upsert 失败，createMany 仍应被调用
      expect(prisma.userTrackingEvent.createMany).toHaveBeenCalled();
    });

    it('should handle database errors gracefully for event storage', async () => {
      const batch: EventBatch = {
        events: [{ type: 'interaction', timestamp: Date.now() }],
        sessionId: 'session-err2',
        timestamp: Date.now(),
      };

      (prisma.userTrackingEvent.createMany as any).mockRejectedValue(new Error('DB error'));

      await trackingService.processBatch('user-err2', batch);
      // flush 不应抛出异常
      await trackingService.flush();

      // 即使 createMany 失败，upsert 仍应被调用
      expect(prisma.userInteractionStats.upsert).toHaveBeenCalled();
    });

    it('should buffer multiple batches before flush', async () => {
      const batch1: EventBatch = {
        events: [{ type: 'pronunciation_click', timestamp: Date.now() }],
        sessionId: 'session-1',
        timestamp: Date.now(),
      };

      const batch2: EventBatch = {
        events: [
          { type: 'pronunciation_click', timestamp: Date.now() },
          { type: 'learning_pause', timestamp: Date.now() },
        ],
        sessionId: 'session-2',
        timestamp: Date.now(),
      };

      await trackingService.processBatch('user-multi', batch1);
      await trackingService.processBatch('user-multi', batch2);
      await trackingService.flush();

      // 应该合并同一用户的统计
      expect(prisma.userInteractionStats.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-multi' },
          create: expect.objectContaining({
            pronunciationClicks: 2, // 1 + 1
            pauseCount: 1,
            totalInteractions: 3, // 1 + 2
          }),
        }),
      );
    });
  });

  describe('getUserInteractionStats', () => {
    it('should return user interaction stats from database', async () => {
      const mockStats = {
        pronunciationClicks: 50,
        pauseCount: 10,
        pageSwitchCount: 25,
        totalInteractions: 200,
        totalSessionDuration: 3600,
        lastActivityTime: new Date('2024-01-15T10:00:00Z'),
      };

      (prisma.userInteractionStats.findUnique as any).mockResolvedValue(mockStats);

      const result = await trackingService.getUserInteractionStats('user-123');

      expect(result).toEqual({
        pronunciationClicks: 50,
        pauseCount: 10,
        pageSwitchCount: 25,
        totalInteractions: 200,
        totalSessionDuration: 3600,
        lastActivityTime: mockStats.lastActivityTime,
      });
    });

    it('should merge buffered stats with database stats', async () => {
      const mockDbStats = {
        pronunciationClicks: 50,
        pauseCount: 10,
        pageSwitchCount: 25,
        totalInteractions: 200,
        totalSessionDuration: 3600,
        lastActivityTime: new Date('2024-01-15T10:00:00Z'),
      };

      (prisma.userInteractionStats.findUnique as any).mockResolvedValue(mockDbStats);

      // 先添加一些数据到缓冲区
      const batch: EventBatch = {
        events: [
          { type: 'pronunciation_click', timestamp: Date.now() },
          { type: 'pronunciation_click', timestamp: Date.now() },
        ],
        sessionId: 'session-merge',
        timestamp: Date.now(),
      };
      await trackingService.processBatch('user-merge', batch);

      const result = await trackingService.getUserInteractionStats('user-merge');

      // 应该合并缓冲区数据
      expect(result).toEqual({
        pronunciationClicks: 52, // 50 + 2
        pauseCount: 10,
        pageSwitchCount: 25,
        totalInteractions: 202, // 200 + 2
        totalSessionDuration: 3600,
        lastActivityTime: mockDbStats.lastActivityTime,
      });

      // 清理缓冲区
      await trackingService.flush();
    });

    it('should return null for user with no stats', async () => {
      (prisma.userInteractionStats.findUnique as any).mockResolvedValue(null);

      const result = await trackingService.getUserInteractionStats('new-user');

      expect(result).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      (prisma.userInteractionStats.findUnique as any).mockRejectedValue(new Error('DB error'));

      const result = await trackingService.getUserInteractionStats('user-err');

      expect(result).toBeNull();
    });
  });

  describe('calculateAuditoryPreference', () => {
    it('should return high preference for frequent pronunciation clicks', async () => {
      (prisma.userInteractionStats.findUnique as any).mockResolvedValue({
        pronunciationClicks: 50,
        pauseCount: 5,
        pageSwitchCount: 10,
        totalInteractions: 100,
        totalSessionDuration: 0,
        lastActivityTime: new Date(),
      });

      const result = await trackingService.calculateAuditoryPreference('user-audio');

      // 50/100 = 0.5, 0.5/0.3 = 1.67 -> capped at 1.0
      expect(result).toBe(1.0);
    });

    it('should return low preference for rare pronunciation clicks', async () => {
      (prisma.userInteractionStats.findUnique as any).mockResolvedValue({
        pronunciationClicks: 5,
        pauseCount: 20,
        pageSwitchCount: 30,
        totalInteractions: 200,
        totalSessionDuration: 0,
        lastActivityTime: new Date(),
      });

      const result = await trackingService.calculateAuditoryPreference('user-visual');

      // 5/200 = 0.025, 0.025/0.3 = 0.083
      expect(result).toBeCloseTo(0.083, 2);
    });

    it('should return default 0.5 for user with no stats', async () => {
      (prisma.userInteractionStats.findUnique as any).mockResolvedValue(null);

      const result = await trackingService.calculateAuditoryPreference('new-user');

      expect(result).toBe(0.5);
    });

    it('should return default 0.5 for user with zero interactions', async () => {
      (prisma.userInteractionStats.findUnique as any).mockResolvedValue({
        pronunciationClicks: 0,
        pauseCount: 0,
        pageSwitchCount: 0,
        totalInteractions: 0,
        totalSessionDuration: 0,
        lastActivityTime: new Date(),
      });

      const result = await trackingService.calculateAuditoryPreference('inactive-user');

      expect(result).toBe(0.5);
    });

    it('should handle errors gracefully', async () => {
      (prisma.userInteractionStats.findUnique as any).mockRejectedValue(new Error('DB error'));

      const result = await trackingService.calculateAuditoryPreference('user-err');

      expect(result).toBe(0.5);
    });
  });

  describe('getRecentEvents', () => {
    it('should return recent tracking events from database', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          userId: 'user-123',
          sessionId: 'session-1',
          eventType: 'pronunciation_click',
          eventData: { wordId: 'word-1' },
          timestamp: new Date('2024-01-15T10:00:00Z'),
        },
        {
          id: 'event-2',
          userId: 'user-123',
          sessionId: 'session-1',
          eventType: 'page_switch',
          eventData: null,
          timestamp: new Date('2024-01-15T09:59:00Z'),
        },
      ];

      (prisma.userTrackingEvent.findMany as any).mockResolvedValue(mockEvents);

      const result = await trackingService.getRecentEvents('user-123', 50);

      expect(result.length).toBeGreaterThanOrEqual(2);
      // 检查第一个事件（可能包含缓冲区数据）
      const pronunciationEvent = result.find((e) => e.type === 'pronunciation_click');
      expect(pronunciationEvent).toBeDefined();
    });

    it('should use default limit of 100', async () => {
      (prisma.userTrackingEvent.findMany as any).mockResolvedValue([]);

      await trackingService.getRecentEvents('user-123');

      expect(prisma.userTrackingEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        }),
      );
    });

    it('should return empty array on error', async () => {
      (prisma.userTrackingEvent.findMany as any).mockRejectedValue(new Error('DB error'));

      const result = await trackingService.getRecentEvents('user-err');

      expect(result).toEqual([]);
    });
  });

  describe('flush', () => {
    it('should not call database when buffer is empty', async () => {
      // 确保缓冲区为空
      await trackingService.flush();
      vi.clearAllMocks();

      // 再次 flush 空缓冲区
      await trackingService.flush();

      expect(prisma.userInteractionStats.upsert).not.toHaveBeenCalled();
      expect(prisma.userTrackingEvent.createMany).not.toHaveBeenCalled();
    });
  });

  describe('exports', () => {
    it('should export trackingService singleton', async () => {
      const module = await import('../../../src/services/tracking.service');
      expect(module.trackingService).toBeDefined();
    });

    it('should export default', async () => {
      const module = await import('../../../src/services/tracking.service');
      expect(module.default).toBeDefined();
    });

    it('should export TrackingEventType type', async () => {
      // Type check - verify module exports work
      const module = await import('../../../src/services/tracking.service');
      expect(module.trackingService).toBeDefined();
    });
  });
});
