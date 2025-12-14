/**
 * Notification Service
 *
 * 职责：
 * - 管理用户通知的CRUD操作
 * - 支持通知状态管理（未读、已读、归档）
 * - 提供通知统计功能
 * - 集成EventBus订阅遗忘预警事件
 * - 可选：通过RealtimeService推送SSE通知
 */

import {
  PrismaClient,
  NotificationType as PrismaNotificationType,
  NotificationStatus as PrismaNotificationStatus,
  NotificationPriority as PrismaNotificationPriority,
} from '@prisma/client';
import type {
  Notification,
  CreateNotificationDto,
  NotificationQueryParams,
  NotificationStats,
  NotificationBatchResult,
  NotificationType,
  NotificationStatus,
  NotificationPriority,
} from '@danci/shared/types';
import { NotificationType as SharedNotificationType } from '@danci/shared/types';
import prisma from '../config/database';
import { serviceLogger } from '../logger';
import { getEventBus } from '../core/event-bus';
import { decisionEventsService } from './decision-events.service';
import type { ForgettingRiskPayload } from '../core/event-bus';
import { realtimeService } from './realtime.service';

const logger = serviceLogger.child({ module: 'notification-service' });

/**
 * 通知服务类
 */
class NotificationService {
  private initialized = false;

  constructor(private prisma: PrismaClient) {
    logger.info('NotificationService initialized');
  }

  /**
   * 初始化服务（注册EventBus订阅）
   * 应该在应用启动时调用一次
   */
  initialize(): void {
    if (this.initialized) {
      logger.warn('NotificationService already initialized');
      return;
    }

    try {
      const eventBus = getEventBus(decisionEventsService);

      // 订阅遗忘风险预警事件
      eventBus.subscribe<ForgettingRiskPayload>(
        'FORGETTING_RISK_HIGH',
        async (payload) => {
          await this.handleForgettingRiskAlert(payload);
        },
        {
          subscriberId: 'notification-service-forgetting-alert',
          async: true,
        },
      );

      this.initialized = true;
      logger.info('NotificationService subscribed to EventBus events');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize NotificationService');
      throw error;
    }
  }

  /**
   * 处理遗忘风险预警事件
   */
  private async handleForgettingRiskAlert(payload: ForgettingRiskPayload): Promise<void> {
    try {
      // 检查用户是否启用了遗忘预警通知
      const preferences = await this.prisma.userPreference.findUnique({
        where: { userId: payload.userId },
        select: { enableForgettingAlerts: true },
      });

      if (preferences && !preferences.enableForgettingAlerts) {
        logger.debug({ userId: payload.userId }, 'User has disabled forgetting alerts');
        return;
      }

      // 获取单词信息
      const word = await this.prisma.word.findUnique({
        where: { id: payload.wordId },
        select: { spelling: true, meanings: true },
      });

      if (!word) {
        logger.warn({ wordId: payload.wordId }, 'Word not found for forgetting alert');
        return;
      }

      // 创建通知
      const notification = await this.sendNotification({
        userId: payload.userId,
        type: SharedNotificationType.FORGETTING_ALERT,
        title: '遗忘预警',
        content: `单词 "${word.spelling}" 可能会被遗忘，建议尽快复习。`,
        priority:
          payload.riskLevel === 'high'
            ? ('HIGH' as NotificationPriority)
            : ('NORMAL' as NotificationPriority),
        metadata: {
          wordId: payload.wordId,
          wordSpelling: word.spelling,
          recallProbability: payload.recallProbability,
          riskLevel: payload.riskLevel,
          suggestedReviewDate: payload.suggestedReviewDate.toISOString(),
        },
      });

      logger.info(
        { userId: payload.userId, wordId: payload.wordId, notificationId: notification.id },
        'Forgetting alert notification created',
      );

      // 通过SSE推送实时通知
      await this.pushRealtimeNotification(notification);
    } catch (error) {
      logger.error({ error, payload }, 'Failed to handle forgetting risk alert');
    }
  }

