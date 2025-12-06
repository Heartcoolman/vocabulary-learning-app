/**
 * AMAS Learning Layer - Base Learner Interface
 * 统一学习器接口定义
 *
 * 所有学习算法（LinUCB、Thompson Sampling、ACT-R等）都实现此接口，
 * 以支持集成学习框架的热插拔
 */

import { Action, UserState } from '../types';

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
 * 这样设计是为了支持不同类型的学习器（如ACT-R不需要errorRate）
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
 *
 * @typeParam State - 用户状态类型
 * @typeParam ActionType - 动作类型
 * @typeParam Context - 上下文类型
 * @typeParam PersistedState - 持久化状态类型
 */
export interface BaseLearner<
  State = UserState,
  ActionType = Action,
  Context = BaseLearnerContext,
  PersistedState = unknown
> {
  /**
   * 选择最优动作
   *
   * @param state - 用户当前状态
   * @param actions - 可选动作列表
   * @param context - 上下文信息
   * @returns 动作选择结果，包含动作、评分和置信度
   */
  selectAction(
    state: State,
    actions: ActionType[],
    context: Context
  ): ActionSelection<ActionType>;

  /**
   * 更新模型
   *
   * @param state - 用户状态
   * @param action - 执行的动作
   * @param reward - 奖励值 [-1, 1]
   * @param context - 上下文信息
   */
  update(
    state: State,
    action: ActionType,
    reward: number,
    context: Context
  ): void;

  /**
   * 获取模型状态（用于持久化）
   */
  getState(): PersistedState;

  /**
   * 恢复模型状态
   *
   * @param state - 持久化的状态
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
 * 注意：updateCount 由各实现自行管理，避免多源问题
 */
export abstract class AbstractBaseLearner<
  State = UserState,
  ActionType = Action,
  Context = BaseLearnerContext,
  PersistedState = unknown
> implements BaseLearner<State, ActionType, Context, PersistedState> {

  abstract selectAction(
    state: State,
    actions: ActionType[],
    context: Context
  ): ActionSelection<ActionType>;

  abstract update(
    state: State,
    action: ActionType,
    reward: number,
    context: Context
  ): void;

  abstract getState(): PersistedState;

  abstract setState(state: PersistedState): void;

  abstract getName(): string;

  abstract getVersion(): string;

  abstract getCapabilities(): LearnerCapabilities;

  abstract getUpdateCount(): number;

  abstract reset(): void;
}
