/**
 * AMAS Learning Layer - Aggressive Cold Start Strategy
 * 激进冷启动策略
 *
 * 核心设计:
 * - 5个探测动作覆盖关键维度（能力、负载、遗忘）
 * - 快速分类用户类型（fast/stable/cautious）
 * - 根据分类结果收敛到匹配策略
 *
 * 三阶段流程:
 * 1. classify: 执行5个探测动作，收集用户反馈
 * 2. explore: 根据分类结果探索最优策略
 * 3. normal: 交由其他学习器接管
 */

import { Action, StrategyParams, UserState, UserType, ColdStartPhase } from '../types';
import {
  ACTION_SPACE,
  CLASSIFY_PHASE_THRESHOLD,
  EXPLORE_PHASE_THRESHOLD,
  DEFAULT_STRATEGY,
  COLD_START_STRATEGY,
  EARLY_STOP_CONFIG,
} from '../config/action-space';
import {
  ActionSelection,
  BaseLearner,
  BaseLearnerContext,
  LearnerCapabilities,
} from '../algorithms/learners';
import { globalStatsService } from '../cold-start/global-stats';
import { amasLogger } from '../../logger';

// ==================== 类型定义 ====================

/**
 * 探测结果记录
 */
interface ProbeResult {
  /** 执行的动作 */
  action: Action;
  /** 奖励值 */
  reward: number;
  /** 是否正确 */
  isCorrect: boolean;
  /** 响应时间(ms) */
  responseTime: number;
  /** 错误率 */
  errorRate: number;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 冷启动管理器状态
 */
export interface ColdStartState {
  /** 当前阶段 */
  phase: ColdStartPhase;
  /** 用户类型分类 */
  userType: UserType | null;
  /** 当前探测索引 */
  probeIndex: number;
  /** 探测结果历史 */
  results: ProbeResult[];
  /** 收敛后的策略 */
  settledStrategy: StrategyParams | null;
  /** 更新计数 */
  updateCount: number;
}

/**
 * 用户分类阈值配置
 */
interface ClassificationThresholds {
  /** fast类型正确率阈值 */
  fastAccuracy: number;
  /** fast类型响应时间上限(ms) */
  fastResponseTime: number;
  /** fast类型错误率上限 */
  fastErrorRate: number;
  /** stable类型正确率阈值 */
  stableAccuracy: number;
  /** stable类型响应时间上限(ms) */
  stableResponseTime: number;
  /** stable类型错误率上限 */
  stableErrorRate: number;
}

// ==================== 常量 ====================

/**
 * 3个高区分度探测动作设计（优化版）
 *
 * 设计原理：
 * - 每个探测针对最大化信息增益的维度组合
 * - 3个探测覆盖：基础能力、能力上限、提示依赖度
 * - 配合贝叶斯早停，可在2-3题内完成用户分类
 */
const PROBE_ACTIONS: Action[] = [
  // 1. 基线测试：标准难度，无提示，测独立能力
  {
    interval_scale: 1.0,
    new_ratio: 0.2,
    difficulty: 'mid',
    batch_size: 8,
    hint_level: 0,
  },
  // 2. 挑战测试：高难度+高新词比，测能力上限
  {
    interval_scale: 1.2,
    new_ratio: 0.35,
    difficulty: 'hard',
    batch_size: 10,
    hint_level: 0,
  },
  // 3. 支持测试：低难度+强提示，测提示依赖度和基础下限
  {
    interval_scale: 0.8,
    new_ratio: 0.15,
    difficulty: 'easy',
    batch_size: 6,
    hint_level: 2,
  },
];

/**
 * 默认用户类型先验概率（贝叶斯分类用）
 * 如果有全局统计数据，会优先使用全局统计推导的先验
 */
const DEFAULT_USER_TYPE_PRIORS: Record<UserType, number> = {
  fast: 0.25,
  stable: 0.5,
  cautious: 0.25,
};

/**
 * 各用户类型在各探测下的期望表现
 * 格式: [正确率期望, 正确率标准差, RT期望(ms), RT标准差(ms)]
 */
const PROBE_EXPECTATIONS: Record<UserType, Array<[number, number, number, number]>> = {
  fast: [
    [0.85, 0.1, 1200, 400],
    [0.75, 0.12, 1500, 500],
    [0.95, 0.05, 800, 300],
  ],
  stable: [
    [0.7, 0.12, 2000, 600],
    [0.55, 0.15, 2500, 700],
    [0.9, 0.08, 1500, 500],
  ],
  cautious: [
    [0.5, 0.15, 3000, 800],
    [0.35, 0.15, 3500, 900],
    [0.8, 0.1, 2500, 700],
  ],
};

/** 默认分类阈值 */
const DEFAULT_THRESHOLDS: ClassificationThresholds = {
  fastAccuracy: 0.8,
  fastResponseTime: 1500,
  fastErrorRate: 0.2,
  stableAccuracy: 0.6,
  stableResponseTime: 3000,
  stableErrorRate: 0.35,
};

/** 结果历史最大保留条数（防止内存无限增长） */
const MAX_RESULTS_HISTORY = 20;

// ==================== 实现 ====================

/**
 * 激进冷启动管理器
 *
 * 适用场景:
 * - 新用户首次使用
 * - 用户长期未使用后回归
 * - 需要快速建立用户画像
 */
export class ColdStartManager implements BaseLearner<
  UserState,
  Action,
  BaseLearnerContext,
  ColdStartState
> {
  private static readonly NAME = 'ColdStartManager';
  private static readonly VERSION = '1.0.0';

  /** 分类阈值配置 */
  private readonly thresholds: ClassificationThresholds;

  /** 内部状态 */
  private state: ColdStartState = this.createInitialState();

  /** 用户类型先验概率（支持全局统计覆盖） */
  private userTypePriors: Record<UserType, number> = { ...DEFAULT_USER_TYPE_PRIORS };

  /** 全局统计是否已初始化 */
  private globalStatsInitialized = false;

  /** 初始化Promise，用于等待初始化完成 */
  private initPromise: Promise<void>;

  /** 是否已准备就绪（基础初始化完成） */
  private ready = false;

  constructor(thresholds?: Partial<ClassificationThresholds>) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    // Bug修复：同步标记为就绪，避免selectAction阻塞或竞态条件
    // 全局统计先验是优化项（用于贝叶斯分类），不是必需的
    // 使用默认先验也能正常完成用户分类
    this.ready = true;
    // 异步加载全局统计先验（可选优化）
    this.initPromise = this.initGlobalPriors().catch((err) => {
      amasLogger.warn({ err }, '[ColdStartManager] 无法加载全局统计先验，使用默认先验');
    });
  }

