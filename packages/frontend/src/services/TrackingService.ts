/**
 * TrackingService - 前端埋点服务
 *
 * 收集用户交互数据，用于学习风格精准建模
 * 主要收集以下事件：
 * - 发音按钮点击事件（用于计算听觉偏好）
 * - 学习暂停/恢复事件
 * - 页面/任务切换事件
 * - 交互频率数据
 */

import { trackingLogger } from '../utils/logger';

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
 * 交互频率统计
 */
export interface InteractionStats {
  pronunciationClicks: number;
  pauseCount: number;
  resumeCount: number;
  pageSwitchCount: number;
  taskSwitchCount: number;
  totalInteractions: number;
  sessionDuration: number;
  lastActivityTime: number;
}

/**
 * 批量上报的事件包
 */
interface EventBatch {
  events: TrackingEvent[];
  userId?: string;
  sessionId: string;
  timestamp: number;
}

class TrackingService {
  private events: TrackingEvent[] = [];
  private sessionId: string;
  private sessionStartTime: number;
  private lastActivityTime: number;
  private stats: InteractionStats;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly BATCH_SIZE = 20;
  private readonly FLUSH_INTERVAL = 30000; // 30秒自动上报
  private readonly API_ENDPOINT = '/api/tracking/events';
  private isPageVisible = true;
  private pauseStartTime: number | null = null;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.sessionStartTime = Date.now();
    this.lastActivityTime = Date.now();
    this.stats = this.createEmptyStats();

    // 监听页面可见性变化
    this.setupVisibilityListener();

    // 监听页面卸载，确保数据不丢失
    this.setupUnloadListener();

