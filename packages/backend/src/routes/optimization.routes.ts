/**
 * 优化API路由
 * 提供超参数优化的HTTP接口（仅管理员）
 */

import { Router } from 'express';
import { optimizationService } from '../services/optimization.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { AuthRequest } from '../types';

const router = Router();

/**
 * GET /api/optimization/suggest
 * 获取下一个推荐参数组合
 */
router.get(
  '/suggest',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const params = optimizationService.suggestNextParams();

      res.json({
        success: true,
        data: {
          params,
          paramSpace: optimizationService.getParamSpace()
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/optimization/evaluate
 * 记录参数评估结果
 */
router.post(
  '/evaluate',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const { params, value } = req.body;

      if (!params || typeof params !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'params 必须是对象'
        });
      }

      if (typeof value !== 'number' || isNaN(value)) {
        return res.status(400).json({
          success: false,
          error: 'value 必须是有效的数字'
        });
      }

      await optimizationService.recordEvaluation(params, value);

      res.json({
        success: true,
        data: { recorded: true }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/optimization/best
 * 获取当前最优参数
 */
router.get(
  '/best',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const best = optimizationService.getBestParams();

      res.json({
        success: true,
        data: best
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/optimization/history
 * 获取优化历史
 */
router.get(
  '/history',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const history = optimizationService.getOptimizationHistory();

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/optimization/trigger
 * 手动触发优化周期
 */
router.post(
  '/trigger',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const result = await optimizationService.runOptimizationCycle();

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/optimization/reset
 * 重置优化器状态
 */
router.post(
  '/reset',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      await optimizationService.resetOptimizer();

      res.json({
        success: true,
        data: { reset: true }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/optimization/diagnostics
 * 获取优化器诊断信息
 */
router.get(
  '/diagnostics',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const diagnostics = optimizationService.getDiagnostics();

      res.json({
        success: true,
        data: diagnostics
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/optimization/param-space
 * 获取参数空间定义
 */
router.get(
  '/param-space',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const paramSpace = optimizationService.getParamSpace();

      res.json({
        success: true,
        data: paramSpace
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
