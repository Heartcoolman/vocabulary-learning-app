import apiClient from './ApiClient';
import type {
  DecisionExplanation,
  CounterfactualInput,
  CounterfactualResult,
  LearningCurveData,
  DecisionTimelineResponse
} from '../types/explainability';

export const explainabilityApi = {
  getDecisionExplanation: async (decisionId?: string): Promise<DecisionExplanation> => {
    return await apiClient.getAmasDecisionExplanation(decisionId);
  },

  runCounterfactual: async (input: CounterfactualInput): Promise<CounterfactualResult> => {
    return await apiClient.runCounterfactualAnalysis(input);
  },

  getLearningCurve: async (days: number = 30): Promise<LearningCurveData> => {
    return await apiClient.getAmasLearningCurve(days);
  },

  getDecisionTimeline: async (limit: number = 50, cursor?: string): Promise<DecisionTimelineResponse> => {
    return await apiClient.getDecisionTimeline(limit, cursor);
  }
};
