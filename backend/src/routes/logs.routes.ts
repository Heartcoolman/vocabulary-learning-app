/**
 * 前端日志接收路由
 *
 * 功能:
 * - 接收前端批量日志
 * - 写入后端日志系统统一管理
 * - 速率限制防止滥用
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger, createChildLogger } from '../logger';
import { optionalAuthMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();
const frontendLogger = createChildLogger({ source: 'frontend' });

// ==================== 验证 Schema ====================

const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);

const LogEntrySchema = z.object({
  level: LogLevelSchema,
  msg: z.string().max(10000),
  time: z.string(),
  app: z.string().max(100),
  env: z.string().max(50),
  module: z.string().max(100).optional(),
  context: z.record(z.unknown()).optional(),
  err: z
    .object({
      message: z.string().max(5000),
      stack: z.string().max(10000).optional(),
      name: z.string().max(200),
    })
    .optional(),
});

const BatchLogsSchema = z.object({
  logs: z.array(LogEntrySchema).max(100),
});

// ==================== 类型定义 ====================

type LogLevel = z.infer<typeof LogLevelSchema>;
type LogEntry = z.infer<typeof LogEntrySchema>;

// ==================== 日志方法映射 ====================

const LOG_METHODS: Record<LogLevel, keyof typeof frontendLogger> = {
  trace: 'trace',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'fatal',
};

// ==================== 路由处理 ====================

/**
 * POST /api/logs
 * 接收前端日志批量上报
 */
router.post('/', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { logs } = BatchLogsSchema.parse(req.body);

    // 获取客户端信息
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    // 处理每条日志
    for (const entry of logs) {
      const logMethod = LOG_METHODS[entry.level];
      const logFn = frontendLogger[logMethod] as (obj: object, msg: string) => void;

      const logContext: Record<string, unknown> = {
        clientIp,
        userAgent,
        originalTime: entry.time,
        frontendApp: entry.app,
        frontendEnv: entry.env,
        frontendModule: entry.module,
        // 如果用户已认证，添加用户信息
        userId: req.user?.id,
        username: req.user?.username,
      };

      // 合并上下文
      if (entry.context) {
        Object.assign(logContext, entry.context);
      }

      // 处理错误信息
      if (entry.err) {
        logContext.frontendError = entry.err;
      }

      logFn.call(frontendLogger, logContext, entry.msg);
    }

    res.status(202).json({
      success: true,
      received: logs.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn({ err: error, body: req.body }, '前端日志格式验证失败');
      res.status(400).json({
        success: false,
        error: '日志格式无效',
        details: error.errors,
      });
      return;
    }

    logger.error({ err: error }, '处理前端日志时发生错误');
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
    });
  }
});

/**
 * GET /api/logs/health
 * 日志端点健康检查
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export default router;
