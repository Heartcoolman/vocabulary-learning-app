/**
 * 学习事件生成器
 * 根据学习模式生成模拟答题事件
 */

import { faker } from '@faker-js/faker';
import type {
  LearningPattern,
  PatternType,
  TimeRange,
  FatiguingPattern,
  IntermittentPattern,
} from './learning-patterns';
import { getPattern } from './learning-patterns';

/**
 * 学习事件结构
 * 与 AMAS API 的 /api/amas/process 接口匹配
 */
export interface LearningEvent {
  /** 单词ID */
  wordId: string;
  /** 是否答对 */
  isCorrect: boolean;
  /** 响应时间 (ms) */
  responseTime: number;
  /** 停留时间 (ms) */
  dwellTime?: number;
  /** 暂停次数 */
  pauseCount?: number;
  /** 重试次数 */
  retryCount?: number;
  /** 事件时间戳 (ISO字符串) */
  timestamp?: string;
  /** 会话ID (用于AMAS会话复用) */
  sessionId?: string;
}

/**
 * 事件生成配置
 */
export interface GenerateEventsConfig {
  /** 单词ID列表 */
  wordIds: string[];
  /** 生成事件数量 */
  count: number;
  /** 学习模式类型或自定义模式 */
  pattern: PatternType | LearningPattern;
  /** 起始时间 (默认当前时间) */
  startTime?: Date;
  /** AMAS会话ID */
  sessionId?: string;
}

/**
 * 事件生成器类
 */
export class EventGenerator {
  private pattern: LearningPattern;
  private wordIds: string[];
  private sessionId?: string;

  constructor(config: {
    pattern: PatternType | LearningPattern;
    wordIds: string[];
    sessionId?: string;
  }) {
    this.pattern =
      typeof config.pattern === 'string'
        ? getPattern(config.pattern)
        : config.pattern;
    this.wordIds = config.wordIds;
    this.sessionId = config.sessionId;
  }

  /**
   * 生成指定数量的学习事件
   */
  generateEvents(count: number, startTime?: Date): LearningEvent[] {
    const events: LearningEvent[] = [];
    let currentTime = startTime || new Date();

    for (let i = 0; i < count; i++) {
      const event = this.generateSingleEvent(i, currentTime);
      events.push(event);

      // 更新时间戳，模拟答题间隔
      const interval = this.calculateInterval(i);
      currentTime = new Date(currentTime.getTime() + interval);
    }

    return events;
  }

  /**
   * 生成单个学习事件
   */
  generateSingleEvent(eventIndex: number, timestamp: Date): LearningEvent {
    const wordId = this.selectWord(eventIndex);
    const { isCorrect, responseTime, dwellTime } = this.generateMetrics(eventIndex);

    const event: LearningEvent = {
      wordId,
      isCorrect,
      responseTime: Math.round(responseTime),
      dwellTime: Math.round(dwellTime),
      timestamp: timestamp.toISOString(),
    };

    // 添加可选字段
    if (this.sessionId) {
      event.sessionId = this.sessionId;
    }

    // 对于疲劳模式，添加重试和暂停信息
    if (this.pattern.type === 'fatiguing' && eventIndex > 20) {
      if (!isCorrect) {
        event.retryCount = Math.floor(Math.random() * 3);
      }
      event.pauseCount = Math.floor(Math.random() * 2);
    }

    return event;
  }

  /**
   * 选择单词（循环使用单词列表）
   */
  private selectWord(eventIndex: number): string {
    return this.wordIds[eventIndex % this.wordIds.length];
  }

  /**
   * 根据模式生成答题指标
   */
  private generateMetrics(eventIndex: number): {
    isCorrect: boolean;
    responseTime: number;
    dwellTime: number;
  } {
    switch (this.pattern.type) {
      case 'efficient':
      case 'normal':
      case 'intermittent':
        return this.generateStaticMetrics();

      case 'fatiguing':
        return this.generateFatiguingMetrics(eventIndex);

      default:
        return this.generateStaticMetrics();
    }
  }

