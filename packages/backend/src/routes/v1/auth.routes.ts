/**
 * v1 API - 认证路由
 * Authentication Routes for API v1
 *
 * 提供用户认证相关的 RESTful API 接口
 */

import { Router, Request, Response, CookieOptions } from 'express';
import authService from '../../services/auth.service';
import { registerSchema, loginSchema } from '../../validators/auth.validator';
import { authMiddleware } from '../../middleware/auth.middleware';
import { AuthRequest } from '../../types';
import { env } from '../../config/env';
import { logger } from '../../logger';

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
  path: '/',
};

/**
 * POST /api/v1/auth/register
 * 用户注册
 *
 * Body:
 * {
 *   username: string;
 *   password: string;
 *   email?: string;
 * }
 */
router.post('/register', async (req: Request, res: Response, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const result = await authService.register(data);

    // 设置 HttpOnly Cookie
    res.cookie('auth_token', result.token, AUTH_COOKIE_OPTIONS);

    logger.info({ userId: result.user.id }, '[Auth] 用户注册成功');

    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        token: result.token,
        ...('expiresIn' in result
          ? { expiresIn: (result as { expiresIn?: number }).expiresIn }
          : {}),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/login
 * 用户登录
 *
 * Body:
 * {
 *   username: string;
 *   password: string;
 * }
 */
router.post('/login', async (req: Request, res: Response, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data);

    // 设置 HttpOnly Cookie
    res.cookie('auth_token', result.token, AUTH_COOKIE_OPTIONS);

    logger.info({ userId: result.user.id }, '[Auth] 用户登录成功');

    res.json({
      success: true,
      data: {
        user: result.user,
        token: result.token,
        ...('expiresIn' in result
          ? { expiresIn: (result as { expiresIn?: number }).expiresIn }
          : {}),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/logout
 * 用户登出
 *
 * 需要认证
 */
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response, next) => {
  try {
    // 从 cookie 或 header 获取 token
    const token =
      req.cookies?.auth_token || req.headers.authorization?.replace('Bearer ', '') || '';
    await authService.logout(token);

    // 清除 cookie
    res.clearCookie('auth_token', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    logger.info({ userId: req.user?.id }, '[Auth] 用户登出成功');

    res.json({
      success: true,
      message: '退出登录成功',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/auth/verify
 * 验证当前登录状态
 *
 * 需要认证
 */
router.get('/verify', authMiddleware, async (req: AuthRequest, res: Response, next) => {
  try {
    res.json({
      success: true,
      data: {
        user: req.user,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
