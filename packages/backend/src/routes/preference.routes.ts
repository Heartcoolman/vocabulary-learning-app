/**
 * Preference Routes
 *
 * 用户偏好设置相关路由
 */

import { Router, Response } from 'express';
import { preferenceService } from '../services/preference.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

// 所有偏好设置路由都需要认证
router.use(authMiddleware);

/**
 * GET /api/preferences
 * 获取当前用户的所有偏好设置（分组）
 */
router.get('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const preferences = await preferenceService.getGroupedPreferences(userId);

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/preferences
 * 更新用户偏好设置（支持部分更新）
 */
router.put('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const updateDto = req.body;

    await preferenceService.updatePreferences(userId, updateDto);

    const updated = await preferenceService.getGroupedPreferences(userId);

    res.json({
      success: true,
      data: updated,
      message: '偏好设置已更新',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/preferences/learning
 * 获取学习偏好设置
 */
router.get('/learning', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const preferences = await preferenceService.getLearningPreferences(userId);

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/preferences/learning
 * 更新学习偏好设置
 */
router.put('/learning', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    await preferenceService.updateLearningPreferences(userId, req.body);

    const updated = await preferenceService.getLearningPreferences(userId);

    res.json({
      success: true,
      data: updated,
      message: '学习偏好已更新',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/preferences/notification
 * 获取通知偏好设置
 */
router.get('/notification', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const preferences = await preferenceService.getNotificationPreferences(userId);

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/preferences/notification
 * 更新通知偏好设置
 */
router.put('/notification', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    await preferenceService.updateNotificationPreferences(userId, req.body);

    const updated = await preferenceService.getNotificationPreferences(userId);

    res.json({
      success: true,
      data: updated,
      message: '通知偏好已更新',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/preferences/ui
 * 获取界面偏好设置
 */
router.get('/ui', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const preferences = await preferenceService.getUIPreferences(userId);

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/preferences/ui
 * 更新界面偏好设置
 */
router.put('/ui', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    await preferenceService.updateUIPreferences(userId, req.body);

    const updated = await preferenceService.getUIPreferences(userId);

    res.json({
      success: true,
      data: updated,
      message: '界面偏好已更新',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/preferences/reset
 * 重置偏好设置为默认值
 */
router.post('/reset', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    await preferenceService.resetPreferences(userId);

    const preferences = await preferenceService.getGroupedPreferences(userId);

    res.json({
      success: true,
      data: preferences,
      message: '偏好设置已重置为默认值',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/preferences/quiet-hours/check
 * 检查当前是否在免打扰时间段
 */
router.get('/quiet-hours/check', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const isQuietTime = await preferenceService.isInQuietHours(userId);

    res.json({
      success: true,
      data: {
        isQuietTime,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
