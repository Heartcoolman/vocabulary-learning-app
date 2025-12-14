import { Router, Response } from 'express';
import { learningStateService } from '../services/learning-state.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { validateWordScoreUpdate } from '../validators/word-score.validator';

const router = Router();

// 所有路由都需要认证
router.use(authMiddleware);

/**
 * 获取指定得分范围内的单词得分
 * GET /api/word-scores/range?minScore=0&maxScore=100
 */
router.get('/range', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const minScore = req.query.minScore ? parseFloat(req.query.minScore as string) : 0;
    const maxScore = req.query.maxScore ? parseFloat(req.query.maxScore as string) : 100;

    if (minScore < 0 || maxScore > 100 || minScore > maxScore) {
      return res.status(400).json({
        success: false,
        error: '得分范围无效',
      });
    }

    const scores = await learningStateService.getWordsByScoreRange(userId, minScore, maxScore);

    res.json({
      success: true,
      data: scores,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取低分单词（需要重点学习）
 * GET /api/word-scores/low?threshold=40
 */
router.get('/low/list', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const threshold = req.query.threshold ? parseInt(req.query.threshold as string) : 40;

    // 验证threshold范围
    if (isNaN(threshold) || threshold < 0 || threshold > 100) {
      return res.status(400).json({
        success: false,
        error: 'threshold必须在0-100之间',
      });
    }

    const lowScoreWords = await learningStateService.getLowScoreWords(userId, threshold);

    res.json({
      success: true,
      data: lowScoreWords,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取高分单词（已熟练掌握）
 * GET /api/word-scores/high?threshold=80
 */
router.get('/high/list', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const threshold = req.query.threshold ? parseInt(req.query.threshold as string) : 80;

    // 验证threshold范围
    if (isNaN(threshold) || threshold < 0 || threshold > 100) {
      return res.status(400).json({
        success: false,
        error: 'threshold必须在0-100之间',
      });
    }

    const highScoreWords = await learningStateService.getHighScoreWords(userId, threshold);

    res.json({
      success: true,
      data: highScoreWords,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取用户得分统计
 * GET /api/word-scores/stats
 */
router.get('/stats/overview', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    const stats = await learningStateService.getUserScoreStats(userId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取单个单词的得分
 * GET /api/word-scores/:wordId
 */
router.get('/:wordId', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const { wordId } = req.params;

    const score = await learningStateService.getWordScore(userId, wordId);

    res.json({
      success: true,
      data: score,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 批量获取单词得分
 * POST /api/word-scores/batch
 * Body: { wordIds: string[] }
 */
router.post('/batch', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const { wordIds } = req.body;

    if (!Array.isArray(wordIds)) {
      return res.status(400).json({
        success: false,
        error: 'wordIds must be an array',
      });
    }

    // 验证数组长度限制
    if (wordIds.length > 500) {
      return res.status(400).json({
        success: false,
        error: 'wordIds数组最多允许500个元素',
      });
    }

    // 验证数组元素类型
    if (!wordIds.every((id) => typeof id === 'string' && id.length > 0)) {
      return res.status(400).json({
        success: false,
        error: 'wordIds数组元素必须是非空字符串',
      });
    }

    const scoresMap = await learningStateService.batchGetWordScores(userId, wordIds);

    const scores = Array.from(scoresMap.values());

    res.json({
      success: true,
      data: scores,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 更新单词得分
 * PUT /api/word-scores/:wordId
 */
router.put('/:wordId', validateWordScoreUpdate, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const { wordId } = req.params;
    const updateData = req.body;

    const score = await learningStateService.upsertWordScore(userId, wordId, updateData);

    res.json({
      success: true,
      data: score,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
