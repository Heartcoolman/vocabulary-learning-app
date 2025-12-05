/**
 * AMAS (Adaptive Multi-dimensional Aware System) 类型定义
 * 自适应多维度用户感知智能学习算法相关类型
 *
 * 前后端字段映射说明：
 * 后端 (backend/src/amas/types.ts) 使用简写字段名，前端使用全拼。
 * 后端通过 backend/src/amas/utils/state-converter.ts 进行转换。
 *
 * 字段映射关系：
 * - 后端 A (Attention) -> 前端 attention
 * - 后端 F (Fatigue)   -> 前端 fatigue
 * - 后端 M (Motivation)-> 前端 motivation
 * - 后端 C.mem         -> 前端 memory
 * - 后端 C.speed       -> 前端 speed
 * - 后端 C.stability   -> 前端 stability
 * - 后端 conf          -> 前端 confidence
 * - 后端 ts            -> 前端 timestamp
 */

/**
 * 用户认知状态
 * 对应后端 CognitiveProfile (C) 字段
 */
export interface UserCognitiveState {
  /** 记忆力 (0-1) - 后端字段: C.mem */
  memory: number;
  /** 反应速度 (0-1) - 后端字段: C.speed */
  speed: number;
  /** 稳定性 (0-1) - 后端字段: C.stability */
  stability: number;
}

/**
 * 用户状态（前端格式）
 *
 * 此类型用于前端展示和处理，使用可读的全拼字段名。
 * API 响应已由后端 state-converter.ts 转换为此格式。
 *
 * @see backend/src/amas/utils/state-converter.ts - toFrontendState()
 * @see backend/src/amas/types.ts - UserState (后端格式，使用 A/F/M/C 简写)
 */
export interface UserState {
  /** 注意力 (0-1) - 后端字段: A */
  attention: number;
  /** 疲劳度 (0-1) - 后端字段: F */
  fatigue: number;
  /** 动机 (-1-1) - 后端字段: M */
  motivation: number;
  /** 记忆力 (0-1) - 后端字段: C.mem */
  memory: number;
  /** 反应速度 (0-1) - 后端字段: C.speed */
  speed: number;
  /** 稳定性 (0-1) - 后端字段: C.stability */
  stability: number;
  /** 认知状态（完整对象）- 后端字段: C */
  cognitive?: UserCognitiveState;
  /** 信心 (0-1) - 后端字段: conf */
  confidence?: number;
  /** 时间戳 - 后端字段: ts */
  timestamp?: number;
}

/**
 * 学习策略
 */
export interface LearningStrategy {
  /** 复习间隔缩放系数 (0.5-2.0) */
  interval_scale: number;
  /** 新词比例 (0-1) */
  new_ratio: number;
  /** 难度等级 */
  difficulty: 'easy' | 'mid' | 'hard';
  /** 批量大小 (5-25) */
  batch_size: number;
  /** 提示级别 (0-2) */
  hint_level: number;
}

/**
 * 学习事件输入
 *
 * 注意：后端 RawEvent (backend/src/amas/types.ts) 要求以下字段必填：
 * - wordId, isCorrect, responseTime, dwellTime, timestamp
 * - pauseCount, switchCount, retryCount, focusLossDuration, interactionDensity
 *
 * 前端将可选字段标记为可选是为了向后兼容，但建议尽可能提供所有字段以获得最佳的AMAS算法效果。
 * 缺失的字段会在后端使用默认值填充。
 */
