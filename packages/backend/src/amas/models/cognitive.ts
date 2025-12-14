/**
 * AMAS 认知模型统一模块
 *
 * 整合所有核心认知建模组件：
 * - AttentionMonitor: 注意力监测
 * - CognitiveProfiler: 认知能力评估
 * - MotivationTracker: 动机/情绪追踪
 * - TrendAnalyzer: 长期趋势分析
 * - HabitRecognizer: 习惯识别
 * - ChronotypeDetector: 昼夜节律检测
 * - LearningStyleProfiler: 学习风格分析
 * - FatigueRecoveryModel: 疲劳恢复建模
 * - ACT-R Memory Model: ACT-R认知架构记忆模型 (从 modeling/ 迁移)
 * - ACT-R Native Wrapper: Native加速包装器 (从 modeling/ 迁移)
 *
 * 注意：遗忘曲线(forgetting-curve.ts)和疲劳估算(fatigue-estimator.ts)
 * 作为权威实现保持独立文件
 */

// ==================== 导入配置 ====================
import {
  DEFAULT_ATTENTION_WEIGHTS,
  ATTENTION_SMOOTHING,
  COGNITIVE_LONG_TERM_BETA,
  COGNITIVE_FUSION_K0,
  DEFAULT_MOTIVATION_PARAMS,
} from '../config/action-space';

import { CognitiveProfile } from '../types';
import prisma from '../../config/database';
import { PrismaClient } from '@prisma/client';

// ==================== 注意力监测 ====================

/**
 * 注意力特征输入
 */
export interface AttentionFeatures {
  /** 反应时间均值(标准化) */
  z_rt_mean: number;
  /** 反应时间变异系数 */
  z_rt_cv: number;
  /** 答题节奏变异系数 */
  z_pace_cv: number;
  /** 暂停次数(标准化) */
  z_pause: number;
  /** 切屏次数(标准化) */
  z_switch: number;
  /** 速度漂移(最近vs基线) */
  z_drift: number;
  /** 微交互密度 */
  interaction_density: number;
  /** 失焦累计时长 */
  focus_loss_duration: number;
}

/**
 * Sigmoid激活函数
 */
function sigmoid(x: number): number {
  if (x > 500) return 1;
  if (x < -500) return 0;
  return 1 / (1 + Math.exp(-x));
}

/**
 * 截断到[0,1]范围
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * 注意力监测模型
 *
 * 数学模型:
 * A_raw = sigmoid(-w · f_attention)
 * A_t = β · A_{t-1} + (1 - β) · A_raw
 */
export class AttentionMonitor {
  private weights: Float32Array;
  private beta: number;
  private prevAttention: number;

  constructor(
    weights: Float32Array = new Float32Array([
      DEFAULT_ATTENTION_WEIGHTS.rt_mean,
      DEFAULT_ATTENTION_WEIGHTS.rt_cv,
      DEFAULT_ATTENTION_WEIGHTS.pace_cv,
      DEFAULT_ATTENTION_WEIGHTS.pause,
      DEFAULT_ATTENTION_WEIGHTS.switch,
      DEFAULT_ATTENTION_WEIGHTS.drift,
      DEFAULT_ATTENTION_WEIGHTS.interaction,
      DEFAULT_ATTENTION_WEIGHTS.focus_loss,
    ]),
    beta: number = ATTENTION_SMOOTHING,
    initialAttention: number = 0.7,
  ) {
    this.weights = weights;
    this.beta = beta;
    this.prevAttention = initialAttention;
  }

  update(features: AttentionFeatures): number {
    const featureVector = [
      features.z_rt_mean,
      features.z_rt_cv,
      features.z_pace_cv,
      features.z_pause,
      features.z_switch,
      features.z_drift,
      features.interaction_density,
      features.focus_loss_duration,
    ];

    if (featureVector.length < this.weights.length) {
      console.warn(
        `[AttentionMonitor] 特征向量维度不匹配: 期望 ${this.weights.length}, 实际 ${featureVector.length}。跳过更新，返回上一次的注意力值。`,
      );
      return this.prevAttention;
    }

    const loopLength = Math.min(this.weights.length, featureVector.length);
    let weightedSum = 0;
    for (let i = 0; i < loopLength; i++) {
      const weight = this.weights[i];
      const feature = featureVector[i];
      if (Number.isNaN(weight) || Number.isNaN(feature)) {
        console.warn(
          `[AttentionMonitor] 检测到 NaN 值: weights[${i}]=${weight}, featureVector[${i}]=${feature}。使用 0 替代。`,
        );
        continue;
      }
      weightedSum += weight * feature;
    }

    const A_raw = sigmoid(-weightedSum);
    const A_t = this.beta * this.prevAttention + (1 - this.beta) * A_raw;
    this.prevAttention = clamp01(A_t);

    return this.prevAttention;
  }

  updateFromArray(features: Float32Array): number {
    if (features.length < 8) {
      throw new Error('Attention features array must have at least 8 elements');
    }

    return this.update({
      z_rt_mean: features[0],
      z_rt_cv: features[1],
      z_pace_cv: features[2],
      z_pause: features[3],
      z_switch: features[4],
      z_drift: features[5],
      interaction_density: features[6],
      focus_loss_duration: features[7],
    });
  }

  get(): number {
    return this.prevAttention;
  }

  getAttention(): number {
    return this.get();
  }

  reset(value: number = 0.7): void {
    this.prevAttention = clamp01(value);
  }

  setBeta(beta: number): void {
    this.beta = clamp01(beta);
  }

