/**
 * AMAS Evaluation Layer - Multi-scale Delayed Reward Aggregator
 * 多时间尺度延迟奖励聚合器
 *
 * 核心设计:
 * - 学习效果需要在多个时间尺度上评估
 * - 即时反馈（正确/错误）不能完全反映学习质量
 * - 长期记忆保持率才是真正的学习目标
 *
 * 时间尺度与权重:
 * | 尺度 | 延迟 | 权重 | 含义 |
 * |------|------|------|------|
 * | 即时 | 0s | 30% | 当下表现 |
 * | 1小时 | 1h | 20% | 短期记忆 |
 * | 6小时 | 6h | 15% | 工作记忆巩固 |
 * | 24小时 | 24h | 20% | 睡眠巩固效果 |
 * | 7天 | 7d | 15% | 长期记忆保持 |
 *
 * 工作流程:
 * 1. 学习事件发生时，创建奖励事件入队
 * 2. 定期调用aggregate()获取当前应发放的奖励
 * 3. 将奖励用于更新学习模型
 */

import { PersistableFeatureVector } from '../types';
import { amasLogger } from '../../logger';

// ==================== 类型定义 ====================

/**
 * 奖励时间表配置
 */
export interface RewardSchedule {
  /** 延迟时间（秒） */
  delaySec: number;
  /** 权重占比 (0~1) */
  weight: number;
  /** 标签（用于调试） */
  label: string;
}

/**
 * 延迟奖励事件
 */
export interface DelayedRewardEvent {
  /** 唯一标识 */
  id: string;
  /** 用户ID */
  userId: string;
  /** 原始奖励值 [-1, 1] */
  reward: number;
  /** 事件时间戳(ms) */
  timestamp: number;
  /** 各时间尺度已发放的奖励份额 */
  delivered: number[];
  /** 关联的特征向量（用于延迟更新模型） */
  featureVector?: PersistableFeatureVector;
  /** 关联的动作索引 */
  actionIndex?: number;
  /** 额外元数据 */
  meta?: Record<string, unknown>;
}

/**
 * 聚合结果
 */
export interface AggregatedResult {
  /** 本次聚合的总增量奖励 */
  totalIncrement: number;
  /** 分解明细 */
  breakdown: RewardBreakdown[];
  /** 队列中剩余事件数 */
  pendingCount: number;
}

/**
 * 单个事件的奖励分解
 */
export interface RewardBreakdown {
  /** 事件ID */
  eventId: string;
  /** 用户ID */
  userId: string;
  /** 本次增量 */
  increment: number;
  /** 剩余未发放奖励 */
  remaining: number;
  /** 进度百分比 [0,1] */
  progress: number;
  /** 特征向量（如果有） */
  featureVector?: PersistableFeatureVector;
  /** 动作索引（如果有） */
  actionIndex?: number;
}

/**
 * 持久化状态
 */
export interface DelayedRewardState {
  /** 版本号 */
  version: string;
  /** 待处理队列 */
  queue: DelayedRewardEvent[];
  /** ID序列号 */
  idSequence: number;
}

// ==================== 常量 ====================

/** 默认奖励时间表 */
const DEFAULT_SCHEDULE: RewardSchedule[] = [
  { delaySec: 0, weight: 0.30, label: 'immediate' },
  { delaySec: 3600, weight: 0.20, label: '1h' },      // 1小时
  { delaySec: 21600, weight: 0.15, label: '6h' },     // 6小时
  { delaySec: 86400, weight: 0.20, label: '24h' },    // 24小时
  { delaySec: 604800, weight: 0.15, label: '7d' }     // 7天
];

/** 队列最大容量（防止内存泄漏） */
const MAX_QUEUE_SIZE = 10000;

/** 事件最大保留时间（毫秒，8天） */
const MAX_EVENT_AGE_MS = 8 * 24 * 3600 * 1000;

// ==================== 实现 ====================

