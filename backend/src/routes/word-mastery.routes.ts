/**
 * 单词掌握度评估路由
 *
 * API端点:
 * - GET  /api/word-mastery/:wordId          获取单词掌握度评估
 * - POST /api/word-mastery/batch            批量获取掌握度评估
 * - GET  /api/word-mastery/:wordId/trace    获取复习历史轨迹
 * - GET  /api/word-mastery/stats            获取用户整体掌握统计
 * - GET  /api/word-mastery/:wordId/interval 预测最佳复习间隔
 */

import { Router, Response, NextFunction } from 'express';
import { wordMasteryService } from '../services/word-mastery.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

// 所有路由都需要认证
router.use(authMiddleware);

// ==================== 常量 ====================

/** 批量请求最大数量限制 */
const MAX_BATCH_SIZE = 100;

/** 默认轨迹查询限制 */
const DEFAULT_TRACE_LIMIT = 50;

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

/**
 * 校验并规范化 wordId 参数
 */
const ensureWordId = (wordId: string | undefined, res: Response): string | null => {
  const normalized = wordId?.trim();
  if (!normalized) {
    res.status(400).json({ success: false, error: 'wordId is required' });
    return null;
  }
  return normalized;
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

    const stats = await wordMasteryService.getUserMasteryStats(userId);

    res.json({
      success: true,
      data: stats
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
router.post('/batch', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserIdOr401(req, res);
    if (!userId) return;

    const { wordIds, userFatigue } = req.body;

    // 验证 wordIds 是非空数组
    if (!Array.isArray(wordIds) || wordIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'wordIds must be a non-empty array'
      });
    }

    // 验证数组长度上限
    if (wordIds.length > MAX_BATCH_SIZE) {
      return res.status(400).json({
        success: false,
        error: `wordIds array exceeds maximum size of ${MAX_BATCH_SIZE}`
      });
    }

    // 验证所有元素都是非空字符串
    if (!wordIds.every((id: unknown) => typeof id === 'string' && id.toString().trim())) {
      return res.status(400).json({
        success: false,
        error: 'wordIds must contain only non-empty strings'
      });
    }

    // 验证 userFatigue（如果提供）
    let fatigue: number | undefined;
    if (userFatigue !== undefined) {
      const parsedFatigue = Number(userFatigue);
      if (isNaN(parsedFatigue) || parsedFatigue < 0 || parsedFatigue > 1) {
        return res.status(400).json({
          success: false,
          error: 'userFatigue must be a number between 0 and 1'
        });
      }
      fatigue = parsedFatigue;
    }

    // 去重并规范化
    const uniqueIds = Array.from(new Set(wordIds.map((id: string) => id.trim())));
    const evaluations = await wordMasteryService.batchEvaluateWords(userId, uniqueIds, fatigue);

    res.json({
      success: true,
      data: evaluations
    });
  } catch (error) {
    next(error);
  }
});

// ==================== 参数路由 ====================

/**
 * 获取单词掌握度评估
 * GET /api/word-mastery/:wordId
 * Query: userFatigue (optional)
 */
router.get('/:wordId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserIdOr401(req, res);
    if (!userId) return;

    const wordId = ensureWordId(req.params.wordId, res);
    if (!wordId) return;

    // 可选的用户疲劳度参数
    let userFatigue: number | undefined;
    if (req.query.userFatigue !== undefined) {
      const parsed = Number(req.query.userFatigue);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        userFatigue = parsed;
      }
    }

    const evaluation = await wordMasteryService.evaluateWord(userId, wordId, userFatigue);

    res.json({
      success: true,
      data: evaluation
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取复习历史轨迹
 * GET /api/word-mastery/:wordId/trace
 * Query: limit (optional, default 50)
 */
router.get('/:wordId/trace', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserIdOr401(req, res);
    if (!userId) return;

    const wordId = ensureWordId(req.params.wordId, res);
    if (!wordId) return;

    // 可选的限制参数
    let limit = DEFAULT_TRACE_LIMIT;
    if (req.query.limit !== undefined) {
      const parsed = parseInt(req.query.limit as string, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
        limit = parsed;
      }
    }

    const trace = await wordMasteryService.getMemoryTrace(userId, wordId, limit);

    res.json({
      success: true,
      data: {
        wordId,
        trace,
        count: trace.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 预测最佳复习间隔
 * GET /api/word-mastery/:wordId/interval
 * Query: targetRecall (optional, default 0.9)
 */
router.get('/:wordId/interval', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserIdOr401(req, res);
    if (!userId) return;

    const wordId = ensureWordId(req.params.wordId, res);
    if (!wordId) return;

    // 可选的目标提取概率参数
    let targetRecall = 0.9;
    if (req.query.targetRecall !== undefined) {
      const parsed = Number(req.query.targetRecall);
      if (!isNaN(parsed) && parsed > 0 && parsed < 1) {
        targetRecall = parsed;
      }
    }

    const interval = await wordMasteryService.predictInterval(userId, wordId, targetRecall);

    res.json({
      success: true,
      data: {
        wordId,
        interval,
        humanReadable: {
          optimal: formatInterval(interval.optimalSeconds),
          min: formatInterval(interval.minSeconds),
          max: formatInterval(interval.maxSeconds)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

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
