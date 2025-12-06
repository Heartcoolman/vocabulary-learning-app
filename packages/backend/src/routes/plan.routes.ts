/**
 * 学习计划路由
 * 提供智能学习计划生成和管理API
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { Router } from 'express';
import { planGeneratorService } from '../services/plan-generator.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

/**
 * GET /api/plan
 * 获取当前学习计划
 * Requirements: 4.1, 4.4
 * 
 * 返回:
 * - 学习计划详情，包含每日目标、周里程碑、预计完成日期、词书分配
 */
router.get('/', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const plan = await planGeneratorService.getCurrentPlan(userId);

    if (!plan) {
      return res.json({
        success: true,
        data: null,
        message: '暂无学习计划，请先生成计划'
      });
    }

    res.json({
      success: true,
      data: {
        id: plan.id,
        dailyTarget: plan.dailyTarget,
        totalWords: plan.totalWords,
        estimatedCompletionDate: plan.estimatedCompletionDate.toISOString(),
        wordbookDistribution: plan.wordbookDistribution,
        weeklyMilestones: plan.weeklyMilestones,
        isActive: plan.isActive,
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/plan/generate
 * 生成学习计划
 * Requirements: 4.1, 4.2, 4.4, 4.5
 * 
 * Body参数:
 * - targetDays: 目标天数（可选）
 * - dailyTarget: 每日目标单词数（可选）
 * - wordbookIds: 词书ID列表（可选）
 * 
 * 返回:
 * - 生成的学习计划
 */
router.post('/generate', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const { targetDays, dailyTarget, wordbookIds } = req.body;

    // 修复：完整的参数验证
    // 验证targetDays
    if (targetDays !== undefined) {
      if (typeof targetDays !== 'number' || !Number.isInteger(targetDays) || targetDays < 1 || targetDays > 365) {
        return res.status(400).json({
          success: false,
          message: '目标天数必须是1-365之间的整数'
        });
      }
    }

    // 验证dailyTarget
    if (dailyTarget !== undefined) {
      if (typeof dailyTarget !== 'number' || !Number.isInteger(dailyTarget) || dailyTarget < 1 || dailyTarget > 200) {
        return res.status(400).json({
          success: false,
          message: '每日目标必须是1-200之间的整数'
        });
      }
    }

    // 验证wordbookIds：类型、长度上限、元素类型
    if (wordbookIds !== undefined) {
      if (!Array.isArray(wordbookIds)) {
        return res.status(400).json({
          success: false,
          message: 'wordbookIds必须是数组'
        });
      }
      // 限制数组长度，防止资源耗尽
      const MAX_WORDBOOK_IDS = 50;
      if (wordbookIds.length > MAX_WORDBOOK_IDS) {
        return res.status(400).json({
          success: false,
          message: `wordbookIds数组长度不能超过${MAX_WORDBOOK_IDS}`
        });
      }
      // 验证每个元素都是非空字符串
      const invalidIds = wordbookIds.filter(id => typeof id !== 'string' || id.trim().length === 0);
      if (invalidIds.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'wordbookIds数组元素必须是非空字符串'
        });
      }
    }

    const plan = await planGeneratorService.generatePlan(userId, {
      targetDays,
      dailyTarget,
      wordbookIds
    });

    res.json({
      success: true,
      data: {
        id: plan.id,
        dailyTarget: plan.dailyTarget,
        totalWords: plan.totalWords,
        estimatedCompletionDate: plan.estimatedCompletionDate.toISOString(),
        wordbookDistribution: plan.wordbookDistribution,
        weeklyMilestones: plan.weeklyMilestones,
        isActive: plan.isActive,
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString()
      },
      message: '学习计划已生成'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/plan/progress
 * 获取计划进度
 * Requirements: 4.3, 4.4
 * 
 * 返回:
 * - 今日完成数、今日目标、周进度、总进度、是否按计划、偏差值
 */
router.get('/progress', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const progress = await planGeneratorService.updatePlanProgress(userId);

    res.json({
      success: true,
      data: {
        completedToday: progress.completedToday,
        targetToday: progress.targetToday,
        weeklyProgress: Math.round(progress.weeklyProgress * 100) / 100,
        overallProgress: Math.round(progress.overallProgress * 100) / 100,
        onTrack: progress.onTrack,
        deviation: Math.round(progress.deviation * 1000) / 1000,
        status: progress.onTrack 
          ? '按计划进行中' 
          : progress.deviation > 0 
            ? '进度超前' 
            : '进度落后'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/plan/adjust
 * 手动调整计划
 * Requirements: 4.3
 * 
 * Body参数:
 * - reason: 调整原因（可选）
 * 
 * 返回:
 * - 调整后的学习计划
 */
router.put('/adjust', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const { reason } = req.body;

    const adjustedPlan = await planGeneratorService.adjustPlan(
      userId, 
      reason || '用户手动调整'
    );

    res.json({
      success: true,
      data: {
        id: adjustedPlan.id,
        dailyTarget: adjustedPlan.dailyTarget,
        totalWords: adjustedPlan.totalWords,
        estimatedCompletionDate: adjustedPlan.estimatedCompletionDate.toISOString(),
        wordbookDistribution: adjustedPlan.wordbookDistribution,
        weeklyMilestones: adjustedPlan.weeklyMilestones,
        isActive: adjustedPlan.isActive,
        updatedAt: adjustedPlan.updatedAt.toISOString()
      },
      message: '学习计划已调整'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
