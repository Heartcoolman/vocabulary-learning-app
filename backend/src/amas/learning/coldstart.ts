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

import {
  Action,
  StrategyParams,
  UserState,
  UserType,
  ColdStartPhase
} from '../types';
import {
  ACTION_SPACE,
  CLASSIFY_PHASE_THRESHOLD,
  EXPLORE_PHASE_THRESHOLD,
  DEFAULT_STRATEGY,
  COLD_START_STRATEGY
} from '../config/action-space';
import {
  ActionSelection,
  BaseLearner,
  BaseLearnerContext,
  LearnerCapabilities
} from './base-learner';

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
 * 5个探测动作设计
 *
 * 每个动作针对特定维度:
 * 1. 极易模式: 测试基础能力下限
 * 2. 标准模式: 测试正常学习能力
 * 3. 挑战模式: 测试能力上限
 * 4. 高负载: 测试疲劳耐受度
 * 5. 短间隔: 测试遗忘曲线
 */
const PROBE_ACTIONS: Action[] = [
  // 极易模式：低难度、低负载、高提示
  {
    interval_scale: 0.5,
    new_ratio: 0.1,
    difficulty: 'easy',
    batch_size: 5,
    hint_level: 2
  },
  // 标准模式：中等难度、标准配置
  {
    interval_scale: 1.0,
    new_ratio: 0.2,
    difficulty: 'mid',
    batch_size: 8,
    hint_level: 1
  },
  // 挑战模式：高难度、无提示
  {
    interval_scale: 1.2,
    new_ratio: 0.4,
    difficulty: 'hard',
    batch_size: 12,
    hint_level: 0
  },
  // 高负载：大批量、长间隔
  {
    interval_scale: 1.5,
    new_ratio: 0.3,
    difficulty: 'mid',
    batch_size: 16,
    hint_level: 0
  },
  // 短间隔：测试遗忘曲线
  {
    interval_scale: 0.5,
    new_ratio: 0.3,
    difficulty: 'mid',
    batch_size: 8,
    hint_level: 1
  }
];

