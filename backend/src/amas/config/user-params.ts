/**
 * AMAS Config Layer - Per-User Hyperparameter Adaptation
 * 用户级超参数自适应管理
 *
 * 核心设计:
 * - 每用户维护独立超参数配置
 * - 基于表现反馈动态调整
 * - 支持批量优化更新
 *
 * 可调参数范围:
 * | 参数 | 范围 | 含义 |
 * |------|------|------|
 * | alpha | [0.3, 2.0] | UCB探索系数 |
 * | fatigueK | [0.02, 0.2] | 疲劳恢复速率 |
 * | motivationRho | [0.6, 0.95] | 动机记忆系数 |
 * | optimalDifficulty | [0.2, 0.8] | 最优难度 |
 *
 * 自适应策略:
 * - 准确率高且疲劳低 → 提高难度
 * - 准确率低或疲劳高 → 降低难度
 * - 疲劳恢复快 → 减小fatigueK
 * - 动机趋势好 → 减少探索（alpha↓）
 */

import { amasLogger } from '../../logger';

// ==================== 类型定义 ====================

/**
 * 用户超参数配置
 */
export interface UserParams {
  /** UCB探索系数 [0.3, 2.0] */
  alpha: number;
  /** 疲劳恢复速率 [0.02, 0.2] */
  fatigueK: number;
  /** 动机记忆系数 [0.6, 0.95] */
  motivationRho: number;
  /** 最优难度 [0.2, 0.8] */
  optimalDifficulty: number;
  /** 更新次数 */
  updateCount: number;
  /** 最后更新时间戳 */
  lastUpdated: number;
}

/**
 * 用户表现追踪
 */
export interface PerformanceTracker {
  /** 近期准确率 EMA [0,1] */
  recentAccuracy: number;
  /** 疲劳变化斜率（正值=上升，负值=下降） */
  fatigueSlope: number;
  /** 动机趋势（正值=改善，负值=恶化） */
  motivationTrend: number;
  /** 近期平均奖励 */
  recentReward: number;
  /** 样本计数 */
  sampleCount: number;
}

/**
 * 用户参数状态（持久化）
 */
export interface UserParamsState {
  /** 版本号 */
  version: string;
  /** 超参数配置 */
  params: UserParams;
  /** 表现追踪 */
  performance: PerformanceTracker;
  /** 最后访问时间（用于LRU/TTL） */
  lastAccessedAt?: number;
}

/**
 * 管理器配置
 */
export interface UserParamsManagerConfig {
  /** 准确率更新平滑系数 */
  accuracyAlpha?: number;
  /** 最小更新间隔（毫秒） */
  minUpdateInterval?: number;
  /** 是否启用自动调整 */
  enableAutoAdjust?: boolean;
  /** 最大用户数量（LRU容量），默认10000 */
  maxUsers?: number;
  /** 用户参数TTL（毫秒），超时未访问则可被淘汰，默认7天 */
  userTtlMs?: number;
  /** 清理检查间隔（毫秒），默认1小时 */
  cleanupIntervalMs?: number;
}

/**
 * 反馈数据
 */
export interface ParamsFeedback {
  /** 本次准确率 [0,1] */
  accuracy: number;
  /** 疲劳变化量（正=增加，负=减少） */
  fatigueChange: number;
  /** 动机变化量 */
  motivationChange: number;
  /** 奖励值 [-1, 1] */
  reward: number;
}

// ==================== 常量 ====================

/** 默认超参数 */
const DEFAULT_PARAMS: UserParams = {
  alpha: 1.0,
  fatigueK: 0.08,
  motivationRho: 0.85,
  optimalDifficulty: 0.5,
  updateCount: 0,
  lastUpdated: 0
};

/** 参数边界 */
const PARAM_BOUNDS = {
  alpha: { min: 0.3, max: 2.0 },
  fatigueK: { min: 0.02, max: 0.2 },
  motivationRho: { min: 0.6, max: 0.95 },
  optimalDifficulty: { min: 0.2, max: 0.8 }
} as const;