/**
 * 延迟奖励聚合器
 *
 * 适用场景:
 * - 需要考虑长期学习效果的奖励计算
 * - 间隔重复学习的反馈评估
 * - 多时间尺度的策略优化
 */
export class DelayedRewardAggregator {
  private static readonly VERSION = '1.0.0';

  /** 奖励时间表 */
  private readonly schedule: RewardSchedule[];

  /** 最大延迟时间（秒） */
  private readonly maxDelaySec: number;

  /** 待处理队列 */
  private queue: DelayedRewardEvent[] = [];

  /** ID序列号 */
  private idSequence = 0;

  constructor(schedule: RewardSchedule[] = DEFAULT_SCHEDULE) {
    // 验证并归一化权重
    const totalWeight = schedule.reduce((sum, s) => sum + s.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      // 权重和不为1时进行归一化处理，而非仅警告
      if (totalWeight > 0) {
        this.schedule = schedule.map(s => ({
          ...s,
          weight: s.weight / totalWeight
        }));
        amasLogger.info(
          { originalTotal: totalWeight },
          '[DelayedRewardAggregator] 权重和不为1，已自动归一化'
        );
      } else {
        // 所有权重为0时使用默认配置
        this.schedule = [...DEFAULT_SCHEDULE];
        amasLogger.warn('[DelayedRewardAggregator] 所有权重为0，使用默认配置');
      }
    } else {
      this.schedule = schedule;
    }

    this.maxDelaySec = Math.max(...this.schedule.map(s => s.delaySec));
  }

  // ==================== 核心API ====================

  /**
   * 添加奖励事件到队列
   *
   * @param userId 用户ID
   * @param reward 奖励值 [-1, 1]
   * @param timestamp 事件时间戳（默认当前时间）
   * @param options 可选配置
   * @returns 事件ID
   */
  addReward(
    userId: string,
    reward: number,
    timestamp = Date.now(),
    options?: {
      id?: string;
      featureVector?: PersistableFeatureVector;
      actionIndex?: number;
      meta?: Record<string, unknown>;
    }
  ): string {
    // 验证奖励值
    if (!Number.isFinite(reward)) {
      throw new Error('[DelayedRewardAggregator] 奖励值必须是有限数值');
    }

    // 生成唯一ID
    const eventId =
      options?.id ?? `reward-${userId}-${timestamp}-${this.idSequence++}`;

    // 创建事件
    const event: DelayedRewardEvent = {
      id: eventId,
      userId,
      reward: this.clamp(reward, -1, 1),
      timestamp,
      delivered: new Array(this.schedule.length).fill(0),
      featureVector: options?.featureVector,
      actionIndex: options?.actionIndex,
      meta: options?.meta
    };

    this.queue.push(event);

    // 队列容量保护：优先淘汰已大部分发放的事件，而非简单截断最旧的
    if (this.queue.length > MAX_QUEUE_SIZE) {
      this.pruneQueue();
    }

    return eventId;
  }

