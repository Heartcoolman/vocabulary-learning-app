/**
 * 单词精通度相关类型定义
 * 与后端 backend/src/amas/evaluation/word-mastery-evaluator.ts 保持一致
 */

/**
 * 掌握度评估结果
 */
export interface MasteryEvaluation {
  wordId: string;
  isLearned: boolean;
  score: number;
  confidence: number;
  factors: {
    srsLevel: number;
    actrRecall: number;
    recentAccuracy: number;
    userFatigue: number;
  };
  suggestion?: string;
  fatigueWarning?: string;
}

/**
 * 用户整体掌握度统计
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
 * 复习轨迹记录
 */
export interface ReviewTraceRecord {
  id: string;
  timestamp: string; // ISO date string
  isCorrect: boolean;
  responseTime: number;
  secondsAgo: number;
}

/**
 * 单词学习轨迹响应
 */
export interface WordMasteryTrace {
  wordId: string;
  trace: ReviewTraceRecord[];
  count: number;
}

/**
 * 复习间隔预测
 */
export interface IntervalPrediction {
  optimalSeconds: number;
  minSeconds: number;
  maxSeconds: number;
  targetRecall: number;
}

/**
 * 复习间隔响应（包含人类可读格式）
 */
export interface WordMasteryIntervalResponse {
  wordId: string;
  interval: IntervalPrediction;
  humanReadable: {
    optimal: string;
    min: string;
    max: string;
  };
}
