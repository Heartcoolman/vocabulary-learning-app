import { Word, AnswerRecord, WordBook, StudyConfig } from '../types/models';
import { apiLogger } from '../utils/logger';

/**
 * JWT解码后的payload结构
 */
interface JwtPayload {
  userId: string;
  exp: number;
  iat: number;
}

/**
 * API 响应中的 AlgorithmConfig 类型（扁平字段结构）
 * 用于类型安全的 API 响应处理
 */
interface ApiAlgorithmConfig {
  id: string;
  name: string;
  description?: string;
  reviewIntervals?: number[];
  consecutiveCorrectThreshold?: number;
  consecutiveWrongThreshold?: number;
  difficultyAdjustmentInterval?: number;
  priorityWeightNewWord?: number;
  priorityWeightErrorRate?: number;
  priorityWeightOverdueTime?: number;
  priorityWeightWordScore?: number;
  masteryThresholds?: {
    level: number;
    requiredCorrectStreak: number;
    minAccuracy: number;
    minScore: number;
  }[];
  scoreWeightAccuracy?: number;
  scoreWeightSpeed?: number;
  scoreWeightStability?: number;
  scoreWeightProficiency?: number;
  speedThresholdExcellent?: number;
  speedThresholdGood?: number;
  speedThresholdAverage?: number;
  speedThresholdSlow?: number;
  newWordRatioDefault?: number;
  newWordRatioHighAccuracy?: number;
  newWordRatioLowAccuracy?: number;
  newWordRatioHighAccuracyThreshold?: number;
  newWordRatioLowAccuracyThreshold?: number;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

/**
 * API 响应中的 ConfigHistory 类型
 */
interface ApiConfigHistory {
  id: string;
  configId: string;
  changedBy: string;
  changeReason?: string;
  previousValue: ApiAlgorithmConfig | null;
  newValue: ApiAlgorithmConfig | null;
  timestamp: string;
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
  weeklyTrend: number[];
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
 * 与后端 admin.service.ts getUserLearningData 返回结构匹配
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
  recentRecords: Array<AnswerRecord & {
    word: {
      spelling: string;
      phonetic: string;
      meanings: string[];
    };
  }>;
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
 * API 响应中的 WordLearningState 类型（日期字段为字符串）
 */
interface ApiWordLearningState {
  id: string;
  userId: string;
  wordId: string;
  state: string;
  masteryLevel: number;
  easeFactor: number;
  reviewCount: number;
  lastReviewDate: string | null;
  nextReviewDate: string | null;
  currentInterval: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 转换WordLearningState的日期字段为时间戳
 */
function convertLearningStateDates(state: ApiWordLearningState): import('../types/models').WordLearningState {
  return {
    ...state,
    // 将 string 类型的 state 转换为 WordState 枚举
    state: state.state as import('../types/models').WordState,
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
 * API 响应中的 WordScore 类型（日期字段为字符串）
 */
interface ApiWordScore {
  id: string;
  userId: string;
  wordId: string;
  totalScore: number;
  accuracyScore: number;
  speedScore: number;
  stabilityScore: number;
  proficiencyScore: number;
  totalAttempts: number;
  correctAttempts: number;
  averageResponseTime: number;
  averageDwellTime: number;
  recentAccuracy: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 转换WordScore的日期字段为时间戳
 */
function convertWordScoreDates(score: ApiWordScore): import('../types/models').WordScore {
  return {
    ...score,
    createdAt: new Date(score.createdAt).getTime(),
    updatedAt: new Date(score.updatedAt).getTime(),
  };
}

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
 * API请求错误类型
 * 用于区分"数据不存在"和"请求失败"
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isNotFound: boolean;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code || 'UNKNOWN_ERROR';
    this.isNotFound = statusCode === 404;
  }
}

/**
 * API客户端 - 封装所有HTTP请求
 *
 * 安全注意事项：
 * - JWT存储在localStorage中，存在XSS攻击风险
 * - 生产环境建议使用httpOnly cookie存储token（需要后端支持）
 * - 当前实现仅在客户端验证token过期时间，不验证签名
 *
 * 缓解措施：
 * - 设置较短的token过期时间
 * - 实现token刷新机制
 * - 确保应用有充分的XSS防护
 */
/** 默认请求超时时间（毫秒） */
const DEFAULT_TIMEOUT = 30000;

class ApiClient {
  private baseUrl: string;
  private token: string | null;
  private onUnauthorizedCallback: (() => void) | null = null;
  private defaultTimeout: number = DEFAULT_TIMEOUT;

  constructor(baseUrl: string = import.meta.env.VITE_API_URL || '') {
    this.baseUrl = baseUrl;

    // 从localStorage读取token并验证有效性
    // 安全警告：localStorage容易受到XSS攻击，建议生产环境使用httpOnly cookie
    const storedToken = localStorage.getItem('auth_token');
    if (storedToken) {
      // 检查token是否已过期
      if (isTokenExpired(storedToken)) {
        apiLogger.warn('存储的token已过期，已自动清除');
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
   * 从响应体中提取错误信息
   * 优先提取 JSON 格式的 error/message 字段，失败则回退到默认信息
   */
  private async extractErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
    try {
      // 检查响应体是否已被读取
      if (response.bodyUsed) {
        return fallbackMessage;
      }

      // 读取响应文本
      const text = await response.text();
      if (!text || !text.trim()) {
        return fallbackMessage;
      }

      // 尝试解析 JSON
      try {
        const parsed = JSON.parse(text) as { error?: string; message?: string };
        const errorMessage = parsed.error || parsed.message;
        if (typeof errorMessage === 'string' && errorMessage.trim()) {
          return errorMessage.trim();
        }
      } catch {
        // 非 JSON 响应，检查是否为 HTML
        if (text.trim().startsWith('<')) {
          return fallbackMessage;
        }
        // 返回纯文本（截取前 200 字符避免过长）
        return text.trim().substring(0, 200);
      }

      return fallbackMessage;
    } catch {
      return fallbackMessage;
    }
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

    // 如果外部传入了 signal，监听其 abort 事件并联动
    // 修复：保存 handler 引用以便在 finally 中移除，避免内存泄漏
    const abortHandler = () => controller.abort(options.signal!.reason);
    if (options.signal) {
      options.signal.addEventListener('abort', abortHandler);
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal, // 始终使用内部 controller，确保超时控制生效
      });

      // 处理 401 错误，清除令牌并触发回调
      if (response.status === 401) {
        this.clearToken();
        // 触发401回调，通知外部（如AuthContext）更新登录状态
        if (this.onUnauthorizedCallback) {
          this.onUnauthorizedCallback();
        }
        const errorMessage = await this.extractErrorMessage(response, '认证失败，请重新登录');
        throw new ApiError(errorMessage, 401, 'UNAUTHORIZED');
      }

      // 处理空响应（204 No Content 或其他无内容响应）
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        if (!response.ok) {
          throw new ApiError(`请求失败: ${response.status}`, response.status);
        }
        return undefined as T;
      }

      // 检查响应类型是否为 JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        if (!response.ok) {
          throw new ApiError(`请求失败: ${response.status}`, response.status);
        }
        return undefined as T;
      }

      const data: ApiResponse<T> = await response.json();

      if (!response.ok) {
        // 使用ApiError以便调用方区分错误类型
        throw new ApiError(
          data.error || `请求失败: ${response.status}`,
          response.status,
          data.code
        );
      }

      if (!data.success) {
        throw new ApiError(data.error || '请求失败', response.status, data.code);
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
      // 修复：移除外部 signal 的事件监听器，避免内存泄漏
      if (options.signal) {
        options.signal.removeEventListener('abort', abortHandler);
      }
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

    // 如果外部传入了 signal，监听其 abort 事件并联动
    // 修复：保存 handler 引用以便在 finally 中移除，避免内存泄漏
    const abortHandler = () => controller.abort(options.signal!.reason);
    if (options.signal) {
      options.signal.addEventListener('abort', abortHandler);
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal, // 始终使用内部 controller，确保超时控制生效
      });

      if (response.status === 401) {
        this.clearToken();
        if (this.onUnauthorizedCallback) {
          this.onUnauthorizedCallback();
        }
        const errorMessage = await this.extractErrorMessage(response, '认证失败，请重新登录');
        throw new ApiError(errorMessage, 401, 'UNAUTHORIZED');
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
      // 修复：移除外部 signal 的事件监听器，避免内存泄漏
      if (options.signal) {
        options.signal.removeEventListener('abort', abortHandler);
      }
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
   * 获取用户的所有单词（基于选择的词书）
   */
  async getWords(): Promise<Word[]> {
    const apiWords = await this.request<ApiWord[]>('/api/words');
    return apiWords.map(convertApiWord);
  }

  /**
   * 获取用户学过的单词（有学习记录的）
   * 用于掌握度分析页面
   */
  async getLearnedWords(): Promise<Word[]> {
    const apiWords = await this.request<ApiWord[]>('/api/words/learned');
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

  /**
   * 搜索单词
   * @param query 搜索关键词
   * @param limit 返回结果数量限制
   */
  async searchWords(query: string, limit: number = 20): Promise<(Word & { wordBook?: { id: string; name: string; type: string } })[]> {
    const apiWords = await this.request<(ApiWord & { wordBook?: { id: string; name: string; type: string } })[]>(
      `/api/words/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    return apiWords.map(w => ({
      ...convertApiWord(w),
      wordBook: w.wordBook,
    }));
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

    // 默认分页信息：pageSize 使用请求参数或合理默认值（避免空数据时 pageSize 为 0）
    const DEFAULT_PAGE_SIZE = 20;
    const defaultPagination = {
      page: options?.page ?? 1,
      pageSize: options?.pageSize ?? Math.max(records.length, DEFAULT_PAGE_SIZE),
      total: records.length,
      totalPages: 1,
    };

    return {
      records,
      pagination: body.pagination || defaultPagination,
    };
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
   * 获取所有系统词库（管理员）
   * 包括非公开的词库
   */
  async adminGetSystemWordBooks(): Promise<WordBook[]> {
    const apiWordBooks = await this.request<ApiWordBook[]>('/api/admin/wordbooks');
    return apiWordBooks.map(convertApiWordBook);
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
   * 修复：区分"数据不存在"和"请求失败"
   * - 返回null表示数据不存在（404）
   * - 其他错误会被抛出，调用方需要处理
   */
  async getWordLearningState(wordId: string): Promise<import('../types/models').WordLearningState | null> {
    try {
      const state = await this.request<ApiWordLearningState>(`/api/word-states/${wordId}`);
      return state ? convertLearningStateDates(state) : null;
    } catch (error) {
      // 404表示数据不存在，返回null
      if (error instanceof ApiError && error.isNotFound) {
        return null;
      }
      // 其他错误重新抛出，让调用方处理
      apiLogger.error({ err: error, wordId }, '获取单词学习状态失败');
      throw error;
    }
  }

  /**
   * 批量获取单词学习状态
   * 修复：区分"数据不存在"和"请求失败"
   * 修复：正确处理后端返回的 { wordId, state } 格式
   */
  async getWordLearningStates(wordIds: string[]): Promise<import('../types/models').WordLearningState[]> {
    // 空数组直接返回，避免无效请求
    if (!wordIds || wordIds.length === 0) {
      return [];
    }
    try {
      // 后端返回格式: { wordId: string, state: ApiWordLearningState | null }[]
      const response = await this.request<Array<{ wordId: string; state: ApiWordLearningState | null }>>('/api/word-states/batch', {
        method: 'POST',
        body: JSON.stringify({ wordIds }),
      });
      // 过滤掉 state 为 null 的条目，只转换有状态的单词
      return response
        .filter((item): item is { wordId: string; state: ApiWordLearningState } => item.state !== null)
        .map(item => convertLearningStateDates(item.state));
    } catch (error) {
      // 404表示无数据，返回空数组
      if (error instanceof ApiError && error.isNotFound) {
        return [];
      }
      // 其他错误重新抛出
      apiLogger.error({ err: error }, '批量获取单词学习状态失败');
      throw error;
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
      apiLogger.error({ err: error }, '保存单词学习状态失败');
      throw error;
    }
  }

  /**
   * 获取到期需要复习的单词
   */
  async getDueWords(): Promise<import('../types/models').WordLearningState[]> {
    try {
      const states = await this.request<ApiWordLearningState[]>('/api/word-states/due/list');
      return states.map(convertLearningStateDates);
    } catch (error) {
      apiLogger.error({ err: error }, '获取到期单词失败');
      return [];
    }
  }

  /**
   * 按状态获取单词
   */
  async getWordsByState(state: import('../types/models').WordState): Promise<import('../types/models').WordLearningState[]> {
    try {
      const states = await this.request<ApiWordLearningState[]>(`/api/word-states/by-state/${state}`);
      return states.map(convertLearningStateDates);
    } catch (error) {
      apiLogger.error({ err: error }, '按状态获取单词失败');
      return [];
    }
  }

  // ==================== 单词得分相关 ====================

  /**
   * 获取单词得分
   */
  async getWordScore(wordId: string): Promise<import('../types/models').WordScore | null> {
    try {
      const score = await this.request<ApiWordScore>(`/api/word-scores/${wordId}`);
      return score ? convertWordScoreDates(score) : null;
    } catch (error) {
      apiLogger.error({ err: error }, '获取单词得分失败');
      return null;
    }
  }

  /**
   * 批量获取单词得分
   */
  async getWordScores(wordIds: string[]): Promise<import('../types/models').WordScore[]> {
    try {
      const scores = await this.request<ApiWordScore[]>('/api/word-scores/batch', {
        method: 'POST',
        body: JSON.stringify({ wordIds }),
      });
      return scores.map(convertWordScoreDates);
    } catch (error) {
      apiLogger.error({ err: error }, '批量获取单词得分失败');
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
      apiLogger.error({ err: error }, '保存单词得分失败');
      throw error;
    }
  }

  /**
   * 按得分范围获取单词得分
   */
  async getWordsByScoreRange(minScore: number, maxScore: number): Promise<import('../types/models').WordScore[]> {
    try {
      const scores = await this.request<ApiWordScore[]>(`/api/word-scores/range?minScore=${minScore}&maxScore=${maxScore}`);
      return scores.map(convertWordScoreDates);
    } catch (error) {
      apiLogger.error({ err: error }, '按得分范围获取单词失败');
      throw error;
    }
  }

  // ==================== 算法配置相关 ====================

  /**
   * 将后端扁平字段转换为前端嵌套对象
   */
  private normalizeAlgorithmConfig(raw: ApiAlgorithmConfig): import('../types/models').AlgorithmConfig {
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
      const raw = await this.request<ApiAlgorithmConfig>('/api/algorithm-config');
      return this.normalizeAlgorithmConfig(raw);
    } catch (error) {
      apiLogger.error({ err: error }, '获取算法配置失败');
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
      // RESTful风格：configId在URL路径中
      const raw = await this.request<ApiAlgorithmConfig>(`/api/algorithm-config/${configId}`, {
        method: 'PUT',
        body: JSON.stringify({ config: payload, changeReason }),
      });
      return this.normalizeAlgorithmConfig(raw);
    } catch (error) {
      apiLogger.error({ err: error }, '更新算法配置失败');
      throw error;
    }
  }

  /**
   * 重置算法配置为默认值
   */
  async resetAlgorithmConfig(configId: string): Promise<import('../types/models').AlgorithmConfig> {
    try {
      const raw = await this.request<ApiAlgorithmConfig>('/api/algorithm-config/reset', {
        method: 'POST',
        body: JSON.stringify({ configId }),
      });
      return this.normalizeAlgorithmConfig(raw);
    } catch (error) {
      apiLogger.error({ err: error }, '重置算法配置失败');
      throw error;
    }
  }

  /**
   * 获取算法配置历史记录
   */
  async getConfigHistory(limit?: number): Promise<import('../types/models').ConfigHistory[]> {
    try {
      const query = limit ? `?limit=${limit}` : '';
      const raw = await this.request<ApiConfigHistory[]>(`/api/algorithm-config/history${query}`);
      return raw.map(h => ({
        id: h.id,
        configId: h.configId,
        changedBy: h.changedBy,
        changeReason: h.changeReason,
        previousValue: h.previousValue ? this.normalizeAlgorithmConfig(h.previousValue) : {},
        newValue: h.newValue ? this.normalizeAlgorithmConfig(h.newValue) : {},
        timestamp: new Date(h.timestamp).getTime(),
      }));
    } catch (error) {
      apiLogger.error({ err: error }, '获取配置历史失败');
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
      apiLogger.error({ err: error }, '删除单词学习状态失败');
      throw error;
    }
  }

  // ==================== Mastery Learning API ====================

  /**
   * 获取掌握模式的学习单词
   */
  async getMasteryStudyWords(targetCount?: number): Promise<{
    words: Array<{
      id: string;
      spelling: string;
      phonetic: string;
      meanings: string[];
      examples: string[];
      audioUrl?: string;
      isNew: boolean;
    }>;
    meta: {
      mode: string;
      targetCount: number;
      fetchCount: number;
      masteryThreshold: number;
      maxQuestions: number;
    };
  }> {
    const query = targetCount ? `?targetCount=${targetCount}` : '';
    return this.request(`/api/learning/study-words${query}`);
  }

  /**
   * 动态获取下一批学习单词（AMAS驱动的按需加载）
   */
  async getNextWords(params: {
    currentWordIds: string[];
    masteredWordIds: string[];
    sessionId: string;
    count?: number;
  }): Promise<{
    words: Array<{
      id: string;
      spelling: string;
      phonetic: string;
      meanings: string[];
      examples: string[];
      audioUrl?: string;
      difficulty: number;
      isNew: boolean;
    }>;
    strategy: {
      new_ratio: number;
      difficulty: 'easy' | 'mid' | 'hard';
      batch_size: number;
      session_length: number;
      review_ratio: number;
    };
    reason: string;
  }> {
    return this.request('/api/learning/next-words', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * 创建掌握学习会话
   */
  async createMasterySession(targetMasteryCount: number): Promise<{ sessionId: string }> {
    return this.request('/api/learning/session', {
      method: 'POST',
      body: JSON.stringify({ targetMasteryCount }),
    });
  }

  /**
   * 同步学习进度
   */
  async syncMasteryProgress(data: {
    sessionId: string;
    actualMasteryCount: number;
    totalQuestions: number;
  }): Promise<void> {
    return this.request('/api/learning/sync-progress', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * 动态调整学习单词队列
   * 根据用户状态和表现动态调整当前学习的单词
   */
  async adjustLearningWords(
    params: import('../types/amas').AdjustWordsParams
  ): Promise<import('../types/amas').AdjustWordsResponse> {
    return this.request<import('../types/amas').AdjustWordsResponse>('/api/learning/adjust-words', {
      method: 'POST',
      body: JSON.stringify(params),
    });
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
      apiLogger.error({ err: error }, '处理学习事件失败');
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
      if (error instanceof ApiError && error.isNotFound) {
        // 状态未初始化，返回null
        return null;
      }
      apiLogger.error({ err: error }, '获取AMAS状态失败');
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
      if (error instanceof ApiError && error.isNotFound) {
        // 策略未初始化，返回null
        return null;
      }
      apiLogger.error({ err: error }, '获取AMAS策略失败');
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
      apiLogger.error({ err: error }, '重置AMAS状态失败');
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
      apiLogger.error({ err: error }, '获取冷启动阶段失败');
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
      apiLogger.error({ err: error }, '批量处理事件失败');
      throw error;
    }
  }
  // ==================== AMAS 增强功能 API ====================

  /**
   * 获取时间偏好分析
   * Requirements: 1.1, 1.3, 1.5
   */
  async getTimePreferences(): Promise<import('../types/amas-enhanced').TimePreferenceResponse> {
    try {
      return await this.request<import('../types/amas-enhanced').TimePreferenceResponse>('/api/amas/time-preferences');
    } catch (error) {
      apiLogger.error({ err: error }, '获取时间偏好失败');
      throw error;
    }
  }

  /**
   * 检查当前是否为黄金学习时间
   * Requirements: 1.2
   */
  async getGoldenTime(): Promise<import('../types/amas-enhanced').GoldenTimeResult & { message: string }> {
    try {
      return await this.request<import('../types/amas-enhanced').GoldenTimeResult & { message: string }>('/api/amas/golden-time');
    } catch (error) {
      apiLogger.error({ err: error }, '获取黄金时间失败');
      throw error;
    }
  }

  /**
   * 获取当前趋势状态
   * Requirements: 2.1
   */
  async getCurrentTrend(): Promise<import('../types/amas-enhanced').TrendInfo & { stateDescription: string }> {
    try {
      return await this.request<import('../types/amas-enhanced').TrendInfo & { stateDescription: string }>('/api/amas/trend');
    } catch (error) {
      apiLogger.error({ err: error }, '获取趋势状态失败');
      throw error;
    }
  }

  /**
   * 获取趋势历史数据
   * Requirements: 2.3
   */
  async getTrendHistory(days: number = 28): Promise<{
    daily: import('../types/amas-enhanced').TrendHistoryItem[];
    weekly: Array<{
      weekNumber: number;
      startDate: string;
      endDate: string;
      avgAccuracy: number;
      avgResponseTime: number;
      avgMotivation: number;
      dominantState: string;
    }>;
    totalDays: number;
  }> {
    try {
      return await this.request<{
        daily: import('../types/amas-enhanced').TrendHistoryItem[];
        weekly: Array<{
          weekNumber: number;
          startDate: string;
          endDate: string;
          avgAccuracy: number;
          avgResponseTime: number;
          avgMotivation: number;
          dominantState: string;
        }>;
        totalDays: number;
      }>(`/api/amas/trend/history?days=${days}`);
    } catch (error) {
      apiLogger.error({ err: error }, '获取趋势历史失败');
      throw error;
    }
  }

  /**
   * 生成趋势报告
   * Requirements: 2.5
   */
  async getTrendReport(): Promise<import('../types/amas-enhanced').TrendReport> {
    try {
      return await this.request<import('../types/amas-enhanced').TrendReport>('/api/amas/trend/report');
    } catch (error) {
      apiLogger.error({ err: error }, '获取趋势报告失败');
      throw error;
    }
  }

  /**
   * 检查是否需要干预
   * Requirements: 2.2, 2.4
   */
  async getIntervention(): Promise<import('../types/amas-enhanced').InterventionResult> {
    try {
      return await this.request<import('../types/amas-enhanced').InterventionResult>('/api/amas/trend/intervention');
    } catch (error) {
      apiLogger.error({ err: error }, '获取干预建议失败');
      throw error;
    }
  }

  /**
   * 获取用户所有徽章
   * Requirements: 3.2
   */
  async getUserBadges(): Promise<{ badges: import('../types/amas-enhanced').Badge[]; count: number }> {
    try {
      return await this.request<{ badges: import('../types/amas-enhanced').Badge[]; count: number }>('/api/badges');
    } catch (error) {
      apiLogger.error({ err: error }, '获取用户徽章失败');
      throw error;
    }
  }

  /**
   * 获取所有徽章（包含解锁状态）
   */
  async getAllBadgesWithStatus(): Promise<{
    badges: Array<import('../types/amas-enhanced').Badge & { unlocked: boolean }>;
    grouped: Record<string, Array<import('../types/amas-enhanced').Badge & { unlocked: boolean }>>;
    totalCount: number;
    unlockedCount: number;
  }> {
    try {
      return await this.request<{
        badges: Array<import('../types/amas-enhanced').Badge & { unlocked: boolean }>;
        grouped: Record<string, Array<import('../types/amas-enhanced').Badge & { unlocked: boolean }>>;
        totalCount: number;
        unlockedCount: number;
      }>('/api/badges/all');
    } catch (error) {
      apiLogger.error({ err: error }, '获取所有徽章失败');
      throw error;
    }
  }

  /**
   * 获取徽章详情
   * Requirements: 3.5
   */
  async getBadgeDetails(badgeId: string): Promise<import('../types/amas-enhanced').BadgeDefinition & { unlocked: boolean; unlockedAt?: string }> {
    try {
      return await this.request<import('../types/amas-enhanced').BadgeDefinition & { unlocked: boolean; unlockedAt?: string }>(`/api/badges/${badgeId}`);
    } catch (error) {
      apiLogger.error({ err: error }, '获取徽章详情失败');
      throw error;
    }
  }

  /**
   * 获取徽章进度
   * Requirements: 3.5
   */
  async getBadgeProgress(badgeId: string): Promise<import('../types/amas-enhanced').BadgeProgress> {
    try {
      return await this.request<import('../types/amas-enhanced').BadgeProgress>(`/api/badges/${badgeId}/progress`);
    } catch (error) {
      apiLogger.error({ err: error }, '获取徽章进度失败');
      throw error;
    }
  }

  /**
   * 检查并授予新徽章
   * Requirements: 3.1, 3.3, 3.4
   */
  async checkAndAwardBadges(): Promise<{
    newBadges: import('../types/amas-enhanced').NewBadgeResult[];
    hasNewBadges: boolean;
    message: string;
  }> {
    try {
      return await this.request<{
        newBadges: import('../types/amas-enhanced').NewBadgeResult[];
        hasNewBadges: boolean;
        message: string;
      }>('/api/badges/check', { method: 'POST' });
    } catch (error) {
      apiLogger.error({ err: error }, '检查徽章失败');
      throw error;
    }
  }

  /**
   * 获取当前学习计划
   * Requirements: 4.1, 4.4
   */
  async getLearningPlan(): Promise<import('../types/amas-enhanced').LearningPlan | null> {
    try {
      const result = await this.request<import('../types/amas-enhanced').LearningPlan | null>('/api/plan');
      return result;
    } catch (error) {
      // 404表示用户尚未创建学习计划，返回null
      if (error instanceof ApiError && error.isNotFound) {
        return null;
      }
      apiLogger.error({ err: error }, '获取学习计划失败');
      throw error;
    }
  }

  /**
   * 生成学习计划
   * Requirements: 4.1, 4.2, 4.4, 4.5
   */
  async generateLearningPlan(options?: import('../types/amas-enhanced').PlanOptions): Promise<import('../types/amas-enhanced').LearningPlan> {
    try {
      return await this.request<import('../types/amas-enhanced').LearningPlan>('/api/plan/generate', {
        method: 'POST',
        body: JSON.stringify(options || {}),
      });
    } catch (error) {
      apiLogger.error({ err: error }, '生成学习计划失败');
      throw error;
    }
  }

  /**
   * 获取计划进度
   * Requirements: 4.3, 4.4
   */
  async getPlanProgress(): Promise<import('../types/amas-enhanced').PlanProgress & { status: string }> {
    try {
      return await this.request<import('../types/amas-enhanced').PlanProgress & { status: string }>('/api/plan/progress');
    } catch (error) {
      apiLogger.error({ err: error }, '获取计划进度失败');
      throw error;
    }
  }

  /**
   * 调整学习计划
   * Requirements: 4.3
   */
  async adjustLearningPlan(reason?: string): Promise<import('../types/amas-enhanced').LearningPlan> {
    try {
      return await this.request<import('../types/amas-enhanced').LearningPlan>('/api/plan/adjust', {
        method: 'PUT',
        body: JSON.stringify({ reason }),
      });
    } catch (error) {
      apiLogger.error({ err: error }, '调整学习计划失败');
      throw error;
    }
  }

  /**
   * 获取状态历史数据
   * Requirements: 5.1, 5.4
   */
  async getStateHistory(range: import('../types/amas-enhanced').DateRangeOption = 30): Promise<{
    history: import('../types/amas-enhanced').StateHistoryPoint[];
    summary: {
      recordCount: number;
      averages: {
        attention: number;
        fatigue: number;
        motivation: number;
        memory: number;
        speed: number;
        stability: number;
      };
    };
    range: number;
    totalRecords: number;
  }> {
    try {
      return await this.request<{
        history: import('../types/amas-enhanced').StateHistoryPoint[];
        summary: {
          recordCount: number;
          averages: {
            attention: number;
            fatigue: number;
            motivation: number;
            memory: number;
            speed: number;
            stability: number;
          };
        };
        range: number;
        totalRecords: number;
      }>(`/api/amas/history?range=${range}`);
    } catch (error) {
      apiLogger.error({ err: error }, '获取状态历史失败');
      throw error;
    }
  }

  /**
   * 获取认知成长对比
   * Requirements: 5.3
   */
  async getCognitiveGrowth(range: import('../types/amas-enhanced').DateRangeOption = 30): Promise<{
    current: import('../types/amas-enhanced').CognitiveProfile;
    past: import('../types/amas-enhanced').CognitiveProfile;
    changes: {
      memory: { value: number; percent: number; direction: 'up' | 'down' };
      speed: { value: number; percent: number; direction: 'up' | 'down' };
      stability: { value: number; percent: number; direction: 'up' | 'down' };
    };
    period: number;
    periodLabel: string;
  }> {
    try {
      return await this.request<{
        current: import('../types/amas-enhanced').CognitiveProfile;
        past: import('../types/amas-enhanced').CognitiveProfile;
        changes: {
          memory: { value: number; percent: number; direction: 'up' | 'down' };
          speed: { value: number; percent: number; direction: 'up' | 'down' };
          stability: { value: number; percent: number; direction: 'up' | 'down' };
        };
        period: number;
        periodLabel: string;
      }>(`/api/amas/growth?range=${range}`);
    } catch (error) {
      apiLogger.error({ err: error }, '获取认知成长失败');
      throw error;
    }
  }

  /**
   * 获取显著变化
   * Requirements: 5.5
   */
  async getSignificantChanges(range: import('../types/amas-enhanced').DateRangeOption = 30): Promise<{
    changes: Array<import('../types/amas-enhanced').SignificantChange & { description: string }>;
    range: number;
    hasSignificantChanges: boolean;
    summary: string;
  }> {
    try {
      return await this.request<{
        changes: Array<import('../types/amas-enhanced').SignificantChange & { description: string }>;
        range: number;
        hasSignificantChanges: boolean;
        summary: string;
      }>(`/api/amas/changes?range=${range}`);
    } catch (error) {
      apiLogger.error({ err: error }, '获取显著变化失败');
      throw error;
    }
  }

  // ==================== Word Mastery Analytics APIs ====================

  /**
   * 获取用户整体精通度统计
   * GET /api/word-mastery/stats
   */
  async getWordMasteryStats(): Promise<import('../types/word-mastery').UserMasteryStats> {
    try {
      return await this.request<import('../types/word-mastery').UserMasteryStats>('/api/word-mastery/stats');
    } catch (error) {
      apiLogger.error({ err: error }, '获取单词精通度统计失败');
      throw error;
    }
  }

  /**
   * 批量获取单词精通度评估
   * POST /api/word-mastery/batch
   * @param wordIds 单词ID数组（最多100个，不能为空）
   * @param userFatigue 用户疲劳度 0-1（可选）
   */
  async batchProcessWordMastery(
    wordIds: string[],
    userFatigue?: number
  ): Promise<import('../types/word-mastery').MasteryEvaluation[]> {
    try {
      // 客户端验证
      if (!Array.isArray(wordIds) || wordIds.length === 0) {
        throw new Error('wordIds 必须是非空数组');
      }
      if (wordIds.length > 100) {
        throw new Error('wordIds 数组不能超过100个');
      }
      // 验证所有元素都是非空字符串
      if (!wordIds.every(id => typeof id === 'string' && id.trim().length > 0)) {
        throw new Error('wordIds 中所有元素必须是非空字符串');
      }
      if (userFatigue !== undefined && (typeof userFatigue !== 'number' || userFatigue < 0 || userFatigue > 1)) {
        throw new Error('userFatigue 必须是 0-1 之间的数字');
      }

      return await this.request<import('../types/word-mastery').MasteryEvaluation[]>('/api/word-mastery/batch', {
        method: 'POST',
        body: JSON.stringify({ wordIds, userFatigue }),
      });
    } catch (error) {
      apiLogger.error({ err: error }, '批量处理单词精通度失败');
      throw error;
    }
  }

  /**
   * 获取单词精通度评估
   * GET /api/word-mastery/:wordId
   * @param wordId 单词ID（必填）
   * @param userFatigue 用户疲劳度 0-1（可选）
   */
  async getWordMasteryDetail(
    wordId: string,
    userFatigue?: number
  ): Promise<import('../types/word-mastery').MasteryEvaluation> {
    try {
      // 客户端验证
      if (!wordId || typeof wordId !== 'string' || wordId.trim().length === 0) {
        throw new Error('wordId 必须是非空字符串');
      }
      if (userFatigue !== undefined && (typeof userFatigue !== 'number' || userFatigue < 0 || userFatigue > 1)) {
        throw new Error('userFatigue 必须是 0-1 之间的数字');
      }

      const queryParams = new URLSearchParams();
      if (userFatigue !== undefined) {
        queryParams.append('userFatigue', userFatigue.toString());
      }
      const query = queryParams.toString();

      return await this.request<import('../types/word-mastery').MasteryEvaluation>(
        `/api/word-mastery/${wordId}${query ? `?${query}` : ''}`
      );
    } catch (error) {
      apiLogger.error({ err: error }, '获取单词精通度详情失败');
      throw error;
    }
  }

  /**
   * 获取单词学习轨迹
   * GET /api/word-mastery/:wordId/trace
   * @param wordId 单词ID（必填）
   * @param limit 返回记录数限制（可选，默认50，范围1-100）
   */
  async getWordMasteryTrace(
    wordId: string,
    limit?: number
  ): Promise<import('../types/word-mastery').WordMasteryTrace> {
    try {
      // 客户端验证
      if (!wordId || typeof wordId !== 'string' || wordId.trim().length === 0) {
        throw new Error('wordId 必须是非空字符串');
      }
      if (limit !== undefined && (typeof limit !== 'number' || limit < 1 || limit > 100)) {
        throw new Error('limit 必须是 1-100 之间的整数');
      }

      const queryParams = new URLSearchParams();
      if (limit !== undefined) {
        queryParams.append('limit', Math.floor(limit).toString());
      }
      const query = queryParams.toString();

      return await this.request<import('../types/word-mastery').WordMasteryTrace>(
        `/api/word-mastery/${wordId}/trace${query ? `?${query}` : ''}`
      );
    } catch (error) {
      apiLogger.error({ err: error }, '获取单词学习轨迹失败');
      throw error;
    }
  }

  /**
   * 预测最佳复习间隔
   * GET /api/word-mastery/:wordId/interval
   * @param wordId 单词ID（必填）
   * @param targetRecall 目标提取概率（可选，默认0.9，范围0-1之间）
   */
  async getWordMasteryInterval(
    wordId: string,
    targetRecall?: number
  ): Promise<import('../types/word-mastery').WordMasteryIntervalResponse> {
    try {
      // 客户端验证
      if (!wordId || typeof wordId !== 'string' || wordId.trim().length === 0) {
        throw new Error('wordId 必须是非空字符串');
      }
      if (targetRecall !== undefined && (typeof targetRecall !== 'number' || targetRecall <= 0 || targetRecall >= 1)) {
        throw new Error('targetRecall 必须是大于0小于1的数字');
      }

      const queryParams = new URLSearchParams();
      if (targetRecall !== undefined) {
        queryParams.append('targetRecall', targetRecall.toString());
      }
      const query = queryParams.toString();

      return await this.request<import('../types/word-mastery').WordMasteryIntervalResponse>(
        `/api/word-mastery/${wordId}/interval${query ? `?${query}` : ''}`
      );
    } catch (error) {
      apiLogger.error({ err: error }, '获取复习间隔预测失败');
      throw error;
    }
  }

  // ==================== Habit Profile APIs ====================

  /**
   * 获取用户习惯画像
   * GET /api/habit-profile
   * 返回数据库中存储的画像和内存中实时计算的画像
   */
  async getHabitProfile(): Promise<import('../types/habit-profile').HabitProfileResponse> {
    try {
      return await this.request<import('../types/habit-profile').HabitProfileResponse>('/api/habit-profile');
    } catch (error) {
      apiLogger.error({ err: error }, '获取习惯画像失败');
      throw error;
    }
  }

  /**
   * 从历史记录初始化习惯画像
   * POST /api/habit-profile/initialize
   * 用于数据恢复或首次生成习惯画像
   */
  async initializeHabitProfile(): Promise<import('../types/habit-profile').InitializeProfileResponse> {
    try {
      return await this.request<import('../types/habit-profile').InitializeProfileResponse>(
        '/api/habit-profile/initialize',
        { method: 'POST' }
      );
    } catch (error) {
      apiLogger.error({ err: error }, '初始化习惯画像失败');
      throw error;
    }
  }

  /**
   * 结束学习会话并持久化习惯画像
   * POST /api/habit-profile/end-session
   * @param sessionId 学习会话ID（必填）
   */
  async endHabitSession(sessionId: string): Promise<import('../types/habit-profile').EndSessionResponse> {
    try {
      // 客户端验证
      if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
        throw new Error('sessionId 必须是非空字符串');
      }

      return await this.request<import('../types/habit-profile').EndSessionResponse>(
        '/api/habit-profile/end-session',
        {
          method: 'POST',
          body: JSON.stringify({ sessionId }),
        }
      );
    } catch (error) {
      apiLogger.error({ err: error }, '结束学习会话失败');
      throw error;
    }
  }

  /**
   * 手动触发习惯画像持久化
   * POST /api/habit-profile/persist
   * 将内存中的习惯画像保存到数据库
   */
  async persistHabitProfile(): Promise<import('../types/habit-profile').PersistProfileResponse> {
    try {
      return await this.request<import('../types/habit-profile').PersistProfileResponse>(
        '/api/habit-profile/persist',
        { method: 'POST' }
      );
    } catch (error) {
      apiLogger.error({ err: error }, '持久化习惯画像失败');
      throw error;
    }
  }

  // ==================== Explainability APIs ====================

  /**
   * 获取AMAS决策解释
   * GET /api/amas/explain-decision
   * @param decisionId 决策ID（可选，不传则使用最近一次决策）
   */
  async getAmasDecisionExplanation(decisionId?: string): Promise<import('../types/explainability').DecisionExplanation> {
    try {
      const queryParams = new URLSearchParams();
      if (decisionId) {
        queryParams.append('decisionId', decisionId);
      }
      const query = queryParams.toString();

      return await this.request<import('../types/explainability').DecisionExplanation>(
        `/api/amas/explain-decision${query ? `?${query}` : ''}`
      );
    } catch (error) {
      apiLogger.error({ err: error }, '获取决策解释失败');
      throw error;
    }
  }

  /**
   * 运行反事实分析
   * POST /api/amas/counterfactual
   * @param input 反事实输入参数
   */
  async runCounterfactualAnalysis(input: import('../types/explainability').CounterfactualInput): Promise<import('../types/explainability').CounterfactualResult> {
    try {
      return await this.request<import('../types/explainability').CounterfactualResult>(
        '/api/amas/counterfactual',
        {
          method: 'POST',
          body: JSON.stringify(input),
        }
      );
    } catch (error) {
      apiLogger.error({ err: error }, '反事实分析失败');
      throw error;
    }
  }

  /**
   * 获取学习曲线数据
   * GET /api/amas/learning-curve
   * @param days 查询天数，默认30天
   */
  async getAmasLearningCurve(days: number = 30): Promise<import('../types/explainability').LearningCurveData> {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('days', days.toString());

      return await this.request<import('../types/explainability').LearningCurveData>(
        `/api/amas/learning-curve?${queryParams.toString()}`
      );
    } catch (error) {
      apiLogger.error({ err: error }, '获取学习曲线失败');
      throw error;
    }
  }

  /**
   * 获取决策时间线
   * GET /api/amas/decision-timeline
   * @param limit 返回数量限制
   * @param cursor 分页游标
   */
  async getDecisionTimeline(limit: number = 50, cursor?: string): Promise<import('../types/explainability').DecisionTimelineResponse> {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('limit', limit.toString());
      if (cursor) {
        queryParams.append('cursor', cursor);
      }

      return await this.request<import('../types/explainability').DecisionTimelineResponse>(
        `/api/amas/decision-timeline?${queryParams.toString()}`
      );
    } catch (error) {
      apiLogger.error({ err: error }, '获取决策时间线失败');
      throw error;
    }
  }

  async batchImportWords(
    wordBookId: string,
    words: Array<{
      spelling: string;
      phonetic: string;
      meanings: string[];
      examples: string[];
      audioUrl?: string;
    }>
  ): Promise<{ imported: number; failed: number; errors?: string[] }> {
    if (!wordBookId || typeof wordBookId !== 'string' || wordBookId.trim().length === 0) {
      throw new Error('wordBookId 必须是非空字符串');
    }
    if (!Array.isArray(words) || words.length === 0) {
      throw new Error('words 必须是非空数组');
    }
    if (words.length > 1000) {
      throw new Error('单次导入不能超过1000个单词');
    }

    try {
      return await this.request<{ imported: number; failed: number; errors?: string[] }>(
        `/api/wordbooks/${wordBookId}/words/batch`,
        {
          method: 'POST',
          body: JSON.stringify({ words }),
        }
      );
    } catch (error) {
      apiLogger.error({ err: error }, '批量导入单词失败');
      throw error;
    }
  }

  // ==================== 优化 API (管理员) ====================

  /**
   * 获取下一个推荐参数组合
   * GET /api/optimization/suggest
   */
  async getOptimizationSuggestion(): Promise<{
    params: Record<string, number>;
    paramSpace: Record<string, { min: number; max: number; step: number }>;
  }> {
    return this.request('/api/optimization/suggest');
  }

  /**
   * 记录参数评估结果
   * POST /api/optimization/evaluate
   */
  async recordOptimizationEvaluation(
    params: Record<string, number>,
    value: number
  ): Promise<{ recorded: boolean }> {
    return this.request('/api/optimization/evaluate', {
      method: 'POST',
      body: JSON.stringify({ params, value }),
    });
  }

  /**
   * 获取当前最优参数
   * GET /api/optimization/best
   */
  async getBestOptimizationParams(): Promise<{
    params: Record<string, number> | null;
    value: number | null;
  }> {
    return this.request('/api/optimization/best');
  }

  /**
   * 获取优化历史
   * GET /api/optimization/history
   */
  async getOptimizationHistory(): Promise<Array<{
    params: Record<string, number>;
    value: number;
    timestamp: string;
  }>> {
    return this.request('/api/optimization/history');
  }

  /**
   * 手动触发优化周期
   * POST /api/optimization/trigger
   */
  async triggerOptimization(): Promise<{
    triggered: boolean;
    result?: Record<string, unknown>;
  }> {
    return this.request('/api/optimization/trigger', { method: 'POST' });
  }

  /**
   * 重置优化器状态
   * POST /api/optimization/reset
   */
  async resetOptimizer(): Promise<{ reset: boolean }> {
    return this.request('/api/optimization/reset', { method: 'POST' });
  }

  /**
   * 获取优化器诊断信息
   * GET /api/optimization/diagnostics
   */
  async getOptimizationDiagnostics(): Promise<Record<string, unknown>> {
    return this.request('/api/optimization/diagnostics');
  }

  // ==================== 评估 API ====================

  /**
   * 记录因果观测数据
   * POST /api/evaluation/causal/observe
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
   * 获取平均处理效应估计 (管理员)
   * GET /api/evaluation/causal/ate
   */
  async getCausalATE(): Promise<{
    ate: number;
    confidence: number;
    sampleSize: number;
  }> {
    return this.request('/api/evaluation/causal/ate');
  }

  /**
   * 比较两个策略的效果 (管理员)
   * GET /api/evaluation/causal/compare
   */
  async compareStrategies(
    strategyA: number,
    strategyB: number
  ): Promise<{
    difference: number;
    pValue: number;
    significant: boolean;
  }> {
    return this.request(`/api/evaluation/causal/compare?strategyA=${strategyA}&strategyB=${strategyB}`);
  }

  /**
   * 获取因果推断诊断信息 (管理员)
   * GET /api/evaluation/causal/diagnostics
   */
  async getCausalDiagnostics(): Promise<{
    mean: number;
    std: number;
    median: number;
    treatmentMean: number;
    controlMean: number;
    overlap: number;
    auc: number;
  }> {
    return this.request('/api/evaluation/causal/diagnostics');
  }

  /**
   * 获取用户的 A/B 测试变体分配
   * GET /api/evaluation/variant/:experimentId
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
   * POST /api/evaluation/variant/:experimentId/metric
   */
  async recordExperimentMetric(
    experimentId: string,
    reward: number
  ): Promise<{ recorded: boolean }> {
    return this.request(`/api/evaluation/variant/${experimentId}/metric`, {
      method: 'POST',
      body: JSON.stringify({ reward }),
    });
  }

  // ==================== 用户配置 API ====================

  /**
   * 获取用户奖励配置（学习模式）
   * GET /api/users/profile/reward
   */
  async getUserRewardProfile(): Promise<{
    currentProfile: string;
    availableProfiles: Array<{
      id: string;
      name: string;
      description: string;
    }>;
  }> {
    return this.request('/api/users/profile/reward');
  }

  /**
   * 更新用户奖励配置（学习模式）
   * PUT /api/users/profile/reward
   */
  async updateUserRewardProfile(profileId: string): Promise<{
    currentProfile: string;
    message: string;
  }> {
    return this.request('/api/users/profile/reward', {
      method: 'PUT',
      body: JSON.stringify({ profileId }),
    });
  }

  // ==================== Experiments API (Admin) ====================

  /**
   * 获取实验状态（管理员）
   * GET /api/experiments/:experimentId/status
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

  // ==================== Cognitive Profiling API ====================

  /**
   * 获取用户Chronotype画像
   * GET /api/users/profile/chronotype
   */
  async getChronotypeProfile(): Promise<{
    category: 'morning' | 'evening' | 'intermediate';
    peakHours: number[];
    confidence: number;
    learningHistory: Array<{
      hour: number;
      performance: number;
      sampleCount: number;
    }>;
  }> {
    return this.request('/api/users/profile/chronotype');
  }

  /**
   * 获取用户Learning Style画像
   * GET /api/users/profile/learning-style
   */
  async getLearningStyleProfile(): Promise<{
    style: 'visual' | 'auditory' | 'kinesthetic' | 'mixed';
    confidence: number;
    scores: {
      visual: number;
      auditory: number;
      kinesthetic: number;
    };
  }> {
    return this.request('/api/users/profile/learning-style');
  }

  /**
   * 获取用户完整认知画像（Chronotype + Learning Style）
   * GET /api/users/profile/cognitive
   */
  async getCognitiveProfile(): Promise<{
    chronotype: {
      category: 'morning' | 'evening' | 'intermediate';
      peakHours: number[];
      confidence: number;
      learningHistory: Array<{
        hour: number;
        performance: number;
        sampleCount: number;
      }>;
    };
    learningStyle: {
      style: 'visual' | 'auditory' | 'kinesthetic' | 'mixed';
      confidence: number;
      scores: {
        visual: number;
        auditory: number;
        kinesthetic: number;
      };
    };
  }> {
    return this.request('/api/users/profile/cognitive');
  }

  // ==================== Learning Objectives ====================

  /**
   * 获取用户学习目标配置
   * GET /api/learning-objectives
   */
  async getLearningObjectives() {
    return this.request<{
      userId: string;
      mode: 'exam' | 'daily' | 'travel' | 'custom';
      primaryObjective: 'accuracy' | 'retention' | 'efficiency';
      minAccuracy?: number;
      maxDailyTime?: number;
      targetRetention?: number;
      weightShortTerm: number;
      weightLongTerm: number;
      weightEfficiency: number;
    }>('/api/learning-objectives');
  }

  /**
   * 更新学习目标配置
   * PUT /api/learning-objectives
   */
  async updateLearningObjectives(objectives: {
    mode: 'exam' | 'daily' | 'travel' | 'custom';
    primaryObjective: 'accuracy' | 'retention' | 'efficiency';
    minAccuracy?: number;
    maxDailyTime?: number;
    targetRetention?: number;
    weightShortTerm: number;
    weightLongTerm: number;
    weightEfficiency: number;
  }) {
    return this.request('/api/learning-objectives', {
      method: 'PUT',
      body: JSON.stringify(objectives),
    });
  }

  /**
   * 切换学习模式
   * POST /api/learning-objectives/switch-mode
   */
  async switchLearningMode(mode: 'exam' | 'daily' | 'travel' | 'custom', reason?: string) {
    return this.request('/api/learning-objectives/switch-mode', {
      method: 'POST',
      body: JSON.stringify({ mode, reason }),
    });
  }

  /**
   * 获取模式建议
   * GET /api/learning-objectives/suggestions
   */
  async getLearningObjectiveSuggestions() {
    return this.request<{
      currentMode: 'exam' | 'daily' | 'travel' | 'custom';
      suggestedModes: Array<{
        mode: 'exam' | 'daily' | 'travel' | 'custom';
        reason: string;
        config: any;
      }>;
    }>('/api/learning-objectives/suggestions');
  }

  /**
   * 获取目标切换历史
   * GET /api/learning-objectives/history
   */
  async getLearningObjectiveHistory(limit: number = 10) {
    return this.request<
      Array<{
        timestamp: string;
        reason: string;
        beforeMode: string;
        afterMode: string;
      }>
    >(`/api/learning-objectives/history?limit=${limit}`);
  }

  /**
   * 删除学习目标配置
   * DELETE /api/learning-objectives
   */
  async deleteLearningObjectives() {
    return this.request('/api/learning-objectives', {
      method: 'DELETE',
    });
  }

  // ==================== Admin AMAS Decisions ====================

  /**
   * 获取用户决策列表
   * GET /api/admin/users/:userId/decisions
   */
  async adminGetUserDecisions(userId: string, params: {
    page: number;
    pageSize: number;
    startDate?: string;
    endDate?: string;
    decisionSource?: string;
    minConfidence?: number;
    sortBy?: 'timestamp' | 'confidence' | 'duration';
    sortOrder?: 'asc' | 'desc';
  }) {
    const query = new URLSearchParams();
    query.append('page', params.page.toString());
    query.append('pageSize', params.pageSize.toString());
    if (params.startDate) query.append('startDate', params.startDate);
    if (params.endDate) query.append('endDate', params.endDate);
    if (params.decisionSource) query.append('decisionSource', params.decisionSource);
    if (params.minConfidence !== undefined) query.append('minConfidence', params.minConfidence.toString());
    if (params.sortBy) query.append('sortBy', params.sortBy);
    if (params.sortOrder) query.append('sortOrder', params.sortOrder);

    return this.request(`/api/admin/users/${userId}/decisions?${query.toString()}`);
  }

  /**
   * 获取决策详情
   * GET /api/admin/users/:userId/decisions/:decisionId
   */
  async adminGetDecisionDetail(userId: string, decisionId: string) {
    return this.request(`/api/admin/users/${userId}/decisions/${decisionId}`);
  }

  // ==================== LLM Advisor ====================

  /**
   * 获取 LLM 配置状态
   * GET /api/llm-advisor/config
   */
  async getLLMAdvisorConfig(): Promise<LLMAdvisorConfigResponse> {
    return this.request<LLMAdvisorConfigResponse>('/api/llm-advisor/config');
  }

  /**
   * 检查 LLM 健康状态
   * GET /api/llm-advisor/health
   */
  async checkLLMAdvisorHealth(): Promise<LLMAdvisorHealthResponse> {
    return this.request<LLMAdvisorHealthResponse>('/api/llm-advisor/health');
  }

  /**
   * 获取建议列表
   * GET /api/llm-advisor/suggestions
   */
  async getLLMAdvisorSuggestions(params?: {
    status?: 'pending' | 'approved' | 'rejected' | 'partial';
    limit?: number;
    offset?: number;
  }): Promise<LLMAdvisorSuggestionsResponse> {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.limit !== undefined) query.append('limit', params.limit.toString());
    if (params?.offset !== undefined) query.append('offset', params.offset.toString());
    const queryStr = query.toString();
    return this.request<LLMAdvisorSuggestionsResponse>(`/api/llm-advisor/suggestions${queryStr ? `?${queryStr}` : ''}`);
  }

  /**
   * 获取单个建议详情
   * GET /api/llm-advisor/suggestions/:id
   */
  async getLLMAdvisorSuggestion(id: string): Promise<LLMStoredSuggestion> {
    return this.request<LLMStoredSuggestion>(`/api/llm-advisor/suggestions/${id}`);
  }

  /**
   * 审批通过建议
   * POST /api/llm-advisor/suggestions/:id/approve
   */
  async approveLLMAdvisorSuggestion(
    id: string,
    selectedItems: string[],
    notes?: string
  ): Promise<LLMStoredSuggestion> {
    return this.request<LLMStoredSuggestion>(`/api/llm-advisor/suggestions/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ selectedItems, notes })
    });
  }

