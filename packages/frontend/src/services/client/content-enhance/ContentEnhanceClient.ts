/**
 * Content Enhance Client
 * 内容增强 API 客户端
 */

import { BaseClient } from '../base/BaseClient';

// ==================== 类型定义 ====================

export type CheckType = 'SPELLING' | 'MEANING' | 'EXAMPLE' | 'FULL';
export type IssueSeverity = 'error' | 'warning' | 'suggestion';
export type CheckStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type EnhanceType = 'meanings' | 'examples' | 'mnemonics' | 'usage_notes';

export interface WordIssue {
  wordId: string;
  spelling: string;
  field: 'spelling' | 'phonetic' | 'meanings' | 'examples';
  severity: IssueSeverity;
  description: string;
  suggestion?: string;
}

export interface QualityCheckResult {
  id: string;
  wordBookId: string;
  checkType: CheckType;
  status: CheckStatus;
  totalWords: number;
  checkedWords: number;
  issuesFound: number;
  issues: WordIssue[];
  summary?: {
    errorCount: number;
    warningCount: number;
    suggestionCount: number;
    overallQuality: 'good' | 'fair' | 'poor';
  };
  createdAt: string;
}

export interface QualityStats {
  totalChecks: number;
  lastCheckDate: string | null;
  totalIssuesFound: number;
  openIssues: number;
  fixedIssues: number;
  qualityTrend: Array<{ date: string; issueCount: number }>;
}

export interface EnhanceResult {
  wordId: string;
  spelling: string;
  field: EnhanceType;
  originalValue: unknown;
  generatedValue: unknown;
  confidence: number;
}

export interface ContentVariant {
  id: string;
  wordId: string;
  spelling: string;
  field: EnhanceType;
  originalValue: unknown;
  generatedValue: unknown;
  confidence: number;
  status: string;
  createdAt: string;
}

export interface BatchEnhanceResult {
  taskId: string;
  status: string;
  totalWords: number;
  processedWords: number;
  results: EnhanceResult[];
  errors: Array<{ wordId: string; error: string }>;
  createdAt: string;
}

// ==================== 响应类型 ====================

interface ListResponse<T> {
  data: T[];
  total: number;
}

// ==================== 客户端类 ====================

export class ContentEnhanceClient extends BaseClient {
  // ==================== 词库质量检查 ====================

  /**
   * 启动词库质量检查
   * 注意：这是一个长时间运行的任务，需要较长的超时时间
   */
  async startQualityCheck(
    wordBookId: string,
    options?: {
      checkType?: CheckType;
      batchSize?: number;
      maxIssues?: number;
    },
  ): Promise<QualityCheckResult> {
    // 质量检查需要调用 LLM，设置 5 分钟超时
    return this.request<QualityCheckResult>(
      `/api/admin/content/wordbooks/${wordBookId}/quality-check`,
      {
        method: 'POST',
        body: JSON.stringify(options || {}),
      },
      300000, // 5 分钟超时
    );
  }

  /**
   * 获取词库质量检查历史
   */
  async getCheckHistory(
    wordBookId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<{ items: QualityCheckResult[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));
    const queryStr = params.toString();

    // 使用 requestFull 获取完整响应（包含 data 和 total）
    const response = await this.requestFull<{
      success: boolean;
      data: QualityCheckResult[];
      total: number;
    }>(
      `/api/admin/content/wordbooks/${wordBookId}/quality-checks${queryStr ? `?${queryStr}` : ''}`,
    );
    return { items: response.data, total: response.total };
  }

  /**
   * 获取检查详情
   */
  async getCheckDetail(checkId: string): Promise<QualityCheckResult> {
    return this.request<QualityCheckResult>(`/api/admin/content/quality-checks/${checkId}`);
  }

  /**
   * 获取未解决的问题列表
   */
  async getOpenIssues(
    wordBookId: string,
    options?: {
      severity?: IssueSeverity;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: Array<WordIssue & { id: string; status: string }>; total: number }> {
    const params = new URLSearchParams();
    if (options?.severity) params.append('severity', options.severity);
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));
    const queryStr = params.toString();