  /**
   * 智能修剪队列
   *
   * 策略:
   * 1. 优先移除已大部分发放的事件（>90%已发放）
   * 2. 其次移除过期事件
   * 3. 最后才移除最旧的事件
   *
   * 这样可以避免丢失未发放的长期奖励
   */
  private pruneQueue(): void {
    const now = Date.now();
    const targetSize = Math.floor(MAX_QUEUE_SIZE * 0.9); // 修剪到90%容量

    // 计算每个事件的发放进度
    const eventsWithProgress = this.queue.map(event => {
      const totalTarget = this.schedule.reduce(
        (sum, s) => sum + Math.abs(s.weight * event.reward),
        0
      );
      const totalDelivered = event.delivered.reduce(
        (sum, d) => sum + Math.abs(d),
        0
      );
      const progress = totalTarget > 0 ? totalDelivered / totalTarget : 1;
      const age = now - event.timestamp;
      const isExpired = age > MAX_EVENT_AGE_MS;

      return { event, progress, age, isExpired };
    });

    // 排序优先级：
    // 1. 已过期的排在前面（优先移除）
    // 2. 发放进度高的排在前面（优先移除）
    // 3. 同等进度时，年龄大的排在前面
    eventsWithProgress.sort((a, b) => {
      // 过期事件优先移除
      if (a.isExpired !== b.isExpired) {
        return a.isExpired ? -1 : 1;
      }
      // 发放进度高的优先移除
      if (Math.abs(a.progress - b.progress) > 0.1) {
        return b.progress - a.progress;
      }
      // 同等进度时，年龄大的优先移除
      return b.age - a.age;
    });

    // 保留后面的事件（发放进度低、未过期、较新的）
    const eventsToKeep = eventsWithProgress
      .slice(-(targetSize))
      .map(e => e.event);

    const removedCount = this.queue.length - eventsToKeep.length;
    const removedHighProgress = eventsWithProgress
      .slice(0, removedCount)
      .filter(e => e.progress > 0.9).length;

    amasLogger.info(
      {
        originalSize: this.queue.length,
        newSize: eventsToKeep.length,
        removedTotal: removedCount,
        removedHighProgress,
        maxSize: MAX_QUEUE_SIZE
      },
      '[DelayedRewardAggregator] 队列已修剪，优先移除高发放进度事件'
    );

    this.queue = eventsToKeep;
  }

  /**
   * 聚合当前应发放的奖励
   *
   * 遍历队列中所有事件，计算各时间尺度的进度，
   * 返回本次应发放的增量奖励
   *
   * @param now 当前时间戳（默认Date.now()）
   * @param userId 可选，只聚合特定用户
   * @returns 聚合结果
   */
  aggregate(now = Date.now(), userId?: string): AggregatedResult {
    let totalIncrement = 0;
    const breakdown: RewardBreakdown[] = [];
    const remaining: DelayedRewardEvent[] = [];

    for (const event of this.queue) {
      // 过滤特定用户
      if (userId && event.userId !== userId) {
        remaining.push(event);
        continue;
      }

      // 计算经过时间
      const elapsedSec = Math.max(0, (now - event.timestamp) / 1000);

      // 检查是否过期
      if (now - event.timestamp > MAX_EVENT_AGE_MS) {
        continue; // 丢弃过期事件
      }

      let incrementSum = 0;
      let totalDelivered = 0;
      let fullyDelivered = true;

      // 计算各时间尺度的增量
      for (let i = 0; i < this.schedule.length; i++) {
        const { delaySec, weight } = this.schedule[i];

        // 计算进度 (即时奖励进度为1)
        const progress =
          delaySec <= 0 ? 1 : this.clamp(elapsedSec / delaySec, 0, 1);

        // 目标发放量
        const targetDelivered = weight * event.reward * progress;

        // 本次增量
        const increment = targetDelivered - event.delivered[i];

        if (Math.abs(increment) > 1e-9) {
          incrementSum += increment;
          event.delivered[i] += increment;
        }

        totalDelivered += event.delivered[i];

        // 检查是否完全发放 - 考虑正负奖励
        const targetValue = weight * event.reward;
        if (event.reward >= 0) {
          if (event.delivered[i] < targetValue - 1e-9) {
            fullyDelivered = false;
          }
        } else {
          if (event.delivered[i] > targetValue + 1e-9) {
            fullyDelivered = false;
          }
        }
      }

      // 记录分解
      if (Math.abs(incrementSum) > 1e-9) {
        const remainingReward = event.reward - totalDelivered;
        // 修复负奖励进度计算：使用绝对值确保进度正确
        const progress = Math.abs(totalDelivered) / (Math.abs(event.reward) || 1);

        breakdown.push({
          eventId: event.id,
          userId: event.userId,
          increment: incrementSum,
          remaining: remainingReward,
          progress: this.clamp(progress, 0, 1),
          featureVector: event.featureVector,
          actionIndex: event.actionIndex
        });

        totalIncrement += incrementSum;
      }

      // 保留未完成的事件（使用 AND 逻辑：未完成 且 未超时）
      // 已完成的事件应该立即移除，不需要等待 maxDelaySec
      if (!fullyDelivered && elapsedSec < this.maxDelaySec) {
        remaining.push(event);
      }
    }

    this.queue = remaining;

    return {
      totalIncrement,
      breakdown,
      pendingCount: this.queue.length
    };
  }