/** 调整阈值 */
const ADJUSTMENT_THRESHOLDS = {
  /** 高准确率阈值 */
  highAccuracy: 0.85,
  /** 低准确率阈值 */
  lowAccuracy: 0.6,
  /** 低疲劳阈值 */
  lowFatigue: 0.4,
  /** 高疲劳阈值 */
  highFatigue: 0.7,
  /** 快速恢复斜率阈值 */
  fastRecoverySlope: -0.1,
  /** 慢速恢复斜率阈值 */
  slowRecoverySlope: 0.1,
  /** 动机改善阈值 */
  motivationImprove: 0.2,
  /** 动机恶化阈值 */
  motivationWorsen: -0.2
} as const;

/** 调整幅度 */
const ADJUSTMENT_RATES = {
  /** 难度增量 */
  difficultyIncrement: 0.05,
  /** 疲劳K乘数（减小） */
  fatigueKDecrease: 0.95,
  /** 疲劳K乘数（增大） */
  fatigueKIncrease: 1.05,
  /** Alpha乘数（减小-利用） */
  alphaDecrease: 0.98,
  /** Alpha乘数（增大-探索） */
  alphaIncrease: 1.02
} as const;

/** 默认配置 */
const DEFAULT_CONFIG: Required<UserParamsManagerConfig> = {
  accuracyAlpha: 0.15,
  minUpdateInterval: 5000,
  enableAutoAdjust: true,
  maxUsers: 10000,
  userTtlMs: 7 * 24 * 60 * 60 * 1000, // 7天
  cleanupIntervalMs: 60 * 60 * 1000 // 1小时
};

/** 默认表现追踪 */
const DEFAULT_PERFORMANCE: PerformanceTracker = {
  recentAccuracy: 0.5,
  fatigueSlope: 0,
  motivationTrend: 0,
  recentReward: 0,
  sampleCount: 0
};

// ==================== 实现 ====================

/**
 * 用户参数管理器
 *
 * 适用场景:
 * - 个性化学习参数调优
 * - 动态难度调整
 * - 用户行为适配
 */
export class UserParamsManager {
  private static readonly VERSION = '1.0.0';

  /** 配置 */
  private readonly config: Required<UserParamsManagerConfig>;

  /** 用户参数映射 */
  private readonly userParams: Map<string, UserParamsState> = new Map();

  /** 操作锁映射，用于解决竞态条件 */
  private readonly operationLocks: Map<string, Promise<void>> = new Map();

