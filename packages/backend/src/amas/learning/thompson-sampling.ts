/**
 * AMAS Learning Layer - Thompson Sampling Algorithm
 * Thompson采样算法（上下文感知版）
 *
 * 核心原理:
 * - 为每个动作维护Beta分布参数 (α, β)
 * - 选择时从Beta(α, β)采样，选择采样值最大的动作
 * - 反馈正确 → α+1，错误 → β+1
 * - 支持全局和上下文两层参数，实现个性化决策
 *
 * 特点:
 * - 自然的探索-利用平衡（概率匹配）
 * - 冷启动友好（先验分布引导）
 * - 计算高效 O(|A|) 时间复杂度
 */

import { Action, UserState } from '../types';
import {
  ActionSelection,
  BaseLearner,
  BaseLearnerContext,
  LearnerCapabilities
} from './base-learner';
import { amasLogger } from '../../logger';

// ==================== 类型定义 ====================

/**
 * Beta分布参数
 */
interface BetaParams {
  /** 成功次数 (α >= 0) */
  alpha: number;
  /** 失败次数 (β >= 0) */
  beta: number;
}

/**
 * Thompson Sampling上下文（扩展基础上下文）
 */
export interface ThompsonContext extends BaseLearnerContext {
  /** 近期错误率 [0,1] */
  recentErrorRate: number;
  /** 近期平均响应时间 (ms) */
  recentResponseTime: number;
  /** 时间段 [0,23小时] */
  timeBucket: number;
}

/**
 * 持久化状态结构
 */
export interface ThompsonSamplingState {
  /** 版本号（用于迁移） */
  version: string;
  /** 先验α */
  priorAlpha: number;
  /** 先验β */
  priorBeta: number;
  /** 更新总次数 */
  updateCount: number;
  /** 全局层Beta参数（按动作键索引） */
  global: Record<string, BetaParams>;
  /** 上下文层Beta参数（按动作键+上下文键索引） */
  contextual: Record<string, Record<string, BetaParams>>;
}

/**
 * 配置选项
 */
export interface ThompsonSamplingOptions {
  /** 先验α（默认1，无信息先验） */
  priorAlpha?: number;
  /** 先验β（默认1，无信息先验） */
  priorBeta?: number;
  /** 上下文权重下限 */
  minContextWeight?: number;
  /** 上下文权重上限 */
  maxContextWeight?: number;
  /**
   * 启用软更新模式（默认false）
   * - false: 二值化更新，reward >= 0.5 → α+1，否则 β+1
   * - true: 软更新，α += reward, β += (1 - reward)，保留梯度信息
   */
  enableSoftUpdate?: boolean;
}

// ==================== 常量 ====================

/** 数值稳定性：最小正数 */
const EPSILON = 1e-10;

/** 置信度归一化因子 */
const CONFIDENCE_SCALE = 20;

/** 响应时间范围 */
const RESPONSE_TIME_RANGE = { min: 50, max: 10000 };

/** 上下文桶化配置 */
const BUCKET_CONFIG = {
  errorRate: { step: 0.05, min: 0, max: 1 },
  responseTime: { step: 500, min: RESPONSE_TIME_RANGE.min, max: RESPONSE_TIME_RANGE.max },
  attention: { step: 0.1, min: 0, max: 1 },
  fatigue: { step: 0.1, min: 0, max: 1 },
  motivation: { step: 0.1, min: 0, max: 1 }
} as const;

/** Gamma采样最大递归深度 */
const MAX_GAMMA_RECURSION = 10;

// ==================== 实现 ====================

/**
 * Thompson Sampling算法
 *
 * 适用场景:
 * - 冷启动阶段的高效探索
 * - 二元反馈（正确/错误）的学习任务
 * - 需要自然探索-利用平衡的场景
 */
