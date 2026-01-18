/**
 * 单词相关类型定义
 */

import { BaseEntity, ID, Timestamp } from './common';

/**
 * 单词
 */
export interface Word extends BaseEntity {
  spelling: string;
  phonetic?: string | null;
  meanings: string[];
  examples: string[];
  audioUrl?: string | null;
  wordBookId?: ID;
  frequency?: number;
  difficulty?: number;
}

/**
 * 创建单词DTO
 */
export interface CreateWordDto {
  spelling: string;
  phonetic?: string | null;
  meanings: string[];
  examples: string[];
  audioUrl?: string | null;
}

/**
 * 更新单词DTO
 */
export interface UpdateWordDto {
  spelling?: string;
  phonetic?: string | null;
  meanings?: string[];
  examples?: string[];
  audioUrl?: string | null;
}

/**
 * 词书类型
 */
export type WordBookType = 'SYSTEM' | 'USER';

/**
 * 词书
 */
export interface WordBook extends BaseEntity {
  name: string;
  description?: string | null;
  type: WordBookType;
  userId?: ID | null;
  isPublic: boolean;
  wordCount: number;
  coverImage?: string | null;
  tags?: string[];
  sourceUrl?: string | null;
  sourceVersion?: string | null;
  sourceAuthor?: string | null;
  importedAt?: Timestamp | null;
}

/**
 * 词库中心配置
 */
export interface WordBookCenterConfig {
  id: string;
  centerUrl: string;
  updatedAt: string;
  updatedBy?: string | null;
}

/**
 * 词库中心词书（远程）
 */
export interface CenterWordBook {
  id: string;
  name: string;
  description?: string | null;
  wordCount: number;
  coverImage?: string | null;
  tags: string[];
  version: string;
  author?: string | null;
  downloadCount?: number;
}

/**
 * 导入词书请求
 */
export interface ImportWordBookRequest {
  targetType: 'SYSTEM' | 'USER';
}

/**
 * 创建词书DTO
 */
export interface CreateWordBookDto {
  name: string;
  description?: string;
  coverImage?: string;
}

/**
 * 更新词书DTO
 */
export interface UpdateWordBookDto {
  name?: string;
  description?: string;
  coverImage?: string;
}

/**
 * 单词状态
 */
export enum WordState {
  NEW = 'NEW',
  LEARNING = 'LEARNING',
  REVIEWING = 'REVIEWING',
  MASTERED = 'MASTERED',
}

/**
 * 掌握程度等级 (0-5)
 * 0: 完全不会
 * 1: 初学（见过但不熟）
 * 2: 学习中（有印象但不稳定）
 * 3: 熟悉（基本掌握）
 * 4: 熟练（掌握牢固）
 * 5: 精通（完全掌握）
 *
 * 使用 number 类型以保持向后兼容，实际值应在 0-5 范围内
 */
export type MasteryLevel = number;

/**
 * 单词学习状态
 */
export interface WordLearningState extends BaseEntity {
  userId: ID;
  wordId: ID;
  state: WordState;
  /** 掌握程度等级 (0-5) */
  masteryLevel: MasteryLevel;
  easeFactor: number;
  reviewCount: number;
  lastReviewDate: Timestamp | null;
  nextReviewDate: Timestamp | null;
  currentInterval: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
}

/**
 * 单词综合评分
 */
export interface WordScore extends BaseEntity {
  userId: ID;
  wordId: ID;
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
}

/**
 * 单词统计信息
 */
export interface WordStatistics {
  attempts: number;
  correct: number;
  lastStudied: Timestamp;
}