  setWeights(weights: Float32Array): void {
    if (weights.length !== 8) {
      throw new Error('Weights array must have exactly 8 elements');
    }
    this.weights = weights;
  }

  getState(): { prevAttention: number; beta: number } {
    return {
      prevAttention: this.prevAttention,
      beta: this.beta,
    };
  }

  setState(state: { prevAttention: number; beta?: number }): void {
    this.prevAttention = clamp01(state.prevAttention);
    if (state.beta !== undefined) {
      this.beta = clamp01(state.beta);
    }
  }
}

export const defaultAttentionMonitor = new AttentionMonitor();

// ==================== 认知能力评估 ====================

/**
 * 近期统计数据
 */
export interface RecentStats {
  /** 正确率 [0,1] */
  accuracy: number;
  /** 平均反应时间(ms) */
  avgResponseTime: number;
  /** 错误率方差 */
  errorVariance: number;
}

/**
 * 认知能力评估模型
 *
 * 数学模型:
 * C_short = stats(window_k)
 * C_long = β · C_long + (1 - β) · new_value
 * C = λ · C_long + (1 - λ) · C_short
 * λ = 1 - exp(-n / k0)
 */
export class CognitiveProfiler {
  private C_long: CognitiveProfile;
  private sampleCount: number;
  private beta: number;
  private k0: number;
  private referenceRT: number = 5000;
  private minRT: number = 1000;
  private referenceVariance: number = 0.25;

  constructor(
    beta: number = COGNITIVE_LONG_TERM_BETA,
    k0: number = COGNITIVE_FUSION_K0,
    initialProfile?: CognitiveProfile,
  ) {
    this.beta = beta;
    this.k0 = k0;
    this.sampleCount = 0;
    this.C_long = initialProfile ?? {
      mem: 0.5,
      speed: 0.5,
      stability: 0.5,
    };
  }

  update(stats: RecentStats): CognitiveProfile {
    const C_short: CognitiveProfile = {
      mem: clamp01(stats.accuracy),
      speed: this.normalizeSpeed(stats.avgResponseTime),
      stability: 1 - this.normalizeVariance(stats.errorVariance),
    };

    this.C_long = {
      mem: this.beta * this.C_long.mem + (1 - this.beta) * C_short.mem,
      speed: this.beta * this.C_long.speed + (1 - this.beta) * C_short.speed,
      stability: this.beta * this.C_long.stability + (1 - this.beta) * C_short.stability,
    };

    this.sampleCount++;
    const lambda = 1 - Math.exp(-this.sampleCount / this.k0);

    const C: CognitiveProfile = {
      mem: clamp01(lambda * this.C_long.mem + (1 - lambda) * C_short.mem),
      speed: clamp01(lambda * this.C_long.speed + (1 - lambda) * C_short.speed),
      stability: clamp01(lambda * this.C_long.stability + (1 - lambda) * C_short.stability),
    };

    return C;
  }

  updateFromEvent(
    isCorrect: boolean,
    responseTime: number,
    recentErrorRate: number = 0,
  ): CognitiveProfile {
    return this.update({
      accuracy: isCorrect ? 1 : 0,
      avgResponseTime: responseTime,
      errorVariance: recentErrorRate * (1 - recentErrorRate),
    });
  }

  get(): CognitiveProfile {
    return { ...this.C_long };
  }

  getProfile(): CognitiveProfile {
    return this.get();
  }

  getLongTerm(): CognitiveProfile {
    return { ...this.C_long };
  }

  reset(profile?: CognitiveProfile): void {
    this.C_long = profile ?? {
      mem: 0.5,
      speed: 0.5,
      stability: 0.5,
    };
    this.sampleCount = 0;
  }

  getSampleCount(): number {
    return this.sampleCount;
  }

  getLambda(): number {
    return 1 - Math.exp(-this.sampleCount / this.k0);
  }

  setNormalizationParams(params: {
    referenceRT?: number;
    minRT?: number;
    referenceVariance?: number;
  }): void {
    if (params.referenceRT !== undefined) this.referenceRT = params.referenceRT;
    if (params.minRT !== undefined) this.minRT = params.minRT;
    if (params.referenceVariance !== undefined) {
      this.referenceVariance = params.referenceVariance;
    }
  }

  getState(): {
    C_long: CognitiveProfile;
    sampleCount: number;
  } {
    return {
      C_long: { ...this.C_long },
      sampleCount: this.sampleCount,
    };
  }

  setState(state: { C_long: CognitiveProfile; sampleCount: number }): void {
    this.C_long = {
      mem: clamp01(state.C_long.mem),
      speed: clamp01(state.C_long.speed),
      stability: clamp01(state.C_long.stability),
    };
    this.sampleCount = Math.max(0, state.sampleCount);
  }

  private normalizeSpeed(rtMs: number): number {
    const rt = Math.max(rtMs, this.minRT);
    const value = this.referenceRT / rt;
    return clamp01(value);
  }

  private normalizeVariance(variance: number): number {
    const value = variance / this.referenceVariance;
    return clamp01(value);
  }
}

export const defaultCognitiveProfiler = new CognitiveProfiler();

// ==================== 动机追踪 ====================

/**
 * 动机事件
 */
export interface MotivationEvent {
  /** 成功次数 */
  successes?: number;
  /** 失败次数 */
  failures?: number;
  /** 退出/放弃次数 */
  quits?: number;
}

/**
 * 截断到[-1, 1]范围
 */
