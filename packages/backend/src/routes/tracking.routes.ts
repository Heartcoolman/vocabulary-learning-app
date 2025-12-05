/**
 * 埋点数据路由
 *
 * 接收前端上报的交互事件数据，用于学习风格精准建模
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware';
import { trackingService, EventBatch } from '../services/tracking.service';
import { AuthRequest } from '../types';
import { logger } from '../logger';

const router = Router();
const trackingLogger = logger.child({ module: 'tracking-routes' });

/**
 * POST /api/tracking/events
 * 接收批量埋点事件
 *
 * Body:
 * - events: TrackingEvent[] - 事件数组
 * - sessionId: string - 会话ID
 * - timestamp: number - 批次时间戳
 *
 * Query:
 * - token: string (可选) - 用于 sendBeacon 请求的认证
 */
router.post(
  '/events',
  // 支持 query 中的 token（用于 sendBeacon）
  async (req: Request, res: Response, next: NextFunction) => {
    // 如果 query 中有 token，添加到 header
    const queryToken = req.query.token as string;
    if (queryToken && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${queryToken}`;
    }
    next();
  },
  optionalAuthMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;

      // 未登录用户的事件暂时丢弃（或可以存储为匿名事件）
      if (!userId) {
        return res.status(200).json({
          success: true,
          message: 'Events received (anonymous, not stored)',
        });
      }

      const batch: EventBatch = req.body;

      // 验证请求体
      if (!batch || !Array.isArray(batch.events)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body: events array required',
        });
      }

      if (!batch.sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body: sessionId required',
        });
      }

      // 限制批量大小
      if (batch.events.length > 100) {
        return res.status(400).json({
          success: false,
          error: 'Too many events in batch (max 100)',
        });
      }

      // 处理事件
      await trackingService.processBatch(userId, batch);

      res.status(200).json({
        success: true,
        message: `Processed ${batch.events.length} events`,
      });
    } catch (error) {
      trackingLogger.error({ err: error }, 'Failed to process tracking events');
      next(error);
    }
  }
);

/**
 * GET /api/tracking/stats
 * 获取当前用户的交互统计
 */
router.get(
  '/stats',
  authMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      const stats = await trackingService.getUserInteractionStats(userId);

      res.json({
        success: true,
        data: stats || {
          pronunciationClicks: 0,
          pauseCount: 0,
          pageSwitchCount: 0,
          totalInteractions: 0,
          totalSessionDuration: 0,
          lastActivityTime: null,
        },
      });
    } catch (error) {
      trackingLogger.error({ err: error }, 'Failed to get tracking stats');
      next(error);
    }
  }
);

/**
 * GET /api/tracking/auditory-preference
 * 获取用户听觉偏好得分（用于学习风格分析）
 */
router.get(
  '/auditory-preference',
  authMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      const score = await trackingService.calculateAuditoryPreference(userId);

      res.json({
        success: true,
        data: {
          score,
          interpretation:
            score > 0.7
              ? 'strong_auditory'
              : score > 0.4
                ? 'moderate_auditory'
                : 'low_auditory',
        },
      });
    } catch (error) {
      trackingLogger.error({ err: error }, 'Failed to get auditory preference');
      next(error);
    }
  }
);

/**
 * GET /api/tracking/recent
 * 获取用户最近的交互事件
 */
router.get(
  '/recent',
  authMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      const events = await trackingService.getRecentEvents(userId, limit);

      res.json({
        success: true,
        data: {
          events,
          count: events.length,
        },
      });
    } catch (error) {
      trackingLogger.error({ err: error }, 'Failed to get recent events');
      next(error);
    }
  }
);

export default router;
