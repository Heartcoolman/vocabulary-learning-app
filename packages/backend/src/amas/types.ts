/**
 * AMAS (Adaptive Multi-dimensional Aware System) Core Types
 * 自适应多维度用户感知智能学习算法 - 核心类型定义
 */

import type { ProcessedVisualFatigueData } from '@danci/shared';

// 重导出视觉疲劳数据类型，供其他模块使用
export type { ProcessedVisualFatigueData } from '@danci/shared';

// ==================== 用户状态建模 ====================

/**
 * 认知能力画像
 */
export interface CognitiveProfile {
  /** 记忆力 [0,1] - 基于正确率的EMA */
  mem: number;
  /** 速度 [0,1] - 归一化的反应速度 */
  speed: number;
  /** 稳定性 [0,1] - 1 - 归一化错误率方差 */
  stability: number;
}

/**
 * 学习习惯画像 (扩展版)
 */
export interface HabitProfile {
  /** 24小时时间偏好分布(归一化直方图) */
  timePref: number[];
  /** 节奏偏好 */
  rhythmPref: {
    /** 会话时长中位数(分钟) */
    sessionMedianMinutes: number;
    /** 批量大小中位数 */
    batchMedian: number;
  };
  /** 偏好时间段 (小时数组, 如 [9, 14, 20]) */
  preferredTimeSlots: number[];
  /** 样本统计 */
  samples: {
    /** 时间事件数 */
    timeEvents: number;
    /** 会话记录数 */
    sessions: number;
    /** 批量记录数 */
    batches: number;
  };
}

/**
 * 长期趋势状态
 */
export type TrendState = 'up' | 'flat' | 'stuck' | 'down';

/**
 * 用户状态向量 - AMAS核心状态（后端格式）
 *
 * 此类型使用简写字段名用于后端内部处理和存储。
 * API 响应通过 utils/state-converter.ts 转换为前端格式。
 *
 * 字段映射关系：
 * - A (Attention)  -> 前端 attention
 * - F (Fatigue)    -> 前端 fatigue
 * - M (Motivation) -> 前端 motivation
 * - C.mem          -> 前端 memory
 * - C.speed        -> 前端 speed
 * - C.stability    -> 前端 stability
 * - conf           -> 前端 confidence
 * - ts             -> 前端 timestamp
 *
 * @see utils/state-converter.ts - toFrontendState(), toBackendState()
 * @see src/types/amas.ts (前端) - UserState (前端格式，使用全拼字段名)
 */
export interface UserState {
  /** 注意力 [0,1] - 0=完全分心, 1=高度专注 - 前端字段: attention */
  A: number;
  /** 疲劳度 [0,1] - 0=精力充沛, 1=极度疲劳 - 前端字段: fatigue */
  F: number;
  /** 认知能力画像 - 前端字段: cognitive, memory, speed, stability */
  C: CognitiveProfile;
  /** 动机 [-1,1] - -1=极度受挫, 1=高度积极 - 前端字段: motivation */
  M: number;
  /** 学习习惯画像 (扩展版) */
  H?: HabitProfile;
  /** 长期趋势 (扩展版) */
  T?: TrendState;
  /** 状态置信度 [0,1] - 前端字段: confidence */
  conf: number;
  /** 时间戳 - 前端字段: timestamp */
  ts: number;
  /** 视觉疲劳数据 (用于融合) - 可选 */
  visualFatigue?: VisualFatigueState;
  /** 融合疲劳度 [0,1] - 融合了视觉/行为/时间疲劳 */
  fusedFatigue?: number;
}

/**
 * 视觉疲劳状态 (存储在 UserState 中)
 */
export interface VisualFatigueState {
  /** 视觉疲劳评分 [0-1] */
  score: number;
  /** 置信度 [0-1] */
  confidence: number;
  /** 数据新鲜度 [0-1] */
  freshness: number;
  /** 疲劳趋势 [-1, 1] */
  trend: number;
  /** 最后更新时间 */
  lastUpdated: number;
}

// ==================== 动作与策略 ====================

/**
 * 难度等级
 */
export type DifficultyLevel = 'easy' | 'mid' | 'hard';

/**
 * Bandit动作 - 学习层输出
 */
export interface Action {
  /** 间隔缩放因子: 0.5 | 0.8 | 1.0 | 1.2 | 1.5 */
  interval_scale: number;
  /** 新词比例: 0.1 | 0.2 | 0.3 | 0.4 */
  new_ratio: number;
  /** 难度等级 */
  difficulty: DifficultyLevel;
  /** 批量大小: 5 | 8 | 12 | 16 */
  batch_size: number;
  /** 提示级别: 0 | 1 | 2 */
  hint_level: number;
}

/**
 * 策略参数 - 决策层输出
 */
export interface StrategyParams {
  interval_scale: number;
  new_ratio: number;
  difficulty: DifficultyLevel;
  batch_size: number;
  hint_level: number;
}

