/**
 * AMAS Engine - 自适应多维度用户感知智能学习算法引擎
 *
 * 核心编排引擎，整合所有模块：
 * - 感知层：特征构建
 * - 建模层：A/F/C/M状态推断
 * - 学习层：LinUCB动作选择
 * - 决策层：策略映射和安全约束
 */

import { FeatureBuilder, EnhancedFeatureBuilder } from './perception/feature-builder';
import { AttentionMonitor, AttentionFeatures } from './modeling/attention-monitor';
import { FatigueEstimator } from './modeling/fatigue-estimator';
import { CognitiveProfiler } from './modeling/cognitive-profiler';
import { MotivationTracker } from './modeling/motivation-tracker';
import { LinUCB } from './learning/linucb';
import { mapActionToStrategy } from './decision/mapper';
import { applyGuardrails, shouldSuggestBreak } from './decision/guardrails';
import { generateExplanation, generateSuggestion } from './decision/explain';
import { intelligentFallback, FallbackReason } from './decision/fallback';
import {
  ACTION_SPACE,
  DEFAULT_STRATEGY,
  DEFAULT_PERCEPTION_CONFIG,
  REWARD_WEIGHTS,
  REFERENCE_RESPONSE_TIME
} from './config/action-space';
import { CircuitBreaker, createDefaultCircuitBreaker } from './common/circuit-breaker';
import { telemetry } from './common/telemetry';
import {
  Action,
  BanditModel,
  FeatureVector,
  PersistableFeatureVector,
  RawEvent,
  StrategyParams,
  UserState,
  ColdStartPhase
} from './types';

// ==================== 存储接口 ====================

/**
 * 状态存储接口
 */
export interface StateRepository {
  loadState(userId: string): Promise<UserState | null>;
  saveState(userId: string, state: UserState): Promise<void>;
}

/**
 * 模型存储接口
 */
export interface ModelRepository {
  loadModel(userId: string): Promise<BanditModel | null>;
  saveModel(userId: string, model: BanditModel): Promise<void>;
}

/**
 * 日志接口
 */
export interface Logger {
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

// ==================== 内存存储实现 ====================

class MemoryStateRepository implements StateRepository {
  private store = new Map<string, UserState>();

  async loadState(userId: string): Promise<UserState | null> {
    return this.store.get(userId) ?? null;
  }

  async saveState(userId: string, state: UserState): Promise<void> {
    this.store.set(userId, state);
  }
}

class MemoryModelRepository implements ModelRepository {
  private store = new Map<string, BanditModel>();

  async loadModel(userId: string): Promise<BanditModel | null> {
    return this.store.get(userId) ?? null;
  }

  async saveModel(userId: string, model: BanditModel): Promise<void> {
    this.store.set(userId, model);
  }
}

// ==================== 类型定义 ====================

/**
 * 引擎依赖
 */
export interface EngineDependencies {
  featureBuilder?: FeatureBuilder;
  attention?: AttentionMonitor;
  fatigue?: FatigueEstimator;
  cognitive?: CognitiveProfiler;
  motivation?: MotivationTracker;
  bandit?: LinUCB;
  stateRepo?: StateRepository;
  modelRepo?: ModelRepository;
  logger?: Logger;
}

/**
 * 处理选项
 */
export interface ProcessOptions {
  /** 当前策略参数 */
  currentParams?: StrategyParams;
  /** 交互次数 */
  interactionCount?: number;
  /** 近期正确率 */
  recentAccuracy?: number;
  /** 是否跳过模型更新 */
  skipUpdate?: boolean;
}

/**
 * 处理结果
 */
export interface ProcessResult {
  /** 输出策略参数 */
  strategy: StrategyParams;
  /** 选择的动作 */
  action: Action;
  /** 决策解释 */
  explanation: string;
  /** 用户状态 */
  state: UserState;
  /** 奖励值 */
  reward: number;
  /** 建议文本 */
  suggestion: string | null;
  /** 是否建议休息 */
  shouldBreak: boolean;
  /** 特征向量 (用于延迟奖励持久化) */
  featureVector?: PersistableFeatureVector;
}

// ==================== 工具函数 ====================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ==================== AMAS引擎 ====================

/**
 * AMAS引擎
 *
 * 核心工作流：
 * 1. 接收原始事件
 * 2. 特征提取（感知层）
 * 3. 状态推断（建模层）
 * 4. 动作选择（学习层）
 * 5. 策略映射（决策层）
 * 6. 返回结果并更新模型
 */
export class AMASEngine {
  private featureBuilder: FeatureBuilder;
  private attention: AttentionMonitor;
  private fatigue: FatigueEstimator;
  private cognitive: CognitiveProfiler;
  private motivation: MotivationTracker;
  private bandit: LinUCB;
  private stateRepo: StateRepository;
  private modelRepo: ModelRepository;
  private logger?: Logger;
  private circuit: CircuitBreaker;

