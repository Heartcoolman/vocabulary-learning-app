/**
 * 用户相关类型定义
 */

import { BaseEntity, ID, Timestamp } from './common';

/**
 * 用户角色
 */
export type UserRole = 'USER' | 'ADMIN' | 'BANNED';

/**
 * 用户信息
 */
export interface UserInfo extends BaseEntity {
  email: string;
  username: string;
  role: UserRole;
}

/**
 * 认证用户（包含JWT信息）
 */
export interface AuthUser extends UserInfo {
  iat?: number;
  exp?: number;
}

/**
 * 用户注册DTO
 */
export interface RegisterDto {
  email: string;
  password: string;
  username: string;
}

/**
 * 用户登录DTO
 */
export interface LoginDto {
  email: string;
  password: string;
}

/**
 * 更新密码DTO
 */
export interface UpdatePasswordDto {
  oldPassword: string;
  newPassword: string;
}

/**
 * 用户统计信息
 */
export interface UserStatistics {
  totalWords: number;
  totalRecords: number;
  correctCount: number;
  accuracy: number;
}
