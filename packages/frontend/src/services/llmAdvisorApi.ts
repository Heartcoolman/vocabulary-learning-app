/**
 * LLM Advisor API Service
 * LLM 顾问 API 服务
 */

import apiClient from './client';

// ==================== 类型定义 ====================

export interface SuggestionItem {
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

export interface LLMSuggestion {
  analysis: {
    summary: string;
    keyFindings: string[];
    concerns: string[];
  };
  suggestions: SuggestionItem[];
  confidence: number;
  dataQuality: 'sufficient' | 'limited' | 'insufficient';
  nextReviewFocus: string;
}

export interface WeeklyStats {
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

export interface SkippedItem {
  id: string;
  target: string;
  reason: string;
}

export interface StoredSuggestion {
  id: string;
  weekStart: string;
  weekEnd: string;
  statsSnapshot: WeeklyStats;
  rawResponse: string;
  parsedSuggestion: LLMSuggestion;
  status: 'pending' | 'approved' | 'rejected' | 'partial';
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  appliedItems: string[] | null;
  skippedItems: SkippedItem[] | null;
  createdAt: string;
}

export interface LLMConfig {
  enabled: boolean;
  provider: string;
  model: string;
  baseUrl?: string;
  apiKeySet: boolean;
}

export interface WorkerStatus {
  enabled: boolean;
  autoAnalysisEnabled: boolean;
  isRunning: boolean;
  schedule: string;
  pendingCount: number;
}

// ==================== API 函数 ====================

/**
 * 获取 LLM 配置状态
 */
export async function getLLMConfig(): Promise<{ config: LLMConfig; worker: WorkerStatus }> {
  return apiClient.getLLMAdvisorConfig();
}

/**
 * 检查 LLM 健康状态
 */
export async function checkLLMHealth(): Promise<{ status: string; message: string }> {
  return apiClient.checkLLMAdvisorHealth();
}

/**
 * 获取建议列表
 */
export async function getSuggestions(params?: {
  status?: 'pending' | 'approved' | 'rejected' | 'partial';
  limit?: number;
  offset?: number;
}): Promise<{ items: StoredSuggestion[]; total: number }> {
  return apiClient.getLLMAdvisorSuggestions(params);
}

/**
 * 获取单个建议详情
 */
export async function getSuggestion(id: string): Promise<StoredSuggestion> {
  return apiClient.getLLMAdvisorSuggestion(id);
}

/**
 * 审批通过建议
 */
export async function approveSuggestion(
  id: string,
  selectedItems: string[],
  notes?: string,
): Promise<StoredSuggestion> {
  return apiClient.approveLLMAdvisorSuggestion(id, selectedItems, notes);
}

/**
 * 拒绝建议
 */
export async function rejectSuggestion(id: string, notes?: string): Promise<StoredSuggestion> {
  return apiClient.rejectLLMAdvisorSuggestion(id, notes);
}

/**
 * 手动触发 LLM 分析
 */
export async function triggerAnalysis(): Promise<{ suggestionId: string; message: string }> {
  return apiClient.triggerLLMAdvisorAnalysis();
}

/**
 * 获取最新建议
 */
export async function getLatestSuggestion(): Promise<StoredSuggestion | null> {
  return apiClient.getLatestLLMAdvisorSuggestion();
}

/**
 * 获取待审核数量
 */
export async function getPendingCount(): Promise<number> {
  const data = await apiClient.getLLMAdvisorPendingCount();
  return data.count;
}
