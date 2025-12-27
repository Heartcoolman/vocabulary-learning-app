import { BaseClient } from '../base/BaseClient';
import { WordBook, Word, AnswerRecord } from '../../../types/models';

/**
 * 用户信息
 */
export interface User {
  id: string;
  email: string;
  username: string;
  role: 'USER' | 'ADMIN';
  rewardProfile?: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * 用户概览（管理员）
 */
export interface UserOverview extends User {
  totalWordsLearned: number;
  averageScore: number;
  accuracy: number;
  lastLearningTime: string | null;
}

/**
 * 用户列表响应（管理员）
 */
export interface AdminUsersResponse {
  users: UserOverview[];
  total: number;
  page: number;
  pageSize: number;
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

/**
 * 用户学习数据（管理员）
 */
export interface UserLearningData {
  user: {
    id: string;
    email: string;
    username: string;
  };
  totalRecords: number;
  correctRecords: number;
  averageAccuracy: number;
  totalWordsLearned: number;
  recentRecords: Array<
    AnswerRecord & {
      word: {
        spelling: string;
        phonetic: string;
        meanings: string[];
      };
    }
  >;
}

/**
 * 用户详细统计数据（管理员）
 */
export interface UserDetailedStatistics {
  user: {
    id: string;
    email: string;
    username: string;
    role: string;
    createdAt: string;
  };
  masteryDistribution: {
    level0: number;
    level1: number;
    level2: number;
    level3: number;
    level4: number;
    level5: number;
  };
  studyDays: number;
  consecutiveDays: number;
  totalStudyTime: number;
  totalWordsLearned: number;
  averageScore: number;
  accuracy: number;
}

/**
 * 用户单词详情（管理员）
 */
export interface UserWordDetail {
  word: {
    id: string;
    spelling: string;
    phonetic: string;
    meanings: string[];
    examples: string[];
  };
  score: number;
  masteryLevel: number;
  accuracy: number;
  reviewCount: number;
  lastReviewDate: string | null;
  nextReviewDate: string | null;
  state: string;
}

/**
 * 用户单词列表响应（管理员）
 */
export interface UserWordsResponse {
  words: UserWordDetail[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * 系统统计数据（管理员）
 */
export interface AdminStatistics {
  totalUsers: number;
  totalWords: number;
  totalRecords: number;
  totalWordBooks: number;
  activeUsers: number;
  systemWordBooks: number;
  userWordBooks: number;
}

/**
 * 单词学习历史（管理员）
 */
export interface WordLearningHistory {
  word: {
    id: string;
    spelling: string;
    phonetic: string;
    meanings: string[];
    examples: string[];
  };
  wordState: {
    masteryLevel: number;
    easeFactor: number;
    reviewCount: number;
    lastReviewDate: string | null;
    nextReviewDate: string | null;
    state: string;
  } | null;
  wordScore: {
    totalScore: number;
    accuracyScore: number;
    speedScore: number;
    stabilityScore: number;
    proficiencyScore: number;
    lastCalculated: string;
  } | null;
  records: Array<{
    id: string;
    timestamp: string;
    selectedAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    responseTime: number | null;
    dwellTime: number | null;
    masteryLevelBefore: number | null;
    masteryLevelAfter: number | null;
  }>;
}

/**
 * 单词得分历史（管理员）
 */
export interface WordScoreHistory {
  currentScore: number;
  scoreHistory: Array<{
    timestamp: string;
    score: number;
    masteryLevel: number | null;
    isCorrect: boolean;
  }>;
}

/**
 * 用户学习热力图数据（管理员）
 */
export interface UserLearningHeatmap {
  date: string;
  activityLevel: number;
  accuracy: number;
  averageScore: number;
  uniqueWords: number;
}

/**
 * 异常标记（管理员）
 */
export interface AnomalyFlag {
  id: string;
  userId: string;
  wordId: string;
  recordId?: string;
  reason: string;
  notes?: string;
  flaggedBy: string;
  flaggedAt: string;
}

/**
 * 视觉疲劳统计数据（管理员）
 */
export interface VisualFatigueStats {
  dataVolume: {
    totalRecords: number;
    recordsToday: number;
    recordsThisWeek: number;
    avgRecordsPerUser: number;
  };
  usage: {
    totalUsers: number;
    enabledUsers: number;
    enableRate: number;
    activeToday: number;
  };
  fatigue: {
    avgVisualFatigue: number;
    avgFusedFatigue: number;
    highFatigueUsers: number;
    fatigueDistribution: {
      low: number;
      medium: number;
      high: number;
    };
  };
  period: {
    start: string;
    end: string;
  };
}

/**
 * API 响应中的 WordBook 类型（日期字段为字符串）
 */
interface ApiWordBook {
  id: string;
  name: string;
  description?: string;
  coverImage?: string;
  type: 'SYSTEM' | 'USER';
  userId?: string;
  isPublic: boolean;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * API 响应中的 Word 类型（日期字段为字符串）
 */
interface ApiWord {
  id: string;
  wordBookId?: string;
  spelling: string;
  phonetic: string;
  meanings: string[];
  examples: string[];
  audioUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 将 API 返回的 WordBook 转换为前端模型
 */
function convertApiWordBook(apiWordBook: ApiWordBook): WordBook {
  return {
    ...apiWordBook,
    createdAt: new Date(apiWordBook.createdAt).getTime(),
    updatedAt: new Date(apiWordBook.updatedAt).getTime(),
  };
}

/**
 * 将 API 返回的 Word 转换为前端模型
 */
function convertApiWord(apiWord: ApiWord): Word {
  return {
    ...apiWord,
    wordBookId: apiWord.wordBookId,
    createdAt: new Date(apiWord.createdAt).getTime(),
    updatedAt: new Date(apiWord.updatedAt).getTime(),
  };
}

/**
 * AdminClient - 管理员相关API
 *
 * 职责：
 * - 用户管理（列表、详情、角色修改、删除）
 * - 用户学习数据查询
 * - 系统词书管理
 * - 系统统计数据
 * - 优化和评估API
 * - A/B测试实验管理
 * - AMAS决策查询
 */
export class AdminClient extends BaseClient {
  /**
   * 管理端通用请求入口（用于 AdminClient 尚未封装的后台能力）
   *
   * 目的：
   * - 避免页面层直接 fetch 导致 baseUrl/credentials/CSRF/header 不一致
   * - 保持统一的错误处理与 401 回调
   *
   * 注意：
   * - endpoint 传入形如 `/api/admin/...` 的相对路径
   * - 返回值为后端响应中的 `data` 字段（与 BaseClient.request 一致）
   */
  async requestAdmin<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return this.request<T>(endpoint, options);
  }

  /**
   * 获取用户列表（管理员）
   */
  async getUsers(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }): Promise<AdminUsersResponse> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.pageSize) queryParams.append('pageSize', params.pageSize.toString());
    if (params?.search) queryParams.append('search', params.search);

    const query = queryParams.toString();
    return this.request<AdminUsersResponse>(`/api/admin/users${query ? `?${query}` : ''}`);
  }