  /**
   * 初始化全局统计先验
   */
  private async initGlobalPriors(): Promise<void> {
    try {
      const stats = await globalStatsService.computeGlobalStats();
      if (stats.sampleSize > 0) {
        this.userTypePriors = {
          fast: stats.userTypePriors.fast,
          stable: stats.userTypePriors.stable,
          cautious: stats.userTypePriors.cautious,
        };
        this.globalStatsInitialized = true;
      }
    } catch {
      // 使用默认先验
    }
  }

  /**
   * 手动设置全局统计先验（用于测试或外部初始化）
   */
  setGlobalPriors(priors: Record<UserType, number>): void {
    const total = priors.fast + priors.stable + priors.cautious;
    if (total > 0) {
      this.userTypePriors = {
        fast: priors.fast / total,
        stable: priors.stable / total,
        cautious: priors.cautious / total,
      };
      this.globalStatsInitialized = true;
    }
  }

  /**
   * 检查全局统计是否已初始化
   */
  isGlobalStatsInitialized(): boolean {
    return this.globalStatsInitialized;
  }

  /**
   * 检查是否已准备就绪（基础初始化完成）
   * 用于同步检查实例是否可以安全使用
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * 等待初始化完成
   * 用于需要确保初始化完成后再使用的场景
   */
  async waitUntilReady(): Promise<void> {
    await this.initPromise;
  }

  // ==================== BaseLearner接口实现 ====================

