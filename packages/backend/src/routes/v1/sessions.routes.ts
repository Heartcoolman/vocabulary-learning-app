/**
 * v1 API - 学习会话管理路由
 * Learning Sessions Management Routes for API v1
 *
 * 提供学习会话的创建、查询、进度追踪等 RESTful API 接口
 */

import { Router, Response } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { AuthRequest } from '../../types';
import { masteryLearningService } from '../../services/mastery-learning.service';
import recordService from '../../services/record.service';
import { logger } from '../../logger';

const router = Router();

// 所有会话路由都需要认证
router.use(authMiddleware);

/**
 * POST /api/v1/sessions
 * 创建或获取学习会话
 *
 * Body:
 * {
 *   targetMasteryCount: number;   // 目标掌握数量
 *   sessionId?: string;           // 可选，复用已有会话
 * }
 *
 * 需要认证
 */
router.post('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const { targetMasteryCount, sessionId } = req.body;

    // 参数校验
    if (typeof targetMasteryCount !== 'number' || targetMasteryCount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'targetMasteryCount 必须是正整数',
        code: 'INVALID_TARGET_COUNT',
      });
    }

    if (targetMasteryCount > 100) {
      return res.status(400).json({
        success: false,
        error: 'targetMasteryCount 不能超过 100',
        code: 'TARGET_COUNT_TOO_LARGE',
      });
    }

    const newSessionId = await masteryLearningService.ensureLearningSession(
      userId,
      targetMasteryCount,
      sessionId,
    );

    logger.info(
      { userId, sessionId: newSessionId, targetMasteryCount },
      '[Session] 学习会话已创建',
    );

    res.status(201).json({
      success: true,
      data: {
        sessionId: newSessionId,
        targetMasteryCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/sessions/:sessionId
 * 获取学习会话详情和进度
 *
 * 需要认证
 */
router.get('/:sessionId', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId 参数必填',
        code: 'MISSING_SESSION_ID',
      });
    }

    const progress = await masteryLearningService.getSessionProgress(sessionId, userId);

    res.json({
      success: true,
      data: progress,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/sessions/:sessionId/progress
 * 同步学习会话进度
 *
 * Body:
 * {
 *   actualMasteryCount: number;  // 实际掌握数量
 *   totalQuestions: number;       // 总题目数量
 * }
 *
 * 需要认证
 */
router.put('/:sessionId/progress', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const { sessionId } = req.params;
    const { actualMasteryCount, totalQuestions } = req.body;

    // 参数校验
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId 参数必填',
        code: 'MISSING_SESSION_ID',
      });
    }

    if (typeof actualMasteryCount !== 'number' || typeof totalQuestions !== 'number') {
      return res.status(400).json({
        success: false,
        error: '进度数据格式错误',
        code: 'INVALID_PROGRESS_DATA',
      });
    }

    // 校验数值有效性：禁止 NaN、负数、Infinity
    if (
      !Number.isFinite(actualMasteryCount) ||
      !Number.isFinite(totalQuestions) ||
      actualMasteryCount < 0 ||
      totalQuestions < 0
    ) {
      return res.status(400).json({
        success: false,
        error: '进度数据必须是有效的非负数',
        code: 'INVALID_PROGRESS_VALUE',
      });
    }

    // 校验整数
    if (!Number.isInteger(actualMasteryCount) || !Number.isInteger(totalQuestions)) {
      return res.status(400).json({
        success: false,
        error: '进度数据必须是整数',
        code: 'PROGRESS_MUST_BE_INTEGER',
      });
    }

    await masteryLearningService.syncSessionProgress(sessionId, userId, {
      actualMasteryCount,
      totalQuestions,
    });

    logger.info(
      { userId, sessionId, actualMasteryCount, totalQuestions },
      '[Session] 学习进度已同步',
    );

    res.json({
      success: true,
      data: {
        synced: true,
        actualMasteryCount,
        totalQuestions,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/sessions/:sessionId/records
 * 获取学习会话的答题记录
 *
 * Query:
 * - page?: number          // 页码，默认 1
 * - pageSize?: number      // 每页数量，默认 50，最大 100
 *
 * 需要认证
 */
router.get('/:sessionId/records', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId 参数必填',
        code: 'MISSING_SESSION_ID',
      });
    }

    // 解析分页参数
    const parsedPage = req.query.page ? parseInt(req.query.page as string, 10) : NaN;
    const parsedPageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : NaN;

    const page = Number.isNaN(parsedPage) || parsedPage < 1 ? undefined : parsedPage;
    const pageSize =
      Number.isNaN(parsedPageSize) || parsedPageSize < 1 ? undefined : parsedPageSize;

    // 获取该会话的所有记录
    const result = await recordService.getRecordsByUserId(userId, { page, pageSize });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/sessions
 * 获取用户的所有学习会话（可选：仅活跃会话）
 *
 * Query:
 * - active?: boolean       // 是否仅返回活跃会话，默认 false
 * - page?: number          // 页码，默认 1
 * - pageSize?: number      // 每页数量，默认 20，最大 100
 *
 * 需要认证
 */
router.get('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const activeOnly = req.query.active === 'true';
    const parsedPage = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const parsedPageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20;

    const page = Math.max(1, parsedPage);
    const pageSize = Math.min(100, Math.max(1, parsedPageSize));

    // 这里需要实现获取用户所有会话的逻辑
    // 由于当前 masteryLearningService 没有提供该方法，我们返回一个占位响应
    // TODO: 实现 getUserSessions 方法
    logger.warn({ userId, activeOnly }, '[Session] 获取用户会话列表功能待实现');

    res.json({
      success: true,
      data: [],
      pagination: {
        page,
        pageSize,
        total: 0,
        totalPages: 0,
      },
      message: '此功能待实现',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
