import { EventEmitter } from 'events';
import { RealtimeEvent, RealtimeSubscriptionOptions } from '@danci/shared/types';
import { logger } from '../logger';

/**
 * 订阅信息
 */
interface Subscription {
  userId: string;
  sessionId?: string;
  eventTypes?: Array<RealtimeEvent['type']>;
  callback: (event: RealtimeEvent) => void;
  createdAt: Date;
}

/**
 * 实时服务类
 *
 * 使用 EventEmitter 实现发布-订阅模式，支持：
 * 1. 用户级别的事件订阅
 * 2. 会话级别的事件订阅
 * 3. 事件类型过滤
 * 4. 自动清理过期订阅
 */
class RealtimeService extends EventEmitter {
  /** 订阅管理：subscriptionId -> Subscription */
  private subscriptions: Map<string, Subscription>;

  /** 用户订阅索引：userId -> Set<subscriptionId> */
  private userSubscriptions: Map<string, Set<string>>;

  /** 会话订阅索引：sessionId -> Set<subscriptionId> */
  private sessionSubscriptions: Map<string, Set<string>>;

  /** 订阅 ID 计数器 */
  private subscriptionCounter: number;

  /** 清理定时器 */
  private cleanupTimer?: NodeJS.Timeout;

  /** 订阅过期时间（默认 24 小时） */
  private readonly SUBSCRIPTION_TTL = 24 * 60 * 60 * 1000;

  /** 清理间隔（默认 1 小时） */
  private readonly CLEANUP_INTERVAL = 60 * 60 * 1000;

  constructor() {
    super();
    this.subscriptions = new Map();
    this.userSubscriptions = new Map();
    this.sessionSubscriptions = new Map();
    this.subscriptionCounter = 0;

    // 启动定期清理
    this.startCleanup();

    logger.info('RealtimeService initialized');
  }

  /**
   * 订阅实时事件
   *
   * @param options 订阅选项
   * @param callback 事件回调函数
   * @returns 取消订阅函数
   */
  subscribe(
    options: RealtimeSubscriptionOptions,
    callback: (event: RealtimeEvent) => void,
  ): () => void {
    const subscriptionId = `sub_${++this.subscriptionCounter}_${Date.now()}`;
    const subscription: Subscription = {
      userId: options.userId,
      sessionId: options.sessionId,
      eventTypes: options.eventTypes,
      callback,
      createdAt: new Date(),
    };

    // 保存订阅
    this.subscriptions.set(subscriptionId, subscription);

    // 建立用户索引
    if (!this.userSubscriptions.has(options.userId)) {
      this.userSubscriptions.set(options.userId, new Set());
    }
    this.userSubscriptions.get(options.userId)!.add(subscriptionId);

    // 建立会话索引（如果指定了 sessionId）
    if (options.sessionId) {
      if (!this.sessionSubscriptions.has(options.sessionId)) {
        this.sessionSubscriptions.set(options.sessionId, new Set());
      }
      this.sessionSubscriptions.get(options.sessionId)!.add(subscriptionId);
    }

    logger.debug(
      {
        subscriptionId,
        userId: options.userId,
        sessionId: options.sessionId,
        eventTypes: options.eventTypes,
      },
      'New realtime subscription created',
    );

    // 返回取消订阅函数
    return () => this.unsubscribe(subscriptionId);
  }

