/**
 * 徽章路由
 * 提供徽章系统API
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { Router } from 'express';
import { badgeService } from '../services/badge.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

/**
 * GET /api/badges
 * 获取用户所有徽章
 * Requirements: 3.2
 * 
 * 返回:
 * - 用户已获得的徽章列表，包含名称、描述、图标、等级、解锁时间
 */
router.get('/', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const badges = await badgeService.getUserBadges(userId);

    res.json({
      success: true,
      data: {
        badges,
        count: badges.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/badges/all
 * 获取所有徽章定义（包含用户解锁状态）
 * 
 * 返回:
 * - 所有徽章列表，包含解锁状态
 */
router.get('/all', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const badges = await badgeService.getAllBadgesWithStatus(userId);

    // 按类别分组
    const grouped = badges.reduce((acc, badge) => {
      const category = badge.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(badge);
      return acc;
    }, {} as Record<string, typeof badges>);

    res.json({
      success: true,
      data: {
        badges,
        grouped,
        totalCount: badges.length,
        unlockedCount: badges.filter(b => b.unlocked).length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/badges/:id
 * 获取徽章详情
 * Requirements: 3.5
 * 
 * 返回:
 * - 徽章详细信息，包含解锁条件和用户解锁状态
 */
router.get('/:id', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const badgeId = req.params.id;

    const badge = await badgeService.getBadgeDetails(badgeId, userId);

    if (!badge) {
      return res.status(404).json({
        success: false,
        message: '徽章不存在'
      });
    }

    res.json({
      success: true,
      data: badge
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/badges/:id/progress
 * 获取徽章进度
 * Requirements: 3.5
 * 
 * 返回:
 * - 当前进度值、目标值、完成百分比
 */
router.get('/:id/progress', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const badgeId = req.params.id;

    const progress = await badgeService.getBadgeProgress(userId, badgeId);

    if (!progress) {
      return res.status(404).json({
        success: false,
        message: '徽章不存在'
      });
    }

    res.json({
      success: true,
      data: progress
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/badges/check
 * 检查并授予新徽章
 * Requirements: 3.1, 3.3, 3.4
 * 
 * 返回:
 * - 新获得的徽章列表（如果有）
 */
router.post('/check', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const newBadges = await badgeService.checkAndAwardBadges(userId);

    res.json({
      success: true,
      data: {
        newBadges,
        hasNewBadges: newBadges.length > 0,
        message: newBadges.length > 0 
          ? `恭喜获得${newBadges.length}个新徽章！` 
          : '暂无新徽章'
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