  /**
   * 生成静态模式的指标（正确率和响应时间固定范围）
   */
  private generateStaticMetrics(): {
    isCorrect: boolean;
    responseTime: number;
    dwellTime: number;
  } {
    const pattern = this.pattern as {
      correctRate: number;
      responseTime: TimeRange;
      dwellTime: TimeRange;
    };

    return {
      isCorrect: Math.random() < pattern.correctRate,
      responseTime: this.randomInRange(pattern.responseTime),
      dwellTime: this.randomInRange(pattern.dwellTime),
    };
  }

  /**
   * 生成疲劳模式的指标（随时间递减）
   */
  private generateFatiguingMetrics(eventIndex: number): {
    isCorrect: boolean;
    responseTime: number;
    dwellTime: number;
  } {
    const pattern = this.pattern as FatiguingPattern;

    // 计算当前正确率（线性递减）
    const progress = Math.min(eventIndex / pattern.sessionLength, 1);
    const currentCorrectRate =
      pattern.initialCorrectRate -
      (pattern.initialCorrectRate - pattern.finalCorrectRate) * progress;

    // 计算当前响应时间（指数增长）
    const growthFactor = Math.pow(pattern.responseTimeGrowth, eventIndex);
    const baseResponseTime = this.randomInRange(pattern.initialResponseTime);
    const responseTime = Math.min(baseResponseTime * growthFactor, 15000); // 最大15秒

    // 停留时间随疲劳增加
    const baseDwellTime = this.randomInRange(pattern.initialDwellTime);
    const dwellTime = baseDwellTime * (1 + progress * 0.5);

    return {
      isCorrect: Math.random() < currentCorrectRate,
      responseTime,
      dwellTime,
    };
  }

  /**
   * 计算答题间隔时间
   */
  private calculateInterval(eventIndex: number): number {
    // 基础间隔：响应时间 + 停留时间 + 随机间隔
    const baseInterval = 1000 + Math.random() * 2000;

    // 间歇模式：在指定间隔添加休息时间
    if (this.pattern.type === 'intermittent') {
      const pattern = this.pattern as IntermittentPattern;
      if ((eventIndex + 1) % pattern.breakInterval === 0) {
        return baseInterval + pattern.breakDuration;
      }
    }

    return baseInterval;
  }

  /**
   * 在指定范围内生成随机数
   */
  private randomInRange(range: TimeRange): number {
    return faker.number.int({ min: range.min, max: range.max });
  }
}

/**
 * 快捷函数：生成学习事件
 */
export function generateEvents(config: GenerateEventsConfig): LearningEvent[] {
  const generator = new EventGenerator({
    pattern: config.pattern,
    wordIds: config.wordIds,
    sessionId: config.sessionId,
  });

  return generator.generateEvents(config.count, config.startTime);
}

/**
 * 生成混合模式的事件序列
 * 用于模拟真实用户的学习状态变化
 */
export function generateMixedEvents(config: {
  wordIds: string[];
  phases: Array<{
    pattern: PatternType | LearningPattern;
    count: number;
  }>;
  sessionId?: string;
}): LearningEvent[] {
  const events: LearningEvent[] = [];
  let currentTime = new Date();

  for (const phase of config.phases) {
    const generator = new EventGenerator({
      pattern: phase.pattern,
      wordIds: config.wordIds,
      sessionId: config.sessionId,
    });

    const phaseEvents = generator.generateEvents(phase.count, currentTime);
    events.push(...phaseEvents);

    // 更新时间到最后一个事件之后
    if (phaseEvents.length > 0) {
      const lastTimestamp = phaseEvents[phaseEvents.length - 1].timestamp;
      if (lastTimestamp) {
        currentTime = new Date(new Date(lastTimestamp).getTime() + 2000);
      }
    }
  }

  return events;
}
