/**
 * AMAS (Adaptive Multi-dimensional Aware System) 类型定义
 * 自适应多维度用户感知智能学习算法相关类型
 */

/**
 * 用户认知状态
 */
export interface UserCognitiveState {
  /** 记忆力 (0-1) */
  mem: number;
  /** 反应速度 (0-1) */
  speed: number;
  /** 稳定性 (0-1) */
  stability: number;
}

/**
 * 用户状态
 */
export interface UserState {
  /** 注意力 (0-1) */
  attention: number;
  /** 疲劳度 (0-1) */
  fatigue: number;
  /** 动机 (-1-1) */
  motivation: number;
  /** 记忆力 (0-1) */
  memory: number;
  /** 反应速度 (0-1) */
  speed: number;
  /** 稳定性 (0-1) */
  stability: number;
  /** 认知状态（完整对象） */
  cognitive?: UserCognitiveState;
  /** 信心 (0-1) */
  confidence?: number;
  /** 时间戳 */
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
 */
export interface LearningEventInput {
  /** 单词ID */
  wordId: string;
  /** 是否答对 */
  isCorrect: boolean;
  /** 响应时间（毫秒） */
  responseTime: number;
  /** 学习会话ID（可选，前端应在同一学习流程内复用） */
  sessionId?: string;
  /** 停留时长（毫秒，可选） */
  dwellTime?: number;
  /** 暂停次数（可选） */
  pauseCount?: number;
  /** 切屏次数（可选） */
  switchCount?: number;
  /** 重试次数（可选） */
  retryCount?: number;
  /** 失焦时长比例（0-1，可选） */
  focusLossDuration?: number;
  /** 交互密度（可选） */
  interactionDensity?: number;
  /** 时间戳（可选，用于批量处理） */
  timestamp?: number;
  /** 对话框暂停时间（毫秒，用于疲劳度计算时排除非学习时间） */
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