  /**
   * 获取用户详情（管理员）
   */
  async getUserById(userId: string): Promise<User> {
    return this.request<User>(`/api/admin/users/${userId}`);
  }

  /**
   * 获取用户学习数据（管理员）
   */
  async getUserLearningData(userId: string, limit?: number): Promise<UserLearningData> {
    const query = limit ? `?limit=${limit}` : '';
    return this.request<UserLearningData>(`/api/admin/users/${userId}/learning-data${query}`);
  }

  /**
   * 获取用户详细统计数据（管理员）
   */
  async getUserStatistics(userId: string): Promise<UserDetailedStatistics> {
    return this.request<UserDetailedStatistics>(`/api/admin/users/${userId}/statistics`);
  }

  /**
   * 获取用户单词列表（管理员）
   */
  async getUserWords(
    userId: string,
    params?: {
      page?: number;
      pageSize?: number;
      scoreRange?: 'low' | 'medium' | 'high';
      masteryLevel?: number;
      minAccuracy?: number;
      state?: 'new' | 'learning' | 'reviewing' | 'mastered';
      sortBy?: 'score' | 'accuracy' | 'reviewCount' | 'lastReview';
      sortOrder?: 'asc' | 'desc';
    },
  ): Promise<UserWordsResponse> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.pageSize) queryParams.append('pageSize', params.pageSize.toString());
    if (params?.scoreRange) queryParams.append('scoreRange', params.scoreRange);
    if (params?.masteryLevel !== undefined)
      queryParams.append('masteryLevel', params.masteryLevel.toString());
    if (params?.minAccuracy !== undefined)
      queryParams.append('minAccuracy', params.minAccuracy.toString());
    if (params?.state) queryParams.append('state', params.state);
    if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);

