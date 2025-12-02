/**
 * 学习路由
 * Learning Routes for Mastery-Based Learning
 */

import { Router, Response } from 'express';
import { masteryLearningService } from '../services/mastery-learning.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

/**
 * GET /api/learning/study-words
 * 获取掌握模式的学习单词
 *
 * Query参数:
 * - targetCount?: number - 目标掌握数量(可选,默认使用用户配置)
 */
router.get('/study-words', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: '未授权' });
    }

    const rawTargetCount = req.query.targetCount as string | undefined;
    const targetCount = rawTargetCount !== undefined ? Number(rawTargetCount) : undefined;

    if (rawTargetCount !== undefined) {
      if (!Number.isInteger(targetCount) || targetCount! <= 0) {
        return res.status(400).json({ error: 'targetCount 必须是正整数' });
      }
      if (targetCount! > 100) {
        return res.status(400).json({ error: 'targetCount 不能超过100' });
      }
    }

    const result = await masteryLearningService.getWordsForMasteryMode(
      userId,
      targetCount
    );

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Learning Routes] 获取学习单词失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取学习单词失败'
    });
  }
});

/**
 * POST /api/learning/next-words
 * 动态获取下一批学习单词（AMAS驱动的按需加载）
 *
 * Body:
 * {
 *   currentWordIds: string[];   // 当前队列中的单词ID
 *   masteredWordIds: string[];  // 已掌握的单词ID
 *   sessionId: string;          // 会话ID
 *   count?: number;             // 需要的数量，默认3
 * }
 */
router.post('/next-words', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: '未授权' });
    }

    const { currentWordIds, masteredWordIds, sessionId, count } = req.body;

    // 参数校验
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ success: false, error: 'sessionId 必填且必须是字符串' });
    }

    if (!Array.isArray(currentWordIds) || !Array.isArray(masteredWordIds)) {
      return res.status(400).json({
        success: false,
        error: 'currentWordIds 和 masteredWordIds 必须是数组'
      });
    }

    if (count !== undefined && (!Number.isInteger(count) || count <= 0 || count > 20)) {
      return res.status(400).json({
        success: false,
        error: 'count 必须是1-20之间的正整数'
      });
    }

    const result = await masteryLearningService.getNextWords(userId, {
      currentWordIds,
      masteredWordIds,
      sessionId,
      count
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Learning Routes] 动态获取单词失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取下一批单词失败'
    });
  }
});

/**
 * POST /api/learning/sync-progress
 * 同步学习会话进度
 *
 * Body:
 * {
 *   sessionId: string;
 *   actualMasteryCount: number;
 *   totalQuestions: number;
 * }
 */
router.post('/sync-progress', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: '未授权' });
    }

    const { sessionId, actualMasteryCount, totalQuestions } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId 必填' });
    }

    if (typeof actualMasteryCount !== 'number' || typeof totalQuestions !== 'number') {
      return res.status(400).json({ error: '进度数据格式错误' });
    }

    // 校验数值有效性：禁止 NaN、负数、Infinity
    if (
      !Number.isFinite(actualMasteryCount) ||
      !Number.isFinite(totalQuestions) ||
      actualMasteryCount < 0 ||
      totalQuestions < 0
    ) {
      return res.status(400).json({ error: '进度数据必须是有效的非负数' });
    }

    // 校验整数
    if (!Number.isInteger(actualMasteryCount) || !Number.isInteger(totalQuestions)) {
      return res.status(400).json({ error: '进度数据必须是整数' });
    }

    await masteryLearningService.syncSessionProgress(sessionId, userId, {
      actualMasteryCount,
      totalQuestions
    });

    res.json({ success: true, data: { synced: true } });
  } catch (error) {
    console.error('[Learning Routes] 同步进度失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '同步进度失败'
    });
  }
});

/**
 * POST /api/learning/session
 * 创建或获取学习会话
 *
 * Body:
 * {
 *   targetMasteryCount: number;
 *   sessionId?: string;
 * }
 */
