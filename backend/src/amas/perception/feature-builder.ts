/**
 * AMAS Perception Layer - Feature Builder
 * 感知层 - 特征构建器
 */

import {
  FeatureVector,
  NormalizationStat,
  PerceptionConfig,
  RawEvent
} from '../types';
import { DEFAULT_PERCEPTION_CONFIG } from '../config/action-space';
import { amasLogger } from '../../logger';

// ==================== 工具函数 ====================

/**
 * 数值截断
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 安全的Z-score标准化
 */
function safeZScore(value: number, stat: NormalizationStat): number {
  const std = stat.std > 1e-6 ? stat.std : 1e-6;
  return (value - stat.mean) / std;
}

/**
 * Sigmoid函数
 */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// ==================== 特征构建器 ====================

/**
 * 用户窗口状态
 */
interface UserWindowState {
  rtWindow: number[];
  paceWindow: number[];
  lastAccessTime: number; // 最后访问时间戳
}

/**
 * 特征构建器
 * 负责将原始事件转换为标准化特征向量
 *
 * 修复问题#14: 移除全局currentUserId，改为参数传递userId，避免竞态条件
 *
 * 注意: 按用户维护独立的窗口统计，避免跨用户污染
 */
/**
 * 内存清理配置
 */
interface MemoryCleanupConfig {
  maxUsers: number;           // 最大用户数
  ttlMs: number;              // 用户窗口过期时间（毫秒）
  cleanupIntervalMs: number;  // 清理间隔（毫秒）
}

const DEFAULT_CLEANUP_CONFIG: MemoryCleanupConfig = {
  maxUsers: 10000,              // 最多保留10000个用户的窗口
  ttlMs: 30 * 60 * 1000,        // 30分钟无访问则过期
  cleanupIntervalMs: 5 * 60 * 1000  // 每5分钟清理一次
};

export class FeatureBuilder {
  private readonly config: PerceptionConfig;
  protected readonly windowSize: number;
  private readonly cleanupConfig: MemoryCleanupConfig;

  // 按用户维护窗口统计器 (避免跨用户 CV 污染)
  private userWindows: Map<string, UserWindowState> = new Map();

