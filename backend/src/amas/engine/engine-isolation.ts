/**
 * AMAS Engine - 用户隔离模块
 *
 * 负责用户级别的模型隔离和并发控制
 */

import { AttentionMonitor } from '../modeling/attention-monitor';
import { FatigueEstimator } from '../modeling/fatigue-estimator';
import { CognitiveProfiler } from '../modeling/cognitive-profiler';
import { MotivationTracker } from '../modeling/motivation-tracker';
import { TrendAnalyzer } from '../modeling/trend-analyzer';
import { ACTRMemoryModel } from '../modeling/actr-memory';
import { LinUCB } from '../learning/linucb';
import { ColdStartManager } from '../learning/coldstart';
import { ThompsonSampling } from '../learning/thompson-sampling';
import { HeuristicLearner } from '../learning/heuristic';
import { EnsembleLearningFramework } from '../decision/ensemble';
import { UserParamsManager } from '../config/user-params';
import { getFeatureFlags } from '../config/feature-flags';
import {
  DecisionModel,
  UserModels,
  ColdStartStateData,
  MemoryManagementConfig as BaseMemoryConfig
} from './engine-types';

/**
 * 内部使用的完整内存管理配置（所有字段必填）
 */
interface MemoryManagementConfig {
  /** 最大用户数限制（默认 5000） */
  maxUsers: number;
  /** 用户模型 TTL（毫秒，默认 30 分钟） */
  modelTtlMs: number;
  /** 交互计数 TTL（毫秒，默认 1 小时） */
  interactionCountTtlMs: number;
  /** 清理间隔（毫秒，默认 5 分钟） */
  cleanupIntervalMs: number;
  /** LRU 淘汰阈值（当缓存达到此比例时触发 LRU 淘汰，默认 0.9） */
  lruEvictionThreshold: number;
}

/**
 * 默认内存管理配置
 */
const DEFAULT_MEMORY_CONFIG: MemoryManagementConfig = {
  maxUsers: 5000,
  modelTtlMs: 30 * 60 * 1000, // 30 分钟
  interactionCountTtlMs: 60 * 60 * 1000, // 1 小时
  cleanupIntervalMs: 5 * 60 * 1000, // 5 分钟
  lruEvictionThreshold: 0.9
};

/**
 * 带访问时间戳的用户模型包装
 */
interface UserModelEntry {
  models: UserModels;
  lastAccessedAt: number;
  createdAt: number;
}

/**
 * 带时间戳的交互计数条目
 */
interface InteractionCountEntry {
  count: number;
  lastUpdatedAt: number;
}

/**
 * 用户隔离管理器
 *
 * 负责：
 * - 用户专属模型实例管理
 * - 用户级锁（防止并发冲突）
 * - 模型克隆
 * - 内存管理（LRU 淘汰、TTL 过期清理）
 */
export class IsolationManager {
  // 用户隔离：每个用户拥有独立的模型实例（带 LRU 元数据）
  private userModels = new Map<string, UserModelEntry>();

  // 用户级锁：防止同一用户的并发请求冲突
  private userLocks = new Map<string, Promise<unknown>>();

  // 运行时状态（带时间戳）
  private interactionCounts = new Map<string, InteractionCountEntry>();

  // 模型模板：用于克隆新用户模型
  private modelTemplates: UserModels;

  // 内存管理配置
  private memoryConfig: MemoryManagementConfig;

  // 定期清理定时器
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // 是否已销毁
  private isDestroyed = false;

  constructor(templates: UserModels, config?: BaseMemoryConfig) {
    this.modelTemplates = templates;
    this.memoryConfig = { ...DEFAULT_MEMORY_CONFIG, ...config };

    // 启动定期清理任务
    this.startCleanupTimer();
  }

  /**
   * 销毁管理器，清理资源
   */
  destroy(): void {
    this.isDestroyed = true;
    this.stopCleanupTimer();
    this.userModels.clear();
    this.userLocks.clear();
    this.interactionCounts.clear();
  }

