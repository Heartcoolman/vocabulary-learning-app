/**
 * Notification Routes
 *
 * 通知管理相关路由
 */

import { Router, Response } from 'express';
import { notificationService } from '../services/notification.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { NotificationStatus, NotificationType, NotificationPriority } from '@danci/shared/types';

const router = Router();

// 所有通知路由都需要认证
router.use(authMiddleware);

/**
 * GET /api/notifications
 * 获取当前用户的通知列表
 */
router.get('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const { status, type, priority, limit, offset, startDate, endDate } = req.query;

    const notifications = await notificationService.getNotifications(userId, {
      status: status as NotificationStatus,
      type: type as NotificationType,
      priority: priority as NotificationPriority,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/notifications/stats
 * 获取当前用户的通知统计
 */
router.get('/stats', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const stats = await notificationService.getStats(userId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/notifications/:id
 * 获取单个通知详情
 */
router.get('/:id', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const notification = await notificationService.getNotification(id, userId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: '通知不存在',
      });
    }

    res.json({
      success: true,
      data: notification,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/notifications/:id/read
 * 标记通知为已读
 */
router.put('/read-all', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const result = await notificationService.markAllAsRead(userId);

    res.json({
      success: result.success,
      data: {
        affected: result.affected,
      },
      message: `已标记 ${result.affected} 条通知为已读`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/notifications/batch/read
 * 批量标记通知为已读
 */
router.put('/batch/read', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const { notificationIds } = req.body;

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: '请提供有效的通知ID数组',
      });
    }

    const result = await notificationService.markManyAsRead(notificationIds, userId);

    res.json({
      success: result.success,
      data: {
        affected: result.affected,
      },
      message: `已标记 ${result.affected} 条通知为已读`,
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:id/read', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    await notificationService.markAsRead(id, userId);

    res.json({
      success: true,
      message: '通知已标记为已读',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/notifications/:id/archive
 * 归档通知
 */
router.put('/:id/archive', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    await notificationService.archiveNotification(id, userId);

    res.json({
      success: true,
      message: '通知已归档',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/notifications/batch
 * 批量删除通知
 */
router.delete('/batch', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const { notificationIds } = req.body;

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: '请提供有效的通知ID数组',
      });
    }

    const result = await notificationService.deleteMany(notificationIds, userId);

    res.json({
      success: result.success,
      data: {
        affected: result.affected,
      },
      message: `已删除 ${result.affected} 条通知`,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    await notificationService.deleteNotification(id, userId);

    res.json({
      success: true,
      message: '通知已删除',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