  /**
   * 选择动作
   *
   * 策略:
   * - classify阶段: 按顺序执行探测动作
   * - explore阶段: 使用分类后的收敛策略
   * - normal阶段: 返回收敛策略或默认策略
   *
   * 注意：如果实例尚未准备就绪，会使用默认先验，不会阻塞调用
   */
  selectAction(
    _state: UserState,
    actions: Action[],
    context: BaseLearnerContext,
  ): ActionSelection<Action> {
    // 保持与其他学习器一致的 API 行为
    if (!actions || actions.length === 0) {
      throw new Error('Action list cannot be empty');
    }

    // 如果尚未准备就绪，记录警告但继续使用默认先验
    // 不阻塞调用以避免性能问题
    if (!this.ready) {
      amasLogger.debug('[ColdStartManager] selectAction 在初始化完成前被调用，使用默认先验');
    }

    const action = this.determineNextAction(actions);
    const confidence = this.computeConfidence(context);

    return {
      action,
      score: this.computeScore(),
      confidence,
      meta: {
        phase: this.state.phase,
        userType: this.state.userType,
        probeIndex: this.state.probeIndex,
        probeTotal: PROBE_ACTIONS.length,
        settledStrategy: this.state.settledStrategy,
        initializationComplete: this.ready,
      },
    };
  }

  /**
   * 更新模型
   *
   * 流程:
   * 1. 记录探测结果
   * 2. 检查是否完成分类阶段
   * 3. 执行用户分类
   * 4. 检查是否进入normal阶段
   */
  update(_state: UserState, action: Action, reward: number, context: BaseLearnerContext): void {
    // 正确性判断：综合评估 errorRate 和 reward 两个指标
    // - recentErrorRate: 最近错误率（0-1），越低表示表现越好
    // - reward: 奖励值（0-1），越高表示表现越好
    // 使用加权组合：将两者转换为同一方向后综合评估
    // reward 权重较高（0.6）因为它是更直接的反馈信号
    // errorRate 权重较低（0.4）提供窗口期稳定性信息
    const recentErrorRate = this.toNumber(context.recentErrorRate, 0.5);
    const correctnessFromErrorRate = 1 - recentErrorRate; // 转换为正确率
    const combinedScore = 0.6 * reward + 0.4 * correctnessFromErrorRate;
    const isCorrect = combinedScore >= 0.5;

    const result: ProbeResult = {
      action,
      reward,
      isCorrect,
      responseTime: this.toNumber(context.recentResponseTime, 2000),
      errorRate: recentErrorRate,
      timestamp: Date.now(),
    };

    // 记录结果（限制历史长度）
    this.state.results.push(result);
    if (this.state.results.length > MAX_RESULTS_HISTORY) {
      // 保留前PROBE_ACTIONS.length条（分类依据）+ 最近滚动窗口
      const probeCount = PROBE_ACTIONS.length;
      const keepRecent = MAX_RESULTS_HISTORY - probeCount;
      this.state.results = [
        ...this.state.results.slice(0, probeCount),
        ...this.state.results.slice(-keepRecent),
      ];
    }
    this.state.updateCount += 1;

    // 分类阶段逻辑
    if (this.state.phase === 'classify') {
      this.handleClassifyPhase();
    }

    // 探索阶段转换检查
    // 增加条件：探针完成 + 样本数达标
    if (
      this.state.phase === 'explore' &&
      this.state.updateCount >= EXPLORE_PHASE_THRESHOLD &&
      this.state.probeIndex >= PROBE_ACTIONS.length
    ) {
      // 容错逻辑：如果settledStrategy为null（理论上不应该发生），重新执行分类
      // 这确保即使之前分类失败，也能正常进入normal阶段
      if (this.state.settledStrategy === null) {
        amasLogger.warn('[ColdStartManager] explore阶段settledStrategy为null，重新执行分类');
        this.classifyUserBayesian();
      }
      this.state.phase = 'normal';
    }
  }

  /**
   * 获取状态（用于持久化）
   */
  getState(): ColdStartState {
    return {
      phase: this.state.phase,
      userType: this.state.userType,
      probeIndex: this.state.probeIndex,
      results: this.state.results.map((r) => ({ ...r })),
      settledStrategy: this.state.settledStrategy ? { ...this.state.settledStrategy } : null,
      updateCount: this.state.updateCount,
    };
  }

