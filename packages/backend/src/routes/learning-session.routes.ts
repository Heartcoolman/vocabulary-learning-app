/**
 * v1 API - 学习会话路由（增强版）
 * Enhanced Learning Session Routes for API v1
 *
 * 提供学习会话的完整生命周期管理，包括心流检测和情绪追踪
 */

import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { learningSessionService } from '../services/learning-session.service';
import { logger } from '../logger';

const router = Router();

// 所有路由都需要认证
router.use(authMiddleware);

/**
 * POST /api/v1/learning-sessions
 * 创建新的学习会话
 *
 * Body:
 * {
 *   sessionType?: 'NORMAL' | 'SPACED_REPETITION' | 'INTENSIVE' | 'QUIZ';
 *   targetMasteryCount?: number;
 * }
 */
router.post('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const { sessionType, targetMasteryCount } = req.body;

    // 参数校验
    if (
      sessionType &&
      !['NORMAL', 'SPACED_REPETITION', 'INTENSIVE', 'QUIZ'].includes(sessionType)
    ) {
      return res.status(400).json({
        success: false,
        error: '无效的会话类型',
        code: 'INVALID_SESSION_TYPE',
      });
    }

    if (
      targetMasteryCount !== undefined &&
      (typeof targetMasteryCount !== 'number' || targetMasteryCount <= 0)
    ) {
      return res.status(400).json({
        success: false,
        error: 'targetMasteryCount 必须是正整数',
        code: 'INVALID_TARGET_COUNT',
      });
    }

    // 创建会话
    const result = await learningSessionService.createSession(userId, {
      sessionType,
      targetMasteryCount,
    });

    logger.info(
      { userId, sessionId: result.sessionId, sessionType },
      '[LearningSession] 会话已创建',
    );

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/learning-sessions/:sessionId/start
 * 启动学习会话（发布 SESSION_STARTED 事件）
 */
router.post('/:sessionId/start', async (req: AuthRequest, res: Response, next) => {
  try {
    const { sessionId } = req.params;

    await learningSessionService.startSession(sessionId);

    res.json({
      success: true,
      data: { sessionId, status: 'started' },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/learning-sessions/:sessionId/end
 * 结束学习会话（发布 SESSION_ENDED 事件）
 */
router.post('/:sessionId/end', async (req: AuthRequest, res: Response, next) => {
  try {
    const { sessionId } = req.params;

    const stats = await learningSessionService.endSession(sessionId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/learning-sessions/:sessionId/progress
 * 更新会话进度
 *
 * Body:
 * {
 *   totalQuestions?: number;
 *   actualMasteryCount?: number;
 *   flowPeakScore?: number;
 *   avgCognitiveLoad?: number;
 *   contextShifts?: number;
 * }
 */
router.put('/:sessionId/progress', async (req: AuthRequest, res: Response, next) => {
  try {
    const { sessionId } = req.params;
    const progress = req.body;

    // 参数校验
    if (progress.totalQuestions !== undefined && typeof progress.totalQuestions !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'totalQuestions 必须是数字',
        code: 'INVALID_TOTAL_QUESTIONS',
      });
    }

    if (
      progress.actualMasteryCount !== undefined &&
      typeof progress.actualMasteryCount !== 'number'
    ) {
      return res.status(400).json({
        success: false,
        error: 'actualMasteryCount 必须是数字',
        code: 'INVALID_MASTERY_COUNT',
      });
    }

    if (
      progress.flowPeakScore !== undefined &&
      (typeof progress.flowPeakScore !== 'number' ||
        progress.flowPeakScore < 0 ||
        progress.flowPeakScore > 1)
    ) {
      return res.status(400).json({
        success: false,
        error: 'flowPeakScore 必须是 0-1 之间的数字',
        code: 'INVALID_FLOW_SCORE',
      });
    }

    if (
      progress.avgCognitiveLoad !== undefined &&
      (typeof progress.avgCognitiveLoad !== 'number' ||
        progress.avgCognitiveLoad < 0 ||
        progress.avgCognitiveLoad > 1)
    ) {
      return res.status(400).json({
        success: false,
        error: 'avgCognitiveLoad 必须是 0-1 之间的数字',
        code: 'INVALID_COGNITIVE_LOAD',
      });
    }

    await learningSessionService.updateProgress(sessionId, progress);

    res.json({
      success: true,
      data: { sessionId, updated: true },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/learning-sessions/:sessionId
 * 获取会话统计数据
 */
router.get('/:sessionId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { sessionId } = req.params;

    const stats = await learningSessionService.getSessionStats(sessionId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/learning-sessions/:sessionId/detail
 * 获取会话详情（含答题记录）
 */
router.get('/:sessionId/detail', async (req: AuthRequest, res: Response, next) => {
  try {
    const { sessionId } = req.params;

    const detail = await learningSessionService.getSessionDetail(sessionId);

    res.json({
      success: true,
      data: detail,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/learning-sessions/active
 * 获取用户的活跃会话
 */
router.get('/user/active', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;

    const session = await learningSessionService.getActiveSession(userId);

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/learning-sessions
 * 获取用户的会话列表
 *
 * Query:
 * - limit?: number        // 限制数量，默认 20
 * - offset?: number       // 偏移量，默认 0
 * - includeActive?: boolean  // 是否包含活跃会话，默认 false
 */
router.get('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const includeActive = req.query.includeActive === 'true';

    const sessions = await learningSessionService.getUserSessions(userId, {
      limit: Math.min(100, Math.max(1, limit)),
      offset: Math.max(0, offset),
      includeActive,
    });

    const total = await learningSessionService.getUserSessionCount(userId, includeActive);

    res.json({
      success: true,
      data: sessions,
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/learning-sessions/:sessionId/flow
 * 触发心流检测
 *
 * Body:
 * {
 *   challengeLevel: number;  // 挑战水平 (0-1)
 *   skillLevel: number;      // 技能水平 (0-1)
 *   concentration: number;   // 专注度 (0-1)
 * }
 */
router.post('/:sessionId/flow', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const { sessionId } = req.params;
    const { challengeLevel, skillLevel, concentration } = req.body;

    // 参数校验
    if (typeof challengeLevel !== 'number' || challengeLevel < 0 || challengeLevel > 1) {
      return res.status(400).json({
        success: false,
        error: 'challengeLevel 必须是 0-1 之间的数字',
        code: 'INVALID_CHALLENGE_LEVEL',
      });
    }

    if (typeof skillLevel !== 'number' || skillLevel < 0 || skillLevel > 1) {
      return res.status(400).json({
        success: false,
        error: 'skillLevel 必须是 0-1 之间的数字',
        code: 'INVALID_SKILL_LEVEL',
      });
    }

    if (typeof concentration !== 'number' || concentration < 0 || concentration > 1) {
      return res.status(400).json({
        success: false,
        error: 'concentration 必须是 0-1 之间的数字',
        code: 'INVALID_CONCENTRATION',
      });
    }

    const flowScore = await learningSessionService.detectFlow(sessionId, userId, {
      challengeLevel,
      skillLevel,
      concentration,
    });

    res.json({
      success: true,
      data: { sessionId, flowScore },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/learning-sessions/:sessionId/emotion
 * 追踪情绪事件
 *
 * Body:
 * {
 *   type: 'answer' | 'pause' | 'resume' | 'end';
 *   isCorrect?: boolean;
 *   responseTime?: number;
 * }
 */
router.post('/:sessionId/emotion', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const { sessionId } = req.params;
    const { type, isCorrect, responseTime } = req.body;

    // 参数校验
    if (!['answer', 'pause', 'resume', 'end'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: '无效的事件类型',
        code: 'INVALID_EVENT_TYPE',
      });
    }

    await learningSessionService.trackEmotion(sessionId, userId, {
      type,
      isCorrect,
      responseTime,
    });

    res.json({
      success: true,
      data: { sessionId, tracked: true },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
