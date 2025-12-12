/**
 * Ops Enhance Client
 * 运维增强 API 客户端
 */

import { BaseClient } from '../base/BaseClient';

// ==================== 类型定义 ====================

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'open' | 'investigating' | 'resolved' | 'ignored';
export type UserSegment =
  | 'new_users'
  | 'active_learners'
  | 'at_risk'
  | 'high_performers'
  | 'struggling'
  | 'casual'
  | 'all';

export interface AlertInput {
  alertRuleId: string;
  alertName: string;
  severity: AlertSeverity;
  description: string;
  metrics?: Record<string, number>;
  context?: Record<string, unknown>;
}

export interface AlertAnalysisResult {
  id: string;
  alertRuleId: string;
  severity: AlertSeverity;
  rootCause: string;
  suggestedFixes: Array<{
    action: string;
    priority: 'high' | 'medium' | 'low';
    estimatedImpact: string;
  }>;
  relatedMetrics: Record<string, unknown>;
  confidence: number;
  status: AlertStatus;
  createdAt: string;
  resolution?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface AlertStats {
  totalAnalyses: number;
  openCount: number;
  investigatingCount: number;
  resolvedCount: number;
  avgConfidence: number;
  bySeverity: Record<AlertSeverity, number>;
}

export interface WeeklyReportSummary {
  id: string;
  weekStart: string;
  weekEnd: string;
  summary: string;
  healthScore: number;
  createdAt: string;
}

export interface WeeklyReportDetail extends WeeklyReportSummary {
  keyMetrics: {
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
    learningRecords: number;
    wordsLearned: number;
    avgAccuracy: number;
    avgSessionDuration: number;
  };
  highlights: Array<{
    title: string;
    description: string;
    metric?: string;
    change?: number;
  }>;
  concerns: Array<{
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    suggestedAction?: string;
  }>;
  recommendations: Array<{
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    category: string;
  }>;
  userMetrics: Record<string, unknown>;
  learningMetrics: Record<string, unknown>;
  systemMetrics: Record<string, unknown>;
}

export interface HealthTrendPoint {
  weekStart: string;
  weekEnd: string;
  healthScore: number;
  activeUsers: number;
  learningRecords: number;
}

export interface UserBehaviorInsight {
  id: string;
  analysisDate: string;
  userSegment: UserSegment;
  patterns: Array<{
    name: string;
    description: string;
    prevalence: number;
  }>;
  insights: Array<{
    title: string;
    description: string;
    dataSupport: string;
    actionable: boolean;
  }>;
  recommendations: Array<{
    title: string;
    description: string;
    targetSegment: string;
    expectedImpact: string;
  }>;
  userCount: number;
  dataPoints: number;
  createdAt: string;
}

export interface UserSegmentInfo {
  id: UserSegment;
  name: string;
  description: string;
}

// ==================== 响应类型 ====================

interface ListResponse<T> {
  data: T[];
  total: number;
}

// ==================== 客户端类 ====================

export class OpsEnhanceClient extends BaseClient {
  // ==================== 告警分析 ====================

  /**
   * 分析告警
   */
  async analyzeAlert(
    alert: AlertInput,
    options?: {
      includeHistoricalContext?: boolean;
      maxRelatedAlerts?: number;
    },
  ): Promise<AlertAnalysisResult> {
    return this.request<AlertAnalysisResult>('/api/admin/ops/alerts/analyze', {
      method: 'POST',
      body: JSON.stringify({ alert, ...options }),
    });
  }

  /**
   * 获取告警分析列表
   */
  async getAlertAnalyses(options?: {
    status?: AlertStatus;
    severity?: AlertSeverity;
    limit?: number;
    offset?: number;
  }): Promise<{ items: AlertAnalysisResult[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.severity) params.append('severity', options.severity);
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));
    const queryStr = params.toString();

