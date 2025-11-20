import { Word, AnswerRecord } from '../types/models';

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
 * API客户端 - 封装所有HTTP请求
 */
class ApiClient {
  private baseUrl: string;
  private token: string | null;

  constructor(baseUrl: string = import.meta.env.VITE_API_URL || 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem('auth_token');
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
   * 通用请求方法
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
      });

      const data: ApiResponse<T> = await response.json();

      if (!response.ok) {
        // 如果是401错误，清除令牌
        if (response.status === 401) {
          this.clearToken();
        }
        throw new Error(data.error || `请求失败: ${response.status}`);
      }

      if (!data.success) {
        throw new Error(data.error || '请求失败');
      }

      return data.data as T;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('网络请求失败');
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
    return this.request<Word[]>('/api/words');
  }

  /**
   * 添加新单词
   */
  async createWord(wordData: Omit<Word, 'id' | 'createdAt' | 'updatedAt'>): Promise<Word> {
    return this.request<Word>('/api/words', {
      method: 'POST',
      body: JSON.stringify(wordData),
    });
  }

  /**
   * 更新单词
   */
  async updateWord(wordId: string, wordData: Partial<Omit<Word, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Word> {
    return this.request<Word>(`/api/words/${wordId}`, {
      method: 'PUT',
      body: JSON.stringify(wordData),
    });
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
    return this.request<Word[]>('/api/words/batch', {
      method: 'POST',
      body: JSON.stringify({ words }),
    });
  }

  // ==================== 学习记录相关 ====================

  /**
   * 获取学习记录
   */
  async getRecords(): Promise<AnswerRecord[]> {
    const records = await this.request<any[]>('/api/records');

    // 后端返回的是 Date 字符串，这里统一转换为时间戳（毫秒）以与本地模型对齐
    return records.map(record => ({
      ...record,
      timestamp: typeof record.timestamp === 'string'
        ? new Date(record.timestamp).getTime()
        : record.timestamp,
    })) as AnswerRecord[];
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
}

// 导出单例
export default new ApiClient();
