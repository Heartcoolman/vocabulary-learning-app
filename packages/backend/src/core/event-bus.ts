/**
 * Event Bus - 领域事件总线系统
 *
 * 职责:
 * - 提供进程内事件发布/订阅机制
 * - 复用 DecisionEventsService 的 SSE 能力
 * - 可选支持 Redis 跨进程通信
 * - 类型安全的事件系统
 *
 * 架构:
 * - 基于 EventEmitter 实现进程内通信
 * - 通过 DecisionEventsService 支持 SSE 实时推送
 * - Redis 可选模块实现跨进程/分布式通信
 */

import { EventEmitter } from 'events';
import Redis from 'ioredis';
import type { SessionType } from '@prisma/client';
import { serviceLogger } from '../logger';
import { StrategyParams, UserState } from '../amas/types';

const logger = serviceLogger.child({ module: 'event-bus' });

// ==================== 事件 Payload 定义 ====================

/**
 * 答题记录事件载荷
 */
export interface AnswerRecordedPayload {
  userId: string;
  wordId: string;
  sessionId?: string;
  isCorrect: boolean;
  responseTime?: number;
  dwellTime?: number;
  masteryLevelBefore?: number;
  masteryLevelAfter?: number;
  timestamp: Date;
}

/**
 * 学习会话开始事件载荷
 */
export interface SessionStartedPayload {
  userId: string;
  sessionId: string;
  sessionType: SessionType;
  targetMasteryCount?: number;
  startedAt: Date;
}

/**
 * 学习会话结束事件载荷
 */
export interface SessionEndedPayload {
  userId: string;
  sessionId: string;
  startedAt: Date;
  endedAt: Date;
  totalQuestions: number;
  actualMasteryCount?: number;
  targetMasteryCount?: number;
  flowPeakScore?: number;
  avgCognitiveLoad?: number;
}

/**
 * 单词掌握事件载荷
 */
export interface WordMasteredPayload {
  userId: string;
  wordId: string;
  masteryLevel: number;
  evaluationScore: number;
  confidence: number;
  timestamp: Date;
}

/**
 * 遗忘风险警告事件载荷
 */
export interface ForgettingRiskPayload {
  userId: string;
  wordId: string;
  recallProbability: number;
  riskLevel: 'high' | 'medium' | 'low';
  lastReviewDate?: Date;
  suggestedReviewDate: Date;
  timestamp: Date;
}

/**
 * 策略调整事件载荷
 */
export interface StrategyAdjustedPayload {
  userId: string;
  sessionId?: string;
  previousStrategy: StrategyParams;
  newStrategy: StrategyParams;
  userState: UserState;
  reason: string;
  timestamp: Date;
}

/**
 * 用户状态更新事件载荷
 */
export interface UserStateUpdatedPayload {
  userId: string;
  sessionId?: string;
  previousState?: UserState;
  newState: UserState;
  triggerEvent: string;
  timestamp: Date;
}

/**
 * 用户画像更新事件载荷
 */
export interface ProfileUpdatedPayload {
  userId: string;
  profileType: 'habit' | 'cognitive' | 'learning' | 'full';
  updatedFields: string[];
  timestamp: Date;
}

/**
 * 奖励分配事件载荷
 */
export interface RewardDistributedPayload {
  userId: string;
  sessionId?: string;
  rewardValue: number;
  rewardType: 'immediate' | 'delayed' | 'aggregated';
  reason: string;
  actionContext?: StrategyParams;
  timestamp: Date;
}

// ==================== 事件类型联合 ====================

/**
 * 学习事件类型定义（类型安全的联合类型）
 */
export type LearningEvent =
  | { type: 'ANSWER_RECORDED'; payload: AnswerRecordedPayload }
  | { type: 'SESSION_STARTED'; payload: SessionStartedPayload }
  | { type: 'SESSION_ENDED'; payload: SessionEndedPayload }
  | { type: 'WORD_MASTERED'; payload: WordMasteredPayload }
  | { type: 'FORGETTING_RISK_HIGH'; payload: ForgettingRiskPayload }
  | { type: 'STRATEGY_ADJUSTED'; payload: StrategyAdjustedPayload }
  | { type: 'USER_STATE_UPDATED'; payload: UserStateUpdatedPayload }
  | { type: 'PROFILE_UPDATED'; payload: ProfileUpdatedPayload }
  | { type: 'REWARD_DISTRIBUTED'; payload: RewardDistributedPayload };

