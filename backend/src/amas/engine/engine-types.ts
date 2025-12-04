/**
 * AMAS Engine - 类型定义模块
 *
 * 集中定义引擎核心类型和接口，避免循环依赖
 */

import { LinUCB } from '../learning/linucb';
import { EnsembleLearningFramework } from '../decision/ensemble';
import { AttentionMonitor } from '../modeling/attention-monitor';
import { FatigueEstimator } from '../modeling/fatigue-estimator';
import { CognitiveProfiler } from '../modeling/cognitive-profiler';
import { MotivationTracker } from '../modeling/motivation-tracker';
import { TrendAnalyzer } from '../modeling/trend-analyzer';
import { ACTRMemoryModel } from '../modeling/actr-memory';
import { ColdStartManager } from '../learning/coldstart';
import { ThompsonSampling } from '../learning/thompson-sampling';
import { HeuristicLearner } from '../learning/heuristic';
import { UserParamsManager } from '../config/user-params';
import { FeatureBuilder } from '../perception/feature-builder';
import {
  Action,
  BanditModel,
  PersistableFeatureVector,
  StrategyParams,
  UserState
} from '../types';

// 重导出 Action 类型供其他模块使用
export type { Action } from '../types';

// ==================== 决策模型类型 ====================

/**
 * 决策模型类型 - 支持 LinUCB、Thompson Sampling 或 Ensemble
 */
export type DecisionModel = LinUCB | EnsembleLearningFramework | import('../learning/thompson-sampling').ThompsonSampling;

// ==================== Thompson 探索钩子 ====================

/**
 * Thompson 探索钩子接口
 *
 * 将 Thompson Sampling 的核心采样能力封装为可选钩子，
 * 用于在 ColdStart 的 explore 阶段增强探索能力
 */
export interface ThompsonExploreHook {
  /**
   * 判断是否应该进行探索
   * @param state 用户当前状态
   * @param context 决策上下文
   * @returns 是否应该探索
   */
  shouldExplore(state: UserState, context: ExploreContext): boolean;

  /**
   * 从可选动作中选择探索动作
   * @param state 用户当前状态
   * @param actions 可选动作列表
   * @param context 决策上下文
   * @returns 选中的探索动作
   */
  selectExploreAction(
    state: UserState,
    actions: Action[],
    context: ExploreContext
  ): Action;

  /**
   * 更新探索模型
   * @param state 用户状态
   * @param action 执行的动作
   * @param reward 奖励值
   * @param context 决策上下文
   */
  updateExplore(
    state: UserState,
    action: Action,
    reward: number,
    context: ExploreContext
  ): void;
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

// ==================== 用户隔离类型 ====================

/**
 * 用户专属模型实例集合
 * 每个用户拥有独立的建模层实例，避免跨用户状态污染
 */
export interface UserModels {
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
export interface TimeoutFlag {
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

export class MemoryStateRepository implements StateRepository {
  private store = new Map<string, UserState>();

  async loadState(userId: string): Promise<UserState | null> {
    return this.store.get(userId) ?? null;
  }

  async saveState(userId: string, state: UserState): Promise<void> {
    this.store.set(userId, state);
  }

  // 兼容旧版别名
  async get(userId: string): Promise<UserState | null> {
    return this.loadState(userId);
  }

  async save(userId: string, state: UserState): Promise<void> {
    return this.saveState(userId, state);
  }
}

export class MemoryModelRepository implements ModelRepository {
  private store = new Map<string, BanditModel>();

  async loadModel(userId: string): Promise<BanditModel | null> {
    return this.store.get(userId) ?? null;
  }

  async saveModel(userId: string, model: BanditModel): Promise<void> {
    this.store.set(userId, model);
  }

  // 兼容旧版别名
  async get(userId: string): Promise<BanditModel | null> {
    return this.loadModel(userId);
  }

  async save(userId: string, model: BanditModel): Promise<void> {
    return this.saveModel(userId, model);
  }
}

// ==================== 引擎依赖和选项 ====================

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
  // 决策记录器（可选，用于持久化决策轨迹）
  recorder?: any; // 使用 any 避免循环依赖，实际类型为 DecisionRecorderService
  // Prisma客户端（可选，用于自动创建默认 recorder）
  prisma?: any; // 使用 any 避免循环依赖，实际类型为 PrismaClient
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
  /** 答题记录ID (用于关联决策记录) */
  answerRecordId?: string;
  /** 学习会话ID */
  sessionId?: string;
  /** 学习目标配置 */
  learningObjectives?: import('../types').LearningObjectives;
  /** 会话统计数据 */
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
}

/**
 * 单词掌握判定结果
 */
export interface WordMasteryDecision {
  /** 是否已掌握 */
  isMastered: boolean;
  /** 判定置信度 [0,1] */
  confidence: number;
  /** 建议重复次数 */
  suggestedRepeats: number;
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
  /** 增强的决策解释（包含详细因素分析） */
  enhancedExplanation?: import('../decision/explain').EnhancedExplanation;
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
  /** 单词掌握判定 (用于掌握度学习模式) */
  wordMasteryDecision?: WordMasteryDecision;
  /** 多目标评估结果 (当配置了学习目标时) */
  objectiveEvaluation?: import('../types').ObjectiveEvaluation;
  /** 多目标优化是否触发了策略调整 */
  multiObjectiveAdjusted?: boolean;
}

// ==================== 工具函数 ====================

/**
 * 数值裁剪
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