  /**
   * 恢复状态（带数值校验）
   */
  setState(state: ColdStartState): void {
    if (!state) {
      amasLogger.warn('[ColdStartManager] 无效状态，跳过恢复');
      return;
    }

    // 校验并恢复phase
    const validPhases: ColdStartPhase[] = ['classify', 'explore', 'normal'];
    const phase = validPhases.includes(state.phase) ? state.phase : 'classify';

    // 校验并恢复userType
    const validUserTypes: (UserType | null)[] = ['fast', 'stable', 'cautious', null];
    const userType = validUserTypes.includes(state.userType) ? state.userType : null;

    // 校验数值字段
    const probeIndex = this.validatePositiveInt(state.probeIndex, 0);
    const updateCount = this.validatePositiveInt(state.updateCount, 0);

    // 校验并过滤results中的无效数据
    const validatedResults = this.validateResults(state.results ?? []);

    // 校验settledStrategy
    const settledStrategy = this.validateStrategy(state.settledStrategy);

    this.state = {
      phase,
      userType,
      probeIndex: Math.min(probeIndex, PROBE_ACTIONS.length),
      results: validatedResults,
      settledStrategy,
      updateCount,
    };
  }

  /**
   * 重置到初始状态
   */
  reset(): void {
    this.state = this.createInitialState();
  }

  getName(): string {
    return ColdStartManager.NAME;
  }

  getVersion(): string {
    return ColdStartManager.VERSION;
  }

  getCapabilities(): LearnerCapabilities {
    return {
      supportsOnlineLearning: true,
      supportsBatchUpdate: false,
      requiresPretraining: false,
      minSamplesForReliability: PROBE_ACTIONS.length,
      primaryUseCase: '新用户冷启动探测与快速分类',
    };
  }

  getUpdateCount(): number {
    return this.state.updateCount;
  }

  // ==================== 公开便捷方法 ====================

  /**
   * 获取当前阶段
   */
  getPhase(): ColdStartPhase {
    return this.state.phase;
  }

  /**
   * 获取用户分类
   */
  getUserType(): UserType | null {
    return this.state.userType;
  }

  /**
   * 获取收敛策略
   */
  getSettledStrategy(): StrategyParams | null {
    return this.state.settledStrategy;
  }

  /**
   * 是否已完成冷启动
   */
  isCompleted(): boolean {
    return this.state.phase === 'normal';
  }

  /**
   * 获取探测进度 [0,1]
   */
  getProgress(): number {
    if (this.state.phase === 'classify') {
      // 防止除零：PROBE_ACTIONS.length 应该 > 0
      const probeCount = PROBE_ACTIONS.length || 1;
      return (this.state.probeIndex / probeCount) * 0.5;
    }
    if (this.state.phase === 'explore') {
      // 防止除零和负数：确保分母 > 0
      const probeCount = PROBE_ACTIONS.length;
      const exploreDenominator = Math.max(EXPLORE_PHASE_THRESHOLD - probeCount, 1);
      const exploreNumerator = Math.max(this.state.updateCount - probeCount, 0);
      const exploreProgress = exploreNumerator / exploreDenominator;
      return 0.5 + Math.min(exploreProgress, 1) * 0.5;
    }
    return 1;
  }

  /**
   * 获取贝叶斯后验概率（用于调试和可视化）
   */
  getPosteriors(): Record<UserType, number> {
    return this.computePosteriors();
  }

  /**
   * 获取探测动作总数
   */
  getProbeCount(): number {
    return PROBE_ACTIONS.length;
  }

  /**
   * 检查是否可以早停
   */
  canEarlyStop(): boolean {
    return this.shouldEarlyStop();
  }

  // ==================== 私有方法 ====================

  /**
   * 创建初始状态
   */
  private createInitialState(): ColdStartState {
    return {
      phase: 'classify',
      userType: null,
      probeIndex: 0,
      results: [],
      settledStrategy: null,
      updateCount: 0,
    };
  }

