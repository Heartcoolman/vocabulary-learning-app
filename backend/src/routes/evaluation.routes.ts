/**
 * 评估API路由
 * 提供因果推断和A/B测试的HTTP接口
 */

import { Router } from 'express';
import { evaluationService } from '../services/evaluation.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { AuthRequest } from '../types';
import { ABExperimentStatus } from '@prisma/client';

const router = Router();

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
router.get('/causal/ate', authMiddleware, async (req: AuthRequest, res, next) => {
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

// ==================== A/B测试 API (管理员) ====================

/**
 * POST /api/evaluation/experiments
 * 创建A/B测试实验
 */
router.post(
  '/experiments',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const {
        name,
        description,
        trafficAllocation,
        minSampleSize,
        significanceLevel,
        minimumDetectableEffect,
        autoDecision,
        variants
      } = req.body;

      if (!name || typeof name !== 'string') {
        return res.status(400).json({
          success: false,
          error: '实验名称是必需的'
        });
      }

      if (!variants || !Array.isArray(variants) || variants.length < 2) {
        return res.status(400).json({
          success: false,
          error: '至少需要两个变体'
        });
      }

      const experiment = await evaluationService.createExperiment({
        name,
        description,
        trafficAllocation,
        minSampleSize,
        significanceLevel,
        minimumDetectableEffect,
        autoDecision,
        variants
      });

      res.status(201).json({
        success: true,
        data: experiment
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/evaluation/experiments
 * 列出所有实验
 */
router.get(
  '/experiments',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const status = req.query.status as ABExperimentStatus | undefined;
      const experiments = await evaluationService.listExperiments(status);

      res.json({
        success: true,
        data: experiments
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/evaluation/experiments/:id
 * 获取实验详情
 */
router.get(
  '/experiments/:id',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const { id } = req.params;
      const experiment = await evaluationService.getExperiment(id);

      if (!experiment) {
        return res.status(404).json({
          success: false,
          error: '实验不存在'
        });
      }

      res.json({
        success: true,
        data: experiment
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/evaluation/experiments/:id/start
 * 启动实验
 */
router.post(
  '/experiments/:id/start',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const { id } = req.params;
      const experiment = await evaluationService.startExperiment(id);

      res.json({
        success: true,
        data: experiment
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/evaluation/experiments/:id/complete
 * 完成实验
 */
router.post(
  '/experiments/:id/complete',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const { id } = req.params;
      const { deploy } = req.body;
      const experiment = await evaluationService.completeExperiment(id, deploy);

      res.json({
        success: true,
        data: experiment
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/evaluation/experiments/:id/results
 * 获取实验分析结果
 */
router.get(
  '/experiments/:id/results',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const { id } = req.params;
      const results = await evaluationService.analyzeExperiment(id);

      if (!results) {
        return res.status(404).json({
          success: false,
          error: '实验不存在'
        });
      }

      res.json({
        success: true,
        data: {
          experimentId: results.experiment.id,
          experimentName: results.experiment.name,
          status: results.experiment.status,
          metrics: results.metrics.map(m => ({
            variantId: m.variantId,
            sampleCount: m.sampleCount,
            averageReward: m.averageReward,
            stdDev: m.stdDev
          })),
          isSignificant: results.isSignificant,
          winner: results.winner
            ? {
                id: results.winner.id,
                name: results.winner.name
              }
            : null,
          improvement: results.improvement
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== 用户侧 A/B 分配 API ====================

/**
 * GET /api/evaluation/variant/:experimentId
 * 获取当前用户的变体分配
 */
router.get(
  '/variant/:experimentId',
  authMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const { experimentId } = req.params;

      // 先检查是否已分配
      let variant = await evaluationService.getUserVariant(experimentId, userId);

      // 如果未分配，尝试分配
      if (!variant) {
        variant = await evaluationService.assignVariant(experimentId, userId);
      }

      res.json({
        success: true,
        data: variant
          ? {
              variantId: variant.id,
              variantName: variant.name,
              isControl: variant.isControl,
              parameters: variant.parameters
            }
          : null
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/evaluation/variant/:experimentId/metric
 * 记录用户在实验中的指标
 */
router.post(
  '/variant/:experimentId/metric',
  authMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const { experimentId } = req.params;
      const { reward } = req.body;

      if (typeof reward !== 'number') {
        return res.status(400).json({
          success: false,
          error: 'reward 必须是数字'
        });
      }

      // 获取用户的变体分配
      const variant = await evaluationService.getUserVariant(experimentId, userId);

      if (!variant) {
        return res.status(404).json({
          success: false,
          error: '用户未参与此实验'
        });
      }

      // 记录指标
      await evaluationService.recordExperimentMetrics(
        experimentId,
        variant.id,
        reward
      );

      res.json({
        success: true,
        data: { recorded: true }
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
