/**
 * AMAS Engine - 用户隔离模块
 *
 * 负责用户级别的模型隔离和并发控制
 */

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
import { getFeatureFlags } from '../config/feature-flags';
import { DecisionModel, UserModels, ColdStartStateData } from './engine-types';

/**
 * 用户隔离管理器
 *
 * 负责：
 * - 用户专属模型实例管理
 * - 用户级锁（防止并发冲突）
 * - 模型克隆
 */
export class IsolationManager {
  // 用户隔离：每个用户拥有独立的模型实例
  private userModels = new Map<string, UserModels>();

  // 用户级锁：防止同一用户的并发请求冲突
  private userLocks = new Map<string, Promise<unknown>>();

  // 运行时状态
  private interactionCounts = new Map<string, number>();

  // 模型模板：用于克隆新用户模型
  private modelTemplates: UserModels;

  constructor(templates: UserModels) {
    this.modelTemplates = templates;
  }

  /**
   * 获取用户专属模型实例
   *
   * 每个用户拥有独立的建模层实例，避免跨用户状态污染
   */
  getUserModels(userId: string, coldStartState?: ColdStartStateData): UserModels {
    let models = this.userModels.get(userId);
    if (!models) {
      const flags = getFeatureFlags();

      // 根据功能开关选择算法
      let bandit: DecisionModel;
      if (flags.enableEnsemble) {
        bandit = this.cloneEnsemble();
      } else {
        // 默认使用 LinUCB
        bandit = this.cloneLinUCB();
      }

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
          ? this.cloneColdStartManager(coldStartState)
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
   * 删除用户模型实例
   */
  deleteUserModels(userId: string): void {
    this.userModels.delete(userId);
  }

  /**
   * 用户级锁机制
   *
   * 防止同一用户的并发请求导致 Lost Update
   * 注意：前一个请求的异常会被吞掉，不会传播给后续请求
   */
  async withUserLock<T>(userId: string, fn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> {
    const previousLock = this.userLocks.get(userId) ?? Promise.resolve();

    let releaseLock: () => void;
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const chainedLock = previousLock.catch(() => {}).then(() => currentLock);
    this.userLocks.set(userId, chainedLock);

    // 创建超时Promise
    const createTimeout = () => new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`用户锁超时 (${userId}): 操作超过 ${timeoutMs}ms`)), timeoutMs);
    });

    // 等待前一个锁释放（带超时）
    try {
      await Promise.race([previousLock.catch(() => {}), createTimeout()]);
    } catch (error) {
      releaseLock!();
      if (this.userLocks.get(userId) === chainedLock) {
        this.userLocks.delete(userId);
      }
      throw error;
    }

    try {
      return await Promise.race([fn(), createTimeout()]);
    } finally {
      releaseLock!();
      if (this.userLocks.get(userId) === chainedLock) {
        this.userLocks.delete(userId);
      }
    }
  }

  /**
   * 获取交互计数
   */
  getInteractionCount(userId: string, provided?: number): number {
    if (provided !== undefined) return provided;
    return this.interactionCounts.get(userId) ?? 0;
  }

  /**
   * 增加交互计数
   */
  incrementInteractionCount(userId: string): void {
    const current = this.interactionCounts.get(userId) ?? 0;
    this.interactionCounts.set(userId, current + 1);
  }

  /**
   * 重置用户交互计数
   */
  resetInteractionCount(userId: string): void {
    this.interactionCounts.delete(userId);
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
   * 克隆 LinUCB 模型
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
    // 新用户使用默认初始化，不复制学习历史
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
  private cloneColdStartManager(savedState?: ColdStartStateData): ColdStartManager {
    const manager = new ColdStartManager();
    if (savedState) {
      manager.setState({
        phase: savedState.phase,
        userType: savedState.userType,
        probeIndex: savedState.probeIndex,
        results: [],  // 探测结果不需要持久化
        settledStrategy: savedState.settledStrategy,
        updateCount: savedState.updateCount
      });
    }
    return manager;
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
}