  // 运行时状态
  private interactionCounts = new Map<string, number>();

  constructor(deps: EngineDependencies = {}) {
    this.featureBuilder = deps.featureBuilder ?? new FeatureBuilder(DEFAULT_PERCEPTION_CONFIG);
    this.attention = deps.attention ?? new AttentionMonitor();
    this.fatigue = deps.fatigue ?? new FatigueEstimator();
    this.cognitive = deps.cognitive ?? new CognitiveProfiler();
    this.motivation = deps.motivation ?? new MotivationTracker();
    this.bandit = deps.bandit ?? new LinUCB();
    this.stateRepo = deps.stateRepo ?? new MemoryStateRepository();
    this.modelRepo = deps.modelRepo ?? new MemoryModelRepository();
    this.logger = deps.logger;

    // 初始化熔断器
    this.circuit = createDefaultCircuitBreaker(
      (evt) => {
        telemetry.record('amas.circuit.event', evt);
      },
      (from, to) => {
        telemetry.record('amas.circuit.transition', { from, to });
        this.logger?.warn(`Circuit breaker transition: ${from} → ${to}`);
      }
    );
  }

  /**
   * 处理学习事件(带弹性保护)
   */
  async processEvent(
    userId: string,
    rawEvent: RawEvent,
    opts: ProcessOptions = {}
  ): Promise<ProcessResult> {
    // 熔断器检查
    if (!this.circuit.canExecute()) {
      telemetry.increment('amas.degradation', { reason: 'circuit_open' });
      this.logger?.warn('Circuit breaker is open', { userId });
      return this.createIntelligentFallbackResult(userId, 'circuit_open', opts);
    }

    const startTime = Date.now();

    try {
      // 使用超时保护执行决策
      const result = await this.executeWithTimeout(
        () => this.processEventCore(userId, rawEvent, opts),
        100, // 100ms超时
        userId
      );

      // 记录成功
      this.circuit.recordSuccess();
      telemetry.histogram('amas.decision.latency', Date.now() - startTime);

      return result;
    } catch (error) {
      // 记录失败
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.circuit.recordFailure(errorMessage);
      telemetry.increment('amas.degradation', {
        reason: 'exception',
        message: errorMessage
      });

      this.logger?.error('Error processing event', { userId, error });
      return this.createIntelligentFallbackResult(userId, 'exception', opts);
    }
  }

