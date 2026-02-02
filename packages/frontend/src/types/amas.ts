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
 *
 * 注意: 大部分核心类型已迁移到 @danci/shared
 */

// 从 @danci/shared 导入共享类型
import type {
  ColdStartPhase,
  MultiObjectiveMetrics,
  UserCognitiveState,
  UserStateFrontend,
  LearningStrategy,
  LearningEventInput,
  WordMasteryDecision,
  ObjectiveEvaluation,
  AmasProcessResult,
  AdjustReason,
  DifficultyLevel,
  MicroInteractionData,
  TrajectoryPoint,
  HoverEvent,
  KeystrokeEvent,
  EnergyLevel,
} from '@danci/shared';

// 重新导出以保持向后兼容
export type {
  ColdStartPhase,
  MultiObjectiveMetrics,
  UserCognitiveState,
  LearningStrategy,
  LearningEventInput,
  WordMasteryDecision,
  ObjectiveEvaluation,
  AmasProcessResult,
  AdjustReason,
  DifficultyLevel,
  MicroInteractionData,
  TrajectoryPoint,
  HoverEvent,
  KeystrokeEvent,
  EnergyLevel,
};

/**
 * 用户状态（前端格式）
 * 重新导出 UserStateFrontend 作为 UserState 别名，保持向后兼容
 */
export type UserState = UserStateFrontend;
export type { UserStateFrontend };

// ============================================
// 前端专用类型（未迁移到 shared）
// ============================================

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
