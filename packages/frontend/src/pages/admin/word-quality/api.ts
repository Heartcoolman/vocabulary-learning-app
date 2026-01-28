import { BaseClient } from '../../../services/client/base/BaseClient';

// --- Types ---

export type TaskType = 'check' | 'enhance';
export type CheckType = 'FULL' | 'SPELLING' | 'MEANING' | 'EXAMPLE';
export type IssueSeverity = 'error' | 'warning' | 'suggestion';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type IssueStatus = 'open' | 'fixed' | 'ignored';

export interface Task {
  id: string;
  wordbookId: string;
  taskType: TaskType;
  checkType?: CheckType;
  status: TaskStatus;
  totalItems: number;
  processedItems: number;
  issuesFound: number;
  currentItem?: string;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

export interface Issue {
  id: string;
  taskId?: string;
  wordbookId: string;
  wordId: string;
  wordSpelling: string;
  field: string;
  severity: IssueSeverity;
  message: string;
  suggestion?: unknown;
  status: IssueStatus;
  createdAt: string;
}

export interface QualityStats {
  totalWords: number;
  checkedWords: number;
  openIssues: number;
  fixedIssues: number;
  lastCheck?: string;
}

export interface StartTaskOptions {
  taskType: TaskType;
  checkType?: CheckType;
  enhanceFields?: string[];
}

export interface IssueFilters {
  status?: IssueStatus;
  severity?: IssueSeverity;
  field?: string;
  limit?: number;
  offset?: number;
}

export interface BatchResult {
  successCount: number;
  failedCount: number;
}

// --- API Client ---

export class WordQualityApi extends BaseClient {
  protected async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const query = params
      ? '?' + new URLSearchParams(params as Record<string, string>).toString()
      : '';
    return this.request<T>(url + query, { method: 'GET' });
  }

  protected async getFull<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const query = params
      ? '?' + new URLSearchParams(params as Record<string, string>).toString()
      : '';
    return this.requestFull<T>(url + query, { method: 'GET' });
  }

  protected async post<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // --- Methods ---

  async getStats(wordbookId: string): Promise<QualityStats> {
    return this.get<QualityStats>(`/api/admin/quality/wordbooks/${wordbookId}/stats`);
  }

  async listTasks(wordbookId: string, limit = 10): Promise<Task[]> {
    return this.get<Task[]>(`/api/admin/quality/wordbooks/${wordbookId}/tasks`, { limit });
  }

  async startTask(wordbookId: string, options: StartTaskOptions): Promise<Task> {
    return this.post<Task>(`/api/admin/quality/wordbooks/${wordbookId}/tasks`, options);
  }

  async cancelTask(taskId: string): Promise<void> {
    await this.post(`/api/admin/quality/tasks/${taskId}/cancel`);
  }

  async listIssues(
    wordbookId: string,
    filters?: IssueFilters,
  ): Promise<{ items: Issue[]; total: number }> {
    const res = await this.getFull<{ success: boolean; data: Issue[]; total: number }>(
      `/api/admin/quality/wordbooks/${wordbookId}/issues`,
      filters,
    );
    return { items: res.data, total: res.total };
  }

  async applyFix(issueId: string): Promise<Issue> {
    return this.post<Issue>(`/api/admin/quality/issues/${issueId}/fix`);
  }

  async ignoreIssue(issueId: string): Promise<void> {
    await this.post(`/api/admin/quality/issues/${issueId}/ignore`);
  }

  async batchOperation(issueIds: string[], action: 'fix' | 'ignore'): Promise<BatchResult> {
    return this.post<BatchResult>('/api/admin/quality/issues/batch', { issueIds, action });
  }
}

export const wordQualityApi = new WordQualityApi();