  /**
   * 启动定期清理定时器
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.memoryConfig.cleanupIntervalMs);

    // 确保定时器不会阻止进程退出
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * 停止定期清理定时器
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 执行清理任务
   * - 清理过期的用户模型（TTL）
   * - 清理过期的交互计数（TTL）
   * - 执行 LRU 淘汰（如果超过阈值）
   */
  performCleanup(): void {
    if (this.isDestroyed) return;

    const now = Date.now();

    // 1. 清理过期的用户模型
    this.cleanupExpiredModels(now);

    // 2. 清理过期的交互计数
    this.cleanupExpiredInteractionCounts(now);

    // 3. 执行 LRU 淘汰（如果需要）
    this.performLruEviction();
  }

  /**
   * 清理过期的用户模型
   */
  private cleanupExpiredModels(now: number): void {
    const expiredUsers: string[] = [];

    for (const [userId, entry] of this.userModels) {
      if (now - entry.lastAccessedAt > this.memoryConfig.modelTtlMs) {
        expiredUsers.push(userId);
      }
    }

    for (const userId of expiredUsers) {
      this.userModels.delete(userId);
    }
  }

  /**
   * 清理过期的交互计数
   */
  private cleanupExpiredInteractionCounts(now: number): void {
    const expiredUsers: string[] = [];

    for (const [userId, entry] of this.interactionCounts) {
      if (now - entry.lastUpdatedAt > this.memoryConfig.interactionCountTtlMs) {
        expiredUsers.push(userId);
      }
    }

    for (const userId of expiredUsers) {
      this.interactionCounts.delete(userId);
    }
  }

  /**
   * 执行 LRU 淘汰
   * 当缓存达到阈值时，淘汰最久未访问的用户
   */
  private performLruEviction(): void {
    const threshold = Math.floor(this.memoryConfig.maxUsers * this.memoryConfig.lruEvictionThreshold);

    if (this.userModels.size <= threshold) {
      return;
    }

    // 按最后访问时间排序
    const entries = Array.from(this.userModels.entries())
      .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

    // 淘汰最久未访问的用户，直到达到阈值的 80%
    const targetSize = Math.floor(threshold * 0.8);
    const toEvict = entries.slice(0, this.userModels.size - targetSize);

    for (const [userId] of toEvict) {
      this.userModels.delete(userId);
      // 同时清理相关的交互计数
      this.interactionCounts.delete(userId);
    }
  }

  /**
   * 获取内存使用统计
   */
  getMemoryStats(): {
    userModelsCount: number;
    userLocksCount: number;
    interactionCountsCount: number;
    maxUsers: number;
    utilizationPercent: number;
  } {
    return {
      userModelsCount: this.userModels.size,
      userLocksCount: this.userLocks.size,
      interactionCountsCount: this.interactionCounts.size,
      maxUsers: this.memoryConfig.maxUsers,
      utilizationPercent: (this.userModels.size / this.memoryConfig.maxUsers) * 100
    };
  }