function clipMotivation(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/**
 * 动机追踪模型
 *
 * 数学模型:
 * M_t = clip(ρ·M_{t-1} + κ·succ - λ·fail - μ·quit, -1, 1)
 */
export class MotivationTracker {
  private M: number;
  private lowMotivationCount: number;
  private rho: number;
  private kappa: number;
  private lambda: number;
  private mu: number;

  constructor(params = DEFAULT_MOTIVATION_PARAMS, initialMotivation: number = 0) {
    this.rho = params.rho;
    this.kappa = params.kappa;
    this.lambda = params.lambda;
    this.mu = params.mu;
    this.M = clipMotivation(initialMotivation);
    this.lowMotivationCount = 0;
  }

  update(event: MotivationEvent): number {
    const succ = event.successes ?? 0;
    const fail = event.failures ?? 0;
    const quit = event.quits ?? 0;

    const nextM = this.rho * this.M + this.kappa * succ - this.lambda * fail - this.mu * quit;

    this.M = clipMotivation(nextM);

    if (this.M < 0) {
      this.lowMotivationCount++;
    } else {
      this.lowMotivationCount = 0;
    }

    return this.M;
  }

  updateFromEvent(isCorrect: boolean, isQuit: boolean = false, retryCount: number = 0): number {
    return this.update({
      successes: isCorrect ? 1 : 0,
      failures: isCorrect ? 0 : 1 + Math.min(retryCount, 2),
      quits: isQuit ? 1 : 0,
    });
  }

  get(): number {
    return this.M;
  }

  getMotivation(): number {
    return this.get();
  }

  reset(value: number = 0): void {
    this.M = clipMotivation(value);
    this.lowMotivationCount = 0;
  }

  isLongTermLowMotivation(): boolean {
    return this.lowMotivationCount > 10;
  }

  isFrustrated(): boolean {
    return this.M < -0.3;
  }

  isHighlyMotivated(): boolean {
    return this.M > 0.5;
  }

  getLowMotivationCount(): number {
    return this.lowMotivationCount;
  }

  setParams(params: Partial<typeof DEFAULT_MOTIVATION_PARAMS>): void {
    if (params.rho !== undefined) this.rho = params.rho;
    if (params.kappa !== undefined) this.kappa = params.kappa;
    if (params.lambda !== undefined) this.lambda = params.lambda;
    if (params.mu !== undefined) this.mu = params.mu;
  }

  getState(): {
    M: number;
    lowMotivationCount: number;
  } {
    return {
      M: this.M,
      lowMotivationCount: this.lowMotivationCount,
    };
  }

  setState(state: { M: number; lowMotivationCount: number }): void {
    this.M = clipMotivation(state.M);
    this.lowMotivationCount = Math.max(0, state.lowMotivationCount);
  }
}

export const defaultMotivationTracker = new MotivationTracker();

// ==================== 趋势分析 ====================

export type TrendState = 'up' | 'flat' | 'stuck' | 'down';

interface Sample {
  ts: number;
  ability: number;
}

interface SlopeResult {
  slopePerDay: number;
  volatility: number;
  method: 'regression' | 'ema';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 环形缓冲区 - O(1) 时间复杂度的 push 和 shift 操作
 */
class RingBuffer<T> {
  private buffer: (T | undefined)[];
  private head = 0;
  private tail = 0;
  private _size = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  get size(): number {
    return this._size;
  }

  push(item: T): T | undefined {
    const evicted = this._size === this.capacity ? this.buffer[this.head] : undefined;
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;

    if (this._size < this.capacity) {
      this._size++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
    return evicted;
  }

  shift(): T | undefined {
    if (this._size === 0) return undefined;
    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined;
    this.head = (this.head + 1) % this.capacity;
    this._size--;
    return item;
  }

  first(): T | undefined {
    return this._size > 0 ? this.buffer[this.head] : undefined;
  }

  last(): T | undefined {
    if (this._size === 0) return undefined;
    const lastIdx = (this.tail - 1 + this.capacity) % this.capacity;
    return this.buffer[lastIdx];
  }

  get(index: number): T | undefined {
    if (index < 0 || index >= this._size) return undefined;
    return this.buffer[(this.head + index) % this.capacity];
  }

  *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this._size; i++) {
      yield this.buffer[(this.head + i) % this.capacity] as T;
    }
  }

  toArray(): T[] {
    return [...this];
  }

  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.tail = 0;
    this._size = 0;
  }
}

/**
 * 趋势分析器
 *
 * 冷启动策略:
 * - 样本不足或时间跨度不足30天: 使用7天EMA近似斜率
 * - 样本充足: 使用线性回归计算趋势
 */
export class TrendAnalyzer {
  private readonly windowMs: number;
  private readonly minSamples: number;
  private readonly emaAlpha: number;
  private samples: RingBuffer<Sample>;
  private lastState: TrendState = 'flat';
  private lastSlope = 0;
  private lastConfidence = 0;

  constructor(windowDays = 30, minSamples = 10) {
    this.windowMs = windowDays * 24 * 60 * 60 * 1000;
    this.minSamples = minSamples;
    this.emaAlpha = 0.25;
    this.samples = new RingBuffer<Sample>(windowDays * 3);
  }

