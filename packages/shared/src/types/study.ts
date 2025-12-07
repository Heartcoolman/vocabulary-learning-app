/**
 * 学习相关类型定义
 */

import { BaseEntity, ID, Timestamp } from './common';

/**
 * 学习配置
 */
export interface StudyConfig extends BaseEntity {
  userId: ID;
  selectedWordBookIds: ID[];
  dailyWordCount: number;
  studyMode: string;
}

/**
 * 学习配置DTO
 */
export interface StudyConfigDto {
  selectedWordBookIds: ID[];
  dailyWordCount: number;
  studyMode?: string;
}

/**
 * 学习会话
 */
export interface LearningSession extends BaseEntity {
  userId: ID;
  wordIds: ID[];
  currentIndex: number;
  startTime: Timestamp;
  endTime?: Timestamp | null;
  wordsStudied: number;
  correctCount: number;
  totalTime: number;
}

/**
 * 答题记录
 */
export interface AnswerRecord extends BaseEntity {
  userId: ID;
  wordId: ID;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  timestamp: Timestamp;
  responseTime?: number;
  dwellTime?: number;
  sessionId?: ID;
  masteryLevelBefore?: number;
  masteryLevelAfter?: number;
}

/**
 * 创建答题记录DTO
 */
export interface CreateRecordDto {
  wordId: ID;
  selectedAnswer: string | null;
  correctAnswer: string | null;
  isCorrect: boolean;
  timestamp?: Timestamp;
  responseTime?: number;
  dwellTime?: number;
  sessionId?: ID;
  masteryLevelBefore?: number;
  masteryLevelAfter?: number;
}

/**
 * 学习统计
 */
export interface StudyStatistics {
  totalWords: number;
  studiedWords: number;
  correctRate: number;
  wordStats: Map<ID, import('./word').WordStatistics>;
}

/**
 * 算法配置
 */
export interface AlgorithmConfig extends BaseEntity {
  name: string;
  description?: string;
  reviewIntervals: number[];
  consecutiveCorrectThreshold: number;
  consecutiveWrongThreshold: number;
  difficultyAdjustmentInterval: number;
  priorityWeights: {
    newWord: number;
    errorRate: number;
    overdueTime: number;
    wordScore: number;
  };
  masteryThresholds: Array<{
    level: number;
    requiredCorrectStreak: number;
    minAccuracy: number;
    minScore: number;
  }>;
  scoreWeights: {
    accuracy: number;
    speed: number;
    stability: number;
    proficiency: number;
  };
  speedThresholds: {
    excellent: number;
    good: number;
    average: number;
    slow: number;
  };
  newWordRatio: {
    default: number;
    highAccuracy: number;
    lowAccuracy: number;
    highAccuracyThreshold: number;
    lowAccuracyThreshold: number;
  };
  isDefault: boolean;
  createdBy?: ID;
}

/**
 * 配置历史记录
 */
export interface ConfigHistory extends BaseEntity {
  configId: ID;
  changedBy: ID;
  changeReason?: string;
  previousValue: Partial<AlgorithmConfig>;
  newValue: Partial<AlgorithmConfig>;
  timestamp: Timestamp;
}
