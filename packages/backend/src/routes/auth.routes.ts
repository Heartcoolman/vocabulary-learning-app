import { Router, Request, Response } from 'express';
import authService from '../services/auth.service';
import { registerSchema, loginSchema } from '../validators/auth.validator';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

// 注册
router.post('/register', async (req: Request, res: Response, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const result = await authService.register(data);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// 登录
router.post('/login', async (req: Request, res: Response, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// 退出登录
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || '';
    await authService.logout(token);

    res.json({
      success: true,
      message: '退出登录成功',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
