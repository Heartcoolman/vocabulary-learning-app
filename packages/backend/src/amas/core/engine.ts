/**
 * AMAS Engine - 统一引擎模块
 *
 * 整合了引擎的所有核心功能：
 * - 核心引擎编排
 * - 类型定义
 * - 弹性保护
 * - 用户隔离
 * - 建模层管理
 * - 学习层管理
 * - 持久化管理
 * - 决策轨迹记录
 * - 特征向量构建
 * - 奖励配置缓存
 */

import { PrismaClient } from '@prisma/client';
import { PipelineStageType, PipelineStageStatus } from '@prisma/client';

// ==================== 外部依赖 ====================
import { FeatureBuilder } from '../perception/feature-builder';
import {
  AttentionMonitor,
  AttentionFeatures,
  CognitiveProfiler,
  MotivationTracker,
  TrendAnalyzer,
  ACTRMemoryModel,
  ReviewTrace,
} from '../models/cognitive';
import { FatigueEstimator } from '../models/fatigue-estimator';
import { LinUCB, ContextBuildInput } from '../algorithms/learners';
import { ColdStartManager } from '../learning/coldstart';
import { ThompsonSampling } from '../algorithms/learners';
import { HeuristicLearner } from '../learning/heuristic';
import { EnsembleLearningFramework, EnsembleContext } from '../decision/ensemble';
import { UserParamsManager } from '../config/user-params';
import {
  getFeatureFlags,
  isColdStartEnabled,
  isEnsembleEnabled,
  isTrendAnalyzerEnabled,
  isUserParamsManagerEnabled,
  getEnsembleLearnerFlags,
} from '../config/feature-flags';
import { mapActionToStrategy, mapStrategyToAction } from '../decision/mapper';
import { applyGuardrails, shouldForceBreak, shouldSuggestBreak } from '../decision/guardrails';
import {
  generateExplanation,
  generateSuggestion,
  generateEnhancedExplanation,
} from '../decision/explain';
import { MultiObjectiveDecisionEngine } from '../decision/multi-objective-decision';
import {
  ACTION_SPACE,
  DEFAULT_STRATEGY,
  DEFAULT_PERCEPTION_CONFIG,
  FEATURE_VERSION,
  DEFAULT_DIMENSION,
  CLASSIFY_PHASE_THRESHOLD,
  EXPLORE_PHASE_THRESHOLD,
  REWARD_WEIGHTS,
  REFERENCE_RESPONSE_TIME,
} from '../config/action-space';
import { getRewardProfile, RewardProfile, REWARD_PROFILES } from '../config/reward-profiles';
import { telemetry } from '../common/telemetry';
import { CircuitBreaker, createDefaultCircuitBreaker } from '../common/circuit-breaker';
import { intelligentFallback, FallbackReason } from '../decision/fallback';
import prisma from '../../config/database';
import {
  Action,
  BanditModel,
  ColdStartPhase,
  FeatureVector,
  ObjectiveEvaluation,
  PersistableFeatureVector,
  RawEvent,
  StrategyParams,
  UserState,
  UserStateWithColdStart,
} from '../types';
import { newUserInitializer, UserStateSnapshot } from '../cold-start/new-user-initializer';
import {
  recordActionSelection,
  recordDecisionConfidence,
  recordInferenceLatencyMs,
  recordModelDrift,
} from '../../monitoring/amas-metrics';
import { amasLogger } from '../../logger';
import {
  DecisionRecorderService,
  generateDecisionId,
  getSharedDecisionRecorder,
} from '../../services/decision-recorder.service';

// ==================== 类型定义 ====================

/**
 * 决策模型类型 - 支持 LinUCB、Thompson Sampling 或 Ensemble
 */
export type DecisionModel = LinUCB | EnsembleLearningFramework | ThompsonSampling;

/**
 * Thompson 探索钩子接口
 *
 * 将 Thompson Sampling 的核心采样能力封装为可选钩子，
 * 用于在 ColdStart 的 explore 阶段增强探索能力
 */
export interface ThompsonExploreHook {
  shouldExplore(state: UserState, context: ExploreContext): boolean;
  selectExploreAction(state: UserState, actions: Action[], context: ExploreContext): Action;
  updateExplore(state: UserState, action: Action, reward: number, context: ExploreContext): void;
}

/**
 * 探索上下文
 */
export interface ExploreContext {
  recentErrorRate: number;
  recentResponseTime: number;
  timeBucket: number;
  interactionCount: number;
}

/**
 * 用户专属模型实例集合
 */
export interface UserModels {
  attention: AttentionMonitor;
  fatigue: FatigueEstimator;
  cognitive: CognitiveProfiler;
  motivation: MotivationTracker;
  bandit: DecisionModel;
  trendAnalyzer: TrendAnalyzer | null;
  coldStart: ColdStartManager | null;
  thompson: ThompsonSampling | null;
  heuristic: HeuristicLearner | null;
  actrMemory: ACTRMemoryModel | null;
  userParams: UserParamsManager | null;
}

/**
 * 超时标志位
 */
export interface TimeoutFlag {
  value: boolean;
}

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

/**
 * 内存状态存储实现
 */
export class MemoryStateRepository implements StateRepository {
  private store = new Map<string, UserState>();

  async loadState(userId: string): Promise<UserState | null> {
    return this.store.get(userId) ?? null;
  }

  async saveState(userId: string, state: UserState): Promise<void> {
    this.store.set(userId, state);
  }

  async get(userId: string): Promise<UserState | null> {
    return this.loadState(userId);
  }

  async save(userId: string, state: UserState): Promise<void> {
    return this.saveState(userId, state);
  }
}

/**
 * 内存模型存储实现
 */
export class MemoryModelRepository implements ModelRepository {
  private store = new Map<string, BanditModel>();

  async loadModel(userId: string): Promise<BanditModel | null> {
    return this.store.get(userId) ?? null;
  }

  async saveModel(userId: string, model: BanditModel): Promise<void> {
    this.store.set(userId, model);
  }

  async get(userId: string): Promise<BanditModel | null> {
    return this.loadModel(userId);
  }

  async save(userId: string, model: BanditModel): Promise<void> {
    return this.saveModel(userId, model);
  }
}

/**
 * 内存管理配置
 */
export interface MemoryManagementConfig {
  maxUsers?: number;
  modelTtlMs?: number;
  interactionCountTtlMs?: number;
  cleanupIntervalMs?: number;
  lruEvictionThreshold?: number;
}

/**
 * 引擎依赖
 */
export interface EngineDependencies {
  featureBuilder?: FeatureBuilder;
  featureVectorBuilder?: FeatureVectorBuilder;
  attention?: AttentionMonitor;
  fatigue?: FatigueEstimator;
  cognitive?: CognitiveProfiler;
  motivation?: MotivationTracker;
  bandit?: DecisionModel;
  stateRepo?: StateRepository;
  modelRepo?: ModelRepository;
  logger?: Logger;
  trendAnalyzer?: TrendAnalyzer;
  coldStartManager?: ColdStartManager;
  thompson?: ThompsonSampling;
  heuristic?: HeuristicLearner;
  actrMemory?: ACTRMemoryModel;
  userParamsManager?: UserParamsManager;
  recorder?: DecisionRecorderService;
  decisionTracer?: DecisionTracer;
  prisma?: PrismaClient;
  memoryConfig?: MemoryManagementConfig;
  persistence?: PersistenceManager;
  rewardCacheManager?: RewardCacheManager;
}

/**
 * 单词复习历史记录
 */
export interface WordReviewHistory {
  secondsAgo: number;
  isCorrect?: boolean;
}

/**
 * 处理选项
 */
export interface ProcessOptions {
  currentParams?: StrategyParams;
  interactionCount?: number;
  recentAccuracy?: number;
  skipUpdate?: boolean;
  answerRecordId?: string;
  sessionId?: string;
  learningObjectives?: import('../types').LearningObjectives;
  sessionStats?: {
    accuracy: number;
    avgResponseTime: number;
    retentionRate: number;
    reviewSuccessRate: number;
    memoryStability: number;
    wordsPerMinute: number;
    timeUtilization: number;
    cognitiveLoad: number;
    sessionDuration: number;
  };
  wordReviewHistory?: WordReviewHistory[];
}

/**
 * 单词掌握判定结果
 */