  /**
   * 发送通知
   *
   * @param dto - 创建通知DTO
   * @returns 创建的通知
   */
  async sendNotification(dto: CreateNotificationDto): Promise<Notification> {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId: dto.userId,
          type: dto.type as PrismaNotificationType,
          title: dto.title,
          content: dto.content,
          priority: (dto.priority || 'NORMAL') as PrismaNotificationPriority,
          status: 'UNREAD' as PrismaNotificationStatus,
          metadata: dto.metadata ? (dto.metadata as any) : {},
        },
      });

      logger.debug(
        { userId: dto.userId, type: dto.type, notificationId: notification.id },
        'Notification sent',
      );

      return this.mapToNotification(notification);
    } catch (error) {
      logger.error({ error, dto }, 'Failed to send notification');
      throw error;
    }
  }

  /**
   * 获取用户通知列表
   *
   * @param userId - 用户ID
   * @param params - 查询参数
   * @returns 通知列表
   */
  async getNotifications(
    userId: string,
    params: NotificationQueryParams = {},
  ): Promise<Notification[]> {
    try {
      const { status, type, priority, limit = 50, offset = 0, startDate, endDate } = params;

      const where: any = {
        userId,
        status: { not: 'DELETED' as PrismaNotificationStatus },
      };

      if (status) {
        where.status = status as PrismaNotificationStatus;
      }
      if (type) {
        where.type = type as PrismaNotificationType;
      }
      if (priority) {
        where.priority = priority as PrismaNotificationPriority;
      }
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = startDate;
        if (endDate) where.createdAt.lte = endDate;
      }

      const notifications = await this.prisma.notification.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      });

      return notifications.map((n) => this.mapToNotification(n));
    } catch (error) {
      logger.error({ error, userId, params }, 'Failed to get notifications');
      throw error;
    }
  }

  /**
   * 获取单个通知
   *
   * @param notificationId - 通知ID
   * @param userId - 用户ID（用于权限验证）
   * @returns 通知详情
   */
  async getNotification(notificationId: string, userId: string): Promise<Notification | null> {
    try {
      const notification = await this.prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId,
        },
      });

      return notification ? this.mapToNotification(notification) : null;
    } catch (error) {
      logger.error({ error, notificationId, userId }, 'Failed to get notification');
      throw error;
    }
  }

  /**
   * 标记通知为已读
   *
   * @param notificationId - 通知ID
   * @param userId - 用户ID
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    try {
      await this.prisma.notification.updateMany({
        where: {
          id: notificationId,
          userId,
        },
        data: {
          status: 'READ' as PrismaNotificationStatus,
          readAt: new Date(),
        },
      });

      logger.debug({ notificationId, userId }, 'Notification marked as read');
    } catch (error) {
      logger.error({ error, notificationId, userId }, 'Failed to mark notification as read');
      throw error;
    }
  }

  /**
   * 批量标记为已读
   *
   * @param notificationIds - 通知ID数组
   * @param userId - 用户ID
   */
  async markManyAsRead(
    notificationIds: string[],
    userId: string,
  ): Promise<NotificationBatchResult> {
    try {
      const result = await this.prisma.notification.updateMany({
        where: {
          id: { in: notificationIds },
          userId,
        },
        data: {
          status: 'READ' as PrismaNotificationStatus,
          readAt: new Date(),
        },
      });

      logger.debug({ count: result.count, userId }, 'Notifications marked as read');

      return {
        success: true,
        affected: result.count,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to mark notifications as read');
      return {
        success: false,
        affected: 0,
        errors: [(error as Error).message],
      };
    }
  }

  /**
   * 标记所有通知为已读
   *
   * @param userId - 用户ID
   */
  async markAllAsRead(userId: string): Promise<NotificationBatchResult> {
    try {
      const result = await this.prisma.notification.updateMany({
        where: {
          userId,
          status: 'UNREAD' as PrismaNotificationStatus,
        },
        data: {
          status: 'READ' as PrismaNotificationStatus,
          readAt: new Date(),
        },
      });

      logger.info({ count: result.count, userId }, 'All notifications marked as read');

      return {
        success: true,
        affected: result.count,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to mark all notifications as read');
      return {
        success: false,
        affected: 0,
        errors: [(error as Error).message],
      };
    }
  }

  /**
   * 归档通知
   *
   * @param notificationId - 通知ID
   * @param userId - 用户ID
   */
  async archiveNotification(notificationId: string, userId: string): Promise<void> {
    try {
      await this.prisma.notification.updateMany({
        where: {
          id: notificationId,
          userId,
        },
        data: {
          status: 'ARCHIVED' as PrismaNotificationStatus,
        },
      });

      logger.debug({ notificationId, userId }, 'Notification archived');
    } catch (error) {
      logger.error({ error, notificationId, userId }, 'Failed to archive notification');
      throw error;
    }
  }

  /**
   * 删除通知（软删除）
   *
   * @param notificationId - 通知ID
   * @param userId - 用户ID
   */
  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    try {
      await this.prisma.notification.updateMany({
        where: {
          id: notificationId,
          userId,
        },
        data: {
          status: 'DELETED' as PrismaNotificationStatus,
        },
      });

      logger.debug({ notificationId, userId }, 'Notification deleted');
    } catch (error) {
      logger.error({ error, notificationId, userId }, 'Failed to delete notification');
      throw error;
    }
  }

  /**
   * 批量删除通知
   *
   * @param notificationIds - 通知ID数组
   * @param userId - 用户ID
   */
  async deleteMany(notificationIds: string[], userId: string): Promise<NotificationBatchResult> {
    try {
      const result = await this.prisma.notification.updateMany({
        where: {
          id: { in: notificationIds },
          userId,
        },
        data: {
          status: 'DELETED' as PrismaNotificationStatus,
        },
      });

      logger.debug({ count: result.count, userId }, 'Notifications deleted');

      return {
        success: true,
        affected: result.count,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to delete notifications');
      return {
        success: false,
        affected: 0,
        errors: [(error as Error).message],
      };
    }
  }

  /**
   * 获取通知统计
   *
   * @param userId - 用户ID
   * @returns 通知统计信息
   */
  async getStats(userId: string): Promise<NotificationStats> {
    try {
      const [total, unread, read, archived, byTypeRaw, byPriorityRaw] = await Promise.all([
        this.prisma.notification.count({
          where: { userId, status: { not: 'DELETED' as PrismaNotificationStatus } },
        }),
        this.prisma.notification.count({
          where: { userId, status: 'UNREAD' as PrismaNotificationStatus },
        }),
        this.prisma.notification.count({
          where: { userId, status: 'READ' as PrismaNotificationStatus },
        }),
        this.prisma.notification.count({
          where: { userId, status: 'ARCHIVED' as PrismaNotificationStatus },
        }),
        this.prisma.notification.groupBy({
          by: ['type'],
          where: { userId, status: { not: 'DELETED' as PrismaNotificationStatus } },
          _count: true,
        }),
        this.prisma.notification.groupBy({
          by: ['priority'],
          where: { userId, status: { not: 'DELETED' as PrismaNotificationStatus } },
          _count: true,
        }),
      ]);

      const byType = byTypeRaw.reduce(
        (acc, item) => {
          acc[item.type as NotificationType] = item._count;
          return acc;
        },
        {} as Record<NotificationType, number>,
      );

      const byPriority = byPriorityRaw.reduce(
        (acc, item) => {
          acc[item.priority as NotificationPriority] = item._count;
          return acc;
        },
        {} as Record<NotificationPriority, number>,
      );

      return {
        total,
        unread,
        read,
        archived,
        byType,
        byPriority,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get notification stats');
      throw error;
    }
  }

  /**
   * 清理已删除的旧通知（物理删除）
   *
   * @param daysOld - 删除多少天前的通知
   * @returns 删除的通知数量
   */
  async cleanupDeletedNotifications(daysOld = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await this.prisma.notification.deleteMany({
        where: {
          status: 'DELETED' as PrismaNotificationStatus,
          updatedAt: { lt: cutoffDate },
        },
      });

      logger.info({ count: result.count, daysOld }, 'Deleted notifications cleaned up');

      return result.count;
    } catch (error) {
      logger.error({ error, daysOld }, 'Failed to cleanup deleted notifications');
      throw error;
    }
  }

  /**
   * 推送实时通知到前端（通过SSE）
   */
  private async pushRealtimeNotification(notification: Notification): Promise<void> {
    try {
      if (notification.type === SharedNotificationType.FORGETTING_ALERT) {
        const metadata = (notification.metadata ?? {}) as Record<string, unknown>;

        const wordId = typeof metadata.wordId === 'string' ? metadata.wordId : '';
        const word = typeof metadata.wordSpelling === 'string' ? metadata.wordSpelling : '';
        const recallProbability =
          typeof metadata.recallProbability === 'number' ? metadata.recallProbability : 0;
        const riskLevelRaw = typeof metadata.riskLevel === 'string' ? metadata.riskLevel : 'medium';
        const riskLevel: 'high' | 'medium' | 'low' =
          riskLevelRaw === 'high' || riskLevelRaw === 'medium' || riskLevelRaw === 'low'
            ? riskLevelRaw
            : 'medium';
        const suggestedReviewTime =
          typeof metadata.suggestedReviewDate === 'string'
            ? metadata.suggestedReviewDate
            : undefined;

        await realtimeService.sendToUser(notification.userId, {
          type: 'forgetting-alert',
          payload: {
            alertId: notification.id,
            wordId,
            word,
            predictedForgetAt: suggestedReviewTime ?? notification.createdAt.toISOString(),
            recallProbability,
            riskLevel,
            suggestedReviewTime,
            message: notification.content,
            timestamp: notification.createdAt.toISOString(),
          },
        });

        logger.debug(
          { notificationId: notification.id, userId: notification.userId },
          'Realtime forgetting-alert pushed',
        );
        return;
      }

      await realtimeService.sendToUser(notification.userId, {
        type: 'alert',
        payload: {
          alertId: notification.id,
          alertType: this.mapNotificationTypeToAlertType(notification.type),
          title: notification.title,
          content: notification.content,
          timestamp: notification.createdAt.toISOString(),
          priority: this.mapNotificationPriorityToRealtimePriority(notification.priority),
        },
      });

      logger.debug(
        { notificationId: notification.id, userId: notification.userId },
        'Realtime notification pushed',
      );
    } catch (error) {
      logger.error({ error, notification }, 'Failed to push realtime notification');
      // 不抛出错误，SSE推送失败不应该影响通知创建
    }
  }

  /**
   * 映射通知类型到警报类型
   */
  private mapNotificationTypeToAlertType(
    type: NotificationType,
  ): 'warning' | 'info' | 'success' | 'error' {
    switch (type) {
      case 'FORGETTING_ALERT':
        return 'warning';
      case 'ACHIEVEMENT':
      case 'MILESTONE':
      case 'STREAK':
        return 'success';
      case 'SYSTEM':
        return 'info';
      default:
        return 'info';
    }
  }

  private mapNotificationPriorityToRealtimePriority(
    priority: NotificationPriority,
  ): 'low' | 'medium' | 'high' {
    const value = String(priority);
    if (value === 'LOW') return 'low';
    if (value === 'HIGH' || value === 'URGENT') return 'high';
    return 'medium';
  }

  /**
   * 映射Prisma通知到DTO
   */
  private mapToNotification(notification: any): Notification {
    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type as NotificationType,
      title: notification.title,
      content: notification.content,
      status: notification.status as NotificationStatus,
      priority: notification.priority as NotificationPriority,
      metadata: notification.metadata as Record<string, unknown> | undefined,
      readAt: notification.readAt || undefined,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    };
  }
}

// 导出单例
export const notificationService = new NotificationService(prisma);

/**
 * 初始化通知服务
 * 应该在应用启动时调用
 */
export function initializeNotificationService(): void {
  notificationService.initialize();
}

export default notificationService;