    const query = queryParams.toString();
    return this.request<UserWordsResponse>(
      `/api/admin/users/${userId}/words${query ? `?${query}` : ''}`,
    );
  }

  /**
   * 导出用户单词数据（管理员）
   */
  async exportUserWords(userId: string, format: 'csv' | 'excel' = 'csv'): Promise<void> {
    const url = `${this.baseUrl}/api/admin/users/${userId}/words/export?format=${format}`;
    const token = this.tokenManager.getToken();

    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error('导出失败');
    }

    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = `用户单词数据_${userId}_${new Date().toISOString().split('T')[0]}.csv`;

    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (filenameMatch && filenameMatch[1]) {
        filename = decodeURIComponent(filenameMatch[1].replace(/['"]/g, ''));
      }
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  }

  /**
   * 修改用户角色（管理员）
   */
  async updateUserRole(userId: string, role: 'USER' | 'ADMIN'): Promise<User> {
    return this.request<User>(`/api/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  }

  /**
   * 删除用户（管理员）
   */
  async deleteUser(userId: string): Promise<void> {
    return this.request<void>(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    });
  }

  /**
   * 获取所有系统词库（管理员）
   */
  async getSystemWordBooks(): Promise<WordBook[]> {
    const apiWordBooks = await this.request<ApiWordBook[]>('/api/admin/wordbooks');
    return apiWordBooks.map(convertApiWordBook);
  }

  /**
   * 创建系统词库（管理员）
   */
  async createSystemWordBook(data: {
    name: string;
    description?: string;
    coverImage?: string;
  }): Promise<WordBook> {
    const apiWordBook = await this.request<ApiWordBook>('/api/admin/wordbooks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return convertApiWordBook(apiWordBook);
  }

  /**
   * 更新系统词库（管理员）
   */
  async updateSystemWordBook(
    id: string,
    data: {
      name?: string;
      description?: string;
      coverImage?: string;
    },
  ): Promise<WordBook> {
    const apiWordBook = await this.request<ApiWordBook>(`/api/admin/wordbooks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return convertApiWordBook(apiWordBook);
  }

  /**
   * 删除系统词库（管理员）
   */
  async deleteSystemWordBook(id: string): Promise<void> {
    return this.request<void>(`/api/admin/wordbooks/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * 批量添加单词到系统词库（管理员）
   */
  async batchAddWordsToSystemWordBook(
    wordBookId: string,
    words: Omit<Word, 'id' | 'createdAt' | 'updatedAt'>[],
  ): Promise<Word[]> {
    const apiWords = await this.request<ApiWord[]>(
      `/api/admin/wordbooks/${wordBookId}/words/batch`,
      {
        method: 'POST',
        body: JSON.stringify({ words }),
      },
    );
    return apiWords.map(convertApiWord);
  }

  /**
   * 获取系统统计数据（管理员）
   */
  async getStatistics(): Promise<AdminStatistics> {
    return this.request<AdminStatistics>('/api/admin/statistics');
  }

  /**
   * 获取单词的完整学习历史（管理员）
   */
  async getWordLearningHistory(
    userId: string,
    wordId: string,
    limit?: number,
  ): Promise<WordLearningHistory> {
    const query = limit ? `?limit=${limit}` : '';
    return this.request<WordLearningHistory>(
      `/api/admin/users/${userId}/words/${wordId}/history${query}`,
    );
  }

  /**
   * 获取单词得分历史（管理员）
   */
  async getWordScoreHistory(userId: string, wordId: string): Promise<WordScoreHistory> {
    return this.request<WordScoreHistory>(
      `/api/admin/users/${userId}/words/${wordId}/score-history`,
    );
  }

  /**
   * 获取用户学习热力图数据（管理员）
   */
  async getUserLearningHeatmap(userId: string, days?: number): Promise<UserLearningHeatmap[]> {
    const query = days ? `?days=${days}` : '';
    return this.request<UserLearningHeatmap[]>(`/api/admin/users/${userId}/heatmap${query}`);
  }

  /**
   * 标记异常单词或学习记录（管理员）
   */
  async flagAnomalyRecord(
    userId: string,
    wordId: string,
    data: {
      recordId?: string;
      reason: string;
      notes?: string;
    },
  ): Promise<AnomalyFlag> {
    return this.request<AnomalyFlag>(`/api/admin/users/${userId}/words/${wordId}/flag`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * 获取异常标记列表（管理员）
   */
  async getAnomalyFlags(userId: string, wordId: string): Promise<AnomalyFlag[]> {
    return this.request<AnomalyFlag[]>(`/api/admin/users/${userId}/words/${wordId}/flags`);
  }

  /**
   * 获取用户决策列表
   */
  async getUserDecisions(
    userId: string,
    params: {
      page: number;
      pageSize: number;
      startDate?: string;
      endDate?: string;
      decisionSource?: string;
      minConfidence?: number;
      sortBy?: 'timestamp' | 'confidence' | 'duration';
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const query = new URLSearchParams();
    query.append('page', params.page.toString());
    query.append('pageSize', params.pageSize.toString());
    if (params.startDate) query.append('startDate', params.startDate);
    if (params.endDate) query.append('endDate', params.endDate);
    if (params.decisionSource) query.append('decisionSource', params.decisionSource);
    if (params.minConfidence !== undefined)
      query.append('minConfidence', params.minConfidence.toString());
    if (params.sortBy) query.append('sortBy', params.sortBy);
    if (params.sortOrder) query.append('sortOrder', params.sortOrder);

    return this.request(`/api/admin/users/${userId}/decisions?${query.toString()}`);
  }

  /**
   * 获取决策详情
   */
  async getDecisionDetail(userId: string, decisionId: string) {
    return this.request(`/api/admin/users/${userId}/decisions/${decisionId}`);
  }

  // ==================== 优化 API ====================

  /**
   * 获取下一个推荐参数组合
   */
  async getOptimizationSuggestion(): Promise<{
    params: Record<string, number>;
    paramSpace: Record<string, { min: number; max: number; step: number }>;
  }> {
    return this.request('/api/optimization/suggest');
  }

  /**
   * 记录参数评估结果
   */
  async recordOptimizationEvaluation(
    params: Record<string, number>,
    value: number,
  ): Promise<{ recorded: boolean }> {
    return this.request('/api/optimization/evaluate', {
      method: 'POST',
      body: JSON.stringify({ params, value }),
    });
  }

  /**
   * 获取当前最优参数
   */
  async getBestOptimizationParams(): Promise<{
    params: Record<string, number> | null;
    value: number | null;
  }> {
    return this.request('/api/optimization/best');
  }

  /**
   * 获取优化历史
   */
  async getOptimizationHistory(): Promise<
    Array<{
      params: Record<string, number>;
      value: number;
      timestamp: string;
    }>
  > {
    const response = await this.request<{
      observations: Array<{
        params: Record<string, number>;
        value: number;
        timestamp: number;
      }>;
      bestParams: Record<string, number> | null;
      bestValue: number | null;
      evaluationCount: number;
    }>('/api/optimization/history');

    return (response.observations || []).map((obs) => ({
      params: obs.params,
      value: obs.value,
      timestamp:
        typeof obs.timestamp === 'number'
          ? new Date(obs.timestamp).toISOString()
          : String(obs.timestamp),
    }));
  }

  /**
   * 手动触发优化周期
   */
  async triggerOptimization(): Promise<{
    triggered: boolean;
    result?: Record<string, unknown>;
  }> {
    return this.request('/api/optimization/trigger', { method: 'POST' });
  }

  /**
   * 重置优化器状态
   */
  async resetOptimizer(): Promise<{ reset: boolean }> {
    return this.request('/api/optimization/reset', { method: 'POST' });
  }

  /**
   * 获取优化器诊断信息
   */
  async getOptimizationDiagnostics(): Promise<Record<string, unknown>> {
    return this.request('/api/optimization/diagnostics');
  }

  // ==================== 评估 API ====================

  /**
   * 记录因果观测数据
   */
  async recordCausalObservation(data: {
    features: number[];
    treatment: 0 | 1;
    outcome: number;
  }): Promise<{
    id: string;
    treatment: number;
    outcome: number;
    timestamp: string;
  } | null> {
    return this.request('/api/evaluation/causal/observe', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * 获取平均处理效应估计
   * @returns CausalEstimate 或 null（样本不足时）
   */
  async getCausalATE(): Promise<{
    ate: number;
    standardError: number;
    confidenceInterval: [number, number];
    sampleSize: number;
    effectiveSampleSize: number;
    pValue: number;
    significant: boolean;
  } | null> {
    return this.request('/api/evaluation/causal/ate');
  }

  /**
   * 比较两个策略的效果
   */
  async compareStrategies(
    strategyA: number,
    strategyB: number,
  ): Promise<{
    diff: number;
    standardError: number;
    confidenceInterval: [number, number];
    pValue: number;
    significant: boolean;
    sampleSize: number;
  }> {
    return this.request(
      `/api/evaluation/causal/compare?strategyA=${strategyA}&strategyB=${strategyB}`,
    );
  }

  /**
   * 获取因果推断诊断信息
   * @returns 观测统计和最新估计，或 null（功能未启用时）
   */
  async getCausalDiagnostics(): Promise<{
    observationCount: number;
    treatmentDistribution: Record<number, number>;
    latestEstimate: {
      ate: number;
      standardError: number;
      confidenceInterval: [number, number];
      sampleSize: number;
      effectiveSampleSize: number;
      pValue: number;
      significant: boolean;
    } | null;
  } | null> {
    return this.request('/api/evaluation/causal/diagnostics');
  }

  /**
   * 获取用户的 A/B 测试变体分配
   */
  async getExperimentVariant(experimentId: string): Promise<{
    variantId: string;
    variantName: string;
    isControl: boolean;
    parameters: Record<string, unknown>;
  } | null> {
    return this.request(`/api/evaluation/variant/${experimentId}`);
  }

  /**
   * 记录用户在实验中的指标
   */
  async recordExperimentMetric(
    experimentId: string,
    reward: number,
  ): Promise<{ recorded: boolean }> {
    return this.request(`/api/evaluation/variant/${experimentId}/metric`, {
      method: 'POST',
      body: JSON.stringify({ reward }),
    });
  }

  // ==================== Experiments API ====================

  /**
   * 创建实验（管理员）
   */
  async createExperiment(data: {
    name: string;
    description?: string;
    trafficAllocation: 'EVEN' | 'WEIGHTED' | 'DYNAMIC';
    minSampleSize: number;
    significanceLevel: number;
    minimumDetectableEffect: number;
    autoDecision: boolean;
    variants: Array<{
      id: string;
      name: string;
      weight: number;
      isControl: boolean;
      parameters: Record<string, unknown>;
    }>;
  }): Promise<{ id: string; name: string }> {
    return this.request('/api/experiments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * 获取实验列表（管理员）
   */
  async getExperiments(params?: {
    status?: 'DRAFT' | 'RUNNING' | 'COMPLETED' | 'ABORTED';
    page?: number;
    pageSize?: number;
  }): Promise<{
    experiments: Array<{
      id: string;
      name: string;
      description: string | null;
      status: 'DRAFT' | 'RUNNING' | 'COMPLETED' | 'ABORTED';
      trafficAllocation: 'EVEN' | 'WEIGHTED' | 'DYNAMIC';
      minSampleSize: number;
      significanceLevel: number;
      startedAt: string | null;
      endedAt: string | null;
      createdAt: string;
      updatedAt: string;
      variantCount: number;
      totalSamples: number;
    }>;
    total: number;
  }> {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.pageSize) queryParams.append('pageSize', params.pageSize.toString());
    const query = queryParams.toString();

    const response = await this.request<{
      data: Array<{
        id: string;
        name: string;
        description: string | null;
        status: 'DRAFT' | 'RUNNING' | 'COMPLETED' | 'ABORTED';
        trafficAllocation: 'EVEN' | 'WEIGHTED' | 'DYNAMIC';
        minSampleSize: number;
        significanceLevel: number;
        startedAt: string | null;
        endedAt: string | null;
        createdAt: string;
        updatedAt: string;
        variantCount: number;
        totalSamples: number;
      }>;
      pagination: { total: number; page: number; pageSize: number };
    }>(`/api/experiments${query ? `?${query}` : ''}`);

    return {
      experiments: response.data,
      total: response.pagination.total,
    };
  }

  /**
   * 获取实验详情（管理员）
   */
  async getExperiment(experimentId: string): Promise<{
    id: string;
    name: string;
    description: string | null;
    status: 'DRAFT' | 'RUNNING' | 'COMPLETED' | 'ABORTED';
    trafficAllocation: 'EVEN' | 'WEIGHTED' | 'DYNAMIC';
    minSampleSize: number;
    significanceLevel: number;
    minimumDetectableEffect: number;
    autoDecision: boolean;
    startedAt: string | null;
    endedAt: string | null;
    createdAt: string;
    updatedAt: string;
    variants: Array<{
      id: string;
      name: string;
      weight: number;
      isControl: boolean;
      parameters: Record<string, unknown>;
    }>;
    metrics: Array<{
      variantId: string;
      sampleCount: number;
      averageReward: number;
      stdDev: number;
    }>;
  }> {
    return this.request(`/api/experiments/${experimentId}`);
  }

  /**
   * 获取实验状态（管理员）
   */
  async getExperimentStatus(experimentId: string): Promise<{
    status: 'running' | 'completed' | 'stopped';
    pValue: number;
    effectSize: number;
    confidenceInterval: {
      lower: number;
      upper: number;
    };
    isSignificant: boolean;
    statisticalPower: number;
    sampleSizes: Array<{
      variantId: string;
      sampleCount: number;
    }>;
    winner: string | null;
    recommendation: string;
    reason: string;
    isActive: boolean;
  }> {
    return this.request(`/api/experiments/${experimentId}/status`);
  }

  /**
   * 启动实验（管理员）
   */
  async startExperiment(experimentId: string): Promise<{ message: string }> {
    return this.request(`/api/experiments/${experimentId}/start`, {
      method: 'POST',
    });
  }

  /**
   * 停止实验（管理员）
   */
  async stopExperiment(experimentId: string): Promise<{ message: string }> {
    return this.request(`/api/experiments/${experimentId}/stop`, {
      method: 'POST',
    });
  }

  /**
   * 删除实验（管理员）
   */
  async deleteExperiment(experimentId: string): Promise<{ message: string }> {
    return this.request(`/api/experiments/${experimentId}`, {
      method: 'DELETE',
    });
  }

  // ==================== 视觉疲劳统计 API ====================

  /**
   * 获取视觉疲劳统计数据（管理员）
   */
  async getVisualFatigueStats(): Promise<VisualFatigueStats> {
    return this.request<VisualFatigueStats>('/api/admin/visual-fatigue/stats');
  }
}
