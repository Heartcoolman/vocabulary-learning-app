/**
 * AMAS路由
 * 自适应多维度用户感知智能学习算法API
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import { amasService } from '../services/amas.service';
import { delayedRewardService } from '../services/delayed-reward.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateBody, validateQuery } from '../middleware/validate.middleware';
import {
  processEventSchema,
  batchProcessSchema,
  delayedRewardsQuerySchema,
  ProcessEventDto,
  BatchProcessDto,
  DelayedRewardsQueryDto
} from '../validators/amas.validator';
import { AuthRequest } from '../types';
import { RewardStatus } from '@prisma/client';

const router = Router();

/**
 * POST /api/amas/process
 * 处理学习事件，返回策略建议
 */
router.post('/process', authMiddleware, validateBody(processEventSchema), async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const validatedData = req.validatedBody as ProcessEventDto;
    const {
      wordId,
      isCorrect,
      responseTime,
      sessionId,
      dwellTime,
      pauseCount,
      switchCount,
      retryCount,
      focusLossDuration,
      interactionDensity
    } = validatedData;

    // 解析sessionId: 优先使用前端传入的，否则后端生成
    const resolvedSessionId =
      typeof sessionId === 'string' && sessionId.trim().length > 0
        ? sessionId.trim()
        : randomUUID();

    // 处理事件
    const result = await amasService.processLearningEvent(
      userId,
      {
        wordId,
        isCorrect,
        responseTime,
        dwellTime,
        pauseCount,
        switchCount,
        retryCount,
        focusLossDuration,
        interactionDensity
      },
      resolvedSessionId  // 传递sessionId
    );

    res.json({
      success: true,
      data: {
        sessionId: resolvedSessionId,  // 返回sessionId供前端复用
        strategy: result.strategy,
        explanation: result.explanation,
        suggestion: result.suggestion,
        shouldBreak: result.shouldBreak,
        state: {
          attention: result.state.A,
          fatigue: result.state.F,
          motivation: result.state.M,
          memory: result.state.C.mem,
          speed: result.state.C.speed,
          stability: result.state.C.stability
        },
        // 多目标评估结果（当配置了学习目标时）
        objectiveEvaluation: result.objectiveEvaluation ? {
          metrics: result.objectiveEvaluation.metrics,
          constraintsSatisfied: result.objectiveEvaluation.constraintsSatisfied,
          constraintViolations: result.objectiveEvaluation.constraintViolations
        } : undefined,
        multiObjectiveAdjusted: result.multiObjectiveAdjusted
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/amas/state
 * 获取用户当前AMAS状态
 */
router.get('/state', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const state = await amasService.getUserState(userId);

    if (!state) {
      return res.status(404).json({
        success: false,
        message: '用户AMAS状态未初始化'
      });
    }

    res.json({
      success: true,
      data: {
        attention: state.A,
        fatigue: state.F,
        motivation: state.M,
        // 展开认知维度字段以匹配前端UserState类型
        memory: state.C.mem,
        speed: state.C.speed,
        stability: state.C.stability,
        cognitive: state.C,
        confidence: state.conf,
        timestamp: state.ts
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/amas/strategy
 * 获取用户当前学习策略
 */
router.get('/strategy', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const strategy = await amasService.getCurrentStrategy(userId);

    if (!strategy) {
      return res.status(404).json({
        success: false,
        message: '用户策略未初始化'
      });
    }

    res.json({
      success: true,
      data: strategy
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/amas/reset
 * 重置用户AMAS状态
 */
router.post('/reset', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    await amasService.resetUser(userId);

    res.json({
      success: true,
      message: 'AMAS状态已重置'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/amas/phase
 * 获取用户冷启动阶段
 */
router.get('/phase', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const phase = amasService.getColdStartPhase(userId);

    res.json({
      success: true,
      data: {
        phase,
        description: getPhaseDescription(phase)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/amas/batch-process
 * 批量处理历史事件（用于数据导入）
 * 限制：单次最多处理100条事件
 *
 * 前端API: ApiClient.batchProcessEvents()
 */
router.post('/batch-process', authMiddleware, validateBody(batchProcessSchema), async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const validatedData = req.validatedBody as BatchProcessDto;
    const { events } = validatedData;

    const result = await amasService.batchProcessEvents(userId, events);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/amas/delayed-rewards
 * 查询延迟奖励列表
 * Query参数:
 * - status: 奖励状态 (PENDING|PROCESSING|DONE|FAILED)
 * - limit: 返回数量限制 (默认50,最大100)
 */
router.get('/delayed-rewards', authMiddleware, validateQuery(delayedRewardsQuerySchema), async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const validatedQuery = req.validatedQuery as DelayedRewardsQueryDto;
    const { status, limit } = validatedQuery;

    // 查询延迟奖励
    const rewards = await delayedRewardService.findRewards({
      userId,
      status: status as RewardStatus | undefined,
      limit
    });

    res.json({
      success: true,
      data: {
        items: rewards,
        count: rewards.length
      }
    });
  } catch (error) {
    next(error);
  }
});

// ==================== 辅助函数 ====================

function getPhaseDescription(phase: string): string {
  switch (phase) {
    case 'classify':
      return '分类阶段：正在了解你的学习特点';
    case 'explore':
      return '探索阶段：正在尝试不同的学习策略';
    case 'normal':
      return '正常运行：已为你定制最优学习策略';
    default:
      return '未知阶段';
  }
}

export default router;