export class ThompsonSampling
  implements BaseLearner<UserState, Action, ThompsonContext, ThompsonSamplingState>
{
  private static readonly NAME = 'ThompsonSampling';
  private static readonly VERSION = '1.0.0';

  /** 先验参数 */
  private readonly priorAlpha: number;
  private readonly priorBeta: number;

  /** 上下文混合权重范围 */
  private readonly minContextWeight: number;
  private readonly maxContextWeight: number;

  /** 是否启用软更新模式 */
  private readonly enableSoftUpdate: boolean;

  /** 全局层Beta参数 */
  private global: Record<string, BetaParams> = {};

  /** 上下文层Beta参数 */
  private contextual: Record<string, Record<string, BetaParams>> = {};

  /** 更新计数器 */
  private updateCount = 0;

  constructor(options: ThompsonSamplingOptions = {}) {
    // 确保先验参数为正数
    this.priorAlpha = Math.max(EPSILON, options.priorAlpha ?? 1);
    this.priorBeta = Math.max(EPSILON, options.priorBeta ?? 1);
    this.minContextWeight = options.minContextWeight ?? 0.35;
    this.maxContextWeight = options.maxContextWeight ?? 0.75;
    this.enableSoftUpdate = options.enableSoftUpdate ?? false;
  }

  // ==================== BaseLearner接口实现 ====================

  /**
   * 选择最优动作
   *
   * 算法流程:
   * 1. 对每个动作，获取全局和上下文Beta参数
   * 2. 从两个Beta分布分别采样
   * 3. 根据数据量动态混合两个采样值
   * 4. 选择混合值最大的动作
   */
  selectAction(
    state: UserState,
    actions: Action[],
    context: ThompsonContext
  ): ActionSelection<Action> {
    if (!actions || actions.length === 0) {
      throw new Error('[ThompsonSampling] 动作列表不能为空');
    }

    const safeContext = this.normalizeContext(context);
    let bestSelection: ActionSelection<Action> | null = null;

    for (const action of actions) {
      const actionKey = this.buildActionKey(action);
      const contextKey = this.buildContextKey(state, safeContext);

      // 获取或初始化Beta参数
      const globalParams = this.ensureGlobalParams(actionKey);
      const contextualParams = this.ensureContextualParams(actionKey, contextKey);

      // 从Beta分布采样
      const globalSample = this.sampleBeta(globalParams.alpha, globalParams.beta);
      const contextualSample = this.sampleBeta(
        contextualParams.alpha,
        contextualParams.beta
      );

      // 混合采样值
      const score = this.blendSamples(
        globalSample,
        contextualSample,
        globalParams,
        contextualParams
      );

      // 计算置信度
      const confidence = this.computeConfidence(globalParams, contextualParams);

      if (!bestSelection || score > bestSelection.score) {
        bestSelection = {
          action,
          score,
          confidence,
          meta: {
            actionKey,
            contextKey,
            globalAlpha: globalParams.alpha,
            globalBeta: globalParams.beta,
            contextualAlpha: contextualParams.alpha,
            contextualBeta: contextualParams.beta,
            globalSample,
            contextualSample
          }
        };
      }
    }

    // 回退保护
    return bestSelection ?? {
      action: actions[0],
      score: 0,
      confidence: 0
    };
  }

  /**
   * 更新模型
   *
   * @param reward 奖励值:
   *   - 二值化模式(默认): >=0视为成功(α+1), <0视为失败(β+1)
   *     以0为分界点，正面表现（包括0-0.5的微弱正反馈）都被视为成功
   *   - 软更新模式: α += (reward+1)/2, β += (1-reward)/2，保留梯度信息
   */
  update(
    state: UserState,
    action: Action,
    reward: number,
    context: ThompsonContext
  ): void {
    const actionKey = this.buildActionKey(action);
    const safeContext = this.normalizeContext(context);
    const contextKey = this.buildContextKey(state, safeContext);

    const globalParams = this.ensureGlobalParams(actionKey);
    const contextualParams = this.ensureContextualParams(actionKey, contextKey);

    // 确保奖励值在有效范围内 [-1, 1]
    const safeReward = this.clamp(reward, -1, 1);

    if (this.enableSoftUpdate) {
      // 软更新模式：保留连续奖励的梯度信息
      // 将 reward 从 [-1,1] 映射到 [0,1] 以支持负奖励
      // α += (reward+1)/2 表示成功程度，β += (1-reward)/2 表示失败程度
      // 例如: reward=0.7 → α+=0.85, β+=0.15
      //       reward=-0.5 → α+=0.25, β+=0.75
      const normalizedReward = (safeReward + 1) / 2;
      globalParams.alpha += normalizedReward;
      globalParams.beta += (1 - normalizedReward);
      contextualParams.alpha += normalizedReward;
      contextualParams.beta += (1 - normalizedReward);
    } else {
      // 二值化更新模式(默认): reward >= 0 视为成功，< 0 视为失败
      // 以0为分界点，这样0-0.5的正面表现也被视为成功
      // 避免将微弱的正反馈错误地判断为失败
      if (safeReward >= 0) {
        globalParams.alpha += 1;
        contextualParams.alpha += 1;
      } else {
        globalParams.beta += 1;
        contextualParams.beta += 1;
      }
    }

    this.updateCount += 1;
  }

  /**
   * 获取模型状态（用于持久化）
   */
  getState(): ThompsonSamplingState {
    return {
      version: ThompsonSampling.VERSION,
      priorAlpha: this.priorAlpha,
      priorBeta: this.priorBeta,
      updateCount: this.updateCount,
      global: this.cloneGlobalParams(),
      contextual: this.cloneContextualParams()
    };
  }

  /**
   * 恢复模型状态
   *
   * 注意: 先验参数校验和数值有效性检查
   * 当先验参数不匹配时，按差额调整已存储的参数
   */
  setState(state: ThompsonSamplingState): void {
    if (!state) {
      amasLogger.warn('[ThompsonSampling] 无效状态，跳过恢复');
      return;
    }

    // 版本兼容性检查
    if (state.version !== ThompsonSampling.VERSION) {
      amasLogger.debug({ from: state.version, to: ThompsonSampling.VERSION }, '[ThompsonSampling] 版本迁移');
    }

    // 先验参数一致性检查
    const priorMismatch =
      state.priorAlpha !== this.priorAlpha ||
      state.priorBeta !== this.priorBeta;

    // 计算先验差额（用于迁移）
    const alphaDelta = this.priorAlpha - (state.priorAlpha ?? this.priorAlpha);
    const betaDelta = this.priorBeta - (state.priorBeta ?? this.priorBeta);

    if (priorMismatch) {
      amasLogger.warn({
        stateAlpha: state.priorAlpha,
        stateBeta: state.priorBeta,
        instanceAlpha: this.priorAlpha,
        instanceBeta: this.priorBeta
      }, '[ThompsonSampling] 先验参数不匹配，将按差额调整已存储参数');
    }

    // 带数值校验和先验差额调整的克隆
    this.global = this.cloneParamsRecordWithMigration(
      state.global ?? {},
      alphaDelta,
      betaDelta
    );
    this.contextual = this.cloneNestedParamsRecordWithMigration(
      state.contextual ?? {},
      alphaDelta,
      betaDelta
    );
    this.updateCount = Math.max(0, state.updateCount ?? 0);
  }

  /**
   * 重置模型到初始状态
   */
  reset(): void {
    this.global = {};
    this.contextual = {};
    this.updateCount = 0;
  }

  getName(): string {
    return ThompsonSampling.NAME;
  }

  getVersion(): string {
    return ThompsonSampling.VERSION;
  }

  getCapabilities(): LearnerCapabilities {
    return {
      supportsOnlineLearning: true,
      supportsBatchUpdate: false,
      requiresPretraining: false,
      minSamplesForReliability: 5,
      primaryUseCase: '冷启动阶段的高效探索，适合早期快速收敛'
    };
  }

  getUpdateCount(): number {
    return this.updateCount;
  }

  // ==================== 便捷方法 ====================

  /**
   * 获取动作的期望成功率
   */
  getExpectedReward(action: Action): number {
    const actionKey = this.buildActionKey(action);
    const params = this.global[actionKey];
    if (!params) {
      return this.priorAlpha / (this.priorAlpha + this.priorBeta);
    }
    return params.alpha / (params.alpha + params.beta);
  }

  /**
   * 获取动作的样本量
   */
  getSampleCount(action: Action): number {
    const actionKey = this.buildActionKey(action);
    const params = this.global[actionKey];
    if (!params) {
      return 0;
    }
    // 减去先验，得到实际观测数
    return Math.max(
      0,
      params.alpha + params.beta - this.priorAlpha - this.priorBeta
    );
  }

  // ==================== 私有方法 ====================

  /**
   * 归一化上下文，确保所有字段有效
   */
  private normalizeContext(context: ThompsonContext): ThompsonContext {
    return {
      recentErrorRate: this.clamp(context?.recentErrorRate ?? 0.5, 0, 1),
      recentResponseTime: this.clamp(
        context?.recentResponseTime ?? 1000,
        RESPONSE_TIME_RANGE.min,
        RESPONSE_TIME_RANGE.max
      ),
      timeBucket: Math.round(this.clamp(context?.timeBucket ?? 12, 0, 23))
    };
  }

  /**
   * 构建动作唯一键
   */
  private buildActionKey(action: Action): string {
    return [
      `int=${action.interval_scale}`,
      `new=${action.new_ratio}`,
      `diff=${action.difficulty}`,
      `batch=${action.batch_size}`,
      `hint=${action.hint_level}`
    ].join('|');
  }

  /**
   * 构建上下文唯一键（离散化连续特征）
   */
  private buildContextKey(state: UserState, context: ThompsonContext): string {
    const { errorRate, responseTime, attention, fatigue, motivation } = BUCKET_CONFIG;

    const errBucket = this.bucket(
      context.recentErrorRate,
      errorRate.step,
      errorRate.min,
      errorRate.max
    ).toFixed(2);

    const rtBucket = this.bucket(
      context.recentResponseTime,
      responseTime.step,
      responseTime.min,
      responseTime.max
    );

    const timeBucket = context.timeBucket;

    const attBucket = this.bucket(
      state.A,
      attention.step,
      attention.min,
      attention.max
    ).toFixed(1);

    const fatBucket = this.bucket(
      state.F,
      fatigue.step,
      fatigue.min,
      fatigue.max
    ).toFixed(1);

    // 动机从[-1,1]映射到[0,1]
    const motNorm = (state.M + 1) / 2;
    const motBucket = this.bucket(
      motNorm,
      motivation.step,
      motivation.min,
      motivation.max
    ).toFixed(1);

    return `err=${errBucket}|rt=${rtBucket}|time=${timeBucket}|att=${attBucket}|fat=${fatBucket}|mot=${motBucket}`;
  }

  /**
   * 确保全局参数存在
   */
  private ensureGlobalParams(actionKey: string): BetaParams {
    if (!this.global[actionKey]) {
      this.global[actionKey] = {
        alpha: this.priorAlpha,
        beta: this.priorBeta
      };
    }
    return this.global[actionKey];
  }

  /**
   * 确保上下文参数存在
   */
  private ensureContextualParams(
    actionKey: string,
    contextKey: string
  ): BetaParams {
    if (!this.contextual[actionKey]) {
      this.contextual[actionKey] = {};
    }
    if (!this.contextual[actionKey][contextKey]) {
      this.contextual[actionKey][contextKey] = {
        alpha: this.priorAlpha,
        beta: this.priorBeta
      };
    }
    return this.contextual[actionKey][contextKey];
  }

  /**
   * 混合全局和上下文采样值
   *
   * 权重策略:
   * - 上下文数据量少时，偏向全局（泛化）
   * - 上下文数据量多时，偏向上下文（个性化）
   */
  private blendSamples(
    globalSample: number,
    contextualSample: number,
    globalParams: BetaParams,
    contextualParams: BetaParams
  ): number {
    const globalTotal = globalParams.alpha + globalParams.beta;
    const contextualTotal = contextualParams.alpha + contextualParams.beta;
    const priorTotal = this.priorAlpha + this.priorBeta;

    // 如果上下文无额外数据，完全使用全局
    if (contextualTotal <= priorTotal) {
      return globalSample;
    }

    // 动态计算上下文权重
    const rawWeight = contextualTotal / (contextualTotal + globalTotal + 1);
    const weight = this.clamp(
      this.minContextWeight +
        rawWeight * (this.maxContextWeight - this.minContextWeight),
      this.minContextWeight,
      this.maxContextWeight
    );

    return weight * contextualSample + (1 - weight) * globalSample;
  }

  /**
   * 计算置信度
   *
   * 基于实际观测次数，样本越多置信度越高
   * 注意: global和contextual同时更新，使用max避免双重计数
   */
  private computeConfidence(
    globalParams: BetaParams,
    contextualParams: BetaParams
  ): number {
    // 计算实际观测次数（减去先验）
    const priorTotal = this.priorAlpha + this.priorBeta;
    const globalObservations = Math.max(
      0,
      globalParams.alpha + globalParams.beta - priorTotal
    );
    const contextualObservations = Math.max(
      0,
      contextualParams.alpha + contextualParams.beta - priorTotal
    );

    // 使用max避免双重计数（因为同一观测会同时更新global和contextual）
    const effectiveObservations = Math.max(globalObservations, contextualObservations);

    // 基于实际观测计算置信度
    return this.clamp(
      effectiveObservations / (effectiveObservations + CONFIDENCE_SCALE),
      0,
      1
    );
  }

  /**
   * 离散化（桶化）连续值
   */
  private bucket(
    value: number,
    step: number,
    min: number,
    max: number
  ): number {
    const safeValue = Number.isFinite(value) ? value : (min + max) / 2;
    const clamped = this.clamp(safeValue, min, max);
    // 防止除零：step <= 0 时直接返回 clamped 值
    if (step <= 0) return clamped;
    return Math.floor(clamped / step) * step;
  }

  /**
   * 从Beta分布采样
   *
   * 使用Gamma分布实现: Beta(α,β) = Gamma(α) / (Gamma(α) + Gamma(β))
   */
  private sampleBeta(alpha: number, beta: number): number {
    const a = Math.max(alpha, EPSILON);
    const b = Math.max(beta, EPSILON);

    const x = this.sampleGamma(a);
    const y = this.sampleGamma(b);
    const sum = x + y;

    // 数值稳定性检查
    if (!Number.isFinite(sum) || sum <= 0) {
      return 0.5; // 回退到均匀先验期望
    }

    return x / sum;
  }

  /**
   * 从Gamma分布采样（Marsaglia-Tsang方法）
   *
   * 参考: Marsaglia, G., & Tsang, W. W. (2000).
   * A simple method for generating gamma variables.
   *
   * @param shape 形状参数
   * @param depth 递归深度（内部使用）
   */
  private sampleGamma(shape: number, depth = 0): number {
    if (shape <= 0) {
      return 0;
    }

    // 递归深度保护
    if (depth >= MAX_GAMMA_RECURSION) {
      amasLogger.warn('[ThompsonSampling] Gamma采样递归深度超限，返回期望值');
      return shape; // 返回期望值作为回退
    }

    // shape < 1 的情况：使用变换
    if (shape < 1) {
      const u = Math.random();
      return this.sampleGamma(1 + shape, depth + 1) * Math.pow(u, 1 / shape);
    }

    // Marsaglia-Tsang方法 (shape >= 1)
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    // 最大迭代次数保护
    const maxIterations = 1000;
    for (let i = 0; i < maxIterations; i++) {
      const x = this.randomNormal();
      let v = 1 + c * x;

      if (v <= 0) {
        continue;
      }

      v = v * v * v;
      const u = Math.random();

      // 快速接受检验
      if (u < 1 - 0.0331 * x * x * x * x) {
        return d * v;
      }

      // 精确接受检验
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }

    // 超出迭代次数，返回期望值
    amasLogger.warn('[ThompsonSampling] Gamma采样迭代超限，返回期望值');
    return shape;
  }

  /**
   * 标准正态分布采样（Box-Muller变换）
   */
  private randomNormal(): number {
    const u1 = Math.max(Math.random(), EPSILON);
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * 数值截断
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * 深拷贝全局参数
   */
  private cloneGlobalParams(): Record<string, BetaParams> {
    return this.cloneParamsRecord(this.global);
  }

  /**
   * 深拷贝上下文参数
   */
  private cloneContextualParams(): Record<string, Record<string, BetaParams>> {
    return this.cloneNestedParamsRecord(this.contextual);
  }

  /**
   * 拷贝单层参数记录
   */
  private cloneParamsRecord(
    source: Record<string, BetaParams>
  ): Record<string, BetaParams> {
    const target: Record<string, BetaParams> = {};
    for (const key of Object.keys(source ?? {})) {
      target[key] = { alpha: source[key].alpha, beta: source[key].beta };
    }
    return target;
  }

  /**
   * 拷贝嵌套参数记录
   */
  private cloneNestedParamsRecord(
    source: Record<string, Record<string, BetaParams>>
  ): Record<string, Record<string, BetaParams>> {
    const target: Record<string, Record<string, BetaParams>> = {};
    for (const actionKey of Object.keys(source ?? {})) {
      target[actionKey] = this.cloneParamsRecord(source[actionKey]);
    }
    return target;
  }

  /**
   * 拷贝单层参数记录（带数值校验）
   * 无效值回退到先验
   */
  private cloneParamsRecordWithValidation(
    source: Record<string, BetaParams>
  ): Record<string, BetaParams> {
    const target: Record<string, BetaParams> = {};
    for (const key of Object.keys(source ?? {})) {
      const params = source[key];
      const alpha = this.validateBetaParam(params?.alpha, this.priorAlpha);
      const beta = this.validateBetaParam(params?.beta, this.priorBeta);
      target[key] = { alpha, beta };
    }
    return target;
  }

  /**
   * 拷贝嵌套参数记录（带数值校验）
   */
  private cloneNestedParamsRecordWithValidation(
    source: Record<string, Record<string, BetaParams>>
  ): Record<string, Record<string, BetaParams>> {
    const target: Record<string, Record<string, BetaParams>> = {};
    for (const actionKey of Object.keys(source ?? {})) {
      target[actionKey] = this.cloneParamsRecordWithValidation(source[actionKey]);
    }
    return target;
  }

  /**
   * 校验Beta参数有效性
   * @param value 待校验值
   * @param fallback 无效时的回退值
   * @returns 有效的参数值
   */
  private validateBetaParam(value: unknown, fallback: number): number {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      return fallback;
    }
    return value;
  }

  /**
   * 拷贝单层参数记录（带先验差额迁移）
   * 当先验参数变化时，调整已存储的alpha/beta值
   */
  private cloneParamsRecordWithMigration(
    source: Record<string, BetaParams>,
    alphaDelta: number,
    betaDelta: number
  ): Record<string, BetaParams> {
    const target: Record<string, BetaParams> = {};
    for (const key of Object.keys(source ?? {})) {
      const params = source[key];
      // 先校验原始值，再应用差额调整
      const rawAlpha = this.validateBetaParam(params?.alpha, this.priorAlpha);
      const rawBeta = this.validateBetaParam(params?.beta, this.priorBeta);
      // 应用差额，确保结果至少等于新先验值
      const alpha = Math.max(this.priorAlpha, rawAlpha + alphaDelta);
      const beta = Math.max(this.priorBeta, rawBeta + betaDelta);
      target[key] = { alpha, beta };
    }
    return target;
  }

  /**
   * 拷贝嵌套参数记录（带先验差额迁移）
   */
  private cloneNestedParamsRecordWithMigration(
    source: Record<string, Record<string, BetaParams>>,
    alphaDelta: number,
    betaDelta: number
  ): Record<string, Record<string, BetaParams>> {
    const target: Record<string, Record<string, BetaParams>> = {};
    for (const actionKey of Object.keys(source ?? {})) {
      target[actionKey] = this.cloneParamsRecordWithMigration(
        source[actionKey],
        alphaDelta,
        betaDelta
      );
    }
    return target;
  }
}

// ==================== 导出默认实例 ====================

export const defaultThompsonSampling = new ThompsonSampling();
