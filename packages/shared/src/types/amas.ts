/**
 * AMAS 共享类型定义
 * AMAS (Adaptive Multi-dimensional Aware System) - 自适应多维度感知系统
 *
 * 注意：UserState 前后端定义不同（有意设计）
 * - 前端使用全拼字段名: attention, fatigue, motivation, memory, speed, stability
 * - 后端使用简写字段名: A, F, M, C.mem, C.speed, C.stability
 * - 转换通过 utils/state-converter.ts 完成
 */

import { ID, Timestamp } from './common';

// ============================================
// 基础类型
// ============================================

/**
 * 冷启动阶段
 * - classify: 分类阶段，收集用户初始数据
 * - explore: 探索阶段，尝试不同策略
 * - normal: 正常阶段，稳定学习
 */
export type ColdStartPhase = 'classify' | 'explore' | 'normal';

/**
 * 趋势状态
 * - up: 上升趋势
 * - flat: 平稳
 * - stuck: 停滞
 * - down: 下降趋势
 */
export type TrendState = 'up' | 'flat' | 'stuck' | 'down';

/**
 * 学习目标模式
 * - exam: 备考模式（快速记忆）
 * - daily: 日常模式（平衡学习）
 * - travel: 旅行模式（轻松学习）
 * - custom: 自定义模式
 */
export type LearningObjectiveMode = 'exam' | 'daily' | 'travel' | 'custom';

/**
 * 主要学习目标类型
 */
export type PrimaryObjective = 'accuracy' | 'retention' | 'efficiency';

/**
 * 难度等级
 */
export type DifficultyLevel = 'easy' | 'mid' | 'hard';

/**
 * 调整原因类型
 */
export type AdjustReason = 'fatigue' | 'struggling' | 'excelling' | 'periodic';

// ============================================
// 用户认知状态
// ============================================

/**
 * 用户认知状态（前端格式）
 */
export interface UserCognitiveState {
  /** 记忆力 (0-1) */
  memory: number;
  /** 反应速度 (0-1) */
  speed: number;
  /** 稳定性 (0-1) */
  stability: number;
}

/**
 * 用户状态（前端展开格式）
 * 用于前端展示和处理
 */
export interface UserStateFrontend {
  /** 注意力 (0-1) */
  attention: number;
  /** 疲劳度 (0-1) */
  fatigue: number;
  /** 动机 (-1 到 1) */
  motivation: number;
  /** 记忆力 (0-1) */
  memory: number;
  /** 反应速度 (0-1) */
  speed: number;
  /** 稳定性 (0-1) */
  stability: number;
  /** 认知状态（可选，完整对象） */
  cognitive?: UserCognitiveState;
  /** 信心 (0-1) */
  confidence?: number;
  /** 时间戳（毫秒） */
  timestamp?: Timestamp;
}

/**
 * 用户状态（后端紧凑格式）
 * 用于数据库存储，减少存储空间
 */
export interface UserStateBackend {
  /** Attention - 注意力 */
  A: number;
  /** Fatigue - 疲劳度 */
  F: number;
  /** Motivation - 动机 */
  M: number;
  /** Cognitive - 认知能力 */
  C: {
    mem: number;
    speed: number;
    stability: number;
  };
  /** confidence - 信心 */
  conf?: number;
  /** timestamp - 时间戳 */
  ts?: Timestamp;
}

// ============================================
// 学习目标
// ============================================

/**
 * 学习目标配置
 */
export interface LearningObjectives {
  userId: ID;
  mode: LearningObjectiveMode;
  primaryObjective: PrimaryObjective;
  /** 最低正确率要求 (0-1) */
  minAccuracy?: number;
  /** 每日最大学习时间（分钟） */
  maxDailyTime?: number;
  /** 目标记忆保持率 (0-1) */
  targetRetention?: number;
  /** 短期记忆权重 */
  weightShortTerm: number;
  /** 长期记忆权重 */
  weightLongTerm: number;
  /** 效率权重 */
  weightEfficiency: number;
}

// ============================================
// 多目标优化
// ============================================

/**
 * 多目标评估指标
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
  /** 时间戳（毫秒） */
  ts: Timestamp;
}

// ============================================
// 习惯画像
// ============================================

/**
 * 习惯画像（实时计算）
 */
export interface HabitProfile {
  /** 24小时偏好分布（归一化直方图） */
  timePref: number[];
  /** 学习节奏偏好 */
  rhythmPref: {
    /** 会话中位时长（分钟） */
    sessionMedianMinutes: number;
    /** 批次中位数量 */
    batchMedian: number;
  };
  /** 偏好时间段（小时数组，如 [9, 14, 20]） */
  preferredTimeSlots: number[];
  /** 样本数量 */
  samples: {
    timeEvents: number;
    sessions: number;
    batches: number;
  };
}

/**
 * 存储的习惯画像（数据库格式）
 */
export interface StoredHabitProfile {
  timePref: number[];
  rhythmPref: {
    sessionMedianMinutes: number;
    batchMedian: number;
  };
  /** 更新时间（ISO字符串） */
  updatedAt: string;
}

// ============================================
// 学习策略
// ============================================

/**
 * 学习策略
 */
export interface LearningStrategy {
  /** 复习间隔缩放系数 (0.5-2.0) */
  interval_scale: number;
  /** 新词比例 (0-1) */
  new_ratio: number;
  /** 难度等级 */
  difficulty: DifficultyLevel;
  /** 批量大小 (5-25) */
  batch_size: number;
  /** 提示级别 (0-2) */
  hint_level: number;
}

