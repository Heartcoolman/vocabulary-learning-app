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

    res.json(result);
  } catch (error) {
    console.error('[Learning Routes] 获取学习单词失败:', error);
    res.status(500).json({
      error: '获取学习单词失败',
      message: error instanceof Error ? error.message : '未知错误'
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

    res.json({ success: true });
  } catch (error) {
    console.error('[Learning Routes] 同步进度失败:', error);
    res.status(500).json({
      error: '同步进度失败',
      message: error instanceof Error ? error.message : '未知错误'
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

    res.json({ sessionId: newSessionId });
  } catch (error) {
    console.error('[Learning Routes] 创建会话失败:', error);
    res.status(500).json({
      error: '创建会话失败',
      message: error instanceof Error ? error.message : '未知错误'
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

    res.json(progress);
  } catch (error) {
    console.error('[Learning Routes] 获取会话进度失败:', error);
    res.status(500).json({
      error: '获取会话进度失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

export default router;