  // 清理定时器
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    config: PerceptionConfig = DEFAULT_PERCEPTION_CONFIG,
    windowSize: number = 10,
    cleanupConfig: MemoryCleanupConfig = DEFAULT_CLEANUP_CONFIG
  ) {
    this.config = config;
    this.windowSize = windowSize;
    this.cleanupConfig = cleanupConfig;

    // 启动定期清理
    this.startCleanupTimer();
  }

  /**
   * 启动定期清理定时器
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredWindows();
    }, this.cleanupConfig.cleanupIntervalMs);

    // 防止定时器阻止进程退出
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * 停止清理定时器
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 清理过期的用户窗口
   * 修复问题#8: 防止内存无限增长
   */
  private cleanupExpiredWindows(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    // 找出过期的用户
    for (const [userId, state] of this.userWindows) {
      if (now - state.lastAccessTime > this.cleanupConfig.ttlMs) {
        expiredKeys.push(userId);
      }
    }

    // 删除过期用户
    for (const key of expiredKeys) {
      this.userWindows.delete(key);
    }

    // 如果仍然超过最大用户数，按LRU策略淘汰
    if (this.userWindows.size > this.cleanupConfig.maxUsers) {
      const entries = Array.from(this.userWindows.entries());
      entries.sort((a, b) => a[1].lastAccessTime - b[1].lastAccessTime);

      const toRemove = entries.slice(0, entries.length - this.cleanupConfig.maxUsers);
      for (const [key] of toRemove) {
        this.userWindows.delete(key);
      }
    }

    if (expiredKeys.length > 0) {
      amasLogger.debug({ expiredCount: expiredKeys.length, currentCount: this.userWindows.size }, '[FeatureBuilder] 清理过期用户窗口');
    }
  }

  /**
   * 获取当前用户窗口数量（用于监控）
   */
  getUserWindowCount(): number {
    return this.userWindows.size;
  }

  /**
   * 获取用户窗口状态
   *
   * 修复问题#14: userId为必选参数，避免使用全局状态
   * 修复问题#8: 更新lastAccessTime用于过期清理
   *
   * @param userId 用户ID（必选）
   */
  private getUserWindows(userId: string): UserWindowState {
    const now = Date.now();
    let state = this.userWindows.get(userId);
    if (!state) {
      state = { rtWindow: [], paceWindow: [], lastAccessTime: now };
      this.userWindows.set(userId, state);
    } else {
      // 更新最后访问时间
      state.lastAccessTime = now;
    }
    return state;
  }

  /**
   * 计算窗口变异系数 (CV = std / mean)
   */
  private computeWindowCV(window: number[]): number {
    if (window.length < 2) return 0;
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    if (Math.abs(mean) < 1e-6) return 0;
    const variance = window.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / window.length;
    return Math.sqrt(variance) / Math.abs(mean);
  }

  /**
   * 更新滑动窗口
   */
  private updateWindow(window: number[], value: number): void {
    window.push(value);
    if (window.length > this.windowSize) {
      window.shift();
    }
  }

  /**
   * 重置指定用户的窗口统计
   *
   * @param userId 用户ID（必选）
   */
  resetWindows(userId: string): void {
    this.userWindows.delete(userId);
  }

  /**
   * 清空所有用户的窗口统计
   */
  resetAllWindows(): void {
    this.userWindows.clear();
  }

  /**
   * 数据清洗和边界处理
   */
  sanitize(event: RawEvent): RawEvent {
    return {
      ...event,
      responseTime: clamp(event.responseTime, 1, this.config.maxResponseTime),
      dwellTime: clamp(event.dwellTime, 0, this.config.maxResponseTime),
      pauseCount: clamp(event.pauseCount, 0, this.config.maxPauseCount),
      switchCount: clamp(event.switchCount, 0, this.config.maxSwitchCount),
      focusLossDuration: clamp(event.focusLossDuration, 0, this.config.maxFocusLoss),
      interactionDensity: Math.max(0, event.interactionDensity),
      retryCount: Math.max(0, event.retryCount)
    };
  }

  /**
   * 异常检测
   */
  isAnomalous(event: RawEvent): boolean {
    // 检查数值有效性
    if (!Number.isFinite(event.responseTime) || event.responseTime <= 0) {
      return true;
    }
    if (!Number.isFinite(event.dwellTime) || event.dwellTime < 0) {
      return true;
    }
    if (!Number.isFinite(event.timestamp)) {
      return true;
    }

    // 检查极端值
    if (event.responseTime > this.config.maxResponseTime) {
      return true;
    }
    if (event.focusLossDuration > this.config.maxFocusLoss) {
      return true;
    }
    if (event.pauseCount > this.config.maxPauseCount) {
      return true;
    }
    if (event.switchCount > this.config.maxSwitchCount) {
      return true;
    }

    return false;
  }

  /**
   * 构建特征向量
   *
   * 修复问题#14: userId作为必选参数传入，避免全局状态竞态
   *
   * 输出维度: 10 (MVP版本)
   *
   * @param raw 原始事件
   * @param userId 用户ID（必选）
   */
  buildFeatureVector(raw: RawEvent, userId: string): FeatureVector {
    const event = this.sanitize(raw);

    // 获取指定用户的窗口状态
    const windows = this.getUserWindows(userId);

    // 更新滑动窗口
    this.updateWindow(windows.rtWindow, event.responseTime);
    this.updateWindow(windows.paceWindow, event.dwellTime);

    // 标准化特征
    const z_rt_mean = safeZScore(event.responseTime, this.config.rt);
    const z_rt_cv = this.computeWindowCV(windows.rtWindow); // 使用用户专属窗口CV
    const z_pace_cv = this.computeWindowCV(windows.paceWindow); // 使用用户专属窗口CV
    const z_pause = safeZScore(event.pauseCount, this.config.pause);
    const z_switch = safeZScore(event.switchCount, this.config.switches);
    const z_drift = safeZScore(event.dwellTime, this.config.dwell);
    const z_interaction = safeZScore(event.interactionDensity, this.config.interactionDensity);
    const z_focus_loss = safeZScore(event.focusLossDuration, this.config.focusLoss);

    // 归一化特征
    const retry_norm = clamp(event.retryCount / 3, 0, 1);
    const correctness = event.isCorrect ? 1 : -1;

    // 构建Float32Array (性能优化)
    const values = new Float32Array([
      z_rt_mean,
      z_rt_cv,
      z_pace_cv,
      z_pause,
      z_switch,
      z_drift,
      z_interaction,
      z_focus_loss,
      retry_norm,
      correctness
    ]);

    const labels = [
      'z_rt_mean',
      'z_rt_cv',
      'z_pace_cv',
      'z_pause',
      'z_switch',
      'z_drift',
      'z_interaction',
      'z_focus_loss',
      'retry_norm',
      'correctness'
    ];

    return {
      values,
      ts: event.timestamp,
      labels
    };
  }

  /**
   * 构建注意力特征子集
   *
   * 修复问题#14: userId作为必选参数传入
   *
   * 用于注意力模型计算
   * 注意: 此方法不更新窗口，应在 buildFeatureVector 之后调用
   *
   * @param raw 原始事件
   * @param userId 用户ID（必选）
   */
  buildAttentionFeatures(raw: RawEvent, userId: string): Float32Array {
    const event = this.sanitize(raw);

    // 获取指定用户的窗口状态
    const windows = this.getUserWindows(userId);

    // 使用当前窗口的CV值 (不更新窗口，避免重复计算)
    const z_rt_cv = this.computeWindowCV(windows.rtWindow);
    const z_pace_cv = this.computeWindowCV(windows.paceWindow);

    return new Float32Array([
      safeZScore(event.responseTime, this.config.rt),
      z_rt_cv,
      z_pace_cv,
      safeZScore(event.pauseCount, this.config.pause),
      safeZScore(event.switchCount, this.config.switches),
      safeZScore(event.dwellTime, this.config.dwell),
      safeZScore(event.interactionDensity, this.config.interactionDensity),
      safeZScore(event.focusLossDuration, this.config.focusLoss)
    ]);
  }

  /**
   * 获取特征维度
   */
  getFeatureDimension(): number {
    return 10;
  }

  /**
   * 获取特征标签
   */
  getFeatureLabels(): string[] {
    return [
      'z_rt_mean',
      'z_rt_cv',
      'z_pace_cv',
      'z_pause',
      'z_switch',
      'z_drift',
      'z_interaction',
      'z_focus_loss',
      'retry_norm',
      'correctness'
    ];
  }
}

