/**
 * Answer Buffer Service
 * 批量写入缓冲服务，优化 AnswerRecord 写入性能
 *
 * 功能：
 * - 将答题记录缓存到 Redis
 * - 达到阈值或定时刷新时批量写入数据库
 * - 降级机制：Redis 不可用时直接写入数据库
 * - 优雅关闭：确保所有缓冲数据持久化
 */

import { getRedisClient } from '../config/redis';
import { PrismaClient } from '@prisma/client';
import { serviceLogger } from '../logger';

const logger = serviceLogger.child({ module: 'answer-buffer' });

export interface BufferedAnswer {
  id: string;
  userId: string;
  wordId: string;
  sessionId?: string | null;
  isCorrect: boolean;
  responseTime?: number | null;
  selectedAnswer: string;
  correctAnswer: string;
  timestamp: Date;
  dwellTime?: number | null;
  masteryLevelBefore?: number | null;
  masteryLevelAfter?: number | null;
}

export class AnswerBufferService {
  private readonly BUFFER_KEY = 'answer_buffer';
  private readonly FLUSH_THRESHOLD = 100;
  private readonly FLUSH_INTERVAL = 5000; // 5 秒
  private flushTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(private prisma: PrismaClient) {}

  /**
   * 缓冲一条答题记录
   * @param answer - 答题记录
   * @returns 答题记录 ID
   */
  async buffer(answer: BufferedAnswer): Promise<string> {
    try {
      const redis = getRedisClient();
      await redis.rpush(this.BUFFER_KEY, JSON.stringify(answer));

      // 检查是否需要立即刷新
      const length = await redis.llen(this.BUFFER_KEY);
      if (length >= this.FLUSH_THRESHOLD) {
        this.flush().catch((err) => logger.error({ err }, 'Flush failed'));
      }

      logger.debug({ answerId: answer.id, bufferLength: length }, 'Answer buffered');
      return answer.id;
    } catch (error) {
      logger.warn({ error, answerId: answer.id }, 'Buffer failed, writing directly');
      // 降级：直接写入数据库
      await this.writeDirectly(answer);
      return answer.id;
    }
  }

  /**
   * 刷新缓冲区，将数据批量写入数据库
   * @returns 写入的记录数
   */
  async flush(): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    const items: string[] = [];
    try {
      const redis = getRedisClient();

      // 批量获取并删除
      while (true) {
        const item = await redis.lpop(this.BUFFER_KEY);
        if (!item) break;
        items.push(item);
        if (items.length >= this.FLUSH_THRESHOLD) break;
      }

      if (items.length === 0) return 0;

      const answers: BufferedAnswer[] = [];
      for (const raw of items) {
        try {
          answers.push(JSON.parse(raw) as BufferedAnswer);
        } catch (parseError) {
          logger.warn(
            { err: parseError, rawLength: raw.length },
            'Invalid buffered answer JSON, dropping item',
          );
        }
      }

      if (answers.length === 0) return 0;

      // 批量写入数据库
      await this.prisma.answerRecord.createMany({
        data: answers.map((a) => ({
          id: a.id,
          userId: a.userId,
          wordId: a.wordId,
          sessionId: a.sessionId,
          isCorrect: a.isCorrect,
          responseTime: a.responseTime,
          selectedAnswer: a.selectedAnswer,
          correctAnswer: a.correctAnswer,
          timestamp: new Date(a.timestamp),
          dwellTime: a.dwellTime,
          masteryLevelBefore: a.masteryLevelBefore,
          masteryLevelAfter: a.masteryLevelAfter,
        })),
        skipDuplicates: true,
      });

      logger.info({ count: answers.length }, 'Flushed answers to database');
      return answers.length;
    } catch (error) {
      // 关键修复：写入失败时把已弹出的 items 回灌到 Redis，避免缓冲数据丢失
      try {
        if (items.length > 0) {
          const redis = getRedisClient();
          // items 是按 LPOP 顺序取出的（头->尾），用 LPUSH + reverse 恢复原顺序
          await redis.lpush(this.BUFFER_KEY, ...items.slice().reverse());
          logger.warn({ count: items.length }, 'Flush failed, re-queued buffered answers');
        }
      } catch (requeueError) {
        logger.error(
          { err: requeueError },
          'Failed to re-queue buffered answers after flush error',
        );
      }

      logger.error({ error }, 'Flush error');
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 启动定时刷新
   */
  startPeriodicFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => logger.error({ err }, 'Periodic flush failed'));
    }, this.FLUSH_INTERVAL);

    // 使用 unref() 防止定时器阻止进程退出
    this.flushTimer.unref();

    logger.info({ interval: this.FLUSH_INTERVAL }, 'Started periodic flush');
  }

  /**
   * 停止定时刷新
   */
  stopPeriodicFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    logger.info('Stopped periodic flush');
  }

  /**
   * 优雅关闭：停止定时刷新并刷新剩余数据
   */
  async gracefulShutdown(): Promise<void> {
    this.stopPeriodicFlush();

    // 多次刷新确保所有数据写入
    let totalFlushed = 0;
    let flushed: number;
    do {
      flushed = await this.flush();
      totalFlushed += flushed;
    } while (flushed > 0);

    logger.info({ totalFlushed }, 'Graceful shutdown complete');
  }

  /**
   * 获取缓冲区长度
   * @returns 缓冲区中的记录数
   */
  async getBufferLength(): Promise<number> {
    try {
      const redis = getRedisClient();
      return await redis.llen(this.BUFFER_KEY);
    } catch {
      return 0;
    }
  }

  /**
   * 直接写入数据库（降级方案）
   */
  private async writeDirectly(answer: BufferedAnswer): Promise<void> {
    await this.prisma.answerRecord.create({
      data: {
        id: answer.id,
        userId: answer.userId,
        wordId: answer.wordId,
        sessionId: answer.sessionId,
        isCorrect: answer.isCorrect,
        responseTime: answer.responseTime,
        selectedAnswer: answer.selectedAnswer,
        correctAnswer: answer.correctAnswer,
        timestamp: new Date(answer.timestamp),
        dwellTime: answer.dwellTime,
        masteryLevelBefore: answer.masteryLevelBefore,
        masteryLevelAfter: answer.masteryLevelAfter,
      },
    });
  }
}

// 单例
let instance: AnswerBufferService | null = null;

/**
 * 获取 AnswerBufferService 单例
 * @param prisma - Prisma 客户端
 * @returns AnswerBufferService 实例
 */
export function getAnswerBufferService(prisma: PrismaClient): AnswerBufferService {
  if (!instance) {
    instance = new AnswerBufferService(prisma);
  }
  return instance;
}

/**
 * 重置单例（仅用于测试）
 */
export function resetAnswerBufferService(): void {
  if (instance) {
    instance.stopPeriodicFlush();
  }
  instance = null;
}
