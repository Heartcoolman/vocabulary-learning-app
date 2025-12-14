/**
 * Event Bus 使用示例
 *
 * 展示事件总线的各种使用场景
 */

import {
  getEventBus,
  AnswerRecordedPayload,
  SessionStartedPayload,
  WordMasteredPayload,
  ForgettingRiskPayload,
  SessionEndedPayload,
  StrategyAdjustedPayload,
  RewardDistributedPayload,
} from '../core/event-bus';
import { decisionEventsService } from '../services/decision-events.service';
import { getRedisClient } from '../config/redis';
import { serviceLogger } from '../logger';

const logger = serviceLogger.child({ module: 'event-bus-example' });

/**
 * 示例 1: 基本的事件发布和订阅
 */
export function basicExample() {
  const eventBus = getEventBus(decisionEventsService);

  // 订阅答题记录事件
  const unsubscribe = eventBus.subscribe<AnswerRecordedPayload>(
    'ANSWER_RECORDED',
    (payload, event) => {
      logger.info(
        {
          userId: payload.userId,
          wordId: payload.wordId,
          isCorrect: payload.isCorrect,
          correlationId: event.correlationId,
        },
        'Answer recorded',
      );

      // 处理答题记录逻辑
      // 例如：更新统计数据、触发徽章检查等
    },
  );

  // 发布事件
  eventBus.publish({
    type: 'ANSWER_RECORDED',
    payload: {
      userId: 'user-123',
      wordId: 'word-456',
      isCorrect: true,
      responseTime: 1200,
      dwellTime: 3000,
      masteryLevelBefore: 2,
      masteryLevelAfter: 3,
      timestamp: new Date(),
    },
  });

  // 取消订阅
  // unsubscribe();
}

/**
 * 示例 2: 订阅多个事件
 */
export function multipleEventsExample() {
  const eventBus = getEventBus(decisionEventsService);

  // 订阅多个学习相关事件
  const unsubscribeAll = eventBus.subscribeMany(
    ['SESSION_STARTED', 'SESSION_ENDED', 'WORD_MASTERED'],
    (payload, event) => {
      logger.info(
        {
          type: event.type,
          payload,
          correlationId: event.correlationId,
        },
        'Learning event received',
      );

      // 统一处理学习进度更新
      // 例如：更新进度条、发送通知等
    },
  );

  // 取消所有订阅
  // unsubscribeAll();
}

/**
 * 示例 3: 一次性订阅
 */
export function onceExample() {
  const eventBus = getEventBus(decisionEventsService);

  // 只处理第一次会话开始事件
  eventBus.once<SessionStartedPayload>('SESSION_STARTED', (payload, event) => {
    logger.info(
      {
        sessionId: payload.sessionId,
        sessionType: payload.sessionType,
      },
      'First session started',
    );

    // 执行首次会话初始化逻辑
  });
}

/**
 * 示例 4: 带错误处理的订阅
 */
export function errorHandlingExample() {
  const eventBus = getEventBus(decisionEventsService);

  eventBus.subscribe<AnswerRecordedPayload>(
    'ANSWER_RECORDED',
    async (payload, event) => {
      // 可能会抛出错误的异步操作
      await processAnswerRecord(payload);
    },
    {
      subscriberId: 'answer-processor',
      async: true,
      onError: (error, event) => {
        logger.error(
          {
            error,
            event,
          },
          'Failed to process answer record',
        );

        // 错误恢复逻辑
        // 例如：记录到死信队列、发送告警等
      },
    },
  );
}

/**
 * 示例 5: 启用 Redis 跨进程通信
 */
export function redisExample() {
  const redis = getRedisClient();
  const eventBus = getEventBus(decisionEventsService, redis, {
    enableRedis: true,
    redisChannelPrefix: 'learning:events:',
    enableSSE: true,
  });

  // 订阅事件（会收到本进程和其他进程发布的事件）
  eventBus.subscribe('WORD_MASTERED', (payload) => {
    logger.info(payload, 'Word mastered (from any process)');
  });

  // 发布事件（会广播到所有进程）
  eventBus.publish({
    type: 'WORD_MASTERED',
    payload: {
      userId: 'user-123',
      wordId: 'word-789',
      masteryLevel: 5,
      evaluationScore: 0.85,
      confidence: 0.92,
      timestamp: new Date(),
    },
  });
}

/**
 * 示例 6: 监控订阅状态
 */