  update(ability: number, timestamp: number): TrendState {
    if (!Number.isFinite(ability) || !Number.isFinite(timestamp)) {
      return this.lastState;
    }

    const safeAbility = clamp(ability, 0, 1);
    this.samples.push({ ts: timestamp, ability: safeAbility });

    const lastSample = this.samples.get(this.samples.size - 2);
    if (this.samples.size >= 2 && lastSample && lastSample.ts > timestamp) {
      const sorted = this.samples.toArray().sort((a, b) => a.ts - b.ts);
      this.samples.clear();
      for (const sample of sorted) {
        this.samples.push(sample);
      }
    }

    const windowStart = timestamp - this.windowMs;
    let firstSample = this.samples.first();
    while (this.samples.size > 0 && firstSample && firstSample.ts < windowStart) {
      this.samples.shift();
      firstSample = this.samples.first();
    }

    if (this.samples.size < 2) {
      this.lastState = 'flat';
      this.lastSlope = 0;
      this.lastConfidence = 0;
      return this.lastState;
    }

    const { slopePerDay, volatility, method } = this.computeSlopeAndVolatility();
    const state = this.classifyState(slopePerDay, volatility);
    const confidence = this.computeConfidence(this.samples.size, slopePerDay, volatility, method);

    this.lastState = state;
    this.lastSlope = slopePerDay;
    this.lastConfidence = confidence;

    return state;
  }

  getTrendState(): TrendState {
    return this.lastState;
  }

  getTrendSlope(): number {
    return this.lastSlope;
  }

  getConfidence(): number {
    return this.lastConfidence;
  }

  private computeSlopeAndVolatility(): SlopeResult {
    const n = this.samples.size;
    const firstSample = this.samples.first()!;
    const t0 = firstSample.ts;
    const xs: number[] = new Array(n);
    const ys: number[] = new Array(n);

    for (let i = 0; i < n; i++) {
      const sample = this.samples.get(i)!;
      xs[i] = (sample.ts - t0) / (24 * 60 * 60 * 1000);
      ys[i] = sample.ability;
    }

    const spanDays = xs[n - 1] - xs[0];
    const halfWindow = this.windowMs / (2 * 24 * 60 * 60 * 1000);
    const enoughData = n >= this.minSamples && spanDays >= halfWindow;

    if (enoughData) {
      const slope = this.linearRegressionSlope(xs, ys);
      const volatility = this.stdDev(ys);
      return { slopePerDay: slope, volatility, method: 'regression' };
    }

    const { slope, volatility } = this.emaSlope(xs, ys);
    return { slopePerDay: slope, volatility, method: 'ema' };
  }

  private linearRegressionSlope(xs: number[], ys: number[]): number {
    const n = xs.length;
    let sumX = 0;
    let sumY = 0;

    for (let i = 0; i < n; i++) {
      sumX += xs[i];
      sumY += ys[i];
    }

    const meanX = sumX / n;
    const meanY = sumY / n;

    let num = 0;
    let den = 0;

    for (let i = 0; i < n; i++) {
      const dx = xs[i] - meanX;
      num += dx * (ys[i] - meanY);
      den += dx * dx;
    }

    if (den <= 1e-9) return 0;
    return num / den;
  }

  private emaSlope(
    xs: number[],
    ys: number[],
  ): {
    slope: number;
    volatility: number;
  } {
    let ema = ys[0];
    const n = ys.length;

    for (let i = 1; i < n; i++) {
      ema = this.emaAlpha * ys[i] + (1 - this.emaAlpha) * ema;
    }

    const spanDays = Math.max(xs[n - 1] - xs[0], 1e-6);
    const slope = (ema - ys[0]) / spanDays;
    const volatility = this.stdDev(ys);

    return { slope, volatility };
  }

  private stdDev(arr: number[]): number {
    const n = arr.length;
    if (n <= 1) return 0;

    const mean = arr.reduce((s, v) => s + v, 0) / n;
    const varSum = arr.reduce((s, v) => s + (v - mean) * (v - mean), 0);

    return Math.sqrt(varSum / n);
  }

  private classifyState(slopePerDay: number, volatility: number): TrendState {
    if (slopePerDay > 0.01) return 'up';
    if (slopePerDay < -0.005) return 'down';
    if (Math.abs(slopePerDay) <= 0.005 && volatility < 0.05) return 'flat';
    return 'stuck';
  }

  private computeConfidence(
    n: number,
    slope: number,
    volatility: number,
    method: 'regression' | 'ema',
  ): number {
    const firstSample = this.samples.first()!;
    const lastSample = this.samples.last()!;
    const spanDays = Math.max((lastSample.ts - firstSample.ts) / (24 * 60 * 60 * 1000), 1e-6);

    const windowDays = this.windowMs / (24 * 60 * 60 * 1000);

    const sizeFactor = clamp(n / (this.minSamples * 1.5), 0, 1);
    const spanFactor = clamp(spanDays / windowDays, 0, 1);
    const volatilityFactor = 1 / (1 + volatility * 10);
    const methodPenalty = method === 'ema' ? 0.15 : 0;

    let confidence = 0.5 * sizeFactor + 0.3 * spanFactor + 0.2 * volatilityFactor;
    confidence = clamp(confidence - methodPenalty, 0, 1);

    if (Math.abs(slope) < 0.002) {
      confidence *= 0.8;
    }

    return clamp(confidence, 0, 1);
  }
}

// ==================== 习惯识别 ====================

/**
 * 习惯画像
 */
export interface HabitProfile {
  /** 时间偏好 (24小时归一化直方图) */
  timePref: number[];
  /** 节奏偏好 */
  rhythmPref: {
    sessionMedianMinutes: number;
    batchMedian: number;
  };
  /** 偏好时间段 */
  preferredTimeSlots: number[];
  /** 样本统计 */
  samples: {
    timeEvents: number;
    sessions: number;
    batches: number;
  };
}