  /**
   * 获取特定用户的待处理事件
   */
  getPendingEvents(userId: string): DelayedRewardEvent[] {
    return this.queue.filter(e => e.userId === userId);
  }

  /**
   * 获取队列中的待处理事件数
   */
  getPendingCount(userId?: string): number {
    if (userId) {
      return this.queue.filter(e => e.userId === userId).length;
    }
    return this.queue.length;
  }

  /**
   * 清空队列
   */
  clear(userId?: string): void {
    if (userId) {
      this.queue = this.queue.filter(e => e.userId !== userId);
    } else {
      this.queue = [];
    }
  }

  /**
   * 获取状态（用于持久化）
   */
  getState(): DelayedRewardState {
    return {
      version: DelayedRewardAggregator.VERSION,
      queue: this.queue.map(e => ({ ...e })),
      idSequence: this.idSequence
    };
  }

  /**
   * 恢复状态
   */
  setState(state: DelayedRewardState): void {
    if (!state) {
      amasLogger.warn('[DelayedRewardAggregator] 无效状态，跳过恢复');
      return;
    }

    // 版本检查
    if (state.version !== DelayedRewardAggregator.VERSION) {
      amasLogger.debug({ from: state.version, to: DelayedRewardAggregator.VERSION }, '[DelayedRewardAggregator] 版本迁移');
    }

    // 恢复队列（带验证）
    this.queue = (state.queue ?? [])
      .filter(e => e && typeof e === 'object')
      .map(e => ({
        id: e.id ?? `recovered-${this.idSequence++}`,
        userId: e.userId ?? 'unknown',
        reward: this.clamp(e.reward ?? 0, -1, 1),
        timestamp: e.timestamp ?? Date.now(),
        delivered: Array.isArray(e.delivered)
          ? e.delivered.slice(0, this.schedule.length)
          : new Array(this.schedule.length).fill(0),
        featureVector: e.featureVector,
        actionIndex: e.actionIndex,
        meta: e.meta
      }));

    this.idSequence = Math.max(0, state.idSequence ?? 0);
  }

  // ==================== 统计方法 ====================

  /**
   * 获取各时间尺度的累计发放量
   */
  getDeliveryStats(): {
    label: string;
    delaySec: number;
    weight: number;
    totalDelivered: number;
  }[] {
    const stats = this.schedule.map(s => ({
      label: s.label,
      delaySec: s.delaySec,
      weight: s.weight,
      totalDelivered: 0
    }));

    for (const event of this.queue) {
      for (let i = 0; i < this.schedule.length; i++) {
        stats[i].totalDelivered += event.delivered[i];
      }
    }

    return stats;
  }

  /**
   * 获取时间表配置
   */
  getSchedule(): RewardSchedule[] {
    return [...this.schedule];
  }

  // ==================== 私有方法 ====================

  /**
   * 数值截断
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}

// ==================== 便捷工具函数 ====================

/**
 * 计算简单的即时加权奖励（不使用队列）
 *
 * @param reward 原始奖励
 * @param schedule 时间表（默认使用默认配置）
 * @returns 即时权重部分的奖励
 */
export function computeImmediateReward(
  reward: number,
  schedule: RewardSchedule[] = DEFAULT_SCHEDULE
): number {
  const immediate = schedule.find(s => s.delaySec === 0);
  return reward * (immediate?.weight ?? 0.3);
}

/**
 * 获取默认时间表
 */
export function getDefaultSchedule(): RewardSchedule[] {
  return [...DEFAULT_SCHEDULE];
}

// ==================== 导出默认实例 ====================

export const defaultDelayedRewardAggregator = new DelayedRewardAggregator();
