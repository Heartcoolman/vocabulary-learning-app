/**
 * LearningState API类型定义
 */

// 导入WordState枚举，避免重复定义
import { WordState } from '../../types/word';

// 重新导出以保持API兼容性
export { WordState };

/**
 * 单词学习状态记录
 */
export interface WordLearningState {
  userId: string;
  wordId: string;
  state: WordState;
  masteryLevel: number;
  easeFactor: number;
  reviewCount: number;
  lastReviewDate: string | null;
  nextReviewDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 单词得分
 */
export interface WordScore {
  id: string;
  userId: string;
  wordId: string;
  totalScore: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 掌握度评估
 */
export interface MasteryEvaluation {
  wordId: string;
  score: number;
  confidence: number;
  isLearned: boolean;
  factors: {
    reviewCount: number;
    correctRate: number;
    avgResponseTime: number;
    actrRecall: number;
    intervalStability: number;
    recentPerformance: number;
  };
  recommendation: string;
}

/**
 * 完整的单词状态
 */
export interface CompleteWordState {
  learningState: WordLearningState | null;
  score: WordScore | null;
  mastery: MasteryEvaluation | null;
}

/**
 * 用户学习统计
 */
export interface UserStats {
  totalWords: number;
  newWords: number;
  learningWords: number;
  reviewingWords: number;
  masteredWords: number;
}

/**
 * 用户得分统计
 */
export interface UserScoreStats {
  averageScore: number;
  highScoreCount: number;
  mediumScoreCount: number;
  lowScoreCount: number;
}

/**
 * 用户掌握度统计
 */
export interface UserMasteryStats {
  totalWords: number;
  masteredWords: number;
  learningWords: number;
  newWords: number;
  averageScore: number;
  averageRecall: number;
  needReviewCount: number;
}

/**
 * 用户综合学习统计
 */
export interface UserLearningStats {
  stateStats: UserStats;
  scoreStats: UserScoreStats;
  masteryStats: UserMasteryStats;
}

/**
 * 单词状态更新数据
 */
export interface WordStateUpdateData {
  state?: WordState;
  masteryLevel?: number;
  easeFactor?: number;
  reviewCount?: number;
  lastReviewDate?: string | null;
  nextReviewDate?: string | null;
}

/**
 * 复习事件输入
 */
export interface ReviewEventInput {
  timestamp: number;
  isCorrect: boolean;
  responseTime: number;
}

/**
 * 复习轨迹记录
 */
export interface ReviewTraceRecord {
  id: string;
  timestamp: string;
  isCorrect: boolean;
  responseTime: number;
  secondsAgo: number;
}

/**
 * 单词记忆状态
 */
export interface WordMemoryState {
  wordId: string;
  reviewCount: number;
  lastReviewTime: number;
  avgCorrectRate: number;
  avgResponseTime: number;
}

/**
 * 间隔预测
 */
export interface IntervalPrediction {
  optimalSeconds: number;
  predictedRecall: number;
  confidence: number;
}