  /**
   * 拒绝建议
   * POST /api/llm-advisor/suggestions/:id/reject
   */
  async rejectLLMAdvisorSuggestion(id: string, notes?: string): Promise<LLMStoredSuggestion> {
    return this.request<LLMStoredSuggestion>(`/api/llm-advisor/suggestions/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ notes })
    });
  }

  /**
   * 手动触发 LLM 分析
   * POST /api/llm-advisor/trigger
   */
  async triggerLLMAdvisorAnalysis(): Promise<LLMAdvisorTriggerResponse> {
    return this.request<LLMAdvisorTriggerResponse>('/api/llm-advisor/trigger', { method: 'POST' });
  }

  /**
   * 获取最新建议
   * GET /api/llm-advisor/latest
   */
  async getLatestLLMAdvisorSuggestion(): Promise<LLMStoredSuggestion | null> {
    return this.request<LLMStoredSuggestion | null>('/api/llm-advisor/latest');
  }

  /**
   * 获取待审核数量
   * GET /api/llm-advisor/pending-count
   */
  async getLLMAdvisorPendingCount(): Promise<LLMAdvisorPendingCountResponse> {
    return this.request<LLMAdvisorPendingCountResponse>('/api/llm-advisor/pending-count');
  }
}


// 导出单例
export default new ApiClient();