// ==================== 事件与特征 ====================

/**
 * 原始学习事件
 */
export interface RawEvent {
  /** 单词ID */
  wordId: string;
  /** 是否正确 */
  isCorrect: boolean;
  /** 反应时间(ms) */
  responseTime: number;
  /** 停留时长(ms) */
  dwellTime: number;
  /** 事件时间戳 */
  timestamp: number;
  /** 暂停次数 */
  pauseCount: number;
  /** 切屏次数 */
  switchCount: number;
  /** 重试次数 */
  retryCount: number;
  /** 失焦累计时长(ms) */
  focusLossDuration: number;
  /** 微交互密度(events/s) */
  interactionDensity: number;
  /** 对话框暂停时间(ms)，用于疲劳度计算时排除非学习时间 */
  pausedTimeMs?: number;
}

/**
 * 特征向量 - 感知层输出
 */
export interface FeatureVector {
  /** 特征值数组 (Float32Array优化性能) */
  values: Float32Array;
  /** 时间戳 */
  ts: number;
  /** 特征标签(用于解释) */
  labels: string[];
}

/**
 * 可序列化的特征向量 - 用于持久化和延迟奖励
 */
export interface PersistableFeatureVector {
  /** 特征值数组 (普通数组，便于JSON序列化) */
  values: number[];
  /** 特征版本号 */
  version: number;
  /** 归一化方法 */
  normMethod?: string;
  /** 时间戳 */
  ts: number;
  /** 特征标签 */
  labels: string[];
}

// ==================== Bandit模型 ====================

/**
 * LinUCB/LinTS模型参数
 */
export interface BanditModel {
  /** 协方差矩阵 A (d*d, 扁平化存储) */
  A: Float32Array;
  /** 奖励向量 b (d) */
  b: Float32Array;
  /** Cholesky分解 L (d*d, lower triangular) */
  L: Float32Array;
  /** 正则化系数 */
  lambda: number;
  /** UCB探索系数 */
  alpha: number;
  /** 特征维度 */
  d: number;
  /** 更新次数 */
  updateCount: number;
}

// ==================== 配置类型 ====================

/**
 * 归一化统计量
 */
export interface NormalizationStat {
  mean: number;
  std: number;
}

/**
 * 感知层配置
 */
export interface PerceptionConfig {
  /** 反应时间归一化参数 */
  rt: NormalizationStat;
  /** 暂停次数归一化参数 */
  pause: NormalizationStat;
  /** 失焦时长归一化参数 */
  focusLoss: NormalizationStat;
  /** 切屏次数归一化参数 */
  switches: NormalizationStat;
  /** 停留时长归一化参数 */
  dwell: NormalizationStat;
  /** 微交互密度归一化参数 */
  interactionDensity: NormalizationStat;
  /** 最大反应时间阈值(ms) */
  maxResponseTime: number;
  /** 最大暂停次数阈值 */
  maxPauseCount: number;
  /** 最大切屏次数阈值 */
  maxSwitchCount: number;
  /** 最大失焦时长阈值(ms) */
  maxFocusLoss: number;
}

/**
 * 注意力模型权重
 */
export interface AttentionWeights {
  rt_mean: number;
  rt_cv: number;
  pace_cv: number;
  pause: number;
  switch: number;
  drift: number;
  interaction: number;
  focus_loss: number;
}

/**
 * 疲劳模型参数
 */
export interface FatigueParams {
  /** 错误率权重 */
  beta: number;
  /** 反应时权重 */
  gamma: number;
  /** 重复错误权重 */
  delta: number;
  /** 衰减系数 */
  k: number;
  /** 长休息重置阈值(分钟) */
  longBreakThreshold: number;
}

/**
 * 动机模型参数
 */
export interface MotivationParams {
  /** 记忆系数 */
  rho: number;
  /** 成功奖励 */
  kappa: number;
  /** 失败惩罚 */
  lambda: number;
  /** 退出惩罚 */
  mu: number;
}

// ==================== 奖励与解释 ====================

/**
 * 奖励值
 */
export interface Reward {
  /** 奖励值 [-1,1] */
  value: number;
  /** 奖励来源说明 */
  reason: string;
  /** 时间戳 */
  ts: number;
}

/**
 * 决策解释
 */
export interface DecisionExplanation {
  /** 主要影响因素 */
  factors: Array<{
    name: string;
    value: number;
    impact: string;
    percentage: number;
  }>;
  /** 策略变化描述 */
  changes: string[];
  /** 完整解释文本 */
  text: string;
}

// ==================== 存储类型 ====================

/**
 * 持久化的AMAS状态
 */
export interface PersistedAMASState {
  userId: string;
  userState: UserState;
  banditModel: BanditModel;
  currentStrategy: StrategyParams;
  interactionCount: number;
  lastUpdated: number;
}