export interface WordMasteryDecision {
  isMastered: boolean;
  confidence: number;
  suggestedRepeats: number;
}

/**
 * 冷启动状态持久化数据
 */
export interface ColdStartStateData {
  phase: 'classify' | 'explore' | 'normal';
  userType: 'fast' | 'stable' | 'cautious' | null;
  probeIndex: number;
  updateCount: number;
  settledStrategy: {
    interval_scale: number;
    new_ratio: number;
    difficulty: 'easy' | 'mid' | 'hard';
    batch_size: number;
    hint_level: number;
  } | null;
}

/**
 * 处理结果
 */
export interface ProcessResult {
  strategy: StrategyParams;
  action: Action;
  explanation: string;
  enhancedExplanation?: import('../decision/explain').EnhancedExplanation;
  state: UserState;
  reward: number;
  suggestion: string | null;
  shouldBreak: boolean;
  featureVector?: PersistableFeatureVector;
  wordMasteryDecision?: WordMasteryDecision;
  objectiveEvaluation?: ObjectiveEvaluation;
  multiObjectiveAdjusted?: boolean;
  /** 心流状态检测结果 */
  flowState?: import('../models/flow-detector').FlowState;
  /** 情绪状态检测结果 */
  emotionState?: import('../models/emotion-detector').EmotionState;
}

/**
 * 数值裁剪工具函数
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ==================== 决策轨迹记录 ====================

/**
 * 流水线阶段计时信息
 */
export interface StageTiming {
  perception: { start: number; end: number };
  modeling: { start: number; end: number };
  learning: { start: number; end: number };
  decision: { start: number; end: number };
  evaluation: { start: number; end: number };
  optimization: { start: number; end: number };
}

/**
 * 流水线阶段记录
 */
export interface PipelineStage {
  stage: PipelineStageType;
  stageName: string;
  status: PipelineStageStatus;
  startedAt: Date;
  endedAt?: Date;
  durationMs?: number;
}

/**
 * 决策轨迹参数
 */
export interface DecisionTraceParams {
  answerRecordId: string;
  sessionId?: string;
  timestamp: Date;
  decisionSource: string;
  coldstartPhase?: string;
  weightsSnapshot?: Record<string, number>;
  memberVotes?: Record<string, unknown>;
  selectedAction: unknown;
  confidence: number;
  reward: number;
  totalDurationMs: number;
  stageTiming: StageTiming;
}

/**
 * 决策轨迹记录器接口
 */
export interface DecisionTracer {
  recordDecisionTrace(params: DecisionTraceParams): Promise<void>;
}

/**
 * 流水线阶段映射配置
 */
const STAGE_MAP: Array<{
  key: keyof StageTiming;
  type: PipelineStageType;
  name: string;
}> = [
  { key: 'perception', type: 'PERCEPTION' as PipelineStageType, name: '感知层' },
  { key: 'modeling', type: 'MODELING' as PipelineStageType, name: '建模层' },
  { key: 'learning', type: 'LEARNING' as PipelineStageType, name: '学习层' },
  { key: 'decision', type: 'DECISION' as PipelineStageType, name: '决策层' },
  { key: 'evaluation', type: 'EVALUATION' as PipelineStageType, name: '评估层' },
  { key: 'optimization', type: 'OPTIMIZATION' as PipelineStageType, name: '优化层' },
];

/**
 * 默认决策轨迹记录器
 */
export class DefaultDecisionTracer implements DecisionTracer {
  constructor(
    private recorder: DecisionRecorderService,
    private logger?: Logger,
  ) {}

  async recordDecisionTrace(params: DecisionTraceParams): Promise<void> {
    try {
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
        selectedAction: params.selectedAction as Record<string, unknown>,
        confidence: params.confidence,
        reward: params.reward,
        traceVersion: 1,
        totalDurationMs: params.totalDurationMs,
        stages: this.buildPipelineStages(params.stageTiming),
      });
    } catch (error) {
      this.logger?.warn('Failed to record decision trace', {
        error,
        answerRecordId: params.answerRecordId,
        decisionSource: params.decisionSource,
      });
    }
  }

  private buildPipelineStages(stageTiming: StageTiming): PipelineStage[] {
    const stages: PipelineStage[] = [];

    for (const { key, type, name } of STAGE_MAP) {
      const timing = stageTiming[key];
      if (timing && timing.start && timing.end) {
        stages.push({
          stage: type,
          stageName: name,
          status: 'SUCCESS' as PipelineStageStatus,
          startedAt: new Date(timing.start),
          endedAt: new Date(timing.end),
          durationMs: timing.end - timing.start,
        });
      }
    }

    return stages;
  }
}

/**
 * 空决策轨迹记录器
 */
export class NoopDecisionTracer implements DecisionTracer {
  async recordDecisionTrace(_params: DecisionTraceParams): Promise<void> {
    // 不执行任何操作
  }
}

/**
 * 创建决策轨迹记录器
 */
export function createDecisionTracer(
  recorder?: DecisionRecorderService,
  logger?: Logger,
): DecisionTracer {
  if (!recorder) {
    return new NoopDecisionTracer();
  }
  return new DefaultDecisionTracer(recorder, logger);
}

// ==================== 特征向量构建 ====================

/**
 * 特征向量接口
 */
export interface FeatureVectorType {
  dimensions: number[];
  labels: string[];
}

/**
 * 特征上下文接口
 */
export interface FeatureContext {
  userId: string;
  wordId: string;
  wordDifficulty: number;
  userMasteryLevel: number;
  timeOfDay: number;
  dayOfWeek: number;
  sessionLength: number;
  recentAccuracy: number;
  stateA?: number;
  stateF?: number;
  stateM?: number;
  cognitiveMem?: number;
  cognitiveSpeed?: number;
}

/**
 * 特征向量构建器接口
 */
export interface FeatureVectorBuilder {
  buildFeatureVector(context: FeatureContext): FeatureVectorType;
  buildPersistableFeatureVector(
    contextVec: Float32Array | undefined,
    ts: number,
  ): PersistableFeatureVector | undefined;
  serializeFeatureVector(vector: FeatureVectorType): string;
  deserializeFeatureVector(serialized: string): FeatureVectorType;
  alignFeatureVectorDimension(featureVector: number[], targetDimension: number): number[];
}

/**
 * 特征标签定义
 */
export const FEATURE_LABELS = [
  'state.A',
  'state.F',
  'state.C.mem',
  'state.C.speed',
  'state.M',
  'recentErrorRate',
  'interval_scale',
  'new_ratio',
  'difficulty',
  'hint_level',
  'batch_norm',
  'rt_norm',
  'time_norm',
  'time_sin',
  'time_cos',
  'attn_fatigue',
  'motivation_fatigue',
  'pace_match',
  'memory_new_ratio',
  'fatigue_latency',
  'new_ratio_motivation',
  'bias',
] as const;

export type FeatureLabel = (typeof FEATURE_LABELS)[number];

/**
 * 默认特征向量构建器实现
 */
export class DefaultFeatureVectorBuilder implements FeatureVectorBuilder {
  private logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  buildFeatureVector(context: FeatureContext): FeatureVectorType {
    const dimensions: number[] = [
      context.stateA ?? 0.5,
      context.stateF ?? 0,
      context.cognitiveMem ?? 0.5,
      context.cognitiveSpeed ?? 0.5,
      context.stateM ?? 0.5,
      1 - context.recentAccuracy,
      1.0,
      0.3,
      context.wordDifficulty,
      0,
      0.5,
      0.5,
      context.timeOfDay / 24,
      Math.sin((2 * Math.PI * context.timeOfDay) / 24),
      Math.cos((2 * Math.PI * context.timeOfDay) / 24),
      (context.stateA ?? 0.5) * (context.stateF ?? 0),
      (context.stateM ?? 0.5) * (context.stateF ?? 0),
      0.5,
      (context.cognitiveMem ?? 0.5) * 0.3,
      (context.stateF ?? 0) * 0.5,
      0.3 * (context.stateM ?? 0.5),
      1.0,
    ];

    return {
      dimensions,
      labels: [...FEATURE_LABELS],
    };
  }