    // 启动定时上报
    this.startFlushTimer();
  }

  /**
   * 生成唯一的会话ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * 创建空的统计对象
   */
  private createEmptyStats(): InteractionStats {
    return {
      pronunciationClicks: 0,
      pauseCount: 0,
      resumeCount: 0,
      pageSwitchCount: 0,
      taskSwitchCount: 0,
      totalInteractions: 0,
      sessionDuration: 0,
      lastActivityTime: Date.now(),
    };
  }

  /**
   * 设置页面可见性监听
   */
  private setupVisibilityListener(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.trackLearningPause('visibility_hidden');
        } else {
          this.trackLearningResume('visibility_visible');
        }
      });
    }
  }

  /**
   * 设置页面卸载监听
   */
  private setupUnloadListener(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.trackSessionEnd();
        this.flushSync();
      });

      window.addEventListener('pagehide', () => {
        this.trackSessionEnd();
        this.flushSync();
      });
    }
  }

  /**
   * 启动定时上报
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.FLUSH_INTERVAL);
  }

  /**
   * 记录事件
   */
  private recordEvent(event: TrackingEvent): void {
    this.events.push({
      ...event,
      sessionId: this.sessionId,
    });
    this.lastActivityTime = Date.now();
    this.stats.lastActivityTime = Date.now();
    this.stats.totalInteractions++;

    // 达到批量大小时自动上报
    if (this.events.length >= this.BATCH_SIZE) {
      this.flush();
    }
  }

  /**
   * 记录发音按钮点击
   */
  trackPronunciationClick(wordId: string, word: string): void {
    this.stats.pronunciationClicks++;
    this.recordEvent({
      type: 'pronunciation_click',
      timestamp: Date.now(),
      data: {
        wordId,
        word,
        clickCount: this.stats.pronunciationClicks,
      },
    });
    trackingLogger.debug({ wordId, word }, 'Pronunciation click tracked');
  }

  /**
   * 记录学习暂停
   */
  trackLearningPause(reason?: string): void {
    if (this.pauseStartTime !== null) {
      // 已经在暂停状态，忽略
      return;
    }

    this.pauseStartTime = Date.now();
    this.stats.pauseCount++;
    this.isPageVisible = false;

    this.recordEvent({
      type: 'learning_pause',
      timestamp: Date.now(),
      data: {
        reason,
        pauseCount: this.stats.pauseCount,
        sessionDuration: Date.now() - this.sessionStartTime,
      },
    });
    trackingLogger.debug({ reason }, 'Learning pause tracked');
  }

  /**
   * 记录学习恢复
   */
  trackLearningResume(reason?: string): void {
    if (this.pauseStartTime === null) {
      // 没有在暂停状态，忽略
      return;
    }

    const pauseDuration = Date.now() - this.pauseStartTime;
    this.pauseStartTime = null;
    this.stats.resumeCount++;
    this.isPageVisible = true;

    this.recordEvent({
      type: 'learning_resume',
      timestamp: Date.now(),
      data: {
        reason,
        pauseDuration,
        resumeCount: this.stats.resumeCount,
        sessionDuration: Date.now() - this.sessionStartTime,
      },
    });
    trackingLogger.debug({ reason, pauseDuration }, 'Learning resume tracked');
  }

  /**
   * 记录页面切换
   */
  trackPageSwitch(fromPage: string, toPage: string): void {
    this.stats.pageSwitchCount++;
    this.recordEvent({
      type: 'page_switch',
      timestamp: Date.now(),
      data: {
        fromPage,
        toPage,
        switchCount: this.stats.pageSwitchCount,
      },
    });
    trackingLogger.debug({ fromPage, toPage }, 'Page switch tracked');
  }

  /**
   * 记录任务切换
   */
  trackTaskSwitch(fromTask: string, toTask: string): void {
    this.stats.taskSwitchCount++;
    this.recordEvent({
      type: 'task_switch',
      timestamp: Date.now(),
      data: {
        fromTask,
        toTask,
        switchCount: this.stats.taskSwitchCount,
      },
    });
    trackingLogger.debug({ fromTask, toTask }, 'Task switch tracked');
  }

  /**
   * 记录一般交互事件
   */
  trackInteraction(action: string, target: string, metadata?: Record<string, unknown>): void {
    this.recordEvent({
      type: 'interaction',
      timestamp: Date.now(),
      data: {
        action,
        target,
        ...metadata,
      },
    });
    trackingLogger.debug({ action, target }, 'Interaction tracked');
  }

  /**
   * 记录会话开始
   */
  trackSessionStart(metadata?: Record<string, unknown>): void {
    this.recordEvent({
      type: 'session_start',
      timestamp: Date.now(),
      data: {
        ...metadata,
        sessionId: this.sessionId,
      },
    });
    trackingLogger.info({ sessionId: this.sessionId }, 'Session start tracked');
  }

  /**
   * 记录会话结束
   */
  trackSessionEnd(): void {
    const sessionDuration = Date.now() - this.sessionStartTime;
    this.stats.sessionDuration = sessionDuration;

    this.recordEvent({
      type: 'session_end',
      timestamp: Date.now(),
      data: {
        sessionId: this.sessionId,
        sessionDuration,
        stats: { ...this.stats },
      },
    });
    trackingLogger.info({ sessionId: this.sessionId, sessionDuration }, 'Session end tracked');
  }

  /**
   * 获取当前会话统计
   */
  getStats(): InteractionStats {
    return {
      ...this.stats,
      sessionDuration: Date.now() - this.sessionStartTime,
      lastActivityTime: this.lastActivityTime,
    };
  }

  /**
   * 检查页面是否可见
   */
  isVisible(): boolean {
    return this.isPageVisible;
  }

  /**
   * 获取当前会话ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * 异步批量上报事件
   */
  async flush(): Promise<void> {
    if (this.events.length === 0) {
      return;
    }

    const eventsToSend = [...this.events];
    this.events = [];

    const batch: EventBatch = {
      events: eventsToSend,
      sessionId: this.sessionId,
      timestamp: Date.now(),
    };

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        // 未登录，将事件放回队列
        this.events = [...eventsToSend, ...this.events];
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}${this.API_ENDPOINT}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        // 上报失败，将事件放回队列
        this.events = [...eventsToSend, ...this.events];
        trackingLogger.warn({ status: response.status }, 'Failed to flush tracking events');
      } else {
        trackingLogger.debug({ count: eventsToSend.length }, 'Tracking events flushed');
      }
    } catch (error) {
      // 网络错误，将事件放回队列
      this.events = [...eventsToSend, ...this.events];
      trackingLogger.error({ err: error }, 'Error flushing tracking events');
    }
  }

  /**
   * 同步上报（用于页面卸载时）
   */
  flushSync(): void {
    if (this.events.length === 0) {
      return;
    }

    const batch: EventBatch = {
      events: [...this.events],
      sessionId: this.sessionId,
      timestamp: Date.now(),
    };

    this.events = [];

    const token = localStorage.getItem('auth_token');
    if (!token) {
      return;
    }

    // 使用 sendBeacon 确保数据在页面卸载时能发送
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(batch)], { type: 'application/json' });
      navigator.sendBeacon(
        `${import.meta.env.VITE_API_URL || ''}${this.API_ENDPOINT}?token=${token}`,
        blob,
      );
    }
  }

  /**
   * 重置会话
   */
  resetSession(): void {
    this.trackSessionEnd();
    this.flush();

    this.sessionId = this.generateSessionId();
    this.sessionStartTime = Date.now();
    this.lastActivityTime = Date.now();
    this.stats = this.createEmptyStats();
    this.pauseStartTime = null;

    this.trackSessionStart();
  }

  /**
   * 清理资源
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.trackSessionEnd();
    this.flushSync();
  }
}

// 导出单例
export const trackingService = new TrackingService();
export default trackingService;
