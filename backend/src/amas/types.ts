/**
 * AMAS (Adaptive Multi-dimensional Aware System) Core Types
 * 自适应多维度用户感知智能学习算法 - 核心类型定义
 */

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
 * 用户状态向量 - AMAS核心状态
 */
export interface UserState {
  /** 注意力 [0,1] - 0=完全分心, 1=高度专注 */
  A: number;
  /** 疲劳度 [0,1] - 0=精力充沛, 1=极度疲劳 */
  F: number;
  /** 认知能力画像 */
  C: CognitiveProfile;
  /** 动机 [-1,1] - -1=极度受挫, 1=高度积极 */
  M: number;
  /** 学习习惯画像 (扩展版) */
  H?: HabitProfile;
  /** 长期趋势 (扩展版) */
  T?: TrendState;
  /** 状态置信度 [0,1] */
  conf: number;
  /** 时间戳 */
  ts: number;
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