/** 默认分类阈值 */
const DEFAULT_THRESHOLDS: ClassificationThresholds = {
  fastAccuracy: 0.8,
  fastResponseTime: 1500,
  fastErrorRate: 0.2,
  stableAccuracy: 0.6,
  stableResponseTime: 3000,
  stableErrorRate: 0.35
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
export class ColdStartManager
  implements BaseLearner<UserState, Action, BaseLearnerContext, ColdStartState>
{
  private static readonly NAME = 'ColdStartManager';
  private static readonly VERSION = '1.0.0';

  /** 分类阈值配置 */
  private readonly thresholds: ClassificationThresholds;

  /** 内部状态 */
  private state: ColdStartState = this.createInitialState();

  constructor(thresholds?: Partial<ClassificationThresholds>) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  // ==================== BaseLearner接口实现 ====================

  /**
   * 选择动作
   *
   * 策略:
   * - classify阶段: 按顺序执行探测动作
   * - explore阶段: 使用分类后的收敛策略
   * - normal阶段: 返回收敛策略或默认策略
   */
  selectAction(
    _state: UserState,
    actions: Action[],
    context: BaseLearnerContext
  ): ActionSelection<Action> {
    // 保持与其他学习器一致的 API 行为
    if (!actions || actions.length === 0) {
      throw new Error('Action list cannot be empty');
    }

    const action = this.determineNextAction();
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
        settledStrategy: this.state.settledStrategy
      }
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
  update(
    _state: UserState,
    action: Action,
    reward: number,
    context: BaseLearnerContext
  ): void {
    // 正确性判断：使用更严格的阈值，避免连续reward信号误判
    // 当errorRate可用时，优先使用errorRate（低于0.5视为正确）
    // 否则使用reward阈值（>= 0.5视为正确，适应连续奖励场景）
    const recentErrorRate = this.toNumber(context.recentErrorRate, 0.5);
    const isCorrect = recentErrorRate < 0.5 || reward >= 0.5;

    const result: ProbeResult = {
      action,
      reward,
      isCorrect,
      responseTime: this.toNumber(context.recentResponseTime, 2000),
      errorRate: recentErrorRate,
      timestamp: Date.now()
    };

    // 记录结果（限制历史长度）
    this.state.results.push(result);
    if (this.state.results.length > MAX_RESULTS_HISTORY) {
      // 保留前PROBE_ACTIONS.length条（分类依据）+ 最近滚动窗口
      const probeCount = PROBE_ACTIONS.length;
      const keepRecent = MAX_RESULTS_HISTORY - probeCount;
      this.state.results = [
        ...this.state.results.slice(0, probeCount),
        ...this.state.results.slice(-keepRecent)
      ];
    }
    this.state.updateCount += 1;

    // 分类阶段逻辑
    if (this.state.phase === 'classify') {
      this.handleClassifyPhase();
    }

    // 探索阶段转换检查
    // 增加条件：探针完成 + 样本数达标 + 有收敛策略
    if (
      this.state.phase === 'explore' &&
      this.state.updateCount >= EXPLORE_PHASE_THRESHOLD &&
      this.state.probeIndex >= PROBE_ACTIONS.length &&
      this.state.settledStrategy !== null
    ) {
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
      results: this.state.results.map(r => ({ ...r })),
      settledStrategy: this.state.settledStrategy
        ? { ...this.state.settledStrategy }
        : null,
      updateCount: this.state.updateCount
    };
  }

  /**
   * 恢复状态（带数值校验）
   */
  setState(state: ColdStartState): void {
    if (!state) {
      console.warn('[ColdStartManager] 无效状态，跳过恢复');
      return;
    }

    // 校验并恢复phase
    const validPhases: ColdStartPhase[] = ['classify', 'explore', 'normal'];
    const phase = validPhases.includes(state.phase) ? state.phase : 'classify';

    // 校验并恢复userType
    const validUserTypes: (UserType | null)[] = ['fast', 'stable', 'cautious', null];
    const userType = validUserTypes.includes(state.userType)
      ? state.userType
      : null;

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
      updateCount
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
      primaryUseCase: '新用户冷启动探测与快速分类'
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
      return this.state.probeIndex / PROBE_ACTIONS.length * 0.5;
    }
    if (this.state.phase === 'explore') {
      const exploreProgress =
        (this.state.updateCount - PROBE_ACTIONS.length) /
        (EXPLORE_PHASE_THRESHOLD - PROBE_ACTIONS.length);
      return 0.5 + Math.min(exploreProgress, 1) * 0.5;
    }
    return 1;
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
      updateCount: 0
    };
  }

  /**
   * 确定下一个动作
   */
  private determineNextAction(): Action {
    // 分类阶段：按顺序执行探测动作
    if (
      this.state.phase === 'classify' &&
      this.state.probeIndex < PROBE_ACTIONS.length
    ) {
      return PROBE_ACTIONS[this.state.probeIndex];
    }

    // 有收敛策略时使用
    if (this.state.settledStrategy) {
      return this.findClosestAction(this.state.settledStrategy);
    }

    // 超过分类阈值但未分类：使用安全默认策略
    if (this.state.updateCount >= CLASSIFY_PHASE_THRESHOLD) {
      return this.findClosestAction(DEFAULT_STRATEGY);
    }

    // 继续循环探测（理论上不应进入此分支）
    const idx = this.state.probeIndex % PROBE_ACTIONS.length;
    return PROBE_ACTIONS[idx];
  }

  /**
   * 处理分类阶段逻辑
   */
  private handleClassifyPhase(): void {
    this.state.probeIndex += 1;

    // 完成所有探测后执行分类
    if (this.state.probeIndex >= PROBE_ACTIONS.length) {
      this.classifyUser();
      this.state.phase = 'explore';
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

    const correctCount = probeResults.filter(r => r.isCorrect).length;
    const accuracy = correctCount / count;

    const totalRt = probeResults.reduce(
      (sum, r) => sum + this.clamp(r.responseTime, 100, 60000),
      0
    );
    const avgResponseTime = totalRt / count;

    const totalError = probeResults.reduce(
      (sum, r) => sum + this.clamp(r.errorRate, 0, 1),
      0
    );
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
      hint_level: 0
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
      hint_level: 1
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
      hint_level: 2
    };
  }

  /**
   * 在动作空间中查找最接近的动作
   */
  private findClosestAction(strategy: StrategyParams): Action {
    // 精确匹配
    const exact = ACTION_SPACE.find(
      a =>
        a.interval_scale === strategy.interval_scale &&
        a.new_ratio === strategy.new_ratio &&
        a.difficulty === strategy.difficulty &&
        a.batch_size === strategy.batch_size &&
        a.hint_level === strategy.hint_level
    );

    if (exact) {
      return exact;
    }

    // 近似匹配：找距离最小的
    let best = ACTION_SPACE[0];
    let minDist = Infinity;

    for (const action of ACTION_SPACE) {
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
    return this.state.userType === 'fast'
      ? 0.9
      : this.state.userType === 'stable'
        ? 0.7
        : 0.5;
  }

  /**
   * 计算置信度
   */
  private computeConfidence(context: BaseLearnerContext): number {
    // 基于进度和最近表现计算
    const progressFactor = Math.min(
      this.state.updateCount / EXPLORE_PHASE_THRESHOLD,
      1
    );
    const performanceFactor =
      1 - this.toNumber(context.recentErrorRate, 0.5);

    return this.clamp(
      0.2 + 0.6 * progressFactor + 0.2 * performanceFactor,
      0,
      1
    );
  }

  /**
   * 安全转换为数字
   */
  private toNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : fallback;
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
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0
    ) {
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
      .filter(r => r && typeof r === 'object')
      .map(r => ({
        action: r.action ?? PROBE_ACTIONS[0],
        reward: this.toNumber(r.reward, 0),
        isCorrect: Boolean(r.isCorrect),
        responseTime: this.clamp(this.toNumber(r.responseTime, 2000), 100, 60000),
        errorRate: this.clamp(this.toNumber(r.errorRate, 0.5), 0, 1),
        timestamp: this.toNumber(r.timestamp, Date.now())
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
      hint_level: Math.round(this.clamp(hintLevel, 0, 2))
    };
  }
}

// ==================== 导出 ====================

export const defaultColdStartManager = new ColdStartManager();
