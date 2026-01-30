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
 * 学习风格类型（VARK 四维 + multimodal）
 * 注意：'mixed' 保留用于向后兼容旧版 API 返回
 */
export type LearningStyleType =
  | 'visual'
  | 'auditory'
  | 'reading'
  | 'kinesthetic'
  | 'multimodal'
  | 'mixed';

/**
 * 学习风格类型（旧版兼容）
 */
export type LearningStyleTypeLegacy = 'visual' | 'auditory' | 'kinesthetic' | 'mixed';

/**
 * 学习风格评分（VARK 四维）
 * 注意：reading 字段可选以兼容旧版 API
 */
export interface LearningStyleScores {
  visual: number;
  auditory: number;
  reading?: number;
  kinesthetic: number;
}

/**
 * 学习风格交互模式
 */
export interface LearningStyleInteractionPatterns {
  avgDwellTime: number;
  avgResponseTime: number;
  pauseFrequency: number;
  switchFrequency: number;
}

/**
 * 学习风格画像
 */
export interface LearningStyleProfile {
  style: LearningStyleType;
  styleLegacy?: LearningStyleTypeLegacy;
  confidence: number;
  sampleCount?: number;
  scores: LearningStyleScores;
  interactionPatterns?: LearningStyleInteractionPatterns;
  modelType?: 'rule_engine' | 'ml_sgd';
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
