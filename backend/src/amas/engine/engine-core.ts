/**
 * AMAS Engine - 核心编排模块
 *
 * 核心工作流：
 * 1. 接收原始事件
 * 2. 特征提取（感知层）
 * 3. 状态推断（建模层）
 * 4. 动作选择（学习层）
 * 5. 策略映射（决策层）
 * 6. 返回结果并更新模型
 */

import { FeatureBuilder } from '../perception/feature-builder';
import { AttentionMonitor } from '../modeling/attention-monitor';
import { FatigueEstimator } from '../modeling/fatigue-estimator';
import { CognitiveProfiler } from '../modeling/cognitive-profiler';
import { MotivationTracker } from '../modeling/motivation-tracker';
import { TrendAnalyzer } from '../modeling/trend-analyzer';
import { ACTRMemoryModel } from '../modeling/actr-memory';
import { LinUCB } from '../learning/linucb';
import { ColdStartManager } from '../learning/coldstart';
import { ThompsonSampling } from '../learning/thompson-sampling';
import { HeuristicLearner } from '../learning/heuristic';
import { EnsembleLearningFramework } from '../decision/ensemble';
import { UserParamsManager } from '../config/user-params';
import { getFeatureFlags, isColdStartEnabled } from '../config/feature-flags';
import { mapActionToStrategy } from '../decision/mapper';
import { applyGuardrails, shouldSuggestBreak } from '../decision/guardrails';
import { generateExplanation, generateSuggestion } from '../decision/explain';
import {
  ACTION_SPACE,
  DEFAULT_STRATEGY,
  DEFAULT_PERCEPTION_CONFIG,
  FEATURE_VERSION,
  DEFAULT_DIMENSION
} from '../config/action-space';
import { telemetry } from '../common/telemetry';
import {
  ColdStartPhase,
  PersistableFeatureVector,
  RawEvent
} from '../types';

import {
  DecisionModel,
  EngineDependencies,
  Logger,
  MemoryModelRepository,
  MemoryStateRepository,
  ModelRepository,
  ProcessOptions,
  ProcessResult,
  StateRepository,
  TimeoutFlag,
  UserModels
} from './engine-types';
import { ResilienceManager } from './engine-resilience';
import { IsolationManager } from './engine-isolation';
import { ModelingManager } from './engine-modeling';
import { LearningManager } from './engine-learning';
import { DecisionRecorderService, createDecisionRecorder } from '../services/decision-recorder.service';
import { PipelineStageType, PipelineStageStatus } from '@prisma/client';

/**
 * AMAS 核心引擎
 *
 * 整合感知层、建模层、学习层和决策层
 */
export class AMASEngine {
  private featureBuilder: FeatureBuilder;
  private stateRepo: StateRepository;
  private modelRepo: ModelRepository;
  private logger?: Logger;
  private recorder?: DecisionRecorderService;

  // 子管理器
  private resilience: ResilienceManager;
  private isolation: IsolationManager;
  private modeling: ModelingManager;
  private learning: LearningManager;

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
    const modelTemplates: UserModels = {
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

    // 生产环境强制要求数据库存储
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && (!deps.stateRepo || !deps.modelRepo)) {
      throw new Error(
        'AMAS Engine: 生产环境必须提供数据库存储仓库 (stateRepo/modelRepo)，' +
        '禁止使用内存存储以防止服务重启导致用户学习数据丢失'
      );
    }

    // 开发/测试环境可以使用内存存储
    if (!isProduction && (!deps.stateRepo || !deps.modelRepo)) {
      console.warn(
        '[AMAS Engine] 警告：使用内存存储，数据在服务重启后会丢失。' +
        '生产环境请务必配置数据库存储。'
      );
    }

    this.stateRepo = deps.stateRepo ?? new MemoryStateRepository();
    this.modelRepo = deps.modelRepo ?? new MemoryModelRepository();
    this.logger = deps.logger;