  /**
   * 核心处理逻辑(无弹性保护)
   */
  private async processEventCore(
    userId: string,
    rawEvent: RawEvent,
    opts: ProcessOptions = {}
  ): Promise<ProcessResult> {
    try {
      // 1. 异常检测
      if (this.featureBuilder.isAnomalous(rawEvent)) {
        this.logger?.warn('Anomalous event detected', { userId, event: rawEvent });
        return this.createIntelligentFallbackResult(userId, 'degraded_state', opts);
      }

      // 2. 加载状态和模型
      const prevState = await this.loadOrCreateState(userId);
      await this.loadModelIfExists(userId);

      // 3. 特征提取
      const featureVec = this.featureBuilder.buildFeatureVector(rawEvent);

      // 4. 状态更新
      const state = this.updateUserState(prevState, featureVec, rawEvent);

      // 5. 获取上下文信息
      const interactionCount = this.getInteractionCount(userId, opts.interactionCount);
      const recentAccuracy = opts.recentAccuracy ?? 0.5;

      // 6. 设置冷启动探索率
      const alpha = this.bandit.getColdStartAlpha(interactionCount, recentAccuracy, state.F);
      this.bandit.setAlpha(alpha);

      // 7. 动作选择
      const context = {
        recentErrorRate: 1 - recentAccuracy,
        recentResponseTime: rawEvent.responseTime,
        timeBucket: this.getTimeBucket(rawEvent.timestamp)
      };
      const action = this.bandit.selectFromActionSpace(state, context);

      // 8. 策略映射和安全约束
      const currentParams = opts.currentParams ?? DEFAULT_STRATEGY;
      const mappedParams = mapActionToStrategy(action, currentParams);
      const finalStrategy = applyGuardrails(state, mappedParams);

      // 9. 生成解释
      const explanation = generateExplanation(state, currentParams, finalStrategy);
      const suggestion = generateSuggestion(state);

      // 10. 计算奖励
      const reward = this.computeReward(rawEvent, state);

      // 11. 更新模型（除非跳过）
      if (!opts.skipUpdate) {
        this.bandit.update(state, action, reward, context);
        this.incrementInteractionCount(userId);
      }

      // 12. 持久化
      await this.stateRepo.saveState(userId, state);
      await this.modelRepo.saveModel(userId, this.bandit.getModel());

      // 13. 记录性能
      const elapsed = Date.now() - startTime;
      if (elapsed > 100) {
        this.logger?.warn('Decision exceeded 100ms', { userId, elapsed });
      }

      // 构建可序列化的特征向量（带空值防护）
      let persistableFeatureVector: PersistableFeatureVector | undefined;
      if (featureVec && featureVec.values && featureVec.values.length > 0) {
        const { FEATURE_VERSION } = await import('./config/action-space');
        persistableFeatureVector = {
          values: Array.from(featureVec.values),
          version: FEATURE_VERSION, // 使用配置的特征版本 (v1=12维, v2=22维)
          normMethod: 'z-score', // 默认归一化方法
          ts: featureVec.ts,
          labels: featureVec.labels
        };
      }

      return {
        strategy: finalStrategy,
        action,
        explanation,
        state,
        reward,
        suggestion,
        shouldBreak: shouldSuggestBreak(state),
        featureVector: persistableFeatureVector
      };

    } catch (error) {
      this.logger?.error('Error processing event', { userId, error });
      return this.createFallbackResult(userId);
    }
  }

  /**
   * 获取当前用户状态
   */
  async getState(userId: string): Promise<UserState | null> {
    return this.stateRepo.loadState(userId);
  }

  /**
   * 重置用户状态
   */
  async resetUser(userId: string): Promise<void> {
    this.attention.reset();
    this.fatigue.reset();
    this.cognitive.reset();
    this.motivation.reset();
    this.bandit.reset();
    this.interactionCounts.set(userId, 0);

    const defaultState = this.createDefaultState();
    await this.stateRepo.saveState(userId, defaultState);
    await this.modelRepo.saveModel(userId, this.bandit.getModel());
  }

  /**
   * 获取冷启动阶段
   */
  getColdStartPhase(userId: string): ColdStartPhase {
    const count = this.interactionCounts.get(userId) ?? 0;
    if (count < 15) return 'classify';
    if (count < 50) return 'explore';
    return 'normal';
  }

  // ==================== 私有方法 ====================

  private async loadOrCreateState(userId: string): Promise<UserState> {
    const state = await this.stateRepo.loadState(userId);
    return state ?? this.createDefaultState();
  }

  private async loadModelIfExists(userId: string): Promise<void> {
    const model = await this.modelRepo.loadModel(userId);
    if (model) {
      this.bandit.setModel(model);
    }
  }

  private createDefaultState(): UserState {
    return {
      A: 0.7,
      F: 0.1,
      C: { mem: 0.5, speed: 0.5, stability: 0.5 },
      M: 0,
      conf: 0.5,
      ts: Date.now()
    };
  }

