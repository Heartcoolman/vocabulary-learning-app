/**
 * AMAS 共享类型定义
 * 注意：UserState 前后端定义不同（有意设计），不在此处定义
 */

export type ColdStartPhase = 'classify' | 'explore' | 'normal';
export type TrendState = 'up' | 'flat' | 'stuck' | 'down';
export type LearningObjectiveMode = 'exam' | 'daily' | 'travel' | 'custom';

export interface LearningObjectives {
  userId: string;
  mode: LearningObjectiveMode;
  primaryObjective: 'accuracy' | 'retention' | 'efficiency';
  minAccuracy?: number;
  maxDailyTime?: number;
  targetRetention?: number;
  weightShortTerm: number;
  weightLongTerm: number;
  weightEfficiency: number;
}

export interface MultiObjectiveMetrics {
  shortTermScore: number;
  longTermScore: number;
  efficiencyScore: number;
  aggregatedScore: number;
  ts: number;
}

export interface HabitProfile {
  timePref: number[];
  rhythmPref: {
    sessionMedianMinutes: number;
    batchMedian: number;
  };
  preferredTimeSlots: number[];
  samples: {
    timeEvents: number;
    sessions: number;
    batches: number;
  };
}