/**
 * 领域事件接口
 */
export interface DomainEvent<T = unknown> {
  type: string;
  payload: T;
  timestamp: Date;
  correlationId: string;
  originId: string;
}

/**
 * 事件处理器类型
 */
export type EventHandler<T = unknown> = (payload: T, event: DomainEvent<T>) => void | Promise<void>;

/**
 * 事件订阅配置
 */
export interface SubscriptionOptions {
  /** 订阅者 ID（用于管理订阅） */
  subscriberId?: string;
  /** 是否异步处理（默认 true） */
  async?: boolean;
  /** 错误处理器 */
  onError?: (error: Error, event: DomainEvent) => void;
}

// ==================== 事件总线实现 ====================

/**
 * 事件总线配置
 */
export interface EventBusConfig {
  /** 是否启用 Redis 跨进程通信 */
  enableRedis?: boolean;
  /** Redis 频道前缀 */
  redisChannelPrefix?: string;
  /** SSE 推送开关 */
  enableSSE?: boolean;
  /** 最大监听器数量 */
  maxListeners?: number;
}

/**
 * DecisionEventsService 实例类型（通过已导出的单例推断）
 */
interface IDecisionEventsService {
  emitDecision(data: {
    decisionId: string;
    userId?: string;
    timestamp: Date;
    decisionSource: string;
    selectedAction: Record<string, unknown>;
    stateSnapshot?: Record<string, unknown>;
    isSimulation?: boolean;
  }): void;
}

/**
 * 事件总线类
 *
 * 特性:
 * - 类型安全的事件发布订阅
 * - 支持同步/异步处理
 * - 集成 DecisionEventsService 实现 SSE 推送
 * - 可选 Redis 跨进程通信
 * - 错误隔离（单个处理器失败不影响其他订阅者）
 */
export class EventBus {
  private emitter: EventEmitter;
  private redis?: Redis;
  private redisSub?: Redis;
  private config: Required<EventBusConfig>;
  private subscriptions = new Map<string, Set<string>>();
  private readonly originId: string;

  constructor(
    private decisionEventsService: IDecisionEventsService,
    redis?: Redis,
    config: EventBusConfig = {},
  ) {
    this.emitter = new EventEmitter();
    this.config = {
      enableRedis: config.enableRedis ?? false,
      redisChannelPrefix: config.redisChannelPrefix ?? 'events:',
      enableSSE: config.enableSSE ?? true,
      maxListeners: config.maxListeners ?? 100,
    };

    this.emitter.setMaxListeners(this.config.maxListeners);
    this.originId = this.generateOriginId();

    if (this.config.enableRedis && redis) {
      this.setupRedis(redis);
    }

    logger.info(
      {
        enableRedis: this.config.enableRedis,
        enableSSE: this.config.enableSSE,
      },
      'EventBus initialized',
    );
  }

  /**
   * 发布事件
   *
   * @param event - 领域事件
   */
  async publish<T = unknown>(event: LearningEvent): Promise<void> {
    const domainEvent: DomainEvent<T> = {
      type: event.type,
      payload: event.payload as T,
      timestamp: new Date(),
      correlationId: this.generateCorrelationId(),
      originId: this.originId,
    };

    logger.debug(
      { type: event.type, correlationId: domainEvent.correlationId },
      'Publishing event',
    );

    try {
      // 1. 进程内发布
      this.emitter.emit(event.type, domainEvent.payload, domainEvent);

      // 2. SSE 推送（针对特定事件类型）
      if (this.config.enableSSE) {
        this.pushToSSE(domainEvent);
      }

      // 3. Redis 跨进程发布
      if (this.config.enableRedis && this.redis) {
        await this.publishToRedis(domainEvent);
      }
    } catch (error) {
      logger.error({ error, event: domainEvent }, 'Failed to publish event');
      throw error;
    }
  }

