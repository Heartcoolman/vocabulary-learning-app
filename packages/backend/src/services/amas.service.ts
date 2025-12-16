/**
 * AMAS服务
 * 自适应多维度用户感知智能学习算法服务层
 */

import {
  AMASEngine,
  ProcessResult,
  RawEvent,
  UserState,
  StrategyParams,
  ColdStartPhase,
} from '../amas';
import { cachedStateRepository, cachedModelRepository } from '../repositories';
import {
  getFeatureFlags,
  getFeatureFlagsSummary,
  isEnsembleEnabled,
  isCausalInferenceEnabled,
  isBayesianOptimizerEnabled,
  applyExperimentOverrides,
  getUserFeatureFlags,
  clearUserFeatureFlagOverrides,
} from '../amas/config/feature-flags';
import { cacheService, CacheKeys, CacheTTL } from './cache.service';
import { recordFeatureVectorSaved } from './metrics.service';
import prisma from '../config/database';
import { delayedRewardService } from './delayed-reward.service';
import { stateHistoryService } from './state-history.service';
import userProfileService from './user-profile.service';
import { evaluationService } from './evaluation.service';
import { experimentService } from './experiment.service';
import { Prisma, WordState } from '@prisma/client';
import { LearningObjectivesService } from './learning-objectives.service';
import { LearningObjectives } from '../amas/types';
import { updateHalfLife, computeOptimalInterval } from '../amas/modeling/forgetting-curve';
import { serviceLogger } from '../logger';
import { defaultVisualFatigueProcessor } from '../amas/modeling';
import { behaviorFatigueService } from './behavior-fatigue.service';
import type { ProcessedVisualFatigueData, VisualCognitiveSignals } from '@danci/shared';

class AMASService {
  private engine: AMASEngine;

  // 延迟奖励配置
  private readonly MIN_DELAY_MS = 60_000; // 最小延迟60秒
  private readonly DEFAULT_DELAY_MS = 24 * 60 * 60 * 1000; // 默认24小时

  // 得分权重配置
  private readonly SCORE_WEIGHTS = {
    accuracy: 0.4,
    speed: 0.2,
    stability: 0.2,
    proficiency: 0.2,
  } as const;

  constructor() {
    // 初始化AMAS引擎（使用带缓存的持久化仓库）
    // 传入 prisma 以启用决策轨迹持久化
    this.engine = new AMASEngine({
      stateRepo: cachedStateRepository,
      modelRepo: cachedModelRepository,
      prisma,
    });

    // 记录功能开关状态
    serviceLogger.info('AMAS Service初始化完成');
    serviceLogger.info({ summary: getFeatureFlagsSummary() }, '功能开关状态');
  }

  /**
   * 失效用户奖励配置缓存（学习模式）
   * 让用户切换学习模式后立即生效，避免等待内存缓存 TTL
   */
  invalidateRewardProfileCache(userId: string): void {
    this.engine.invalidateRewardProfileCache(userId);
  }

  /**
   * 解析延迟奖励默认延迟时间
   * 支持环境变量配置,最小60秒
   */
  private resolveDefaultDelayMs(): number {
    const fromEnv = Number(process.env.DELAYED_REWARD_DELAY_MS);
    if (Number.isFinite(fromEnv) && fromEnv >= this.MIN_DELAY_MS) {
      return fromEnv;
    }
    return Math.max(this.DEFAULT_DELAY_MS, this.MIN_DELAY_MS);
  }

  /**
   * 计算延迟奖励的到期时间
   * 优先级:
   * 1. WordLearningState.nextReviewDate
   * 2. currentInterval * 24小时
   * 3. 默认配置的延迟时间
   *
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param eventTs 事件时间戳(毫秒)
   * @returns 到期时间
   */
  private async computeDueTs(userId: string, wordId: string, eventTs: number): Promise<Date> {
    try {
      // 查询单词学习状态
      const learningState = await prisma.wordLearningState.findUnique({
        where: {
          unique_user_word: {
            userId,
            wordId,
          },
        },
        select: {
          nextReviewDate: true,
          currentInterval: true,
        },
      });

      // 优先使用nextReviewDate
      if (learningState?.nextReviewDate) {
        const reviewTs = new Date(learningState.nextReviewDate).getTime();
        // 确保不低于最小延迟
        return new Date(Math.max(reviewTs, eventTs + this.MIN_DELAY_MS));
      }

      // 次选使用currentInterval
      if (learningState?.currentInterval && learningState.currentInterval > 0) {
        const intervalMs = learningState.currentInterval * 24 * 60 * 60 * 1000;
        return new Date(Math.max(eventTs + intervalMs, eventTs + this.MIN_DELAY_MS));
      }

      // 兜底使用默认配置
      return new Date(eventTs + this.resolveDefaultDelayMs());
    } catch (error) {
      serviceLogger.warn({ err: error, userId, wordId }, '计算延迟奖励到期时间失败,使用默认值');
      return new Date(eventTs + this.resolveDefaultDelayMs());
    }
  }

  /**
   * 限制数值在 [0, 1] 范围内
   */
  private clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  /**
   * 将 [0, 1] 数值转换为百分比 [0, 100]
   */
  private toPercentage(value: number): number {
    return Math.round(this.clamp01(value) * 100);
  }

  /**
   * 从 AMAS 认知状态映射到掌握等级 (0-5)
   * 加权计算：mem * 0.6 + stability * 0.3 + speed * 0.1
   */
  private mapToMasteryLevel(mem: number, stability: number, speed: number): number {
    const blended = 0.6 * mem + 0.3 * stability + 0.1 * speed;
    if (blended < 0.2) return 0;
    if (blended < 0.4) return 1;
    if (blended < 0.6) return 2;
    if (blended < 0.75) return 3;
    if (blended < 0.9) return 4;
    return 5;
  }

  /**
   * 从掌握等级和学习次数映射到学习状态
   */
  private mapToWordState(masteryLevel: number, stability: number, reviewCount: number): WordState {
    // 新单词：学习次数 ≤ 1 且掌握等级 ≤ 1
    if (reviewCount <= 1 && masteryLevel <= 1) {
      return WordState.NEW;
    }
    // 已掌握：掌握等级 ≥ 5 且稳定性 ≥ 0.75 且学习次数 ≥ 5
    if (masteryLevel >= 5 && stability >= 0.75 && reviewCount >= 5) {
      return WordState.MASTERED;
    }
    // 复习中：掌握等级 ≥ 3 且学习次数 ≥ 2
    if (masteryLevel >= 3 && reviewCount >= 2) {
      return WordState.REVIEWING;
    }
    // 其他情况：学习中
    return WordState.LEARNING;
  }

  /**
   * 构建延迟奖励的幂等键
   * 格式: ${userId}:${wordId}:${timestamp}
   * 与AnswerRecord的唯一约束保持一致
   *
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param timestamp 时间戳(毫秒)
   * @returns 幂等键
   */
  private buildIdempotencyKey(userId: string, wordId: string, timestamp: number): string {
    return `${userId}:${wordId}:${timestamp}`;
  }

