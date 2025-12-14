/**
 * 视觉疲劳检测 API 路由
 *
 * 提供视觉疲劳相关的API端点：
 * - POST /api/visual-fatigue/metrics - 上报视觉疲劳指标
 * - GET /api/visual-fatigue/baseline - 获取用户基线
 * - POST /api/visual-fatigue/baseline - 更新用户基线
 * - GET /api/visual-fatigue/config - 获取配置
 * - PUT /api/visual-fatigue/config - 更新用户配置
 * - GET /api/visual-fatigue/fusion - 获取融合疲劳结果
 */

import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { AuthRequest } from '../types';
import { defaultVisualFatigueProcessor, defaultFatigueFusionEngine } from '../amas/modeling';
import { behaviorFatigueService } from '../services/behavior-fatigue.service';
import prisma from '../config/database';
import type { VisualFatigueInput, PersonalBaseline } from '@danci/shared';
import { logger } from '../logger';

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
  // 扩展字段：支持更丰富的视觉疲劳指标
  eyeAspectRatio: z.number().min(0).max(0.5).optional(),
  avgBlinkDuration: z.number().min(0).optional(),
  headRoll: z.number().min(-1).max(1).optional(),
  headStability: z.number().min(0).max(1).optional(),
  squintIntensity: z.number().min(0).max(1).optional(),
  expressionFatigueScore: z.number().min(0).max(1).optional(),
  gazeOffScreenRatio: z.number().min(0).max(1).optional(),
  browDownIntensity: z.number().min(0).max(1).optional(),
  mouthOpenRatio: z.number().min(0).max(1).optional(),
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

/**
 * 用户配置更新验证
 */
const userConfigUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  detectionFps: z.number().int().min(1).max(30).optional(),
  uploadIntervalMs: z.number().int().min(1000).max(60000).optional(),
  vlmAnalysisEnabled: z.boolean().optional(),
  personalBaselineData: z.record(z.unknown()).optional(),
});

// ==================== 默认配置 ====================

const DEFAULT_CONFIG = {
  enabled: false,
  detectionIntervalMs: 200,
  reportIntervalMs: 5000,
  earThreshold: 0.2,
  perclosThreshold: 0.15,
  yawnDurationMs: 2000,
  windowSizeSeconds: 60,
  videoWidth: 640,
  videoHeight: 480,
};

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

      // 将数据持久化到数据库（用于统计分析）
      // 使用异步操作避免阻塞响应
      prisma.visualFatigueRecord
        .create({
          data: {
            userId,
            score: processed.score,
            fusedScore: fusionResult.fusedFatigue,
            perclos: input.perclos,
            blinkRate: input.blinkRate,
            yawnCount: input.yawnCount,
            confidence: processed.confidence,
            headPitch: input.headPitch,
            headYaw: input.headYaw,
          },
        })
        .catch((err) => {
          logger.error({ err }, '[VisualFatigue] Failed to save record');
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
 * 获取视觉疲劳检测配置（支持用户自定义）
 */
router.get('/config', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    // 查询用户自定义配置
    const userConfig = await prisma.userVisualFatigueConfig.findUnique({
      where: { userId },
    });

    // 合并用户配置与默认配置
    const config = userConfig
      ? {
          ...DEFAULT_CONFIG,
          enabled: userConfig.enabled,
          detectionIntervalMs: Math.round(1000 / userConfig.detectionFps),
          reportIntervalMs: userConfig.uploadIntervalMs,
          vlmAnalysisEnabled: userConfig.vlmAnalysisEnabled,
          personalBaseline: userConfig.personalBaselineData,
        }
      : DEFAULT_CONFIG;

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/visual-fatigue/config
 * 更新用户视觉疲劳配置
 */
router.put(
  '/config',
  authMiddleware,
  validateBody(userConfigUpdateSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const configData = req.validatedBody as z.infer<typeof userConfigUpdateSchema>;

      // 将 personalBaselineData 转换为 Prisma 可接受的 Json 类型
      // 使用 Prisma.DbNull 表示数据库空值
      const personalBaselineDataValue = configData.personalBaselineData
        ? (configData.personalBaselineData as Prisma.InputJsonValue)
        : Prisma.DbNull;

      const config = await prisma.userVisualFatigueConfig.upsert({
        where: { userId },
        create: {
          userId,
          enabled: configData.enabled ?? false,
          detectionFps: configData.detectionFps ?? 5,
          uploadIntervalMs: configData.uploadIntervalMs ?? 5000,
          vlmAnalysisEnabled: configData.vlmAnalysisEnabled ?? false,
          personalBaselineData: configData.personalBaselineData
            ? (configData.personalBaselineData as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
        update: {
          ...(configData.enabled !== undefined && { enabled: configData.enabled }),
          ...(configData.detectionFps !== undefined && { detectionFps: configData.detectionFps }),
          ...(configData.uploadIntervalMs !== undefined && {
            uploadIntervalMs: configData.uploadIntervalMs,
          }),
          ...(configData.vlmAnalysisEnabled !== undefined && {
            vlmAnalysisEnabled: configData.vlmAnalysisEnabled,
          }),
          ...(configData.personalBaselineData !== undefined && {
            personalBaselineData: personalBaselineDataValue,
          }),
        },
      });

      res.json({
        success: true,
        message: '配置已更新',
        data: {
          enabled: config.enabled,
          detectionFps: config.detectionFps,
          uploadIntervalMs: config.uploadIntervalMs,
          vlmAnalysisEnabled: config.vlmAnalysisEnabled,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

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