  /**
   * 获取用户专属模型实例
   *
   * 每个用户拥有独立的建模层实例，避免跨用户状态污染
   * 带 LRU 访问时间更新
   */
  getUserModels(userId: string, coldStartState?: ColdStartStateData): UserModels {
    const now = Date.now();
    let entry = this.userModels.get(userId);

    if (entry) {
      // 更新最后访问时间（LRU）
      entry.lastAccessedAt = now;

      // 如果提供了冷启动状态，且当前模型的冷启动管理器存在，更新其状态
      if (coldStartState && entry.models.coldStart) {
        entry.models.coldStart.setState({
          phase: coldStartState.phase,
          userType: coldStartState.userType,
          probeIndex: coldStartState.probeIndex,
          results: [],  // 探测结果不需要持久化
          settledStrategy: coldStartState.settledStrategy,
          updateCount: coldStartState.updateCount
        });
      }

      return entry.models;
    }

    // 检查是否需要先执行 LRU 淘汰
    if (this.userModels.size >= this.memoryConfig.maxUsers) {
      this.performLruEviction();
    }

    const flags = getFeatureFlags();

    // 根据功能开关选择算法
    let bandit: DecisionModel;
    if (flags.enableEnsemble) {
      bandit = this.cloneEnsemble();
    } else {
      // 默认使用 LinUCB
      bandit = this.cloneLinUCB();
    }

    // 为新用户创建独立的模型实例
    const models: UserModels = {
      // 核心建模层
      attention: this.cloneAttentionMonitor(),
      fatigue: this.cloneFatigueEstimator(),
      cognitive: this.cloneCognitiveProfiler(),
      motivation: this.cloneMotivationTracker(),
      bandit,

      // 扩展模块 (根据功能开关创建)
      trendAnalyzer: flags.enableTrendAnalyzer
        ? this.cloneTrendAnalyzer()
        : null,
      coldStart: flags.enableColdStartManager
        ? this.cloneColdStartManager(coldStartState)
        : null,
      thompson: flags.enableThompsonSampling
        ? this.cloneThompsonSampling()
        : null,
      heuristic: flags.enableHeuristicBaseline
        ? this.cloneHeuristicLearner()
        : null,
      actrMemory: flags.enableACTRMemory
        ? this.cloneACTRMemoryModel()
        : null,
      userParams: flags.enableUserParamsManager
        ? this.cloneUserParamsManager()
        : null
    };

    this.userModels.set(userId, {
      models,
      lastAccessedAt: now,
      createdAt: now
    });

    return models;
  }

  /**
   * 删除用户模型实例
   */
  deleteUserModels(userId: string): void {
    this.userModels.delete(userId);
  }