// ============================================
// 学习事件
// ============================================

/**
 * 学习事件输入
 */
export interface LearningEventInput {
  /** 单词ID */
  wordId: ID;
  /** 是否答对 */
  isCorrect: boolean;
  /** 响应时间（毫秒） */
  responseTime: number;
  /** 学习会话ID */
  sessionId?: ID;
  /** 停留时长（毫秒） */
  dwellTime?: number;
  /** 暂停次数 */
  pauseCount?: number;
  /** 切屏次数 */
  switchCount?: number;
  /** 重试次数 */
  retryCount?: number;
  /** 失焦时长（毫秒） */
  focusLossDuration?: number;
  /** 交互密度（events/s） */
  interactionDensity?: number;
  /** 时间戳（毫秒） */
  timestamp?: Timestamp;
  /** 对话框暂停时间（毫秒） */
  pausedTimeMs?: number;
  /** 是否使用了提示 */
  hintUsed?: boolean;
  /** 设备类型（用于 EVM 情境编码） */
  deviceType?: 'mobile' | 'tablet' | 'desktop';
  /** 题目类型 */
  questionType?: string;
  // UMM 词汇特化层输入
  /** 词素掌握度状态（用于 MTP 形态迁移） */
  morphemeStates?: Array<{ morphemeId: string; masteryLevel: number }>;
  /** 易混淆词对（用于 IAD 干扰惩罚） */
  confusionPairs?: Array<{ confusingWordId: string; distance: number }>;
  /** 最近学习的单词ID列表（用于 IAD） */
  recentWordIds?: string[];
  /** 学习情境历史（用于 EVM 编码变异） */
  contextHistory?: Array<{
    hourOfDay: number;
    dayOfWeek: number;
    questionType: string;
    deviceType: string;
  }>;
  // VARK 学习风格交互数据
  /** 图片查看次数 */
  imageViewCount?: number;
  /** 图片缩放次数 */
  imageZoomCount?: number;
  /** 图片长按时长（毫秒） */
  imageLongPressMs?: number;
  /** 音频播放次数 */
  audioPlayCount?: number;
  /** 音频重播次数 */
  audioReplayCount?: number;
  /** 是否调整过音频速度 */
  audioSpeedAdjust?: boolean;
  /** 定义阅读时长（毫秒） */
  definitionReadMs?: number;
  /** 例句阅读时长（毫秒） */
  exampleReadMs?: number;
  /** 笔记编写次数 */
  noteWriteCount?: number;
}

// ============================================
// 单词掌握评估
// ============================================

/**
 * 单词掌握判定结果
 */
export interface WordMasteryDecision {
  /** 单词ID */
  wordId?: ID;
  /** 之前的掌握度 (0-1) */
  prevMastery?: number;
  /** 新的掌握度 (0-1) */
  newMastery?: number;
  /** 之前的复习间隔 (天) */
  prevInterval?: number;
  /** 新的复习间隔 (天) */
  newInterval?: number;
  /** 答题质量 (0-5) */
  quality?: number;
  /** 是否已掌握 */
  isMastered: boolean;
  /** 判定置信度 (0-1) */
  confidence: number;
  /** 建议重复次数 */
  suggestedRepeats: number;
  /** FSRS 稳定性 (天数) */
  stability?: number;
  /** FSRS 难度 (0-1) */
  difficulty?: number;
  /** FSRS 可提取性 (0-1) */
  retrievability?: number;
  /** FSRS 遗忘次数 */
  lapses?: number;
  /** FSRS 复习次数 */
  reps?: number;
}

/**
 * 掌握度评估结果
 */
export interface MasteryEvaluation {
  wordId: ID;
  /** 是否已学会 */
  isLearned: boolean;
  /** 综合得分 */
  score: number;
  /** 置信度 */
  confidence: number;
  /** 影响因素 */
  factors: {
    srsLevel: number;
    actrRecall: number;
    recentAccuracy: number;
    userFatigue: number;
  };
  /** 建议 */
  suggestion?: string;
}

// ============================================
// AMAS 处理结果
// ============================================

/**
 * 决策影响因素
 */
export interface DecisionFactor {
  name: string;
  value: number;
  impact: string;
  percentage: number;
}

/**
 * 决策解释
 */
export interface DecisionExplanation {
  factors: DecisionFactor[];
  changes: string[];
  text: string;
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
  constraintViolations: Array<{
    constraint: string;
    expected: number;
    actual: number;
  }>;
  /** 建议的策略调整 */
  suggestedAdjustments?: Partial<LearningStrategy>;
}

/**
 * AMAS 处理结果
 */
export interface AmasProcessResult {
  /** 学习会话ID */
  sessionId: ID;
  /** 推荐策略 */
  strategy: LearningStrategy;
  /** 当前用户状态 */
  state: UserStateFrontend;
  /** 解释说明 */
  explanation: DecisionExplanation;
  /** 建议 */
  suggestion?: string;
  /** 是否建议休息 */
  shouldBreak?: boolean;
  /** 单词掌握判定 */
  wordMasteryDecision?: WordMasteryDecision;
  /** 多目标评估结果 */
  objectiveEvaluation?: ObjectiveEvaluation;
  /** 多目标优化是否触发了策略调整 */
  multiObjectiveAdjusted?: boolean;
}