  buildPersistableFeatureVector(
    contextVec: Float32Array | undefined,
    ts: number,
  ): PersistableFeatureVector | undefined {
    if (!contextVec || contextVec.length === 0) {
      return undefined;
    }

    const dimensionMismatch = contextVec.length !== DEFAULT_DIMENSION;
    const labelsMismatch = FEATURE_LABELS.length !== DEFAULT_DIMENSION;

    if (dimensionMismatch || labelsMismatch) {
      this.logger?.error('Feature vector dimension mismatch', {
        expected: DEFAULT_DIMENSION,
        actual: contextVec.length,
      });
      return undefined;
    }

    return {
      values: Array.from(contextVec),
      version: FEATURE_VERSION,
      normMethod: 'ucb-context',
      ts,
      labels: [...FEATURE_LABELS],
    };
  }

  serializeFeatureVector(vector: FeatureVectorType): string {
    return JSON.stringify({
      d: vector.dimensions,
      l: vector.labels,
      v: FEATURE_VERSION,
    });
  }

  deserializeFeatureVector(serialized: string): FeatureVectorType {
    try {
      const parsed = JSON.parse(serialized);

      if (Array.isArray(parsed)) {
        return {
          dimensions: parsed,
          labels: [...FEATURE_LABELS],
        };
      }

      return {
        dimensions: parsed.d || parsed.dimensions || [],
        labels: parsed.l || parsed.labels || [...FEATURE_LABELS],
      };
    } catch (error) {
      this.logger?.error('Failed to deserialize feature vector', { error, serialized });
      return {
        dimensions: [],
        labels: [...FEATURE_LABELS],
      };
    }
  }

  alignFeatureVectorDimension(featureVector: number[], targetDimension: number): number[] {
    if (featureVector.length === targetDimension) {
      return featureVector;
    }

    if (featureVector.length < targetDimension) {
      const aligned = [...featureVector];
      while (aligned.length < targetDimension) {
        aligned.push(0);
      }
      return aligned;
    }

    return featureVector.slice(0, targetDimension);
  }
}

export function createFeatureVectorBuilder(logger?: Logger): FeatureVectorBuilder {
  return new DefaultFeatureVectorBuilder(logger);
}

// ==================== 奖励配置缓存 ====================

/**
 * 奖励配置缓存项
 */
export interface RewardProfileCacheItem {
  profileId: string | null;
  cachedAt: number;
}

/**
 * 缓存统计信息
 */
export interface RewardCacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
}

/**
 * 奖励缓存管理器接口
 */
export interface RewardCacheManager {
  getCachedProfileId(userId: string): string | null | undefined;
  setCachedProfileId(userId: string, profileId: string | null): void;
  invalidateCache(userId: string): void;
  clearAll(): void;
  getCacheStats(): RewardCacheStats;
  getCacheSize(): number;
  cleanup(): void;
}

/**
 * 奖励缓存管理器配置
 */
export interface RewardCacheConfig {
  ttlMs?: number;
  maxSize?: number;
  logger?: Logger;
}

/**
 * 默认奖励缓存管理器实现
 */
export class DefaultRewardCacheManager implements RewardCacheManager {
  private cache = new Map<string, RewardProfileCacheItem>();
  private readonly ttlMs: number;
  private readonly maxSize: number;
  private readonly logger?: Logger;

  private hits = 0;
  private misses = 0;

  constructor(config: RewardCacheConfig = {}) {
    this.ttlMs = config.ttlMs ?? 5 * 60 * 1000;
    this.maxSize = config.maxSize ?? 10000;
    this.logger = config.logger;
  }

  getCachedProfileId(userId: string): string | null | undefined {
    const entry = this.cache.get(userId);
    const now = Date.now();

    if (entry && now - entry.cachedAt < this.ttlMs) {
      this.hits++;
      return entry.profileId;
    }

    if (entry) {
      this.cache.delete(userId);
    }
    this.misses++;
    return undefined;
  }

  setCachedProfileId(userId: string, profileId: string | null): void {
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
      if (this.cache.size >= this.maxSize) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) {
          this.cache.delete(firstKey);
        }
      }
    }

    this.cache.set(userId, {
      profileId,
      cachedAt: Date.now(),
    });
  }

  invalidateCache(userId: string): void {
    this.cache.delete(userId);
  }

  clearAll(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getCacheStats(): RewardCacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [userId, item] of this.cache) {
      if (now - item.cachedAt > this.ttlMs) {
        expiredKeys.push(userId);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
    }

    if (expiredKeys.length > 0) {
      this.logger?.info('Cleaned up expired reward profile cache entries', {
        count: expiredKeys.length,
        remaining: this.cache.size,
      });
    }
  }
}

/**
 * 空操作缓存管理器
 */
export class NoopRewardCacheManager implements RewardCacheManager {
  getCachedProfileId(_userId: string): string | null | undefined {
    return undefined;
  }

  setCachedProfileId(_userId: string, _profileId: string | null): void {}

  invalidateCache(_userId: string): void {}

  clearAll(): void {}

  getCacheStats(): RewardCacheStats {
    return { size: 0, hits: 0, misses: 0, hitRate: 0 };
  }

  getCacheSize(): number {
    return 0;
  }

  cleanup(): void {}
}

export function createRewardCacheManager(config?: RewardCacheConfig): RewardCacheManager {
  return new DefaultRewardCacheManager(config);
}

// ==================== 持久化管理 ====================

/**
 * 持久化管理器接口
 */
export interface PersistenceManager {
  loadState(userId: string): Promise<UserState | null>;
  saveState(userId: string, state: UserState, coldStartState?: ColdStartStateData): Promise<void>;
  loadModelIfExists(userId: string, bandit: DecisionModel): Promise<void>;
  saveModel(userId: string, bandit: DecisionModel): Promise<void>;
}

/**
 * 默认持久化管理器实现
 */
export class DefaultPersistenceManager implements PersistenceManager {
  constructor(
    private stateRepo: StateRepository,
    private modelRepo: ModelRepository,
    private logger?: Logger,
  ) {}

  async loadState(userId: string): Promise<UserState | null> {
    return this.stateRepo.loadState(userId);
  }

  async saveState(
    userId: string,
    state: UserState,
    coldStartState?: ColdStartStateData,
  ): Promise<void> {
    await this.stateRepo.saveState(userId, { ...state, coldStartState } as UserState);
  }

  async loadModelIfExists(userId: string, bandit: DecisionModel): Promise<void> {
    const model = await this.modelRepo.loadModel(userId);
    if (!model) return;

    if (bandit instanceof LinUCB) {
      bandit.setModel(model);
    } else if (bandit instanceof EnsembleLearningFramework) {
      const currentState = bandit.getState();
      bandit.setState({
        ...currentState,
        linucb: model,
      });
    }
  }

  async saveModel(userId: string, bandit: DecisionModel): Promise<void> {
    let model: BanditModel;

    if (bandit instanceof EnsembleLearningFramework) {
      model = bandit.getState().linucb;
    } else if (bandit instanceof LinUCB) {
      model = bandit.getModel();
    } else {
      return;
    }

    await this.modelRepo.saveModel(userId, model);
  }
}

// ==================== 弹性保护 ====================

/**
 * 弹性保护管理器
 */
export class ResilienceManager {
  private circuit: CircuitBreaker;
  private logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;