    // 自动创建默认 recorder（如果提供了 prisma 但未提供 recorder）
    if (!deps.recorder && deps.prisma) {
      this.recorder = createDecisionRecorder(deps.prisma);
    } else {
      this.recorder = deps.recorder;
    }

    // 初始化子管理器
    this.resilience = new ResilienceManager(this.logger);
    this.isolation = new IsolationManager(modelTemplates);
    this.modeling = new ModelingManager();
    this.learning = new LearningManager();
  }

  /**
   * 处理学习事件（带弹性保护）
   */
  async processEvent(
    userId: string,
    rawEvent: RawEvent,
    opts: ProcessOptions = {}
  ): Promise<ProcessResult> {
    // 使用用户级锁防止同一用户的并发请求冲突
    return this.isolation.withUserLock(userId, async () => {
      // 熔断器检查
      if (!this.resilience.canExecute()) {
        this.resilience.recordDegradation('circuit_open');
        this.logger?.warn('Circuit breaker is open', { userId });
        return this.createFallbackResult(userId, 'circuit_open', opts, rawEvent.timestamp);
      }

      const startTime = Date.now();
      const abortController = new AbortController();
      const timedOut: TimeoutFlag = { value: false };

      try {
        // 决策超时时间：生产环境 100ms，测试环境 500ms
        const decisionTimeout = process.env.NODE_ENV === 'production' ? 100 : 500;

        // 使用超时保护执行决策
        const result = await this.resilience.executeWithTimeout(
          () => this.processEventCore(userId, rawEvent, opts, abortController.signal, timedOut),
          decisionTimeout,
          userId,
          abortController,
          () => { timedOut.value = true; }
        );

        // 记录成功
        this.resilience.recordSuccess();
        this.resilience.recordLatency(Date.now() - startTime);

        return result;
      } catch (error) {
        // 记录失败
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.resilience.recordFailure(errorMessage);
        this.resilience.recordDegradation('exception', { message: errorMessage });

        this.logger?.error('Error processing event', { userId, error });
        return this.createFallbackResult(userId, 'exception', opts, rawEvent.timestamp);
      }
    });
  }

  /**
   * 核心处理逻辑（无弹性保护）
   */
  private async processEventCore(
    userId: string,
    rawEvent: RawEvent,
    opts: ProcessOptions,
    signal?: AbortSignal,
    timedOut?: TimeoutFlag
  ): Promise<ProcessResult> {
    const startTime = Date.now();

    // 阶段计时（用于Pipeline记录）
    const stageTiming = {
      perception: { start: 0, end: 0 },
      modeling: { start: 0, end: 0 },
      learning: { start: 0, end: 0 },
      decision: { start: 0, end: 0 },
      evaluation: { start: 0, end: 0 },
      optimization: { start: 0, end: 0 }
    };

    // 获取用户专属模型实例
    const models = this.isolation.getUserModels(userId);

    // 1. 异常检测
    if (this.featureBuilder.isAnomalous(rawEvent)) {
      this.logger?.warn('Anomalous event detected', { userId, event: rawEvent });
      return this.createFallbackResult(userId, 'degraded_state', opts, rawEvent.timestamp);
    }

    // 2. 加载状态和模型
    const prevState = await this.loadOrCreateState(userId);
    await this.loadModelIfExists(userId, models.bandit);

    // 检查取消/超时状态
    if (signal?.aborted || timedOut?.value) {
      throw new Error('Operation cancelled');
    }

    // 3. 特征提取（感知层）
    stageTiming.perception.start = Date.now();
    const featureVec = this.featureBuilder.buildFeatureVector(rawEvent, userId);
    stageTiming.perception.end = Date.now();

    // 4. 获取上下文信息
    const interactionCount = this.isolation.getInteractionCount(userId, opts.interactionCount);
    const recentAccuracy = opts.recentAccuracy ?? 0.5;
    const recentErrorRate = 1 - recentAccuracy;

    // 5. 状态更新（建模层）
    stageTiming.modeling.start = Date.now();
    const state = this.modeling.updateUserState(prevState, featureVec, rawEvent, recentErrorRate, models);
    stageTiming.modeling.end = Date.now();

    // 6. 构建决策上下文
    const context = {
      recentErrorRate,
      recentResponseTime: rawEvent.responseTime,
      timeBucket: this.modeling.getTimeBucket(rawEvent.timestamp)
    };

    // 判断冷启动阶段
    const coldStartPhase = this.getColdStartPhase(userId);
    const inColdStartPhase = coldStartPhase !== 'normal';

    // 应用用户参数
    this.learning.applyUserParams(
      models,
      userId,
      interactionCount,
      recentAccuracy,
      state.F,
      inColdStartPhase
    );

    // 7. 动作选择（学习层）
    stageTiming.learning.start = Date.now();
    const { action, contextVec } = this.learning.selectAction(
      state,
      models,
      context,
      coldStartPhase,
      interactionCount,
      recentAccuracy
    );
    stageTiming.learning.end = Date.now();

    // 8. 策略映射和安全约束（决策层）
    stageTiming.decision.start = Date.now();
    const currentParams = opts.currentParams ?? DEFAULT_STRATEGY;
    const mappedParams = mapActionToStrategy(action, currentParams);
    const finalStrategy = applyGuardrails(state, mappedParams);
    stageTiming.decision.end = Date.now();

    // 9. 生成解释
    const explanation = generateExplanation(state, currentParams, finalStrategy);
    const suggestion = generateSuggestion(state);

    // 10. 计算奖励（评估层）
    stageTiming.evaluation.start = Date.now();
    const reward = this.learning.computeReward(rawEvent, state);
    stageTiming.evaluation.end = Date.now();

    // 检查取消/超时状态
    if (signal?.aborted || timedOut?.value) {
      throw new Error('Operation cancelled');
    }

    // 11. 更新模型（优化层）
    stageTiming.optimization.start = Date.now();
    if (!opts.skipUpdate) {
      this.learning.updateModels(
        models,
        state,
        prevState,
        action,
        reward,
        context,
        coldStartPhase,
        userId,
        rawEvent.isCorrect
      );
      this.isolation.incrementInteractionCount(userId);
    }
    stageTiming.optimization.end = Date.now();

    // 检查取消/超时状态
    if (signal?.aborted || timedOut?.value) {
      throw new Error('Operation cancelled');
    }

    // 12. 持久化
    await this.stateRepo.saveState(userId, state);

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

    // 14. 记录决策轨迹（异步，不阻塞）
    if (this.recorder && opts.answerRecordId) {
      void this.recordDecisionTrace({
        answerRecordId: opts.answerRecordId,
        sessionId: opts.sessionId,
        timestamp: new Date(rawEvent.timestamp),
        decisionSource: this.getDecisionSource(models, coldStartPhase),
        coldstartPhase: coldStartPhase !== 'normal' ? coldStartPhase : undefined,
        weightsSnapshot: this.extractWeights(models),
        memberVotes: this.extractVotes(models),
        selectedAction: action,
        confidence: this.getConfidence(models),
        reward,
        totalDurationMs: elapsed,
        stageTiming
      }).catch(err => {
        this.logger?.error('Failed to record decision trace', { userId, error: err });
      });
    }

    // 构建可序列化的特征向量
    const persistableFeatureVector = this.buildPersistableFeatureVector(contextVec, featureVec.ts);

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
  async getState(userId: string) {
    return this.stateRepo.loadState(userId);
  }

  /**
   * 重置用户状态
   */
  async resetUser(userId: string): Promise<void> {
    // 删除用户专属模型实例
    this.isolation.deleteUserModels(userId);
    this.isolation.resetInteractionCount(userId);

    // 重置特征构建器的用户窗口
    this.featureBuilder.resetWindows(userId);

    // 保存默认状态和模型
    const defaultState = this.modeling.createDefaultState();
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
   */
  getColdStartPhase(userId: string): ColdStartPhase {
    const models = this.isolation.getUserModels(userId);
    if (isColdStartEnabled() && models?.coldStart) {
      return models.coldStart.getPhase();
    }

    // 回退到简单阈值判断
    const count = this.isolation.getInteractionCount(userId);
    if (count < 15) return 'classify';
    if (count < 50) return 'explore';
    return 'normal';
  }

  /**
   * 应用延迟奖励更新模型
   */
  async applyDelayedRewardUpdate(
    userId: string,
    featureVector: number[],
    reward: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const model = await this.modelRepo.loadModel(userId);
      if (!model) {
        return { success: false, error: 'model_not_found' };
      }

      if (featureVector.length !== model.d) {
        return {
          success: false,
          error: `dimension_mismatch: expected=${model.d}, got=${featureVector.length}`
        };
      }

      const tempBandit = new LinUCB({
        alpha: model.alpha,
        lambda: model.lambda,
        dimension: model.d
      });
      tempBandit.setModel(model);
      tempBandit.updateWithFeatureVector(featureVector, reward);

      await this.modelRepo.saveModel(userId, tempBandit.getModel());

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  // ==================== 私有方法 ====================

  private async loadOrCreateState(userId: string) {
    const state = await this.stateRepo.loadState(userId);
    return state ?? this.modeling.createDefaultState();
  }

  private async loadModelIfExists(userId: string, bandit: DecisionModel): Promise<void> {
    const model = await this.modelRepo.loadModel(userId);
    if (!model) return;

    if (bandit instanceof LinUCB) {
      bandit.setModel(model);
    } else if (bandit instanceof EnsembleLearningFramework) {
      const currentState = bandit.getState();
      bandit.setState({
        ...currentState,
        linucb: model
      });
    }
  }

  private async createFallbackResult(
    userId: string,
    reason: 'circuit_open' | 'exception' | 'degraded_state',
    opts: ProcessOptions,
    eventTimestamp?: number
  ): Promise<ProcessResult> {
    return this.resilience.createIntelligentFallbackResult(
      userId,
      reason,
      opts,
      () => this.loadOrCreateState(userId),
      (uid, provided) => this.isolation.getInteractionCount(uid, provided),
      eventTimestamp
    );
  }

  private buildPersistableFeatureVector(
    contextVec: Float32Array | undefined,
    ts: number
  ): PersistableFeatureVector | undefined {
    const FEATURE_LABELS = [
      'state.A', 'state.F', 'state.C.mem', 'state.C.speed', 'state.M',
      'recentErrorRate', 'interval_scale', 'new_ratio', 'difficulty',
      'hint_level', 'batch_norm', 'rt_norm', 'time_norm', 'time_sin',
      'time_cos', 'attn_fatigue', 'motivation_fatigue', 'pace_match',
      'memory_new_ratio', 'fatigue_latency', 'new_ratio_motivation', 'bias'
    ] as const;

    if (!contextVec || contextVec.length === 0) {
      return undefined;
    }

    const dimensionMismatch = contextVec.length !== DEFAULT_DIMENSION;
    const labelsMismatch = FEATURE_LABELS.length !== DEFAULT_DIMENSION;

    if (dimensionMismatch || labelsMismatch) {
      this.logger?.error('Feature vector dimension mismatch', {
        expected: DEFAULT_DIMENSION,
        actual: contextVec.length
      });
      return undefined;
    }

    return {
      values: Array.from(contextVec),
      version: FEATURE_VERSION,
      normMethod: 'ucb-context',
      ts,
      labels: [...FEATURE_LABELS]
    };
  }

  /**
   * 记录决策轨迹到数据库（异步）
   */
  private async recordDecisionTrace(params: {
    answerRecordId: string;
    sessionId?: string;
    timestamp: Date;
    decisionSource: string;
    coldstartPhase?: string;
    weightsSnapshot?: Record<string, number>;
    memberVotes?: Record<string, unknown>;
    selectedAction: any;
    confidence: number;
    reward: number;
    totalDurationMs: number;
    stageTiming: any;
  }): Promise<void> {
    if (!this.recorder) return;

    const { generateDecisionId } = await import('../services/decision-recorder.service');
    const decisionId = generateDecisionId();

    await this.recorder.record({
      decisionId,
      answerRecordId: params.answerRecordId,
      sessionId: params.sessionId,
      timestamp: params.timestamp,
      decisionSource: params.decisionSource,
      coldstartPhase: params.coldstartPhase,
      weightsSnapshot: params.weightsSnapshot,
      memberVotes: params.memberVotes,
      selectedAction: params.selectedAction,
      confidence: params.confidence,
      reward: params.reward,
      traceVersion: 1,
      totalDurationMs: params.totalDurationMs,
      stages: this.buildPipelineStages(params.stageTiming)
    });
  }

  /**
   * 构建流水线阶段记录
   */
  private buildPipelineStages(stageTiming: any) {
    const stages: Array<{
      stage: PipelineStageType;
      stageName: string;
      status: PipelineStageStatus;
      startedAt: Date;
      endedAt?: Date;
      durationMs?: number;
    }> = [];

    const stageMap: Array<{
      key: string;
      type: PipelineStageType;
      name: string;
    }> = [
      { key: 'perception', type: 'PERCEPTION' as PipelineStageType, name: '感知层' },
      { key: 'modeling', type: 'MODELING' as PipelineStageType, name: '建模层' },
      { key: 'learning', type: 'LEARNING' as PipelineStageType, name: '学习层' },
      { key: 'decision', type: 'DECISION' as PipelineStageType, name: '决策层' },
      { key: 'evaluation', type: 'EVALUATION' as PipelineStageType, name: '评估层' },
      { key: 'optimization', type: 'OPTIMIZATION' as PipelineStageType, name: '优化层' }
    ];

    for (const { key, type, name } of stageMap) {
      const timing = stageTiming[key];
      if (timing && timing.start && timing.end) {
        stages.push({
          stage: type,
          stageName: name,
          status: 'SUCCESS' as PipelineStageStatus,
          startedAt: new Date(timing.start),
          endedAt: new Date(timing.end),
          durationMs: timing.end - timing.start
        });
      }
    }

    return stages;
  }

  /**
   * 获取决策来源
   */
  private getDecisionSource(models: UserModels, coldStartPhase: ColdStartPhase): string {
    if (coldStartPhase !== 'normal') {
      return 'coldstart';
    }
    if (models.bandit instanceof EnsembleLearningFramework) {
      return 'ensemble';
    }
    return 'linucb';
  }

  /**
   * 提取集成权重
   */
  private extractWeights(models: UserModels): Record<string, number> | undefined {
    if (!(models.bandit instanceof EnsembleLearningFramework)) {
      return undefined;
    }

    try {
      const state = models.bandit.getState();
      if (!state.weights) return undefined;
      // 转换 EnsembleWeights 为 Record<string, number>
      const weights: Record<string, number> = {};
      for (const [key, value] of Object.entries(state.weights)) {
        weights[key] = value;
      }
      return weights;
    } catch {
      return undefined;
    }
  }

  /**
   * 提取成员投票
   */
  private extractVotes(models: UserModels): Record<string, unknown> | undefined {
    if (!(models.bandit instanceof EnsembleLearningFramework)) {
      return undefined;
    }

    try {
      const state = models.bandit.getState();
      return state.lastVotes || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 获取决策置信度
   */
  private getConfidence(models: UserModels): number {
    if (models.bandit instanceof EnsembleLearningFramework) {
      try {
        const state = models.bandit.getState();
        return state.lastConfidence ?? 0.5;
      } catch {
        return 0.5;
      }
    }
    return 0.5;
  }
}
