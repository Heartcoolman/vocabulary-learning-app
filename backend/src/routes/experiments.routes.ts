/**
 * 实验路由
 *
 * 用于A/B测试实验管理和分析
 */

import { Router } from 'express';
import { algorithmRouter } from '../amas/engine/algorithm-router';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

// 所有实验路由都需要管理员权限
router.use(authMiddleware);

// ==================== Thompson vs LinUCB 实验 ====================

/**
 * 获取实验状态和分析结果
 * GET /api/experiments/thompson-vs-linucb/status
 */
router.get('/thompson-vs-linucb/status', async (req: AuthRequest, res, next) => {
  try {
    // 仅管理员可查看
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: '需要管理员权限'
      });
    }

    const analysis = algorithmRouter.analyzeExperiment();

    res.json({
      success: true,
      data: {
        status: analysis.config.status,
        pValue: analysis.significanceTest.pValue,
        effectSize: analysis.significanceTest.effectSize,
        confidenceInterval: analysis.significanceTest.confidenceInterval,
        isSignificant: analysis.significanceTest.isSignificant,
        statisticalPower: analysis.significanceTest.statisticalPower,
        sampleSizes: analysis.variantMetrics.map(m => ({
          variantId: m.variantId,
          sampleCount: m.sampleCount
        })),
        winner: analysis.winner,
        recommendation: analysis.recommendation,
        reason: analysis.reason,
        isActive: algorithmRouter.isExperimentActive()
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取当前用户的实验变体分配
 * GET /api/experiments/my-variant
 */
router.get('/my-variant', async (req: AuthRequest, res, next) => {
  try {
    const variant = algorithmRouter.getUserVariant(req.user!.id);

    if (!variant) {
      return res.json({
        success: true,
        data: {
          enrolled: false,
          message: 'A/B测试未激活'
        }
      });
    }

    res.json({
      success: true,
      data: {
        enrolled: true,
        variantId: variant.id,
        variantName: variant.name,
        algorithm: variant.parameters.algorithm
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