  /**
   * 执行带重试机制的事务操作
   * 用于处理高并发场景下的事务超时问题
   */
  private async runWordStateTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    context: { userId: string; wordId: string },
  ): Promise<T> {
    const maxAttempts = 3;
    const baseDelayMs = 100;
    const txOptions = { maxWait: 5_000, timeout: 20_000 };
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await prisma.$transaction(operation, txOptions);
      } catch (error) {
        lastError = error;
        if (!this.isRetryableTransactionError(error) || attempt === maxAttempts) {
          throw error;
        }
        const backoffMs = baseDelayMs * Math.pow(2, attempt - 1);
        serviceLogger.warn(
          { userId: context.userId, wordId: context.wordId, attempt: attempt + 1, backoffMs },
          '事务开启等待超时，准备重试',
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
    // 保留原始错误作为 cause，便于调试
    const error = new Error('Transaction retries exhausted');
    (error as Error & { cause?: unknown }).cause = lastError;
    throw error;
  }

  /**
   * 检查是否为可重试的事务错误
   */
  private isRetryableTransactionError(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // P2024: 连接池等待超时；P2034: 事务被中断/超时
      return error.code === 'P2024' || error.code === 'P2034';
    }
    if (error instanceof Error) {
      // 乐观锁冲突也应该重试
      if (error.message.includes('OPTIMISTIC_LOCK_CONFLICT')) {
        return true;
      }
      return error.message.includes('Unable to start a transaction in the given time');
    }
    return false;
  }

  /**
   * 带重试机制的习惯画像持久化
   * 指数退避重试，最多 3 次
   */
  private async persistHabitProfileWithRetry(userId: string): Promise<void> {
    // userProfileService.persistHabitProfile 内部具备：样本数门槛 + upsert 原子写入 + 自身错误兜底
    // 这里不再对失败做重试，避免放大并发/连接池压力
    const saved = await userProfileService.persistHabitProfile(userId);
    if (saved) {
      serviceLogger.info({ userId }, '习惯画像持久化成功');
    }
  }

  /**
   * 处理学习事件并返回策略建议
   * @param userId 用户ID
   * @param event 学习事件数据
   * @param sessionId 可选的学习会话ID（用于FeatureVector持久化）
   */
  async processLearningEvent(
    userId: string,
    event: {
      wordId: string;
      isCorrect: boolean;
      responseTime: number;
      dwellTime?: number;
      pauseCount?: number;
      switchCount?: number;
      retryCount?: number;
      focusLossDuration?: number;
      interactionDensity?: number;
      /** 对话框暂停时间（毫秒），用于疲劳度计算时排除非学习时间 */
      pausedTimeMs?: number;
    },
    sessionId?: string,
  ): Promise<ProcessResult> {
    // 构建原始事件
    const rawEvent: RawEvent = {
      wordId: event.wordId,
      isCorrect: event.isCorrect,
      responseTime: event.responseTime,
      dwellTime: event.dwellTime ?? 0,
      timestamp: Date.now(),
      pauseCount: event.pauseCount ?? 0,
      switchCount: event.switchCount ?? 0,
      retryCount: event.retryCount ?? 0,
      focusLossDuration: event.focusLossDuration ?? 0,
      interactionDensity: event.interactionDensity ?? 1.0,
      pausedTimeMs: event.pausedTimeMs,
    };

    // 记录学习时间事件（用于习惯画像）
    userProfileService.recordTimeEvent(userId, rawEvent.timestamp);

    // ==================== A/B 测试实验集成 ====================
    // 获取用户参与的活跃实验并应用变体参数
    let userExperiments: Array<{
      experimentId: string;
      experimentName: string;
      variantId: string;
      variantName: string;
      isControl: boolean;
      parameters: Record<string, unknown>;
    }> = [];

    try {
      userExperiments = await experimentService.getUserActiveExperiments(userId);

      // 先清除旧的用户覆盖，再合并所有活跃实验的参数
      // 这样可以确保：1) 实验停止后覆盖被清理  2) 多个实验的参数能正确叠加
      clearUserFeatureFlagOverrides(userId);

      // 合并所有活跃实验的参数
      const mergedOverrides: Record<string, unknown> = {};
      for (const exp of userExperiments) {
        if (exp.parameters && Object.keys(exp.parameters).length > 0) {
          Object.assign(mergedOverrides, exp.parameters);
          serviceLogger.debug(
            {
              userId,
              experimentId: exp.experimentId,
              variantId: exp.variantId,
              parameters: exp.parameters,
            },
            '[A/B Test] 合并实验变体参数',
          );
        }
      }

      // 一次性应用合并后的参数
      if (Object.keys(mergedOverrides).length > 0) {
        applyExperimentOverrides(userId, mergedOverrides);
        serviceLogger.debug({ userId, mergedOverrides }, '[A/B Test] 已应用合并后的实验参数');
      }
    } catch (error) {
      // 实验获取失败不影响主流程
      serviceLogger.warn({ err: error, userId }, '[A/B Test] 获取用户实验失败');
    }
    // ==================== A/B 测试实验集成结束 ====================

    // 定期自动持久化习惯画像（每 10 个事件检查一次）
    // 使用异步方式，不阻塞主流程，带重试机制
    const profile = userProfileService.getHabitProfile(userId);
    if (profile.samples.timeEvents >= 10 && profile.samples.timeEvents % 10 === 0) {
      this.persistHabitProfileWithRetry(userId).catch((error) => {
        serviceLogger.warn({ err: error, userId }, '习惯画像自动持久化最终失败');
      });
    }

    // 确保学习会话存在（用于答题记录和特征向量持久化）
    // 提前创建学习会话，避免后续外键约束失败
    if (sessionId) {
      await this.ensureLearningSession(sessionId, userId);
    }

    // 存储答题记录（用于统计和历史查询）
    // 必须在获取统计数据前存储，以确保当前事件计入统计
    let answerRecordId: string | undefined;
    try {
      const answerRecord = await prisma.answerRecord.create({
        data: {
          userId,
          wordId: event.wordId,
          isCorrect: event.isCorrect,
          responseTime: event.responseTime,
          dwellTime: event.dwellTime ?? 0,
          timestamp: new Date(rawEvent.timestamp),
          sessionId: sessionId ?? null,
          selectedAnswer: '',
          correctAnswer: '',
        },
      });
      answerRecordId = answerRecord.id;
    } catch (error) {
      // 如果是唯一约束冲突（重复记录），忽略错误
      // 使用 Prisma 错误码 P2002 替代字符串匹配
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        serviceLogger.info({ userId, wordId: event.wordId }, '跳过重复答题记录');
      } else {
        // 其他错误仅记录警告，不阻断主流程
        serviceLogger.warn({ err: error, userId, wordId: event.wordId }, '存储答题记录失败');
      }
    }

    // 并行获取当前策略、统计、学习目标和单词复习历史
    // 使用 Promise.allSettled 确保部分查询失败不会影响其他查询
    const [currentStrategyResult, statsResult, learningObjectivesResult, wordReviewHistoryResult] =
      await Promise.allSettled([
        this.getCurrentStrategy(userId),
        this.getUserStats(userId),
        sessionId ? LearningObjectivesService.getUserObjectives(userId) : Promise.resolve(null),
        this.getWordReviewHistory(userId, event.wordId),
      ]);

    // 安全解包结果，失败时使用默认值
    const currentStrategy =
      currentStrategyResult.status === 'fulfilled' ? currentStrategyResult.value : null;

    const stats =
      statsResult.status === 'fulfilled'
        ? statsResult.value
        : { interactionCount: 0, recentAccuracy: 0.5 }; // 默认统计值

    const learningObjectivesValue =
      learningObjectivesResult.status === 'fulfilled' ? learningObjectivesResult.value : null;

    const wordReviewHistory =
      wordReviewHistoryResult.status === 'fulfilled' ? wordReviewHistoryResult.value : [];

    // 记录失败的查询（用于调试）
    if (currentStrategyResult.status === 'rejected') {
      serviceLogger.warn({ err: currentStrategyResult.reason, userId }, '获取当前策略失败');
    }
    if (statsResult.status === 'rejected') {
      serviceLogger.warn({ err: statsResult.reason, userId }, '获取用户统计失败，使用默认值');
    }
    if (learningObjectivesResult.status === 'rejected') {
      serviceLogger.warn({ err: learningObjectivesResult.reason, userId }, '获取学习目标失败');
    }
    if (wordReviewHistoryResult.status === 'rejected') {
      serviceLogger.warn({ err: wordReviewHistoryResult.reason, userId }, '获取单词复习历史失败');
    }

    // 获取学习目标和会话统计（用于多目标优化）
    let learningObjectives: LearningObjectives | undefined = learningObjectivesValue ?? undefined;
    let sessionStats: Awaited<ReturnType<AMASService['getSessionStats']>> | undefined = undefined;

    // 会话统计依赖学习目标，需要串行获取
    if (sessionId && learningObjectives) {
      try {
        sessionStats = await this.getSessionStats(userId, sessionId);
      } catch (error) {
        serviceLogger.warn({ err: error, userId }, '获取会话统计失败');
      }
    }

    // 获取视觉疲劳数据（用于融合疲劳计算）
    let visualFatigueData: ProcessedVisualFatigueData | undefined;
    let studyDurationMinutes: number | undefined;
    try {
      const visualData = defaultVisualFatigueProcessor.getLatest(userId);

      // Fallback 逻辑：当视觉数据无效时，尝试使用降级数据
      // 最大过期时间 120 秒（2分钟），超过此时间完全跳过视觉疲劳
      const MAX_STALE_DATA_MS = 120_000;

      if (visualData && visualData.isValid) {
        // 正常情况：使用新鲜的有效数据
        visualFatigueData = this.buildVisualFatigueData(userId, visualData);
      } else if (visualData && !visualData.isValid) {
        // Fallback：数据存在但已过期，检查是否在可接受范围内
        const staleDuration = Date.now() - visualData.timestamp;

        if (staleDuration < MAX_STALE_DATA_MS) {
          // 在可接受范围内，使用过期数据但降低置信度
          const confidenceReduction = staleDuration / MAX_STALE_DATA_MS; // 0 -> 1
          const adjustedConfidence = visualData.confidence * (1 - confidenceReduction * 0.5);

          serviceLogger.info(
            {
              userId,
              staleDuration: Math.round(staleDuration / 1000),
              originalConfidence: visualData.confidence.toFixed(2),
              adjustedConfidence: adjustedConfidence.toFixed(2),
            },
            '[AMAS] 使用过期视觉数据（降低置信度）',
          );

          // 标记为有效以便后续处理，但置信度已调整
          const adjustedVisualData = {
            ...visualData,
            confidence: adjustedConfidence,
            isValid: true, // 标记为有效以便进入处理流程
          };
          visualFatigueData = this.buildVisualFatigueData(userId, adjustedVisualData);
        } else {
          // 数据过期太久，完全跳过
          serviceLogger.debug(
            { userId, staleDuration: Math.round(staleDuration / 1000) },
            '[AMAS] 视觉数据过期太久，跳过融合疲劳',
          );
        }
      }

      studyDurationMinutes = await behaviorFatigueService.getStudyDurationMinutes(userId);
    } catch (error) {
      serviceLogger.warn({ err: error, userId }, '获取视觉疲劳数据失败');
    }

    // 处理事件（多目标优化在引擎内部完成）
    const result = await this.engine.processEvent(userId, rawEvent, {
      currentParams: currentStrategy ?? undefined,
      interactionCount: stats.interactionCount,
      recentAccuracy: stats.recentAccuracy,
      answerRecordId,
      sessionId,
      learningObjectives,
      sessionStats,
      wordReviewHistory,
      visualFatigueData,
      studyDurationMinutes,
    });

    // 缓存新策略
    await this.cacheStrategy(userId, result.strategy);

    // 持久化特征向量（用于延迟奖励）
    // Critical Fix: 使用answerRecordId作为主键，避免覆盖
    serviceLogger.info(
      { answerRecordId, sessionId, hasFeatureVector: !!result.featureVector },
      'processLearningEvent完成',
    );

    if (result.featureVector) {
      if (answerRecordId) {
        serviceLogger.info(
          {
            answerRecordId,
            version: result.featureVector.version,
            dimension: result.featureVector.values.length,
          },
          '准备保存特征向量',
        );
        await this.persistFeatureVector(answerRecordId, sessionId, result.featureVector);
      } else {
        serviceLogger.warn('未保存特征向量: answerRecordId缺失，无法保证唯一性');
      }
    } else {
      serviceLogger.warn('未保存特征向量: featureVector为空');
    }

    // 记录决策日志（可选）
    await this.logDecision(userId, result);

    // 保存状态快照到历史记录 (Requirements: 5.2)
    try {
      await stateHistoryService.saveStateSnapshot(userId, {
        A: result.state.A,
        F: result.state.F,
        M: result.state.M,
        C: {
          // 映射 AMAS CognitiveProfile (mem) 到 StateHistory (memory)
          memory: result.state.C.mem,
          speed: result.state.C.speed,
          stability: result.state.C.stability,
        },
        T: result.state.T,
      });
      serviceLogger.info({ userId }, '状态快照已保存');
    } catch (error) {
      // 状态快照保存失败不影响主流程
      serviceLogger.warn({ err: error, userId }, '状态快照保存失败');
    }

    // 更新单词学习状态和得分（用于管理后台统计展示）
    // 使用事务保证数据一致性，避免竞态条件
    try {
      // 从 AMAS 认知状态提取数值
      const mem = this.clamp01(result.state.C.mem);
      const stability = this.clamp01(result.state.C.stability);
      const speed = this.clamp01(result.state.C.speed);

      // 计算掌握等级 (0-5)
      const masteryLevel = this.mapToMasteryLevel(mem, stability, speed);

      // 校验并安全化 interval_scale
      const safeIntervalScale =
        Number.isFinite(result.strategy.interval_scale) && result.strategy.interval_scale > 0
          ? result.strategy.interval_scale
          : 1.0; // 异常值回退到默认值 1.0

      // 使用事务保证原子性：读取当前状态、计算新值、更新状态和得分
      // 注：复习间隔现在基于个性化半衰期计算，在事务内部完成
      const updateResult = await this.runWordStateTransaction(
        async (tx) => {
          // 1. 使用 upsert 原子更新学习状态
          // create 分支：首次学习，reviewCount = 1
          // update 分支：已有记录，reviewCount 原子递增
          // 先计算 reviewCount=1 时的初始状态（用于 create 分支）
          const initialWordState = this.mapToWordState(masteryLevel, stability, 1);

          // 根据当前答题结果更新连续正确/错误计数
          const streakUpdate = event.isCorrect
            ? { consecutiveCorrect: { increment: 1 }, consecutiveWrong: 0 }
            : { consecutiveCorrect: 0, consecutiveWrong: { increment: 1 } };

          // 获取当前状态（包含版本号用于乐观锁）
          const existingState = await tx.wordLearningState.findUnique({
            where: { unique_user_word: { userId, wordId: event.wordId } },
            select: { halfLife: true, version: true },
          });
          const currentHalfLife = existingState?.halfLife ?? 1.0;
          const currentVersion = existingState?.version ?? 0;

          // 使用个性化遗忘曲线更新半衰期
          const halfLifeUpdate = updateHalfLife(
            currentHalfLife,
            event.isCorrect,
            rawEvent.responseTime,
            { memory: mem, speed, stability },
          );

          // 基于新半衰期计算最优复习间隔
          const optimalInterval = computeOptimalInterval(halfLifeUpdate.newHalfLife, 0.8);
          // 结合策略的 interval_scale 调整，确保最小间隔为 1 天，防止立即复习循环
          const finalIntervalDays = Math.max(1, Math.round(optimalInterval * safeIntervalScale));
          const finalNextReviewDate = new Date(
            rawEvent.timestamp + finalIntervalDays * 24 * 60 * 60 * 1000,
          );

          let upsertedState;

          if (existingState) {
            // 已有记录：使用乐观锁更新
            // updateMany 支持复合条件（包括版本检查）
            const updateResult = await tx.wordLearningState.updateMany({
              where: {
                userId,
                wordId: event.wordId,
                version: currentVersion, // 乐观锁：只在版本匹配时更新
              },
              data: {
                masteryLevel,
                reviewCount: { increment: 1 },
                lastReviewDate: new Date(rawEvent.timestamp),
                nextReviewDate: finalNextReviewDate,
                currentInterval: finalIntervalDays,
                easeFactor: 2.5 + (stability - 0.5) * 0.5,
                halfLife: halfLifeUpdate.newHalfLife,
                version: { increment: 1 }, // 版本号递增
                ...streakUpdate,
              },
            });

            // 检查乐观锁冲突
            if (updateResult.count === 0) {
              // 版本冲突，抛出错误让事务重试
              throw new Error(
                'OPTIMISTIC_LOCK_CONFLICT: WordLearningState concurrent update detected',
              );
            }

            // 重新获取更新后的状态
            upsertedState = await tx.wordLearningState.findUnique({
              where: { unique_user_word: { userId, wordId: event.wordId } },
            });
          } else {
            // 新记录：直接创建
            upsertedState = await tx.wordLearningState.create({
              data: {
                userId,
                wordId: event.wordId,
                masteryLevel,
                state: initialWordState,
                reviewCount: 1,
                lastReviewDate: new Date(rawEvent.timestamp),
                nextReviewDate: finalNextReviewDate,
                currentInterval: finalIntervalDays,
                easeFactor: 2.5 + (stability - 0.5) * 0.5,
                consecutiveCorrect: event.isCorrect ? 1 : 0,
                consecutiveWrong: event.isCorrect ? 0 : 1,
                halfLife: halfLifeUpdate.newHalfLife,
                version: 0, // 新记录初始版本号
              },
            });
          }

          if (!upsertedState) {
            throw new Error('Failed to upsert WordLearningState');
          }

          // 3. 用正确的 reviewCount 计算 wordState
          const reviewCount = upsertedState.reviewCount;
          const wordState = this.mapToWordState(masteryLevel, stability, reviewCount);

          // 4. 如果计算出的 wordState 与当前存储的不同，更新它
          // 这确保 update 分支的记录也有正确的 state
          if (upsertedState.state !== wordState) {
            await tx.wordLearningState.update({
              where: {
                unique_user_word: { userId, wordId: event.wordId },
              },
              data: { state: wordState },
            });
          }

          // 5. 在同一事务内计算正确率（单次查询，避免不一致）
          const answerStats = await tx.answerRecord.groupBy({
            by: ['isCorrect'],
            where: { userId, wordId: event.wordId },
            _count: { id: true },
          });
          const totalAnswers = answerStats.reduce((sum, g) => sum + g._count.id, 0);
          const correctAnswers = answerStats.find((g) => g.isCorrect)?._count.id ?? 0;
          const wordAccuracyRate = totalAnswers > 0 ? correctAnswers / totalAnswers : 0;

          // 6. 计算各维度得分（0-100）
          const accuracyScore = this.toPercentage(wordAccuracyRate);
          const speedScore = this.toPercentage(speed);
          const stabilityScore = this.toPercentage(stability);
          const proficiencyScore = this.toPercentage(mem);

          // 7. 计算加权总分
          const totalScore = Math.round(
            this.SCORE_WEIGHTS.accuracy * accuracyScore +
              this.SCORE_WEIGHTS.speed * speedScore +
              this.SCORE_WEIGHTS.stability * stabilityScore +
              this.SCORE_WEIGHTS.proficiency * proficiencyScore,
          );

          // 8. 更新 WordScore
          // Bug Fix: 同步更新totalAttempts和correctAttempts字段
          await tx.wordScore.upsert({
            where: {
              unique_user_word_score: { userId, wordId: event.wordId },
            },
            create: {
              userId,
              wordId: event.wordId,
              totalScore,
              accuracyScore,
              speedScore,
              stabilityScore,
              proficiencyScore,
              totalAttempts: totalAnswers,
              correctAttempts: correctAnswers,
            },
            update: {
              totalScore,
              accuracyScore,
              speedScore,
              stabilityScore,
              proficiencyScore,
              totalAttempts: totalAnswers,
              correctAttempts: correctAnswers,
            },
          });

          return { masteryLevel, wordState, totalScore, reviewCount };
        },
        { userId, wordId: event.wordId },
      );

      // 清除相关缓存（事务成功后）
      // 使用延迟双删策略防止并发读写不一致：
      // 1. 立即删除缓存（防止脏读）
      // 2. 延迟 100ms 后再次删除（防止并发写入穿透）
      const cacheKeysToDelete = [
        CacheKeys.USER_LEARNING_STATE(userId, event.wordId),
        CacheKeys.USER_LEARNING_STATES(userId),
        CacheKeys.USER_DUE_WORDS(userId),
        CacheKeys.USER_STATS(userId),
        CacheKeys.WORD_SCORE(userId, event.wordId),
        CacheKeys.WORD_SCORES(userId),
      ];

      // 第一次删除
      for (const key of cacheKeysToDelete) {
        cacheService.delete(key);
      }

      // 延迟双删（异步执行，不阻塞响应）
      setTimeout(() => {
        for (const key of cacheKeysToDelete) {
          cacheService.delete(key);
        }
      }, 100);

      serviceLogger.info(
        {
          userId,
          wordId: event.wordId,
          masteryLevel: updateResult.masteryLevel,
          state: updateResult.wordState,
          totalScore: updateResult.totalScore,
          reviewCount: updateResult.reviewCount,
        },
        '学习状态已更新',
      );
    } catch (error) {
      // 学习状态更新失败不影响主流程
      serviceLogger.warn({ err: error, userId, wordId: event.wordId }, '学习状态更新失败');
    }

    // 延迟奖励入队
    // 使用rawEvent.timestamp作为事件时间戳
    const eventTs = rawEvent.timestamp;
    try {
      // 计算到期时间
      const dueTs = await this.computeDueTs(userId, event.wordId, eventTs);

      // 生成幂等键
      const idempotencyKey = this.buildIdempotencyKey(userId, event.wordId, eventTs);

      // 验证reward值
      if (!Number.isFinite(result.reward)) {
        serviceLogger.warn(
          { reward: result.reward, userId, wordId: event.wordId },
          '延迟奖励: reward值无效',
        );
      } else {
        // 入队延迟奖励
        // Critical Fix #1 (Codex Review): 必须传递answerRecordId以支持特征向量精确匹配
        await delayedRewardService.enqueueDelayedReward({
          answerRecordId,
          sessionId,
          userId,
          dueTs,
          reward: result.reward,
          idempotencyKey,
        });

        serviceLogger.info(
          {
            userId,
            wordId: event.wordId,
            reward: result.reward.toFixed(3),
            dueTs: dueTs.toISOString(),
            answerRecordId: answerRecordId ?? 'n/a',
            sessionId: sessionId ?? 'null',
          },
          '延迟奖励已入队',
        );
      }
    } catch (error) {
      // 延迟奖励入队失败不影响主流程,仅记录警告
      serviceLogger.warn({ err: error, userId, wordId: event.wordId }, '延迟奖励入队失败');
    }

    // 因果推断观测记录（异步，不阻塞主流程）
    if (isCausalInferenceEnabled() && result.featureVector) {
      // 将当前策略映射为treatment（0或1）
      // 使用策略的特征维度简化为二元治疗
      const treatment = result.strategy.new_ratio > 0.3 ? 1 : 0;

      evaluationService
        .recordCausalObservation({
          userId,
          features: result.featureVector.values,
          treatment,
          outcome: result.reward,
        })
        .catch((err) => {
          serviceLogger.warn({ err, userId }, '因果观测记录失败');
        });
    }

    // ==================== A/B 测试指标记录 ====================
    // 为用户参与的所有活跃实验记录指标
    if (userExperiments.length > 0) {
      // 计算实验奖励（综合准确率、响应速度、掌握度提升）
      const experimentReward = this.calculateExperimentReward(event, result);

      // 异步记录所有实验的指标
      Promise.all(
        userExperiments.map((exp) =>
          experimentService
            .recordMetric(exp.experimentId, exp.variantId, experimentReward)
            .catch((err) => {
              serviceLogger.warn(
                { err, userId, experimentId: exp.experimentId, variantId: exp.variantId },
                '[A/B Test] 记录实验指标失败',
              );
            }),
        ),
      ).then(() => {
        serviceLogger.debug(
          { userId, experimentsCount: userExperiments.length, reward: experimentReward.toFixed(3) },
          '[A/B Test] 实验指标已记录',
        );
      });
    }
    // ==================== A/B 测试指标记录结束 ====================

    // 个性化阈值学习：记录行为观察（用于贝叶斯阈值更新）
    // 当有有效的视觉疲劳数据时，记录行为指标供阈值学习器使用
    if (visualFatigueData && visualFatigueData.isValid) {
      try {
        // 计算行为指标
        const behaviorMetrics = {
          // 错误率：当前事件是否错误
          errorRate: event.isCorrect ? 0 : 1,
          // 响应时间增加率：与平均响应时间比较
          responseTimeIncrease:
            stats.recentAccuracy > 0
              ? Math.max(0, (event.responseTime - 3000) / 3000) // 假设 3000ms 为基准
              : 0,
          // 行为疲劳评分
          fatigueScore: result.state.F,
        };

        // 记录观察，触发阈值学习
        defaultVisualFatigueProcessor.recordBehaviorObservation(userId, behaviorMetrics);

        serviceLogger.debug(
          { userId, behaviorMetrics, visualScore: visualFatigueData.score },
          '阈值学习: 已记录行为观察',
        );
      } catch (error) {
        // 阈值学习失败不影响主流程
        serviceLogger.warn({ err: error, userId }, '阈值学习记录失败');
      }
    }

    // 计算单词掌握判定（仅用于掌握度学习模式,避免普通模式的性能损失）
    let wordMasteryDecision: import('../amas/core/engine').WordMasteryDecision | undefined;

    if (sessionId) {
      // 仅在掌握模式下(有sessionId)才计算,避免不必要的数据库查询
      wordMasteryDecision = await this.calculateWordMasteryDecision(
        userId,
        event.wordId,
        event.isCorrect,
        event.responseTime,
        result.state,
      );
    }

    // 将掌握判定添加到结果中
    const enrichedResult = {
      ...result,
      wordMasteryDecision,
    };

    return enrichedResult;
  }

  /**
   * 计算单词掌握判定
   * 基于认知状态、答题历史和当前表现综合判断
   */
  private async calculateWordMasteryDecision(
    userId: string,
    wordId: string,
    isCorrect: boolean,
    responseTime: number,
    state: UserState,
  ): Promise<import('../amas/core/engine').WordMasteryDecision> {
    try {
      // 1. 查询单词的历史学习数据
      const learningState = await prisma.wordLearningState.findUnique({
        where: {
          unique_user_word: { userId, wordId },
        },
        select: {
          consecutiveCorrect: true,
          consecutiveWrong: true,
          reviewCount: true,
          masteryLevel: true,
        },
      });

      // 2. 查询最近的答题记录（用于判断稳定性）
      const recentRecords = await prisma.answerRecord.findMany({
        where: { userId, wordId },
        orderBy: { timestamp: 'desc' },
        take: 5,
        select: { isCorrect: true, responseTime: true },
      });

      // 3. 从AMAS状态提取认知指标
      const memory = this.clamp01(state.C.mem); // 记忆能力 [0,1]
      const stability = this.clamp01(state.C.stability); // 稳定性 [0,1]
      const speed = this.clamp01(state.C.speed); // 速度 [0,1]

      // 4. 计算综合掌握度分数
      let masteryScore = 0;
      let confidence = 0.5; // 默认置信度

      // 4.1 认知状态得分 (权重40%)
      const cognitiveScore = (memory * 0.5 + stability * 0.3 + speed * 0.2) * 0.4;
      masteryScore += cognitiveScore;

      // 4.2 历史表现得分 (权重35%)
      if (learningState) {
        const consecutiveScore = Math.min(learningState.consecutiveCorrect / 3, 1); // 连续正确 [0,1]
        const masteryLevelScore = learningState.masteryLevel / 5; // 掌握等级 [0,1]
        // 组合历史得分：连续正确权重60%，掌握等级权重40%，总体占35%
        const combinedHistoryScore = consecutiveScore * 0.6 + masteryLevelScore * 0.4;
        masteryScore += combinedHistoryScore * 0.35;
      }

      // 4.3 当前表现得分 (权重25%)
      const currentPerformanceScore = isCorrect ? 0.25 : 0;
      const timeBonus = responseTime < 3000 ? 0.05 : 0; // 快速回答加分
      masteryScore += currentPerformanceScore + timeBonus;

      // 4.4 最近稳定性得分 (计算置信度)
      if (recentRecords.length >= 3) {
        const recentCorrectRate =
          recentRecords.filter((r) => r.isCorrect).length / recentRecords.length;
        const recentAvgTime =
          recentRecords.reduce((sum, r) => sum + (r.responseTime || 0), 0) / recentRecords.length;

        confidence = recentCorrectRate * 0.7 + (recentAvgTime < 5000 ? 0.3 : 0.1);
      }

      // 5. 掌握判定逻辑
      const isMastered = masteryScore >= 0.75 && confidence >= 0.7;

      // 6. 建议重复次数
      let suggestedRepeats = 2; // 默认2次
      if (masteryScore < 0.5) {
        suggestedRepeats = 4; // 掌握度低，建议多练
      } else if (masteryScore >= 0.75) {
        suggestedRepeats = 1; // 掌握度高，只需再练1次
      }

      serviceLogger.info(
        {
          userId,
          wordId,
          score: masteryScore.toFixed(2),
          confidence: confidence.toFixed(2),
          isMastered,
          suggestedRepeats,
        },
        '掌握判定完成',
      );

      return {
        isMastered,
        confidence: this.clamp01(confidence),
        suggestedRepeats,
      };
    } catch (error) {
      serviceLogger.warn({ err: error, userId, wordId }, '掌握判定计算失败');

      // 降级策略：使用简单规则
      return {
        isMastered: false,
        confidence: 0.5,
        suggestedRepeats: 2,
      };
    }
  }

  /**
   * 持久化特征向量到数据库
   * Critical Fix: 使用answerRecordId而非sessionId作为唯一键，避免同session多次答题时覆盖
   * @param answerRecordId 答题记录ID（必需，确保特征向量唯一性）
   * @param sessionId 学习会话ID（可选，用于诊断和向后兼容）
   * @param featureVector 可序列化的特征向量
   */
  private async persistFeatureVector(
    answerRecordId: string | undefined,
    sessionId: string | undefined,
    featureVector: {
      values: number[];
      version: number;
      normMethod?: string;
      ts: number;
      labels: string[];
    },
  ): Promise<void> {
    if (!answerRecordId) {
      serviceLogger.warn('FeatureVector持久化跳过: answerRecordId缺失，无法保证唯一性');
      recordFeatureVectorSaved('failure');
      return;
    }

    // Bug Fix: sessionId为空时跳过持久化，避免使用auto-前缀违反外键约束
    // FeatureVector.sessionId 是 LearningSession 的外键，必须是有效的会话ID
    if (!sessionId) {
      serviceLogger.warn(
        { answerRecordId },
        'FeatureVector持久化跳过: sessionId缺失，无法满足外键约束',
      );
      recordFeatureVectorSaved('failure');
      return;
    }

    const effectiveSessionId = sessionId;

    try {
      // 使用主键 (sessionId_featureVersion) 进行 upsert
      // 同时确保 answerRecordId 在 update 时也被更新，保持数据一致性
      await prisma.featureVector.upsert({
        where: {
          sessionId_featureVersion: {
            sessionId: effectiveSessionId,
            featureVersion: featureVector.version,
          },
        },
        update: {
          answerRecordId,
          features: {
            values: featureVector.values,
            labels: featureVector.labels,
            ts: featureVector.ts,
          },
          normMethod: featureVector.normMethod ?? null,
        },
        create: {
          answerRecordId,
          sessionId: effectiveSessionId,
          featureVersion: featureVector.version,
          features: {
            values: featureVector.values,
            labels: featureVector.labels,
            ts: featureVector.ts,
          },
          normMethod: featureVector.normMethod ?? null,
        },
      });

      recordFeatureVectorSaved('success');
      serviceLogger.info(
        { answerRecordId, sessionId: sessionId ?? 'null' },
        'FeatureVector持久化成功',
      );
    } catch (error) {
      recordFeatureVectorSaved('failure');
      serviceLogger.warn(
        { err: error, answerRecordId, sessionId: sessionId ?? 'null' },
        'FeatureVector持久化失败',
      );
    }
  }

  /**
   * 确保学习会话存在
   * 使用事务+锁定查询避免 TOCTOU 竞态条件
   * @param sessionId 学习会话ID
   * @param userId 用户ID
   */
  private async ensureLearningSession(sessionId: string, userId: string): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        // 先尝试查询现有会话（带锁定）
        const existing = await tx.learningSession.findUnique({
          where: { id: sessionId },
        });

        if (existing) {
          // 会话已存在，校验用户归属
          if (existing.userId !== userId) {
            serviceLogger.warn(
              { sessionId, expected: userId, actual: existing.userId },
              '学习会话用户不匹配',
            );
            throw new Error(`Session ${sessionId} belongs to different user`);
          }
          // 用户匹配，无需操作
          return;
        }

        // 会话不存在，创建新会话
        await tx.learningSession.create({
          data: {
            id: sessionId,
            userId,
          },
        });
      });

      serviceLogger.info({ sessionId, userId }, '学习会话已确保');
    } catch (error) {
      // 处理并发创建时的唯一约束冲突
      // 使用 Prisma 错误码 P2002 替代字符串匹配
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // 再次检查会话归属
        const session = await prisma.learningSession.findUnique({
          where: { id: sessionId },
        });
        if (session && session.userId !== userId) {
          throw new Error(`Session ${sessionId} belongs to different user`);
        }
        // 如果是同一用户的并发请求，忽略错误
        serviceLogger.info({ sessionId, userId }, '学习会话已由并发请求创建');
        return;
      }

      serviceLogger.error({ err: error, sessionId, userId }, '确保学习会话失败');
      throw error;
    }
  }

  /**
   * 获取用户当前状态
   */
  async getUserState(userId: string): Promise<UserState | null> {
    return this.engine.getState(userId);
  }

  /**
   * 获取用户当前策略
   */
  async getCurrentStrategy(userId: string): Promise<StrategyParams | null> {
    const cacheKey = `${CacheKeys.USER_STRATEGY}:${userId}`;
    return cacheService.get<StrategyParams>(cacheKey);
  }

  /**
   * 重置用户AMAS状态
   */
  async resetUser(userId: string): Promise<void> {
    await this.engine.resetUser(userId);

    // 清除缓存
    const cacheKey = `${CacheKeys.USER_STRATEGY}:${userId}`;
    cacheService.delete(cacheKey);
  }

  /**
   * 获取用户冷启动阶段
   */
  getColdStartPhase(userId: string): ColdStartPhase {
    return this.engine.getColdStartPhase(userId);
  }

  /**
   * 获取 AMAS 功能开关状态
   * 用于调试和监控
   */
  getFeatureFlags(): {
    flags: ReturnType<typeof getFeatureFlags>;
    summary: string;
    ensembleEnabled: boolean;
    causalInferenceEnabled: boolean;
    bayesianOptimizerEnabled: boolean;
  } {
    return {
      flags: getFeatureFlags(),
      summary: getFeatureFlagsSummary(),
      ensembleEnabled: isEnsembleEnabled(),
      causalInferenceEnabled: isCausalInferenceEnabled(),
      bayesianOptimizerEnabled: isBayesianOptimizerEnabled(),
    };
  }

  /**
   * 延迟奖励应用结果
   */
  static readonly DelayedRewardResult = {
    SUCCESS: 'success',
    INVALID_REWARD: 'invalid_reward',
    NO_FEATURE_VECTOR: 'no_feature_vector',
    MODEL_UPDATE_FAILED: 'model_update_failed',
  } as const;

  /**
   * 应用延迟奖励 (用于异步奖励补记)
   * @param userId 用户ID
   * @param reward 延迟奖励值
   * @param sessionId 可选的学习会话ID (用于获取特征向量)
   * @returns 操作结果，包含成功状态和失败原因
   */
  async applyDelayedReward(
    userId: string,
    reward: number,
    sessionId?: string,
    answerRecordId?: string,
  ): Promise<{
    success: boolean;
    result: (typeof AMASService.DelayedRewardResult)[keyof typeof AMASService.DelayedRewardResult];
    error?: string;
  }> {
    try {
      // 校验并裁剪reward值到合理区间 [-1, 1]（与实时奖励保持一致）
      if (typeof reward !== 'number' || !Number.isFinite(reward)) {
        const errorMsg = `无效的reward值 ${reward}`;
        serviceLogger.warn(
          {
            reward,
            userId,
            answerRecordId: answerRecordId ?? 'n/a',
            sessionId: sessionId ?? 'n/a',
          },
          `延迟奖励: ${errorMsg}`,
        );
        return {
          success: false,
          result: AMASService.DelayedRewardResult.INVALID_REWARD,
          error: errorMsg,
        };
      }
      const clampedReward = Math.max(-1, Math.min(1, reward));
      if (clampedReward !== reward) {
        serviceLogger.warn(
          { original: reward, clamped: clampedReward, userId },
          '延迟奖励: reward值被裁剪',
        );
      }

      // Critical Fix: 优先使用answerRecordId查找特征向量，回退到sessionId以兼容旧数据
      let featureVector: number[] | null = null;

      // 构建查询条件：优先answerRecordId，其次sessionId
      const vectorWhere = answerRecordId ? { answerRecordId } : sessionId ? { sessionId } : null;

      if (vectorWhere) {
        // 获取最新版本的特征向量
        const storedVector = await prisma.featureVector.findFirst({
          where: vectorWhere,
          orderBy: { featureVersion: 'desc' },
        });

        if (storedVector && storedVector.features) {
          // features字段是Json类型，需要验证和转换
          const features = storedVector.features;

          // 类型守卫: 检查是否为数字数组
          const isNumberArray = (values: unknown): values is number[] =>
            Array.isArray(values) && values.every((v): v is number => typeof v === 'number');

          // 向后兼容: 支持直接数组格式
          if (isNumberArray(features)) {
            featureVector = features;
            serviceLogger.info(
              { userId, answerRecordId: answerRecordId ?? 'n/a', sessionId: sessionId ?? 'n/a' },
              '延迟奖励: 使用数组格式特征向量',
            );
          }
          // 当前格式: 对象 {values, labels, ts}
          else if (features && typeof features === 'object' && 'values' in features) {
            const featureObj = features as { values?: unknown; labels?: unknown; ts?: unknown };
            if (isNumberArray(featureObj.values)) {
              featureVector = featureObj.values;
              serviceLogger.info(
                { userId, answerRecordId: answerRecordId ?? 'n/a', sessionId: sessionId ?? 'n/a' },
                '延迟奖励: 使用对象格式特征向量',
              );
            } else {
              serviceLogger.warn(
                { userId, answerRecordId: answerRecordId ?? 'n/a', sessionId: sessionId ?? 'n/a' },
                '延迟奖励: 特征向量values字段无效（非数字数组）',
              );
            }
          } else {
            serviceLogger.warn(
              { userId, answerRecordId: answerRecordId ?? 'n/a', sessionId: sessionId ?? 'n/a' },
              '延迟奖励: 无法识别的特征向量格式',
            );
          }
        }
      }

      // 如果没有存储的特征向量，返回失败结果
      if (!featureVector) {
        const errorMsg = '未找到有效特征向量，跳过模型更新';
        serviceLogger.warn(
          { userId, answerRecordId: answerRecordId ?? 'n/a', sessionId: sessionId ?? 'n/a' },
          `延迟奖励: ${errorMsg}`,
        );
        return {
          success: false,
          result: AMASService.DelayedRewardResult.NO_FEATURE_VECTOR,
          error: errorMsg,
        };
      }

      // 使用引擎提供的公共方法应用延迟奖励
      const result = await this.engine.applyDelayedRewardUpdate(
        userId,
        featureVector,
        clampedReward,
      );

      if (!result.success) {
        const errorMsg = `模型更新失败: ${result.error}`;
        serviceLogger.warn(
          {
            userId,
            answerRecordId: answerRecordId ?? 'n/a',
            sessionId: sessionId ?? 'n/a',
            error: result.error,
          },
          `延迟奖励: ${errorMsg}`,
        );
        return {
          success: false,
          result: AMASService.DelayedRewardResult.MODEL_UPDATE_FAILED,
          error: errorMsg,
        };
      }

      serviceLogger.info(
        {
          userId,
          reward: clampedReward.toFixed(3),
          answerRecordId: answerRecordId ?? 'n/a',
          sessionId: sessionId ?? 'n/a',
        },
        '延迟奖励已应用',
      );
      return {
        success: true,
        result: AMASService.DelayedRewardResult.SUCCESS,
      };
    } catch (error) {
      serviceLogger.error({ err: error }, '应用延迟奖励失败');
      throw error;
    }
  }

  /**
   * 批量处理事件（用于历史数据导入）
   *
   * 注意：此方法为轻量级批处理，不会创建 AnswerRecord 记录。
   * 仅更新用户状态和学习策略，适用于历史数据迁移或批量状态同步场景。
   * 如需记录完整答题历史，请使用 processLearningEvent 方法。
   */
  async batchProcessEvents(
    userId: string,
    events: Array<{
      wordId: string;
      isCorrect: boolean;
      responseTime: number;
      timestamp: number;
    }>,
  ): Promise<{ processed: number; finalStrategy: StrategyParams }> {
    let finalResult: ProcessResult | null = null;

    for (const event of events) {
      const rawEvent: RawEvent = {
        ...event,
        dwellTime: 0,
        pauseCount: 0,
        switchCount: 0,
        retryCount: 0,
        focusLossDuration: 0,
        interactionDensity: 1.0,
      };

      finalResult = await this.engine.processEvent(userId, rawEvent, {
        skipUpdate: false,
      });
    }

    return {
      processed: events.length,
      finalStrategy:
        finalResult?.strategy ??
        (await this.getCurrentStrategy(userId)) ??
        this.getDefaultStrategy(),
    };
  }

  /**
   * 获取默认策略
   */
  getDefaultStrategy(): StrategyParams {
    return {
      interval_scale: 1.0,
      new_ratio: 0.2,
      difficulty: 'mid',
      batch_size: 8,
      hint_level: 1,
    };
  }

  /**
   * 缓存策略
   */
  private async cacheStrategy(userId: string, strategy: StrategyParams): Promise<void> {
    const cacheKey = `${CacheKeys.USER_STRATEGY}:${userId}`;
    cacheService.set(cacheKey, strategy, CacheTTL.USER_STRATEGY);
  }

  /**
   * 获取用户统计数据
   */
  private async getUserStats(userId: string): Promise<{
    interactionCount: number;
    recentAccuracy: number;
  }> {
    // 使用事务合并查询，减少数据库往返次数
    const [recentRecords, interactionCount] = await prisma.$transaction([
      prisma.answerRecord.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: 20,
      }),
      prisma.answerRecord.count({
        where: { userId },
      }),
    ]);

    const recentAccuracy =
      recentRecords.length > 0
        ? recentRecords.filter((r) => r.isCorrect).length / recentRecords.length
        : 0.5;

    return {
      interactionCount,
      recentAccuracy,
    };
  }

  /**
   * 获取单词复习历史（用于 ACT-R 记忆模型）
   *
   * 查询指定单词的历史答题记录，转换为 ACT-R 需要的 trace 格式
   * @param userId 用户ID
   * @param wordId 单词ID
   * @returns 复习历史记录数组（最多返回最近 20 条）
   */
  private async getWordReviewHistory(
    userId: string,
    wordId: string,
  ): Promise<Array<{ secondsAgo: number; isCorrect?: boolean }>> {
    try {
      const now = Date.now();

      // 查询该单词的历史答题记录（按时间倒序，最多 20 条）
      const records = await prisma.answerRecord.findMany({
        where: {
          userId,
          wordId,
        },
        orderBy: { timestamp: 'desc' },
        take: 20,
        select: {
          timestamp: true,
          isCorrect: true,
        },
      });

      // 转换为 ACT-R trace 格式
      return records.map((record) => ({
        // 计算距今时间（秒）
        secondsAgo: Math.max(1, Math.floor((now - record.timestamp.getTime()) / 1000)),
        isCorrect: record.isCorrect,
      }));
    } catch (error) {
      // 查询失败时返回空数组，不影响主流程
      serviceLogger.warn({ err: error, userId, wordId }, '获取单词复习历史失败');
      return [];
    }
  }

  /**
   * 获取会话统计数据（用于多目标优化）
   */
  private async getSessionStats(
    userId: string,
    sessionId: string,
  ): Promise<{
    accuracy: number;
    avgResponseTime: number;
    retentionRate: number;
    reviewSuccessRate: number;
    memoryStability: number;
    wordsPerMinute: number;
    timeUtilization: number;
    cognitiveLoad: number;
    sessionDuration: number;
  }> {
    const session = await prisma.learningSession.findUnique({
      where: { id: sessionId },
      include: {
        answerRecords: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!session || !session.answerRecords.length) {
      return {
        accuracy: 0.5,
        avgResponseTime: 5000,
        retentionRate: 0.5,
        reviewSuccessRate: 0.5,
        memoryStability: 0.5,
        wordsPerMinute: 2,
        timeUtilization: 0.5,
        cognitiveLoad: 0.5,
        sessionDuration: 0,
      };
    }

    const records = session.answerRecords;
    const correctCount = records.filter((r) => r.isCorrect).length;
    const accuracy = correctCount / records.length;

    const avgResponseTime =
      records.reduce((sum, r) => sum + (r.responseTime || 0), 0) / records.length;

    const sessionDuration = session.endedAt
      ? session.endedAt.getTime() - session.startedAt.getTime()
      : Date.now() - session.startedAt.getTime();

    const durationMinutes = Math.max(sessionDuration / 60000, 0.1);
    const wordsPerMinute = records.length / durationMinutes;

    const recentWords = await prisma.answerRecord.count({
      where: {
        userId,
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    const reviewWords = await prisma.answerRecord.count({
      where: {
        userId,
        wordId: { in: records.map((r) => r.wordId) },
        timestamp: {
          lt: session.startedAt,
        },
      },
    });

    const retentionRate = reviewWords > 0 ? accuracy : 0.5;
    const reviewSuccessRate = reviewWords > 0 ? correctCount / records.length : 0.5;

    const userState = await this.getUserState(userId);
    const memoryStability = userState?.C.stability || 0.5;

    const expectedWPM = 3;
    const timeUtilization = Math.min(wordsPerMinute / expectedWPM, 1);

    const responseTimeVariance = this.calculateVariance(records.map((r) => r.responseTime || 0));
    const normalizedVariance = Math.min(responseTimeVariance / 10000, 1);
    const cognitiveLoad = 0.5 + (avgResponseTime / 10000) * 0.3 + normalizedVariance * 0.2;

    return {
      accuracy,
      avgResponseTime,
      retentionRate,
      reviewSuccessRate,
      memoryStability,
      wordsPerMinute,
      timeUtilization,
      cognitiveLoad: Math.min(cognitiveLoad, 1),
      sessionDuration,
    };
  }

  /**
   * 计算方差
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * 构建视觉疲劳数据对象
   * 将原始视觉数据转换为 ProcessedVisualFatigueData 格式
   */
  private buildVisualFatigueData(
    userId: string,
    visualData: {
      score: number;
      confidence: number;
      freshness: number;
      isValid: boolean;
      timestamp: number;
      metrics?: {
        perclos: number;
        blinkRate: number;
        yawnCount: number;
        headPitch: number;
        headYaw: number;
        headRoll?: number;
        eyeAspectRatio?: number;
        avgBlinkDuration?: number;
        gazeOffScreenRatio?: number;
        expressionFatigueScore?: number;
        squintIntensity?: number;
        browDownIntensity?: number;
        mouthOpenRatio?: number;
        headStability?: number;
      };
    },
  ): ProcessedVisualFatigueData {
    const metrics = visualData.metrics;

    // 构建认知信号（从 metrics 中提取）
    // 优先使用前端上报的真实数据，无数据时使用近似计算
    const cognitiveSignals: VisualCognitiveSignals | undefined = metrics
      ? {
          attentionSignals: {
            // 头部姿态稳定性：优先使用 headStability，否则基于角度偏移计算
            headPoseStability:
              metrics.headStability ??
              Math.max(0, 1 - Math.abs(metrics.headPitch) - Math.abs(metrics.headYaw)),
            // 眯眼强度：优先使用 squintIntensity，否则基于 PERCLOS 近似
            eyeSquint:
              metrics.squintIntensity ??
              (metrics.perclos > 0.1 ? Math.min(metrics.perclos * 2, 1) : 0),
            // 视线离屏比例：优先使用 gazeOffScreenRatio，否则基于头部偏转近似
            gazeOffScreen: metrics.gazeOffScreenRatio ?? Math.min(Math.abs(metrics.headYaw) * 2, 1),
          },
          fatigueSignals: {
            perclos: metrics.perclos,
            // 眨眼疲劳：基于眨眼频率计算（正常 15-20 次/分钟）
            blinkFatigue: metrics.blinkRate > 25 ? Math.min((metrics.blinkRate - 25) / 15, 1) : 0,
            // 打哈欠评分
            yawnScore: Math.min(metrics.yawnCount / 3, 1),
          },
          motivationSignals: {
            // 皱眉强度：优先使用 browDownIntensity，否则基于疲劳评分近似
            browDown:
              metrics.browDownIntensity ??
              (visualData.score > 0.6 ? (visualData.score - 0.6) * 2.5 : 0),
            // 嘴角下垂：优先使用 mouthOpenRatio 推断，否则基于打哈欠近似
            mouthCornerDown:
              metrics.mouthOpenRatio !== undefined
                ? Math.min(metrics.mouthOpenRatio * 0.5, 1)
                : metrics.yawnCount > 0
                  ? 0.3
                  : 0,
          },
          confidence: visualData.confidence,
          timestamp: visualData.timestamp,
        }
      : undefined;

    return {
      score: visualData.score,
      confidence: visualData.confidence,
      freshness: visualData.freshness,
      isValid: visualData.isValid,
      trend: defaultVisualFatigueProcessor.getTrend(userId, 5), // 获取趋势
      timestamp: visualData.timestamp,
      cognitiveSignals, // 传递认知信号
      metrics: metrics
        ? {
            // 使用前端上报的真实数据，无数据时使用近似或默认值
            eyeAspectRatio: metrics.eyeAspectRatio ?? 0.3, // EAR 正常值约 0.25-0.35
            blinkRate: metrics.blinkRate,
            avgBlinkDuration: metrics.avgBlinkDuration ?? 150, // 正常眨眼持续约 100-400ms
            perclos: metrics.perclos,
            yawnCount: metrics.yawnCount,
            headPose: {
              pitch: metrics.headPitch,
              yaw: metrics.headYaw,
              roll: metrics.headRoll ?? 0,
            },
            gazeOffScreenRatio:
              metrics.gazeOffScreenRatio ?? Math.min(Math.abs(metrics.headYaw) * 2, 1),
            visualFatigueScore: visualData.score,
            timestamp: visualData.timestamp,
            confidence: visualData.confidence,
            // 扩展指标：直接传递前端真实数据
            expressionFatigueScore: metrics.expressionFatigueScore,
            squintIntensity: metrics.squintIntensity,
            browDownIntensity: metrics.browDownIntensity,
            mouthOpenRatio: metrics.mouthOpenRatio,
            headStability: metrics.headStability,
          }
        : undefined,
    };
  }

  /**
   * 计算 A/B 测试实验奖励
   * 综合考虑准确率、响应速度和掌握度变化
   *
   * 奖励公式：
   * - 准确率权重 50%：答对得 1，答错得 0
   * - 速度奖励权重 20%：10秒内响应可获得最高分
   * - 掌握度权重 30%：基于认知状态（记忆、稳定性、速度）的综合提升
   *
   * @param event 学习事件
   * @param result 处理结果
   * @returns 归一化奖励值 [0, 1]
   */
  private calculateExperimentReward(
    event: { isCorrect: boolean; responseTime: number },
    result: ProcessResult,
  ): number {
    // 1. 准确率得分（0 或 1）
    const accuracy = event.isCorrect ? 1 : 0;

    // 2. 速度奖励（0-1），10秒内响应可获得最高分
    // responseTime 单位是毫秒，10000ms = 10秒
    const speedBonus = Math.max(0, 1 - event.responseTime / 10000);

    // 3. 掌握度得分：基于认知状态的综合评估
    // 使用 AMAS 状态中的认知指标
    const mem = this.clamp01(result.state.C.mem);
    const stability = this.clamp01(result.state.C.stability);
    const speed = this.clamp01(result.state.C.speed);

    // 加权计算掌握度（与 mapToMasteryLevel 一致）
    const masteryScore = 0.6 * mem + 0.3 * stability + 0.1 * speed;

    // 4. 综合奖励计算
    // 权重分配：准确率 50%，速度 20%，掌握度 30%
    const reward = 0.5 * accuracy + 0.2 * speedBonus + 0.3 * masteryScore;

    // 确保返回值在 [0, 1] 范围内
    return this.clamp01(reward);
  }

  /**
   * 记录决策日志（用于分析和调试）
   */
  private async logDecision(userId: string, result: ProcessResult): Promise<void> {
    try {
      // 可以将决策记录存入数据库或日志系统
      // 暂时使用简化实现
      serviceLogger.info(
        {
          userId,
          strategy: result.strategy,
          state: {
            A: result.state.A.toFixed(2),
            F: result.state.F.toFixed(2),
            M: result.state.M.toFixed(2),
          },
          reward: result.reward.toFixed(3),
          explanation: result.explanation,
        },
        'AMAS Decision',
      );
    } catch (error) {
      serviceLogger.error({ err: error }, 'Failed to log decision');
    }
  }
}

// 导出单例实例
export const amasService = new AMASService();
