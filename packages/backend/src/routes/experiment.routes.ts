/**
 * 实验管理路由
 * 提供 A/B 测试实验的 RESTful API
 */

import { Router } from 'express';
import { ABExperimentStatus } from '@prisma/client';
import { experimentService } from '../services/experiment.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { AuthRequest } from '../types';
import { logger } from '../logger';

/**
 * 类型守卫：检查值是否为有效的实验状态
 */
function isValidExperimentStatus(value: unknown): value is ABExperimentStatus {
  return (
    typeof value === 'string' &&
    Object.values(ABExperimentStatus).includes(value as ABExperimentStatus)
  );
}

/**
 * 类型守卫：检查错误是否有 message 属性
 */
function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

const router = Router();

// ==================== 实验列表 ====================

/**
 * GET /api/experiments
 * 获取实验列表
 */
router.get('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const { status, page, pageSize } = req.query;

    const result = await experimentService.listExperiments({
      status: isValidExperimentStatus(status) ? status : undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
    });

    res.json({
      success: true,
      data: result.experiments,
      pagination: {
        total: result.total,
        page: page ? parseInt(page as string, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize as string, 10) : 20,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ==================== 创建实验 ====================

/**
 * POST /api/experiments
 * 创建新实验
 */
router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const {
      name,
      description,
      trafficAllocation,
      minSampleSize,
      significanceLevel,
      minimumDetectableEffect,
      autoDecision,
      variants,
    } = req.body;

    // 基础验证
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: '实验名称不能为空',
      });
    }

    if (name.length > 200) {
      return res.status(400).json({
        success: false,
        error: '实验名称不能超过200个字符',
      });
    }

    if (!variants || !Array.isArray(variants) || variants.length < 2) {
      return res.status(400).json({
        success: false,
        error: '至少需要两个变体',
      });
    }

    // 验证流量分配类型
    const validAllocations = ['EVEN', 'WEIGHTED', 'DYNAMIC'];
    if (!validAllocations.includes(trafficAllocation)) {
      return res.status(400).json({
        success: false,
        error: '无效的流量分配类型',
      });
    }

    // 验证数值参数
    if (typeof minSampleSize !== 'number' || minSampleSize < 10) {
      return res.status(400).json({
        success: false,
        error: '最小样本数必须至少为10',
      });
    }

    if (typeof significanceLevel !== 'number' || significanceLevel <= 0 || significanceLevel >= 1) {
      return res.status(400).json({
        success: false,
        error: '显著性水平必须在 0 和 1 之间',
      });
    }

    if (
      typeof minimumDetectableEffect !== 'number' ||
      minimumDetectableEffect <= 0 ||
      minimumDetectableEffect >= 1
    ) {
      return res.status(400).json({
        success: false,
        error: '最小可检测效应必须在 0 和 1 之间',
      });
    }

    // 验证变体
    for (const variant of variants) {
      if (!variant.id || typeof variant.id !== 'string') {
        return res.status(400).json({
          success: false,
          error: '每个变体必须有唯一ID',
        });
      }
      if (!variant.name || typeof variant.name !== 'string') {
        return res.status(400).json({
          success: false,
          error: '每个变体必须有名称',
        });
      }
      if (typeof variant.weight !== 'number' || variant.weight < 0 || variant.weight > 1) {
        return res.status(400).json({
          success: false,
          error: '变体权重必须在 0 和 1 之间',
        });
      }
    }

    const result = await experimentService.createExperiment({
      name: name.trim(),
      description: description?.trim() || undefined,
      trafficAllocation,
      minSampleSize,
      significanceLevel,
      minimumDetectableEffect,
      autoDecision: Boolean(autoDecision),
      variants,
    });

    logger.info({ experimentId: result.id, userId: req.user!.id }, '管理员创建实验');

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    if (isErrorWithMessage(error)) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
});

// ==================== 获取实验详情 ====================

/**
 * GET /api/experiments/:experimentId
 * 获取实验详情
 */
router.get(
  '/:experimentId',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const { experimentId } = req.params;

      const experiment = await experimentService.getExperiment(experimentId);

      res.json({
        success: true,
        data: experiment,
      });
    } catch (error: unknown) {
      if (isErrorWithMessage(error) && error.message === '实验不存在') {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }
      next(error);
    }
  },
);

// ==================== 获取实验状态 ====================

/**
 * GET /api/experiments/:experimentId/status
 * 获取实验状态和统计分析
 */
router.get(
  '/:experimentId/status',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const { experimentId } = req.params;

      const status = await experimentService.getExperimentStatus(experimentId);

      res.json({
        success: true,
        data: status,
      });
    } catch (error: unknown) {
      if (isErrorWithMessage(error) && error.message === '实验不存在') {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }
      next(error);
    }
  },
);

// ==================== 启动实验 ====================

/**
 * POST /api/experiments/:experimentId/start
 * 启动实验
 */
router.post(
  '/:experimentId/start',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const { experimentId } = req.params;

      await experimentService.startExperiment(experimentId);

      logger.info({ experimentId, userId: req.user!.id }, '管理员启动实验');

      res.json({
        success: true,
        data: { message: '实验已启动' },
      });
    } catch (error: unknown) {
      if (isErrorWithMessage(error)) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }
      next(error);
    }
  },
);

// ==================== 停止实验 ====================

/**
 * POST /api/experiments/:experimentId/stop
 * 停止实验
 */
router.post(
  '/:experimentId/stop',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const { experimentId } = req.params;

      await experimentService.stopExperiment(experimentId);

      logger.info({ experimentId, userId: req.user!.id }, '管理员停止实验');

      res.json({
        success: true,
        data: { message: '实验已停止' },
      });
    } catch (error: unknown) {
      if (isErrorWithMessage(error)) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }
      next(error);
    }
  },
);

// ==================== 删除实验 ====================

/**
 * DELETE /api/experiments/:experimentId
 * 删除实验
 */
router.delete(
  '/:experimentId',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const { experimentId } = req.params;

      await experimentService.deleteExperiment(experimentId);

      logger.info({ experimentId, userId: req.user!.id }, '管理员删除实验');

      res.json({
        success: true,
        data: { message: '实验已删除' },
      });
    } catch (error: unknown) {
      if (isErrorWithMessage(error)) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }
      next(error);
    }
  },
);

// ==================== 记录实验指标 ====================

/**
 * POST /api/experiments/:experimentId/metric
 * 记录实验指标（内部使用，用于用户参与实验时记录）
 */
router.post('/:experimentId/metric', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const { experimentId } = req.params;
    const { variantId, reward } = req.body;

    if (!variantId || typeof variantId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'variantId 不能为空',
      });
    }

    if (typeof reward !== 'number' || reward < -1 || reward > 1) {
      return res.status(400).json({
        success: false,
        error: 'reward 必须在 [-1, 1] 范围内',
      });
    }

    await experimentService.recordMetric(experimentId, variantId, reward);

    res.json({
      success: true,
      data: { recorded: true },
    });
  } catch (error: unknown) {
    if (isErrorWithMessage(error)) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
});

export default router;
