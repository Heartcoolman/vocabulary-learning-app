import { BaseClient } from '../base/BaseClient';

/**
 * 用户信息
 */
export interface User {
  id: string;
  email: string;
  username: string;
  role: 'USER' | 'ADMIN' | 'BANNED';
  rewardProfile: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 认证响应
 */
export interface AuthResponse {
  user: User;
  token: string;
}

/**
 * 学习统计
 */
export interface Statistics {
  totalWords: number;
  totalRecords: number;
  correctRate: number;
  recentRecords: Array<{
    id: string;
    userId: string;
    wordId: string;
    selectedAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    timestamp: string;
    responseTime?: number;
    dwellTime?: number;
    sessionId?: string;
    word: {
      id: string;
      word: string;
      definition: string;
    };
  }>;
}

/**
 * AuthClient - 认证和用户管理相关API
 *
 * 职责：
 * - 用户注册、登录、登出
 * - 获取当前用户信息
 * - 修改密码
 * - 获取用户统计
 */
export class AuthClient extends BaseClient {
  constructor(baseUrl?: string) {
    super(baseUrl);
  }

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

  async updateProfile(data: { username?: string }): Promise<User> {
    return this.request<User>('/api/users/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    return this.request<void>('/api/auth/password/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    return this.request<void>('/api/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    });
  }

  /**
   * 获取用户统计信息
   */
  async getUserStatistics(): Promise<Statistics> {
    return this.request<Statistics>('/api/records/statistics');
  }

  /**
   * 上传用户头像
   */
  async uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
    const formData = new FormData();
    formData.append('avatar', file);

    const response = await fetch(`${this.baseUrl}/api/users/me/avatar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.tokenManager.getToken()}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(error.message || 'Avatar upload failed');
    }

    return response.json();
  }

  /**
   * 设置认证令牌
   */
  setToken(token: string): void {
    this.tokenManager.setToken(token);
  }

  /**
   * 清除认证令牌
   */
  clearToken(): void {
    this.tokenManager.clearToken();
  }

  /**
   * 获取当前令牌
   */
  getToken(): string | null {
    return this.tokenManager.getToken();
  }
}
