export interface DifficultyFactors {
  length: number;
  accuracy: number;
  frequency: number;
  forgetting: number;
}

// New types for DecisionFactors UI
export interface DecisionFactor {
  name: string;
  score: number; // 0-1
  weight: number; // importance in final decision
  explanation: string;
  icon: string; // Icon name for mapping
}

export interface AlgorithmWeights {
  ige: number;
  swd: number;
  msmt: number;
  heuristic: number;
}

export interface DecisionExplanation {
  decisionId: string;
  timestamp: string;
  selectedWordId?: string; // Added for UI
  reasoning?: string; // Added for UI
  state: {
    attention?: number;
    fatigue?: number;
    motivation?: number;
  };
  difficultyFactors: DifficultyFactors;
  weights?: Record<string, number> | AlgorithmWeights; // Support both formats
  triggers?: string[];
  stages?: Array<{ stage: string; durationMs?: number }>;
  factors?: DecisionFactor[]; // Added for detailed UI display
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
  mastery?: number;
  masteredCount?: number; // Added for UI
  accuracy?: number; // Added for UI
  attention?: number;
  fatigue?: number;
  motivation?: number;
}

export interface LearningCurveData {
  points: LearningCurvePoint[];
  trend: 'up' | 'flat' | 'down';
  currentMastery: number;
  averageAttention: number;
}

/**
 * AMAS 选择的动作
 */
export interface AMASSelectedAction {
  difficulty?: 'easy' | 'mid' | 'hard';
  batch_size?: number;
  interval_scale?: number;
  new_ratio?: number;
  hint_level?: number;
  type?: string;
}

export interface DecisionTimelineItem {
  answerId: string;
  wordId: string;
  timestamp: string;
  decision: {
    decisionId: string;
    confidence: number;
    selectedAction: AMASSelectedAction;
  };
}

export interface DecisionTimelineResponse {
  items: DecisionTimelineItem[];
  nextCursor: string | null;
}

// Enhanced Explanation for DecisionTooltip
export interface FactorContribution {
  factor: string;
  percentage: number;
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
}

export interface AlgorithmInfo {
  algorithm: string;
  confidence: number;
  phase?: string;
}

export interface EnhancedExplanation {
  primaryReason: string;
  factorContributions: FactorContribution[];
  algorithmInfo: AlgorithmInfo;
}
