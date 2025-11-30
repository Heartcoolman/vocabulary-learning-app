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
  ColdStartPhase
} from '../amas';
import { databaseStateRepository, databaseModelRepository } from '../amas/repositories';
import {
  getFeatureFlags,
  getFeatureFlagsSummary,
  isEnsembleEnabled,
  isCausalInferenceEnabled,
  isBayesianOptimizerEnabled
} from '../amas/config/feature-flags';
import { cacheService, CacheKeys, CacheTTL } from './cache.service';
import { recordFeatureVectorSaved } from './metrics.service';
import prisma from '../config/database';
import { delayedRewardService } from './delayed-reward.service';
import { stateHistoryService } from './state-history.service';
import { habitProfileService } from './habit-profile.service';
import { evaluationService } from './evaluation.service';
import { Prisma, WordState } from '@prisma/client';

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
    proficiency: 0.2
  } as const;

  constructor() {
    // 初始化AMAS引擎（使用数据库持久化仓库）
    this.engine = new AMASEngine({
      stateRepo: databaseStateRepository,
      modelRepo: databaseModelRepository
    });

    // 记录功能开关状态
    console.log('[AMAS Service] 初始化完成');
    console.log(getFeatureFlagsSummary());
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
  private async computeDueTs(
    userId: string,
    wordId: string,
    eventTs: number
  ): Promise<Date> {
    try {
      // 查询单词学习状态
      const learningState = await prisma.wordLearningState.findUnique({
        where: {
          unique_user_word: {
            userId,
            wordId
          }
        },
        select: {
          nextReviewDate: true,
          currentInterval: true
        }
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
      console.warn(
        `[AMAS] 计算延迟奖励到期时间失败,使用默认值: userId=${userId}, wordId=${wordId}`,
        error
      );
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
  private buildIdempotencyKey(
    userId: string,
    wordId: string,
    timestamp: number
  ): string {
    return `${userId}:${wordId}:${timestamp}`;
  }

  /**
   * 执行带重试机制的事务操作
   * 用于处理高并发场景下的事务超时问题
   */
  private async runWordStateTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    context: { userId: string; wordId: string }
  ): Promise<T> {
    const maxAttempts = 3;
    const baseDelayMs = 100;
    const txOptions = { maxWait: 5_000, timeout: 20_000 };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await prisma.$transaction(operation, txOptions);
      } catch (error) {
        if (!this.isRetryableTransactionError(error) || attempt === maxAttempts) {
          throw error;
        }
        const backoffMs = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[AMAS] 事务开启等待超时，准备重试: userId=${context.userId}, wordId=${context.wordId}, attempt=${attempt + 1}, backoff=${backoffMs}ms`
        );
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
    throw new Error('Transaction retries exhausted');
  }

  /**
   * 检查是否为可重试的事务错误
   */
  private isRetryableTransactionError(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // P2024: 连接池等待超时；P2034: 事务被中断/超时
      return error.code === 'P2024' || error.code === 'P2034';
    }
    return error instanceof Error &&
      error.message.includes('Unable to start a transaction in the given time');
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
    },
    sessionId?: string
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
      interactionDensity: event.interactionDensity ?? 1.0
    };

    // 记录学习时间事件（用于习惯画像）
    habitProfileService.recordTimeEvent(userId, rawEvent.timestamp);

    // 定期自动持久化习惯画像（每 10 个事件检查一次）
    // 使用异步方式，不阻塞主流程
    const profile = habitProfileService.getHabitProfile(userId);
    if (profile.samples.timeEvents >= 10 && profile.samples.timeEvents % 10 === 0) {
      habitProfileService.persistHabitProfile(userId).catch((error) => {
        console.warn(`[AMAS] 习惯画像自动持久化失败: userId=${userId}`, error);
      });
    }

    // 确保学习会话存在（用于答题记录和特征向量持久化）
    // 提前创建学习会话，避免后续外键约束失败
    if (sessionId) {
      await this.ensureLearningSession(sessionId, userId);
    }

    // 存储答题记录（用于统计和历史查询）
    // 必须在获取统计数据前存储，以确保当前事件计入统计
    try {
      await prisma.answerRecord.create({
        data: {
          userId,
          wordId: event.wordId,
          isCorrect: event.isCorrect,
          responseTime: event.responseTime,
          dwellTime: event.dwellTime ?? 0,
          timestamp: new Date(rawEvent.timestamp),
          sessionId: sessionId ?? null,
          selectedAnswer: '',
          correctAnswer: ''
        }
      });
    } catch (error) {
      // 如果是唯一约束冲突（重复记录），忽略错误
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        console.log(`[AMAS] 跳过重复答题记录: userId=${userId}, wordId=${event.wordId}`);
      } else {
        // 其他错误仅记录警告，不阻断主流程
        console.warn(`[AMAS] 存储答题记录失败: userId=${userId}, wordId=${event.wordId}`, error);
      }
    }

    // 获取当前策略和统计
    const currentStrategy = await this.getCurrentStrategy(userId);
    const stats = await this.getUserStats(userId);

    // 处理事件
    const result = await this.engine.processEvent(userId, rawEvent, {
      currentParams: currentStrategy ?? undefined,
      interactionCount: stats.interactionCount,
      recentAccuracy: stats.recentAccuracy
    });

    // 缓存新策略
    await this.cacheStrategy(userId, result.strategy);

    // 持久化特征向量（用于延迟奖励）
    console.log(`[AMAS] processLearningEvent: sessionId=${sessionId}, hasFeatureVector=${!!result.featureVector}`);

    if (sessionId && result.featureVector) {
      console.log(`[AMAS] 准备保存特征向量: version=${result.featureVector.version}, dimension=${result.featureVector.values.length}`);
      await this.persistFeatureVector(sessionId, result.featureVector);
    } else {
      if (!sessionId) {
        console.warn('[AMAS] 未保存特征向量: sessionId为空');
      }
      if (!result.featureVector) {
        console.warn('[AMAS] 未保存特征向量: featureVector为空');
      }
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
          stability: result.state.C.stability
        },
        T: result.state.T
      });
      console.log(`[AMAS] 状态快照已保存: userId=${userId}`);
    } catch (error) {
      // 状态快照保存失败不影响主流程
      console.warn(`[AMAS] 状态快照保存失败: userId=${userId}`, error);
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
      const safeIntervalScale = Number.isFinite(result.strategy.interval_scale) &&
        result.strategy.interval_scale > 0
          ? result.strategy.interval_scale
          : 1.0; // 异常值回退到默认值 1.0

      // 计算下次复习间隔（基于策略的 interval_scale）
      const baseIntervalDays = Math.max(1, masteryLevel); // 基础间隔天数与掌握等级相关
      const intervalDays = baseIntervalDays * safeIntervalScale;

      // 使用事务保证原子性：读取当前状态、计算新值、更新状态和得分
      const updateResult = await this.runWordStateTransaction(async (tx) => {
        // 1. 计算下次复习时间
        const nextReviewDate = new Date(rawEvent.timestamp + intervalDays * 24 * 60 * 60 * 1000);

        // 2. 使用 upsert 原子更新学习状态
        // create 分支：首次学习，reviewCount = 1
        // update 分支：已有记录，reviewCount 原子递增
        // 先计算 reviewCount=1 时的初始状态（用于 create 分支）
        const initialWordState = this.mapToWordState(masteryLevel, stability, 1);

        const upsertedState = await tx.wordLearningState.upsert({
          where: {
            unique_user_word: { userId, wordId: event.wordId }
          },
          create: {
            userId,
            wordId: event.wordId,
            masteryLevel,
            state: initialWordState,
            reviewCount: 1,
            lastReviewDate: new Date(rawEvent.timestamp),
            nextReviewDate,
            currentInterval: intervalDays,
            easeFactor: 2.5 + (stability - 0.5) * 0.5
          },
          update: {
            masteryLevel,
            reviewCount: { increment: 1 }, // 原子递增
            lastReviewDate: new Date(rawEvent.timestamp),
            nextReviewDate,
            currentInterval: intervalDays,
            easeFactor: 2.5 + (stability - 0.5) * 0.5
          }
        });

        // 3. 用正确的 reviewCount 计算 wordState
        const reviewCount = upsertedState.reviewCount;
        const wordState = this.mapToWordState(masteryLevel, stability, reviewCount);

        // 4. 如果计算出的 wordState 与当前存储的不同，更新它
        // 这确保 update 分支的记录也有正确的 state
        if (upsertedState.state !== wordState) {
          await tx.wordLearningState.update({
            where: {
              unique_user_word: { userId, wordId: event.wordId }
            },
            data: { state: wordState }
          });
        }

        // 5. 在同一事务内计算正确率（单次查询，避免不一致）
        const answerStats = await tx.answerRecord.groupBy({
          by: ['isCorrect'],
          where: { userId, wordId: event.wordId },
          _count: { id: true }
        });
        const totalAnswers = answerStats.reduce((sum, g) => sum + g._count.id, 0);
        const correctAnswers = answerStats.find(g => g.isCorrect)?._count.id ?? 0;
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
          this.SCORE_WEIGHTS.proficiency * proficiencyScore
        );

        // 8. 更新 WordScore
        await tx.wordScore.upsert({
          where: {
            unique_user_word_score: { userId, wordId: event.wordId }
          },
          create: {
            userId,
            wordId: event.wordId,
            totalScore,
            accuracyScore,
            speedScore,
            stabilityScore,
            proficiencyScore
          },
          update: {
            totalScore,
            accuracyScore,
            speedScore,
            stabilityScore,
            proficiencyScore
          }
        });

        return { masteryLevel, wordState, totalScore, reviewCount };
      }, { userId, wordId: event.wordId });

      // 清除相关缓存（事务成功后）
      // 直接使用 cacheService 清除，避免访问 service 私有方法
      cacheService.delete(CacheKeys.USER_LEARNING_STATE(userId, event.wordId));
      cacheService.delete(CacheKeys.USER_LEARNING_STATES(userId));
      cacheService.delete(CacheKeys.USER_DUE_WORDS(userId));
      cacheService.delete(CacheKeys.USER_STATS(userId));
      cacheService.delete(CacheKeys.WORD_SCORE(userId, event.wordId));
      cacheService.delete(CacheKeys.WORD_SCORES(userId));

      console.log(
        `[AMAS] 学习状态已更新: userId=${userId}, wordId=${event.wordId}, ` +
        `masteryLevel=${updateResult.masteryLevel}, state=${updateResult.wordState}, ` +
        `totalScore=${updateResult.totalScore}, reviewCount=${updateResult.reviewCount}`
      );
    } catch (error) {
      // 学习状态更新失败不影响主流程
      console.warn(
        `[AMAS] 学习状态更新失败: userId=${userId}, wordId=${event.wordId}`,
        error
      );
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
        console.warn(
          `[AMAS] 延迟奖励: reward值无效 ${result.reward}, userId=${userId}, wordId=${event.wordId}`
        );
      } else {
        // 入队延迟奖励
        await delayedRewardService.enqueueDelayedReward({
          sessionId,
          userId,
          dueTs,
          reward: result.reward,
          idempotencyKey
        });

        console.log(
          `[AMAS] 延迟奖励已入队: userId=${userId}, wordId=${event.wordId}, reward=${result.reward.toFixed(3)}, dueTs=${dueTs.toISOString()}, sessionId=${sessionId || 'null'}`
        );
      }
    } catch (error) {
      // 延迟奖励入队失败不影响主流程,仅记录警告
      console.warn(
        `[AMAS] 延迟奖励入队失败: userId=${userId}, wordId=${event.wordId}`,
        error
      );
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
          outcome: result.reward
        })
        .catch(err => {
          console.warn(
            `[AMAS] 因果观测记录失败: userId=${userId}`,
            err
          );
        });
    }

    return result;
  }

  /**
   * 持久化特征向量到数据库
   * @param sessionId 学习会话ID
   * @param featureVector 可序列化的特征向量
   */
  private async persistFeatureVector(
    sessionId: string,
    featureVector: {
      values: number[];
      version: number;
      normMethod?: string;
      ts: number;
      labels: string[];
    }
  ): Promise<void> {
    try {
      await prisma.featureVector.upsert({
        where: {
          sessionId_featureVersion: {
            sessionId,
            featureVersion: featureVector.version
          }
        },
        update: {
          features: {
            values: featureVector.values,
            labels: featureVector.labels,
            ts: featureVector.ts
          },
          normMethod: featureVector.normMethod ?? null
        },
        create: {
          sessionId,
          featureVersion: featureVector.version,
          features: {
            values: featureVector.values,
            labels: featureVector.labels,
            ts: featureVector.ts
          },
          normMethod: featureVector.normMethod ?? null
        }
      });

      // 记录成功指标
      recordFeatureVectorSaved('success');
      console.log(`[AMAS] FeatureVector持久化成功: sessionId=${sessionId}`);
    } catch (error) {
      // 记录失败指标
      recordFeatureVectorSaved('failure');
      // 持久化失败不影响主流程，仅记录警告
      console.warn(
        `[AMAS] FeatureVector持久化失败: sessionId=${sessionId}`,
        error
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
          where: { id: sessionId }
        });

        if (existing) {
          // 会话已存在，校验用户归属
          if (existing.userId !== userId) {
            console.warn(
              `[AMAS] 学习会话用户不匹配: sessionId=${sessionId}, expected=${userId}, actual=${existing.userId}`
            );
            throw new Error(
              `Session ${sessionId} belongs to different user`
            );
          }
          // 用户匹配，无需操作
          return;
        }

        // 会话不存在，创建新会话
        await tx.learningSession.create({
          data: {
            id: sessionId,
            userId
          }
        });
      });

      console.log(`[AMAS] 学习会话已确保: sessionId=${sessionId}, userId=${userId}`);
    } catch (error) {
      // 处理并发创建时的唯一约束冲突
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        // 再次检查会话归属
        const session = await prisma.learningSession.findUnique({
          where: { id: sessionId }
        });
        if (session && session.userId !== userId) {
          throw new Error(`Session ${sessionId} belongs to different user`);
        }
        // 如果是同一用户的并发请求，忽略错误
        console.log(`[AMAS] 学习会话已由并发请求创建: sessionId=${sessionId}, userId=${userId}`);
        return;
      }

      console.error(
        `[AMAS] 确保学习会话失败: sessionId=${sessionId}, userId=${userId}`,
        error
      );
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
      bayesianOptimizerEnabled: isBayesianOptimizerEnabled()
    };
  }

  /**
   * 延迟奖励应用结果
   */
  static readonly DelayedRewardResult = {
    SUCCESS: 'success',
    INVALID_REWARD: 'invalid_reward',
    NO_FEATURE_VECTOR: 'no_feature_vector',
    MODEL_UPDATE_FAILED: 'model_update_failed'
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
    sessionId?: string
  ): Promise<{
    success: boolean;
    result: typeof AMASService.DelayedRewardResult[keyof typeof AMASService.DelayedRewardResult];
    error?: string;
  }> {
    try {
      // 校验并裁剪reward值到合理区间 [-1, 1]（与实时奖励保持一致）
      if (typeof reward !== 'number' || !Number.isFinite(reward)) {
        const errorMsg = `无效的reward值 ${reward}`;
        console.warn(
          `[AMAS] 延迟奖励: ${errorMsg}, userId=${userId}, sessionId=${sessionId}`
        );
        return {
          success: false,
          result: AMASService.DelayedRewardResult.INVALID_REWARD,
          error: errorMsg
        };
      }
      const clampedReward = Math.max(-1, Math.min(1, reward));
      if (clampedReward !== reward) {
        console.warn(
          `[AMAS] 延迟奖励: reward值被裁剪 ${reward} -> ${clampedReward}, userId=${userId}`
        );
      }

      // 如果提供了sessionId，尝试从数据库获取特征向量
      let featureVector: number[] | null = null;

      if (sessionId) {
        // 获取最新版本的特征向量
        const storedVector = await prisma.featureVector.findFirst({
          where: { sessionId },
          orderBy: { featureVersion: 'desc' }
        });

        if (storedVector && storedVector.features) {
          // features字段是Json类型，需要验证和转换
          const features = storedVector.features;

          // 类型守卫: 检查是否为数字数组
          const isNumberArray = (values: unknown): values is number[] =>
            Array.isArray(values) &&
            values.every((v): v is number => typeof v === 'number');

          // 向后兼容: 支持直接数组格式
          if (isNumberArray(features)) {
            featureVector = features;
            console.log(
              `[AMAS] 延迟奖励: 使用数组格式特征向量 userId=${userId}, sessionId=${sessionId}`
            );
          }
          // 当前格式: 对象 {values, labels, ts}
          else if (
            features &&
            typeof features === 'object' &&
            'values' in features
          ) {
            const featureObj = features as { values?: unknown; labels?: unknown; ts?: unknown };
            if (isNumberArray(featureObj.values)) {
              featureVector = featureObj.values;
              console.log(
                `[AMAS] 延迟奖励: 使用对象格式特征向量 userId=${userId}, sessionId=${sessionId}`
              );
            } else {
              console.warn(
                `[AMAS] 延迟奖励: 特征向量values字段无效（非数字数组） userId=${userId}, sessionId=${sessionId}`
              );
            }
          } else {
            console.warn(
              `[AMAS] 延迟奖励: 无法识别的特征向量格式 userId=${userId}, sessionId=${sessionId}`
            );
          }
        }
      }

      // 如果没有存储的特征向量，返回失败结果
      if (!featureVector) {
        const errorMsg = '未找到有效特征向量，跳过模型更新';
        console.warn(
          `[AMAS] 延迟奖励: ${errorMsg} userId=${userId}, sessionId=${sessionId}`
        );
        return {
          success: false,
          result: AMASService.DelayedRewardResult.NO_FEATURE_VECTOR,
          error: errorMsg
        };
      }

      // 使用引擎提供的公共方法应用延迟奖励
      const result = await this.engine.applyDelayedRewardUpdate(
        userId,
        featureVector,
        clampedReward
      );

      if (!result.success) {
        const errorMsg = `模型更新失败: ${result.error}`;
        console.warn(
          `[AMAS] 延迟奖励: ${errorMsg}, userId=${userId}, sessionId=${sessionId}`
        );
        return {
          success: false,
          result: AMASService.DelayedRewardResult.MODEL_UPDATE_FAILED,
          error: errorMsg
        };
      }

      console.log(
        `[AMAS] 延迟奖励已应用: userId=${userId}, reward=${clampedReward.toFixed(3)}, sessionId=${sessionId}`
      );
      return {
        success: true,
        result: AMASService.DelayedRewardResult.SUCCESS
      };
    } catch (error) {
      console.error('[AMAS] 应用延迟奖励失败:', error);
      throw error;
    }
  }

  /**
   * 批量处理事件（用于历史数据导入）
   */
  async batchProcessEvents(
    userId: string,
    events: Array<{
      wordId: string;
      isCorrect: boolean;
      responseTime: number;
      timestamp: number;
    }>
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
        interactionDensity: 1.0
      };

      finalResult = await this.engine.processEvent(userId, rawEvent, {
        skipUpdate: false
      });
    }

    return {
      processed: events.length,
      finalStrategy: finalResult?.strategy ?? await this.getCurrentStrategy(userId) ?? this.getDefaultStrategy()
    };
  }

  /**
   * 获取默认策略
   */
  private getDefaultStrategy(): StrategyParams {
    return {
      interval_scale: 1.0,
      new_ratio: 0.2,
      difficulty: 'mid',
      batch_size: 8,
      hint_level: 1
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
        take: 20
      }),
      prisma.answerRecord.count({
        where: { userId }
      })
    ]);

    const recentAccuracy = recentRecords.length > 0
      ? recentRecords.filter(r => r.isCorrect).length / recentRecords.length
      : 0.5;

    return {
      interactionCount,
      recentAccuracy
    };
  }

  /**
   * 记录决策日志（用于分析和调试）
   */
  private async logDecision(userId: string, result: ProcessResult): Promise<void> {
    try {
      // 可以将决策记录存入数据库或日志系统
      // 暂时使用简化实现
      console.log('[AMAS Decision]', {
        userId,
        strategy: result.strategy,
        state: {
          A: result.state.A.toFixed(2),
          F: result.state.F.toFixed(2),
          M: result.state.M.toFixed(2)
        },
        reward: result.reward.toFixed(3),
        explanation: result.explanation
      });
    } catch (error) {
      console.error('[AMAS] Failed to log decision:', error);
    }
  }
}

// 导出单例实例
export const amasService = new AMASService();
