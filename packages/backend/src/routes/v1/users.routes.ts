/**
 * v1 API - 用户管理路由
 * User Management Routes for API v1
 *
 * 提供用户信息管理、个人资料、统计数据等 RESTful API 接口
 */

import { Router, Response } from 'express';
import {
  userProfileService,
  InsufficientDataError,
  AnalysisError,
  UpdatePasswordDto,
} from '../../services/user-profile.service';
import { updatePasswordSchema } from '../../validators/auth.validator';
import { authMiddleware } from '../../middleware/auth.middleware';
import { AuthRequest } from '../../types';
import { REWARD_PROFILES, isValidProfileId } from '../../amas/config/reward-profiles';
import { logger } from '../../logger';

const router = Router();

// 所有用户路由都需要认证
router.use(authMiddleware);

/**
 * GET /api/v1/users/me
 * 获取当前用户信息
 *
 * 需要认证
 */
router.get('/me', async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await userProfileService.getUserById(req.user!.id);

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/users/me/password
 * 修改当前用户密码
 *
 * Body:
 * {
 *   oldPassword: string;
 *   newPassword: string;
 * }
 *
 * 需要认证
 */
router.put('/me/password', async (req: AuthRequest, res: Response, next) => {
  try {
    const data = updatePasswordSchema.parse(req.body) as UpdatePasswordDto;
    await userProfileService.updatePassword(req.user!.id, data);

    logger.info({ userId: req.user!.id }, '[User] 用户修改密码成功');

    res.json({
      success: true,
      message: '密码修改成功',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/users/me/statistics
 * 获取当前用户统计信息
 *
 * 返回学习数据、进度统计等
 * 需要认证
 */
router.get('/me/statistics', async (req: AuthRequest, res: Response, next) => {
  try {
    const statistics = await userProfileService.getUserStatistics(req.user!.id);

    res.json({
      success: true,
      data: statistics,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/users/me/profile
 * 获取用户完整个人资料
 *
 * 包括奖励配置、认知档案等
 * 需要认证
 */
router.get('/me/profile', async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await userProfileService.getUserById(req.user!.id);

    res.json({
      success: true,
      data: {
        id: user?.id,
        username: user?.username,
        email: user?.email,
        rewardProfile: user?.rewardProfile ?? 'standard',
        createdAt: user?.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/users/me/reward-profile
 * 获取用户奖励配置（学习模式）
 *
 * 需要认证
 */
router.get('/me/reward-profile', async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await userProfileService.getUserById(req.user!.id);
    const currentProfile = user?.rewardProfile ?? 'standard';

    res.json({
      success: true,
      data: {
        currentProfile,
        availableProfiles: Object.values(REWARD_PROFILES).map((p) => ({
          id: p.profileId,
          name: p.name,
          description: p.description,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/users/me/reward-profile
 * 更新用户奖励配置（学习模式）
 *
 * Body:
 * {
 *   profileId: 'standard' | 'cram' | 'relaxed';
 * }
 *
 * 需要认证
 */
router.put('/me/reward-profile', async (req: AuthRequest, res: Response, next) => {
  try {
    const { profileId } = req.body;

    if (!profileId || !isValidProfileId(profileId)) {
      return res.status(400).json({
        success: false,
        error: '无效的学习模式 ID。有效值: standard, cram, relaxed',
        code: 'INVALID_PROFILE_ID',
      });
    }

    await userProfileService.updateRewardProfile(req.user!.id, profileId);

    logger.info({ userId: req.user!.id, profileId }, '[User] 用户更新学习模式');

    res.json({
      success: true,
      data: {
        currentProfile: profileId,
        message: '学习模式已更新',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/users/me/chronotype
 * 获取用户昼夜节律类型（Chronotype）
 *
 * 需要认证
 */
router.get('/me/chronotype', async (req: AuthRequest, res: Response, next) => {
  try {
    const cognitiveProfile = await userProfileService.getCognitiveProfile(req.user!.id);

    res.json({
      success: true,
      data: cognitiveProfile.chronotype,
    });
  } catch (err) {
    const error = err as Error;
    if (error instanceof InsufficientDataError) {
      return res.status(400).json({
        success: false,
        error: `数据不足，无法建立档案（需要 ${(error as InsufficientDataError).required} 条记录，实际 ${(error as InsufficientDataError).actual} 条）。`,
        code: 'INSUFFICIENT_DATA',
      });
    }
    if (error instanceof AnalysisError) {
      return res.status(500).json({
        success: false,
        error: error.message,
        code: 'ANALYSIS_ERROR',
      });
    }
    logger.error({ err: error, userId: req.user!.id }, '[User] 获取昼夜节律类型失败');
    next(err);
  }
});

/**
 * GET /api/v1/users/me/learning-style
 * 获取用户学习风格
 *
 * 需要认证
 */
router.get('/me/learning-style', async (req: AuthRequest, res: Response, next) => {
  try {
    const cognitiveProfile = await userProfileService.getCognitiveProfile(req.user!.id);

    res.json({
      success: true,
      data: cognitiveProfile.learningStyle,
    });
  } catch (err) {
    const error = err as Error;
    if (error instanceof InsufficientDataError) {
      return res.status(400).json({
        success: false,
        error: `数据不足，无法建立档案（需要 ${(error as InsufficientDataError).required} 条记录，实际 ${(error as InsufficientDataError).actual} 条）。`,
        code: 'INSUFFICIENT_DATA',
      });
    }
    if (error instanceof AnalysisError) {
      return res.status(500).json({
        success: false,
        error: error.message,
        code: 'ANALYSIS_ERROR',
      });
    }
    logger.error({ err: error, userId: req.user!.id }, '[User] 获取学习风格失败');
    next(err);
  }
});

export default router;