    this.circuit = createDefaultCircuitBreaker(
      (evt) => {
        telemetry.record('amas.circuit.event', evt);
      },
      (from, to) => {
        telemetry.record('amas.circuit.transition', { from, to });
        this.logger?.warn(`Circuit breaker transition: ${from} → ${to}`);
      },
    );
  }

  canExecute(): boolean {
    return this.circuit.canExecute();
  }

  recordSuccess(): void {
    this.circuit.recordSuccess();
  }

  recordFailure(errorMessage: string): void {
    this.circuit.recordFailure(errorMessage);
  }

  async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    userId: string,
    abortController?: AbortController,
    onTimeout?: () => void,
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        telemetry.increment('amas.timeout', { path: 'decision' });
        this.logger?.warn('Decision timeout', { userId, timeoutMs });
        abortController?.abort();
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

  async createIntelligentFallbackResult(
    userId: string,
    reason: FallbackReason,
    opts: ProcessOptions,
    stateLoader: () => Promise<UserState>,
    interactionCountGetter: (userId: string, provided?: number) => number,
    eventTimestamp?: number,
  ): Promise<ProcessResult> {
    const state = await stateLoader();
    const interactionCount = interactionCountGetter(userId, opts.interactionCount);
    const recentErrorRate = opts.recentAccuracy !== undefined ? 1 - opts.recentAccuracy : undefined;

    const hour =
      eventTimestamp !== undefined ? new Date(eventTimestamp).getHours() : new Date().getHours();

    const fallbackResult = intelligentFallback(state, reason, {
      interactionCount,
      recentErrorRate,
      hour,
    });

    return {
      strategy: fallbackResult.strategy,
      action: fallbackResult.action,
      explanation: fallbackResult.explanation,
      state,
      reward: 0,
      suggestion: null,
      shouldBreak: false,
    };
  }

  /**
   * 简单降级（兼容旧接口）
   * @deprecated 使用 createIntelligentFallbackResult(userId, reason, opts, ...) 替代
   */
  async createFallbackResult(
    userId: string,
    stateLoader: () => Promise<UserState>,
    interactionCountGetter: (userId: string, provided?: number) => number,
  ): Promise<ProcessResult> {
    return this.createIntelligentFallbackResult(
      userId,
      'degraded_state',
      {},
      stateLoader,
      interactionCountGetter,
    );
  }

  recordDegradation(reason: string, meta?: Record<string, unknown>): void {
    telemetry.increment('amas.degradation', { reason, ...meta });
  }

  recordLatency(latencyMs: number): void {
    telemetry.histogram('amas.decision.latency', latencyMs);
  }
}

// ==================== 建模层管理 ====================

/**
 * 决策上下文
 */
export interface DecisionContext {
  recentErrorRate: number;
  recentResponseTime: number;
  timeBucket: number;
  [key: string]: unknown;
}

/**
 * 动作选择结果
 */
export interface ActionSelection {
  action: Action;
  contextVec?: Float32Array;
  confidence?: number;
}

/**
 * 建模层管理器
 */
export class ModelingManager {
  updateUserState(
    prevState: UserState,
    featureVec: FeatureVector,
    event: RawEvent,
    recentErrorRate: number,
    models: UserModels,
  ): UserState {
    const attentionFeatures = this.extractAttentionFeatures(featureVec);
    const A = models.attention.update(attentionFeatures);

    const breakMinutes = event.pausedTimeMs ? event.pausedTimeMs / 60000 : undefined;
    const F = models.fatigue.update({
      error_rate_trend: event.isCorrect ? -0.05 : 0.1,
      rt_increase_rate: featureVec.values[0],
      repeat_errors: event.retryCount,
      breakMinutes,
    });

    const errorVariance = recentErrorRate * (1 - recentErrorRate);
    const C = models.cognitive.update({
      accuracy: event.isCorrect ? 1 : 0,
      avgResponseTime: event.responseTime,
      errorVariance,
    });

    const M = models.motivation.update({
      successes: event.isCorrect ? 1 : 0,
      failures: event.isCorrect ? 0 : 1,
      quits: 0,
    });

    let trendState = prevState.T ?? 'flat';
    if (models.trendAnalyzer && isTrendAnalyzerEnabled()) {
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
      conf: Math.min(1, prevState.conf + 0.01),
    };
  }

  extractAttentionFeatures(featureVec: FeatureVector): AttentionFeatures {
    const v = featureVec.values;
    const safeGet = (index: number, defaultVal: number = 0) =>
      index < v.length && Number.isFinite(v[index]) ? v[index] : defaultVal;

    return {
      z_rt_mean: safeGet(0),
      z_rt_cv: safeGet(1),
      z_pace_cv: safeGet(2),
      z_pause: safeGet(3),
      z_switch: safeGet(4),
      z_drift: safeGet(5),
      interaction_density: safeGet(6),
      focus_loss_duration: safeGet(7),
    };
  }

  createDefaultState(): UserState {
    return {
      A: 0.7,
      F: 0.1,
      C: { mem: 0.5, speed: 0.5, stability: 0.5 },
      M: 0,
      T: 'flat',
      conf: 0.5,
      ts: Date.now(),
    };
  }

  getTimeBucket(timestamp: number): number {
    const hour = new Date(timestamp).getHours();
    if (hour < 12) return 0;
    if (hour < 18) return 1;
    return 2;
  }
}

// ==================== 学习层管理 ====================

/**
 * 学习层管理器
 */
export class LearningManager {
  selectAction(
    state: UserState,
    models: UserModels,
    context: DecisionContext,
    coldStartPhase: ColdStartPhase,
    interactionCount: number,
    recentAccuracy: number,
    wordReviewHistory?: WordReviewHistory[],
  ): ActionSelection {
    const coldStartEnabled = isColdStartEnabled() && models.coldStart !== null;
    const inColdStartPhase = coldStartPhase !== 'normal';

    if (models.userParams && isUserParamsManagerEnabled()) {
      // 用户参数管理器处理
    } else if (models.bandit instanceof LinUCB && !inColdStartPhase) {
      const alpha = models.bandit.getColdStartAlpha(interactionCount, recentAccuracy, state.F);
      models.bandit.setAlpha(alpha);
    }

    const actrTrace: ReviewTrace[] = (wordReviewHistory ?? []).map((h) => ({
      secondsAgo: h.secondsAgo,
      isCorrect: h.isCorrect,
    }));

    let action: Action;
    let contextVec: Float32Array | undefined;
    let confidence: number | undefined;

    if (inColdStartPhase && coldStartEnabled && models.coldStart) {
      const selection = models.coldStart.selectAction(state, ACTION_SPACE, context);
      action = selection.action;
      contextVec = this.buildContextVector(models, state, action, context);
    } else if (isEnsembleEnabled() && models.bandit instanceof EnsembleLearningFramework) {
      const ensembleContext: EnsembleContext = {
        phase: coldStartPhase,
        base: context,
        linucb: context,
        thompson: context,
        actr: { ...context, trace: actrTrace },
        heuristic: context,
      };

      const learnerFlags = getEnsembleLearnerFlags();
      const ensembleState = models.bandit.getState();
      const weights = { ...ensembleState.weights };
      if (!learnerFlags.thompson) weights.thompson = 0;
      if (!learnerFlags.actr) weights.actr = 0;
      if (!learnerFlags.heuristic) weights.heuristic = 0;
      models.bandit.setState({ ...ensembleState, weights });

      const selection = models.bandit.selectAction(state, ACTION_SPACE, ensembleContext);
      action = selection.action;

      const internalLinUCB = new LinUCB();
      internalLinUCB.setModel(ensembleState.linucb);
      contextVec = internalLinUCB.buildContextVector({
        state,
        action,
        ...context,
      });
    } else {
      if (models.bandit instanceof LinUCB) {
        const selection = models.bandit.selectAction(state, ACTION_SPACE, context);
        action = selection.action;
        confidence = selection.confidence;
        contextVec = models.bandit.buildContextVector({
          state,
          action,
          ...context,
        });
      } else {
        action = ACTION_SPACE[0];
      }
    }

    return { action, contextVec, confidence };
  }

  public buildContextVector(
    models: UserModels,
    state: UserState,
    action: Action,
    context: DecisionContext,
  ): Float32Array | undefined {
    if (models.bandit instanceof LinUCB) {
      return models.bandit.buildContextVector({
        state,
        action,
        ...context,
      });
    } else if (models.bandit instanceof EnsembleLearningFramework) {
      const ensembleState = models.bandit.getState();
      const internalLinUCB = new LinUCB();
      internalLinUCB.setModel(ensembleState.linucb);
      return internalLinUCB.buildContextVector({
        state,
        action,
        ...context,
      });
    }
    return undefined;
  }

