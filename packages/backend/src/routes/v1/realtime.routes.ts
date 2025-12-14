import { Router, Response } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import type { AuthRequest, RealtimeEvent } from '@danci/shared/types';
import realtimeService from '../../services/realtime.service';
import { logger } from '../../logger';

const router = Router();

/**
 * SSE 实时通道端点
 *
 * GET /api/v1/realtime/sessions/:sessionId/stream
 *
 * 建立 Server-Sent Events 连接，接收实时事件推送
 *
 * 查询参数：
 * - eventTypes: 可选，逗号分隔的事件类型列表，用于过滤事件
 *
 * @example
 * GET /api/v1/realtime/sessions/session_123/stream
 * GET /api/v1/realtime/sessions/session_123/stream?eventTypes=feedback,alert
 */
router.get(
  '/sessions/:sessionId/stream',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const { sessionId } = req.params;
    const userId = req.user!.id;

    // 解析事件类型过滤器
    const eventTypesParam = req.query.eventTypes as string | undefined;
    const allowedEventTypes: Array<RealtimeEvent['type']> = [
      'feedback',
      'alert',
      'flow-update',
      'next-suggestion',
      'forgetting-alert',
      'ping',
      'error',
    ];

    const eventTypes = eventTypesParam
      ? eventTypesParam
          .split(',')
          .map((v) => v.trim())
          .filter((v): v is RealtimeEvent['type'] =>
            allowedEventTypes.includes(v as RealtimeEvent['type']),
          )
      : undefined;

    logger.info(
      {
        userId,
        sessionId,
        eventTypes,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      },
      'SSE connection established',
    );

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲

    // 发送初始连接事件
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    res.write(
      realtimeService.formatSSEMessage(
        {
          type: 'ping',
          payload: {
            timestamp: new Date().toISOString(),
          },
        },
        connectionId,
      ),
    );

    // 订阅实时事件
    const unsubscribe = realtimeService.subscribe(
      {
        userId,
        sessionId,
        eventTypes,
      },
      (event) => {
        try {
          // 发送事件给客户端
          const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          res.write(realtimeService.formatSSEMessage(event, messageId));
        } catch (error) {
          logger.error(
            { err: error, userId, sessionId, eventType: event.type },
            'Error writing SSE message',
          );
        }
      },
    );

    // 心跳机制（每 30 秒发送一次 ping）
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(
          realtimeService.formatSSEMessage({
            type: 'ping',
            payload: {
              timestamp: new Date().toISOString(),
            },
          }),
        );
      } catch (error) {
        logger.error({ err: error, userId, sessionId }, 'Error sending heartbeat');
        clearInterval(heartbeatInterval);
      }
    }, 30000);

    // 客户端断开连接时清理
    req.on('close', () => {
      clearInterval(heartbeatInterval);
      unsubscribe();
      logger.info({ userId, sessionId }, 'SSE connection closed');
    });

    // 处理错误
    req.on('error', (error) => {
      logger.error({ err: error, userId, sessionId }, 'SSE connection error');
      clearInterval(heartbeatInterval);
      unsubscribe();
    });
  },
);

/**
 * 获取实时服务统计信息
 *
 * GET /api/v1/realtime/stats
 *
 * 需要认证
 */
router.get('/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const stats = realtimeService.getStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error getting realtime stats');
    res.status(500).json({
      success: false,
      error: '获取统计信息失败',
      code: 'STATS_ERROR',
    });
  }
});

/**
 * 测试端点：发送测试事件
 *
 * POST /api/v1/realtime/test
 *
 * 用于测试 SSE 连接
 * 仅开发环境可用
 */
if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
  router.post('/test', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { sessionId, eventType, payload } = req.body;

      if (!sessionId || !eventType || !payload) {
        return res.status(400).json({
          success: false,
          error: '缺少必需参数',
          code: 'MISSING_PARAMS',
        });
      }

      // 发送测试事件
      await realtimeService.sendToUser(userId, {
        type: eventType,
        payload,
      });

      res.json({
        success: true,
        message: '测试事件已发送',
      });
    } catch (error) {
      logger.error({ err: error }, 'Error sending test event');
      res.status(500).json({
        success: false,
        error: '发送测试事件失败',
        code: 'TEST_ERROR',
      });
    }
  });
}

export default router;
