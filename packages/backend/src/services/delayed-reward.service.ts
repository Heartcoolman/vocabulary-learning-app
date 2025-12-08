/**
 * AMAS Delayed Reward Service
 * 延迟奖励服务
 *
 * 功能:
 * - 入队延迟奖励任务
 * - 异步处理到期任务
 * - 幂等性保证
 * - 错误重试机制
 */

import { RewardQueue, RewardStatus, Prisma } from '@prisma/client';
import prisma from '../config/database';
import { serviceLogger } from '../logger';

/** 批量处理大小 */
const BATCH_SIZE = 50;
/** 最大重试次数 */
const MAX_RETRY = 3;
/** PROCESSING状态超时时间（毫秒）- 5分钟 */
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * 入队延迟奖励参数
 * Critical Fix: 添加answerRecordId以支持特征向量的精确匹配
 */
export interface EnqueueDelayedRewardParams {
  answerRecordId?: string;
  sessionId?: string;
  userId: string;
  dueTs: Date;
  reward: number;
  idempotencyKey: string;
}

/**
 * 奖励应用处理器
 */
export type ApplyRewardHandler = (task: RewardQueue) => Promise<void>;

/**
 * 延迟奖励服务
 */
export class DelayedRewardService {
  /**
   * 入队延迟奖励
   * @param params 奖励参数
   * @returns 创建的奖励队列记录
   */
  async enqueueDelayedReward(params: EnqueueDelayedRewardParams): Promise<RewardQueue> {
    try {
      return await prisma.rewardQueue.create({
        data: {
          answerRecordId: params.answerRecordId ?? null,
          sessionId: params.sessionId ?? null,
          userId: params.userId,
          dueTs: params.dueTs,
          reward: params.reward,
          status: RewardStatus.PENDING,
          idempotencyKey: params.idempotencyKey,
        },
      });
    } catch (err) {
      // 幂等性: 如果idempotencyKey冲突,返回已存在的记录
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await prisma.rewardQueue.findUnique({
          where: { idempotencyKey: params.idempotencyKey },
        });
        if (existing) return existing;
      }
      throw err;
    }
  }

  /**
   * 恢复超时的PROCESSING任务
   * 将超过超时时间的PROCESSING状态任务重置为PENDING
   * @returns 恢复的任务数量
   */
  async recoverStuckProcessingTasks(): Promise<number> {
    const timeoutThreshold = new Date(Date.now() - PROCESSING_TIMEOUT_MS);

    const result = await prisma.rewardQueue.updateMany({
      where: {
        status: RewardStatus.PROCESSING,
        updatedAt: { lt: timeoutThreshold },
      },
      data: {
        status: RewardStatus.PENDING,
        lastError: 'Recovered from stuck PROCESSING state (timeout)',
        updatedAt: new Date(),
      },
    });

    if (result.count > 0) {
      serviceLogger.warn(
        `Recovered ${result.count} stuck PROCESSING tasks (timeout: ${PROCESSING_TIMEOUT_MS}ms)`,
      );
    }

    return result.count;
  }

  /**
   * 处理待处理的奖励 (Worker调用)
   * 使用事务 + SELECT FOR UPDATE SKIP LOCKED 实现原子抢占，避免多Worker竞争
   * @param handler 奖励应用处理器（必需）
   */
  async processPendingRewards(handler: ApplyRewardHandler): Promise<void> {
    if (!handler) {
      serviceLogger.error('handler is required but not provided');
      return;
    }

    // 首先恢复超时的PROCESSING任务
    await this.recoverStuckProcessingTasks();

    const now = new Date();

    // 使用事务和行锁实现原子抢占，避免TOCTOU竞态条件
    // SELECT FOR UPDATE SKIP LOCKED: 跳过已被其他Worker锁定的行
    const tasks = await prisma.$transaction(async (tx) => {
      // 原子查询并锁定到期的待处理任务
      const lockedTasks = await tx.$queryRaw<RewardQueue[]>`
        SELECT * FROM "reward_queue"
        WHERE status = 'PENDING'
          AND "dueTs" <= ${now}
        ORDER BY "dueTs" ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;

      if (lockedTasks.length === 0) {
        return [];
      }

      const ids = lockedTasks.map((t) => t.id);

      // 在同一事务中更新状态为PROCESSING
      await tx.rewardQueue.updateMany({
        where: { id: { in: ids } },
        data: { status: RewardStatus.PROCESSING, updatedAt: now },
      });

      return lockedTasks;
    });

    if (tasks.length === 0) return;

    // 逐个处理任务
    for (const task of tasks) {
      // 使用 lastError 解析重试次数（RewardQueue 模型不包含 retryCount 字段）
      const currentRetryCount = this.parseAttempts(task.lastError);

      try {
        // 应用奖励
        await handler(task);

        // 标记为完成
        await prisma.rewardQueue.update({
          where: { id: task.id },
          data: {
            status: RewardStatus.DONE,
            lastError: null,
            updatedAt: new Date(),
          },
        });
      } catch (err) {
        const nextRetryCount = currentRetryCount + 1;
        const isFailed = nextRetryCount >= MAX_RETRY;
        const nextStatus = isFailed ? RewardStatus.FAILED : RewardStatus.PENDING;

        // 退避重试: 1min, 2min, 3min...
        const nextDue = isFailed
          ? task.dueTs
          : new Date(Date.now() + Math.min(5, nextRetryCount) * 60_000);

        const message = this.formatError(err, nextRetryCount, isFailed);

        // 更新任务状态，重试次数存储在 lastError 中
        await prisma.rewardQueue.update({
          where: { id: task.id },
          data: {
            status: nextStatus,
            dueTs: nextDue,
            lastError: message,
            updatedAt: new Date(),
          },
        });
      }
    }
  }

  /**
   * 查询会话的奖励状态
   * @param sessionId 学习会话ID
   * @returns 奖励队列记录
   */
  async getRewardStatus(sessionId: string): Promise<RewardQueue[]> {
    return prisma.rewardQueue.findMany({
      where: { sessionId },
      orderBy: [{ dueTs: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  /**
   * 从错误信息解析重试次数（向后兼容）
   * @deprecated 推荐使用独立的 retryCount 字段。此方法仅用于兼容迁移前的旧数据。
   */
  private parseAttempts(lastError?: string | null): number {
    if (!lastError) return 0;
    const match = /attempts=(\d+)/i.exec(lastError);
    return match ? Math.max(0, parseInt(match[1], 10) || 0) : 0;
  }

  /**
   * 格式化错误信息
   */
  private formatError(err: unknown, attempts: number, isFailed: boolean): string {
    const reason = err instanceof Error ? err.message : String(err);
    return `attempts=${attempts}; status=${isFailed ? 'failed' : 'retry'}; error=${reason}`;
  }

  /**
   * 查询延迟奖励列表
   * @param filter 过滤条件
   * @returns 延迟奖励列表
   */
  async findRewards(filter: {
    userId?: string;
    status?: RewardStatus;
    limit?: number;
  }): Promise<RewardQueue[]> {
    const limit = filter.limit && filter.limit > 0 ? Math.min(filter.limit, 100) : 50;

    const where: {
      userId?: string;
      status?: RewardStatus;
    } = {};

    if (filter.userId) {
      where.userId = filter.userId;
    }

    if (filter.status) {
      where.status = filter.status;
    }

    return prisma.rewardQueue.findMany({
      where,
      orderBy: [{ dueTs: 'asc' }, { updatedAt: 'desc' }],
      take: limit,
    });
  }
}

// 导出单例实例
export const delayedRewardService = new DelayedRewardService();
