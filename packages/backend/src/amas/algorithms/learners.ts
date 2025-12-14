/**
 * AMAS 算法层 - 统一学习器模块
 *
 * 本文件整合了所有核心学习算法实现，包括：
 * - 基础学习器接口定义
 * - LinUCB (线性上置信界算法)
 * - Thompson Sampling (汤普森采样算法)
 * - Heuristic (启发式学习器)
 * - ColdStart (冷启动管理器)
 *
 * 重构说明：
 * 原 learning/ 目录下的独立文件已合并到此统一模块，
 * 通过适配器模式（adapters/）对外提供统一决策接口。
 */

import { Action, BanditModel, UserState } from '../types';
import {
  DEFAULT_ALPHA,
  DEFAULT_DIMENSION,
  DEFAULT_LAMBDA,
  ACTION_SPACE,
} from '../config/action-space';
import { amasLogger } from '../../logger';

// ==================== 工具函数导入 ====================

import {
  choleskyRank1Update,
  addOuterProduct,
  addScaledVector,
  hasInvalidValues,
} from '../learning/math-utils';

// ==================== 基础学习器接口 ====================

/**
 * 动作选择结果
 */
export interface ActionSelection<ActionType = Action> {
  /** 选中的动作 */
  action: ActionType;
  /** 动作评分（用于集成加权） */
  score: number;
  /** 置信度 [0,1]（用于探索-利用平衡） */
  confidence: number;
  /** 额外元数据（调试用） */
  meta?: Record<string, unknown>;
}

/**
 * 学习器能力描述
 */
export interface LearnerCapabilities {
  /** 是否支持在线学习 */
  supportsOnlineLearning: boolean;
  /** 是否支持批量更新 */
  supportsBatchUpdate: boolean;
  /** 是否需要预训练 */
  requiresPretraining: boolean;
  /** 最小有效样本数 */
  minSamplesForReliability: number;
  /** 主要用途描述 */
  primaryUseCase: string;
}

/**
 * 学习器上下文（基础）
 * 字段均为可选，具体学习器可扩展此接口定义必需字段
 */
export interface BaseLearnerContext {
  /** 近期错误率 [0,1] */
  recentErrorRate?: number;
  /** 近期平均反应时间(ms) */
  recentResponseTime?: number;
  /** 时间段 (0-23小时) */
  timeBucket?: number;
  /** 扩展字段 */
  [key: string]: unknown;
}

/**
 * 统一学习器接口
 */
export interface BaseLearner<
  State = UserState,
  ActionType = Action,
  Context = BaseLearnerContext,
  PersistedState = unknown,
> {
  /**
   * 选择最优动作
   */
  selectAction(state: State, actions: ActionType[], context: Context): ActionSelection<ActionType>;

  /**
   * 更新模型
   */
  update(state: State, action: ActionType, reward: number, context: Context): void;

  /**
   * 获取模型状态（用于持久化）
   */
  getState(): PersistedState;

  /**
   * 恢复模型状态
   */
  setState(state: PersistedState): void;

  /**
   * 获取学习器名称
   */
  getName(): string;

  /**
   * 获取学习器版本
   */
  getVersion(): string;

  /**
   * 获取学习器能力描述
   */
  getCapabilities(): LearnerCapabilities;

  /**
   * 获取更新次数
   */
  getUpdateCount(): number;

  /**
   * 重置模型到初始状态
   */
  reset(): void;
}

/**
 * 抽象基类，提供类型约束
 */
export abstract class AbstractBaseLearner<
  State = UserState,
  ActionType = Action,
  Context = BaseLearnerContext,
  PersistedState = unknown,
> implements BaseLearner<State, ActionType, Context, PersistedState> {
  abstract selectAction(
    state: State,
    actions: ActionType[],
    context: Context,
  ): ActionSelection<ActionType>;

  abstract update(state: State, action: ActionType, reward: number, context: Context): void;

  abstract getState(): PersistedState;
  abstract setState(state: PersistedState): void;
  abstract getName(): string;
  abstract getVersion(): string;
  abstract getCapabilities(): LearnerCapabilities;
  abstract getUpdateCount(): number;
  abstract reset(): void;
}

// ==================== LinUCB 学习器 ====================

/**
 * LinUCB上下文
 */
export interface LinUCBContext extends BaseLearnerContext {
  recentErrorRate: number;
  recentResponseTime: number;
  timeBucket: number;
}

