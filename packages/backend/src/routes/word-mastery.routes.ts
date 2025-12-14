/**
 * 单词掌握度评估路由
 *
 * API端点:
 * - GET  /api/word-mastery/:wordId          获取单词掌握度评估
 * - POST /api/word-mastery/batch            批量获取掌握度评估
 * - GET  /api/word-mastery/:wordId/trace    获取复习历史轨迹
 * - GET  /api/word-mastery/stats            获取用户整体掌握统计
 * - GET  /api/word-mastery/:wordId/interval 预测最佳复习间隔
 *
 * 前端页面: src/pages/WordMasteryPage.tsx
 * 路由配置: App.tsx -> /word-mastery
 * API方法: ApiClient.ts -> getWordMasteryStats, batchProcessWordMastery 等
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { learningStateService } from '../services/learning-state.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateParams, validateBody, validateQuery } from '../middleware/validate.middleware';
import { AuthRequest } from '../types';

const router = Router();

// 所有路由都需要认证
router.use(authMiddleware);

// ==================== 常量 ====================

/** 批量请求最大数量限制 */
const MAX_BATCH_SIZE = 100;

/** 默认轨迹查询限制 */
const DEFAULT_TRACE_LIMIT = 50;

// ==================== Zod Schemas ====================

/** wordId 参数验证 */
const wordIdParamSchema = z.object({
  wordId: z
    .string()
    .min(1, 'wordId不能为空')
    .transform((val) => val.trim()),
});

/** 单词评估查询参数验证 */
const wordEvaluationQuerySchema = z.object({
  userFatigue: z.coerce.number().min(0).max(1).optional(),
});

/** 批量评估请求体验证 */
const batchEvaluationBodySchema = z.object({
  wordIds: z
    .array(z.string().min(1, '单词ID不能为空'))
    .min(1, 'wordIds必须是非空数组')
    .max(MAX_BATCH_SIZE, `wordIds数组不能超过${MAX_BATCH_SIZE}个元素`),
  userFatigue: z.coerce.number().min(0).max(1).optional(),
});

/** 轨迹查询参数验证 */
const traceQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(DEFAULT_TRACE_LIMIT),
});

/** 复习间隔查询参数验证 */
const intervalQuerySchema = z.object({
  targetRecall: z.coerce.number().min(0.01).max(1).default(0.9),
});

// ==================== 辅助函数 ====================

/**
 * 安全获取用户ID，认证失败返回401
 */
const getUserIdOr401 = (req: AuthRequest, res: Response): string | null => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return null;
  }
  return req.user.id;
};

// ==================== 静态路由（必须在参数路由之前） ====================

/**
 * 获取用户整体掌握统计
 * GET /api/word-mastery/stats
 */
router.get('/stats', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserIdOr401(req, res);
    if (!userId) return;

    const stats = await learningStateService.getUserMasteryStats(userId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 批量获取掌握度评估
 * POST /api/word-mastery/batch
 * Body: { wordIds: string[], userFatigue?: number }
 */
router.post(
  '/batch',
  validateBody(batchEvaluationBodySchema),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = getUserIdOr401(req, res);
      if (!userId) return;

      const { wordIds, userFatigue } = req.validatedBody as z.infer<
        typeof batchEvaluationBodySchema
      >;

      // 去重并规范化
      const uniqueIds = Array.from(new Set(wordIds.map((id: string) => id.trim())));
      const evaluations = await learningStateService.batchEvaluateWords(
        userId,
        uniqueIds,
        userFatigue,
      );

      res.json({
        success: true,
        data: evaluations,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ==================== 参数路由 ====================

/**
 * 获取单词掌握度评估
 * GET /api/word-mastery/:wordId
 * Query: userFatigue (optional)
 */
router.get(
  '/:wordId',
  validateParams(wordIdParamSchema),
  validateQuery(wordEvaluationQuerySchema),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = getUserIdOr401(req, res);
      if (!userId) return;

      const { wordId } = req.validatedParams as z.infer<typeof wordIdParamSchema>;
      const { userFatigue } = req.validatedQuery as z.infer<typeof wordEvaluationQuerySchema>;

      const evaluation = await learningStateService.evaluateWord(userId, wordId, userFatigue);

      res.json({
        success: true,
        data: evaluation,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * 获取复习历史轨迹
 * GET /api/word-mastery/:wordId/trace
 * Query: limit (optional, default 50)
 */
router.get(
  '/:wordId/trace',
  validateParams(wordIdParamSchema),
  validateQuery(traceQuerySchema),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = getUserIdOr401(req, res);
      if (!userId) return;

      const { wordId } = req.validatedParams as z.infer<typeof wordIdParamSchema>;
      const { limit } = req.validatedQuery as z.infer<typeof traceQuerySchema>;

      const trace = await learningStateService.getMemoryTrace(userId, wordId, limit);

      res.json({
        success: true,
        data: {
          wordId,
          trace,
          count: trace.length,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * 预测最佳复习间隔
 * GET /api/word-mastery/:wordId/interval
 * Query: targetRecall (optional, default 0.9)
 */
router.get(
  '/:wordId/interval',
  validateParams(wordIdParamSchema),
  validateQuery(intervalQuerySchema),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = getUserIdOr401(req, res);
      if (!userId) return;

      const { wordId } = req.validatedParams as z.infer<typeof wordIdParamSchema>;
      const { targetRecall } = req.validatedQuery as z.infer<typeof intervalQuerySchema>;

      const interval = await learningStateService.predictInterval(userId, wordId, targetRecall);

      res.json({
        success: true,
        data: {
          wordId,
          interval,
          humanReadable: {
            optimal: formatInterval(interval.optimalSeconds),
            min: formatInterval(interval.minSeconds),
            max: formatInterval(interval.maxSeconds),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ==================== 辅助函数 ====================

/**
 * 将秒数格式化为人类可读的时间间隔
 */
function formatInterval(seconds: number): string {
  if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return `${minutes} 分钟`;
  }
  if (seconds < 86400) {
    const hours = Math.round(seconds / 3600);
    return `${hours} 小时`;
  }
  const days = Math.round(seconds / 86400);
  return `${days} 天`;
}

export default router;