  private updateUserState(
    prevState: UserState,
    featureVec: FeatureVector,
    event: RawEvent
  ): UserState {
    // 转换特征为注意力输入
    const attentionFeatures = this.extractAttentionFeatures(featureVec);
    const A = this.attention.update(attentionFeatures);

    // 疲劳度更新
    const F = this.fatigue.update({
      error_rate_trend: event.isCorrect ? -0.05 : 0.1,
      rt_increase_rate: featureVec.values[0],
      repeat_errors: event.retryCount
    });

    // 认知能力更新
    const C = this.cognitive.update({
      accuracy: event.isCorrect ? 1 : 0,
      avgResponseTime: event.responseTime,
      errorVariance: 0.1 // 简化处理
    });

    // 动机更新
    const M = this.motivation.update({
      successes: event.isCorrect ? 1 : 0,
      failures: event.isCorrect ? 0 : 1,
      quits: 0
    });

    return {
      ...prevState,
      A,
      F,
      C,
      M,
      ts: event.timestamp,
      conf: Math.min(1, prevState.conf + 0.01)
    };
  }

  private extractAttentionFeatures(featureVec: FeatureVector): AttentionFeatures {
    const v = featureVec.values;
    return {
      z_rt_mean: v[0],
      z_rt_cv: v[1],
      z_pace_cv: v[2],
      z_pause: v[3],
      z_switch: v[4],
      z_drift: v[5],
      interaction_density: v[6],
      focus_loss_duration: v[7]
    };
  }

  private computeReward(event: RawEvent, state: UserState): number {
    const { correct, fatigue, speed, frustration } = REWARD_WEIGHTS;

    const correctValue = event.isCorrect ? 1 : -1;
    const fatiguePenalty = state.F;
    const speedGain = clamp(
      REFERENCE_RESPONSE_TIME / Math.max(event.responseTime, 1000) - 1,
      -1,
      1
    );
    const frustrationValue = (event.retryCount > 1 || state.M < 0) ? 1 : 0;

    const rawReward =
      correct * correctValue -
      fatigue * fatiguePenalty +
      speed * speedGain -
      frustration * frustrationValue;

    // 归一化到 [-1, 1]
    return clamp(rawReward / 2, -1, 1);
  }

  private getTimeBucket(timestamp: number): number {
    const hour = new Date(timestamp).getHours();
    // 简单分桶: 早(0)/午(1)/晚(2)
    if (hour < 12) return 0;
    if (hour < 18) return 1;
    return 2;
  }

  private getInteractionCount(userId: string, provided?: number): number {
    if (provided !== undefined) return provided;
    return this.interactionCounts.get(userId) ?? 0;
  }

  private incrementInteractionCount(userId: string): void {
    const current = this.interactionCounts.get(userId) ?? 0;
    this.interactionCounts.set(userId, current + 1);
  }

  /**
   * 执行超时保护
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    userId: string
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        telemetry.increment('amas.timeout', { path: 'decision' });
        this.logger?.warn('Decision timeout', { userId, timeoutMs });
        reject(new Error(`Timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      clearTimeout(timeoutHandle!);
      return result;
    } catch (error) {
      clearTimeout(timeoutHandle!);
      throw error;
    }
  }

  /**
   * 创建智能降级结果
   */
  private async createIntelligentFallbackResult(
    userId: string,
    reason: FallbackReason,
    opts: ProcessOptions = {}
  ): Promise<ProcessResult> {
    const state = await this.loadOrCreateState(userId);
    const interactionCount = this.getInteractionCount(userId, opts.interactionCount);
    const recentErrorRate = opts.recentAccuracy ? 1 - opts.recentAccuracy : undefined;

    // 使用智能降级策略
    const fallbackResult = intelligentFallback(state, reason, {
      interactionCount,
      recentErrorRate,
      hour: new Date().getHours()
    });

    return {
      strategy: fallbackResult.strategy,
      action: ACTION_SPACE[0], // 使用第一个动作作为占位
      explanation: fallbackResult.explanation,
      state,
      reward: 0,
      suggestion: null,
      shouldBreak: false
    };
  }

  /**
   * 创建简单降级结果(向后兼容)
   * @deprecated 使用 createIntelligentFallbackResult 代替
   */
  private async createFallbackResult(userId: string): Promise<ProcessResult> {
    return this.createIntelligentFallbackResult(userId, 'degraded_state');
  }
}

// ==================== 导出默认实例 ====================

export const defaultAMASEngine = new AMASEngine();