  updateModels(
    models: UserModels,
    state: UserState,
    prevState: UserState,
    action: Action,
    reward: number,
    context: DecisionContext,
    coldStartPhase: ColdStartPhase,
    userId: string,
    isCorrect: boolean,
    wordReviewHistory?: WordReviewHistory[],
  ): void {
    const coldStartEnabled = isColdStartEnabled() && models.coldStart !== null;

    const actrTrace: ReviewTrace[] = (wordReviewHistory ?? []).map((h) => ({
      secondsAgo: h.secondsAgo,
      isCorrect: h.isCorrect,
    }));

    if (models.bandit instanceof EnsembleLearningFramework) {
      const ensembleContext: EnsembleContext = {
        phase: coldStartPhase,
        base: context,
        linucb: context,
        thompson: context,
        actr: { ...context, trace: actrTrace },
        heuristic: context,
      };
      models.bandit.update(state, action, reward, ensembleContext);
      recordModelDrift({ model: 'ensemble', phase: coldStartPhase });
    } else if (models.bandit instanceof LinUCB) {
      models.bandit.update(state, action, reward, context);
      recordModelDrift({ model: 'linucb', phase: coldStartPhase });
    }

    if (coldStartEnabled && models.coldStart) {
      models.coldStart.update(state, action, reward, context);
    }

    if (models.userParams && isUserParamsManagerEnabled()) {
      models.userParams.updateParams(userId, {
        accuracy: isCorrect ? 1 : 0,
        fatigueChange: state.F - prevState.F,
        motivationChange: state.M - prevState.M,
        reward,
      });
    }
  }

  computeReward(
    event: RawEvent,
    state: UserState,
    profile: RewardProfile = REWARD_PROFILES.standard,
  ): number {
    const { correct, fatigue, speed, frustration, engagement } = profile.weights;

    const correctValue = event.isCorrect ? 1 : -1;
    const fatiguePenalty = state.F;
    const speedGain = clamp(
      REFERENCE_RESPONSE_TIME / Math.max(event.responseTime, 1000) - 1,
      -1,
      1,
    );
    const frustrationValue = event.retryCount > 1 || state.M < 0 ? 1 : 0;

    const engagementValue = this.computeEngagement(event, state);

    const rawReward =
      correct * correctValue -
      fatigue * fatiguePenalty +
      speed * speedGain -
      frustration * frustrationValue +
      engagement * engagementValue;

    return clamp(rawReward / 2, -1, 1);
  }

  private computeEngagement(event: RawEvent, state: UserState): number {
    const optimalDwellTime = 3000;

    const dwellScore = 1 - Math.abs((event.dwellTime || 0) - optimalDwellTime) / optimalDwellTime;
    const normalizedDwellScore = clamp(dwellScore, 0, 1);

    const interactionScore = event.interactionDensity ?? 0.5;

    return clamp((normalizedDwellScore + interactionScore) / 2, 0, 1);
  }

  applyUserParams(
    models: UserModels,
    userId: string,
    interactionCount: number,
    recentAccuracy: number,
    fatigue: number,
    inColdStartPhase: boolean,
  ): void {
    if (models.userParams && isUserParamsManagerEnabled()) {
      const params = models.userParams.getParams(userId);
      if (models.bandit instanceof LinUCB) {
        models.bandit.setAlpha(params.alpha);
      }
    } else if (models.bandit instanceof LinUCB && !inColdStartPhase) {
      const alpha = models.bandit.getColdStartAlpha(interactionCount, recentAccuracy, fatigue);
      models.bandit.setAlpha(alpha);
    }
  }
}

// ==================== 用户隔离管理 ====================

/**
 * 完整内存管理配置
 */
interface CompleteMemoryManagementConfig {
  maxUsers: number;
  modelTtlMs: number;
  interactionCountTtlMs: number;
  cleanupIntervalMs: number;
  lruEvictionThreshold: number;
}

const DEFAULT_MEMORY_CONFIG: CompleteMemoryManagementConfig = {
  maxUsers: 5000,
  modelTtlMs: 30 * 60 * 1000,
  interactionCountTtlMs: 60 * 60 * 1000,
  cleanupIntervalMs: 5 * 60 * 1000,
  lruEvictionThreshold: 0.9,
};

/**
 * 带访问时间戳的用户模型包装
 */
interface UserModelEntry {
  models: UserModels;
  lastAccessedAt: number;
  createdAt: number;
}

/**
 * 带时间戳的交互计数条目
 */
interface InteractionCountEntry {
  count: number;
  lastUpdatedAt: number;
}

/**
 * 用户隔离管理器
 */
export class IsolationManager {
  private userModels = new Map<string, UserModelEntry>();
  private userLocks = new Map<string, Promise<unknown>>();
  private interactionCounts = new Map<string, InteractionCountEntry>();
  private modelTemplates: UserModels;
  private memoryConfig: CompleteMemoryManagementConfig;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private isDestroyed = false;

  constructor(templates: UserModels, config?: MemoryManagementConfig) {
    this.modelTemplates = templates;
    this.memoryConfig = { ...DEFAULT_MEMORY_CONFIG, ...config };
    this.startCleanupTimer();
  }

  destroy(): void {
    this.isDestroyed = true;
    this.stopCleanupTimer();
    this.userModels.clear();
    this.userLocks.clear();
    this.interactionCounts.clear();
  }

  private startCleanupTimer(): void {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.memoryConfig.cleanupIntervalMs);

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  performCleanup(): void {
    if (this.isDestroyed) return;

    const now = Date.now();
    this.cleanupExpiredModels(now);
    this.cleanupExpiredInteractionCounts(now);
    this.performLruEviction();
  }

  private cleanupExpiredModels(now: number): void {
    const expiredUsers: string[] = [];

    for (const [userId, entry] of this.userModels) {
      if (now - entry.lastAccessedAt > this.memoryConfig.modelTtlMs) {
        expiredUsers.push(userId);
      }
    }

    for (const userId of expiredUsers) {
      this.userModels.delete(userId);
    }
  }

  private cleanupExpiredInteractionCounts(now: number): void {
    const expiredUsers: string[] = [];

    for (const [userId, entry] of this.interactionCounts) {
      if (now - entry.lastUpdatedAt > this.memoryConfig.interactionCountTtlMs) {
        expiredUsers.push(userId);
      }
    }

    for (const userId of expiredUsers) {
      this.interactionCounts.delete(userId);
    }
  }

