import { Word, AnswerRecord, WordBook, StudyConfig } from '../types/models';

/**
 * JWT解码后的payload结构
 */
interface JwtPayload {
  userId: string;
  exp: number;
  iat: number;
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
 * API 响应中的 StudyConfig 类型（日期字段为字符串）
 */
interface ApiStudyConfig {
  id: string;
  userId: string;
  selectedWordBookIds: string[];
  dailyWordCount: number;
  studyMode?: string;
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
 * 将 API 返回的 StudyConfig 转换为前端模型
 */
function convertApiStudyConfig(apiStudyConfig: ApiStudyConfig): StudyConfig {
  return {
    ...apiStudyConfig,
    studyMode: apiStudyConfig.studyMode || '',
    createdAt: new Date(apiStudyConfig.createdAt).getTime(),
    updatedAt: new Date(apiStudyConfig.updatedAt).getTime(),
  };
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
 * base64url 解码（JWT 使用 base64url 编码，与标准 base64 不同）
 * base64url 使用 - 和 _ 替代 + 和 /，且不使用填充符 =
 */
function base64UrlDecode(input: string): string {
  // 将 base64url 转换为标准 base64
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  // 添加填充符
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return atob(padded);
}

/**
 * 解码JWT token（不验证签名，仅用于读取payload）
 */
function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(base64UrlDecode(parts[1]));
    return payload as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * 检查JWT token是否已过期
 */
function isTokenExpired(token: string): boolean {
  const payload = decodeJwt(token);
  if (!payload || !payload.exp) return true;

  // exp是秒级时间戳，需要转换为毫秒
  return payload.exp * 1000 < Date.now();
}

/**
 * API响应格式
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * 用户信息
 */
export interface User {
  id: string;
  email: string;
  username: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
}

/**
 * 认证响应
 */
interface AuthResponse {
  user: User;
  token: string;
}

/**
 * 学习统计
 */
interface Statistics {
  totalWords: number;
  totalRecords: number;
  correctRate: number;
}


/**
 * 学习进度
 */
export interface StudyProgress {
  todayStudied: number;
  todayTarget: number;
  totalStudied: number;
  correctRate: number;
}

/**
 * 今日学习单词响应
 */
export interface TodayWordsResponse {
  words: Word[];
  progress: StudyProgress;
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
  user: User;
  statistics: Statistics;
  recentRecords: AnswerRecord[];
  wordBooks: WordBook[];
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
  totalStudyTime: number; // 分钟
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
 * 转换WordLearningState的日期字段为时间戳
 */
function convertLearningStateDates(state: any): any {
  if (!state) return null;
  return {
    ...state,
    lastReviewDate: state.lastReviewDate
      ? new Date(state.lastReviewDate).getTime()
      : null,
    nextReviewDate: state.nextReviewDate
      ? new Date(state.nextReviewDate).getTime()
      : null,
    createdAt: new Date(state.createdAt).getTime(),
    updatedAt: new Date(state.updatedAt).getTime(),
  };
}

/**
 * 转换WordScore的日期字段为时间戳
 */
function convertWordScoreDates(score: any): any {
  if (!score) return null;
  return {
    ...score,
    createdAt: new Date(score.createdAt).getTime(),
    updatedAt: new Date(score.updatedAt).getTime(),
  };
}

/**
 * API客户端 - 封装所有HTTP请求
 */
/** 默认请求超时时间（毫秒） */
const DEFAULT_TIMEOUT = 30000;

class ApiClient {
  private baseUrl: string;
  private token: string | null;
  private onUnauthorizedCallback: (() => void) | null = null;
  private defaultTimeout: number = DEFAULT_TIMEOUT;

  constructor(baseUrl: string = import.meta.env.VITE_API_URL || 'http://localhost:3000') {
    this.baseUrl = baseUrl;

    // 从localStorage读取token并验证有效性
    const storedToken = localStorage.getItem('auth_token');
    if (storedToken) {
      // 检查token是否已过期
      if (isTokenExpired(storedToken)) {
        console.warn('存储的token已过期，已自动清除');
        localStorage.removeItem('auth_token');
        this.token = null;
      } else {
        this.token = storedToken;
      }
    } else {
      this.token = null;
    }
  }

  /**
   * 设置认证令牌
   */
  setToken(token: string): void {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  /**
   * 清除认证令牌
   */
  clearToken(): void {
    this.token = null;
    localStorage.removeItem('auth_token');
  }

  /**
   * 获取当前令牌
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * 设置401未授权回调
   * 当请求返回401时，会调用此回调通知外部（如AuthContext）更新登录状态
   */
  setOnUnauthorized(callback: (() => void) | null): void {
    this.onUnauthorizedCallback = callback;
  }

  /**
   * 通用请求方法
   * @param endpoint API 端点
   * @param options 请求选项
   * @param timeout 超时时间（毫秒），默认 30 秒
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeout: number = this.defaultTimeout
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    // 创建 AbortController 用于超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        signal: options.signal || controller.signal,
      });

      // 处理 401 错误，清除令牌并触发回调
      if (response.status === 401) {
        this.clearToken();
        // 触发401回调，通知外部（如AuthContext）更新登录状态
        if (this.onUnauthorizedCallback) {
          this.onUnauthorizedCallback();
        }
        throw new Error('认证失败，请重新登录');
      }

      // 处理空响应（204 No Content 或其他无内容响应）
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        if (!response.ok) {
          throw new Error(`请求失败: ${response.status}`);
        }
        return undefined as T;
      }

      // 检查响应类型是否为 JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        if (!response.ok) {
          throw new Error(`请求失败: ${response.status}`);
        }
        return undefined as T;
      }

      const data: ApiResponse<T> = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `请求失败: ${response.status}`);
      }

      if (!data.success) {
        throw new Error(data.error || '请求失败');
      }

      return data.data as T;
    } catch (error) {
      if (error instanceof Error) {
        // 处理超时错误
        if (error.name === 'AbortError') {
          throw new Error('请求超时，请检查网络连接');
        }
        throw error;
      }
      throw new Error('网络请求失败');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 通用请求方法 - 返回完整响应体（包含 data 和其他字段如 pagination）
   * 用于需要访问响应体中除 data 外其他字段的场景
   */
  private async requestFull<T>(
    endpoint: string,
    options: RequestInit = {},
    timeout: number = this.defaultTimeout
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        signal: options.signal || controller.signal,
      });

      if (response.status === 401) {
        this.clearToken();
        if (this.onUnauthorizedCallback) {
          this.onUnauthorizedCallback();
        }
        throw new Error('认证失败，请重新登录');
      }

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }

      const body = await response.json();

      if (!body.success) {
        throw new Error(body.error || '请求失败');
      }

      return body as T;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('请求超时，请检查网络连接');
        }
        throw error;
      }
      throw new Error('网络请求失败');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ==================== 认证相关 ====================

