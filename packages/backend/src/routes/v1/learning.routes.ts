/**
 * v1 API - 学习功能路由
 * Learning Features Routes for API v1
 *
 * 提供核心学习功能，包括：
 * - 获取学习单词
 * - 提交学习记录
 * - 动态单词推荐
 * - 学习进度同步
 * - 自适应难度调整
 */

import { Router, Response } from 'express';
import { masteryLearningService } from '../../services/mastery-learning.service';
import recordService from '../../services/record.service';
import { createRecordSchema, batchCreateRecordsSchema } from '../../validators/record.validator';
import { authMiddleware } from '../../middleware/auth.middleware';
import { AuthRequest } from '../../types';
import { logger } from '../../logger';

const router = Router();

// 所有学习路由需要认证
router.use(authMiddleware);

/**
 * GET /api/v1/learning/study-words
 * 获取掌握模式的学习单词
 *
 * Query:
 * - targetCount?: number   // 目标掌握数量（可选，默认使用用户配置）
 *
 * 需要认证
 */
router.get('/study-words', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const rawTargetCount = req.query.targetCount as string | undefined;
    const targetCount = rawTargetCount !== undefined ? Number(rawTargetCount) : undefined;

    if (rawTargetCount !== undefined) {
      if (!Number.isInteger(targetCount) || targetCount! <= 0) {
        return res.status(400).json({
          success: false,
          error: 'targetCount 必须是正整数',
          code: 'INVALID_TARGET_COUNT',
        });
      }
      if (targetCount! > 100) {
        return res.status(400).json({
          success: false,
          error: 'targetCount 不能超过 100',
          code: 'TARGET_COUNT_TOO_LARGE',
        });
      }
    }

    const result = await masteryLearningService.getWordsForMasteryMode(userId, targetCount);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/learning/next-words
 * 动态获取下一批学习单词（AMAS 驱动的按需加载）
 *
 * Body:
 * {
 *   currentWordIds: string[];   // 当前队列中的单词 ID
 *   masteredWordIds: string[];  // 已掌握的单词 ID
 *   sessionId: string;          // 会话 ID
 *   count?: number;             // 需要的数量，默认 3
 * }
 *
 * 需要认证
 */
router.post('/next-words', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const { currentWordIds, masteredWordIds, sessionId, count } = req.body;

    // 参数校验
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'sessionId 必填且必须是字符串',
        code: 'INVALID_SESSION_ID',
      });
    }

    if (!Array.isArray(currentWordIds) || !Array.isArray(masteredWordIds)) {
      return res.status(400).json({
        success: false,
        error: 'currentWordIds 和 masteredWordIds 必须是数组',
        code: 'INVALID_WORD_IDS',
      });
    }

    if (count !== undefined && (!Number.isInteger(count) || count <= 0 || count > 20)) {
      return res.status(400).json({
        success: false,
        error: 'count 必须是 1-20 之间的正整数',
        code: 'INVALID_COUNT',
      });
    }

    const result = await masteryLearningService.getNextWords(userId, {
      currentWordIds,
      masteredWordIds,
      sessionId,
      count,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/learning/adjust-words
 * 动态调整学习队列
 *
 * Body:
 * {
 *   sessionId: string;
 *   currentWordIds: string[];
 *   masteredWordIds: string[];
 *   userState?: { fatigue: number; attention: number; motivation: number };
 *   recentPerformance: { accuracy: number; avgResponseTime: number; consecutiveWrong: number };
 *   adjustReason: 'fatigue' | 'struggling' | 'excelling' | 'periodic';
 * }
 *
 * 需要认证
 */
router.post('/adjust-words', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const {
      sessionId,
      currentWordIds,
      masteredWordIds,
      userState,
      recentPerformance,
      adjustReason,
    } = req.body;

    // 参数校验
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'sessionId 必填且为字符串',
        code: 'INVALID_SESSION_ID',
      });
    }

    if (!Array.isArray(currentWordIds)) {
      return res.status(400).json({
        success: false,
        error: 'currentWordIds 必须是数组',
        code: 'INVALID_CURRENT_WORD_IDS',
      });
    }

    if (!Array.isArray(masteredWordIds)) {
      return res.status(400).json({
        success: false,
        error: 'masteredWordIds 必须是数组',
        code: 'INVALID_MASTERED_WORD_IDS',
      });
    }

    if (!recentPerformance || typeof recentPerformance !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'recentPerformance 必填',
        code: 'MISSING_RECENT_PERFORMANCE',
      });
    }

    const validReasons = ['fatigue', 'struggling', 'excelling', 'periodic'];
    if (!validReasons.includes(adjustReason)) {
      return res.status(400).json({
        success: false,
        error: `adjustReason 必须是 ${validReasons.join('/')}`,
        code: 'INVALID_ADJUST_REASON',
      });
    }

    // 校验 recentPerformance 字段
    const { accuracy, avgResponseTime, consecutiveWrong } = recentPerformance;
    if (typeof accuracy !== 'number' || accuracy < 0 || accuracy > 1) {
      return res.status(400).json({
        success: false,
        error: 'accuracy 必须是 0-1 之间的数值',
        code: 'INVALID_ACCURACY',
      });
    }
    if (typeof avgResponseTime !== 'number' || avgResponseTime < 0) {
      return res.status(400).json({
        success: false,
        error: 'avgResponseTime 必须是非负数',
        code: 'INVALID_AVG_RESPONSE_TIME',
      });
    }
    if (typeof consecutiveWrong !== 'number' || consecutiveWrong < 0) {
      return res.status(400).json({
        success: false,
        error: 'consecutiveWrong 必须是非负整数',
        code: 'INVALID_CONSECUTIVE_WRONG',
      });
    }

    // 校验可选的 userState
    if (userState !== undefined) {
      if (typeof userState !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'userState 格式错误',
          code: 'INVALID_USER_STATE',
        });
      }
      const { fatigue, attention, motivation } = userState;
      if (fatigue !== undefined && (typeof fatigue !== 'number' || fatigue < 0 || fatigue > 1)) {
        return res.status(400).json({
          success: false,
          error: 'fatigue 必须是 0-1 之间的数值',
          code: 'INVALID_FATIGUE',
        });
      }
      if (
        attention !== undefined &&
        (typeof attention !== 'number' || attention < 0 || attention > 1)
      ) {
        return res.status(400).json({
          success: false,
          error: 'attention 必须是 0-1 之间的数值',
          code: 'INVALID_ATTENTION',
        });
      }
      if (
        motivation !== undefined &&
        (typeof motivation !== 'number' || motivation < -1 || motivation > 1)
      ) {
        return res.status(400).json({
          success: false,
          error: 'motivation 必须是 -1 到 1 之间的数值',
          code: 'INVALID_MOTIVATION',
        });
      }
    }

    const result = await masteryLearningService.adjustWordsForUser({
      userId,
      sessionId,
      currentWordIds,
      masteredWordIds,
      userState,
      recentPerformance,
      adjustReason,
    });

    logger.info({ userId, sessionId, adjustReason }, '[Learning] 学习队列已调整');

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/learning/records
 * 提交答题记录
 *
 * Body:
 * {
 *   wordId: string;
 *   isCorrect: boolean;
 *   responseTime?: number;
 *   sessionId?: string;
 *   timestamp?: number;
 * }
 *
 * 需要认证
 */