  /**
   * 确定下一个动作
   */
  private determineNextAction(actions: Action[]): Action {
    // 分类阶段：按顺序执行探测动作
    if (this.state.phase === 'classify' && this.state.probeIndex < PROBE_ACTIONS.length) {
      return this.findClosestActionIn(actions, PROBE_ACTIONS[this.state.probeIndex]);
    }

    // 有收敛策略时使用
    if (this.state.settledStrategy) {
      return this.findClosestActionIn(actions, this.state.settledStrategy);
    }

    // 超过分类阈值但未分类：使用安全默认策略
    if (this.state.updateCount >= CLASSIFY_PHASE_THRESHOLD) {
      return this.findClosestActionIn(actions, DEFAULT_STRATEGY);
    }

    // 继续循环探测（理论上不应进入此分支）
    const idx = this.state.probeIndex % PROBE_ACTIONS.length;
    return this.findClosestActionIn(actions, PROBE_ACTIONS[idx]);
  }

  /**
   * 处理分类阶段逻辑
   */
  private handleClassifyPhase(): void {
    this.state.probeIndex += 1;

    // 检查贝叶斯早停条件
    if (this.shouldEarlyStop()) {
      this.classifyUserBayesian();
      // 早停视为完成探针阶段，避免后续 explore -> normal 被 probeIndex 卡死
      this.state.probeIndex = Math.max(this.state.probeIndex, PROBE_ACTIONS.length);
      this.state.phase = 'explore';
      return;
    }

    // 完成所有探测后执行贝叶斯分类
    if (this.state.probeIndex >= PROBE_ACTIONS.length) {
      this.classifyUserBayesian();
      this.state.phase = 'explore';
    }
  }

  /**
   * 判断是否应该提前停止分类（贝叶斯早停）
   */
  private shouldEarlyStop(): boolean {
    if (this.state.probeIndex < EARLY_STOP_CONFIG.minProbes) {
      return false;
    }
    const posteriors = this.computePosteriors();
    const maxPosterior = Math.max(...Object.values(posteriors));
    return maxPosterior >= EARLY_STOP_CONFIG.confidenceThreshold;
  }

  /**
   * 计算各用户类型的后验概率（贝叶斯推断）
   * 使用实例的 userTypePriors（支持全局统计覆盖）
   */
  private computePosteriors(): Record<UserType, number> {
    const userTypes: UserType[] = ['fast', 'stable', 'cautious'];
    const logPosteriors: Record<UserType, number> = {
      fast: Math.log(this.userTypePriors.fast),
      stable: Math.log(this.userTypePriors.stable),
      cautious: Math.log(this.userTypePriors.cautious),
    };

    const probeResults = this.state.results.slice(0, this.state.probeIndex);

    for (let i = 0; i < probeResults.length && i < PROBE_ACTIONS.length; i++) {
      const result = probeResults[i];
      for (const userType of userTypes) {
        const expectations = PROBE_EXPECTATIONS[userType][i];
        if (!expectations) continue;
        const [accMean, accStd, rtMean, rtStd] = expectations;
        const observedAcc = result.isCorrect ? 1 : 0;
        const accLikelihood = this.gaussianLogLikelihood(observedAcc, accMean, accStd);
        const rtLikelihood = this.gaussianLogLikelihood(result.responseTime, rtMean, rtStd);
        logPosteriors[userType] += accLikelihood + rtLikelihood;
      }
    }

    const maxLog = Math.max(...Object.values(logPosteriors));
    let sumExp = 0;
    for (const userType of userTypes) {
      sumExp += Math.exp(logPosteriors[userType] - maxLog);
    }
    const logNormalizer = maxLog + Math.log(sumExp);

    const posteriors: Record<UserType, number> = { fast: 0, stable: 0, cautious: 0 };
    for (const userType of userTypes) {
      posteriors[userType] = Math.exp(logPosteriors[userType] - logNormalizer);
    }
    return posteriors;
  }

  /**
   * 高斯分布对数似然
   */
  private gaussianLogLikelihood(x: number, mean: number, std: number): number {
    // 防止除零：确保 std > 0
    const safeStd = Math.max(std, 1e-10);
    const variance = safeStd * safeStd;
    const diff = x - mean;
    return (-0.5 * (diff * diff)) / variance;
  }

