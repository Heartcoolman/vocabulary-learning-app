/**
 * Learning Objectives Routes
 * 学习目标管理API路由
 */

import { Router } from 'express';
import { LearningObjectivesService } from '../services/learning-objectives.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { LearningObjectiveMode } from '../amas/types';

const router = Router();

/**
 * GET /api/learning-objectives
 * 获取用户学习目标配置
 */
router.get('/', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const objectives = await LearningObjectivesService.getUserObjectives(userId);

    if (!objectives) {
      return res.status(404).json({
        success: false,
        message: '用户学习目标未配置'
      });
    }

    res.json({
      success: true,
      data: objectives
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/learning-objectives
 * 更新用户学习目标配置
 */
router.put('/', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const {
      mode,
      primaryObjective,
      minAccuracy,
      maxDailyTime,
      targetRetention,
      weightShortTerm,
      weightLongTerm,
      weightEfficiency
    } = req.body;

    const objectives = await LearningObjectivesService.upsertUserObjectives({
      userId,
      mode,
      primaryObjective,
      minAccuracy,
      maxDailyTime,
      targetRetention,
      weightShortTerm,
      weightLongTerm,
      weightEfficiency
    });

    res.json({
      success: true,
      data: objectives
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/learning-objectives/switch-mode
 * 快速切换学习模式
 */
router.post('/switch-mode', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const { mode, reason } = req.body;

    if (!['exam', 'daily', 'travel', 'custom'].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: '无效的学习模式'
      });
    }

    const objectives = await LearningObjectivesService.switchMode(
      userId,
      mode as LearningObjectiveMode,
      reason || 'manual'
    );

    res.json({
      success: true,
      data: objectives,
      message: `已切换到${mode}模式`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/learning-objectives/suggestions
 * 获取模式建议
 */
router.get('/suggestions', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const suggestions = await LearningObjectivesService.getSuggestions(userId);

    res.json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/learning-objectives/history
 * 获取目标切换历史
 */
router.get('/history', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

    const history = await LearningObjectivesService.getObjectiveHistory(userId, limit);

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/learning-objectives
 * 删除用户学习目标配置
 */
router.delete('/', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    await LearningObjectivesService.deleteUserObjectives(userId);

    res.json({
      success: true,
      message: '学习目标配置已删除'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