/**
 * 特征构建输入
 */
export interface ContextBuildInput extends LinUCBContext {
  state: UserState;
  action: Action;
}

/**
 * LinUCB配置选项
 */
export interface LinUCBOptions {
  alpha?: number;
  lambda?: number;
  dimension?: number;
}

// 数值稳定常量
const MIN_LAMBDA = 1e-3;
const MIN_RANK1_DIAG = 1e-6;
const MAX_COVARIANCE = 1e9;
const MAX_FEATURE_ABS = 50;
const FEATURE_DIMENSION_V2 = 22;

// 静态校验：确保特征维度与配置常量一致
if (DEFAULT_DIMENSION !== FEATURE_DIMENSION_V2) {
  throw new Error(
    `[LinUCB] 配置不一致: DEFAULT_DIMENSION(${DEFAULT_DIMENSION}) !== FEATURE_DIMENSION_V2(${FEATURE_DIMENSION_V2})`,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 归一化难度等级
 */
function normalizeDifficulty(level: Action['difficulty']): number {
  switch (level) {
    case 'easy':
      return 0.2;
    case 'hard':
      return 0.8;
    case 'mid':
    default:
      return 0.5;
  }
}

/**
 * LinUCB 线性上置信界算法
 *
 * 重要说明：此类从 learning/linucb.ts 迁移而来，保持完整功能
 */
export class LinUCB implements BaseLearner<UserState, Action, LinUCBContext, BanditModel> {
  // 配置参数
  private alpha: number;
  private lambda: number;
  private readonly dimension: number;

  // 模型状态
  private A: Float32Array; // 协方差矩阵 (d x d)
  private b: Float32Array; // 奖励向量 (d)
  private cholL: Float32Array; // Cholesky下三角矩阵 (d x d)
  private updateCount: number;

  constructor(options: LinUCBOptions = {}) {
    this.alpha = options.alpha ?? DEFAULT_ALPHA;
    this.lambda = Math.max(options.lambda ?? DEFAULT_LAMBDA, MIN_LAMBDA);
    this.dimension = options.dimension ?? DEFAULT_DIMENSION;

    const d = this.dimension;
    const n = d * d;

    this.A = new Float32Array(n);
    this.b = new Float32Array(d);
    this.cholL = new Float32Array(n);
    this.updateCount = 0;

    // 初始化为 λI
    for (let i = 0; i < d; i++) {
      this.A[i * d + i] = this.lambda;
      this.cholL[i * d + i] = Math.sqrt(this.lambda);
    }
  }

  /**
   * 选择最优动作
   */
  selectAction(
    state: UserState,
    actions: Action[],
    context: LinUCBContext,
  ): ActionSelection<Action> {
    if (actions.length === 0) {
      throw new Error('actions array must not be empty');
    }

    let bestAction = actions[0];
    let bestScore = -Infinity;
    let bestConfidence = 0;
    let bestExploitation = 0;
    let bestExploration = 0;

    const theta = this.solveSystem(this.b);

    for (const action of actions) {
      const features = this.buildContextVector({
        state,
        action,
        recentErrorRate: context.recentErrorRate,
        recentResponseTime: context.recentResponseTime,
        timeBucket: context.timeBucket,
      });

      // exploitation = x^T θ
      let exploitation = 0;
      for (let i = 0; i < this.dimension; i++) {
        exploitation += features[i] * theta[i];
      }

      const uncertainty = this.computeUncertainty(features);
      const exploration = this.alpha * uncertainty;
      const score = exploitation + exploration;

      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
        bestConfidence = uncertainty;
        bestExploitation = exploitation;
        bestExploration = exploration;
      }
    }

    return {
      action: bestAction,
      score: bestScore,
      confidence: bestConfidence,
      meta: {
        algorithm: 'LinUCB',
        updateCount: this.updateCount,
        exploitation: bestExploitation,
        exploration: bestExploration,
      },
    };
  }

  /**
   * 更新模型（基于特征向量）
   */
  updateWithFeatureVector(features: Float32Array | number[], reward: number): void {
    const d = this.dimension;

    // 校验特征维度
    if (features.length !== d) {
      throw new Error(`[LinUCB] 特征向量维度不匹配: 期望${d}, 得到${features.length}`);
    }

    if (!Number.isFinite(reward)) {
      amasLogger.warn('[LinUCB] reward 非法（NaN/Inf），跳过更新');
      return;
    }

    const x = new Float32Array(d);
    let sanitized = false;
    let clampedAny = false;

    // 特征值裁剪（防止溢出）
    for (let i = 0; i < d; i++) {
      const raw = features[i];
      if (!Number.isFinite(raw)) {
        sanitized = true;
        x[i] = 0;
        continue;
      }
      if (raw > MAX_FEATURE_ABS || raw < -MAX_FEATURE_ABS) {
        clampedAny = true;
      }
      x[i] = clamp(raw, -MAX_FEATURE_ABS, MAX_FEATURE_ABS);
    }

    if (sanitized) {
      amasLogger.warn('[LinUCB] 特征向量包含NaN或Inf，已自动清理为0');
    }
    if (clampedAny) {
      amasLogger.warn('[LinUCB] 特征向量存在极值，已裁剪到安全范围');
    }

    // 二次保险：仍存在异常值则直接拒绝本次更新
    if (hasInvalidValues(x)) {
      amasLogger.warn('[LinUCB] 特征向量仍包含NaN或Inf，跳过更新');
      return;
    }

    const safeReward = clamp(reward, -1, 1);

    // 更新 b ← b + r·x
    addScaledVector(this.b, x, safeReward, d);

    // 更新 A ← A + x·x^T
    addOuterProduct(this.A, x, d);

    // 增量Cholesky更新
    const result = choleskyRank1Update(this.cholL, x, d);

    if (!result.success) {
      amasLogger.warn('[LinUCB] Cholesky更新失败，执行完全分解');
      this.fullCholeskyUpdate();
    }

    this.updateCount++;
  }

  /**
   * 更新模型（标准接口）
   */
  update(state: UserState, action: Action, reward: number, context: LinUCBContext): void {
    const features = this.buildContextVector({
      state,
      action,
      recentErrorRate: context.recentErrorRate,
      recentResponseTime: context.recentResponseTime,
      timeBucket: context.timeBucket,
    });

    this.updateWithFeatureVector(features, reward);
  }

  /**
   * 计算UCB分数
   */
  private computeUCB(x: Float32Array): number {
    const d = this.dimension;

    // 求解 θ = A^(-1) b（使用Cholesky分解）
    const theta = this.solveSystem(this.b);

    // 期望奖励: x^T θ
    let expectedReward = 0;
    for (let i = 0; i < d; i++) {
      expectedReward += x[i] * theta[i];
    }

    // 不确定性: sqrt(x^T A^(-1) x)
    const uncertainty = this.computeUncertainty(x);

    // UCB = 期望 + α * 不确定性
    return expectedReward + this.alpha * uncertainty;
  }

  /**
   * 计算不确定性
   */
  private computeUncertainty(x: Float32Array): number {
    const y = this.solveSystem(x);
    let sum = 0;
    for (let i = 0; i < this.dimension; i++) {
      sum += x[i] * y[i];
    }
    return Math.sqrt(Math.max(0, sum));
  }

  /**
   * 求解线性系统 A·y = x
   */
  private solveSystem(x: Float32Array): Float32Array {
    const d = this.dimension;
    const y = new Float32Array(d);

    // 前向替换: L·z = x
    for (let i = 0; i < d; i++) {
      let sum = x[i];
      for (let j = 0; j < i; j++) {
        sum -= this.cholL[i * d + j] * y[j];
      }
      const diag = this.cholL[i * d + i];
      y[i] = diag > 1e-10 ? sum / diag : 0;
    }

    // 后向替换: L^T·result = z
    const result = new Float32Array(d);
    for (let i = d - 1; i >= 0; i--) {
      let sum = y[i];
      for (let j = i + 1; j < d; j++) {
        sum -= this.cholL[j * d + i] * result[j];
      }
      const diag = this.cholL[i * d + i];
      result[i] = diag > 1e-10 ? sum / diag : 0;
    }

    return result;
  }

  /**
   * 完全Cholesky分解
   */
  private fullCholeskyUpdate(): void {
    const d = this.dimension;

    for (let i = 0; i < d; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = this.A[i * d + j];

        for (let k = 0; k < j; k++) {
          sum -= this.cholL[i * d + k] * this.cholL[j * d + k];
        }

        if (i === j) {
          this.cholL[i * d + j] = Math.sqrt(Math.max(sum, MIN_RANK1_DIAG));
        } else {
          const diag = this.cholL[j * d + j];
          this.cholL[i * d + j] = diag > 1e-10 ? sum / diag : 0;
        }
      }
    }
  }

  /**
   * 构建特征向量（22维）
   */
  buildContextVector(input: ContextBuildInput): Float32Array {
    const { state, action, recentErrorRate, recentResponseTime, timeBucket } = input;
    const features = new Float32Array(this.dimension);
    let idx = 0;

    // [0-4] 用户状态 (5维)
    features[idx++] = clamp(state.A, 0, 1);
    features[idx++] = clamp(state.F, 0, 1);
    features[idx++] = clamp(state.C.mem, 0, 1);
    features[idx++] = clamp(state.C.speed, 0, 1);
    features[idx++] = clamp(state.M, -1, 1);

    // [5] 错误率 (1维)
    features[idx++] = clamp(recentErrorRate, 0, 1);

    // [6-10] 动作参数 (5维)
    features[idx++] = clamp(action.interval_scale, 0.5, 2.0);
    features[idx++] = clamp(action.new_ratio, 0, 1);
    features[idx++] = normalizeDifficulty(action.difficulty);
    features[idx++] = clamp(action.batch_size / 20, 0.5, 1.5);
    features[idx++] = clamp(action.hint_level / 3, 0, 1);

    // [11] 交互项: 疲劳 × 间隔 (1维)
    features[idx++] = state.F * action.interval_scale;

    // [12-14] 时间特征 (3维)
    const hourNorm = timeBucket / 24;
    features[idx++] = Math.sin(2 * Math.PI * hourNorm);
    features[idx++] = Math.cos(2 * Math.PI * hourNorm);
    features[idx++] = hourNorm > 0.33 && hourNorm < 0.75 ? 1 : 0;

    // [15-20] 处理键 (6维)
    const rtNorm = clamp((recentResponseTime - 1000) / 3000, 0, 1);
    features[idx++] = recentErrorRate * state.F;
    features[idx++] = recentErrorRate * action.interval_scale;
    features[idx++] = rtNorm * state.A;
    features[idx++] = state.C.mem * (action.difficulty === 'hard' ? 0.8 : 0.2);
    features[idx++] = state.M * action.new_ratio;
    features[idx++] = ((1 - state.A) * action.hint_level) / 3;

    // [21] bias项 (1维)
    features[idx++] = 1.0;

    return features;
  }

  // ==================== BaseLearner接口实现 ====================

  getState(): BanditModel {
    return {
      A: this.A,
      b: this.b,
      L: this.cholL,
      updateCount: this.updateCount,
      alpha: this.alpha,
      lambda: this.lambda,
      d: this.dimension,
    };
  }

  setState(state: BanditModel): void {
    if (state.d === this.dimension) {
      this.A = new Float32Array(state.A);
      this.b = new Float32Array(state.b);
      this.cholL = new Float32Array(state.L);
      this.updateCount = state.updateCount ?? 0;
      this.alpha = state.alpha;
      this.lambda = state.lambda;
      return;
    }

    // 升维：保留旧状态并初始化新增维度（用于历史模型迁移）
    if (state.d < this.dimension) {
      const from = state.d;
      const to = this.dimension;

      const oldA = new Float32Array(state.A);
      const oldB = new Float32Array(state.b);

      this.alpha = state.alpha;
      this.lambda = state.lambda;
      this.updateCount = state.updateCount ?? 0;

      const d = this.dimension;
      const n = d * d;
      const nextA = new Float32Array(n);
      const nextB = new Float32Array(d);
      this.cholL = new Float32Array(n);

      // 初始化为 λI
      for (let i = 0; i < d; i++) {
        nextA[i * d + i] = this.lambda;
      }

      // 拷贝旧矩阵到左上角
      for (let i = 0; i < from; i++) {
        nextB[i] = oldB[i] ?? 0;
        for (let j = 0; j < from; j++) {
          nextA[i * d + j] = oldA[i * from + j] ?? 0;
        }
      }

      this.A = nextA;
      this.b = nextB;
      this.fullCholeskyUpdate();

      amasLogger.debug({ from, to }, '[LinUCB] 模型已升维迁移');
      return;
    }

    // 降维：不支持，直接重置
    amasLogger.warn({ from: state.d, to: this.dimension }, '[LinUCB] 降维不支持，已重置模型');
    this.reset();
  }

  getName(): string {
    return 'LinUCB';
  }

  getVersion(): string {
    return '2.0.0';
  }

  getCapabilities(): LearnerCapabilities {
    return {
      supportsOnlineLearning: true,
      supportsBatchUpdate: true,
      requiresPretraining: false,
      minSamplesForReliability: 50,
      primaryUseCase: '高维特征空间的在线学习',
    };
  }

  getUpdateCount(): number {
    return this.updateCount;
  }

  setAlpha(alpha: number): void {
    this.alpha = Math.max(alpha, 0);
  }

  getAlpha(): number {
    return this.alpha;
  }

  /**
   * 获取冷启动阶段的探索率
   */
  getColdStartAlpha(interactionCount: number, recentAccuracy: number, fatigue: number): number {
    if (interactionCount < 15) {
      return 0.5; // 低探索，安全策略
    }
    if (interactionCount < 50) {
      // 表现触发探索
      return recentAccuracy > 0.75 && fatigue < 0.5 ? 2.0 : 1.0;
    }
    return 0.7; // 正常运行
  }

  /**
   * 获取模型状态（用于持久化）- 兼容性方法
   */
  getModel(): BanditModel {
    return this.getState();
  }

  /**
   * 恢复模型状态 - 兼容性方法
   */
  setModel(model: BanditModel): void {
    this.setState(model);
  }

  reset(): void {
    const d = this.dimension;
    const n = d * d;

    this.A.fill(0);
    this.b.fill(0);
    this.cholL.fill(0);

    for (let i = 0; i < d; i++) {
      this.A[i * d + i] = this.lambda;
      this.cholL[i * d + i] = Math.sqrt(this.lambda);
    }

    this.updateCount = 0;
  }
}