export interface HabitRecognizerOptions {
  emaBeta?: number;
  medianWindow?: number;
  minTimeSamplesForPref?: number;
  topKSlots?: number;
  defaultSessionMinutes?: number;
  defaultBatchSize?: number;
}

export class HabitRecognizer {
  private readonly emaBeta: number;
  private readonly medianWindow: number;
  private readonly minTimeSamplesForPref: number;
  private readonly topKSlots: number;
  private readonly defaultSessionMinutes: number;
  private readonly defaultBatchSize: number;
  private timeHist: Float32Array;
  private timeEvents: number;
  private sessionDurations: number[];
  private batchSizes: number[];

  constructor(opts: HabitRecognizerOptions = {}) {
    this.emaBeta = opts.emaBeta ?? 0.9;
    this.medianWindow = opts.medianWindow ?? 50;
    this.minTimeSamplesForPref = opts.minTimeSamplesForPref ?? 10;
    this.topKSlots = opts.topKSlots ?? 3;
    this.defaultSessionMinutes = opts.defaultSessionMinutes ?? 15;
    this.defaultBatchSize = opts.defaultBatchSize ?? 8;
    this.timeHist = new Float32Array(24).fill(1 / 24);
    this.timeEvents = 0;
    this.sessionDurations = [];
    this.batchSizes = [];
  }

  updateTimePref(hour: number): void {
    const h = Math.max(0, Math.min(23, Math.floor(hour)));
    const beta = this.emaBeta;

    for (let i = 0; i < 24; i++) {
      const hit = i === h ? 1 : 0;
      this.timeHist[i] = beta * this.timeHist[i] + (1 - beta) * hit;
    }

    this.normalizeTimeHist();
    this.timeEvents += 1;
  }

  updateSessionDuration(minutes: number): void {
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    this.pushWithWindow(this.sessionDurations, minutes, this.medianWindow);
  }

  updateBatchSize(count: number): void {
    if (!Number.isFinite(count) || count <= 0) return;
    this.pushWithWindow(this.batchSizes, count, this.medianWindow);
  }

  getHabitProfile(): HabitProfile {
    const sessionMedian = this.medianOrDefault(this.sessionDurations, this.defaultSessionMinutes);
    const batchMedian = this.medianOrDefault(this.batchSizes, this.defaultBatchSize);

    return {
      timePref: Array.from(this.timeHist),
      rhythmPref: {
        sessionMedianMinutes: sessionMedian,
        batchMedian,
      },
      preferredTimeSlots: this.getPreferredTimeSlots(),
      samples: {
        timeEvents: this.timeEvents,
        sessions: this.sessionDurations.length,
        batches: this.batchSizes.length,
      },
    };
  }

  getPreferredTimeSlots(): number[] {
    if (this.timeEvents < this.minTimeSamplesForPref) {
      return [];
    }

    const indexed = Array.from(this.timeHist)
      .map((v, hour) => ({ hour, v }))
      .sort((a, b) => b.v - a.v);

    return indexed.slice(0, this.topKSlots).map((x) => x.hour);
  }

  private normalizeTimeHist(): void {
    let sum = 0;
    for (let i = 0; i < 24; i++) sum += this.timeHist[i];

    if (sum <= 0) {
      this.timeHist.fill(1 / 24);
      return;
    }

    for (let i = 0; i < 24; i++) {
      this.timeHist[i] = this.timeHist[i] / sum;
    }
  }

  private pushWithWindow(arr: number[], value: number, window: number): void {
    arr.push(value);
    if (arr.length > window) {
      arr.shift();
    }
  }

  private medianOrDefault(arr: number[], fallback: number): number {
    if (arr.length === 0) return fallback;

    const copy = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(copy.length / 2);

    if (copy.length % 2 === 0) {
      return (copy[mid - 1] + copy[mid]) / 2;
    }

    return copy[mid];
  }
}

// ==================== 昼夜节律检测 ====================

export type ChronotypeCategory = 'morning' | 'evening' | 'intermediate';

export interface ChronotypeProfile {
  category: ChronotypeCategory;
  peakHours: number[];
  confidence: number;
  sampleCount: number;
  learningHistory: Array<{
    hour: number;
    performance: number;
    sampleCount: number;
  }>;
}

export class ChronotypeDetector {
  private readonly minSampleSize = 20;
  private readonly recentRecordLimit = 500;

