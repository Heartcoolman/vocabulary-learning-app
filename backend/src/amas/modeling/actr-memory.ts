/**
 * AMAS Modeling Layer - ACT-R Memory Model
 * ACT-R认知架构中的记忆模型
 *
 * 核心理论:
 * - 基于Anderson的ACT-R认知架构
 * - 激活度模型：记忆项的可访问性随时间衰减
 * - 回忆概率模型：激活度决定回忆成功概率
 * - 最优间隔：找到使回忆概率降到目标值的时间点
 *
 * 数学公式:
 * - 激活度: A = ln(Σ t_j^(-d)) + ε
 *   - t_j: 第j次复习距今的时间（秒）
 *   - d: 衰减率（通常0.5）
 *   - ε: 高斯噪声
 *
 * - 回忆概率: P = 1 / (1 + exp(-(A-τ)/s))
 *   - τ: 回忆阈值
 *   - s: 噪声缩放
 *
 * 参考文献:
 * - Anderson, J. R., & Lebiere, C. (1998). The atomic components of thought.
 * - Pavlik Jr, P. I., & Anderson, J. R. (2005). Practice and forgetting effects.
 */

import { Action, UserState } from '../types';
import {
  BaseLearner,
  BaseLearnerContext,
  ActionSelection,
  LearnerCapabilities
} from '../learning/base-learner';

// ==================== 类型定义 ====================

/**
 * 复习记录
 */
export interface ReviewTrace {
  /** 距今时间（秒） */
  secondsAgo: number;
  /** 是否正确（可选，用于调整衰减率） */
  isCorrect?: boolean;
}

/**
 * ACT-R模型配置
 */
export interface ACTROptions {
  /** 衰减率d（默认0.5，文献推荐值） */
  decay?: number;
  /** 回忆阈值τ（默认0.3） */
  threshold?: number;
  /** 噪声缩放s（默认0.4） */
  noiseScale?: number;
  /** 噪声采样函数（默认标准正态） */
  noiseSampler?: () => number;
  /** 最优间隔搜索上限（秒，默认7天） */
  maxSearchSeconds?: number;
  /** 二分搜索精度 */
  tolerance?: number;
}

/**
 * ACT-R上下文（扩展基础上下文）
 */
export interface ACTRContext extends BaseLearnerContext {
  /** 单词的复习轨迹 */
  trace: ReviewTrace[];
  /** 目标回忆概率（用于计算最优间隔） */
  targetProbability?: number;
}

/**
 * ACT-R模型持久化状态
 */
export interface ACTRState {
  /** 衰减率 */
  decay: number;
  /** 回忆阈值 */
  threshold: number;
  /** 噪声缩放 */
  noiseScale: number;
  /** 更新计数 */
  updateCount: number;
}

/**
 * 激活度计算结果
 */
export interface ActivationResult {
  /** 基础激活度（不含噪声） */
  baseActivation: number;
  /** 含噪声的激活度 */
  activation: number;
  /** 回忆概率 */
  recallProbability: number;
}

// ==================== 常量 ====================

/** 默认衰减率（Anderson推荐值） */
const DEFAULT_DECAY = 0.5;

/** 默认回忆阈值 */
const DEFAULT_THRESHOLD = 0.3;

/** 默认噪声缩放 */
const DEFAULT_NOISE_SCALE = 0.4;

/** 最小时间间隔（秒），防止log(0) */
const MIN_TIME = 1e-3;

/** 最大搜索时间（7天） */
const MAX_SEARCH_SECONDS = 7 * 24 * 3600;

/** 二分搜索最大迭代次数 */
const MAX_SEARCH_ITERATIONS = 60;

/**
 * 错误复习惩罚因子
 * 错误的复习尝试对记忆强化效果较弱
 * 参考: Pavlik & Anderson (2005) - 错误反馈的效果约为正确反馈的30%
 */
const ERROR_PENALTY = 0.3;

// ==================== 实现 ====================

/**
 * ACT-R记忆模型
 *
 * 适用场景:
 * - 预测单词的遗忘曲线
 * - 计算最优复习间隔
 * - 长期记忆保持率优化
 */