  /**
   * 基于贝叶斯后验的用户分类
   */
  private classifyUserBayesian(): void {
    const posteriors = this.computePosteriors();
    let bestType: UserType = 'stable';
    let maxPosterior = 0;

    for (const [userType, posterior] of Object.entries(posteriors) as [UserType, number][]) {
      if (posterior > maxPosterior) {
        maxPosterior = posterior;
        bestType = userType;
      }
    }

    this.state.userType = bestType;
    switch (bestType) {
      case 'fast':
        this.state.settledStrategy = this.buildFastStrategy();
        break;
      case 'stable':
        this.state.settledStrategy = this.buildStableStrategy();
        break;
      case 'cautious':
        this.state.settledStrategy = this.buildCautiousStrategy();
        break;
    }
  }

  /**
   * 执行用户分类
   *
   * 分类依据:
   * - 正确率: 探测期间的平均正确率
   * - 响应时间: 平均响应时间
   * - 错误率: 探测期间报告的平均错误率
   */
  private classifyUser(): void {
    const stats = this.computeProbeStats();

    // fast: 高正确率 + 快响应 + 低错误率
    if (
      stats.accuracy >= this.thresholds.fastAccuracy &&
      stats.avgResponseTime <= this.thresholds.fastResponseTime &&
      stats.avgErrorRate <= this.thresholds.fastErrorRate
    ) {
      this.state.userType = 'fast';
      this.state.settledStrategy = this.buildFastStrategy();
      return;
    }

    // stable: 中等正确率 + 适中响应 + 中等错误率
    if (
      stats.accuracy >= this.thresholds.stableAccuracy &&
      stats.avgResponseTime <= this.thresholds.stableResponseTime &&
      stats.avgErrorRate <= this.thresholds.stableErrorRate
    ) {
      this.state.userType = 'stable';
      this.state.settledStrategy = this.buildStableStrategy();
      return;
    }

    // cautious: 默认分类
    this.state.userType = 'cautious';
    this.state.settledStrategy = this.buildCautiousStrategy();
  }

  /**
   * 计算探测统计量
   */
  private computeProbeStats(): {
    accuracy: number;
    avgResponseTime: number;
    avgErrorRate: number;
  } {
    const probeResults = this.state.results.slice(0, PROBE_ACTIONS.length);
    const count = probeResults.length || 1;

    const correctCount = probeResults.filter((r) => r.isCorrect).length;
    const accuracy = correctCount / count;

    const totalRt = probeResults.reduce(
      (sum, r) => sum + this.clamp(r.responseTime, 100, 60000),
      0,
    );
    const avgResponseTime = totalRt / count;

    const totalError = probeResults.reduce((sum, r) => sum + this.clamp(r.errorRate, 0, 1), 0);
    const avgErrorRate = totalError / count;

    return { accuracy, avgResponseTime, avgErrorRate };
  }

  /**
   * 构建fast用户策略
   * 特点: 高挑战、快节奏、低提示
   */
  private buildFastStrategy(): StrategyParams {
    return {
      interval_scale: 1.2,
      new_ratio: 0.35,
      difficulty: 'hard',
      batch_size: 12,
      hint_level: 0,
    };
  }

  /**
   * 构建stable用户策略
   * 特点: 中等难度、适中节奏、适度提示
   */
  private buildStableStrategy(): StrategyParams {
    return {
      interval_scale: 1.0,
      new_ratio: 0.25,
      difficulty: 'mid',
      batch_size: 8,
      hint_level: 1,
    };
  }

  /**
   * 构建cautious用户策略
   * 特点: 低难度、慢节奏、高提示
   */
  private buildCautiousStrategy(): StrategyParams {
    return {
      interval_scale: 0.8,
      new_ratio: 0.15,
      difficulty: 'easy',
      batch_size: 5,
      hint_level: 2,
    };
  }

  /**
   * 在动作空间中查找最接近的动作
   */
  private findClosestActionIn(actions: Action[], strategy: StrategyParams): Action {
    if (!actions || actions.length === 0) {
      return ACTION_SPACE[0];
    }

    // 精确匹配
    const exact = actions.find(
      (a) =>
        a.interval_scale === strategy.interval_scale &&
        a.new_ratio === strategy.new_ratio &&
        a.difficulty === strategy.difficulty &&
        a.batch_size === strategy.batch_size &&
        a.hint_level === strategy.hint_level,
    );

    if (exact) {
      return exact;
    }

    // 近似匹配：找距离最小的
    let best = actions[0];
    let minDist = Infinity;

    for (const action of actions) {
      const dist = this.computeActionDistance(action, strategy);
      if (dist < minDist) {
        minDist = dist;
        best = action;
      }
    }

    return best;
  }