    // 使用 requestFull 获取完整响应（包含 data 和 total）
    const response = await this.requestFull<{
      success: boolean;
      data: AlertAnalysisResult[];
      total: number;
    }>(`/api/admin/ops/alerts/analyses${queryStr ? `?${queryStr}` : ''}`);
    return { items: response.data, total: response.total };
  }

  /**
   * 获取单个分析详情
   */
  async getAlertAnalysis(id: string): Promise<AlertAnalysisResult | null> {
    return this.request<AlertAnalysisResult | null>(`/api/admin/ops/alerts/analyses/${id}`);
  }

  /**
   * 更新分析状态
   */
  async updateAlertStatus(id: string, status: AlertStatus, resolution?: string): Promise<void> {
    await this.request<void>(`/api/admin/ops/alerts/analyses/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, resolution }),
    });
  }

  /**
   * 获取告警分析统计
   */
  async getAlertStats(): Promise<AlertStats> {
    return this.request<AlertStats>('/api/admin/ops/alerts/stats');
  }

  // ==================== 周报 ====================

  /**
   * 生成周报
   */
  async generateWeeklyReport(options?: {
    endDate?: Date;
    includeDetailedMetrics?: boolean;
  }): Promise<WeeklyReportDetail> {
    return this.request<WeeklyReportDetail>('/api/admin/ops/reports/weekly/generate', {
      method: 'POST',
      body: JSON.stringify({
        endDate: options?.endDate?.toISOString(),
        includeDetailedMetrics: options?.includeDetailedMetrics,
      }),
    });
  }

  /**
   * 获取周报列表
   */
  async getWeeklyReports(options?: {
    limit?: number;
    offset?: number;
  }): Promise<{ items: WeeklyReportSummary[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));
    const queryStr = params.toString();

    // 使用 requestFull 获取完整响应（包含 data 和 total）
    const response = await this.requestFull<{
      success: boolean;
      data: WeeklyReportSummary[];
      total: number;
    }>(`/api/admin/ops/reports/weekly${queryStr ? `?${queryStr}` : ''}`);
    return { items: response.data, total: response.total };
  }

  /**
   * 获取最新周报
   */
  async getLatestWeeklyReport(): Promise<WeeklyReportDetail | null> {
    try {
      return await this.request<WeeklyReportDetail | null>('/api/admin/ops/reports/weekly/latest');
    } catch {
      return null;
    }
  }

  /**
   * 获取单个周报
   */
  async getWeeklyReport(id: string): Promise<WeeklyReportDetail | null> {
    return this.request<WeeklyReportDetail | null>(`/api/admin/ops/reports/weekly/${id}`);
  }

  /**
   * 获取健康度趋势
   */
  async getHealthTrend(weeks?: number): Promise<HealthTrendPoint[]> {
    const params = weeks ? `?weeks=${weeks}` : '';
    return this.request<HealthTrendPoint[]>(`/api/admin/ops/reports/health-trend${params}`);
  }

  // ==================== 用户行为洞察 ====================

  /**
   * 生成用户行为洞察
   */
  async generateInsight(options?: {
    segment?: UserSegment;
    daysToAnalyze?: number;
  }): Promise<UserBehaviorInsight> {
    return this.request<UserBehaviorInsight>('/api/admin/ops/insights/generate', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  }

  /**
   * 获取洞察列表
   */
  async getInsights(options?: {
    segment?: UserSegment;
    limit?: number;
    offset?: number;
  }): Promise<{ items: UserBehaviorInsight[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.segment) params.append('segment', options.segment);
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));
    const queryStr = params.toString();

    // 使用 requestFull 获取完整响应（包含 data 和 total）
    const response = await this.requestFull<{
      success: boolean;
      data: UserBehaviorInsight[];
      total: number;
    }>(`/api/admin/ops/insights${queryStr ? `?${queryStr}` : ''}`);
    return { items: response.data, total: response.total };
  }

  /**
   * 获取单个洞察详情
   */
  async getInsight(id: string): Promise<UserBehaviorInsight | null> {
    return this.request<UserBehaviorInsight | null>(`/api/admin/ops/insights/${id}`);
  }

  /**
   * 获取可用的用户分群列表
   */
  async getSegments(): Promise<UserSegmentInfo[]> {
    return this.request<UserSegmentInfo[]>('/api/admin/ops/segments');
  }
}

// ==================== 默认实例 ====================

export const opsEnhanceClient = new OpsEnhanceClient();