export function monitoringExample() {
  const eventBus = getEventBus(decisionEventsService);

  // 添加一些订阅
  eventBus.subscribe('ANSWER_RECORDED', () => {});
  eventBus.subscribe('ANSWER_RECORDED', () => {});
  eventBus.subscribe('SESSION_STARTED', () => {});

  // 获取订阅统计
  const stats = eventBus.getSubscriptionStats();
  logger.info(stats, 'Subscription stats');
  // 输出: { ANSWER_RECORDED: 2, SESSION_STARTED: 1 }

  // 获取特定事件的订阅者数量
  const count = eventBus.getSubscriberCount('ANSWER_RECORDED');
  logger.info({ count }, 'ANSWER_RECORDED subscriber count');
  // 输出: { count: 2 }
}

/**
 * 示例 7: 优雅关闭
 */
export async function shutdownExample() {
  const eventBus = getEventBus(decisionEventsService);

  // 在应用关闭时调用
  process.on('SIGTERM', async () => {
    logger.info('Shutting down...');
    await eventBus.shutdown();
    logger.info('EventBus shut down complete');
    process.exit(0);
  });
}

// ==================== 辅助函数 ====================

async function processAnswerRecord(payload: AnswerRecordedPayload): Promise<void> {
  // 模拟异步处理
  logger.debug({ payload }, 'Processing answer record');

  // 实际处理逻辑
  // 例如：更新缓存、计算统计数据等
}

// ==================== 实际应用场景示例 ====================

/**
 * 学习系统集成示例
 *
 * 展示如何在实际的学习系统中使用事件总线
 */
export class LearningSystemIntegration {
  private eventBus = getEventBus(decisionEventsService);
  private unsubscribers: Array<() => void> = [];

  constructor() {
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // 1. 答题记录事件 -> 更新单词状态
    this.unsubscribers.push(
      this.eventBus.subscribe<AnswerRecordedPayload>('ANSWER_RECORDED', async (payload) => {
        logger.info({ userId: payload.userId, wordId: payload.wordId }, 'Updating word state');
        // 调用 WordStateService 更新状态
      }),
    );

    // 2. 单词掌握事件 -> 检查徽章成就
    this.unsubscribers.push(
      this.eventBus.subscribe<WordMasteredPayload>('WORD_MASTERED', async (payload) => {
        logger.info({ userId: payload.userId, wordId: payload.wordId }, 'Checking badges');
        // 调用 BadgeService 检查徽章
      }),
    );

    // 3. 遗忘风险事件 -> 发送复习提醒
    this.unsubscribers.push(
      this.eventBus.subscribe<ForgettingRiskPayload>('FORGETTING_RISK_HIGH', async (payload) => {
        logger.info({ userId: payload.userId, wordId: payload.wordId }, 'Sending review reminder');
        // 调用 NotificationService 发送提醒
      }),
    );

    // 4. 会话结束事件 -> 生成学习报告
    this.unsubscribers.push(
      this.eventBus.subscribe<SessionEndedPayload>('SESSION_ENDED', async (payload) => {
        logger.info({ userId: payload.userId, sessionId: payload.sessionId }, 'Generating report');
        // 调用 ReportService 生成报告
      }),
    );

    // 5. 策略调整事件 -> 记录决策日志
    this.unsubscribers.push(
      this.eventBus.subscribe<StrategyAdjustedPayload>('STRATEGY_ADJUSTED', async (payload) => {
        logger.info({ userId: payload.userId, reason: payload.reason }, 'Logging strategy change');
        // 调用 DecisionRecorder 记录决策
      }),
    );

    // 6. 奖励分配事件 -> 更新用户积分
    this.unsubscribers.push(
      this.eventBus.subscribe<RewardDistributedPayload>('REWARD_DISTRIBUTED', async (payload) => {
        logger.info(
          { userId: payload.userId, rewardValue: payload.rewardValue },
          'Updating points',
        );
        // 调用 RewardService 更新积分
      }),
    );
  }

  /**
   * 清理订阅
   */
  cleanup() {
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
    logger.info('LearningSystemIntegration cleaned up');
  }
}

// ==================== 导出示例函数 ====================

export default {
  basicExample,
  multipleEventsExample,
  onceExample,
  errorHandlingExample,
  redisExample,
  monitoringExample,
  shutdownExample,
  LearningSystemIntegration,
};
