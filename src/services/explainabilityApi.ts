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
    const params = decisionId ? { decisionId } : {};
    const response = await apiClient.get<DecisionExplanation>('/amas/explain-decision', { params });
    return response;
  },

  runCounterfactual: async (input: CounterfactualInput): Promise<CounterfactualResult> => {
    const response = await apiClient.post<CounterfactualResult>('/amas/counterfactual', input);
    return response;
  },

  getLearningCurve: async (days: number = 30): Promise<LearningCurveData> => {
    const response = await apiClient.get<LearningCurveData>('/amas/learning-curve', { params: { days } });
    return response;
  },

  getDecisionTimeline: async (limit: number = 50, cursor?: string): Promise<DecisionTimelineResponse> => {
    const params = cursor ? { limit, cursor } : { limit };
    const response = await apiClient.get<DecisionTimelineResponse>('/amas/decision-timeline', { params });
    return response;
  }
};
