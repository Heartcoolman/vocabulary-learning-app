/**
 * 视觉疲劳检测 API 路由
 *
 * 提供视觉疲劳相关的API端点：
 * - POST /api/visual-fatigue/metrics - 上报视觉疲劳指标
 * - GET /api/visual-fatigue/baseline - 获取用户基线
 * - POST /api/visual-fatigue/baseline - 更新用户基线
 * - GET /api/visual-fatigue/config - 获取配置
 * - GET /api/visual-fatigue/fusion - 获取融合疲劳结果
 */

import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { AuthRequest } from '../types';
import { defaultVisualFatigueProcessor, defaultFatigueFusionEngine } from '../amas/modeling';
import { behaviorFatigueService } from '../services/behavior-fatigue.service';
import type { VisualFatigueInput, PersonalBaseline } from '@danci/shared';

const router = Router();

// ==================== 验证器 ====================

/**
 * 视觉疲劳指标上报验证
 */
const visualFatigueMetricsSchema = z.object({
  score: z.number().min(0).max(1),
  perclos: z.number().min(0).max(1),
  blinkRate: z.number().min(0),
  yawnCount: z.number().int().min(0),
  headPitch: z.number().min(-1).max(1).optional(),
  headYaw: z.number().min(-1).max(1).optional(),
  confidence: z.number().min(0).max(1),
  timestamp: z.number().positive(),
  sessionId: z.string().optional(),
});

/**
 * 基线更新验证
 */
const baselineUpdateSchema = z.object({
  earOpen: z.number().min(0).max(1),
  earClosed: z.number().min(0).max(1),
  earThreshold: z.number().min(0).max(1),
  marNormal: z.number().min(0).max(1),
  marThreshold: z.number().min(0).max(2),
  blinkBaseline: z.number().min(0),
  calibrationTime: z.number().positive(),
  sampleCount: z.number().int().min(0),
  isCalibrated: z.boolean(),
});

// ==================== 路由 ====================

/**
 * POST /api/visual-fatigue/metrics
 * 上报视觉疲劳指标
 */
router.post(
  '/metrics',
  authMiddleware,
  validateBody(visualFatigueMetricsSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const input = req.validatedBody as unknown as VisualFatigueInput;

      // 处理视觉疲劳数据
      const processed = defaultVisualFatigueProcessor.process(userId, input);

      // 获取真正的行为疲劳（从 AMAS 引擎）
      const behaviorFatigue = await behaviorFatigueService.getBehaviorFatigue(userId);

      // 获取学习时长（分钟）
      const studyDurationMinutes = await behaviorFatigueService.getStudyDurationMinutes(userId);

      // 融合疲劳信号
      const fusionResult = defaultFatigueFusionEngine.fuse({
        userId,
        behaviorFatigue,
        visualData: processed,
        studyDurationMinutes,
        timestamp: input.timestamp,
      });

      res.json({
        success: true,
        data: {
          processed: {
            score: processed.score,
            confidence: processed.confidence,
            isValid: processed.isValid,
          },
          fusion: {
            fusedFatigue: fusionResult.fusedFatigue,
            visualFatigue: fusionResult.visualFatigue,
            behaviorFatigue: fusionResult.behaviorFatigue,
            fatigueLevel: fusionResult.fatigueLevel,
            recommendations: fusionResult.recommendations,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/visual-fatigue/baseline
 * 获取用户基线
 */
router.get('/baseline', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    // 获取用户档案
    const profile = defaultVisualFatigueProcessor.getProfile(userId);

    if (!profile || !profile.baseline) {
      res.json({
        success: true,
        data: {
          hasBaseline: false,
          baseline: null,
          baselineType: profile?.baselineType ?? 'default',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        hasBaseline: true,
        baseline: profile.baseline,
        baselineType: profile.baselineType,
        avgVisualFatigue: profile.avgVisualFatigue,
        recordCount: profile.recordCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/visual-fatigue/baseline
 * 更新用户基线
 */
router.post(
  '/baseline',
  authMiddleware,
  validateBody(baselineUpdateSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const baseline = req.validatedBody as unknown as PersonalBaseline;

      // 更新基线
      defaultVisualFatigueProcessor.setBaseline(userId, baseline);

      res.json({
        success: true,
        message: '基线已更新',
        data: { baseline },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/visual-fatigue/config
 * 获取视觉疲劳检测配置
 */
router.get('/config', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    // 返回默认配置
    // TODO: 支持用户自定义配置
    res.json({
      success: true,
      data: {
        enabled: false, // 默认关闭，需要用户主动开启
        detectionIntervalMs: 200,
        reportIntervalMs: 5000,
        earThreshold: 0.2,
        perclosThreshold: 0.15,
        yawnDurationMs: 2000,
        windowSizeSeconds: 60,
        videoWidth: 640,
        videoHeight: 480,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/visual-fatigue/fusion
 * 获取最新融合疲劳结果
 */
router.get('/fusion', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    // 获取最新视觉数据
    const visualData = defaultVisualFatigueProcessor.getLatest(userId);

    // 获取最新融合结果
    const fusionResult = defaultFatigueFusionEngine.getLatest(userId);

    // 获取趋势
    const trend = defaultFatigueFusionEngine.getTrend(userId);

    res.json({
      success: true,
      data: {
        hasData: !!fusionResult,
        fusion: fusionResult
          ? {
              fusedFatigue: fusionResult.fusedFatigue,
              visualFatigue: fusionResult.visualFatigue,
              behaviorFatigue: fusionResult.behaviorFatigue,
              temporalFatigue: fusionResult.temporalFatigue,
              fatigueLevel: fusionResult.fatigueLevel,
              hasConflict: fusionResult.hasConflict,
              conflictDescription: fusionResult.conflictDescription,
              recommendations: fusionResult.recommendations,
            }
          : null,
        visual: visualData
          ? {
              score: visualData.score,
              perclos: visualData.metrics.perclos,
              blinkRate: visualData.metrics.blinkRate,
              confidence: visualData.confidence,
            }
          : null,
        trend,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/visual-fatigue/reset
 * 重置用户视觉疲劳数据
 */
router.post('/reset', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    defaultVisualFatigueProcessor.resetUser(userId);
    defaultFatigueFusionEngine.resetUser(userId);

    res.json({
      success: true,
      message: '视觉疲劳数据已重置',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
