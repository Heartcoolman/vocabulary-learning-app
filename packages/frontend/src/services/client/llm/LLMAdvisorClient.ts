import { BaseClient } from '../base/BaseClient';

// ==================== LLM Advisor 类型定义 ====================

export interface LLMSuggestionItem {
  id: string;
  type: 'param_bound' | 'threshold' | 'reward_weight' | 'safety_threshold';
  target: string;
  currentValue: number;
  suggestedValue: number;
  reason: string;
  expectedImpact: string;
  risk: 'low' | 'medium' | 'high';
  priority: number;
}

export interface LLMSuggestionAnalysis {
  summary: string;
  keyFindings: string[];
  concerns: string[];
}

export interface LLMParsedSuggestion {
  analysis: LLMSuggestionAnalysis;
  suggestions: LLMSuggestionItem[];
  confidence: number;
  dataQuality: 'sufficient' | 'limited' | 'insufficient';
  nextReviewFocus: string;
}

export interface LLMWeeklyStats {
  period: { start: string; end: string };
  users: {
    total: number;
    activeThisWeek: number;
    newThisWeek: number;
    churned: number;
  };
  learning: {
    avgAccuracy: number;
    avgSessionDuration: number;
    totalWordsLearned: number;
    totalAnswers: number;
    avgResponseTime: number;
  };
  stateDistribution: {
    fatigue: { low: number; mid: number; high: number };
    motivation: { low: number; mid: number; high: number };
  };
  alerts: {
    lowAccuracyUserRatio: number;
    highFatigueUserRatio: number;
    lowMotivationUserRatio: number;
    churnRate: number;
  };
}

export interface LLMSkippedItem {
  id: string;
  target: string;
  reason: string;
}

export interface LLMStoredSuggestion {
  id: string;
  weekStart: string;
  weekEnd: string;
  statsSnapshot: LLMWeeklyStats;
  rawResponse: string;
  parsedSuggestion: LLMParsedSuggestion;
  status: 'pending' | 'approved' | 'rejected' | 'partial';
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  appliedItems: string[] | null;
  skippedItems: LLMSkippedItem[] | null;
  createdAt: string;
}

export interface LLMConfig {
  enabled: boolean;
  provider: string;
  model: string;
  baseUrl?: string;
  apiKeySet: boolean;
}

export interface LLMWorkerStatus {
  enabled: boolean;
  autoAnalysisEnabled: boolean;
  isRunning: boolean;
  schedule: string;
  pendingCount: number;
}

export interface LLMAdvisorConfigResponse {
  config: LLMConfig;
  worker: LLMWorkerStatus;
}

export interface LLMAdvisorHealthResponse {
  status: string;
  message: string;
}

export interface LLMAdvisorSuggestionsResponse {
  items: LLMStoredSuggestion[];
  total: number;
}

export interface LLMAdvisorTriggerResponse {
  suggestionId: string;
  message: string;
}

export interface LLMAdvisorPendingCountResponse {
  count: number;
}

/**
 * LLMAdvisorClient - LLM智能顾问系统相关API
 *
 * 职责：
 * - LLM配置管理
 * - LLM健康检查
 * - 建议列表查询
 * - 建议审批和拒绝
 * - 手动触发LLM分析
 * - 待审核数量查询
 */
export class LLMAdvisorClient extends BaseClient {
  /**
   * 获取 LLM 配置状态
   */
  async getConfig(): Promise<LLMAdvisorConfigResponse> {
    return this.request<LLMAdvisorConfigResponse>('/api/llm-advisor/config');
  }

  /**
   * 检查 LLM 健康状态
   */
  async checkHealth(): Promise<LLMAdvisorHealthResponse> {
    return this.request<LLMAdvisorHealthResponse>('/api/llm-advisor/health');
  }

  /**
   * 获取建议列表
   */
  async getSuggestions(params?: {
    status?: 'pending' | 'approved' | 'rejected' | 'partial';
    limit?: number;
    offset?: number;
  }): Promise<LLMAdvisorSuggestionsResponse> {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.limit !== undefined) query.append('limit', params.limit.toString());
    if (params?.offset !== undefined) query.append('offset', params.offset.toString());
    const queryStr = query.toString();
    return this.request<LLMAdvisorSuggestionsResponse>(
      `/api/llm-advisor/suggestions${queryStr ? `?${queryStr}` : ''}`,
    );
  }

  /**
   * 获取单个建议详情
   */
  async getSuggestion(id: string): Promise<LLMStoredSuggestion> {
    return this.request<LLMStoredSuggestion>(`/api/llm-advisor/suggestions/${id}`);
  }

  /**
   * 审批通过建议
   */
  async approveSuggestion(
    id: string,
    selectedItems: string[],
    notes?: string,
  ): Promise<LLMStoredSuggestion> {
    return this.request<LLMStoredSuggestion>(`/api/llm-advisor/suggestions/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ selectedItems, notes }),
    });
  }

  /**
   * 拒绝建议
   */
  async rejectSuggestion(id: string, notes?: string): Promise<LLMStoredSuggestion> {
    return this.request<LLMStoredSuggestion>(`/api/llm-advisor/suggestions/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  }

  /**
   * 手动触发 LLM 分析
   */
  async triggerAnalysis(): Promise<LLMAdvisorTriggerResponse> {
    return this.request<LLMAdvisorTriggerResponse>('/api/llm-advisor/trigger', { method: 'POST' });
  }

  /**
   * 获取最新建议
   */
  async getLatestSuggestion(): Promise<LLMStoredSuggestion | null> {
    return this.request<LLMStoredSuggestion | null>('/api/llm-advisor/latest');
  }

  /**
   * 获取待审核数量
   */
  async getPendingCount(): Promise<LLMAdvisorPendingCountResponse> {
    return this.request<LLMAdvisorPendingCountResponse>('/api/llm-advisor/pending-count');
  }
}