/**
 * 用户类型分类 (冷启动用)
 */
export type UserType = 'fast' | 'stable' | 'cautious';

/**
 * 冷启动阶段
 */
export type ColdStartPhase = 'classify' | 'explore' | 'normal';

// ==================== 学习目标类型 ====================

/**
 * 学习目标模式
 */
export type LearningObjectiveMode = 'exam' | 'daily' | 'travel' | 'custom';

/**
 * 学习目标配置
 */
export interface LearningObjectives {
  /** 用户ID */
  userId: string;
  /** 学习模式 */
  mode: LearningObjectiveMode;
  /** 主要目标 */
  primaryObjective: 'accuracy' | 'retention' | 'efficiency';
  /** 最低准确率要求 */
  minAccuracy?: number;
  /** 每日最大学习时间(分钟) */
  maxDailyTime?: number;
  /** 目标记忆保持率 */
  targetRetention?: number;
  /** 短期记忆权重 */
  weightShortTerm: number;
  /** 长期记忆权重 */
  weightLongTerm: number;
  /** 效率权重 */
  weightEfficiency: number;
}

/**
 * 多目标指标
 */
export interface MultiObjectiveMetrics {
  /** 短期记忆得分 */
  shortTermScore: number;
  /** 长期记忆得分 */
  longTermScore: number;
  /** 效率得分 */
  efficiencyScore: number;
  /** 聚合得分 */
  aggregatedScore: number;
  /** 时间戳 */
  ts: number;
}

/**
 * 约束违规项
 */
export interface ConstraintViolation {
  /** 约束名称 */
  constraint: string;
  /** 期望值 */
  expected: number;
  /** 实际值 */
  actual: number;
}

/**
 * 策略调整建议
 */
export interface StrategyAdjustment {
  /** 参数名 */
  param: string;
  /** 当前值 */
  currentValue: number;
  /** 建议值 */
  suggestedValue: number;
  /** 调整原因 */
  reason: string;
}

/**
 * 目标评估结果
 */
export interface ObjectiveEvaluation {
  /** 多目标指标 */
  metrics: MultiObjectiveMetrics;
  /** 约束是否满足 */
  constraintsSatisfied: boolean;
  /** 约束违规列表 */
  constraintViolations: ConstraintViolation[];
  /** 建议的策略调整 */
  suggestedAdjustments?: Partial<StrategyParams>;
}

// ==================== 冷启动状态扩展类型 ====================

/**
 * 冷启动状态数据（从 engine-types 复制以避免循环依赖）
 */
export interface ColdStartStateData {
  /** 当前阶段 */
  phase: ColdStartPhase;
  /** 用户类型分类 */
  userType: UserType | null;
  /** 当前探测索引 */
  probeIndex: number;
  /** 更新计数 */
  updateCount: number;
  /** 收敛后的策略 */
  settledStrategy: StrategyParams | null;
}

/**
 * 带有冷启动状态的用户状态扩展类型
 *
 * 用于数据库存储和加载时的类型安全，
 * 避免使用 (state as any).coldStartState
 */
export interface UserStateWithColdStart extends UserState {
  /** 冷启动状态数据（可选） */
  coldStartState?: ColdStartStateData;
}

// ==================== 处理选项类型 ====================

/**
 * 单词复习历史记录（用于 ACT-R 记忆模型）
 */
export interface WordReviewHistory {
  /** 距今时间（秒） */
  secondsAgo: number;
  /** 是否正确 */
  isCorrect?: boolean;
}

/**
 * 会话统计数据
 */
export interface SessionStats {
  /** 正确率 */
  accuracy: number;
  /** 平均响应时间 */
  avgResponseTime: number;
  /** 保持率 */
  retentionRate: number;
  /** 复习成功率 */
  reviewSuccessRate: number;
  /** 记忆稳定性 */
  memoryStability: number;
  /** 每分钟单词数 */
  wordsPerMinute: number;
  /** 时间利用率 */
  timeUtilization: number;
  /** 认知负荷 */
  cognitiveLoad: number;
  /** 会话时长 */
  sessionDuration: number;
}

/**
 * 处理选项 - AMAS 引擎处理学习事件时的可选参数
 *
 * 此类型定义了传递给 AMASEngine.processEvent 的所有可选参数，
 * 包括视觉疲劳数据和学习时长等用于融合疲劳计算的字段。
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
  learningObjectives?: LearningObjectives;
  /** 会话统计数据 */
  sessionStats?: SessionStats;
  /** 单词复习历史（用于 ACT-R 记忆模型） */
  wordReviewHistory?: WordReviewHistory[];
  /** 视觉疲劳数据（用于融合到 AMAS 状态） */
  visualFatigueData?: ProcessedVisualFatigueData;
  /** 学习时长（分钟，用于时间疲劳计算） */
  studyDurationMinutes?: number;
}