export interface LearningEventInput {
  /** 单词ID - 必填 */
  wordId: string;
  /** 是否答对 - 必填 */
  isCorrect: boolean;
  /** 响应时间（毫秒） - 必填 */
  responseTime: number;
  /** 学习会话ID（可选，前端应在同一学习流程内复用） */
  sessionId?: string;
  /** 停留时长（毫秒） - 后端必填，建议提供，缺失时后端使用 responseTime 作为默认值 */
  dwellTime?: number;
  /** 暂停次数 - 后端必填，建议提供，缺失时后端默认为 0 */
  pauseCount?: number;
  /** 切屏次数 - 后端必填，建议提供，缺失时后端默认为 0 */
  switchCount?: number;
  /** 重试次数 - 后端必填，建议提供，缺失时后端默认为 0 */
  retryCount?: number;
  /** 失焦时长（毫秒） - 后端必填，建议提供，缺失时后端默认为 0 */
  focusLossDuration?: number;
  /** 交互密度（events/s） - 后端必填，建议提供，缺失时后端默认为 1 */
  interactionDensity?: number;
  /** 时间戳（毫秒） - 后端必填，缺失时后端使用 Date.now() */
  timestamp?: number;
  /** 对话框暂停时间（毫秒，用于疲劳度计算时排除非学习时间） - 可选 */
  pausedTimeMs?: number;
}

/**
 * 单词掌握判定结果（从后端返回）
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
 * 多目标指标
 * 与后端 backend/src/amas/types.ts MultiObjectiveMetrics 保持一致
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
  /** 时间戳 - 与后端保持一致 */
  ts: number;
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
 * 半衰期更新结果
 */
export interface HalfLifeUpdate {
  /** 新半衰期（天） */
  newHalfLife: number;
  /** 变化值 */
  change: number;
  /** 是否显著变化 */
  isSignificant: boolean;
}

/**
 * 单词复习历史条目
 */
export interface WordReviewHistory {
  /** 距今时间（秒） */
  secondsAgo: number;
  /** 是否正确 */
  isCorrect?: boolean;
}

/**
 * AMAS处理结果
 */
export interface AmasProcessResult {
  /** 学习会话ID（后端生成或复用，前端应保存并在同一会话内复用） */
  sessionId: string;
  /** 推荐策略 */
  strategy: LearningStrategy;
  /** 当前状态 */
  state: UserState;
  /** 解释说明 */
  explanation: string;
  /** 建议 */
  suggestion?: string;
  /** 是否建议休息 */
  shouldBreak?: boolean;
  /** 单词掌握判定（后端计算，用于掌握度学习模式） */
  wordMasteryDecision?: WordMasteryDecision;
  /** 多目标评估结果 */
  objectiveEvaluation?: ObjectiveEvaluation;
  /** 多目标优化是否触发了策略调整 */
  multiObjectiveAdjusted?: boolean;
}

/**
 * 冷启动阶段
 */
export type ColdStartPhase = 'classify' | 'explore' | 'normal';

/**
 * 冷启动阶段信息
 */
export interface ColdStartPhaseInfo {
  /** 当前阶段 */
  phase: ColdStartPhase;
  /** 阶段描述 */
  description: string;
}

/**
 * 批量处理结果
 */
export interface BatchProcessResult {
  /** 处理的事件数量 */
  processed: number;
  /** 最终策略 */
  finalStrategy: LearningStrategy;
  /** 最终状态 */
  finalState?: UserState;
}

// ========== 队列动态调整相关类型 ==========

export type AdjustReason = 'fatigue' | 'struggling' | 'excelling' | 'periodic';

/**
 * 学习单词调整参数
 */
export interface AdjustWordsParams {
  sessionId: string;
  currentWordIds: string[];
  masteredWordIds: string[];
  userState?: {
    fatigue: number;
    attention: number;
    motivation: number;
  };
  recentPerformance: {
    accuracy: number;
    avgResponseTime: number;
    consecutiveWrong: number;
  };
  adjustReason: AdjustReason;
}

/**
 * 学习单词调整响应
 */
export interface AdjustWordsResponse {
  adjustments: {
    remove: string[];
    add: Array<{
      id: string;
      spelling: string;
      phonetic: string;
      meanings: string[];
      examples: string[];
      audioUrl?: string;
      isNew: boolean;
      difficulty: number;
    }>;
  };
  targetDifficulty: {
    min: number;
    max: number;
  };
  reason: string;
}