// ==================== 窗口统计器 ====================

/**
 * 滑动窗口统计器
 * 用于计算窗口级特征(如CV, trend等)
 */
export class WindowStatistics {
  private readonly maxSize: number;
  private readonly values: number[] = [];

  constructor(maxSize: number = 10) {
    this.maxSize = maxSize;
  }

  /**
   * 添加新值
   */
  push(value: number): void {
    this.values.push(value);
    if (this.values.length > this.maxSize) {
      this.values.shift();
    }
  }

  /**
   * 获取均值
   */
  mean(): number {
    if (this.values.length === 0) return 0;
    return this.values.reduce((a, b) => a + b, 0) / this.values.length;
  }

  /**
   * 获取标准差
   */
  std(): number {
    if (this.values.length < 2) return 0;
    const m = this.mean();
    const variance = this.values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / this.values.length;
    return Math.sqrt(variance);
  }

  /**
   * 获取变异系数 (CV)
   */
  cv(): number {
    const m = this.mean();
    if (Math.abs(m) < 1e-6) return 0;
    return this.std() / Math.abs(m);
  }

  /**
   * 获取当前窗口大小
   */
  size(): number {
    return this.values.length;
  }

  /**
   * 清空窗口
   */
  clear(): void {
    this.values.length = 0;
  }

  /**
   * 获取最近k个值
   */
  lastK(k: number): number[] {
    return this.values.slice(-k);
  }
}

// ==================== 增强特征构建器 ====================

/**
 * 增强用户窗口状态
 */
interface EnhancedUserWindowState {
  rtWindow: WindowStatistics;
  paceWindow: WindowStatistics;
  baseline: number;
  lastAccessTime: number; // 最后访问时间戳
}

/**
 * 增强特征构建器
 *
 * 修复问题#7: 继承父类的用户隔离机制，每个用户拥有独立的窗口统计
 * 修复问题#8: 添加内存过期清理机制
 *
 * 支持窗口级统计特征
 */
export class EnhancedFeatureBuilder extends FeatureBuilder {
  private defaultBaselineRT: number = 3200;

  // 修复#7: 按用户维护增强窗口统计
  private enhancedUserWindows: Map<string, EnhancedUserWindowState> = new Map();

  // 增强窗口的清理配置
  private readonly enhancedTtlMs: number = 30 * 60 * 1000; // 30分钟过期
  private readonly enhancedMaxUsers: number = 10000;
  private enhancedCleanupTimer: NodeJS.Timeout | null = null;

  constructor(config?: PerceptionConfig, windowSize: number = 10) {
    super(config, windowSize);
    this.startEnhancedCleanupTimer();
  }

