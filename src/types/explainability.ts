export interface DifficultyFactors {
  length: number;
  accuracy: number;
  frequency: number;
  forgetting: number;
}

export interface DecisionExplanation {
  decisionId: string;
  timestamp: string;
  state: {
    attention?: number;
    fatigue?: number;
    motivation?: number;
  };
  difficultyFactors: DifficultyFactors;
  weights?: Record<string, number>;
  triggers?: string[];
  stages?: Array<{ stage: string; durationMs?: number }>;
}

export interface CounterfactualInput {
  decisionId?: string;
  overrides?: {
    attention?: number;
    fatigue?: number;
    motivation?: number;
    recentAccuracy?: number;
  };
}

export interface CounterfactualResult {
  baseDecisionId: string;
  baseState: {
    attention?: number;
    fatigue?: number;
    motivation?: number;
  };
  counterfactualState: {
    attention?: number;
    fatigue?: number;
    motivation?: number;
  };
  prediction: {
    wouldTriggerAdjustment: boolean;
    suggestedDifficulty?: 'easier' | 'harder';
    estimatedAccuracyChange: number;
  };
  explanation: string;
}

export interface LearningCurvePoint {
  date: string;
  mastery: number;
  attention: number;
  fatigue: number;
  motivation: number;
}

export interface LearningCurveData {
  points: LearningCurvePoint[];
  trend: 'up' | 'flat' | 'down';
  currentMastery: number;
  averageAttention: number;
}

export interface DecisionTimelineItem {
  answerId: string;
  wordId: string;
  timestamp: string;
  decision: {
    decisionId: string;
    confidence: number;
    selectedAction: any;
  };
}

export interface DecisionTimelineResponse {
  items: DecisionTimelineItem[];
  nextCursor: string | null;
}
