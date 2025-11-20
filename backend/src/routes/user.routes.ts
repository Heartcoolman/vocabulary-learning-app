import { Router, Response } from 'express';
import userService from '../services/user.service';
import { updatePasswordSchema } from '../validators/auth.validator';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

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

export default router;