  /**
   * 订阅事件
   *
   * @param eventType - 事件类型
   * @param handler - 事件处理器
   * @param options - 订阅配置
   * @returns 取消订阅函数
   */
  subscribe<T = unknown>(
    eventType: LearningEvent['type'],
    handler: EventHandler<T>,
    options: SubscriptionOptions = {},
  ): () => void {
    const { subscriberId = this.generateSubscriberId(), async = true, onError } = options;

    // 包装处理器以支持错误隔离和异步处理
    const wrappedHandler = async (payload: T, event: DomainEvent<T>) => {
      try {
        if (async) {
          // 异步处理（不阻塞发布者）
          Promise.resolve(handler(payload, event)).catch((err) => {
            logger.error({ error: err, event }, 'Async event handler error');
            onError?.(err, event);
          });
        } else {
          // 同步处理
          await handler(payload, event);
        }
      } catch (error) {
        logger.error({ error, event }, 'Event handler error');
        onError?.(error as Error, event);
      }
    };

    this.emitter.on(eventType, wrappedHandler);

    // 记录订阅关系
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, new Set());
    }
    this.subscriptions.get(eventType)!.add(subscriberId);

    logger.debug({ eventType, subscriberId }, 'Subscribed to event');

    // 返回取消订阅函数
    return () => {
      this.emitter.off(eventType, wrappedHandler);
      this.subscriptions.get(eventType)?.delete(subscriberId);
      logger.debug({ eventType, subscriberId }, 'Unsubscribed from event');
    };
  }

  /**
   * 订阅多个事件类型
   *
   * @param eventTypes - 事件类型数组
   * @param handler - 事件处理器
   * @param options - 订阅配置
   * @returns 取消所有订阅的函数
   */
  subscribeMany<T = unknown>(
    eventTypes: LearningEvent['type'][],
    handler: EventHandler<T>,
    options: SubscriptionOptions = {},
  ): () => void {
    const unsubscribers = eventTypes.map((type) => this.subscribe(type, handler, options));

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }

  /**
   * 一次性订阅（处理一次后自动取消）
   *
   * @param eventType - 事件类型
   * @param handler - 事件处理器
   * @param options - 订阅配置
   */
  once<T = unknown>(
    eventType: LearningEvent['type'],
    handler: EventHandler<T>,
    options: SubscriptionOptions = {},
  ): void {
    const unsubscribe = this.subscribe<T>(
      eventType,
      async (payload, event) => {
        await handler(payload, event);
        unsubscribe();
      },
      options,
    );
  }

  /**
   * 获取事件订阅者数量
   *
   * @param eventType - 事件类型
   * @returns 订阅者数量
   */
  getSubscriberCount(eventType: LearningEvent['type']): number {
    return this.subscriptions.get(eventType)?.size ?? 0;
  }

  /**
   * 获取所有事件类型的订阅情况
   *
   * @returns 事件类型到订阅者数量的映射
   */
  getSubscriptionStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    this.subscriptions.forEach((subscribers, eventType) => {
      stats[eventType] = subscribers.size;
    });
    return stats;
  }

  /**
   * 清除所有订阅
   */
  clearAllSubscriptions(): void {
    this.emitter.removeAllListeners();
    this.subscriptions.clear();
    logger.info('Cleared all subscriptions');
  }

  /**
   * 优雅关闭
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down EventBus');

    this.clearAllSubscriptions();

    if (this.redisSub) {
      try {
        // 取消所有订阅
        await this.redisSub.punsubscribe();
        await this.redisSub.quit();
        logger.info('Redis subscriber closed');
      } catch (error) {
        logger.error({ error }, 'Error closing Redis subscriber');
      }
    }

    logger.info('EventBus shut down complete');
  }

  // ==================== 私有方法 ====================

  /**
   * 设置 Redis 订阅
   */
  private setupRedis(redis: Redis): void {
    this.redis = redis;
    this.redisSub = redis.duplicate();

    // 监听模式匹配的消息
    this.redisSub.on('pmessage', (pattern: string, channel: string, message: string) => {
      try {
        const event = JSON.parse(message) as DomainEvent;
        const eventType = channel.replace(this.config.redisChannelPrefix, '');

        // 忽略本实例自己发布到 Redis 的事件，避免重复投递
        if (event.originId === this.originId) {
          return;
        }

        // 重新发布到本地 EventEmitter
        this.emitter.emit(eventType, event.payload, event);

        logger.debug(
          { eventType, correlationId: event.correlationId, pattern, channel },
          'Received event from Redis',
        );
      } catch (error) {
        logger.error({ error, channel, message }, 'Failed to process Redis message');
      }
    });

    // 监听连接错误
    this.redisSub.on('error', (error: Error) => {
      logger.error({ error }, 'Redis subscriber error');
    });

    // 订阅所有事件频道 (使用模式匹配)
    const pattern = `${this.config.redisChannelPrefix}*`;
    this.redisSub
      .psubscribe(pattern)
      .then(() => {
        logger.info({ pattern }, 'Redis pub/sub enabled, subscribed to pattern');
      })
      .catch((error: Error) => {
        logger.error({ error, pattern }, 'Failed to subscribe to Redis pattern');
      });
  }

  /**
   * 发布到 Redis
   */
  private async publishToRedis(event: DomainEvent): Promise<void> {
    if (!this.redis) return;

    const channel = `${this.config.redisChannelPrefix}${event.type}`;
    await this.redis.publish(channel, JSON.stringify(event));

    logger.debug({ channel, correlationId: event.correlationId }, 'Published to Redis');
  }

  /**
   * 推送到 SSE（通过 DecisionEventsService）
   */
  private pushToSSE(event: DomainEvent): void {
    // 目前只推送策略调整和用户状态更新事件到 SSE
    // 可以根据需要扩展其他事件类型
    if (event.type === 'STRATEGY_ADJUSTED' || event.type === 'USER_STATE_UPDATED') {
      const payload = event.payload as StrategyAdjustedPayload | UserStateUpdatedPayload;

      // 将事件转换为 DecisionEventsService 格式
      this.decisionEventsService.emitDecision({
        decisionId: event.correlationId,
        userId: payload.userId,
        timestamp: event.timestamp,
        decisionSource: 'event-bus',
        selectedAction:
          event.type === 'STRATEGY_ADJUSTED'
            ? ((event.payload as StrategyAdjustedPayload).newStrategy as unknown as Record<
                string,
                unknown
              >)
            : {},
        stateSnapshot:
          event.type === 'USER_STATE_UPDATED'
            ? ((event.payload as UserStateUpdatedPayload).newState as unknown as Record<
                string,
                unknown
              >)
            : undefined,
        isSimulation: false,
      });

      logger.debug({ type: event.type, correlationId: event.correlationId }, 'Pushed to SSE');
    }
  }

  /**
   * 生成关联 ID
   */
  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateOriginId(): string {
    return `eventbus-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * 生成订阅者 ID
   */
  private generateSubscriberId(): string {
    return `subscriber-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ==================== 工厂函数 ====================

let eventBusInstance: EventBus | null = null;

/**
 * 获取事件总线单例
 *
 * @param decisionEventsService - DecisionEventsService 实例
 * @param redis - Redis 客户端（可选）
 * @param config - 事件总线配置（可选）
 * @returns EventBus 实例
 */
export function getEventBus(
  decisionEventsService: IDecisionEventsService,
  redis?: Redis,
  config?: EventBusConfig,
): EventBus {
  if (!eventBusInstance) {
    eventBusInstance = new EventBus(decisionEventsService, redis, config);
  }
  return eventBusInstance;
}

/**
 * 重置事件总线单例（仅用于测试）
 */
export function resetEventBus(): void {
  eventBusInstance = null;
}

// ==================== 导出 ====================

export default EventBus;
