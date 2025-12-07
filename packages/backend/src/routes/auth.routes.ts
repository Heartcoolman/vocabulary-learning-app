import { Router, Request, Response, CookieOptions } from 'express';
import authService from '../services/auth.service';
import { registerSchema, loginSchema } from '../validators/auth.validator';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { env } from '../config/env';

const router = Router();

/**
 * HttpOnly Cookie 配置
 * - httpOnly: 防止 JavaScript 访问，缓解 XSS 攻击
 * - secure: 生产环境仅通过 HTTPS 传输
 * - sameSite: 防止 CSRF 攻击
 * - maxAge: 与 JWT 过期时间一致
 */
const AUTH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  path: '/'
};

// 注册
router.post('/register', async (req: Request, res: Response, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const result = await authService.register(data);

    // 设置 HttpOnly Cookie
    res.cookie('auth_token', result.token, AUTH_COOKIE_OPTIONS);

    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        // 仍返回 token 以保持向后兼容，前端可选择使用
        token: result.token,
        // 保留 expiresIn 字段（如果服务返回了）
        ...(('expiresIn' in result) ? { expiresIn: (result as { expiresIn?: number }).expiresIn } : {})
      },
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

    // 设置 HttpOnly Cookie
    res.cookie('auth_token', result.token, AUTH_COOKIE_OPTIONS);

    res.json({
      success: true,
      data: {
        user: result.user,
        // 仍返回 token 以保持向后兼容，前端可选择使用
        token: result.token,
        // 保留 expiresIn 字段（如果服务返回了）
        ...(('expiresIn' in result) ? { expiresIn: (result as { expiresIn?: number }).expiresIn } : {})
      },
    });
  } catch (error) {
    next(error);
  }
});

// 退出登录
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response, next) => {
  try {
    // 从 cookie 或 header 获取 token
    const token = req.cookies?.auth_token || req.headers.authorization?.replace('Bearer ', '') || '';
    await authService.logout(token);

    // 清除 cookie
    res.clearCookie('auth_token', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    res.json({
      success: true,
      message: '退出登录成功',
    });
  } catch (error) {
    next(error);
  }
});

export default router;

