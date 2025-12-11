/**
 * TrackingService - 后端埋点数据处理服务
 *
 * 接收前端上报的交互事件数据，用于学习风格精准建模
 * 主要处理以下事件：
 * - 发音按钮点击事件（用于计算听觉偏好）
 * - 学习暂停/恢复事件
 * - 页面/任务切换事件
 * - 交互频率数据
 *
 * 使用数据库持久化存储，结合内存缓存优化写入性能
 */

import { logger } from '../logger';
import prisma from '../config/database';

/**
 * 埋点事件类型
 */
export type TrackingEventType =
  | 'pronunciation_click' // 发音按钮点击
  | 'learning_pause' // 学习暂停
  | 'learning_resume' // 学习恢复
  | 'page_switch' // 页面切换
  | 'task_switch' // 任务切换
  | 'interaction' // 一般交互事件
  | 'session_start' // 会话开始
  | 'session_end'; // 会话结束

/**
 * 埋点事件数据
 */
export interface TrackingEvent {
  type: TrackingEventType;
  timestamp: number;
  data?: Record<string, unknown>;
  sessionId?: string;
}

/**
 * 批量上报的事件包
 */
export interface EventBatch {
  events: TrackingEvent[];
  userId?: string;
  sessionId: string;
  timestamp: number;
}

/**
 * 用户交互统计（用于学习风格分析）
 */
export interface UserInteractionStats {
  pronunciationClicks: number;
  pauseCount: number;
  pageSwitchCount: number;
  totalInteractions: number;
  totalSessionDuration: number;
  lastActivityTime: Date;
}

/**
 * 内存缓冲区中的统计更新
 */
interface StatsUpdate {
  pronunciationClicks: number;
  pauseCount: number;
  pageSwitchCount: number;
  totalInteractions: number;
}

/**
 * 内存缓冲区中的事件
 */
interface BufferedEvent {
  userId: string;
  sessionId: string;
  eventType: string;
  eventData: Record<string, unknown> | null;
  timestamp: Date;
}

class TrackingService {
  private readonly trackingLogger = logger.child({ module: 'tracking' });

  // 内存缓冲区（用于批量写入优化）
  private statsBuffer = new Map<string, StatsUpdate>();
  private eventsBuffer: BufferedEvent[] = [];

  // 缓冲区配置
  private readonly FLUSH_INTERVAL_MS = 5000; // 5秒刷新一次
  private readonly MAX_BUFFER_SIZE = 500; // 最大缓冲事件数
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // 启动定时刷新
    this.startFlushTimer();

