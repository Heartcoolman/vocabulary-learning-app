/**
 * AMAS 核心接口定义
 *
 * 定义 AMAS 系统中决策层的核心接口，实现决策与执行的分离
 *
 * 架构设计：
 * - 决策接口：对齐现有 Action/StrategyParams，负责学习策略参数
 * - 特征构建：从事件构建特征向量，用于上下文感知决策
 * - 奖励评估：计算即时奖励值，指导策略学习
 *
 * 注意：选词接口已独立于 policies/word-selector.interface.ts
 */

import { Action, RawEvent, StrategyParams, UserState } from '../types';

// ==================== 特征构建接口 ====================

/**
 * 特征构建器接口
 *
 * 负责从原始事件和历史记录构建标准化特征向量
 */
export interface IFeatureBuilder {
  /**
   * 从单个事件构建特征向量
   *
   * @param event 原始学习事件
   * @param userState 用户当前状态
   * @param userId 用户ID（用于维护用户专属统计窗口）
   * @returns 特征向量（数值数组）
   */
  buildFromEvent(event: RawEvent, userState: UserState, userId: string): number[];

  /**
   * 从历史事件序列构建特征向量
   *
   * @param events 历史事件列表
   * @param userState 用户当前状态
   * @param userId 用户ID
   * @returns 特征向量（数值数组）
   */
  buildFromHistory(events: RawEvent[], userState: UserState, userId: string): number[];

  /**
   * 获取特征维度
   */
  getFeatureDimension(): number;
}

// ==================== 决策策略接口 ====================

/**
 * 决策上下文
 *
 * 包含做决策所需的上下文信息
 */
export interface DecisionContext {
  /** 近期错误率 [0,1] */
  recentErrorRate: number;
  /** 近期平均反应时间(ms) */
  recentResponseTime: number;
  /** 时间段 (0-23小时) */
  timeBucket: number;
  /** 用户ID（用于用户隔离） */
  userId: string;
  /** 交互次数 */
  interactionCount?: number;
}

/**
 * 决策结果
 *
 * 包含选择的动作及其元信息
 */
export interface DecisionResult {
  /** 选择的动作（包含策略参数） */
  action: Action;
  /** 决策置信度 [0,1] */
  confidence: number;
  /** 决策解释 */
  explanation: string;
  /** 决策评分（用于集成学习） */
  score?: number;
  /** 额外元数据 */
  meta?: Record<string, unknown>;
}

/**
 * 决策策略接口
 *
 * 核心职责：选择最优学习策略参数（Action）
 *
 * 对齐现有 Action 结构，包含：
 * - interval_scale: 间隔缩放因子
 * - new_ratio: 新词比例
 * - difficulty: 难度等级
 * - batch_size: 批量大小
 * - hint_level: 提示级别
 */
export interface IDecisionPolicy {
  /**
   * 选择最优动作
   *
   * @param state 用户状态
   * @param actions 可选动作列表
   * @param features 特征向量（可选，用于上下文感知决策）
   * @param context 决策上下文
   * @returns 决策结果
   */
  selectAction(
    state: UserState,
    actions: Action[],
    features: number[],
    context: DecisionContext,
  ): DecisionResult;

  /**
   * 更新模型
   *
   * @param action 执行的动作
   * @param reward 奖励值 [-1, 1]
   * @param features 特征向量
   * @param context 决策上下文
   */
  updateModel(action: Action, reward: number, features: number[], context: DecisionContext): void;

  /**
   * 获取策略名称
   */
  getName(): string;

  /**
   * 获取策略版本
   */
  getVersion(): string;
}

// ==================== 奖励评估接口 ====================

/**
 * 奖励详情
 *
 * 包含奖励值及其分解信息
 */
export interface RewardDetails {
  /** 总奖励值 [-1, 1] */
  value: number;
  /** 奖励来源说明 */
  reason: string;
  /** 时间戳 */
  timestamp: number;
  /** 分项奖励 */
  breakdown?: {
    correctness?: number;
    fatigue?: number;
    speed?: number;
    frustration?: number;
    engagement?: number;
  };
}

/**
 * 奖励评估器接口
 *
 * 负责计算即时奖励值，指导策略学习
 *
 * 实现示例：
 * - src/amas/rewards/immediate-reward.ts - ImmediateRewardEvaluator
 */
export interface IRewardEvaluator {
  /**
   * 计算即时奖励
   *
   * @param event 原始事件
   * @param state 用户状态
   * @param previousState 先前的用户状态（可选，用于计算状态变化）
   * @returns 奖励详情
   */
  computeImmediate(event: RawEvent, state: UserState, previousState?: UserState): RewardDetails;

  /**
   * 设置奖励配置文件
   *
   * @param profileId 配置文件ID（如 'standard', 'cram', 'relaxed'）
   */
  setRewardProfile?(profileId: string): void;
}

// ==================== 类型导出说明 ====================
/**
 * 接口导出说明：
 *
 * 已使用的接口（导出）：
 * - IDecisionPolicy: 决策策略接口，被 adapters 层使用
 * - DecisionContext: 决策上下文，被 adapters 层使用
 * - DecisionResult: 决策结果，被 adapters 层使用
 * - IFeatureBuilder: 特征构建器接口，被 adapters 层使用
 * - IRewardEvaluator: 奖励评估器接口，由 rewards/immediate-reward.ts 实现
 * - RewardDetails: 奖励详情，由奖励评估器返回
 *
 * 已移除的接口：
 * - IWordSelector: 与 policies/word-selector.interface.ts 重复定义，已移除
 * - SelectedWord: 与实际使用的 SelectionResult 不兼容，已移除
 * - WordSelectionContext: 与实际使用的 SelectionContext 不兼容，已移除
 *
 * 选词接口实际使用位置：
 * - 接口定义: src/amas/policies/word-selector.interface.ts
 * - 实现示例: src/amas/policies/micro-session-policy.ts
 */
