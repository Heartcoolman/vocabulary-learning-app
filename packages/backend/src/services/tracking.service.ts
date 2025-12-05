/**
 * TrackingService - 后端埋点数据处理服务
 *
 * 接收前端上报的交互事件数据，用于学习风格精准建模
 * 主要处理以下事件：
 * - 发音按钮点击事件（用于计算听觉偏好）
 * - 学习暂停/恢复事件
 * - 页面/任务切换事件
 * - 交互频率数据
 */

import prisma from '../config/database';
import { logger } from '../logger';

/**
 * 埋点事件类型
 */
export type TrackingEventType =
  | 'pronunciation_click'     // 发音按钮点击
  | 'learning_pause'          // 学习暂停
  | 'learning_resume'         // 学习恢复
  | 'page_switch'            // 页面切换
  | 'task_switch'            // 任务切换
  | 'interaction'            // 一般交互事件
  | 'session_start'          // 会话开始
  | 'session_end';           // 会话结束

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

class TrackingService {
  private readonly trackingLogger = logger.child({ module: 'tracking' });

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
      let totalInteractions = events.length;

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

      // 更新用户交互统计（用于学习风格分析）
      await this.updateUserInteractionStats(userId, {
        pronunciationClicks,
        pauseCount,
        pageSwitchCount,
        totalInteractions,
      });

      // 存储原始事件数据到 UserTrackingEvent 表
      await this.storeEvents(userId, sessionId, events);

      this.trackingLogger.debug(
        {
          userId,
          sessionId,
          eventCount: events.length,
          pronunciationClicks,
          pauseCount,
          pageSwitchCount,
        },
        'Tracking batch processed'
      );
    } catch (error) {
      this.trackingLogger.error({ err: error, userId, batch }, 'Failed to process tracking batch');
      throw error;
    }
  }

  /**
   * 更新用户交互统计
   */
  private async updateUserInteractionStats(
    userId: string,
    stats: {
      pronunciationClicks: number;
      pauseCount: number;
      pageSwitchCount: number;
      totalInteractions: number;
    }
  ): Promise<void> {
    try {
      // 使用 upsert 更新或创建用户交互统计
      await prisma.userInteractionStats.upsert({
        where: { userId },
        create: {
          userId,
          pronunciationClicks: stats.pronunciationClicks,
          pauseCount: stats.pauseCount,
          pageSwitchCount: stats.pageSwitchCount,
          totalInteractions: stats.totalInteractions,
          lastActivityTime: new Date(),
        },
        update: {
          pronunciationClicks: { increment: stats.pronunciationClicks },
          pauseCount: { increment: stats.pauseCount },
          pageSwitchCount: { increment: stats.pageSwitchCount },
          totalInteractions: { increment: stats.totalInteractions },
          lastActivityTime: new Date(),
        },
      });
    } catch (error) {
      // 如果表不存在，记录警告但不中断处理
      this.trackingLogger.warn(
        { err: error, userId },
        'Failed to update user interaction stats (table may not exist)'
      );
    }
  }

  /**
   * 存储原始事件数据
   */
  private async storeEvents(
    userId: string,
    sessionId: string,
    events: TrackingEvent[]
  ): Promise<void> {
    try {
      // 批量插入事件
      await prisma.userTrackingEvent.createMany({
        data: events.map((event) => ({
          userId,
          sessionId,
          eventType: event.type,
          eventData: event.data ? JSON.stringify(event.data) : null,
          timestamp: new Date(event.timestamp),
        })),
        skipDuplicates: true,
      });
    } catch (error) {
      // 如果表不存在，记录警告但不中断处理
      this.trackingLogger.warn(
        { err: error, userId, sessionId, eventCount: events.length },
        'Failed to store tracking events (table may not exist)'
      );
    }
  }

  /**
   * 获取用户交互统计（用于学习风格分析）
   */
  async getUserInteractionStats(userId: string): Promise<UserInteractionStats | null> {
    try {
      const stats = await prisma.userInteractionStats.findUnique({
        where: { userId },
      });

      if (!stats) {
        return null;
      }

      return {
        pronunciationClicks: stats.pronunciationClicks,
        pauseCount: stats.pauseCount,
        pageSwitchCount: stats.pageSwitchCount,
        totalInteractions: stats.totalInteractions,
        totalSessionDuration: 0, // 需要从会话数据计算
        lastActivityTime: stats.lastActivityTime,
      };
    } catch (error) {
      this.trackingLogger.warn(
        { err: error, userId },
        'Failed to get user interaction stats'
      );
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
      this.trackingLogger.warn(
        { err: error, userId },
        'Failed to calculate auditory preference'
      );
      return 0.5;
    }
  }

  /**
   * 获取用户最近的交互事件（用于实时分析）
   */
  async getRecentEvents(
    userId: string,
    limit: number = 100
  ): Promise<TrackingEvent[]> {
    try {
      const events = await prisma.userTrackingEvent.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      return events.map((e) => ({
        type: e.eventType as TrackingEventType,
        timestamp: e.timestamp.getTime(),
        data: e.eventData ? JSON.parse(e.eventData) : undefined,
        sessionId: e.sessionId,
      }));
    } catch (error) {
      this.trackingLogger.warn(
        { err: error, userId },
        'Failed to get recent events'
      );
      return [];
    }
  }
}

export const trackingService = new TrackingService();
export default trackingService;