  /**
   * 启动增强窗口清理定时器
   */
  private startEnhancedCleanupTimer(): void {
    if (this.enhancedCleanupTimer) {
      return;
    }

    this.enhancedCleanupTimer = setInterval(() => {
      this.cleanupExpiredEnhancedWindows();
    }, 5 * 60 * 1000); // 每5分钟清理一次

    if (this.enhancedCleanupTimer.unref) {
      this.enhancedCleanupTimer.unref();
    }
  }

  /**
   * 停止增强窗口清理定时器
   */
  stopEnhancedCleanupTimer(): void {
    if (this.enhancedCleanupTimer) {
      clearInterval(this.enhancedCleanupTimer);
      this.enhancedCleanupTimer = null;
    }
    // 同时停止父类的清理定时器
    this.stopCleanupTimer();
  }

  /**
   * 清理过期的增强用户窗口
   */
  private cleanupExpiredEnhancedWindows(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [userId, state] of this.enhancedUserWindows) {
      if (now - state.lastAccessTime > this.enhancedTtlMs) {
        expiredKeys.push(userId);
      }
    }

    for (const key of expiredKeys) {
      this.enhancedUserWindows.delete(key);
    }

    // LRU淘汰
    if (this.enhancedUserWindows.size > this.enhancedMaxUsers) {
      const entries = Array.from(this.enhancedUserWindows.entries());
      entries.sort((a, b) => a[1].lastAccessTime - b[1].lastAccessTime);
      const toRemove = entries.slice(0, entries.length - this.enhancedMaxUsers);
      for (const [key] of toRemove) {
        this.enhancedUserWindows.delete(key);
      }
    }
  }

  /**
   * 获取增强窗口用户数量（用于监控）
   */
  getEnhancedUserWindowCount(): number {
    return this.enhancedUserWindows.size;
  }

  /**
   * 获取用户的增强窗口状态
   *
   * 修复问题#8: 更新lastAccessTime用于过期清理
   *
   * @param userId 用户ID（必选）
   */
  private getEnhancedWindows(userId: string): EnhancedUserWindowState {
    const now = Date.now();
    let state = this.enhancedUserWindows.get(userId);
    if (!state) {
      state = {
        rtWindow: new WindowStatistics(this.windowSize),
        paceWindow: new WindowStatistics(this.windowSize),
        baseline: this.defaultBaselineRT,
        lastAccessTime: now
      };
      this.enhancedUserWindows.set(userId, state);
    } else {
      state.lastAccessTime = now;
    }
    return state;
  }

  /**
   * 更新窗口并构建增强特征向量
   *
   * 修复问题#7: userId作为必选参数传入，使用用户专属窗口
   *
   * @param raw 原始事件
   * @param userId 用户ID（必选）
   */
  buildEnhancedFeatureVector(raw: RawEvent, userId: string): FeatureVector {
    const event = this.sanitize(raw);

    // 获取用户专属窗口
    const windows = this.getEnhancedWindows(userId);

    // 更新窗口
    windows.rtWindow.push(event.responseTime);
    windows.paceWindow.push(event.dwellTime);

    // 计算窗口级特征
    const z_rt_cv = windows.rtWindow.cv();
    const z_pace_cv = windows.paceWindow.cv();
    const z_drift = (windows.rtWindow.mean() - windows.baseline) / windows.baseline;

    // 构建特征向量
    const values = new Float32Array([
      safeZScore(event.responseTime, { mean: 3200, std: 800 }),
      z_rt_cv,
      z_pace_cv,
      safeZScore(event.pauseCount, { mean: 0.3, std: 0.6 }),
      safeZScore(event.switchCount, { mean: 0.2, std: 0.5 }),
      z_drift,
      safeZScore(event.interactionDensity, { mean: 2.0, std: 1.2 }),
      safeZScore(event.focusLossDuration, { mean: 3000, std: 2500 }),
      clamp(event.retryCount / 3, 0, 1),
      event.isCorrect ? 1 : -1
    ]);

    return {
      values,
      ts: event.timestamp,
      labels: this.getFeatureLabels()
    };
  }

  /**
   * 设置基线反应时间
   *
   * @param baseline 基线反应时间
   * @param userId 可选的用户ID，如果提供则只设置该用户的基线
   */
  setBaselineRT(baseline: number, userId?: string): void {
    this.defaultBaselineRT = baseline;

    if (userId) {
      const windows = this.getEnhancedWindows(userId);
      windows.baseline = baseline;
      return;
    }

    // 更新所有用户的基线
    this.enhancedUserWindows.forEach((state) => {
      state.baseline = baseline;
    });
  }

  /**
   * 重置窗口
   *
   * @param userId 可选的用户ID，如果提供则只重置该用户的窗口
   */
  reset(userId?: string): void {
    if (userId) {
      const state = this.enhancedUserWindows.get(userId);
      if (state) {
        state.rtWindow.clear();
        state.paceWindow.clear();
      }
      return;
    }

    // 清空所有用户的窗口
    this.enhancedUserWindows.clear();
  }
}

