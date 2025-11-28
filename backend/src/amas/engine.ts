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
import { TrendAnalyzer } from './modeling/trend-analyzer';
import { ACTRMemoryModel } from './modeling/actr-memory';
import { LinUCB } from './learning/linucb';
import { ColdStartManager } from './learning/coldstart';
import { ThompsonSampling } from './learning/thompson-sampling';
import { HeuristicLearner } from './learning/heuristic';
import { EnsembleLearningFramework, EnsembleContext } from './decision/ensemble';
import { mapActionToStrategy } from './decision/mapper';
import { UserParamsManager } from './config/user-params';
import {
  getFeatureFlags,
  isEnsembleEnabled,
  isColdStartEnabled,
  isTrendAnalyzerEnabled,
  isUserParamsManagerEnabled,
  getEnsembleLearnerFlags
} from './config/feature-flags';
import { applyGuardrails, shouldSuggestBreak } from './decision/guardrails';
import { generateExplanation, generateSuggestion } from './decision/explain';
import { intelligentFallback, FallbackReason } from './decision/fallback';
import {
  ACTION_SPACE,
  DEFAULT_STRATEGY,
  DEFAULT_PERCEPTION_CONFIG,
  REWARD_WEIGHTS,
  REFERENCE_RESPONSE_TIME,
  FEATURE_VERSION,
  DEFAULT_DIMENSION
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

// ==================== 用户隔离类型定义 ====================

/**
 * 决策模型类型 - 支持 LinUCB 或 Ensemble
 */
type DecisionModel = LinUCB | EnsembleLearningFramework;

/**
 * 用户专属模型实例集合
 * 每个用户拥有独立的建模层实例，避免跨用户状态污染
 */
interface UserModels {
  // 核心建模层
  attention: AttentionMonitor;
  fatigue: FatigueEstimator;
  cognitive: CognitiveProfiler;
  motivation: MotivationTracker;

  // 决策模型 (LinUCB 或 Ensemble)
  bandit: DecisionModel;

  // 扩展模块 (通过功能开关控制)
  trendAnalyzer: TrendAnalyzer | null;
  coldStart: ColdStartManager | null;
  thompson: ThompsonSampling | null;
  heuristic: HeuristicLearner | null;
  actrMemory: ACTRMemoryModel | null;
  userParams: UserParamsManager | null;
}

/**
 * 超时标志位
 * 用于在超时后阻止后续写入操作
 */
interface TimeoutFlag {
  value: boolean;
}

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
  bandit?: DecisionModel;
  stateRepo?: StateRepository;
  modelRepo?: ModelRepository;
  logger?: Logger;
  // 扩展模块依赖
  trendAnalyzer?: TrendAnalyzer;
  coldStartManager?: ColdStartManager;
  thompson?: ThompsonSampling;
  heuristic?: HeuristicLearner;
  actrMemory?: ACTRMemoryModel;
  userParamsManager?: UserParamsManager;
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
  private stateRepo: StateRepository;
  private modelRepo: ModelRepository;
  private logger?: Logger;
  private circuit: CircuitBreaker;

  // 用户隔离：每个用户拥有独立的模型实例
  private userModels = new Map<string, UserModels>();

  // 模型模板：用于创建新用户的模型实例
  private modelTemplates: UserModels;

  // 用户级锁：防止同一用户的并发请求冲突
  private userLocks = new Map<string, Promise<unknown>>();

  // 运行时状态
  private interactionCounts = new Map<string, number>();

  constructor(deps: EngineDependencies = {}) {
    this.featureBuilder = deps.featureBuilder ?? new FeatureBuilder(DEFAULT_PERCEPTION_CONFIG);

    // 获取功能开关配置
    const flags = getFeatureFlags();

    // 根据功能开关决定默认决策模型
    const defaultBandit: DecisionModel = deps.bandit ??
      (flags.enableEnsemble
        ? new EnsembleLearningFramework()
        : new LinUCB());

    // 初始化模型模板（用于克隆给新用户）
    this.modelTemplates = {
      // 核心建模层
      attention: deps.attention ?? new AttentionMonitor(),
      fatigue: deps.fatigue ?? new FatigueEstimator(),
      cognitive: deps.cognitive ?? new CognitiveProfiler(),
      motivation: deps.motivation ?? new MotivationTracker(),
      bandit: defaultBandit,

      // 扩展模块 (根据功能开关初始化)
      trendAnalyzer: flags.enableTrendAnalyzer
        ? (deps.trendAnalyzer ?? new TrendAnalyzer())
        : null,
      coldStart: flags.enableColdStartManager
        ? (deps.coldStartManager ?? new ColdStartManager())
        : null,
      thompson: flags.enableThompsonSampling
        ? (deps.thompson ?? new ThompsonSampling())
        : null,
      heuristic: flags.enableHeuristicBaseline
        ? (deps.heuristic ?? new HeuristicLearner())
        : null,
      actrMemory: flags.enableACTRMemory
        ? (deps.actrMemory ?? new ACTRMemoryModel())
        : null,
      userParams: flags.enableUserParamsManager
        ? (deps.userParamsManager ?? new UserParamsManager())
        : null
    };

    // 生产环境强制要求数据库存储，防止数据丢失
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && (!deps.stateRepo || !deps.modelRepo)) {
      throw new Error(
        'AMAS Engine: 生产环境必须提供数据库存储仓库 (stateRepo/modelRepo)，' +
        '禁止使用内存存储以防止服务重启导致用户学习数据丢失'
      );
    }

    // 开发/测试环境可以使用内存存储，但会记录警告
    if (!isProduction && (!deps.stateRepo || !deps.modelRepo)) {
      console.warn(
        '[AMAS Engine] 警告：使用内存存储，数据在服务重启后会丢失。' +
        '生产环境请务必配置数据库存储。'
      );
    }

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
   *
   * 修复问题:
   * - #3: 使用用户级锁防止并发Lost Update
   * - #5: 异常统一在外层处理，正确记录熔断
   * - #6: 使用超时标志位阻止超时后的写入
   */
  async processEvent(
    userId: string,
    rawEvent: RawEvent,
    opts: ProcessOptions = {}
  ): Promise<ProcessResult> {
    // 使用用户级锁防止同一用户的并发请求冲突
    return this.withUserLock(userId, async () => {
      // 熔断器检查
      if (!this.circuit.canExecute()) {
        telemetry.increment('amas.degradation', { reason: 'circuit_open' });
        this.logger?.warn('Circuit breaker is open', { userId });
        return this.createIntelligentFallbackResult(userId, 'circuit_open', opts, rawEvent.timestamp);
      }

      const startTime = Date.now();
      const abortController = new AbortController();
      // 超时标志位：用于阻止超时后的写入操作
      const timedOut: TimeoutFlag = { value: false };

      try {
        // 使用超时保护执行决策
        const result = await this.executeWithTimeout(
          () => this.processEventCore(userId, rawEvent, opts, abortController.signal, timedOut),
          100, // 100ms超时
          userId,
          abortController,
          () => { timedOut.value = true; } // 超时回调
        );

        // 记录成功
        this.circuit.recordSuccess();
        telemetry.histogram('amas.decision.latency', Date.now() - startTime);

        return result;
      } catch (error) {
        // 记录失败（包括内部异常，修复#5熔断器误判）
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.circuit.recordFailure(errorMessage);
        telemetry.increment('amas.degradation', {
          reason: 'exception',
          message: errorMessage
        });

        this.logger?.error('Error processing event', { userId, error });
        return this.createIntelligentFallbackResult(userId, 'exception', opts, rawEvent.timestamp);
      }
    });
  }

  /**
   * 核心处理逻辑(无弹性保护)
   *
   * 修复问题:
   * - #1: 使用用户专属模型实例，避免跨用户污染
   * - #5: 移除内部try-catch，让异常传播到外层统一处理
   * - #6: 检查超时标志位，阻止超时后的写入
   * - #14: 使用参数传递userId，避免全局currentUserId竞态
   *
   * @param signal AbortSignal 用于取消操作
   * @param timedOut 超时标志位，用于阻止超时后的写入
   */
  private async processEventCore(
    userId: string,
    rawEvent: RawEvent,
    opts: ProcessOptions = {},
    signal?: AbortSignal,
    timedOut?: TimeoutFlag
  ): Promise<ProcessResult> {
    const startTime = Date.now();

    // 获取用户专属模型实例（修复#1跨用户污染）
    const models = this.getUserModels(userId);

    // 1. 异常检测
    if (this.featureBuilder.isAnomalous(rawEvent)) {
      this.logger?.warn('Anomalous event detected', { userId, event: rawEvent });
      return this.createIntelligentFallbackResult(userId, 'degraded_state', opts, rawEvent.timestamp);
    }

    // 2. 加载状态和模型
    const prevState = await this.loadOrCreateState(userId);
    await this.loadModelIfExists(userId, models.bandit);

    // 检查取消/超时状态
    if (signal?.aborted || timedOut?.value) {
      throw new Error('Operation cancelled');
    }

    // 3. 特征提取（使用参数传递userId，修复#14竞态）
    const featureVec = this.featureBuilder.buildFeatureVector(rawEvent, userId);

    // 4. 获取上下文信息 (提前到状态更新之前)
    const interactionCount = this.getInteractionCount(userId, opts.interactionCount);
    const recentAccuracy = opts.recentAccuracy ?? 0.5;
    const recentErrorRate = 1 - recentAccuracy;

    // 5. 状态更新（使用用户专属模型，修复#1）
    const state = this.updateUserState(prevState, featureVec, rawEvent, recentErrorRate, models);

    // 6. 构建决策上下文
    const baseContext = {
      recentErrorRate,
      recentResponseTime: rawEvent.responseTime,
      timeBucket: this.getTimeBucket(rawEvent.timestamp)
    };

    // 判断是否在冷启动阶段
    const coldStartEnabled = isColdStartEnabled() && models.coldStart !== null;
    const coldStartPhase = coldStartEnabled
      ? models.coldStart!.getPhase()
      : this.getColdStartPhase(userId);
    const inColdStartPhase = coldStartPhase !== 'normal';

    // 应用用户参数（如果启用）
    if (models.userParams && isUserParamsManagerEnabled()) {
      const params = models.userParams.getParams(userId);
      if (models.bandit instanceof LinUCB) {
        models.bandit.setAlpha(params.alpha);
      }
    } else if (models.bandit instanceof LinUCB && !inColdStartPhase) {
      // 使用默认冷启动探索率
      const alpha = models.bandit.getColdStartAlpha(interactionCount, recentAccuracy, state.F);
      models.bandit.setAlpha(alpha);
    }

    // 7. 动作选择 (根据启用的模块选择策略)
    let action: Action;
    let contextVec: Float32Array | undefined;

    if (inColdStartPhase && coldStartEnabled && models.coldStart) {
      // 冷启动阶段: 使用 ColdStartManager
      const selection = models.coldStart.selectAction(state, ACTION_SPACE, baseContext);
      action = selection.action;

      // 构建 LinUCB 上下文向量用于延迟奖励
      if (models.bandit instanceof LinUCB) {
        contextVec = models.bandit.buildContextVector({
          state,
          action,
          ...baseContext
        });
      } else if (models.bandit instanceof EnsembleLearningFramework) {
        // 从 Ensemble 内部的 LinUCB 构建上下文向量
        const ensembleState = models.bandit.getState();
        const internalLinUCB = new LinUCB();
        internalLinUCB.setModel(ensembleState.linucb);
        contextVec = internalLinUCB.buildContextVector({
          state,
          action,
          ...baseContext
        });
      }
    } else if (isEnsembleEnabled() && models.bandit instanceof EnsembleLearningFramework) {
      // 成熟阶段 + Ensemble 启用: 使用 EnsembleLearningFramework
      const ensembleContext: EnsembleContext = {
        phase: coldStartPhase,
        base: baseContext,
        linucb: baseContext,
        thompson: baseContext,
        actr: { ...baseContext, trace: [] },
        heuristic: baseContext
      };

      // 应用学习器功能开关
      const learnerFlags = getEnsembleLearnerFlags();
      const ensembleState = models.bandit.getState();
      const weights = { ...ensembleState.weights };
      if (!learnerFlags.thompson) weights.thompson = 0;
      if (!learnerFlags.actr) weights.actr = 0;
      if (!learnerFlags.heuristic) weights.heuristic = 0;
      models.bandit.setState({ ...ensembleState, weights });

      const selection = models.bandit.selectAction(state, ACTION_SPACE, ensembleContext);
      action = selection.action;

      // 构建 LinUCB 上下文向量用于延迟奖励（从 Ensemble 内部的 LinUCB）
      const internalLinUCB = new LinUCB();
      internalLinUCB.setModel(ensembleState.linucb);
      contextVec = internalLinUCB.buildContextVector({
        state,
        action,
        ...baseContext
      });
    } else {
      // 默认: 使用 LinUCB
      if (models.bandit instanceof LinUCB) {
        action = models.bandit.selectFromActionSpace(state, baseContext);
        contextVec = models.bandit.buildContextVector({
          state,
          action,
          ...baseContext
        });
      } else {
        // 回退到默认动作
        action = ACTION_SPACE[0];
      }
    }

    // 8. 策略映射和安全约束
    const currentParams = opts.currentParams ?? DEFAULT_STRATEGY;
    const mappedParams = mapActionToStrategy(action, currentParams);
    const finalStrategy = applyGuardrails(state, mappedParams);

    // 9. 生成解释
    const explanation = generateExplanation(state, currentParams, finalStrategy);
    const suggestion = generateSuggestion(state);

    // 10. 计算奖励
    const reward = this.computeReward(rawEvent, state);

    // 检查取消/超时状态（在模型更新前）
    if (signal?.aborted || timedOut?.value) {
      throw new Error('Operation cancelled');
    }

    // 11. 更新模型（除非跳过）
    if (!opts.skipUpdate) {
      // 更新决策模型
      if (models.bandit instanceof EnsembleLearningFramework) {
        const ensembleContext: EnsembleContext = {
          phase: coldStartPhase,
          base: baseContext,
          linucb: baseContext,
          thompson: baseContext,
          actr: { ...baseContext, trace: [] },
          heuristic: baseContext
        };
        models.bandit.update(state, action, reward, ensembleContext);
      } else if (models.bandit instanceof LinUCB) {
        models.bandit.update(state, action, reward, baseContext);
      }

      // 更新冷启动管理器
      if (coldStartEnabled && models.coldStart) {
        models.coldStart.update(state, action, reward, baseContext);
      }

      // 更新用户参数管理器
      if (models.userParams && isUserParamsManagerEnabled()) {
        models.userParams.updateParams(userId, {
          accuracy: rawEvent.isCorrect ? 1 : 0,
          fatigueChange: state.F - prevState.F,
          motivationChange: state.M - prevState.M,
          reward
        });
      }

      this.incrementInteractionCount(userId);
    }

    // 检查取消/超时状态（在持久化前，修复#6超时后写入）
    if (signal?.aborted || timedOut?.value) {
      throw new Error('Operation cancelled');
    }

    // 12. 持久化
    await this.stateRepo.saveState(userId, state);

    // 再次检查超时状态（在第二次写入前）
    if (timedOut?.value || signal?.aborted) {
      throw new Error('Operation cancelled');
    }

    // 保存 Bandit 模型
    if (models.bandit instanceof EnsembleLearningFramework) {
      await this.modelRepo.saveModel(userId, models.bandit.getState().linucb);
    } else if (models.bandit instanceof LinUCB) {
      await this.modelRepo.saveModel(userId, models.bandit.getModel());
    }

    // 13. 记录性能
    const elapsed = Date.now() - startTime;
    if (elapsed > 100) {
      this.logger?.warn('Decision exceeded 100ms', { userId, elapsed });
    }

    // 构建可序列化的特征向量（使用LinUCB上下文向量，确保维度一致）
    // 特征标签必须与 DEFAULT_DIMENSION 保持一致
    const FEATURE_LABELS = [
      'state.A', 'state.F', 'state.C.mem', 'state.C.speed', 'state.M',
      'recentErrorRate', 'interval_scale', 'new_ratio', 'difficulty',
      'hint_level', 'batch_norm', 'rt_norm', 'time_norm', 'time_sin',
      'time_cos', 'attn_fatigue', 'motivation_fatigue', 'pace_match',
      'memory_new_ratio', 'fatigue_latency', 'new_ratio_motivation', 'bias'
    ] as const;

    let persistableFeatureVector: PersistableFeatureVector | undefined;
    if (contextVec && contextVec.length > 0) {
      // 维度一致性校验：确保特征向量、标签数组和预期维度完全匹配
      const dimensionMismatch = contextVec.length !== DEFAULT_DIMENSION;
      const labelsMismatch = FEATURE_LABELS.length !== DEFAULT_DIMENSION;

      if (dimensionMismatch) {
        this.logger?.error('Feature vector dimension mismatch, skipping persistence', {
          userId,
          expected: DEFAULT_DIMENSION,
          actual: contextVec.length
        });
      }
      if (labelsMismatch) {
        this.logger?.error('Feature labels count mismatch, skipping persistence', {
          expected: DEFAULT_DIMENSION,
          actual: FEATURE_LABELS.length
        });
      }

      // 只有维度完全匹配时才保存特征向量，避免数据不一致
      if (!dimensionMismatch && !labelsMismatch) {
        persistableFeatureVector = {
          values: Array.from(contextVec),
          version: FEATURE_VERSION,
          normMethod: 'ucb-context',
          ts: featureVec.ts,
          labels: [...FEATURE_LABELS]
        };
      }
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
  }

  /**
   * 获取当前用户状态
   */
  async getState(userId: string): Promise<UserState | null> {
    return this.stateRepo.loadState(userId);
  }

  /**
   * 重置用户状态
   *
   * 修复问题#2: 只重置指定用户的状态，不影响其他用户
   */
  async resetUser(userId: string): Promise<void> {
    // 删除用户专属模型实例（下次访问时会重新创建）
    this.userModels.delete(userId);

    // 重置交互计数
    this.interactionCounts.delete(userId);

    // 重置特征构建器的用户窗口
    this.featureBuilder.resetWindows(userId);

    // 保存默认状态和模型
    const defaultState = this.createDefaultState();
    await this.stateRepo.saveState(userId, defaultState);

    // 根据功能开关创建默认决策模型
    const flags = getFeatureFlags();
    if (flags.enableEnsemble) {
      const defaultEnsemble = new EnsembleLearningFramework();
      await this.modelRepo.saveModel(userId, defaultEnsemble.getState().linucb);
    } else {
      const defaultBandit = new LinUCB();
      await this.modelRepo.saveModel(userId, defaultBandit.getModel());
    }
  }

  /**
   * 获取冷启动阶段
   * 优先使用 ColdStartManager，否则使用简单阈值判断
   */
  getColdStartPhase(userId: string): ColdStartPhase {
    // 优先使用 ColdStartManager
    const models = this.userModels.get(userId);
    if (isColdStartEnabled() && models?.coldStart) {
      return models.coldStart.getPhase();
    }

    // 回退到简单阈值判断
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

  /**
   * 加载用户模型（如果存在）
   * 支持 LinUCB 和 EnsembleLearningFramework
   * @param bandit 用户专属的决策模型实例
   */
  private async loadModelIfExists(userId: string, bandit: DecisionModel): Promise<void> {
    const model = await this.modelRepo.loadModel(userId);
    if (!model) return;

    if (bandit instanceof LinUCB) {
      bandit.setModel(model);
    } else if (bandit instanceof EnsembleLearningFramework) {
      // Ensemble 内部的 LinUCB 使用加载的模型
      const currentState = bandit.getState();
      bandit.setState({
        ...currentState,
        linucb: model
      });
    }
  }

  private createDefaultState(): UserState {
    return {
      A: 0.7,
      F: 0.1,
      C: { mem: 0.5, speed: 0.5, stability: 0.5 },
      M: 0,
      T: 'flat',
      conf: 0.5,
      ts: Date.now()
    };
  }

  /**
   * 更新用户状态
   * @param models 用户专属模型实例（修复#1跨用户污染）
   */
  private updateUserState(
    prevState: UserState,
    featureVec: FeatureVector,
    event: RawEvent,
    recentErrorRate: number = 0.5,
    models: UserModels
  ): UserState {
    // 转换特征为注意力输入
    const attentionFeatures = this.extractAttentionFeatures(featureVec);
    const A = models.attention.update(attentionFeatures);

    // 疲劳度更新
    const F = models.fatigue.update({
      error_rate_trend: event.isCorrect ? -0.05 : 0.1,
      rt_increase_rate: featureVec.values[0],
      repeat_errors: event.retryCount
    });

    // 认知能力更新 (使用二项分布方差公式: p * (1-p))
    const errorVariance = recentErrorRate * (1 - recentErrorRate);
    const C = models.cognitive.update({
      accuracy: event.isCorrect ? 1 : 0,
      avgResponseTime: event.responseTime,
      errorVariance
    });

    // 动机更新
    const M = models.motivation.update({
      successes: event.isCorrect ? 1 : 0,
      failures: event.isCorrect ? 0 : 1,
      quits: 0
    });

    // 趋势分析更新 (如果启用)
    let trendState = prevState.T ?? 'flat';
    if (models.trendAnalyzer && isTrendAnalyzerEnabled()) {
      // 综合能力指标: 70%记忆 + 30%稳定性
      const ability = clamp(0.7 * C.mem + 0.3 * C.stability, 0, 1);
      trendState = models.trendAnalyzer.update(ability, event.timestamp);
    }

    return {
      ...prevState,
      A,
      F,
      C,
      M,
      T: trendState,
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
   *
   * 修复问题#6: 添加超时回调，设置标志位阻止后续写入
   *
   * @param abortController 用于取消内部操作的 AbortController
   * @param onTimeout 超时时的回调函数
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    userId: string,
    abortController?: AbortController,
    onTimeout?: () => void
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        telemetry.increment('amas.timeout', { path: 'decision' });
        this.logger?.warn('Decision timeout', { userId, timeoutMs });
        // 触发取消信号，通知内部操作停止
        abortController?.abort();
        // 执行超时回调（设置标志位）
        onTimeout?.();
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
    opts: ProcessOptions = {},
    eventTimestamp?: number
  ): Promise<ProcessResult> {
    const state = await this.loadOrCreateState(userId);
    const interactionCount = this.getInteractionCount(userId, opts.interactionCount);
    const recentErrorRate = opts.recentAccuracy !== undefined ? 1 - opts.recentAccuracy : undefined;

    // 使用事件时间而非当前时间，确保离线回放正确性
    const hour = eventTimestamp !== undefined
      ? new Date(eventTimestamp).getHours()
      : new Date().getHours();

    // 使用智能降级策略
    const fallbackResult = intelligentFallback(state, reason, {
      interactionCount,
      recentErrorRate,
      hour
    });

    return {
      strategy: fallbackResult.strategy,
      action: fallbackResult.action, // 使用与策略匹配的动作
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

  // ==================== 用户隔离支持方法 ====================

  /**
   * 获取用户专属模型实例
   *
   * 修复问题#1: 每个用户拥有独立的建模层实例，避免跨用户状态污染
   *
   * @param userId 用户ID
   * @returns 用户专属模型实例集合
   */
  private getUserModels(userId: string): UserModels {
    let models = this.userModels.get(userId);
    if (!models) {
      const flags = getFeatureFlags();

      // 根据功能开关选择决策模型
      const bandit: DecisionModel = flags.enableEnsemble
        ? this.cloneEnsemble()
        : this.cloneLinUCB();

      // 为新用户创建独立的模型实例
      models = {
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
          ? this.cloneColdStartManager()
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
      this.userModels.set(userId, models);
    }
    return models;
  }

  /**
   * 用户级锁机制
   *
   * 修复问题#3: 防止同一用户的并发请求导致Lost Update
   *
   * 注意: 前一个请求的异常会被吞掉，不会传播给后续请求
   *
   * @param userId 用户ID
   * @param fn 需要串行执行的异步函数
   */
  private async withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    // 获取当前用户的锁（如果不存在则为已完成的Promise）
    const previousLock = this.userLocks.get(userId) ?? Promise.resolve();

    // 创建新的锁门控
    let releaseLock: () => void;
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    // 设置当前锁：吞掉前一个锁的异常，避免传播给后续请求
    const chainedLock = previousLock.catch(() => {}).then(() => currentLock);
    this.userLocks.set(userId, chainedLock);

    // 等待之前的锁释放（吞掉异常）
    await previousLock.catch(() => {});

    try {
      return await fn();
    } finally {
      // 释放锁
      releaseLock!();
      // 清理已完成的锁
      if (this.userLocks.get(userId) === chainedLock) {
        this.userLocks.delete(userId);
      }
    }
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
      state.prevAttention
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
   * 克隆LinUCB模型
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
    const template = this.modelTemplates.bandit;
    if (template instanceof EnsembleLearningFramework) {
      const clone = new EnsembleLearningFramework();
      // 新用户使用默认初始化，不复制学习历史
      return clone;
    }
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
   */
  private cloneColdStartManager(): ColdStartManager {
    return new ColdStartManager();
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

  // ==================== 延迟奖励支持方法 ====================

  /**
   * 应用延迟奖励更新模型
   *
   * 该方法封装了模型加载、更新和保存的逻辑，
   * 避免服务层直接访问私有属性 modelRepo。
   *
   * @param userId 用户ID
   * @param featureVector 特征向量
   * @param reward 奖励值（应已裁剪到 [-1, 1]）
   * @returns 更新是否成功
   */
  async applyDelayedRewardUpdate(
    userId: string,
    featureVector: number[],
    reward: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 加载用户模型
      const model = await this.modelRepo.loadModel(userId);
      if (!model) {
        return { success: false, error: 'model_not_found' };
      }

      // 校验特征向量维度与模型一致
      if (featureVector.length !== model.d) {
        return {
          success: false,
          error: `dimension_mismatch: expected=${model.d}, got=${featureVector.length}`
        };
      }

      // 创建临时LinUCB实例来更新模型
      const tempBandit = new LinUCB({
        alpha: model.alpha,
        lambda: model.lambda,
        dimension: model.d
      });
      tempBandit.setModel(model);

      // 使用特征向量更新模型
      tempBandit.updateWithFeatureVector(featureVector, reward);

      // 保存更新后的模型
      await this.modelRepo.saveModel(userId, tempBandit.getModel());

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }
}