  /**
   * 计算动作距离（用于近似匹配）
   */
  private computeActionDistance(a: Action, b: StrategyParams): number {
    const diffScale = Math.abs(a.interval_scale - b.interval_scale);
    const diffRatio = Math.abs(a.new_ratio - b.new_ratio) * 5; // 放大权重
    const diffDifficulty = a.difficulty === b.difficulty ? 0 : 1;
    const diffBatch = Math.abs(a.batch_size - b.batch_size) / 16;
    const diffHint = Math.abs(a.hint_level - b.hint_level) / 2;

    return diffScale + diffRatio + diffDifficulty + diffBatch + diffHint;
  }

  /**
   * 计算动作评分
   */
  private computeScore(): number {
    // 冷启动策略驱动，score仅用于排序参考
    if (this.state.phase === 'classify') {
      return 0.5 + this.state.probeIndex * 0.1;
    }
    return this.state.userType === 'fast' ? 0.9 : this.state.userType === 'stable' ? 0.7 : 0.5;
  }

  /**
   * 计算置信度
   */
  private computeConfidence(context: BaseLearnerContext): number {
    // 基于进度和最近表现计算
    const progressFactor = Math.min(this.state.updateCount / EXPLORE_PHASE_THRESHOLD, 1);
    const performanceFactor = 1 - this.toNumber(context.recentErrorRate, 0.5);

    return this.clamp(0.2 + 0.6 * progressFactor + 0.2 * performanceFactor, 0, 1);
  }

  /**
   * 安全转换为数字
   */
  private toNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  /**
   * 数值截断
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * 校验非负整数
   */
  private validatePositiveInt(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return fallback;
    }
    return Math.floor(value);
  }

  /**
   * 校验探测结果数组
   */
  private validateResults(results: ProbeResult[]): ProbeResult[] {
    if (!Array.isArray(results)) {
      return [];
    }

    return results
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({
        action: r.action ?? PROBE_ACTIONS[0],
        reward: this.toNumber(r.reward, 0),
        isCorrect: Boolean(r.isCorrect),
        responseTime: this.clamp(this.toNumber(r.responseTime, 2000), 100, 60000),
        errorRate: this.clamp(this.toNumber(r.errorRate, 0.5), 0, 1),
        timestamp: this.toNumber(r.timestamp, Date.now()),
      }))
      .slice(0, MAX_RESULTS_HISTORY);
  }

  /**
   * 校验策略参数
   */
  private validateStrategy(strategy: StrategyParams | null): StrategyParams | null {
    if (!strategy || typeof strategy !== 'object') {
      return null;
    }

    // 校验必要字段
    const intervalScale = this.toNumber(strategy.interval_scale, 1.0);
    const newRatio = this.toNumber(strategy.new_ratio, 0.2);
    const batchSize = this.toNumber(strategy.batch_size, 8);
    const hintLevel = this.toNumber(strategy.hint_level, 1);

    // 校验难度
    const validDifficulties = ['easy', 'mid', 'hard'];
    const difficulty = validDifficulties.includes(strategy.difficulty)
      ? strategy.difficulty
      : 'mid';

    // 数值有效性检查
    if (
      !Number.isFinite(intervalScale) ||
      !Number.isFinite(newRatio) ||
      !Number.isFinite(batchSize) ||
      !Number.isFinite(hintLevel)
    ) {
      return null;
    }

    return {
      interval_scale: this.clamp(intervalScale, 0.5, 1.5),
      new_ratio: this.clamp(newRatio, 0.1, 0.4),
      difficulty,
      batch_size: Math.round(this.clamp(batchSize, 5, 16)),
      hint_level: Math.round(this.clamp(hintLevel, 0, 2)),
    };
  }
}

// ==================== 导出 ====================

export const defaultColdStartManager = new ColdStartManager();