  private performLruEviction(): void {
    const threshold = Math.floor(
      this.memoryConfig.maxUsers * this.memoryConfig.lruEvictionThreshold,
    );

    if (this.userModels.size <= threshold) {
      return;
    }

    const entries = Array.from(this.userModels.entries()).sort(
      (a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt,
    );

    const targetSize = Math.floor(threshold * 0.8);
    const toEvict = entries.slice(0, this.userModels.size - targetSize);

    for (const [userId] of toEvict) {
      this.userModels.delete(userId);
      this.interactionCounts.delete(userId);
    }
  }

  getMemoryStats(): {
    userModelsCount: number;
    userLocksCount: number;
    interactionCountsCount: number;
    maxUsers: number;
    utilizationPercent: number;
  } {
    return {
      userModelsCount: this.userModels.size,
      userLocksCount: this.userLocks.size,
      interactionCountsCount: this.interactionCounts.size,
      maxUsers: this.memoryConfig.maxUsers,
      utilizationPercent: (this.userModels.size / this.memoryConfig.maxUsers) * 100,
    };
  }

  getUserModels(userId: string, coldStartState?: ColdStartStateData): UserModels {
    const now = Date.now();
    let entry = this.userModels.get(userId);

    if (entry) {
      entry.lastAccessedAt = now;

      if (coldStartState && entry.models.coldStart) {
        entry.models.coldStart.setState({
          phase: coldStartState.phase,
          userType: coldStartState.userType,
          probeIndex: coldStartState.probeIndex,
          results: [],
          settledStrategy: coldStartState.settledStrategy,
          updateCount: coldStartState.updateCount,
        });
      }

      return entry.models;
    }

    if (this.userModels.size >= this.memoryConfig.maxUsers) {
      this.performLruEviction();
    }

    const flags = getFeatureFlags();

    let bandit: DecisionModel;
    if (flags.enableEnsemble) {
      bandit = this.cloneEnsemble();
    } else {
      bandit = this.cloneLinUCB();
    }

    const models: UserModels = {
      attention: this.cloneAttentionMonitor(),
      fatigue: this.cloneFatigueEstimator(),
      cognitive: this.cloneCognitiveProfiler(),
      motivation: this.cloneMotivationTracker(),
      bandit,
      trendAnalyzer: flags.enableTrendAnalyzer ? this.cloneTrendAnalyzer() : null,
      coldStart: flags.enableColdStartManager ? this.cloneColdStartManager(coldStartState) : null,
      thompson: flags.enableThompsonSampling ? this.cloneThompsonSampling() : null,
      heuristic: flags.enableHeuristicBaseline ? this.cloneHeuristicLearner() : null,
      actrMemory: flags.enableACTRMemory ? this.cloneACTRMemoryModel() : null,
      userParams: flags.enableUserParamsManager ? this.cloneUserParamsManager() : null,
    };

    this.userModels.set(userId, {
      models,
      lastAccessedAt: now,
      createdAt: now,
    });

    return models;
  }

  deleteUserModels(userId: string): void {
    this.userModels.delete(userId);
  }

  async withUserLock<T>(
    userId: string,
    fn: () => Promise<T>,
    timeoutMs: number = 30000,
  ): Promise<T> {
    const previousLock = this.userLocks.get(userId) ?? Promise.resolve();

    let releaseLock: () => void;
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const chainedLock = previousLock.catch(() => {}).then(() => currentLock);
    this.userLocks.set(userId, chainedLock);

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isReleased = false;

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (!isReleased) {
        isReleased = true;
        releaseLock!();
        if (this.userLocks.get(userId) === chainedLock) {
          this.userLocks.delete(userId);
        }
      }
    };

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`用户锁超时 (${userId}): 操作超过 ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      await Promise.race([previousLock.catch(() => {}), timeoutPromise]);
    } catch (error) {
      cleanup();
      throw error;
    }

    try {
      return await Promise.race([fn(), timeoutPromise]);
    } finally {
      cleanup();
    }
  }

  getInteractionCount(userId: string, provided?: number): number {
    if (provided !== undefined) return provided;
    const entry = this.interactionCounts.get(userId);
    return entry?.count ?? 0;
  }

  incrementInteractionCount(userId: string): void {
    const now = Date.now();
    const entry = this.interactionCounts.get(userId);
    if (entry) {
      entry.count++;
      entry.lastUpdatedAt = now;
    } else {
      this.interactionCounts.set(userId, {
        count: 1,
        lastUpdatedAt: now,
      });
    }
  }

  resetInteractionCount(userId: string): void {
    this.interactionCounts.delete(userId);
  }

  // 模型克隆方法
  private cloneAttentionMonitor(): AttentionMonitor {
    const template = this.modelTemplates.attention;
    const state = template.getState();
    const clone = new AttentionMonitor(undefined, state.beta, state.prevAttention);
    return clone;
  }

  private cloneFatigueEstimator(): FatigueEstimator {
    const template = this.modelTemplates.fatigue;
    const state = template.getState();
    const clone = new FatigueEstimator(undefined, state.F);
    clone.setState(state);
    return clone;
  }

  private cloneCognitiveProfiler(): CognitiveProfiler {
    const template = this.modelTemplates.cognitive;
    const state = template.getState();
    const clone = new CognitiveProfiler();
    clone.setState(state);
    return clone;
  }

  private cloneMotivationTracker(): MotivationTracker {
    const template = this.modelTemplates.motivation;
    const state = template.getState();
    const clone = new MotivationTracker(undefined, state.M);
    clone.setState(state);
    return clone;
  }

  private cloneLinUCB(): LinUCB {
    const template = this.modelTemplates.bandit;
    if (template instanceof LinUCB) {
      const model = template.getModel();
      return new LinUCB({
        alpha: model.alpha,
        lambda: model.lambda,
        dimension: model.d,
      });
    }
    return new LinUCB();
  }

  private cloneEnsemble(): EnsembleLearningFramework {
    return new EnsembleLearningFramework();
  }

  private cloneTrendAnalyzer(): TrendAnalyzer {
    return new TrendAnalyzer();
  }

  private cloneColdStartManager(savedState?: ColdStartStateData): ColdStartManager {
    const manager = new ColdStartManager();
    if (savedState) {
      let phase = savedState.phase;
      let probeIndex = savedState.probeIndex;

      if (phase === 'classify' && probeIndex > 0) {
        if (savedState.settledStrategy && savedState.userType) {
          phase = 'explore';
        } else {
          probeIndex = 0;
        }
      }

      manager.setState({
        phase,
        userType: savedState.userType,
        probeIndex,
        results: [],
        settledStrategy: savedState.settledStrategy,
        updateCount: savedState.updateCount,
      });
    }
    return manager;
  }

  private cloneThompsonSampling(): ThompsonSampling {
    return new ThompsonSampling();
  }

  private cloneHeuristicLearner(): HeuristicLearner {
    return new HeuristicLearner();
  }

  private cloneACTRMemoryModel(): ACTRMemoryModel {
    return new ACTRMemoryModel();
  }

  private cloneUserParamsManager(): UserParamsManager {
    return new UserParamsManager();
  }
}

// ==================== 核心引擎 ====================

/**
 * AMAS 核心引擎
 */
export class AMASEngine {
  private featureBuilder: FeatureBuilder;
  private featureVectorBuilder: FeatureVectorBuilder;
  private stateRepo: StateRepository;
  private modelRepo: ModelRepository;
  private logger?: Logger;
  private decisionTracer: DecisionTracer;
  private persistence: PersistenceManager;

  private resilience: ResilienceManager;
  private isolation: IsolationManager;
  private modeling: ModelingManager;
  private learning: LearningManager;

  private rewardCacheManager: RewardCacheManager;

  constructor(deps: EngineDependencies = {}) {
    this.featureBuilder = deps.featureBuilder ?? new FeatureBuilder(DEFAULT_PERCEPTION_CONFIG);
    this.featureVectorBuilder =
      deps.featureVectorBuilder ?? new DefaultFeatureVectorBuilder(deps.logger);

    const flags = getFeatureFlags();

    const defaultBandit: DecisionModel =
      deps.bandit ?? (flags.enableEnsemble ? new EnsembleLearningFramework() : new LinUCB());

    const modelTemplates: UserModels = {
      attention: deps.attention ?? new AttentionMonitor(),
      fatigue: deps.fatigue ?? new FatigueEstimator(),
      cognitive: deps.cognitive ?? new CognitiveProfiler(),
      motivation: deps.motivation ?? new MotivationTracker(),
      bandit: defaultBandit,
      trendAnalyzer: flags.enableTrendAnalyzer ? (deps.trendAnalyzer ?? new TrendAnalyzer()) : null,
      coldStart: flags.enableColdStartManager
        ? (deps.coldStartManager ?? new ColdStartManager())
        : null,
      thompson: flags.enableThompsonSampling ? (deps.thompson ?? new ThompsonSampling()) : null,
      heuristic: flags.enableHeuristicBaseline ? (deps.heuristic ?? new HeuristicLearner()) : null,
      actrMemory: flags.enableACTRMemory ? (deps.actrMemory ?? new ACTRMemoryModel()) : null,
      userParams: flags.enableUserParamsManager
        ? (deps.userParamsManager ?? new UserParamsManager())
        : null,
    };

    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && (!deps.stateRepo || !deps.modelRepo)) {
      throw new Error(
        'AMAS Engine: 生产环境必须提供数据库存储仓库 (stateRepo/modelRepo)，' +
          '禁止使用内存存储以防止服务重启导致用户学习数据丢失',
      );
    }

    if (!isProduction && (!deps.stateRepo || !deps.modelRepo)) {
      amasLogger.warn(
        '[AMAS Engine] 使用内存存储，数据在服务重启后会丢失。生产环境请务必配置数据库存储。',
      );
    }

    this.stateRepo = deps.stateRepo ?? new MemoryStateRepository();
    this.modelRepo = deps.modelRepo ?? new MemoryModelRepository();
    this.logger = deps.logger;

    const recorder =
      deps.recorder ?? (deps.prisma ? getSharedDecisionRecorder(deps.prisma) : undefined);
    this.decisionTracer = deps.decisionTracer ?? createDecisionTracer(recorder, deps.logger);

    this.persistence =
      deps.persistence ??
      new DefaultPersistenceManager(this.stateRepo, this.modelRepo, this.logger);

    this.resilience = new ResilienceManager(this.logger);
    this.isolation = new IsolationManager(modelTemplates, deps.memoryConfig);
    this.modeling = new ModelingManager();
    this.learning = new LearningManager();

    this.rewardCacheManager =
      deps.rewardCacheManager ??
      createRewardCacheManager({
        ttlMs: 5 * 60 * 1000,
        maxSize: 10000,
        logger: this.logger,
      });
  }

  destroy(): void {
    this.isolation.destroy();
    this.rewardCacheManager.clearAll();
  }

  getMemoryStats(): {
    isolation: {
      userModelsCount: number;
      userLocksCount: number;
      interactionCountsCount: number;
      maxUsers: number;
      utilizationPercent: number;
    };
    rewardCache: {
      size: number;
      hits: number;
      misses: number;
      hitRate: number;
    };
  } {
    return {
      isolation: this.isolation.getMemoryStats(),
      rewardCache: this.rewardCacheManager.getCacheStats(),
    };
  }

  async processEvent(
    userId: string,
    rawEvent: RawEvent,
    opts: ProcessOptions = {},
  ): Promise<ProcessResult> {
    return this.isolation.withUserLock(userId, async () => {
      if (!this.resilience.canExecute()) {
        this.resilience.recordDegradation('circuit_open');
        this.logger?.warn('Circuit breaker is open', { userId });
        return this.createFallbackResult(userId, 'circuit_open', opts, rawEvent.timestamp);
      }

      const startTime = Date.now();
      const abortController = new AbortController();
      const timedOut: TimeoutFlag = { value: false };

      try {
        const decisionTimeout = process.env.NODE_ENV === 'production' ? 100 : 500;

        const result = await this.resilience.executeWithTimeout(
          () => this.processEventCore(userId, rawEvent, opts, abortController.signal, timedOut),
          decisionTimeout,
          userId,
          abortController,
          () => {
            timedOut.value = true;
          },
        );

        this.resilience.recordSuccess();
        this.resilience.recordLatency(Date.now() - startTime);

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.resilience.recordFailure(errorMessage);
        this.resilience.recordDegradation('exception', { message: errorMessage });

        this.logger?.error('Error processing event', { userId, error });
        return this.createFallbackResult(userId, 'exception', opts, rawEvent.timestamp);
      }
    });
  }

  private async processEventCore(
    userId: string,
    rawEvent: RawEvent,
    opts: ProcessOptions,
    signal?: AbortSignal,
    timedOut?: TimeoutFlag,
  ): Promise<ProcessResult> {
    const startTime = Date.now();

    const stageTiming = {
      perception: { start: 0, end: 0 },
      modeling: { start: 0, end: 0 },
      learning: { start: 0, end: 0 },
      decision: { start: 0, end: 0 },
      evaluation: { start: 0, end: 0 },
      optimization: { start: 0, end: 0 },
    };

    if (this.featureBuilder.isAnomalous(rawEvent)) {
      this.logger?.warn('Anomalous event detected', { userId, event: rawEvent });
      return this.createFallbackResult(userId, 'degraded_state', opts, rawEvent.timestamp);
    }

    const prevState = await this.loadOrCreateState(userId);

    const models = this.isolation.getUserModels(userId);
    await this.loadModelIfExists(userId, models.bandit);

    const rewardProfile = await this.getCachedRewardProfile(userId);

    if (signal?.aborted || timedOut?.value) {
      throw new Error('Operation cancelled');
    }

    stageTiming.perception.start = Date.now();
    const featureVec = this.featureBuilder.buildFeatureVector(rawEvent, userId);
    stageTiming.perception.end = Date.now();

    const interactionCount = this.isolation.getInteractionCount(userId, opts.interactionCount);
    const recentAccuracy = opts.recentAccuracy ?? 0.5;
    const recentErrorRate = 1 - recentAccuracy;

    stageTiming.modeling.start = Date.now();
    const state = this.modeling.updateUserState(
      prevState,
      featureVec,
      rawEvent,
      recentErrorRate,
      models,
    );
    stageTiming.modeling.end = Date.now();

    const context = {
      recentErrorRate,
      recentResponseTime: rawEvent.responseTime,
      timeBucket: this.modeling.getTimeBucket(rawEvent.timestamp),
    };

    const coldStartPhase = this.getColdStartPhase(userId);
    const inColdStartPhase = coldStartPhase !== 'normal';

    this.learning.applyUserParams(
      models,
      userId,
      interactionCount,
      recentAccuracy,
      state.F,
      inColdStartPhase,
    );

    stageTiming.learning.start = Date.now();
    const { action, contextVec, confidence } = this.learning.selectAction(
      state,
      models,
      context,
      coldStartPhase,
      interactionCount,
      recentAccuracy,
      opts.wordReviewHistory,
    );
    stageTiming.learning.end = Date.now();

    const inferenceLatencyMs = stageTiming.learning.end - stageTiming.learning.start;
    recordInferenceLatencyMs(inferenceLatencyMs);
    if (confidence !== undefined && Number.isFinite(confidence)) {
      recordDecisionConfidence(confidence);
    }

    stageTiming.decision.start = Date.now();
    const currentParams = opts.currentParams ?? DEFAULT_STRATEGY;
    const mappedParams = mapActionToStrategy(action, currentParams);
    let finalStrategy: StrategyParams = applyGuardrails(state, mappedParams);
    const forceBreak = shouldForceBreak(state);
    if (forceBreak) {
      finalStrategy = {
        ...finalStrategy,
        interval_scale: Math.max(finalStrategy.interval_scale, 1.0),
        new_ratio: Math.min(finalStrategy.new_ratio, 0.1),
        difficulty: 'easy',
        batch_size: Math.min(finalStrategy.batch_size, 5),
        hint_level: Math.max(finalStrategy.hint_level, 1),
      };
    }

    let objectiveEvaluation: ObjectiveEvaluation | undefined;
    let multiObjectiveAdjusted = false;

    if (opts.learningObjectives && opts.sessionStats) {
      try {
        const moDecision = MultiObjectiveDecisionEngine.makeDecision(
          finalStrategy,
          opts.learningObjectives,
          opts.sessionStats,
          state,
        );

        objectiveEvaluation = moDecision.evaluation;

        if (moDecision.shouldAdjust) {
          finalStrategy = moDecision.newStrategy;
          multiObjectiveAdjusted = true;

          this.logger?.info('Multi-objective optimization adjusted strategy', {
            userId,
            mode: opts.learningObjectives.mode,
            aggregatedScore: moDecision.evaluation.metrics.aggregatedScore,
            constraintsSatisfied: moDecision.evaluation.constraintsSatisfied,
            violationCount: moDecision.evaluation.constraintViolations.length,
          });
        }
      } catch (err) {
        this.logger?.warn('Multi-objective optimization failed', { userId, error: err });
      }
    }

    const alignedAction = mapStrategyToAction(finalStrategy, action);

    const alignedContextVec = this.learning.buildContextVector(
      models,
      state,
      alignedAction,
      context,
    );
    const finalContextVec = alignedContextVec ?? contextVec;

    stageTiming.decision.end = Date.now();

    recordActionSelection({
      difficulty: alignedAction.difficulty,
      batch_size: alignedAction.batch_size,
      hint_level: alignedAction.hint_level,
      interval_scale: alignedAction.interval_scale,
      new_ratio: alignedAction.new_ratio,
    });

    const explanation = generateExplanation(state, currentParams, finalStrategy);
    const suggestion = forceBreak
      ? '疲劳度过高，请先休息后再继续学习。'
      : generateSuggestion(state);

    const decisionSource = this.getDecisionSource(models, coldStartPhase);
    const enhancedExplanation = generateEnhancedExplanation(state, currentParams, finalStrategy, {
      algorithm: decisionSource,
      confidence: confidence || 0.5,
      phase: coldStartPhase !== 'normal' ? coldStartPhase : undefined,
    });

    stageTiming.evaluation.start = Date.now();
    const reward = this.learning.computeReward(rawEvent, state, rewardProfile);
    stageTiming.evaluation.end = Date.now();

    if (signal?.aborted || timedOut?.value) {
      throw new Error('Operation cancelled');
    }

    stageTiming.optimization.start = Date.now();
    if (!opts.skipUpdate) {
      this.learning.updateModels(
        models,
        state,
        prevState,
        alignedAction,
        reward,
        context,
        coldStartPhase,
        userId,
        rawEvent.isCorrect,
        opts.wordReviewHistory,
      );
      this.isolation.incrementInteractionCount(userId);
    }
    stageTiming.optimization.end = Date.now();

    if (timedOut?.value || signal?.aborted) {
      throw new Error('Operation cancelled');
    }

    const coldStartState = models.coldStart
      ? {
          phase: models.coldStart.getPhase(),
          userType: models.coldStart.getUserType(),
          probeIndex: models.coldStart.getState().probeIndex,
          updateCount: models.coldStart.getUpdateCount(),
          settledStrategy: models.coldStart.getSettledStrategy(),
        }
      : undefined;

    await this.persistence.saveState(userId, state, coldStartState);
    await this.persistence.saveModel(userId, models.bandit);

    const elapsed = Date.now() - startTime;
    if (elapsed > 100) {
      this.logger?.warn('Decision exceeded 100ms', { userId, elapsed });
    }

    if (opts.answerRecordId) {
      void this.decisionTracer.recordDecisionTrace({
        answerRecordId: opts.answerRecordId,
        sessionId: opts.sessionId,
        timestamp: new Date(rawEvent.timestamp),
        decisionSource: this.getDecisionSource(models, coldStartPhase),
        coldstartPhase: coldStartPhase !== 'normal' ? coldStartPhase : undefined,
        weightsSnapshot: this.extractWeights(models),
        memberVotes: this.extractVotes(models),
        selectedAction: alignedAction,
        confidence: this.getConfidence(models),
        reward,
        totalDurationMs: elapsed,
        stageTiming,
      });
    }

    const persistableFeatureVector = this.featureVectorBuilder.buildPersistableFeatureVector(
      finalContextVec,
      featureVec.ts,
    );

    const shouldBreakFlag = forceBreak || shouldSuggestBreak(state);

    return {
      strategy: finalStrategy,
      action: alignedAction,
      explanation,
      enhancedExplanation,
      state,
      reward,
      suggestion,
      shouldBreak: shouldBreakFlag,
      featureVector: persistableFeatureVector,
      objectiveEvaluation,
      multiObjectiveAdjusted,
    };
  }

  async getState(userId: string) {
    return this.stateRepo.loadState(userId);
  }

  async resetUser(userId: string): Promise<void> {
    this.isolation.deleteUserModels(userId);
    this.isolation.resetInteractionCount(userId);

    this.featureBuilder.resetWindows(userId);

    const defaultState = this.modeling.createDefaultState();
    await this.stateRepo.saveState(userId, defaultState);

    const flags = getFeatureFlags();
    if (flags.enableEnsemble) {
      const defaultEnsemble = new EnsembleLearningFramework();
      await this.modelRepo.saveModel(userId, defaultEnsemble.getState().linucb);
    } else {
      const defaultBandit = new LinUCB();
      await this.modelRepo.saveModel(userId, defaultBandit.getModel());
    }
  }

  getColdStartPhase(userId: string): ColdStartPhase {
    const models = this.isolation.getUserModels(userId);
    if (isColdStartEnabled() && models?.coldStart) {
      return models.coldStart.getPhase();
    }

    const count = this.isolation.getInteractionCount(userId);
    if (count < CLASSIFY_PHASE_THRESHOLD) return 'classify';
    if (count < EXPLORE_PHASE_THRESHOLD) return 'explore';
    return 'normal';
  }

  async applyDelayedRewardUpdate(
    userId: string,
    featureVector: number[],
    reward: number,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const model = await this.modelRepo.loadModel(userId);
      if (!model) {
        return { success: false, error: 'model_not_found' };
      }

      let alignedFeatureVector = featureVector;
      if (featureVector.length !== model.d) {
        this.logger?.info('Feature vector dimension mismatch, applying compatibility fix', {
          userId,
          featureVectorLength: featureVector.length,
          modelDimension: model.d,
        });

        alignedFeatureVector = this.featureVectorBuilder.alignFeatureVectorDimension(
          featureVector,
          model.d,
        );
      }

      const tempBandit = new LinUCB({
        alpha: model.alpha,
        lambda: model.lambda,
        dimension: model.d,
      });
      tempBandit.setModel(model);
      tempBandit.updateWithFeatureVector(new Float32Array(alignedFeatureVector), reward);

      await this.modelRepo.saveModel(userId, tempBandit.getModel());

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  // 私有方法
  private async loadOrCreateState(userId: string): Promise<UserState> {
    const state = await this.persistence.loadState(userId);

    if (!state) {
      return this.modeling.createDefaultState();
    }

    const stateWithColdStart = state as UserStateWithColdStart;
    if (stateWithColdStart.coldStartState) {
      this.isolation.getUserModels(userId, stateWithColdStart.coldStartState);
    }

    const now = Date.now();
    const isValidTs =
      typeof state.ts === 'number' && Number.isFinite(state.ts) && state.ts > 0 && state.ts <= now;
    const lastActiveAt = isValidTs ? state.ts : now;
    const offlineMs = now - lastActiveAt;
    const safeOfflineMs = Number.isFinite(offlineMs) && offlineMs >= 0 ? offlineMs : 0;
    const offlineDays = safeOfflineMs / (1000 * 60 * 60 * 24);

    if (Number.isFinite(offlineDays) && offlineDays >= 1) {
      try {
        const snapshot: UserStateSnapshot = {
          attention: state.A,
          fatigue: state.F,
          motivation: state.M,
          cognitiveProfile: state.C,
          lastActiveAt,
          coldStartPhase: this.getColdStartPhase(userId),
          totalLearningMinutes: undefined,
        };

        const config = await newUserInitializer.handleReturningUser(userId, snapshot);

        if (config.needsReColdStart) {
          this.isolation.deleteUserModels(userId);
          this.logger?.info('Returning user needs re-cold-start', {
            userId,
            offlineDays: config.offlineDays,
            decayFactor: config.decayFactor,
          });
        }

        const inheritedState = config.inheritedState;
        return {
          A: inheritedState.attention ?? state.A,
          F: inheritedState.fatigue ?? state.F,
          M: inheritedState.motivation ?? state.M,
          C: inheritedState.cognitiveProfile ?? state.C,
          H: state.H,
          T: state.T,
          conf: Math.max(0.3, state.conf * config.decayFactor),
          ts: now,
        };
      } catch (err) {
        this.logger?.warn('Failed to handle returning user', { userId, error: err });
        return state;
      }
    }

    return state;
  }

  private async loadModelIfExists(userId: string, bandit: DecisionModel): Promise<void> {
    await this.persistence.loadModelIfExists(userId, bandit);
  }

  private async getCachedRewardProfile(
    userId: string,
  ): Promise<ReturnType<typeof getRewardProfile>> {
    const cachedProfileId = this.rewardCacheManager.getCachedProfileId(userId);
    if (cachedProfileId !== undefined) {
      return getRewardProfile(cachedProfileId ?? undefined);
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { rewardProfile: true },
      });

      const profileId = user?.rewardProfile ?? null;

      this.rewardCacheManager.setCachedProfileId(userId, profileId);

      return getRewardProfile(profileId ?? undefined);
    } catch (err) {
      this.logger?.warn('Failed to load reward profile', { userId, error: err });
      return getRewardProfile(undefined);
    }
  }

  invalidateRewardProfileCache(userId: string): void {
    this.rewardCacheManager.invalidateCache(userId);
  }

  getRewardCacheManager(): RewardCacheManager {
    return this.rewardCacheManager;
  }

  private async createFallbackResult(
    userId: string,
    reason: 'circuit_open' | 'exception' | 'degraded_state',
    opts: ProcessOptions,
    eventTimestamp?: number,
  ): Promise<ProcessResult> {
    return this.resilience.createIntelligentFallbackResult(
      userId,
      reason,
      opts,
      () => this.loadOrCreateState(userId),
      (uid, provided) => this.isolation.getInteractionCount(uid, provided),
      eventTimestamp,
    );
  }

  private getDecisionSource(models: UserModels, coldStartPhase: ColdStartPhase): string {
    if (coldStartPhase !== 'normal') {
      return 'coldstart';
    }
    if (models.bandit instanceof EnsembleLearningFramework) {
      return 'ensemble';
    }
    return 'linucb';
  }

  private extractWeights(models: UserModels): Record<string, number> | undefined {
    if (!(models.bandit instanceof EnsembleLearningFramework)) {
      return undefined;
    }

    try {
      const state = models.bandit.getState();
      if (!state.weights) return undefined;
      const weights: Record<string, number> = {};
      for (const [key, value] of Object.entries(state.weights)) {
        weights[key] = value;
      }
      return weights;
    } catch {
      return undefined;
    }
  }

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