  async analyzeChronotype(userId: string): Promise<ChronotypeProfile> {
    const hourlyPerformance = await this.getHourlyPerformance(userId);
    const totalSamples = hourlyPerformance.reduce((sum, h) => sum + h.sampleCount, 0);

    if (totalSamples < this.minSampleSize) {
      return {
        category: 'intermediate',
        peakHours: [9, 10, 14, 15, 16],
        confidence: 0.3,
        sampleCount: totalSamples,
        learningHistory: hourlyPerformance,
      };
    }

    const morningPerf = this.getAveragePerformance(hourlyPerformance, [6, 7, 8, 9, 10]);
    const afternoonPerf = this.getAveragePerformance(hourlyPerformance, [14, 15, 16, 17, 18]);
    const eveningPerf = this.getAveragePerformance(hourlyPerformance, [19, 20, 21, 22]);

    const maxPerf = Math.max(morningPerf.avg, afternoonPerf.avg, eveningPerf.avg);
    const perfVariance = this.computeVariance([
      morningPerf.avg,
      afternoonPerf.avg,
      eveningPerf.avg,
    ]);

    const sampleConfidence = Math.min(totalSamples / 100, 1.0);
    const differenceConfidence = perfVariance > 0.01 ? 0.8 : 0.5;
    const confidence = (sampleConfidence + differenceConfidence) / 2;

    if (morningPerf.avg > afternoonPerf.avg && morningPerf.avg > eveningPerf.avg) {
      return {
        category: 'morning',
        peakHours: this.identifyPeakHours(hourlyPerformance, [6, 7, 8, 9, 10, 11]),
        confidence,
        sampleCount: totalSamples,
        learningHistory: hourlyPerformance,
      };
    } else if (eveningPerf.avg > morningPerf.avg && eveningPerf.avg > afternoonPerf.avg) {
      return {
        category: 'evening',
        peakHours: this.identifyPeakHours(hourlyPerformance, [18, 19, 20, 21, 22, 23]),
        confidence,
        sampleCount: totalSamples,
        learningHistory: hourlyPerformance,
      };
    } else {
      return {
        category: 'intermediate',
        peakHours: this.identifyPeakHours(hourlyPerformance, [10, 11, 14, 15, 16, 17]),
        confidence: confidence * 0.8,
        sampleCount: totalSamples,
        learningHistory: hourlyPerformance,
      };
    }
  }

  private async getHourlyPerformance(userId: string): Promise<
    Array<{
      hour: number;
      performance: number;
      sampleCount: number;
    }>
  > {
    const records = await prisma.answerRecord.findMany({
      where: { userId },
      select: {
        timestamp: true,
        isCorrect: true,
      },
      orderBy: { timestamp: 'desc' },
      take: this.recentRecordLimit,
    });

    if (records.length === 0) {
      return [];
    }

    const hourlyData: Map<number, { correct: number; total: number }> = new Map();

    records.forEach((r) => {
      const hour = r.timestamp.getHours();
      const data = hourlyData.get(hour) || { correct: 0, total: 0 };
      data.total++;
      if (r.isCorrect) data.correct++;
      hourlyData.set(hour, data);
    });

    return Array.from(hourlyData.entries())
      .map(([hour, data]) => ({
        hour,
        performance: data.correct / data.total,
        sampleCount: data.total,
      }))
      .sort((a, b) => a.hour - b.hour);
  }

  private getAveragePerformance(
    hourlyPerf: Array<{ hour: number; performance: number; sampleCount: number }>,
    hours: number[],
  ): { avg: number; count: number } {
    const relevant = hourlyPerf.filter((h) => hours.includes(h.hour));

    if (relevant.length === 0) {
      return { avg: 0, count: 0 };
    }

    const totalSamples = relevant.reduce((sum, h) => sum + h.sampleCount, 0);
    const weightedSum = relevant.reduce((sum, h) => sum + h.performance * h.sampleCount, 0);

    return {
      avg: weightedSum / totalSamples,
      count: relevant.length,
    };
  }

  private identifyPeakHours(
    hourlyPerf: Array<{ hour: number; performance: number; sampleCount: number }>,
    candidateHours: number[],
  ): number[] {
    const candidates = hourlyPerf.filter((h) => candidateHours.includes(h.hour));

    if (candidates.length === 0) {
      return candidateHours.slice(0, 4);
    }

    return candidates
      .sort((a, b) => b.performance - a.performance)
      .slice(0, 4)
      .map((h) => h.hour)
      .sort((a, b) => a - b);
  }

  private computeVariance(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

    return variance;
  }

  isCurrentlyPeakTime(profile: ChronotypeProfile, now: Date = new Date()): boolean {
    const currentHour = now.getHours();
    return profile.peakHours.includes(currentHour);
  }

  getNextPeakTime(profile: ChronotypeProfile, now: Date = new Date()): number {
    const currentHour = now.getHours();
    const nextPeak = profile.peakHours.find((h) => h > currentHour);
    return nextPeak || profile.peakHours[0];
  }
}

// ==================== 学习风格分析 ====================

export type LearningStyle = 'visual' | 'auditory' | 'kinesthetic' | 'mixed';

export interface InteractionPatterns {
  avgDwellTime: number;
  avgResponseTime: number;
  pauseCount: number;
  switchCount: number;
  dwellTimeVariance: number;
  responseTimeVariance: number;
  sampleCount: number;
}

export interface LearningStyleProfile {
  style: LearningStyle;
  confidence: number;
  sampleCount: number;
  scores: {
    visual: number;
    auditory: number;
    kinesthetic: number;
  };
  interactionPatterns: {
    avgDwellTime: number;
    avgResponseTime: number;
    pauseFrequency: number;
    switchFrequency: number;
  };
}

export class LearningStyleProfiler {
  private readonly minSampleSize = 50;
  private readonly recentRecordLimit = 200;
  private readonly prismaClient: PrismaClient;

  constructor(prismaClient: PrismaClient = prisma) {
    this.prismaClient = prismaClient;
  }