export class ACTRMemoryModel
  implements BaseLearner<UserState, Action, ACTRContext, ACTRState>
{
  private static readonly NAME = 'ACTRMemoryModel';
  private static readonly VERSION = '1.0.0';

  /** 模型参数 */
  private decay: number;
  private threshold: number;
  private noiseScale: number;
  private noiseSampler: () => number;
  private maxSearchSeconds: number;
  private tolerance: number;

  /** 更新计数 */
  private updateCount = 0;

  constructor(options: ACTROptions = {}) {
    this.decay = options.decay ?? DEFAULT_DECAY;
    this.threshold = options.threshold ?? DEFAULT_THRESHOLD;
    this.noiseScale = options.noiseScale ?? DEFAULT_NOISE_SCALE;
    this.noiseSampler = options.noiseSampler ?? this.sampleStandardNormal.bind(this);
    this.maxSearchSeconds = options.maxSearchSeconds ?? MAX_SEARCH_SECONDS;
    this.tolerance = options.tolerance ?? 1e-3;
  }

  // ==================== BaseLearner接口实现 ====================

  /**
   * 选择动作
   *
   * 策略: 根据回忆概率选择难度
   * - 回忆概率低 → 选择更简单的动作
   * - 回忆概率高 → 选择更挑战的动作
   */
  selectAction(
    _state: UserState,
    actions: Action[],
    context: ACTRContext
  ): ActionSelection<Action> {
    if (!actions || actions.length === 0) {
      throw new Error('[ACTRMemoryModel] 动作列表不能为空');
    }

    const result = this.computeFullActivation(context.trace);
    const prob = result.recallProbability;

    // 按难度排序（从易到难）
    const sorted = [...actions].sort(
      (a, b) => this.computeDifficultyScore(a) - this.computeDifficultyScore(b)
    );

    // 回忆概率低时选简单动作，高时选难动作
    let selectedAction: Action;
    if (prob < 0.3) {
      selectedAction = sorted[0]; // 最简单
    } else if (prob < 0.7) {
      selectedAction = sorted[Math.floor(sorted.length / 2)]; // 中等
    } else {
      selectedAction = sorted[sorted.length - 1]; // 最难
    }

    // 置信度：与0.5的距离越大，置信度越高
    const confidence = Math.min(1, Math.abs(prob - 0.5) * 2);

    return {
      action: selectedAction,
      score: prob,
      confidence,
      meta: {
        baseActivation: result.baseActivation,
        activation: result.activation,
        recallProbability: prob,
        traceLength: context.trace?.length ?? 0
      }
    };
  }

  /**
   * 更新模型
   *
   * 注意: ACT-R模型本身不存储复习历史
   * 复习轨迹由上层（如单词记录服务）管理
   */
  update(
    _state: UserState,
    _action: Action,
    _reward: number,
    _context: ACTRContext
  ): void {
    this.updateCount += 1;
  }

  /**
   * 获取状态（用于持久化）
   */
  getState(): ACTRState {
    return {
      decay: this.decay,
      threshold: this.threshold,
      noiseScale: this.noiseScale,
      updateCount: this.updateCount
    };
  }

  /**
   * 恢复状态
   */
  setState(state: ACTRState): void {
    if (!state) {
      console.warn('[ACTRMemoryModel] 无效状态，跳过恢复');
      return;
    }

    this.decay = this.validateParam(state.decay, DEFAULT_DECAY, 0.1, 1.0);
    this.threshold = this.validateParam(state.threshold, DEFAULT_THRESHOLD, -1, 2);
    this.noiseScale = this.validateParam(state.noiseScale, DEFAULT_NOISE_SCALE, 0.1, 2);
    this.updateCount = Math.max(0, state.updateCount ?? 0);
  }

  /**
   * 重置模型
   */
  reset(): void {
    this.updateCount = 0;
  }

  getName(): string {
    return ACTRMemoryModel.NAME;
  }

  getVersion(): string {
    return ACTRMemoryModel.VERSION;
  }

  getCapabilities(): LearnerCapabilities {
    return {
      supportsOnlineLearning: true,
      supportsBatchUpdate: false,
      requiresPretraining: false,
      minSamplesForReliability: 1,
      primaryUseCase: '基于认知科学的记忆衰减建模，适合长期记忆保持率优化'
    };
  }

  getUpdateCount(): number {
    return this.updateCount;
  }

  // ==================== 核心算法 ====================

  /**
   * 计算激活度 A = ln(Σ w_j * t_j^(-d)) + ε
   *
   * 错误复习的贡献会被惩罚（乘以ERROR_PENALTY因子）
   * 这符合ACT-R理论：错误的检索尝试对记忆强化效果较弱
   *
   * @param trace 复习轨迹
   * @param decay 衰减率（可选，使用实例默认值）
   * @param addNoise 是否添加噪声
   * @returns 激活度值
   */
  computeActivation(
    trace: ReviewTrace[],
    decay = this.decay,
    addNoise = true
  ): number {
    if (!trace || trace.length === 0) {
      return -Infinity;
    }

    let sum = 0;
    for (const { secondsAgo, isCorrect } of trace) {
      // 确保时间为正数
      const t = Math.max(secondsAgo, MIN_TIME);
      // 错误复习应用惩罚因子（isCorrect未定义视为正确，向后兼容）
      const weight = isCorrect === false ? ERROR_PENALTY : 1.0;
      sum += weight * Math.pow(t, -decay);
    }

    if (sum <= 0 || !Number.isFinite(sum)) {
      return -Infinity;
    }

    const baseActivation = Math.log(sum);
    const noise = addNoise ? this.noiseSampler() * this.noiseScale : 0;

    const activation = baseActivation + noise;
    return Number.isFinite(activation) ? activation : -Infinity;
  }

  /**
   * 计算完整激活度信息（含基础值和回忆概率）
   * 错误复习的贡献会被惩罚（乘以ERROR_PENALTY因子）
   */
  computeFullActivation(trace: ReviewTrace[]): ActivationResult {
    if (!trace || trace.length === 0) {
      return {
        baseActivation: -Infinity,
        activation: -Infinity,
        recallProbability: 0
      };
    }

    let sum = 0;
    for (const { secondsAgo, isCorrect } of trace) {
      const t = Math.max(secondsAgo, MIN_TIME);
      // 错误复习应用惩罚因子（isCorrect未定义视为正确，向后兼容）
      const weight = isCorrect === false ? ERROR_PENALTY : 1.0;
      sum += weight * Math.pow(t, -this.decay);
    }

    if (sum <= 0 || !Number.isFinite(sum)) {
      return {
        baseActivation: -Infinity,
        activation: -Infinity,
        recallProbability: 0
      };
    }

    const baseActivation = Math.log(sum);
    const noise = this.noiseSampler() * this.noiseScale;
    const activation = baseActivation + noise;
    const recallProbability = this.computeRecallProbability(activation);

    return {
      baseActivation,
      activation,
      recallProbability
    };
  }

  /**
   * 计算回忆概率 P = 1 / (1 + exp(-(A-τ)/s))
   *
   * @param activation 激活度
   * @param threshold 回忆阈值（可选）
   * @param noiseScale 噪声缩放（可选）
   * @returns 回忆概率 [0,1]
   */
  computeRecallProbability(
    activation: number,
    threshold = this.threshold,
    noiseScale = this.noiseScale
  ): number {
    if (!Number.isFinite(activation)) {
      return 0;
    }

    const s = Math.max(noiseScale, 1e-6);
    const z = (activation - threshold) / s;
    const prob = 1 / (1 + Math.exp(-z));

    return Number.isFinite(prob) ? this.clamp(prob, 0, 1) : 0;
  }

  /**
   * 计算最优复习间隔
   *
   * 使用二分搜索找到使回忆概率降到目标值的时间
   *
   * @param trace 当前复习轨迹
   * @param targetProbability 目标回忆概率（如0.7表示70%时复习）
   * @param decay 衰减率（可选）
   * @returns 最优间隔（秒）
   */
  computeOptimalInterval(
    trace: ReviewTrace[],
    targetProbability: number,
    decay = this.decay
  ): number {
    const target = this.clamp(targetProbability, 0.01, 0.99);

    // 计算当前激活度
    const currentActivation = this.computeActivation(trace, decay, false);
    if (!Number.isFinite(currentActivation)) {
      return 0;
    }

    // 当前回忆概率
    const currentProb = this.computeRecallProbability(currentActivation);
    if (currentProb <= target) {
      return 0; // 已经低于目标，应立即复习
    }

    // 二分搜索
    let low = 0;
    let high = this.maxSearchSeconds;

    for (let i = 0; i < MAX_SEARCH_ITERATIONS; i++) {
      const mid = (low + high) / 2;

      // 计算mid秒后的激活度
      const futureTrace = trace.map(r => ({
        ...r,
        secondsAgo: r.secondsAgo + mid
      }));
      const futureActivation = this.computeActivation(futureTrace, decay, false);
      const futureProb = this.computeRecallProbability(futureActivation);

      if (Math.abs(futureProb - target) < this.tolerance) {
        return mid;
      }

      if (futureProb > target) {
        // 概率仍然太高，需要更长时间
        low = mid;
      } else {
        // 概率已经太低，缩短时间
        high = mid;
      }
    }

    return (low + high) / 2;
  }

  /**
   * 计算记忆强度（归一化的激活度）
   *
   * @param trace 复习轨迹
   * @returns 记忆强度 [0,1]
   */
  computeMemoryStrength(trace: ReviewTrace[]): number {
    const activation = this.computeActivation(trace, this.decay, false);
    if (!Number.isFinite(activation)) {
      return 0;
    }
    // 将激活度映射到[0,1]，使用sigmoid
    return this.computeRecallProbability(activation);
  }

  // ==================== 辅助方法 ====================

  /**
   * 计算动作难度分数（用于策略选择）
   */
  private computeDifficultyScore(action: Action): number {
    const diffWeight =
      action.difficulty === 'hard' ? 2 : action.difficulty === 'mid' ? 1 : 0;
    return (
      action.interval_scale +
      diffWeight +
      action.new_ratio * 2 -
      action.hint_level * 0.3
    );
  }

  /**
   * 标准正态分布采样（Box-Muller）
   */
  private sampleStandardNormal(): number {
    const u1 = Math.max(Math.random(), 1e-12);
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * 参数校验
   */
  private validateParam(
    value: unknown,
    fallback: number,
    min: number,
    max: number
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }
    return this.clamp(value, min, max);
  }

  /**
   * 数值截断
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  // ==================== 参数调整方法 ====================

  /**
   * 设置衰减率
   */
  setDecay(decay: number): void {
    this.decay = this.clamp(decay, 0.1, 1.0);
  }

  /**
   * 获取当前衰减率
   */
  getDecay(): number {
    return this.decay;
  }

  /**
   * 设置回忆阈值
   */
  setThreshold(threshold: number): void {
    this.threshold = threshold;
  }

  /**
   * 获取当前回忆阈值
   */
  getThreshold(): number {
    return this.threshold;
  }
}

// ==================== 便捷工具函数 ====================

/**
 * 计算激活度（独立函数）
 */
export function computeActivation(
  trace: ReviewTrace[],
  decay = DEFAULT_DECAY
): number {
  const model = new ACTRMemoryModel({ decay });
  return model.computeActivation(trace, decay, false);
}

/**
 * 计算回忆概率（独立函数）
 */
export function computeRecallProbability(
  activation: number,
  threshold = DEFAULT_THRESHOLD,
  noiseScale = DEFAULT_NOISE_SCALE
): number {
  const model = new ACTRMemoryModel({ threshold, noiseScale });
  return model.computeRecallProbability(activation, threshold, noiseScale);
}

/**
 * 计算最优间隔（独立函数）
 */
export function computeOptimalInterval(
  trace: ReviewTrace[],
  targetProbability: number,
  decay = DEFAULT_DECAY,
  threshold = DEFAULT_THRESHOLD,
  noiseScale = DEFAULT_NOISE_SCALE
): number {
  const model = new ACTRMemoryModel({ decay, threshold, noiseScale });
  return model.computeOptimalInterval(trace, targetProbability, decay);
}

// ==================== 导出默认实例 ====================

export const defaultACTRMemoryModel = new ACTRMemoryModel();