  /** 清理定时器 */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: UserParamsManagerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanupTimer();
  }

  /**
   * 启动定时清理任务
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);

    // 允许进程正常退出
    if (typeof this.cleanupTimer.unref === 'function') {
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
   * 执行清理：淘汰过期或超量的用户数据
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    // 1. 首先淘汰TTL过期的
    if (this.config.userTtlMs > 0) {
      const cutoffTime = now - this.config.userTtlMs;
      const toDelete: string[] = [];
      this.userParams.forEach((state, userId) => {
        const lastAccess = state.lastAccessedAt ?? state.params.lastUpdated;
        if (lastAccess < cutoffTime) {
          toDelete.push(userId);
        }
      });
      for (const userId of toDelete) {
        this.userParams.delete(userId);
        removed++;
      }
    }

    // 2. 如果仍超过maxUsers，按LRU淘汰最老的
    if (this.userParams.size > this.config.maxUsers) {
      const entries = Array.from(this.userParams.entries());
      // 按最后访问时间排序（升序，最老的在前）
      entries.sort((a, b) => {
        const timeA = a[1].lastAccessedAt ?? a[1].params.lastUpdated;
        const timeB = b[1].lastAccessedAt ?? b[1].params.lastUpdated;
        return timeA - timeB;
      });

      // 淘汰超出的部分
      const toRemove = entries.slice(0, this.userParams.size - this.config.maxUsers);
      for (const [userId] of toRemove) {
        this.userParams.delete(userId);
        removed++;
      }
    }

    if (removed > 0) {
      amasLogger.debug({ removed, remaining: this.userParams.size }, '[UserParamsManager] 清理过期用户数据');
    }

    return removed;
  }

  /**
   * 获取或等待用户操作锁
   * 用于解决 get/set 之间的竞态条件
   */
  private async acquireLock(userId: string): Promise<() => void> {
    // 等待现有锁释放
    while (this.operationLocks.has(userId)) {
      await this.operationLocks.get(userId);
    }

    // 创建新锁
    let releaseLock: () => void;
    const lockPromise = new Promise<void>(resolve => {
      releaseLock = resolve;
    });
    this.operationLocks.set(userId, lockPromise);

    return () => {
      this.operationLocks.delete(userId);
      releaseLock!();
    };
  }

  /**
   * 更新访问时间（用于LRU）
   */
  private touchUser(state: UserParamsState): void {
    state.lastAccessedAt = Date.now();
  }

  // ==================== 核心API ====================

  /**
   * 获取用户参数
   *
   * @param userId 用户ID
   * @returns 用户参数（不存在则返回默认）
   */
  getParams(userId: string): UserParams {
    const state = this.userParams.get(userId);
    if (state) {
      this.touchUser(state);
      return { ...state.params };
    }
    return { ...DEFAULT_PARAMS, lastUpdated: Date.now() };
  }

  /**
   * 获取完整状态
   */
  getState(userId: string): UserParamsState | null {
    const state = this.userParams.get(userId);
    if (state) {
      this.touchUser(state);
      return this.cloneState(state);
    }
    return null;
  }

  /**
   * 基于反馈更新参数（同步版本）
   *
   * @param userId 用户ID
   * @param feedback 反馈数据
   */
  updateParams(userId: string, feedback: ParamsFeedback): void {
    const now = Date.now();

    // 获取或创建状态
    let state = this.userParams.get(userId);
    if (!state) {
      state = this.createInitialState();
      this.userParams.set(userId, state);
    }

    this.touchUser(state);

    // 检查更新间隔
    if (now - state.params.lastUpdated < this.config.minUpdateInterval) {
      return;
    }

    // 更新表现追踪
    this.updatePerformance(state.performance, feedback);

    // 自动调整参数
    if (this.config.enableAutoAdjust) {
      this.adjustParams(state);
    }

    // 更新元数据
    state.params.updateCount += 1;
    state.params.lastUpdated = now;
  }

  /**
   * 基于反馈更新参数（异步版本，带锁保护）
   * 用于需要防止竞态条件的场景
   *
   * @param userId 用户ID
   * @param feedback 反馈数据
   */
  async updateParamsAsync(userId: string, feedback: ParamsFeedback): Promise<void> {
    const release = await this.acquireLock(userId);
    try {
      this.updateParams(userId, feedback);
    } finally {
      release();
    }
  }

  /**
   * 直接设置用户参数（同步版本）
   *
   * @param userId 用户ID
   * @param params 部分参数
   */
  setParams(userId: string, params: Partial<UserParams>): void {
    let state = this.userParams.get(userId);
    if (!state) {
      state = this.createInitialState();
      this.userParams.set(userId, state);
    }

    this.touchUser(state);

    // 合并并校验参数
    if (params.alpha !== undefined) {
      state.params.alpha = this.clamp(
        params.alpha,
        PARAM_BOUNDS.alpha.min,
        PARAM_BOUNDS.alpha.max
      );
    }
    if (params.fatigueK !== undefined) {
      state.params.fatigueK = this.clamp(
        params.fatigueK,
        PARAM_BOUNDS.fatigueK.min,
        PARAM_BOUNDS.fatigueK.max
      );
    }
    if (params.motivationRho !== undefined) {
      state.params.motivationRho = this.clamp(
        params.motivationRho,
        PARAM_BOUNDS.motivationRho.min,
        PARAM_BOUNDS.motivationRho.max
      );
    }
    if (params.optimalDifficulty !== undefined) {
      state.params.optimalDifficulty = this.clamp(
        params.optimalDifficulty,
        PARAM_BOUNDS.optimalDifficulty.min,
        PARAM_BOUNDS.optimalDifficulty.max
      );
    }

    state.params.lastUpdated = Date.now();
  }

  /**
   * 直接设置用户参数（异步版本，带锁保护）
   * 用于需要防止竞态条件的场景
   *
   * @param userId 用户ID
   * @param params 部分参数
   */
  async setParamsAsync(userId: string, params: Partial<UserParams>): Promise<void> {
    const release = await this.acquireLock(userId);
    try {
      this.setParams(userId, params);
    } finally {
      release();
    }
  }

  /**
   * 重置用户参数为默认值
   */
  resetParams(userId: string): void {
    this.userParams.set(userId, this.createInitialState());
  }

  /**
   * 批量更新参数（用于贝叶斯优化器）
   *
   * @param updates 用户ID -> 参数更新 映射
   */
  batchUpdate(updates: Map<string, Partial<UserParams>>): void {
    updates.forEach((params, userId) => {
      this.setParams(userId, params);
    });
  }

  /**
   * 删除用户数据
   */
  removeUser(userId: string): boolean {
    return this.userParams.delete(userId);
  }

  /**
   * 获取所有用户ID
   */
  getAllUserIds(): string[] {
    return Array.from(this.userParams.keys());
  }

  /**
   * 获取用户数量
   */
  getUserCount(): number {
    return this.userParams.size;
  }

  // ==================== 导出/导入 ====================

  /**
   * 导出所有状态（用于持久化）
   */
  exportAll(): Map<string, UserParamsState> {
    const result = new Map<string, UserParamsState>();
    this.userParams.forEach((state, userId) => {
      result.set(userId, this.cloneState(state));
    });
    return result;
  }

  /**
   * 导入状态
   */
  importAll(data: Map<string, UserParamsState>): void {
    data.forEach((state, userId) => {
      if (this.validateState(state)) {
        this.userParams.set(userId, this.migrateState(state));
      }
    });
  }

  /**
   * 导出单个用户状态
   */
  exportUser(userId: string): UserParamsState | null {
    const state = this.userParams.get(userId);
    return state ? this.cloneState(state) : null;
  }

  /**
   * 导入单个用户状态
   */
  importUser(userId: string, state: UserParamsState): boolean {
    if (!this.validateState(state)) {
      amasLogger.warn({ userId }, '[UserParamsManager] 无效状态，跳过导入');
      return false;
    }
    this.userParams.set(userId, this.migrateState(state));
    return true;
  }

  // ==================== 统计方法 ====================

  /**
   * 获取参数统计摘要
   */
  getStatsSummary(): {
    userCount: number;
    avgAccuracy: number;
    avgDifficulty: number;
    paramDistribution: {
      alpha: { mean: number; std: number };
      fatigueK: { mean: number; std: number };
      motivationRho: { mean: number; std: number };
      optimalDifficulty: { mean: number; std: number };
    };
  } {
    const states = Array.from(this.userParams.values());
    const n = states.length;

    if (n === 0) {
      return {
        userCount: 0,
        avgAccuracy: 0.5,
        avgDifficulty: 0.5,
        paramDistribution: {
          alpha: { mean: DEFAULT_PARAMS.alpha, std: 0 },
          fatigueK: { mean: DEFAULT_PARAMS.fatigueK, std: 0 },
          motivationRho: { mean: DEFAULT_PARAMS.motivationRho, std: 0 },
          optimalDifficulty: { mean: DEFAULT_PARAMS.optimalDifficulty, std: 0 }
        }
      };
    }

    // 计算均值
    const sums = {
      accuracy: 0,
      alpha: 0,
      fatigueK: 0,
      motivationRho: 0,
      optimalDifficulty: 0
    };

    for (const state of states) {
      sums.accuracy += state.performance.recentAccuracy;
      sums.alpha += state.params.alpha;
      sums.fatigueK += state.params.fatigueK;
      sums.motivationRho += state.params.motivationRho;
      sums.optimalDifficulty += state.params.optimalDifficulty;
    }

    const means = {
      accuracy: sums.accuracy / n,
      alpha: sums.alpha / n,
      fatigueK: sums.fatigueK / n,
      motivationRho: sums.motivationRho / n,
      optimalDifficulty: sums.optimalDifficulty / n
    };

    // 计算标准差
    const varSums = {
      alpha: 0,
      fatigueK: 0,
      motivationRho: 0,
      optimalDifficulty: 0
    };

    for (const state of states) {
      varSums.alpha += Math.pow(state.params.alpha - means.alpha, 2);
      varSums.fatigueK += Math.pow(state.params.fatigueK - means.fatigueK, 2);
      varSums.motivationRho += Math.pow(
        state.params.motivationRho - means.motivationRho,
        2
      );
      varSums.optimalDifficulty += Math.pow(
        state.params.optimalDifficulty - means.optimalDifficulty,
        2
      );
    }

    return {
      userCount: n,
      avgAccuracy: means.accuracy,
      avgDifficulty: means.optimalDifficulty,
      paramDistribution: {
        alpha: {
          mean: means.alpha,
          std: Math.sqrt(varSums.alpha / n)
        },
        fatigueK: {
          mean: means.fatigueK,
          std: Math.sqrt(varSums.fatigueK / n)
        },
        motivationRho: {
          mean: means.motivationRho,
          std: Math.sqrt(varSums.motivationRho / n)
        },
        optimalDifficulty: {
          mean: means.optimalDifficulty,
          std: Math.sqrt(varSums.optimalDifficulty / n)
        }
      }
    };
  }

  // ==================== 私有方法 ====================

  /**
   * 创建初始状态
   * 注意: lastUpdated设为0以确保首次updateParams不被拦截
   */
  private createInitialState(): UserParamsState {
    return {
      version: UserParamsManager.VERSION,
      params: { ...DEFAULT_PARAMS, lastUpdated: 0 },
      performance: { ...DEFAULT_PERFORMANCE },
      lastAccessedAt: Date.now()
    };
  }

  /**
   * 更新表现追踪
   * 对所有反馈值进行范围裁剪以防止异常值污染
   */
  private updatePerformance(
    perf: PerformanceTracker,
    feedback: ParamsFeedback
  ): void {
    const alpha = this.config.accuracyAlpha;

    // 裁剪反馈值到有效范围
    const clampedAccuracy = this.clamp(feedback.accuracy, 0, 1);
    const clampedFatigueChange = this.clamp(feedback.fatigueChange, -1, 1);
    const clampedMotivationChange = this.clamp(feedback.motivationChange, -1, 1);
    const clampedReward = this.clamp(feedback.reward, -1, 1);

    // EMA更新准确率
    perf.recentAccuracy =
      alpha * clampedAccuracy + (1 - alpha) * perf.recentAccuracy;

    // EMA更新疲劳斜率
    perf.fatigueSlope =
      alpha * clampedFatigueChange + (1 - alpha) * perf.fatigueSlope;

    // EMA更新动机趋势
    perf.motivationTrend =
      alpha * clampedMotivationChange + (1 - alpha) * perf.motivationTrend;

    // EMA更新奖励
    perf.recentReward =
      alpha * clampedReward + (1 - alpha) * perf.recentReward;

    perf.sampleCount += 1;
  }

  /**
   * 自动调整参数
   */
  private adjustParams(state: UserParamsState): void {
    const { params, performance } = state;
    const th = ADJUSTMENT_THRESHOLDS;
    const rates = ADJUSTMENT_RATES;

    // 难度调整
    // 修复: fatigueSlope是斜率(-1到1)，应与fastRecoverySlope/slowRecoverySlope比较
    // 负斜率表示疲劳在下降(恢复中)，正斜率表示疲劳在上升
    if (
      performance.recentAccuracy > th.highAccuracy &&
      performance.fatigueSlope < th.fastRecoverySlope
    ) {
      // 表现好且疲劳在快速恢复 → 提高难度
      params.optimalDifficulty = this.clamp(
        params.optimalDifficulty + rates.difficultyIncrement,
        PARAM_BOUNDS.optimalDifficulty.min,
        PARAM_BOUNDS.optimalDifficulty.max
      );
    } else if (
      performance.recentAccuracy < th.lowAccuracy ||
      performance.fatigueSlope > th.slowRecoverySlope
    ) {
      // 表现差或疲劳在上升 → 降低难度
      params.optimalDifficulty = this.clamp(
        params.optimalDifficulty - rates.difficultyIncrement,
        PARAM_BOUNDS.optimalDifficulty.min,
        PARAM_BOUNDS.optimalDifficulty.max
      );
    }

    // 疲劳K调整
    if (performance.fatigueSlope < th.fastRecoverySlope) {
      // 快速恢复 → 减小K（允许更紧凑的学习）
      params.fatigueK = this.clamp(
        params.fatigueK * rates.fatigueKDecrease,
        PARAM_BOUNDS.fatigueK.min,
        PARAM_BOUNDS.fatigueK.max
      );
    } else if (performance.fatigueSlope > th.slowRecoverySlope) {
      // 慢速恢复 → 增大K（需要更多休息）
      params.fatigueK = this.clamp(
        params.fatigueK * rates.fatigueKIncrease,
        PARAM_BOUNDS.fatigueK.min,
        PARAM_BOUNDS.fatigueK.max
      );
    }

    // Alpha调整（探索-利用平衡）
    if (performance.motivationTrend > th.motivationImprove) {
      // 动机改善 → 减少探索，多利用当前策略
      params.alpha = this.clamp(
        params.alpha * rates.alphaDecrease,
        PARAM_BOUNDS.alpha.min,
        PARAM_BOUNDS.alpha.max
      );
    } else if (performance.motivationTrend < th.motivationWorsen) {
      // 动机恶化 → 增加探索，寻找更好策略
      params.alpha = this.clamp(
        params.alpha * rates.alphaIncrease,
        PARAM_BOUNDS.alpha.min,
        PARAM_BOUNDS.alpha.max
      );
    }
  }

  /**
   * 验证状态有效性
   */
  private validateState(state: UserParamsState): boolean {
    if (!state || typeof state !== 'object') return false;
    if (!state.params || typeof state.params !== 'object') return false;

    const { params } = state;
    return (
      typeof params.alpha === 'number' &&
      typeof params.fatigueK === 'number' &&
      typeof params.motivationRho === 'number' &&
      typeof params.optimalDifficulty === 'number'
    );
  }

  /**
   * 迁移状态到当前版本
   */
  private migrateState(state: UserParamsState): UserParamsState {
    if (state.version !== UserParamsManager.VERSION) {
      amasLogger.debug({ from: state.version, to: UserParamsManager.VERSION }, '[UserParamsManager] 版本迁移');
    }

    return {
      version: UserParamsManager.VERSION,
      params: {
        alpha: this.clamp(
          state.params.alpha ?? DEFAULT_PARAMS.alpha,
          PARAM_BOUNDS.alpha.min,
          PARAM_BOUNDS.alpha.max
        ),
        fatigueK: this.clamp(
          state.params.fatigueK ?? DEFAULT_PARAMS.fatigueK,
          PARAM_BOUNDS.fatigueK.min,
          PARAM_BOUNDS.fatigueK.max
        ),
        motivationRho: this.clamp(
          state.params.motivationRho ?? DEFAULT_PARAMS.motivationRho,
          PARAM_BOUNDS.motivationRho.min,
          PARAM_BOUNDS.motivationRho.max
        ),
        optimalDifficulty: this.clamp(
          state.params.optimalDifficulty ?? DEFAULT_PARAMS.optimalDifficulty,
          PARAM_BOUNDS.optimalDifficulty.min,
          PARAM_BOUNDS.optimalDifficulty.max
        ),
        updateCount: Math.max(0, state.params.updateCount ?? 0),
        lastUpdated: state.params.lastUpdated ?? Date.now()
      },
      performance: state.performance
        ? {
            recentAccuracy: this.clamp(
              state.performance.recentAccuracy ?? 0.5,
              0,
              1
            ),
            fatigueSlope: this.clamp(
              state.performance.fatigueSlope ?? 0,
              -1,
              1
            ),
            motivationTrend: this.clamp(
              state.performance.motivationTrend ?? 0,
              -1,
              1
            ),
            recentReward: this.clamp(
              state.performance.recentReward ?? 0,
              -1,
              1
            ),
            sampleCount: Math.max(0, state.performance.sampleCount ?? 0)
          }
        : { ...DEFAULT_PERFORMANCE }
    };
  }

  /**
   * 深拷贝状态
   */
  private cloneState(state: UserParamsState): UserParamsState {
    return {
      version: state.version,
      params: { ...state.params },
      performance: { ...state.performance },
      lastAccessedAt: state.lastAccessedAt
    };
  }

  /**
   * 数值截断
   */
  private clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return (min + max) / 2;
    return Math.max(min, Math.min(max, value));
  }
}

