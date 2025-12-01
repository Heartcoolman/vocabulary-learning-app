/**
 * Decision Recorder Service
 *
 * 异步记录 AMAS 决策轨迹到数据库，包含：
 * - 决策元数据（来源、权重、投票等）
 * - 流水线阶段（感知/建模/学习/决策/评估/优化）
 *
 * 设计特性：
 * - 异步队列（不阻塞主决策流程）
 * - 批量处理（提升写入性能）
 * - 重试机制（保证数据完整性）
 * - 幂等性（避免重复记录）
 */

import { PrismaClient, PipelineStageType, PipelineStageStatus, Prisma } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import {
  recordWriteSuccess,
  recordWriteFailure,
  updateQueueSize,
  recordBackpressure,
  recordBackpressureTimeout
} from '../../monitoring/amas-metrics';

// ==================== 类型定义 ====================

export interface PipelineStageTrace {
  stage: PipelineStageType;
  stageName: string;
  status: PipelineStageStatus;
  startedAt: Date;
  endedAt?: Date;
  durationMs?: number;
  inputSummary?: Record<string, unknown>;
  outputSummary?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}

export interface DecisionTrace {
  decisionId: string;
  answerRecordId?: string;
  sessionId?: string;
  timestamp: Date;
  decisionSource: string;
  coldstartPhase?: string;
  weightsSnapshot?: Record<string, number>;
  memberVotes?: Record<string, unknown>;
  selectedAction: Record<string, unknown>;
  confidence: number;
  reward?: number;
  isSimulation?: boolean;
  traceVersion: number;
  totalDurationMs?: number;
  stages: PipelineStageTrace[];
}

// ==================== 配置常量 ====================

const MAX_QUEUE_SIZE = 1000;
const MAX_BATCH_SIZE = 20;
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 50;
const QUEUE_FLUSH_INTERVAL_MS = 1000;
const BACKPRESSURE_TIMEOUT_MS = 5000; // 5秒超时

// ==================== 服务实现 ====================

export class DecisionRecorderService {
  private queue: DecisionTrace[] = [];
  private flushing = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private backpressureWaiters: Array<() => void> = [];

  constructor(private prisma: PrismaClient) {
    this.startPeriodicFlush();
  }

