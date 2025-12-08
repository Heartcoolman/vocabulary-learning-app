/**
 * 认知画像相关类型定义
 */

/**
 * 作息类型
 */
export type ChronotypeCategory = 'morning' | 'evening' | 'intermediate';

/**
 * 学习时段历史记录
 */
export interface LearningTimeHistory {
  hour: number;
  performance: number;
  sampleCount: number;
}

/**
 * 作息类型画像
 */
export interface ChronotypeProfile {
  category: ChronotypeCategory;
  peakHours: number[];
  confidence: number;
  learningHistory: LearningTimeHistory[];
}

/**
 * 学习风格类型
 */
export type LearningStyleType = 'visual' | 'auditory' | 'kinesthetic' | 'mixed';

/**
 * 学习风格评分
 */
export interface LearningStyleScores {
  visual: number;
  auditory: number;
  kinesthetic: number;
}

/**
 * 学习风格画像
 */
export interface LearningStyleProfile {
  style: LearningStyleType;
  confidence: number;
  scores: LearningStyleScores;
}

/**
 * 完整认知画像
 */
export interface CognitiveProfile {
  chronotype: ChronotypeProfile;
  learningStyle: LearningStyleProfile;
}

/**
 * 学习模式
 */
export type LearningMode = 'exam' | 'daily' | 'travel' | 'custom';

/**
 * 学习模式配置
 */
export interface LearningModeConfig {
  dailyGoal?: number;
  sessionDuration?: number;
  difficultyPreference?: 'easy' | 'medium' | 'hard' | 'adaptive';
  focusAreas?: string[];
  [key: string]: unknown;
}