router.post('/session', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: '未授权' });
    }

    const { targetMasteryCount, sessionId } = req.body;

    if (typeof targetMasteryCount !== 'number' || targetMasteryCount <= 0) {
      return res.status(400).json({ error: 'targetMasteryCount 必须是正整数' });
    }

    if (targetMasteryCount > 100) {
      return res.status(400).json({ error: 'targetMasteryCount 不能超过100' });
    }

    const newSessionId = await masteryLearningService.ensureLearningSession(
      userId,
      targetMasteryCount,
      sessionId
    );

    res.json({ success: true, data: { sessionId: newSessionId } });
  } catch (error) {
    console.error('[Learning Routes] 创建会话失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '创建会话失败'
    });
  }
});

/**
 * GET /api/learning/session/:sessionId
 * 获取学习会话进度
 */
router.get('/session/:sessionId', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: '未授权' });
    }

    const { sessionId } = req.params;

    const progress = await masteryLearningService.getSessionProgress(sessionId, userId);

    res.json({ success: true, data: progress });
  } catch (error) {
    console.error('[Learning Routes] 获取会话进度失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取会话进度失败'
    });
  }
});

/**
 * POST /api/learning/adjust-words
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
 */
router.post('/adjust-words', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: '未授权' });
    }

    const {
      sessionId,
      currentWordIds,
      masteredWordIds,
      userState,
      recentPerformance,
      adjustReason
    } = req.body;

    // 参数校验
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId 必填且为字符串' });
    }

    if (!Array.isArray(currentWordIds)) {
      return res.status(400).json({ error: 'currentWordIds 必须是数组' });
    }

    if (!Array.isArray(masteredWordIds)) {
      return res.status(400).json({ error: 'masteredWordIds 必须是数组' });
    }

    if (!recentPerformance || typeof recentPerformance !== 'object') {
      return res.status(400).json({ error: 'recentPerformance 必填' });
    }

    const validReasons = ['fatigue', 'struggling', 'excelling', 'periodic'];
    if (!validReasons.includes(adjustReason)) {
      return res.status(400).json({ error: `adjustReason 必须是 ${validReasons.join('/')}` });
    }

    // 校验 recentPerformance 字段
    const { accuracy, avgResponseTime, consecutiveWrong } = recentPerformance;
    if (typeof accuracy !== 'number' || accuracy < 0 || accuracy > 1) {
      return res.status(400).json({ error: 'accuracy 必须是 0-1 之间的数值' });
    }
    if (typeof avgResponseTime !== 'number' || avgResponseTime < 0) {
      return res.status(400).json({ error: 'avgResponseTime 必须是非负数' });
    }
    if (typeof consecutiveWrong !== 'number' || consecutiveWrong < 0) {
      return res.status(400).json({ error: 'consecutiveWrong 必须是非负整数' });
    }

    // 校验可选的 userState
    if (userState !== undefined) {
      if (typeof userState !== 'object') {
        return res.status(400).json({ error: 'userState 格式错误' });
      }
      const { fatigue, attention, motivation } = userState;
      if (fatigue !== undefined && (typeof fatigue !== 'number' || fatigue < 0 || fatigue > 1)) {
        return res.status(400).json({ error: 'fatigue 必须是 0-1 之间的数值' });
      }
      if (attention !== undefined && (typeof attention !== 'number' || attention < 0 || attention > 1)) {
        return res.status(400).json({ error: 'attention 必须是 0-1 之间的数值' });
      }
      if (motivation !== undefined && (typeof motivation !== 'number' || motivation < -1 || motivation > 1)) {
        return res.status(400).json({ error: 'motivation 必须是 -1 到 1 之间的数值' });
      }
    }

    const result = await masteryLearningService.adjustWordsForUser({
      userId,
      sessionId,
      currentWordIds,
      masteredWordIds,
      userState,
      recentPerformance,
      adjustReason
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Learning Routes] 调整队列失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '调整队列失败'
    });
  }
});

export default router;