  /**
   * 用户注册
   */
  async register(email: string, password: string, username: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, username }),
    });
  }

  /**
   * 用户登录
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  /**
   * 用户退出登录
   */
  async logout(): Promise<void> {
    await this.request<void>('/api/auth/logout', {
      method: 'POST',
    });
  }

  // ==================== 用户相关 ====================

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(): Promise<User> {
    return this.request<User>('/api/users/me');
  }

  /**
   * 修改密码
   */
  async updatePassword(oldPassword: string, newPassword: string): Promise<void> {
    return this.request<void>('/api/users/me/password', {
      method: 'PUT',
      body: JSON.stringify({ oldPassword, newPassword }),
    });
  }

  /**
   * 获取用户统计信息
   */
  async getUserStatistics(): Promise<Statistics> {
    return this.request<Statistics>('/api/records/statistics');
  }

  // ==================== 单词相关 ====================

  /**
   * 获取用户的所有单词
   */
  async getWords(): Promise<Word[]> {
    const apiWords = await this.request<ApiWord[]>('/api/words');
    return apiWords.map(convertApiWord);
  }

  /**
   * 添加新单词
   */
  async createWord(wordData: Omit<Word, 'id' | 'createdAt' | 'updatedAt'>): Promise<Word> {
    const apiWord = await this.request<ApiWord>('/api/words', {
      method: 'POST',
      body: JSON.stringify(wordData),
    });
    return convertApiWord(apiWord);
  }

  /**
   * 更新单词
   */
  async updateWord(wordId: string, wordData: Partial<Omit<Word, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Word> {
    const apiWord = await this.request<ApiWord>(`/api/words/${wordId}`, {
      method: 'PUT',
      body: JSON.stringify(wordData),
    });
    return convertApiWord(apiWord);
  }

  /**
   * 删除单词
   */
  async deleteWord(wordId: string): Promise<void> {
    return this.request<void>(`/api/words/${wordId}`, {
      method: 'DELETE',
    });
  }

  /**
   * 批量创建单词
   */
  async batchCreateWords(words: Omit<Word, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Word[]> {
    const apiWords = await this.request<ApiWord[]>('/api/words/batch', {
      method: 'POST',
      body: JSON.stringify({ words }),
    });
    return apiWords.map(convertApiWord);
  }

  // ==================== 学习记录相关 ====================

  /**
   * 分页结果类型
   */
  

  /**
   * 获取学习记录（支持分页）
   * @param options 分页选项
   */
  async getRecords(options?: { page?: number; pageSize?: number }): Promise<{
    records: AnswerRecord[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const queryParams = new URLSearchParams();
    if (options?.page) queryParams.append('page', options.page.toString());
    if (options?.pageSize) queryParams.append('pageSize', options.pageSize.toString());

    const query = queryParams.toString();
    const endpoint = `/api/records${query ? `?${query}` : ''}`;

    // 使用 requestFull 获取完整响应体
    const body = await this.requestFull<{
      data?: Array<{
        id: string;
        wordId: string;
        timestamp: string | number;
        selectedAnswer: string;
        correctAnswer: string;
        isCorrect: boolean;
        responseTime?: number;
        dwellTime?: number;
      }>;
      pagination?: { page: number; pageSize: number; total: number; totalPages: number };
    }>(endpoint);

    // 后端返回的是 Date 字符串，这里统一转换为时间戳（毫秒）以与本地模型对齐
    const records = (body.data || []).map((record) => ({
      ...record,
      timestamp: typeof record.timestamp === 'string'
        ? new Date(record.timestamp).getTime()
        : record.timestamp,
    })) as AnswerRecord[];

    const defaultPagination = {
      page: options?.page ?? 1,
      pageSize: options?.pageSize ?? records.length,
      total: records.length,
      totalPages: 1,
    };

    return {
      records,
      pagination: body.pagination || defaultPagination,
    };
  }

  /**
   * 获取所有学习记录（兼容旧代码，不推荐使用）
   * @deprecated 请使用 getRecords 并处理分页
   */
  async getAllRecords(): Promise<AnswerRecord[]> {
    const result = await this.getRecords({ pageSize: 100 });
    return result.records;
  }

  /**
   * 保存答题记录
   */
  async createRecord(recordData: Omit<AnswerRecord, 'id'>): Promise<AnswerRecord> {
    return this.request<AnswerRecord>('/api/records', {
      method: 'POST',
      body: JSON.stringify(recordData),
    });
  }

  /**
   * 批量创建学习记录
   */
  async batchCreateRecords(records: Omit<AnswerRecord, 'id'>[]): Promise<AnswerRecord[]> {
    return this.request<AnswerRecord[]>('/api/records/batch', {
      method: 'POST',
      body: JSON.stringify({ records }),
    });
  }

  // ==================== 词书管理相关 ====================

  /**
   * 获取用户词库列表
   */
  async getUserWordBooks(): Promise<WordBook[]> {
    const apiWordBooks = await this.request<ApiWordBook[]>('/api/wordbooks/user');
    return apiWordBooks.map(convertApiWordBook);
  }

  /**
   * 获取系统词库列表
   */
  async getSystemWordBooks(): Promise<WordBook[]> {
    const apiWordBooks = await this.request<ApiWordBook[]>('/api/wordbooks/system');
    return apiWordBooks.map(convertApiWordBook);
  }

  /**
   * 获取所有可用词库（系统 + 用户）
   */
  async getAllAvailableWordBooks(): Promise<WordBook[]> {
    const apiWordBooks = await this.request<ApiWordBook[]>('/api/wordbooks/available');
    return apiWordBooks.map(convertApiWordBook);
  }

  /**
   * 获取词书详情
   */
  async getWordBookById(id: string): Promise<WordBook> {
    const apiWordBook = await this.request<ApiWordBook>(`/api/wordbooks/${id}`);
    return convertApiWordBook(apiWordBook);
  }

  /**
   * 创建用户词书
   */
  async createWordBook(data: { name: string; description?: string; coverImage?: string }): Promise<WordBook> {
    const apiWordBook = await this.request<ApiWordBook>('/api/wordbooks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return convertApiWordBook(apiWordBook);
  }

  /**
   * 更新词书
   */
  async updateWordBook(id: string, data: { name?: string; description?: string; coverImage?: string }): Promise<WordBook> {
    const apiWordBook = await this.request<ApiWordBook>(`/api/wordbooks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return convertApiWordBook(apiWordBook);
  }

  /**
   * 删除词书
   */
  async deleteWordBook(id: string): Promise<void> {
    return this.request<void>(`/api/wordbooks/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * 获取词书中的单词列表
   */
  async getWordBookWords(wordBookId: string): Promise<Word[]> {
    const apiWords = await this.request<ApiWord[]>(`/api/wordbooks/${wordBookId}/words`);
    return apiWords.map(convertApiWord);
  }

  /**
   * 向词书添加单词
   */
  async addWordToWordBook(wordBookId: string, wordData: Omit<Word, 'id' | 'createdAt' | 'updatedAt'>): Promise<Word> {
    const apiWord = await this.request<ApiWord>(`/api/wordbooks/${wordBookId}/words`, {
      method: 'POST',
      body: JSON.stringify(wordData),
    });
    return convertApiWord(apiWord);
  }

  /**
   * 从词书删除单词
   */
  async removeWordFromWordBook(wordBookId: string, wordId: string): Promise<void> {
    return this.request<void>(`/api/wordbooks/${wordBookId}/words/${wordId}`, {
      method: 'DELETE',
    });
  }

  // ==================== 学习配置相关 ====================

  /**
   * 获取用户学习配置
   */
  async getStudyConfig(): Promise<StudyConfig> {
    const apiStudyConfig = await this.request<ApiStudyConfig>('/api/study-config');
    return convertApiStudyConfig(apiStudyConfig);
  }

  /**
   * 更新学习配置
   */
  async updateStudyConfig(data: {
    selectedWordBookIds: string[];
    dailyWordCount: number;
    studyMode?: string;
  }): Promise<StudyConfig> {
    const apiStudyConfig = await this.request<ApiStudyConfig>('/api/study-config', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return convertApiStudyConfig(apiStudyConfig);
  }

  /**
   * 获取今日学习单词
   */
  async getTodayWords(): Promise<TodayWordsResponse> {
    const response = await this.request<{ words: ApiWord[]; progress: StudyProgress }>('/api/study-config/today-words');
    return {
      words: response.words.map(convertApiWord),
      progress: response.progress,
    };
  }

  /**
   * 获取学习进度
   */
  async getStudyProgress(): Promise<StudyProgress> {
    return this.request<StudyProgress>('/api/study-config/progress');
  }

  // ==================== 管理员相关 ====================

  /**
   * 获取用户列表（管理员）
   */
  async adminGetUsers(params?: { page?: number; pageSize?: number; search?: string }): Promise<AdminUsersResponse> {
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
  async adminGetUserById(userId: string): Promise<User> {
    return this.request<User>(`/api/admin/users/${userId}`);
  }

  /**
   * 获取用户学习数据（管理员）
   */
  async adminGetUserLearningData(userId: string, limit?: number): Promise<UserLearningData> {
    const query = limit ? `?limit=${limit}` : '';
    return this.request<UserLearningData>(`/api/admin/users/${userId}/learning-data${query}`);
  }

  /**
   * 获取用户详细统计数据（管理员）
   */
  async adminGetUserStatistics(userId: string): Promise<UserDetailedStatistics> {
    return this.request<UserDetailedStatistics>(`/api/admin/users/${userId}/statistics`);
  }

  /**
   * 获取用户单词列表（管理员）
   */
  async adminGetUserWords(
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
    }
  ): Promise<UserWordsResponse> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.pageSize) queryParams.append('pageSize', params.pageSize.toString());
    if (params?.scoreRange) queryParams.append('scoreRange', params.scoreRange);
    if (params?.masteryLevel !== undefined) queryParams.append('masteryLevel', params.masteryLevel.toString());
    if (params?.minAccuracy !== undefined) queryParams.append('minAccuracy', params.minAccuracy.toString());
    if (params?.state) queryParams.append('state', params.state);
    if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);

    const query = queryParams.toString();
    return this.request<UserWordsResponse>(`/api/admin/users/${userId}/words${query ? `?${query}` : ''}`);
  }

  /**
   * 导出用户单词数据（管理员）
   */
  async adminExportUserWords(userId: string, format: 'csv' | 'excel' = 'csv'): Promise<void> {
    const url = `${this.baseUrl}/api/admin/users/${userId}/words/export?format=${format}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': this.token ? `Bearer ${this.token}` : '',
      },
    });


    if (!response.ok) {
      throw new Error('导出失败');
    }

    // 获取文件名
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = `用户单词数据_${userId}_${new Date().toISOString().split('T')[0]}.csv`;

    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (filenameMatch && filenameMatch[1]) {
        filename = decodeURIComponent(filenameMatch[1].replace(/['"]/g, ''));
      }
    }

    // 下载文件
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
  async adminUpdateUserRole(userId: string, role: 'USER' | 'ADMIN'): Promise<User> {
    return this.request<User>(`/api/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  }

  /**
   * 删除用户（管理员）
   */
  async adminDeleteUser(userId: string): Promise<void> {
    return this.request<void>(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    });
  }

  /**
   * 创建系统词库（管理员）
   */
  async adminCreateSystemWordBook(data: {
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
  async adminUpdateSystemWordBook(id: string, data: {
    name?: string;
    description?: string;
    coverImage?: string;
  }): Promise<WordBook> {
    const apiWordBook = await this.request<ApiWordBook>(`/api/admin/wordbooks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return convertApiWordBook(apiWordBook);
  }

  /**
   * 删除系统词库（管理员）
   */
  async adminDeleteSystemWordBook(id: string): Promise<void> {
    return this.request<void>(`/api/admin/wordbooks/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * 批量添加单词到系统词库（管理员）
   */
  async adminBatchAddWordsToSystemWordBook(wordBookId: string, words: Omit<Word, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Word[]> {
    const apiWords = await this.request<ApiWord[]>(`/api/admin/wordbooks/${wordBookId}/words/batch`, {
      method: 'POST',
      body: JSON.stringify({ words }),
    });
    return apiWords.map(convertApiWord);
  }

  /**
   * 获取系统统计数据（管理员）
   */
  async adminGetStatistics(): Promise<AdminStatistics> {
    return this.request<AdminStatistics>('/api/admin/statistics');
  }

  /**
   * 获取单词的完整学习历史（管理员）
   */
  async adminGetWordLearningHistory(
    userId: string,
    wordId: string,
    limit?: number
  ): Promise<WordLearningHistory> {
    const query = limit ? `?limit=${limit}` : '';
    return this.request<WordLearningHistory>(
      `/api/admin/users/${userId}/words/${wordId}/history${query}`
    );
  }

  /**
   * 获取单词得分历史（管理员）
   */
  async adminGetWordScoreHistory(
    userId: string,
    wordId: string
  ): Promise<WordScoreHistory> {
    return this.request<WordScoreHistory>(
      `/api/admin/users/${userId}/words/${wordId}/score-history`
    );
  }

  /**
   * 获取用户学习热力图数据（管理员）
   */
  async adminGetUserLearningHeatmap(
    userId: string,
    days?: number
  ): Promise<UserLearningHeatmap[]> {
    const query = days ? `?days=${days}` : '';
    return this.request<UserLearningHeatmap[]>(
      `/api/admin/users/${userId}/heatmap${query}`
    );
  }

  /**
   * 标记异常单词或学习记录（管理员）
   */
  async adminFlagAnomalyRecord(
    userId: string,
    wordId: string,
    data: {
      recordId?: string;
      reason: string;
      notes?: string;
    }
  ): Promise<AnomalyFlag> {
    return this.request<AnomalyFlag>(
      `/api/admin/users/${userId}/words/${wordId}/flag`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  }

  /**
   * 获取异常标记列表（管理员）
   */
  async adminGetAnomalyFlags(
    userId: string,
    wordId: string
  ): Promise<AnomalyFlag[]> {
    return this.request<AnomalyFlag[]>(
      `/api/admin/users/${userId}/words/${wordId}/flags`
    );
  }

  // ==================== 学习状态相关 ====================

  /**
   * 获取单词学习状态
   */
  async getWordLearningState(wordId: string): Promise<import('../types/models').WordLearningState | null> {
    try {
      const state = await this.request<any>(`/api/word-states/${wordId}`);
      return state ? convertLearningStateDates(state) : null;
    } catch (error) {
      console.error('获取单词学习状态失败:', error);
      return null;
    }
  }

  /**
   * 批量获取单词学习状态
   */
  async getWordLearningStates(wordIds: string[]): Promise<import('../types/models').WordLearningState[]> {
    try {
      const states = await this.request<any[]>('/api/word-states/batch', {
        method: 'POST',
        body: JSON.stringify({ wordIds }),
      });
      return states.map(convertLearningStateDates);
    } catch (error) {
      console.error('批量获取单词学习状态失败:', error);
      return [];
    }
  }

  /**
   * 保存单词学习状态
   */
  async saveWordLearningState(state: import('../types/models').WordLearningState): Promise<void> {
    try {
      // 只提取允许的字段，排除 userId 和 wordId
      const {
        state: stateValue,
        masteryLevel,
        easeFactor,
        reviewCount,
        lastReviewDate,
        nextReviewDate,
        currentInterval,
        consecutiveCorrect,
        consecutiveWrong
      } = state;

      // 构建请求体，确保不包含 userId 和 wordId
      // 将时间戳转换为 ISO 字符串（后端验证器会自动转换为 DateTime）
      const body = {
        state: stateValue,
        masteryLevel,
        easeFactor,
        reviewCount,
        lastReviewDate: lastReviewDate ? new Date(lastReviewDate).toISOString() : undefined,
        nextReviewDate: nextReviewDate ? new Date(nextReviewDate).toISOString() : undefined,
        currentInterval,
        consecutiveCorrect,
        consecutiveWrong
      };

      await this.request<void>(`/api/word-states/${state.wordId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    } catch (error) {
      console.error('保存单词学习状态失败:', error);
      throw error;
    }
  }

  /**
   * 获取到期需要复习的单词
   */
  async getDueWords(): Promise<import('../types/models').WordLearningState[]> {
    try {
      const states = await this.request<any[]>('/api/word-states/due/list');
      return states.map(convertLearningStateDates);
    } catch (error) {
      console.error('获取到期单词失败:', error);
      return [];
    }
  }

  /**
   * 按状态获取单词
   */
  async getWordsByState(state: import('../types/models').WordState): Promise<import('../types/models').WordLearningState[]> {
    try {
      const states = await this.request<any[]>(`/api/word-states/by-state/${state}`);
      return states.map(convertLearningStateDates);
    } catch (error) {
      console.error('按状态获取单词失败:', error);
      return [];
    }
  }

  // ==================== 单词得分相关 ====================

  /**
   * 获取单词得分
   */
  async getWordScore(wordId: string): Promise<import('../types/models').WordScore | null> {
    try {
      const score = await this.request<any>(`/api/word-scores/${wordId}`);
      return score ? convertWordScoreDates(score) : null;
    } catch (error) {
      console.error('获取单词得分失败:', error);
      return null;
    }
  }

  /**
   * 批量获取单词得分
   */
  async getWordScores(wordIds: string[]): Promise<import('../types/models').WordScore[]> {
    try {
      const scores = await this.request<any[]>('/api/word-scores/batch', {
        method: 'POST',
        body: JSON.stringify({ wordIds }),
      });
      return scores.map(convertWordScoreDates);
    } catch (error) {
      console.error('批量获取单词得分失败:', error);
      return [];
    }
  }

  /**
   * 保存单词得分
   */
  async saveWordScore(score: import('../types/models').WordScore): Promise<void> {
    try {
      // 只发送允许的字段，过滤掉 id/userId/wordId/createdAt/updatedAt
      const { id, userId, wordId, createdAt, updatedAt, ...allowedFields } = score;
      await this.request<void>(`/api/word-scores/${score.wordId}`, {
        method: 'PUT',
        body: JSON.stringify(allowedFields),
      });
    } catch (error) {
      console.error('保存单词得分失败:', error);
      throw error;
    }
  }

  /**
   * 按得分范围获取单词得分
   */
  async getWordsByScoreRange(minScore: number, maxScore: number): Promise<import('../types/models').WordScore[]> {
    try {
      const scores = await this.request<any[]>(`/api/word-scores/range?minScore=${minScore}&maxScore=${maxScore}`);
      return scores.map(convertWordScoreDates);
    } catch (error) {
      console.error('按得分范围获取单词失败:', error);
      throw error;
    }
  }

  // ==================== 算法配置相关 ====================

  /**
   * 将后端扁平字段转换为前端嵌套对象
   */
  private normalizeAlgorithmConfig(raw: any): import('../types/models').AlgorithmConfig {
    if (!raw) throw new Error('算法配置为空');
    return {
      id: raw.id,
      name: raw.name,
      description: raw.description ?? '',
      reviewIntervals: raw.reviewIntervals ?? [],
      consecutiveCorrectThreshold: raw.consecutiveCorrectThreshold ?? 5,
      consecutiveWrongThreshold: raw.consecutiveWrongThreshold ?? 3,
      difficultyAdjustmentInterval: raw.difficultyAdjustmentInterval ?? 1,
      priorityWeights: {
        newWord: raw.priorityWeightNewWord ?? 0,
        errorRate: raw.priorityWeightErrorRate ?? 0,
        overdueTime: raw.priorityWeightOverdueTime ?? 0,
        wordScore: raw.priorityWeightWordScore ?? 0,
      },
      masteryThresholds: raw.masteryThresholds ?? [],
      scoreWeights: {
        accuracy: raw.scoreWeightAccuracy ?? 0,
        speed: raw.scoreWeightSpeed ?? 0,
        stability: raw.scoreWeightStability ?? 0,
        proficiency: raw.scoreWeightProficiency ?? 0,
      },
      speedThresholds: {
        excellent: raw.speedThresholdExcellent ?? 3000,
        good: raw.speedThresholdGood ?? 5000,
        average: raw.speedThresholdAverage ?? 10000,
        slow: raw.speedThresholdSlow ?? 10000,
      },
      newWordRatio: {
        default: raw.newWordRatioDefault ?? 0.3,
        highAccuracy: raw.newWordRatioHighAccuracy ?? 0.5,
        lowAccuracy: raw.newWordRatioLowAccuracy ?? 0.1,
        highAccuracyThreshold: raw.newWordRatioHighAccuracyThreshold ?? 0.85,
        lowAccuracyThreshold: raw.newWordRatioLowAccuracyThreshold ?? 0.65,
      },
      isDefault: !!raw.isDefault,
      createdAt: new Date(raw.createdAt).getTime(),
      updatedAt: new Date(raw.updatedAt).getTime(),
      createdBy: raw.createdBy ?? '',
    };
  }

  /**
   * 将前端嵌套对象转换为后端扁平字段
   */
  private denormalizeAlgorithmConfig(
    config: Partial<import('../types/models').AlgorithmConfig>
  ): Record<string, unknown> {
    const flat: Record<string, unknown> = { ...config };
    if (config.priorityWeights) {
      flat.priorityWeightNewWord = config.priorityWeights.newWord;
      flat.priorityWeightErrorRate = config.priorityWeights.errorRate;
      flat.priorityWeightOverdueTime = config.priorityWeights.overdueTime;
      flat.priorityWeightWordScore = config.priorityWeights.wordScore;
      delete flat.priorityWeights;
    }
    if (config.scoreWeights) {
      flat.scoreWeightAccuracy = config.scoreWeights.accuracy;
      flat.scoreWeightSpeed = config.scoreWeights.speed;
      flat.scoreWeightStability = config.scoreWeights.stability;
      flat.scoreWeightProficiency = config.scoreWeights.proficiency;
      delete flat.scoreWeights;
    }
    if (config.speedThresholds) {
      flat.speedThresholdExcellent = config.speedThresholds.excellent;
      flat.speedThresholdGood = config.speedThresholds.good;
      flat.speedThresholdAverage = config.speedThresholds.average;
      flat.speedThresholdSlow = config.speedThresholds.slow;
      delete flat.speedThresholds;
    }
    if (config.newWordRatio) {
      flat.newWordRatioDefault = config.newWordRatio.default;
      flat.newWordRatioHighAccuracy = config.newWordRatio.highAccuracy;
      flat.newWordRatioLowAccuracy = config.newWordRatio.lowAccuracy;
      flat.newWordRatioHighAccuracyThreshold = config.newWordRatio.highAccuracyThreshold;
      flat.newWordRatioLowAccuracyThreshold = config.newWordRatio.lowAccuracyThreshold;
      delete flat.newWordRatio;
    }
    return flat;
  }

  /**
   * 获取当前激活的算法配置
   */
  async getAlgorithmConfig(): Promise<import('../types/models').AlgorithmConfig> {
    try {
      const raw = await this.request<any>('/api/algorithm-config');
      return this.normalizeAlgorithmConfig(raw);
    } catch (error) {
      console.error('获取算法配置失败:', error);
      throw error;
    }
  }

  /**
   * 更新算法配置
   */
  async updateAlgorithmConfig(
    configId: string,
    config: Partial<import('../types/models').AlgorithmConfig>,
    changeReason?: string
  ): Promise<import('../types/models').AlgorithmConfig> {
    try {
      const payload = this.denormalizeAlgorithmConfig(config);
      const raw = await this.request<any>('/api/algorithm-config', {
        method: 'PUT',
        body: JSON.stringify({ configId, config: payload, changeReason }),
      });
      return this.normalizeAlgorithmConfig(raw);
    } catch (error) {
      console.error('更新算法配置失败:', error);
      throw error;
    }
  }

  /**
   * 重置算法配置为默认值
   */
  async resetAlgorithmConfig(configId: string): Promise<import('../types/models').AlgorithmConfig> {
    try {
      const raw = await this.request<any>('/api/algorithm-config/reset', {
        method: 'POST',
        body: JSON.stringify({ configId }),
      });
      return this.normalizeAlgorithmConfig(raw);
    } catch (error) {
      console.error('重置算法配置失败:', error);
      throw error;
    }
  }

  /**
   * 获取算法配置历史记录
   */
  async getConfigHistory(limit?: number): Promise<import('../types/models').ConfigHistory[]> {
    try {
      const query = limit ? `?limit=${limit}` : '';
      const raw = await this.request<any[]>(`/api/algorithm-config/history${query}`);
      return raw.map(h => ({
        ...h,
        previousValue: h.previousValue ? this.normalizeAlgorithmConfig(h.previousValue) : {} as any,
        newValue: h.newValue ? this.normalizeAlgorithmConfig(h.newValue) : {} as any,
        timestamp: new Date(h.timestamp).getTime(),
      }));
    } catch (error) {
      console.error('获取配置历史失败:', error);
      throw error;
    }
  }

  /**
   * 删除单词学习状态
   */
  async deleteWordLearningState(wordId: string): Promise<void> {
    try {
      await this.request<void>(`/api/word-states/${wordId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('删除单词学习状态失败:', error);
      throw error;
    }
  }

  // ==================== AMAS API ====================

  /**
   * 处理学习事件，获取自适应学习策略
   */
  async processLearningEvent(
    eventData: import('../types/amas').LearningEventInput
  ): Promise<import('../types/amas').AmasProcessResult> {
    try {
      return await this.request<import('../types/amas').AmasProcessResult>('/api/amas/process', {
        method: 'POST',
        body: JSON.stringify(eventData),
      });
    } catch (error) {
      console.error('处理学习事件失败:', error);
      throw error;
    }
  }

  /**
   * 获取用户当前AMAS状态
   */
  async getAmasState(): Promise<import('../types/amas').UserState | null> {
    try {
      return await this.request<import('../types/amas').UserState>('/api/amas/state');
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        // 状态未初始化，返回null
        return null;
      }
      console.error('获取AMAS状态失败:', error);
      throw error;
    }
  }

  /**
   * 获取用户当前学习策略
   */
  async getAmasStrategy(): Promise<import('../types/amas').LearningStrategy | null> {
    try {
      return await this.request<import('../types/amas').LearningStrategy>('/api/amas/strategy');
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        // 策略未初始化，返回null
        return null;
      }
      console.error('获取AMAS策略失败:', error);
      throw error;
    }
  }

  /**
   * 重置用户AMAS状态
   */
  async resetAmasState(): Promise<void> {
    try {
      await this.request<void>('/api/amas/reset', {
        method: 'POST',
      });
    } catch (error) {
      console.error('重置AMAS状态失败:', error);
      throw error;
    }
  }

  /**
   * 获取用户冷启动阶段
   */
  async getAmasColdStartPhase(): Promise<import('../types/amas').ColdStartPhaseInfo> {
    try {
      return await this.request<import('../types/amas').ColdStartPhaseInfo>('/api/amas/phase');
    } catch (error) {
      console.error('获取冷启动阶段失败:', error);
      throw error;
    }
  }

  /**
   * 批量处理历史学习事件
   */
  async batchProcessEvents(
    events: import('../types/amas').LearningEventInput[]
  ): Promise<import('../types/amas').BatchProcessResult> {
    try {
      return await this.request<import('../types/amas').BatchProcessResult>('/api/amas/batch-process', {
        method: 'POST',
        body: JSON.stringify({ events }),
      });
    } catch (error) {
      console.error('批量处理事件失败:', error);
      throw error;
    }
  }
}


// 导出单例
export default new ApiClient();
