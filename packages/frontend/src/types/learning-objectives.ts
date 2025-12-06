/**
 * Learning Objectives Types
 * 学习目标相关类型定义
 */

export type LearningObjectiveMode = 'exam' | 'daily' | 'travel' | 'custom';

export type PrimaryObjective = 'accuracy' | 'retention' | 'efficiency';

export interface LearningObjectives {
  userId: string;
  mode: LearningObjectiveMode;
  primaryObjective: PrimaryObjective;
  minAccuracy?: number;
  maxDailyTime?: number;
  targetRetention?: number;
  weightShortTerm: number;
  weightLongTerm: number;
  weightEfficiency: number;
}

export interface ModeSuggestion {
  mode: LearningObjectiveMode;
  reason: string;
  config: Partial<LearningObjectives>;
}

export interface ObjectiveSuggestions {
  currentMode: LearningObjectiveMode;
  suggestedModes: ModeSuggestion[];
}

export interface ObjectiveHistoryEntry {
  timestamp: Date;
  reason: string;
  beforeMode: string;
  afterMode: string;
}