  /**
   * 用户级锁机制
   *
   * 防止同一用户的并发请求导致 Lost Update
   * 注意：前一个请求的异常会被吞掉，不会传播给后续请求
   *
   * Bug修复：使用单一定时器管理超时，避免重复释放锁和状态不一致
   */
  async withUserLock<T>(userId: string, fn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> {
    const previousLock = this.userLocks.get(userId) ?? Promise.resolve();

    let releaseLock: () => void;
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const chainedLock = previousLock.catch(() => {}).then(() => currentLock);
    this.userLocks.set(userId, chainedLock);

    // 使用单一定时器管理超时，避免重复释放锁
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isReleased = false;

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (!isReleased) {
        isReleased = true;
        releaseLock!();
        if (this.userLocks.get(userId) === chainedLock) {
          this.userLocks.delete(userId);
        }
      }
    };

    // 创建超时Promise（使用共享的timeoutId）
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`用户锁超时 (${userId}): 操作超过 ${timeoutMs}ms`));
      }, timeoutMs);
    });

    // 等待前一个锁释放（带超时）
    try {
      await Promise.race([previousLock.catch(() => {}), timeoutPromise]);
    } catch (error) {
      cleanup();
      throw error;
    }

    try {
      return await Promise.race([fn(), timeoutPromise]);
    } finally {
      cleanup();
    }
  }

  /**
   * 获取交互计数
   */
  getInteractionCount(userId: string, provided?: number): number {
    if (provided !== undefined) return provided;
    const entry = this.interactionCounts.get(userId);
    return entry?.count ?? 0;
  }

  /**
   * 增加交互计数
   */
  incrementInteractionCount(userId: string): void {
    const now = Date.now();
    const entry = this.interactionCounts.get(userId);
    if (entry) {
      entry.count++;
      entry.lastUpdatedAt = now;
    } else {
      this.interactionCounts.set(userId, {
        count: 1,
        lastUpdatedAt: now
      });
    }
  }

  /**
   * 重置用户交互计数
   */
  resetInteractionCount(userId: string): void {
    this.interactionCounts.delete(userId);
  }

  // ==================== 模型克隆方法 ====================

  /**
   * 克隆注意力监测器
   */
  private cloneAttentionMonitor(): AttentionMonitor {
    const template = this.modelTemplates.attention;
    const state = template.getState();
    const clone = new AttentionMonitor(
      undefined, // 使用默认权重
      state.beta,
      state.prevAttention // prevAttention 是 number 类型
    );
    return clone;
  }

  /**
   * 克隆疲劳估计器
   */
  private cloneFatigueEstimator(): FatigueEstimator {
    const template = this.modelTemplates.fatigue;
    const state = template.getState();
    const clone = new FatigueEstimator(undefined, state.F);
    clone.setState(state);
    return clone;
  }

  /**
   * 克隆认知分析器
   */
  private cloneCognitiveProfiler(): CognitiveProfiler {
    const template = this.modelTemplates.cognitive;
    const state = template.getState();
    const clone = new CognitiveProfiler();
    clone.setState(state);
    return clone;
  }

  /**
   * 克隆动机追踪器
   */
  private cloneMotivationTracker(): MotivationTracker {
    const template = this.modelTemplates.motivation;
    const state = template.getState();
    const clone = new MotivationTracker(undefined, state.M);
    clone.setState(state);
    return clone;
  }

  /**
   * 克隆 LinUCB 模型
   */
  private cloneLinUCB(): LinUCB {
    const template = this.modelTemplates.bandit;
    if (template instanceof LinUCB) {
      const model = template.getModel();
      return new LinUCB({
        alpha: model.alpha,
        lambda: model.lambda,
        dimension: model.d
      });
    }
    // 如果模板是 Ensemble，创建新的 LinUCB
    return new LinUCB();
  }

  /**
   * 克隆 EnsembleLearningFramework
   */
  private cloneEnsemble(): EnsembleLearningFramework {
    // 新用户使用默认初始化，不复制学习历史
    return new EnsembleLearningFramework();
  }

  /**
   * 克隆 TrendAnalyzer
   */
  private cloneTrendAnalyzer(): TrendAnalyzer {
    return new TrendAnalyzer();
  }

  /**
   * 克隆 ColdStartManager
   *
   * Bug修复：当phase是'classify'且probeIndex>0但results为空时，
   * 存在分类不准确的风险。修复方案：
   * 1. 如果已有settledStrategy和userType，直接跳到explore/normal阶段
   * 2. 如果phase是classify但没有results，重置probeIndex以重新开始探测
   */
  private cloneColdStartManager(savedState?: ColdStartStateData): ColdStartManager {
    const manager = new ColdStartManager();
    if (savedState) {
      // Bug修复：处理classify阶段但results为空的不一致状态
      let phase = savedState.phase;
      let probeIndex = savedState.probeIndex;

      if (phase === 'classify' && probeIndex > 0) {
        // 如果已经有收敛策略和用户类型，说明分类实际已完成
        if (savedState.settledStrategy && savedState.userType) {
          // 跳到explore阶段，避免重复分类
          phase = 'explore';
        } else {
          // 没有收敛策略，需要重新开始分类探测
          // 因为没有results无法准确恢复分类状态
          probeIndex = 0;
        }
      }

      manager.setState({
        phase,
        userType: savedState.userType,
        probeIndex,
        results: [],  // 探测结果不需要持久化
        settledStrategy: savedState.settledStrategy,
        updateCount: savedState.updateCount
      });
    }
    return manager;
  }

  /**
   * 克隆 ThompsonSampling
   */
  private cloneThompsonSampling(): ThompsonSampling {
    return new ThompsonSampling();
  }

  /**
   * 克隆 HeuristicLearner
   */
  private cloneHeuristicLearner(): HeuristicLearner {
    return new HeuristicLearner();
  }

  /**
   * 克隆 ACTRMemoryModel
   */
  private cloneACTRMemoryModel(): ACTRMemoryModel {
    return new ACTRMemoryModel();
  }

  /**
   * 克隆 UserParamsManager
   */
  private cloneUserParamsManager(): UserParamsManager {
    return new UserParamsManager();
  }
}