  /**
   * 记录决策轨迹（异步，不阻塞）
   */
  async record(trace: DecisionTrace): Promise<void> {
    try {
      // 队列满时等待（带超时保护）
      await this.enforceBackpressure();
    } catch (error) {
      // 背压超时，记录告警并丢弃此 trace
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[DecisionRecorder] Backpressure timeout, dropping trace', {
        decisionId: trace.decisionId,
        error: errorMsg,
        queueSize: this.queue.length
      });
      recordBackpressureTimeout();
      return; // 丢弃 trace，避免阻塞调用方
    }

    // 加入队列
    this.queue.push(trace);

    // 更新队列大小指标
    updateQueueSize(this.queue.length);

    // 触发刷新（如果未在刷新中）
    if (!this.flushing) {
      void this.flush();
    }
  }

  /**
   * 立即刷新队列
   */
  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) {
      return;
    }

    this.flushing = true;

    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, MAX_BATCH_SIZE);

        // 并行处理批次中的每一项（重试逻辑）
        await Promise.allSettled(
          batch.map(trace => this.persistWithRetry(trace))
        );

        // 释放回压
        this.releaseBackpressure();

        // 更新队列大小指标（每批次处理后）
        updateQueueSize(this.queue.length);
      }
    } finally {
      this.flushing = false;
      // 确保 flush 结束时队列指标为准确值
      updateQueueSize(this.queue.length);
    }
  }

  /**
   * 带重试的持久化
   */
  private async persistWithRetry(trace: DecisionTrace): Promise<void> {
    let lastError: Error | null = null;
    const startTime = Date.now();

    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        await this.persistDecisionTrace(trace);

        // 记录成功指标
        const durationMs = Date.now() - startTime;
        recordWriteSuccess(durationMs);

        return; // 成功
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 指数退避
        if (attempt < MAX_RETRY_ATTEMPTS - 1) {
          await this.sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt));
        }
      }
    }

    // 所有重试均失败，记录失败指标
    recordWriteFailure(lastError?.message);

    console.error('[DecisionRecorder] Failed to persist decision after retries', {
      decisionId: trace.decisionId,
      error: lastError?.message
    });

    try {
      // 尝试标记为失败
      await this.markAsFailed(trace.decisionId, trace.answerRecordId, lastError?.message);
    } catch (markError) {
      console.error('[DecisionRecorder] Failed to mark decision as failed', {
        decisionId: trace.decisionId,
        error: markError
      });
    }
  }

  /**
   * 持久化决策轨迹（单次尝试）
   */
  private async persistDecisionTrace(trace: DecisionTrace): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 幂等性：使用 upsert
      const record = await tx.decisionRecord.upsert({
        where: { decisionId: trace.decisionId },
        update: {
          decisionSource: trace.decisionSource,
          coldstartPhase: trace.coldstartPhase ?? null,
          weightsSnapshot: (trace.weightsSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          memberVotes: (trace.memberVotes ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          selectedAction: trace.selectedAction as Prisma.InputJsonValue,
          confidence: trace.confidence,
          reward: trace.reward ?? null,
          isSimulation: trace.isSimulation ?? false,
          traceVersion: trace.traceVersion,
          totalDurationMs: trace.totalDurationMs ?? null,
          ingestionStatus: 'SUCCESS'
        },
        create: {
          decisionId: trace.decisionId,
          answerRecordId: trace.answerRecordId ?? null,
          sessionId: trace.sessionId ?? null,
          timestamp: trace.timestamp,
          decisionSource: trace.decisionSource,
          coldstartPhase: trace.coldstartPhase ?? null,
          weightsSnapshot: (trace.weightsSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          memberVotes: (trace.memberVotes ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          selectedAction: trace.selectedAction as Prisma.InputJsonValue,
          confidence: trace.confidence,
          reward: trace.reward ?? null,
          isSimulation: trace.isSimulation ?? false,
          traceVersion: trace.traceVersion,
          totalDurationMs: trace.totalDurationMs ?? null,
          ingestionStatus: 'SUCCESS'
        }
      });

      // 删除旧的阶段记录（幂等性）
      await tx.pipelineStage.deleteMany({
        where: { decisionRecordId: record.id }
      });

      // 批量创建阶段记录
      if (trace.stages.length > 0) {
        await tx.pipelineStage.createMany({
          data: trace.stages.map(stage => ({
            decisionRecordId: record.id,
            stage: stage.stage,
            stageName: stage.stageName,
            status: stage.status,
            startedAt: stage.startedAt,
            endedAt: stage.endedAt ?? null,
            durationMs: stage.durationMs ?? null,
            inputSummary: (stage.inputSummary ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            outputSummary: (stage.outputSummary ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            metadata: (stage.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            errorMessage: stage.errorMessage ?? null
          }))
        });
      }
    });
  }

  /**
   * 标记决策记录为失败
   */
  private async markAsFailed(
    decisionId: string,
    answerRecordId?: string,
    errorMessage?: string
  ): Promise<void> {
    await this.prisma.decisionRecord.upsert({
      where: { decisionId },
      update: { ingestionStatus: 'FAILED' },
      create: {
        decisionId,
        answerRecordId: answerRecordId ?? null,
        timestamp: new Date(),
        decisionSource: 'unknown',
        selectedAction: { error: 'failed_to_record' },
        confidence: 0,
        isSimulation: !answerRecordId,
        traceVersion: 1,
        ingestionStatus: 'FAILED'
      }
    });
  }

  /**
   * 队列回压控制（带超时保护）
   */
  private async enforceBackpressure(): Promise<void> {
    if (this.queue.length < MAX_QUEUE_SIZE) {
      return;
    }

    // 记录回压事件
    recordBackpressure();

    // 带超时的等待
    await Promise.race([
      new Promise<void>(resolve => {
        this.backpressureWaiters.push(resolve);
      }),
      new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Backpressure timeout: queue is persistently full'));
        }, BACKPRESSURE_TIMEOUT_MS);
      })
    ]);
  }

  /**
   * 释放回压等待者
   */
  private releaseBackpressure(): void {
    const waiter = this.backpressureWaiters.shift();
    if (waiter) {
      waiter();
    }
  }

  /**
   * 定期刷新队列
   */
  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(() => {
      if (this.queue.length > 0) {
        void this.flush();
      }
    }, QUEUE_FLUSH_INTERVAL_MS);

    // 允许进程退出
    this.flushTimer.unref();
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // 最后刷新一次
    await this.flush();
  }

  /**
   * 工具：休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取队列状态（用于监控）
   */
  getQueueStats() {
    return {
      queueLength: this.queue.length,
      isFlushing: this.flushing,
      backpressureWaiters: this.backpressureWaiters.length
    };
  }
}

// ==================== 工厂函数 ====================

let sharedInstance: DecisionRecorderService | null = null;

export function createDecisionRecorder(prisma: PrismaClient): DecisionRecorderService {
  return new DecisionRecorderService(prisma);
}

export function getSharedDecisionRecorder(prisma: PrismaClient): DecisionRecorderService {
  if (!sharedInstance) {
    sharedInstance = new DecisionRecorderService(prisma);
  }
  return sharedInstance;
}

// ==================== 辅助函数 ====================

/**
 * 生成唯一的决策ID
 */
export function generateDecisionId(): string {
  return createId();
}