// ==================== 特征缓存 ====================

/**
 * 静态特征缓存项
 */
interface StaticFeatureCacheItem {
  /** 用户基础属性特征 */
  features: Float32Array;
  /** 缓存创建时间 */
  createdAt: number;
  /** 用户认知能力快照 */
  cognitiveProfileHash: string;
}

/**
 * 特征缓存管理器
 *
 * 设计原理：
 * - 静态特征（用户基础属性）变化频率低，按会话缓存
 * - 动态特征（会话状态）需要增量计算
 * - 缓存命中可减少70%的特征计算开销
 */
export class FeatureCacheManager {
  /** 静态特征缓存 */
  private staticCache: Map<string, StaticFeatureCacheItem> = new Map();

  /** 缓存配置 */
  private readonly config = {
    /** 静态特征缓存生存时间（毫秒），默认10分钟 */
    staticTtlMs: 10 * 60 * 1000,
    /** 最大缓存用户数 */
    maxUsers: 5000,
    /** 清理间隔（毫秒） */
    cleanupIntervalMs: 5 * 60 * 1000
  };

  /** 缓存统计 */
  private stats = {
    hits: 0,
    misses: 0,
    invalidations: 0
  };

  /** 清理定时器 */
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * 启动清理定时器
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * 停止清理定时器
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 生成认知能力配置的哈希（用于检测变化）
   */
  private hashCognitiveProfile(profile?: { mem?: number; speed?: number; stability?: number }): string {
    if (!profile) return 'default';
    return `${(profile.mem ?? 0.5).toFixed(2)}-${(profile.speed ?? 0.5).toFixed(2)}-${(profile.stability ?? 0.5).toFixed(2)}`;
  }

  /**
   * 获取静态特征缓存
   */
  getStaticFeatures(userId: string, cognitiveProfile?: { mem?: number; speed?: number; stability?: number }): Float32Array | null {
    const item = this.staticCache.get(userId);
    const now = Date.now();

    if (!item) {
      this.stats.misses++;
      return null;
    }

    // 检查TTL
    if (now - item.createdAt > this.config.staticTtlMs) {
      this.staticCache.delete(userId);
      this.stats.misses++;
      return null;
    }

    // 检查认知能力是否变化
    const currentHash = this.hashCognitiveProfile(cognitiveProfile);
    if (item.cognitiveProfileHash !== currentHash) {
      this.staticCache.delete(userId);
      this.stats.invalidations++;
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return item.features;
  }

  /**
   * 设置静态特征缓存
   */
  setStaticFeatures(
    userId: string,
    features: Float32Array,
    cognitiveProfile?: { mem?: number; speed?: number; stability?: number }
  ): void {
    this.staticCache.set(userId, {
      features: new Float32Array(features),
      createdAt: Date.now(),
      cognitiveProfileHash: this.hashCognitiveProfile(cognitiveProfile)
    });
  }

  /**
   * 使缓存失效
   */
  invalidate(userId: string): void {
    if (this.staticCache.delete(userId)) {
      this.stats.invalidations++;
    }
  }

  /**
   * 清理过期缓存
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [userId, item] of this.staticCache) {
      if (now - item.createdAt > this.config.staticTtlMs) {
        expiredKeys.push(userId);
      }
    }

    for (const key of expiredKeys) {
      this.staticCache.delete(key);
    }

    // LRU淘汰
    if (this.staticCache.size > this.config.maxUsers) {
      const entries = Array.from(this.staticCache.entries());
      entries.sort((a, b) => a[1].createdAt - b[1].createdAt);
      const toRemove = entries.slice(0, entries.length - this.config.maxUsers);
      for (const [key] of toRemove) {
        this.staticCache.delete(key);
      }
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { hits: number; misses: number; invalidations: number; hitRate: number; size: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      size: this.staticCache.size
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0, invalidations: 0 };
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.staticCache.clear();
    this.resetStats();
  }
}

// ==================== 导出实例 ====================

/** 默认特征构建器实例 */
export const defaultFeatureBuilder = new FeatureBuilder();

/** 默认特征缓存管理器实例 */
export const defaultFeatureCacheManager = new FeatureCacheManager();
