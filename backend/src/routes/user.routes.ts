import { Router, Response } from 'express';
import userService from '../services/user.service';
import { updatePasswordSchema } from '../validators/auth.validator';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { REWARD_PROFILES, isValidProfileId } from '../amas/config/reward-profiles';
import { ChronotypeDetector } from '../amas/modeling/chronotype';
import { LearningStyleProfiler } from '../amas/modeling/learning-style';

const router = Router();

// 所有用户路由都需要认证
router.use(authMiddleware);

// 获取当前用户信息
router.get('/me', async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await userService.getUserById(req.user!.id);

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

// 修改密码
router.put('/me/password', async (req: AuthRequest, res: Response, next) => {
  try {
    const data = updatePasswordSchema.parse(req.body);
    await userService.updatePassword(req.user!.id, data);

    res.json({
      success: true,
      message: '密码修改成功',
    });
  } catch (error) {
    next(error);
  }
});

// 获取用户统计信息
router.get('/me/statistics', async (req: AuthRequest, res: Response, next) => {
  try {
    const statistics = await userService.getUserStatistics(req.user!.id);

    res.json({
      success: true,
      data: statistics,
    });
  } catch (error) {
    next(error);
  }
});

// 获取用户奖励配置（学习模式）
router.get('/profile/reward', async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await userService.getUserById(req.user!.id);
    const currentProfile = user?.rewardProfile ?? 'standard';

    res.json({
      success: true,
      data: {
        currentProfile,
        availableProfiles: Object.values(REWARD_PROFILES).map(p => ({
          id: p.profileId,
          name: p.name,
          description: p.description
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

// 更新用户奖励配置（学习模式）
router.put('/profile/reward', async (req: AuthRequest, res: Response, next) => {
  try {
    const { profileId } = req.body;

    if (!profileId || !isValidProfileId(profileId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid profile ID. Valid values: standard, cram, relaxed'
      });
    }

    await userService.updateRewardProfile(req.user!.id, profileId);

    res.json({
      success: true,
      data: {
        currentProfile: profileId,
        message: '学习模式已更新'
      }
    });
  } catch (error) {
    next(error);
  }
});

// 获取用户Chronotype（昼夜节律类型）
router.get('/profile/chronotype', async (req: AuthRequest, res: Response, next) => {
  try {
    const detector = new ChronotypeDetector();
    const profile = await detector.analyzeChronotype(req.user!.id);

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    next(error);
  }
});

// 获取用户学习风格
router.get('/profile/learning-style', async (req: AuthRequest, res: Response, next) => {
  try {
    const profiler = new LearningStyleProfiler();
    const profile = await profiler.detectLearningStyle(req.user!.id);

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    next(error);
  }
});

export default router;