  /**
   * 取消订阅
   *
   * @param subscriptionId 订阅 ID
   */
  private unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return;
    }

    // 从用户索引中移除
    const userSubs = this.userSubscriptions.get(subscription.userId);
    if (userSubs) {
      userSubs.delete(subscriptionId);
      if (userSubs.size === 0) {
        this.userSubscriptions.delete(subscription.userId);
      }
    }

    // 从会话索引中移除
    if (subscription.sessionId) {
      const sessionSubs = this.sessionSubscriptions.get(subscription.sessionId);
      if (sessionSubs) {
        sessionSubs.delete(subscriptionId);
        if (sessionSubs.size === 0) {
          this.sessionSubscriptions.delete(subscription.sessionId);
        }
      }
    }

    // 删除订阅
    this.subscriptions.delete(subscriptionId);

    logger.debug({ subscriptionId }, 'Subscription removed');
  }

  /**
   * 发送事件给指定用户
   *
   * @param userId 用户 ID
   * @param event 实时事件
   */
  async sendToUser(userId: string, event: RealtimeEvent): Promise<void> {
    const subscriptionIds = this.userSubscriptions.get(userId);
    if (!subscriptionIds || subscriptionIds.size === 0) {
      logger.debug({ userId, eventType: event.type }, 'No active subscriptions for user');
      return;
    }

    let deliveredCount = 0;

    for (const subId of subscriptionIds) {
      const subscription = this.subscriptions.get(subId);
      if (!subscription) {
        continue;
      }

      // 检查事件类型过滤
      if (subscription.eventTypes && !subscription.eventTypes.includes(event.type)) {
        continue;
      }

      // 检查会话过滤
      if (subscription.sessionId) {
        // 如果订阅指定了 sessionId，检查事件是否属于该会话
        const eventSessionId = this.extractSessionId(event);
        if (eventSessionId && eventSessionId !== subscription.sessionId) {
          continue;
        }
      }

      try {
        subscription.callback(event);
        deliveredCount++;
      } catch (error) {
        logger.error(
          { err: error, subscriptionId: subId, eventType: event.type },
          'Error delivering event to subscription',
        );
      }
    }

    logger.debug(
      { userId, eventType: event.type, delivered: deliveredCount, total: subscriptionIds.size },
      'Event delivered to user subscriptions',
    );
  }

  /**
   * 发送事件给指定会话
   *
   * @param sessionId 会话 ID
   * @param event 实时事件
   */
  async sendToSession(sessionId: string, event: RealtimeEvent): Promise<void> {
    const subscriptionIds = this.sessionSubscriptions.get(sessionId);
    if (!subscriptionIds || subscriptionIds.size === 0) {
      logger.debug({ sessionId, eventType: event.type }, 'No active subscriptions for session');
      return;
    }

    let deliveredCount = 0;

    for (const subId of subscriptionIds) {
      const subscription = this.subscriptions.get(subId);
      if (!subscription) {
        continue;
      }

      // 检查事件类型过滤
      if (subscription.eventTypes && !subscription.eventTypes.includes(event.type)) {
        continue;
      }

      try {
        subscription.callback(event);
        deliveredCount++;
      } catch (error) {
        logger.error(
          { err: error, subscriptionId: subId, eventType: event.type },
          'Error delivering event to subscription',
        );
      }
    }

    logger.debug(
      { sessionId, eventType: event.type, delivered: deliveredCount, total: subscriptionIds.size },
      'Event delivered to session subscriptions',
    );
  }

  /**
   * 广播事件给所有订阅者
   *
   * @param event 实时事件
   */
  async broadcast(event: RealtimeEvent): Promise<void> {
    let deliveredCount = 0;

    for (const [subId, subscription] of this.subscriptions.entries()) {
      // 检查事件类型过滤
      if (subscription.eventTypes && !subscription.eventTypes.includes(event.type)) {
        continue;
      }

      try {
        subscription.callback(event);
        deliveredCount++;
      } catch (error) {
        logger.error(
          { err: error, subscriptionId: subId, eventType: event.type },
          'Error broadcasting event',
        );
      }
    }

    logger.debug(
      { eventType: event.type, delivered: deliveredCount, total: this.subscriptions.size },
      'Event broadcasted',
    );
  }

  /**
   * 从事件中提取 sessionId
   */
  private extractSessionId(event: RealtimeEvent): string | undefined {
    if ('payload' in event && event.payload && typeof event.payload === 'object') {
      const payload = event.payload as Record<string, unknown>;
      if ('sessionId' in payload && typeof payload.sessionId === 'string') {
        return payload.sessionId;
      }
    }
    return undefined;
  }

  /**
   * 格式化为 SSE 消息
   *
   * @param event 实时事件
   * @param id 消息 ID
   * @returns SSE 格式的字符串
   */
  formatSSEMessage(event: RealtimeEvent, id?: string): string {
    const lines: string[] = [];

    if (id) {
      lines.push(`id: ${id}`);
    }

    lines.push(`event: ${event.type}`);
    lines.push(`data: ${JSON.stringify(event)}`);
    lines.push(''); // SSE 要求以空行结尾

    return lines.join('\n') + '\n';
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalSubscriptions: this.subscriptions.size,
      activeUsers: this.userSubscriptions.size,
      activeSessions: this.sessionSubscriptions.size,
    };
  }

  /**
   * 启动定期清理
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSubscriptions();
    }, this.CLEANUP_INTERVAL);

    // 避免定时器阻止进程退出（测试/脚本场景）
    this.cleanupTimer.unref();

    // 确保进程退出时清理定时器
    process.on('beforeExit', () => {
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
      }
    });
  }

  /**
   * 清理过期订阅
   */
  private cleanupExpiredSubscriptions(): void {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [subId, subscription] of this.subscriptions.entries()) {
      if (now - subscription.createdAt.getTime() > this.SUBSCRIPTION_TTL) {
        expiredIds.push(subId);
      }
    }

    if (expiredIds.length > 0) {
      logger.info({ count: expiredIds.length }, 'Cleaning up expired subscriptions');
      expiredIds.forEach((id) => this.unsubscribe(id));
    }
  }

  /**
   * 关闭服务
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.subscriptions.clear();
    this.userSubscriptions.clear();
    this.sessionSubscriptions.clear();
    logger.info('RealtimeService shutdown');
  }
}

// 导出单例
export const realtimeService = new RealtimeService();
export default realtimeService;