  async detectLearningStyle(userId: string): Promise<LearningStyleProfile> {
    const interactions = await this.getInteractionPatterns(userId);

    if (interactions.sampleCount < this.minSampleSize) {
      return {
        style: 'mixed',
        confidence: 0.3,
        sampleCount: interactions.sampleCount,
        scores: { visual: 0.33, auditory: 0.33, kinesthetic: 0.33 },
        interactionPatterns: {
          avgDwellTime: interactions.avgDwellTime,
          avgResponseTime: interactions.avgResponseTime,
          pauseFrequency: 0,
          switchFrequency: 0,
        },
      };
    }

    const visualScore = this.computeVisualScore(interactions);
    const auditoryScore = this.computeAuditoryScore(interactions);
    const kinestheticScore = this.computeKinestheticScore(interactions);

    const scores = { visual: visualScore, auditory: auditoryScore, kinesthetic: kinestheticScore };

    const totalScore = visualScore + auditoryScore + kinestheticScore;
    if (totalScore > 0) {
      scores.visual /= totalScore;
      scores.auditory /= totalScore;
      scores.kinesthetic /= totalScore;
    }

    const normalizedMaxScore = Math.max(scores.visual, scores.auditory, scores.kinesthetic);

    if (normalizedMaxScore < 0.4) {
      return {
        style: 'mixed',
        confidence: 0.5,
        sampleCount: interactions.sampleCount,
        scores,
        interactionPatterns: {
          avgDwellTime: interactions.avgDwellTime,
          avgResponseTime: interactions.avgResponseTime,
          pauseFrequency: interactions.pauseCount / interactions.sampleCount,
          switchFrequency: interactions.switchCount / interactions.sampleCount,
        },
      };
    }

    let style: LearningStyle;
    if (scores.visual === normalizedMaxScore) {
      style = 'visual';
    } else if (scores.auditory === normalizedMaxScore) {
      style = 'auditory';
    } else {
      style = 'kinesthetic';
    }

    const confidence = Math.min(normalizedMaxScore, 0.9);

    return {
      style,
      confidence,
      sampleCount: interactions.sampleCount,
      scores,
      interactionPatterns: {
        avgDwellTime: interactions.avgDwellTime,
        avgResponseTime: interactions.avgResponseTime,
        pauseFrequency: interactions.pauseCount / interactions.sampleCount,
        switchFrequency: interactions.switchCount / interactions.sampleCount,
      },
    };
  }

  private async getInteractionPatterns(userId: string): Promise<InteractionPatterns> {
    const emptyPatterns: InteractionPatterns = {
      avgDwellTime: 0,
      avgResponseTime: 0,
      pauseCount: 0,
      switchCount: 0,
      dwellTimeVariance: 0,
      responseTimeVariance: 0,
      sampleCount: 0,
    };

    try {
      const records = await this.prismaClient.answerRecord.findMany({
        where: { userId },
        select: {
          dwellTime: true,
          responseTime: true,
          timestamp: true,
        },
        orderBy: { timestamp: 'desc' },
        take: this.recentRecordLimit,
      });

      if (records.length === 0) {
        return emptyPatterns;
      }

      const avgDwellTime = records.reduce((sum, r) => sum + (r.dwellTime || 0), 0) / records.length;
      const avgResponseTime =
        records.reduce((sum, r) => sum + (r.responseTime || 0), 0) / records.length;

      const dwellTimeVariance =
        records.reduce((sum, r) => {
          const diff = (r.dwellTime || 0) - avgDwellTime;
          return sum + diff * diff;
        }, 0) / records.length;

      const responseTimeVariance =
        records.reduce((sum, r) => {
          const diff = (r.responseTime || 0) - avgResponseTime;
          return sum + diff * diff;
        }, 0) / records.length;

      let pauseCount = 0;
      for (let i = 1; i < records.length; i++) {
        const gap = records[i - 1].timestamp.getTime() - records[i].timestamp.getTime();
        if (gap > 30000) pauseCount++;
      }

      let switchCount = 0;
      for (let i = 1; i < records.length; i++) {
        const prev = records[i - 1].responseTime || avgResponseTime;
        const curr = records[i].responseTime || avgResponseTime;
        if (prev > 0 && curr > 0 && (curr / prev > 2 || prev / curr > 2)) {
          switchCount++;
        }
      }

      return {
        avgDwellTime,
        avgResponseTime,
        pauseCount,
        switchCount,
        dwellTimeVariance,
        responseTimeVariance,
        sampleCount: records.length,
      };
    } catch (error) {
      console.error('[LearningStyleProfiler] 获取用户交互模式失败:', error);
      return emptyPatterns;
    }
  }

  private computeVisualScore(interactions: InteractionPatterns): number {
    const optimalDwellTime = 5000;
    const dwellTimeScore = Math.min(interactions.avgDwellTime / optimalDwellTime, 1.0);
    const deliberateScore = interactions.avgDwellTime > 3000 ? 0.3 : 0;
    return Math.min(dwellTimeScore + deliberateScore, 1.0);
  }

  private computeAuditoryScore(interactions: InteractionPatterns): number {
    const dwellTimeStdDev = Math.sqrt(interactions.dwellTimeVariance || 0);
    const coefficientOfVariation =
      interactions.avgDwellTime > 0 ? dwellTimeStdDev / interactions.avgDwellTime : 1;

    const stabilityScore =
      coefficientOfVariation < 0.3 ? 0.4 : coefficientOfVariation < 0.5 ? 0.25 : 0.1;
    const dwellScore =
      interactions.avgDwellTime >= 3000 && interactions.avgDwellTime <= 6000 ? 0.3 : 0.1;
    const pauseRate =
      interactions.sampleCount > 0 ? interactions.pauseCount / interactions.sampleCount : 0;
    const pauseScore = pauseRate > 0.1 ? 0.2 : 0.1;

    return Math.min(stabilityScore + dwellScore + pauseScore, 1.0);
  }

