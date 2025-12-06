/**
 * 评估API路由
 * 提供因果推断的HTTP接口
 */

import { Router } from 'express';
import { evaluationService } from '../services/evaluation.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { AuthRequest } from '../types';

const router = Router();

// ==================== 验证常量 ====================

const MAX_FEATURES_LENGTH = 100;
const MAX_FEATURE_VALUE = 1e6;

// ==================== 因果推断 API ====================

/**
 * POST /api/evaluation/causal/observe
 * 记录因果观测数据
 */
router.post(
  '/causal/observe',
  authMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const { features, treatment, outcome } = req.body;

      if (!Array.isArray(features)) {
        return res.status(400).json({
          success: false,
          error: 'features 必须是数组'
        });
      }

      // 限制 features 数组长度和元素类型，防止恶意超大请求
      if (features.length > MAX_FEATURES_LENGTH) {
        return res.status(400).json({
          success: false,
          error: `features 数组长度不能超过 ${MAX_FEATURES_LENGTH}`
        });
      }

      // 验证每个 feature 元素是有效数字
      for (let i = 0; i < features.length; i++) {
        const f = features[i];
        if (typeof f !== 'number' || !Number.isFinite(f) || Math.abs(f) > MAX_FEATURE_VALUE) {
          return res.status(400).json({
            success: false,
            error: `features[${i}] 必须是有效数字，且绝对值不超过 ${MAX_FEATURE_VALUE}`
          });
        }
      }

      if (treatment !== 0 && treatment !== 1) {
        return res.status(400).json({
          success: false,
          error: 'treatment 必须为 0 或 1'
        });
      }

      if (typeof outcome !== 'number' || outcome < -1 || outcome > 1) {
        return res.status(400).json({
          success: false,
          error: 'outcome 必须在 [-1, 1] 范围内'
        });
      }

      const record = await evaluationService.recordCausalObservation({
        userId,
        features,
        treatment,
        outcome
      });

      res.json({
        success: true,
        data: record
          ? {
              id: record.id,
              treatment: record.treatment,
              outcome: record.outcome,
              timestamp: record.timestamp.toString()
            }
          : null
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/evaluation/causal/ate
 * 获取平均处理效应估计
 */
router.get('/causal/ate', authMiddleware, adminMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const estimate = await evaluationService.estimateStrategyEffect();

    res.json({
      success: true,
      data: estimate
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/evaluation/causal/compare
 * 比较两个策略的效果
 */
router.get(
  '/causal/compare',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const strategyA = parseInt(req.query.strategyA as string, 10);
      const strategyB = parseInt(req.query.strategyB as string, 10);

      if (isNaN(strategyA) || isNaN(strategyB)) {
        return res.status(400).json({
          success: false,
          error: 'strategyA 和 strategyB 必须是有效的数字'
        });
      }

      const result = await evaluationService.compareStrategies(strategyA, strategyB);

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
 * GET /api/evaluation/causal/diagnostics
 * 获取因果推断诊断信息
 */
router.get(
  '/causal/diagnostics',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const diagnostics = await evaluationService.getCausalDiagnostics();

      res.json({
        success: true,
        data: diagnostics
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
