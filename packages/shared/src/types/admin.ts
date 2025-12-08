/**
 * 管理员相关类型定义
 */

import { BaseEntity, ID, Timestamp } from './common';
import { UserRole } from './user';
import { AnswerRecord } from './study';

/**
 * 用户列表响应
 */
export interface UserListResponse extends BaseEntity {
  email: string;
  username: string;
  role: UserRole;
}

/**
 * 系统统计响应
 */
export interface SystemStatsResponse {
  totalUsers: number;
  activeUsers: number;
  totalWordBooks: number;
  totalWords: number;
  totalRecords: number;
  systemWordBooks?: number;
  userWordBooks?: number;
}

/**
 * 用户学习数据响应
 */
export interface UserLearningDataResponse {
  userId: ID;
  totalWordsLearned: number;
  totalStudyTime: number;
  averageAccuracy: number;
  recentRecords: AnswerRecordResponse[];
}

/**
 * 答题记录响应（带单词信息）
 */
export interface AnswerRecordResponse extends AnswerRecord {
  word: {
    spelling: string;
    phonetic: string;
    meanings: string[];
  };
}