/**
 * 默认LinUCB实例
 */
export const defaultLinUCB = new LinUCB();

// ==================== Thompson Sampling 学习器 ====================

/**
 * Beta分布参数
 */
interface BetaParams {
  alpha: number;
  beta: number;
}

/**
 * Thompson Sampling上下文
 */
export interface ThompsonContext extends BaseLearnerContext {
  recentErrorRate: number;
  recentResponseTime: number;
  timeBucket: number;
}

/**
 * 持久化状态结构
 */
export interface ThompsonSamplingState {
  version: string;
  priorAlpha: number;
  priorBeta: number;
  updateCount: number;
  global: Record<string, BetaParams>;
  contextual: Record<string, Record<string, BetaParams>>;
}

/**
 * 配置选项
 */
export interface ThompsonSamplingOptions {
  priorAlpha?: number;
  priorBeta?: number;
  minContextWeight?: number;
  maxContextWeight?: number;
  enableSoftUpdate?: boolean;
}

// 常量
const EPSILON = 1e-10;
const CONFIDENCE_SCALE = 20;
const RESPONSE_TIME_RANGE = { min: 50, max: 10000 };
const BUCKET_CONFIG = {
  errorRate: { bins: 3, range: [0, 1] as [number, number] },
  responseTime: { bins: 3, range: [50, 10000] as [number, number] },
  timeBucket: { bins: 4, range: [0, 24] as [number, number] },
};