  private computeKinestheticScore(interactions: InteractionPatterns): number {
    const speedScore =
      interactions.avgResponseTime < 2000 ? 0.4 : interactions.avgResponseTime < 3000 ? 0.3 : 0.15;

    const switchRate =
      interactions.sampleCount > 0 ? interactions.switchCount / interactions.sampleCount : 0;
    const switchScore = switchRate > 0.2 ? 0.3 : switchRate > 0.1 ? 0.2 : 0.1;

    const responseTimeStdDev = Math.sqrt(interactions.responseTimeVariance || 0);
    const responseCV =
      interactions.avgResponseTime > 0 ? responseTimeStdDev / interactions.avgResponseTime : 0;
    const variabilityScore = responseCV > 0.5 ? 0.2 : 0.1;

    return Math.min(speedScore + switchScore + variabilityScore, 1.0);
  }

  getContentRecommendation(style: LearningStyle): {
    emphasize: string[];
    avoid: string[];
  } {
    const recommendations: Record<LearningStyle, { emphasize: string[]; avoid: string[] }> = {
      visual: {
        emphasize: ['图片', '图表', '视觉化例句', '颜色标记'],
        avoid: ['纯文字', '长段落'],
      },
      auditory: {
        emphasize: ['发音音频', '韵律记忆', '口语例句'],
        avoid: ['无声阅读', '纯视觉内容'],
      },
      kinesthetic: {
        emphasize: ['互动练习', '打字输入', '拖拽排序', '游戏化'],
        avoid: ['被动阅读', '长时等待'],
      },
      mixed: {
        emphasize: ['多样化内容', '组合呈现'],
        avoid: [],
      },
    };

    return recommendations[style];
  }
}

// ==================== 疲劳恢复模型 ====================

export interface FatigueRecoveryState {
  lastSessionEnd: number | null;
  accumulatedFatigue: number;
}

export class FatigueRecoveryModel {
  private lastSessionEnd: Date | null = null;
  private accumulatedFatigue: number = 0;
  private readonly recoveryRate = 0.3;
  private readonly minRecoveryTime = 300;

  computeRecoveredFatigue(currentFatigue?: number, now: Date = new Date()): number {
    if (!this.lastSessionEnd) {
      return currentFatigue ?? 0;
    }

    const fatigueToRecover = currentFatigue ?? this.accumulatedFatigue;
    const restDuration = now.getTime() - this.lastSessionEnd.getTime();
    const restSeconds = restDuration / 1000;

    if (restSeconds < this.minRecoveryTime) {
      return fatigueToRecover;
    }

    const restHours = restSeconds / 3600;
    const recovered = fatigueToRecover * Math.exp(-this.recoveryRate * restHours);

    return Math.max(0, Math.min(1, recovered));
  }

  markSessionEnd(fatigue: number): void {
    this.lastSessionEnd = new Date();
    this.accumulatedFatigue = fatigue;
  }

  getAccumulatedFatigue(): number {
    return this.accumulatedFatigue;
  }

  getLastSessionEnd(): Date | null {
    return this.lastSessionEnd;
  }

  predictFatigueAfterBreak(currentFatigue: number, breakMinutes: number): number {
    if (breakMinutes < this.minRecoveryTime / 60) {
      return currentFatigue;
    }

    const breakHours = breakMinutes / 60;
    const predicted = currentFatigue * Math.exp(-this.recoveryRate * breakHours);

    return Math.max(0, Math.min(1, predicted));
  }

  computeRequiredBreakTime(currentFatigue: number, targetFatigue: number): number {
    if (currentFatigue <= targetFatigue) {
      return 0;
    }

    const safeTargetFatigue = Math.max(targetFatigue, 1e-10);
    const requiredHours = -Math.log(safeTargetFatigue / currentFatigue) / this.recoveryRate;
    const requiredMinutes = Math.ceil(requiredHours * 60);

    return Math.max(this.minRecoveryTime / 60, requiredMinutes);
  }

  getState(): FatigueRecoveryState {
    return {
      lastSessionEnd: this.lastSessionEnd?.getTime() || null,
      accumulatedFatigue: this.accumulatedFatigue,
    };
  }

  setState(state: FatigueRecoveryState): void {
    this.lastSessionEnd = state.lastSessionEnd ? new Date(state.lastSessionEnd) : null;
    this.accumulatedFatigue = state.accumulatedFatigue;
  }

  reset(): void {
    this.lastSessionEnd = null;
    this.accumulatedFatigue = 0;
  }
}

// ==================== ACT-R 记忆模型 (从 modeling/ 迁移) ====================

/**
 * 重新导出 ACT-R 记忆模型
 * 注意：实际实现已迁移到 models/actr-memory.ts
 */
export {
  ACTRMemoryModel,
  type ACTROptions,
  type ACTRState,
  type ACTRContext,
  type ReviewTrace,
  type ActivationResult,
  type RecallPrediction,
  type IntervalPrediction,
  type CognitiveProfile as ACTRCognitiveProfile,
  computeActivation,
  computeRecallProbability,
  computeOptimalInterval,
  defaultACTRMemoryModel,
} from './actr-memory';

/**
 * 重新导出 ACT-R Native 包装器
 * 注意：实际实现已迁移到 models/actr-memory-native.ts
 */
export {
  ACTRMemoryNativeWrapper,
  createACTRMemoryNativeWrapper,
  createACTRMemoryNativeWrapperFallback,
  type ACTRWrapperConfig,
  type ACTRWrapperStats,
} from './actr-memory-native';
