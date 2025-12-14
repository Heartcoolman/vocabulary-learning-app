/**
 * UserProfile API适配器
 * 封装用户画像相关的API调用
 */

import type { RequestOptions } from '../types/common';
import type {
  User,
  UserProfile,
  HabitProfile,
  CognitiveProfile,
  UserLearningProfile,
  UserStatistics,
  UpdatePasswordDto,
  UpdateHabitProfileParams,
  UpdateLearningProfileParams,
} from '../types/user-profile';
import { ApiClient } from './base-client';

/**
 * UserProfile API适配器类
 */
export class UserProfileAdapter {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  // ==================== 用户基础信息管理 ====================

  /**
   * 获取用户信息
   */
  async getUserById(userId: string, options?: RequestOptions): Promise<User> {
    const response = await this.client.get<User>(`/user/${userId}`, options);
    return response.data!;
  }

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(options?: RequestOptions): Promise<User> {
    const response = await this.client.get<User>('/user/me', options);
    return response.data!;
  }

  /**
   * 更新用户基本信息
   */
  async updateUser(
    userId: string,
    data: Partial<{ username: string; email: string }>,
    options?: RequestOptions,
  ): Promise<User> {
    const response = await this.client.put<User>(`/user/${userId}`, data, options);
    return response.data!;
  }

  /**
   * 更新用户密码
   */
  async updatePassword(
    userId: string,
    data: UpdatePasswordDto,
    options?: RequestOptions,
  ): Promise<void> {
    await this.client.post(`/user/${userId}/password`, data, options);
  }

  /**
   * 获取用户学习统计信息
   */
  async getUserStatistics(userId: string, options?: RequestOptions): Promise<UserStatistics> {
    const response = await this.client.get<UserStatistics>(`/user/${userId}/statistics`, options);
    return response.data!;
  }

  /**
   * 更新用户奖励配置
   */
  async updateRewardProfile(
    userId: string,
    profileId: string,
    options?: RequestOptions,
  ): Promise<User> {
    const response = await this.client.put<User>(
      `/user/${userId}/reward-profile`,
      { profileId },
      options,
    );
    return response.data!;
  }

  // ==================== 用户画像管理 ====================

  /**
   * 获取完整用户画像
   */
  async getUserProfile(
    userId: string,
    options?: {
      includeHabit?: boolean;
      includeCognitive?: boolean;
      includeLearning?: boolean;
    } & RequestOptions,
  ): Promise<UserProfile> {
    const {
      includeHabit = true,
      includeCognitive = true,
      includeLearning = true,
      ...requestOptions
    } = options || {};

    const response = await this.client.get<UserProfile>(`/profile/${userId}`, {
      ...requestOptions,
      params: {
        includeHabit,
        includeCognitive,
        includeLearning,
        ...requestOptions.params,
      },
    });

    return response.data!;
  }

  /**
   * 更新学习习惯画像
   */
  async updateHabitProfile(
    userId: string,
    params?: UpdateHabitProfileParams,
    options?: RequestOptions,
  ): Promise<HabitProfile> {
    const response = await this.client.put<HabitProfile>(
      `/profile/${userId}/habit`,
      params || {},
      options,
    );
    return response.data!;
  }

  /**
   * 获取认知画像
   */
  async getCognitiveProfile(userId: string, options?: RequestOptions): Promise<CognitiveProfile> {
    const response = await this.client.get<CognitiveProfile>(
      `/profile/${userId}/cognitive`,
      options,
    );
    return response.data!;
  }

  /**
   * 使认知画像缓存失效
   */
  async invalidateCognitiveCache(userId: string, options?: RequestOptions): Promise<void> {
    await this.client.post(`/profile/${userId}/cognitive/invalidate`, {}, options);
  }

  /**
   * 获取学习档案
   */
  async getUserLearningProfile(
    userId: string,
    options?: RequestOptions,
  ): Promise<UserLearningProfile> {
    const response = await this.client.get<UserLearningProfile>(
      `/profile/${userId}/learning`,
      options,
    );
    return response.data!;
  }

  /**
   * 更新学习档案
   */
  async updateUserLearningProfile(
    userId: string,
    params: UpdateLearningProfileParams,
    options?: RequestOptions,
  ): Promise<UserLearningProfile> {
    const response = await this.client.put<UserLearningProfile>(
      `/profile/${userId}/learning`,
      params,
      options,
    );
    return response.data!;
  }

  // ==================== 习惯记录 ====================

  /**
   * 记录学习时间事件
   */
  async recordTimeEvent(
    userId: string,
    timestamp?: number,
    options?: RequestOptions,
  ): Promise<void> {
    await this.client.post(
      `/profile/${userId}/habit/time-event`,
      { timestamp: timestamp || Date.now() },
      options,
    );
  }

  /**
   * 记录会话结束
   */
  async recordSessionEnd(
    userId: string,
    sessionDurationMinutes: number,
    wordCount: number,
    options?: RequestOptions,
  ): Promise<void> {
    await this.client.post(
      `/profile/${userId}/habit/session-end`,
      { sessionDurationMinutes, wordCount },
      options,
    );
  }

  /**
   * 从历史记录初始化习惯识别器
   */
  async initializeHabitFromHistory(userId: string, options?: RequestOptions): Promise<void> {
    await this.client.post(`/profile/${userId}/habit/initialize`, {}, options);
  }

  /**
   * 重置用户习惯识别器
   */
  async resetUserHabit(userId: string, options?: RequestOptions): Promise<void> {
    await this.client.post(`/profile/${userId}/habit/reset`, {}, options);
  }
}

/**
 * 创建UserProfile适配器
 */
export function createUserProfileAdapter(client: ApiClient): UserProfileAdapter {
  return new UserProfileAdapter(client);
}