/**
 * Thompson Sampling 汤普森采样算法
 *
 * 重要说明：此类从 learning/thompson-sampling.ts 迁移而来，保持完整功能
 */
export class ThompsonSampling implements BaseLearner<
  UserState,
  Action,
  ThompsonContext,
  ThompsonSamplingState
> {
  private readonly priorAlpha: number;
  private readonly priorBeta: number;
  private readonly minContextWeight: number;
  private readonly maxContextWeight: number;
  private readonly enableSoftUpdate: boolean;

  private updateCount: number;
  private global: Map<string, BetaParams>;
  private contextual: Map<string, Map<string, BetaParams>>;

  constructor(options: ThompsonSamplingOptions = {}) {
    this.priorAlpha = options.priorAlpha ?? 1;
    this.priorBeta = options.priorBeta ?? 1;
    this.minContextWeight = options.minContextWeight ?? 0.3;
    this.maxContextWeight = options.maxContextWeight ?? 0.7;
    this.enableSoftUpdate = options.enableSoftUpdate ?? false;

    this.updateCount = 0;
    this.global = new Map();
    this.contextual = new Map();
  }

  /**
   * 选择最优动作
   */
  selectAction(
    state: UserState,
    actions: Action[],
    context: ThompsonContext,
  ): ActionSelection<Action> {
    if (actions.length === 0) {
      throw new Error('动作列表不能为空');
    }

    const contextKey = this.buildContextKey(state, context);
    let bestAction = actions[0];
    let bestSample = -Infinity;
    let bestActionKey = this.serializeAction(actions[0]);

    for (const action of actions) {
      const actionKey = this.serializeAction(action);
      this.ensureParams(actionKey, contextKey);
      const sample = this.sampleBeta(actionKey, contextKey);

      if (sample > bestSample) {
        bestSample = sample;
        bestAction = action;
        bestActionKey = actionKey;
      }
    }

    const confidence = this.computeConfidence(bestAction, contextKey);

    return {
      action: bestAction,
      score: bestSample,
      confidence,
      meta: {
        algorithm: 'ThompsonSampling',
        updateCount: this.updateCount,
        actionKey: bestActionKey,
        contextKey,
      },
    };
  }

  /**
   * 更新模型
   */
  update(state: UserState, action: Action, reward: number, context: ThompsonContext): void {
    const actionKey = this.serializeAction(action);
    const contextKey = this.buildContextKey(state, context);

    // 更新全局参数
    this.updateBeta(actionKey, reward, this.global);

    // 更新上下文参数
    if (!this.contextual.has(actionKey)) {
      this.contextual.set(actionKey, new Map());
    }
    const contextMap = this.contextual.get(actionKey)!;
    this.updateBeta(contextKey, reward, contextMap);

    this.updateCount++;
  }

  /**
   * 从Beta分布采样
   */
  private sampleBeta(actionKey: string, contextKey: string): number {
    // 全局参数
    const globalParams = this.global.get(actionKey) ?? {
      alpha: this.priorAlpha,
      beta: this.priorBeta,
    };

    // 上下文参数
    const contextMap = this.contextual.get(actionKey);
    const contextParams = contextMap?.get(contextKey) ?? {
      alpha: this.priorAlpha,
      beta: this.priorBeta,
    };

    // 采样
    const globalSample = this.betaSample(globalParams.alpha, globalParams.beta);
    const contextSample = this.betaSample(contextParams.alpha, contextParams.beta);

    // 自适应加权
    const contextTotal = contextParams.alpha + contextParams.beta;
    const weight = this.computeContextWeight(contextTotal);

    return weight * contextSample + (1 - weight) * globalSample;
  }

  /**
   * Beta分布采样（使用Gamma近似）
   */
  private betaSample(alpha: number, beta: number): number {
    const x = this.gammaSample(alpha);
    const y = this.gammaSample(beta);
    return x / (x + y + EPSILON);
  }

  /**
   * Gamma分布采样（使用Marsaglia-Tsang方法）
   */
  private gammaSample(shape: number): number {
    if (shape < 1) {
      return this.gammaSample(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x: number;
      let v: number;

      do {
        x = this.normalSample();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();
      const x2 = x * x;

      if (u < 1 - 0.0331 * x2 * x2) {
        return d * v;
      }

      if (Math.log(u) < 0.5 * x2 + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }
  }

  /**
   * 标准正态分布采样（Box-Muller变换）
   */
  private normalSample(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * 更新Beta参数
   */
  private updateBeta(key: string, reward: number, map: Map<string, BetaParams>): void {
    const params = map.get(key) ?? {
      alpha: this.priorAlpha,
      beta: this.priorBeta,
    };

    if (this.enableSoftUpdate) {
      // 软更新：将 reward ∈ [-1,1] 映射到 p ∈ [0,1]
      const safeReward = Number.isFinite(reward) ? reward : 0;
      const p = clamp((safeReward + 1) / 2, 0, 1);
      params.alpha += p;
      params.beta += 1 - p;
    } else {
      // 二值化更新
      if (reward >= 0.5) {
        params.alpha += 1;
      } else {
        params.beta += 1;
      }
    }

    map.set(key, params);
  }

  /**
   * 计算上下文权重
   */
  private computeContextWeight(contextTotal: number): number {
    const raw = contextTotal / (contextTotal + CONFIDENCE_SCALE);
    return clamp(raw, this.minContextWeight, this.maxContextWeight);
  }

  /**
   * 计算置信度
   */
  private computeConfidence(action: Action, contextKey: string): number {
    const actionKey = this.serializeAction(action);
    const contextMap = this.contextual.get(actionKey);
    const params = contextMap?.get(contextKey) ?? {
      alpha: this.priorAlpha,
      beta: this.priorBeta,
    };

    const total = params.alpha + params.beta;
    const mean = params.alpha / total;
    const variance = (params.alpha * params.beta) / (total * total * (total + 1));
    const uncertainty = Math.sqrt(variance);

    return mean * (1 - uncertainty);
  }

  /**
   * 构建上下文键
   */
  private buildContextKey(state: UserState, context: ThompsonContext): string {
    const errorBucket = this.bucketize(context.recentErrorRate, BUCKET_CONFIG.errorRate);
    const rtBucket = this.bucketize(context.recentResponseTime, BUCKET_CONFIG.responseTime);
    const timeBucket = this.bucketize(context.timeBucket, BUCKET_CONFIG.timeBucket);

    return `e${errorBucket}_r${rtBucket}_t${timeBucket}`;
  }

  /**
   * 桶化
   */
  private bucketize(value: number, config: { bins: number; range: [number, number] }): number {
    if (!Number.isFinite(value)) return 0;
    const { bins, range } = config;
    const [min, max] = range;
    const normalized = (value - min) / (max - min);
    return Math.floor(clamp(normalized, 0, 0.999) * bins);
  }

  /**
   * 序列化动作
   */
  private serializeAction(action: Action): string {
    return `i${action.interval_scale}_n${action.new_ratio}_d${action.difficulty}_b${action.batch_size}_h${action.hint_level}`;
  }

  private ensureParams(actionKey: string, contextKey: string): void {
    if (!this.global.has(actionKey)) {
      this.global.set(actionKey, { alpha: this.priorAlpha, beta: this.priorBeta });
    }
    if (!this.contextual.has(actionKey)) {
      this.contextual.set(actionKey, new Map());
    }
    const contextMap = this.contextual.get(actionKey)!;
    if (!contextMap.has(contextKey)) {
      contextMap.set(contextKey, { alpha: this.priorAlpha, beta: this.priorBeta });
    }
  }

  // ==================== BaseLearner接口实现 ====================

  getState(): ThompsonSamplingState {
    const global: Record<string, BetaParams> = {};
    this.global.forEach((value, key) => {
      global[key] = { ...value };
    });

    const contextual: Record<string, Record<string, BetaParams>> = {};
    this.contextual.forEach((contextMap, actionKey) => {
      contextual[actionKey] = {};
      contextMap.forEach((value, contextKey) => {
        contextual[actionKey][contextKey] = { ...value };
      });
    });

    return {
      version: '1.0.0',
      priorAlpha: this.priorAlpha,
      priorBeta: this.priorBeta,
      updateCount: this.updateCount,
      global,
      contextual,
    };
  }

  setState(state: ThompsonSamplingState): void {
    this.updateCount = state.updateCount;

    this.global.clear();
    Object.entries(state.global).forEach(([key, value]) => {
      this.global.set(key, { ...value });
    });

    this.contextual.clear();
    Object.entries(state.contextual).forEach(([actionKey, contextMap]) => {
      const newContextMap = new Map<string, BetaParams>();
      Object.entries(contextMap).forEach(([contextKey, value]) => {
        newContextMap.set(contextKey, { ...value });
      });
      this.contextual.set(actionKey, newContextMap);
    });
  }

  getName(): string {
    return 'ThompsonSampling';
  }

  getVersion(): string {
    return '1.0.0';
  }

  getCapabilities(): LearnerCapabilities {
    return {
      supportsOnlineLearning: true,
      supportsBatchUpdate: false,
      requiresPretraining: false,
      minSamplesForReliability: 5,
      primaryUseCase: '快速探索和概率匹配',
    };
  }

  getUpdateCount(): number {
    return this.updateCount;
  }

  getExpectedReward(action: Action): number {
    const actionKey = this.serializeAction(action);
    const params = this.global.get(actionKey) ?? {
      alpha: this.priorAlpha,
      beta: this.priorBeta,
    };
    return params.alpha / (params.alpha + params.beta);
  }

  getSampleCount(action: Action): number {
    const actionKey = this.serializeAction(action);
    const params = this.global.get(actionKey) ?? {
      alpha: this.priorAlpha,
      beta: this.priorBeta,
    };
    return params.alpha + params.beta - this.priorAlpha - this.priorBeta;
  }

  reset(): void {
    this.global.clear();
    this.contextual.clear();
    this.updateCount = 0;
  }
}

/**
 * 默认Thompson Sampling实例
 */
export const defaultThompsonSampling = new ThompsonSampling();
