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
import { cacheService, CacheKeys, CacheTTL } from './cache.service';
import { recordFeatureVectorSaved } from './metrics.service';
import prisma from '../config/database';
import { delayedRewardService } from './delayed-reward.service';
import { stateHistoryService } from './state-history.service';

class AMASService {
  private engine: AMASEngine;

  // 延迟奖励配置
  private readonly MIN_DELAY_MS = 60_000; // 最小延迟60秒
  private readonly DEFAULT_DELAY_MS = 24 * 60 * 60 * 1000; // 默认24小时

  constructor() {
    // 初始化AMAS引擎（使用数据库持久化仓库）
    this.engine = new AMASEngine({
      stateRepo: databaseStateRepository,
      modelRepo: databaseModelRepository
    });
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
      await this.ensureLearningSession(sessionId, userId);
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
   * 使用 upsert 避免竞态条件，并校验用户归属
   * @param sessionId 学习会话ID
   * @param userId 用户ID
   */
  private async ensureLearningSession(sessionId: string, userId: string): Promise<void> {
    try {
      // 使用 upsert 避免竞态条件和额外查询
      const session = await prisma.learningSession.upsert({
        where: { id: sessionId },
        update: {}, // 会话已存在时不更新任何字段
        create: {
          id: sessionId,
          userId
        }
      });

      // 校验用户归属：确保会话属于当前用户
      if (session.userId !== userId) {
        console.warn(
          `[AMAS] 学习会话用户不匹配: sessionId=${sessionId}, expected=${userId}, actual=${session.userId}`
        );
        throw new Error(
          `Session ${sessionId} belongs to different user`
        );
      }

      console.log(`[AMAS] 学习会话已确保: sessionId=${sessionId}, userId=${userId}`);
    } catch (error) {
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
   * 应用延迟奖励 (用于异步奖励补记)
   * @param userId 用户ID
   * @param reward 延迟奖励值
   * @param sessionId 可选的学习会话ID (用于获取特征向量)
   */
  async applyDelayedReward(
    userId: string,
    reward: number,
    sessionId?: string
  ): Promise<void> {
    try {
      // 校验并裁剪reward值到合理区间 [-1, 1]（与实时奖励保持一致）
      if (typeof reward !== 'number' || !Number.isFinite(reward)) {
        console.warn(
          `[AMAS] 延迟奖励: 无效的reward值 ${reward}, userId=${userId}, sessionId=${sessionId}`
        );
        return;
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

      // 如果没有存储的特征向量，记录警告但不抛出错误
      if (!featureVector) {
        console.warn(
          `[AMAS] 延迟奖励: 未找到有效特征向量，跳过模型更新 userId=${userId}, sessionId=${sessionId}`
        );
        return;
      }

      // 使用引擎提供的公共方法应用延迟奖励
      const result = await this.engine.applyDelayedRewardUpdate(
        userId,
        featureVector,
        clampedReward
      );

      if (!result.success) {
        console.warn(
          `[AMAS] 延迟奖励: 模型更新失败 error=${result.error}, userId=${userId}, sessionId=${sessionId}`
        );
        return;
      }

      console.log(
        `[AMAS] 延迟奖励已应用: userId=${userId}, reward=${clampedReward.toFixed(3)}, sessionId=${sessionId}`
      );
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
