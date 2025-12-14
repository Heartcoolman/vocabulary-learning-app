/**
 * NotificationService Unit Tests
 * 通知服务单元测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type {
  NotificationType,
  NotificationStatus,
  NotificationPriority,
} from '@danci/shared/types';

// Mock dependencies
const mockNotificationFindMany = vi.fn();
const mockNotificationFindFirst = vi.fn();
const mockNotificationFindUnique = vi.fn();
const mockNotificationCreate = vi.fn();
const mockNotificationUpdateMany = vi.fn();
const mockNotificationCount = vi.fn();
const mockNotificationGroupBy = vi.fn();
const mockNotificationDeleteMany = vi.fn();
const mockUserPreferenceFindUnique = vi.fn();
const mockWordFindUnique = vi.fn();

vi.mock('../../../src/config/database', () => ({
  default: {
    notification: {
      findMany: (...args: any[]) => mockNotificationFindMany(...args),
      findFirst: (...args: any[]) => mockNotificationFindFirst(...args),
      findUnique: (...args: any[]) => mockNotificationFindUnique(...args),
      create: (...args: any[]) => mockNotificationCreate(...args),
      updateMany: (...args: any[]) => mockNotificationUpdateMany(...args),
      count: (...args: any[]) => mockNotificationCount(...args),
      groupBy: (...args: any[]) => mockNotificationGroupBy(...args),
      deleteMany: (...args: any[]) => mockNotificationDeleteMany(...args),
    },
    userPreference: {
      findUnique: (...args: any[]) => mockUserPreferenceFindUnique(...args),
    },
    word: {
      findUnique: (...args: any[]) => mockWordFindUnique(...args),
    },
  },
}));

vi.mock('../../../src/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
  serviceLogger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

// Mock EventBus
vi.mock('../../../src/core/event-bus', () => ({
  getEventBus: vi.fn(() => ({
    subscribe: vi.fn(),
  })),
}));

// Mock RealtimeService
vi.mock('../../../src/services/realtime.service', () => ({
  realtimeService: {
    sendToUser: vi.fn(),
  },
}));

// Mock DecisionEventsService
vi.mock('../../../src/services/decision-events.service', () => ({
  decisionEventsService: {},
}));

describe('NotificationService', () => {
  let notificationService: any;
  const userId = 'test-user-id';
  const notificationId = 'test-notification-id';

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // 动态导入服务
    const module = await import('../../../src/services/notification.service');
    notificationService = module.notificationService;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('sendNotification', () => {
    it('应该成功创建通知', async () => {
      const notificationData = {
        id: notificationId,
        userId,
        type: 'REMINDER',
        title: '测试通知',
        content: '这是一条测试通知',
        status: 'UNREAD',
        priority: 'NORMAL',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockNotificationCreate.mockResolvedValue(notificationData);

      const result = await notificationService.sendNotification({
        userId,
        type: 'REMINDER' as NotificationType,
        title: '测试通知',
        content: '这是一条测试通知',
      });

      expect(mockNotificationCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          type: 'REMINDER',
          title: '测试通知',
          content: '这是一条测试通知',
          status: 'UNREAD',
        }),
      });

      expect(result).toEqual(
        expect.objectContaining({
          id: notificationId,
          userId,
          type: 'REMINDER',
        }),
      );
    });

    it('应该使用自定义优先级创建通知', async () => {
      const notificationData = {
        id: notificationId,
        userId,
        type: 'FORGETTING_ALERT',
        title: '遗忘预警',
        content: '请尽快复习',
        status: 'UNREAD',
        priority: 'HIGH',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockNotificationCreate.mockResolvedValue(notificationData);

      await notificationService.sendNotification({
        userId,
        type: 'FORGETTING_ALERT' as NotificationType,
        title: '遗忘预警',
        content: '请尽快复习',
        priority: 'HIGH' as NotificationPriority,
      });

      expect(mockNotificationCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priority: 'HIGH',
        }),
      });
    });
  });

  describe('getNotifications', () => {
    it('应该获取用户的通知列表', async () => {
      const notifications = [
        {
          id: '1',
          userId,
          type: 'REMINDER',
          title: '通知1',
          content: '内容1',
          status: 'UNREAD',
          priority: 'NORMAL',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockNotificationFindMany.mockResolvedValue(notifications);

      const result = await notificationService.getNotifications(userId);

      expect(mockNotificationFindMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId,
          status: { not: 'DELETED' },
        }),
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: 50,
        skip: 0,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: '1',
          userId,
        }),
      );
    });

    it('应该支持状态过滤', async () => {
      mockNotificationFindMany.mockResolvedValue([]);

      await notificationService.getNotifications(userId, {
        status: 'UNREAD' as NotificationStatus,
      });

      expect(mockNotificationFindMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          status: 'UNREAD',
        }),
        orderBy: expect.any(Array),
        take: 50,
        skip: 0,
      });
    });

    it('应该支持分页', async () => {
      mockNotificationFindMany.mockResolvedValue([]);

      await notificationService.getNotifications(userId, {
        limit: 20,
        offset: 10,
      });

      expect(mockNotificationFindMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        orderBy: expect.any(Array),
        take: 20,
        skip: 10,
      });
    });
  });

  describe('markAsRead', () => {
    it('应该标记通知为已读', async () => {
      mockNotificationUpdateMany.mockResolvedValue({ count: 1 });

      await notificationService.markAsRead(notificationId, userId);

      expect(mockNotificationUpdateMany).toHaveBeenCalledWith({
        where: {
          id: notificationId,
          userId,
        },
        data: {
          status: 'READ',
          readAt: expect.any(Date),
        },
      });
    });
  });

  describe('markAllAsRead', () => {
    it('应该标记所有未读通知为已读', async () => {
      mockNotificationUpdateMany.mockResolvedValue({ count: 5 });

      const result = await notificationService.markAllAsRead(userId);

      expect(mockNotificationUpdateMany).toHaveBeenCalledWith({
        where: {
          userId,
          status: 'UNREAD',
        },
        data: {
          status: 'READ',
          readAt: expect.any(Date),
        },
      });

      expect(result).toEqual({
        success: true,
        affected: 5,
      });
    });
  });

  describe('deleteNotification', () => {
    it('应该软删除通知', async () => {
      mockNotificationUpdateMany.mockResolvedValue({ count: 1 });

      await notificationService.deleteNotification(notificationId, userId);

      expect(mockNotificationUpdateMany).toHaveBeenCalledWith({
        where: {
          id: notificationId,
          userId,
        },
        data: {
          status: 'DELETED',
        },
      });
    });
  });

  describe('getStats', () => {
    it('应该返回通知统计信息', async () => {
      mockNotificationCount
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(5) // unread
        .mockResolvedValueOnce(3) // read
        .mockResolvedValueOnce(2); // archived

      mockNotificationGroupBy
        .mockResolvedValueOnce([
          { type: 'REMINDER', _count: 5 },
          { type: 'FORGETTING_ALERT', _count: 3 },
        ])
        .mockResolvedValueOnce([
          { priority: 'NORMAL', _count: 7 },
          { priority: 'HIGH', _count: 3 },
        ]);

      const stats = await notificationService.getStats(userId);

      expect(stats).toEqual({
        total: 10,
        unread: 5,
        read: 3,
        archived: 2,
        byType: {
          REMINDER: 5,
          FORGETTING_ALERT: 3,
        },
        byPriority: {
          NORMAL: 7,
          HIGH: 3,
        },
      });
    });
  });

  describe('cleanupDeletedNotifications', () => {
    it('应该清理旧的已删除通知', async () => {
      mockNotificationDeleteMany.mockResolvedValue({ count: 15 });

      const result = await notificationService.cleanupDeletedNotifications(30);

      expect(mockNotificationDeleteMany).toHaveBeenCalledWith({
        where: {
          status: 'DELETED',
          updatedAt: { lt: expect.any(Date) },
        },
      });

      expect(result).toBe(15);
    });
  });
});