    // 使用 requestFull 获取完整响应（包含 data 和 total）
    const response = await this.requestFull<{
      success: boolean;
      data: Array<WordIssue & { id: string; status: string }>;
      total: number;
    }>(`/api/admin/content/wordbooks/${wordBookId}/issues${queryStr ? `?${queryStr}` : ''}`);
    return { items: response.data, total: response.total };
  }

  /**
   * 标记问题为已修复
   */
  async markIssueFix(issueId: string): Promise<void> {
    await this.request<void>(`/api/admin/content/issues/${issueId}/fix`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  /**
   * 忽略问题
   */
  async ignoreIssue(issueId: string): Promise<void> {
    await this.request<void>(`/api/admin/content/issues/${issueId}/ignore`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  /**
   * 批量应用修复
   */
  async batchApplyFixes(issueIds: string[]): Promise<{
    applied: number;
    failed: number;
    errors: Array<{ issueId: string; error: string }>;
  }> {
    return this.request<{
      applied: number;
      failed: number;
      errors: Array<{ issueId: string; error: string }>;
    }>('/api/admin/content/issues/batch-fix', {
      method: 'POST',
      body: JSON.stringify({ issueIds }),
    });
  }

  /**
   * 获取词库质量统计
   */
  async getQualityStats(wordBookId: string): Promise<QualityStats> {
    return this.request<QualityStats>(`/api/admin/content/wordbooks/${wordBookId}/quality-stats`);
  }

  // ==================== 内容增强 ====================

  /**
   * 批量内容增强
   */
  async enhanceWords(
    wordBookId: string,
    options: {
      enhanceType: EnhanceType;
      batchSize?: number;
      maxWords?: number;
      overwrite?: boolean;
    },
  ): Promise<BatchEnhanceResult> {
    // 内容增强需要调用 LLM，设置 5 分钟超时
    return this.request<BatchEnhanceResult>(
      '/api/admin/content/words/enhance',
      {
        method: 'POST',
        body: JSON.stringify({ wordBookId, ...options }),
      },
      300000, // 5 分钟超时
    );
  }

  /**
   * 预览单词增强
   */
  async previewEnhance(wordId: string, enhanceType: EnhanceType): Promise<EnhanceResult | null> {
    return this.request<EnhanceResult | null>(
      `/api/admin/content/words/${wordId}/enhancement-preview?enhanceType=${enhanceType}`,
    );
  }

  /**
   * 获取待审核的内容变体
   */
  async getPendingVariants(options?: {
    wordBookId?: string;
    field?: EnhanceType;
    limit?: number;
    offset?: number;
  }): Promise<{ items: ContentVariant[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.wordBookId) params.append('wordBookId', options.wordBookId);
    if (options?.field) params.append('field', options.field);
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));
    const queryStr = params.toString();

    // 使用 requestFull 获取完整响应（包含 data 和 total）
    const response = await this.requestFull<{
      success: boolean;
      data: ContentVariant[];
      total: number;
    }>(`/api/admin/content/content-variants${queryStr ? `?${queryStr}` : ''}`);
    return { items: response.data, total: response.total };
  }

  /**
   * 审批内容变体
   */
  async approveVariant(variantId: string, applyToWord: boolean = false): Promise<void> {
    await this.request<void>(`/api/admin/content/content-variants/${variantId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ applyToWord }),
    });
  }

  /**
   * 拒绝内容变体
   */
  async rejectVariant(variantId: string): Promise<void> {
    await this.request<void>(`/api/admin/content/content-variants/${variantId}/reject`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  /**
   * 批量审批内容变体
   */
  async batchApproveVariants(
    variantIds: string[],
    applyToWord: boolean = false,
  ): Promise<{ approved: number; failed: number }> {
    return this.request<{ approved: number; failed: number }>(
      '/api/admin/content/content-variants/batch-approve',
      {
        method: 'POST',
        body: JSON.stringify({ variantIds, applyToWord }),
      },
    );
  }

  /**
   * 获取增强任务历史
   */
  async getEnhanceTaskHistory(options?: { limit?: number; offset?: number }): Promise<{
    items: Array<{
      id: string;
      type: string;
      status: string;
      input: unknown;
      output: unknown;
      createdAt: string;
      completedAt: string | null;
    }>;
    total: number;
  }> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));
    const queryStr = params.toString();

    // 使用 requestFull 获取完整响应（包含 data 和 total）
    const response = await this.requestFull<{
      success: boolean;
      data: Array<{
        id: string;
        type: string;
        status: string;
        input: unknown;
        output: unknown;
        createdAt: string;
        completedAt: string | null;
      }>;
      total: number;
    }>(`/api/admin/content/enhance-tasks${queryStr ? `?${queryStr}` : ''}`);
    return { items: response.data, total: response.total };
  }
}

// ==================== 默认实例 ====================

export const contentEnhanceClient = new ContentEnhanceClient();