    // 进程退出时确保数据写入
    process.on('beforeExit', () => this.flush());
  }

  /**
   * 启动定时刷新定时器
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        this.trackingLogger.error({ err }, 'Periodic flush failed');
      });
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * 处理批量埋点事件
   */
  async processBatch(userId: string, batch: EventBatch): Promise<void> {
    try {
      const { events, sessionId } = batch;

      // 统计各类事件
      let pronunciationClicks = 0;
      let pauseCount = 0;
      let pageSwitchCount = 0;
      const totalInteractions = events.length;

      for (const event of events) {
        switch (event.type) {
          case 'pronunciation_click':
            pronunciationClicks++;
            break;
          case 'learning_pause':
            pauseCount++;
            break;
          case 'page_switch':
            pageSwitchCount++;
            break;
        }
      }

      // 添加到统计缓冲区
      this.bufferStatsUpdate(userId, {
        pronunciationClicks,
        pauseCount,
        pageSwitchCount,
        totalInteractions,
      });

      // 添加事件到缓冲区
      this.bufferEvents(userId, sessionId, events);

      // 如果缓冲区满了，立即刷新
      if (this.eventsBuffer.length >= this.MAX_BUFFER_SIZE) {
        await this.flush();
      }

      this.trackingLogger.debug(
        {
          userId,
          sessionId,
          eventCount: events.length,
          pronunciationClicks,
          pauseCount,
          pageSwitchCount,
        },
        'Tracking batch buffered',
      );
    } catch (error) {
      this.trackingLogger.error({ err: error, userId, batch }, 'Failed to process tracking batch');
      throw error;
    }
  }

  /**
   * 添加统计更新到缓冲区
   */
  private bufferStatsUpdate(userId: string, stats: StatsUpdate): void {
    const existing = this.statsBuffer.get(userId);
    if (existing) {
      existing.pronunciationClicks += stats.pronunciationClicks;
      existing.pauseCount += stats.pauseCount;
      existing.pageSwitchCount += stats.pageSwitchCount;
      existing.totalInteractions += stats.totalInteractions;
    } else {
      this.statsBuffer.set(userId, { ...stats });
    }
  }

  /**
   * 添加事件到缓冲区
   */
  private bufferEvents(userId: string, sessionId: string, events: TrackingEvent[]): void {
    const bufferedEvents = events.map((event) => ({
      userId,
      sessionId,
      eventType: event.type,
      eventData: event.data ?? null,
      timestamp: new Date(event.timestamp),
    }));
    this.eventsBuffer.push(...bufferedEvents);
  }

  /**
   * 刷新缓冲区到数据库
   */
  async flush(): Promise<void> {
    const statsToFlush = new Map(this.statsBuffer);
    const eventsToFlush = [...this.eventsBuffer];

    // 清空缓冲区
    this.statsBuffer.clear();
    this.eventsBuffer = [];

    if (statsToFlush.size === 0 && eventsToFlush.length === 0) {
      return;
    }

    this.trackingLogger.debug(
      { statsCount: statsToFlush.size, eventsCount: eventsToFlush.length },
      'Flushing tracking data to database',
    );

    try {
      // 并行执行统计更新和事件写入
      await Promise.all([this.flushStats(statsToFlush), this.flushEvents(eventsToFlush)]);
    } catch (error) {
      this.trackingLogger.error({ err: error }, 'Failed to flush tracking data');
      // 将失败的数据放回缓冲区
      for (const [userId, stats] of statsToFlush) {
        this.bufferStatsUpdate(userId, stats);
      }
      this.eventsBuffer.push(...eventsToFlush);
    }
  }

  /**
   * 刷新统计数据到数据库
   */
  private async flushStats(stats: Map<string, StatsUpdate>): Promise<void> {
    const updates = Array.from(stats.entries()).map(async ([userId, update]) => {
      try {
        await prisma.userInteractionStats.upsert({
          where: { userId },
          create: {
            userId,
            pronunciationClicks: update.pronunciationClicks,
            pauseCount: update.pauseCount,
            pageSwitchCount: update.pageSwitchCount,
            totalInteractions: update.totalInteractions,
            lastActivityTime: new Date(),
          },
          update: {
            pronunciationClicks: { increment: update.pronunciationClicks },
            pauseCount: { increment: update.pauseCount },
            pageSwitchCount: { increment: update.pageSwitchCount },
            totalInteractions: { increment: update.totalInteractions },
            lastActivityTime: new Date(),
          },
        });
      } catch (error) {
        this.trackingLogger.warn({ err: error, userId }, 'Failed to upsert user interaction stats');
        // 单个用户失败不影响其他用户
      }
    });

    await Promise.allSettled(updates);
  }

  /**
   * 刷新事件数据到数据库
   */
  private async flushEvents(events: BufferedEvent[]): Promise<void> {
    if (events.length === 0) return;

    try {
      await prisma.userTrackingEvent.createMany({
        data: events.map((e) => ({
          userId: e.userId,
          sessionId: e.sessionId,
          eventType: e.eventType,
          // 转换 eventData 为 Prisma 可接受的 Json 类型
          eventData: e.eventData !== null ? (e.eventData as object) : undefined,
          timestamp: e.timestamp,
        })),
        skipDuplicates: true,
      });
    } catch (error) {
      this.trackingLogger.warn(
        { err: error, eventCount: events.length },
        'Failed to batch insert tracking events',
      );
    }
  }

  /**
   * 获取用户交互统计（用于学习风格分析）
   */
  async getUserInteractionStats(userId: string): Promise<UserInteractionStats | null> {
    try {
      // 先刷新该用户的缓冲数据
      const bufferedStats = this.statsBuffer.get(userId);

      // 从数据库获取
      const dbStats = await prisma.userInteractionStats.findUnique({
        where: { userId },
      });

      if (!dbStats && !bufferedStats) {
        return null;
      }

      // 合并数据库数据和缓冲区数据
      return {
        pronunciationClicks:
          (dbStats?.pronunciationClicks ?? 0) + (bufferedStats?.pronunciationClicks ?? 0),
        pauseCount: (dbStats?.pauseCount ?? 0) + (bufferedStats?.pauseCount ?? 0),
        pageSwitchCount: (dbStats?.pageSwitchCount ?? 0) + (bufferedStats?.pageSwitchCount ?? 0),
        totalInteractions:
          (dbStats?.totalInteractions ?? 0) + (bufferedStats?.totalInteractions ?? 0),
        totalSessionDuration: dbStats?.totalSessionDuration ?? 0,
        lastActivityTime: dbStats?.lastActivityTime ?? new Date(),
      };
    } catch (error) {
      this.trackingLogger.warn({ err: error, userId }, 'Failed to get user interaction stats');
      return null;
    }
  }

  /**
   * 计算用户听觉偏好得分（基于发音按钮点击频率）
   * 用于学习风格分析
   */
  async calculateAuditoryPreference(userId: string): Promise<number> {
    try {
      const stats = await this.getUserInteractionStats(userId);
      if (!stats || stats.totalInteractions === 0) {
        return 0.5; // 默认中等偏好
      }

      // 发音点击占总交互的比例
      const clickRatio = stats.pronunciationClicks / stats.totalInteractions;

      // 归一化到 0-1 范围
      // 如果点击比例超过 0.3，认为是强听觉偏好
      return Math.min(clickRatio / 0.3, 1.0);
    } catch (error) {
      this.trackingLogger.warn({ err: error, userId }, 'Failed to calculate auditory preference');
      return 0.5;
    }
  }

  /**
   * 获取用户最近的交互事件（用于实时分析）
   */
  async getRecentEvents(userId: string, limit: number = 100): Promise<TrackingEvent[]> {
    try {
      // 从数据库获取
      const dbEvents = await prisma.userTrackingEvent.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      // 合并缓冲区中的事件
      const bufferedEvents = this.eventsBuffer
        .filter((e) => e.userId === userId)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // 合并并去重
      const allEvents = [
        ...bufferedEvents.map((e) => ({
          type: e.eventType as TrackingEventType,
          timestamp: e.timestamp.getTime(),
          data: e.eventData ?? undefined,
          sessionId: e.sessionId,
        })),
        ...dbEvents.map((e) => ({
          type: e.eventType as TrackingEventType,
          timestamp: e.timestamp.getTime(),
          data: e.eventData as Record<string, unknown> | undefined,
          sessionId: e.sessionId,
        })),
      ];

      // 按时间排序并限制数量
      return allEvents.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    } catch (error) {
      this.trackingLogger.warn({ err: error, userId }, 'Failed to get recent events');
      return [];
    }
  }

  /**
   * 停止服务（用于优雅关闭）
   */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

export const trackingService = new TrackingService();
export default trackingService;