router.post('/records', async (req: AuthRequest, res: Response, next) => {
  try {
    const data = createRecordSchema.parse(req.body);
    const record = await recordService.createRecord(req.user!.id, data);

    logger.info(
      { userId: req.user!.id, wordId: data.wordId, isCorrect: data.isCorrect },
      '[Learning] 答题记录已提交',
    );

    res.status(201).json({
      success: true,
      data: record,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/learning/records/batch
 * 批量提交答题记录
 *
 * Body:
 * {
 *   records: Array<{
 *     wordId: string;
 *     isCorrect: boolean;
 *     responseTime?: number;
 *     sessionId?: string;
 *     timestamp?: number;
 *   }>;
 * }
 *
 * 需要认证
 */
router.post('/records/batch', async (req: AuthRequest, res: Response, next) => {
  try {
    const { records } = batchCreateRecordsSchema.parse(req.body);
    const result = await recordService.batchCreateRecords(req.user!.id, records);

    logger.info({ userId: req.user!.id, count: records.length }, '[Learning] 批量答题记录已提交');

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/learning/statistics
 * 获取学习统计信息
 *
 * 需要认证
 */
router.get('/statistics', async (req: AuthRequest, res: Response, next) => {
  try {
    const statistics = await recordService.getStatistics(req.user!.id);

    res.json({
      success: true,
      data: statistics,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/learning/records
 * 获取学习记录（支持分页）
 *
 * Query:
 * - page?: number          // 页码，默认 1
 * - pageSize?: number      // 每页数量，默认 50，最大 100
 *
 * 需要认证
 */
router.get('/records', async (req: AuthRequest, res: Response, next) => {
  try {
    // 解析分页参数
    const parsedPage = req.query.page ? parseInt(req.query.page as string, 10) : NaN;
    const parsedPageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : NaN;

    const page = Number.isNaN(parsedPage) || parsedPage < 1 ? undefined : parsedPage;
    const pageSize =
      Number.isNaN(parsedPageSize) || parsedPageSize < 1 ? undefined : parsedPageSize;

    const result = await recordService.getRecordsByUserId(req.user!.id, { page, pageSize });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