// ==================== 便捷函数 ====================

/**
 * 获取参数边界
 */
export function getParamBounds(): typeof PARAM_BOUNDS {
  return { ...PARAM_BOUNDS };
}

/**
 * 获取默认参数
 */
export function getDefaultParams(): UserParams {
  return { ...DEFAULT_PARAMS, lastUpdated: Date.now() };
}

/**
 * 验证参数是否在有效范围内
 */
export function validateParams(params: Partial<UserParams>): string[] {
  const errors: string[] = [];

  if (
    params.alpha !== undefined &&
    (params.alpha < PARAM_BOUNDS.alpha.min ||
      params.alpha > PARAM_BOUNDS.alpha.max)
  ) {
    errors.push(
      `alpha ${params.alpha} 超出范围 [${PARAM_BOUNDS.alpha.min}, ${PARAM_BOUNDS.alpha.max}]`
    );
  }

  if (
    params.fatigueK !== undefined &&
    (params.fatigueK < PARAM_BOUNDS.fatigueK.min ||
      params.fatigueK > PARAM_BOUNDS.fatigueK.max)
  ) {
    errors.push(
      `fatigueK ${params.fatigueK} 超出范围 [${PARAM_BOUNDS.fatigueK.min}, ${PARAM_BOUNDS.fatigueK.max}]`
    );
  }

  if (
    params.motivationRho !== undefined &&
    (params.motivationRho < PARAM_BOUNDS.motivationRho.min ||
      params.motivationRho > PARAM_BOUNDS.motivationRho.max)
  ) {
    errors.push(
      `motivationRho ${params.motivationRho} 超出范围 [${PARAM_BOUNDS.motivationRho.min}, ${PARAM_BOUNDS.motivationRho.max}]`
    );
  }

  if (
    params.optimalDifficulty !== undefined &&
    (params.optimalDifficulty < PARAM_BOUNDS.optimalDifficulty.min ||
      params.optimalDifficulty > PARAM_BOUNDS.optimalDifficulty.max)
  ) {
    errors.push(
      `optimalDifficulty ${params.optimalDifficulty} 超出范围 [${PARAM_BOUNDS.optimalDifficulty.min}, ${PARAM_BOUNDS.optimalDifficulty.max}]`
    );
  }

  return errors;
}

// ==================== 导出默认实例 ====================

export const defaultUserParamsManager = new UserParamsManager();
