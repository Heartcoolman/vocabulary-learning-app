/**
 * Storage Service 接口定义
 *
 * 定义统一的存储服务接口，支持不同环境的实现：
 * - Web 环境：通过 API 调用后端
 * - Tauri 环境：调用 Rust 原生命令
 *
 * 设计原则：
 * 1. 接口统一：两种实现提供相同的 API
 * 2. 自动适配：根据运行环境自动选择实现
 * 3. 错误处理：统一的错误处理和重试机制
 * 4. 类型安全：完整的 TypeScript 类型定义
 */

import type { Word, WordLearningState, AnswerRecord } from '../types/models';

// ===================== 类型定义 =====================

/**
 * 学习统计数据
 */
export interface LearningStats {
  /** 总单词数 */
  totalWords: number;
  /** 已学习单词数 */
  learnedWords: number;
  /** 已掌握单词数 */
  masteredWords: number;
  /** 待复习单词数 */
  dueWords: number;
  /** 今日新学数 */
  todayNew: number;
  /** 今日复习数 */
  todayReview: number;
  /** 连续学习天数 */
  streakDays: number;
  /** 总正确率 */
  accuracy: number;
}

/**
 * 每日统计数据
 */
export interface DailyStats {
  /** 日期 (YYYY-MM-DD) */
  date: string;
  /** 学习单词数 */
  wordsStudied: number;
  /** 新学单词数 */
  newWords: number;
  /** 复习单词数 */
  reviewWords: number;
  /** 正确数 */
  correctCount: number;
  /** 总题数 */
  totalCount: number;
  /** 学习时长 (分钟) */
  studyMinutes: number;
}

/**
 * 同步结果
 */
export interface SyncResult {
  /** 是否成功 */
  success: boolean;
  /** 同步的记录数 */
  syncedCount: number;
  /** 冲突数 */
  conflictCount: number;
  /** 错误信息 */
  error?: string;
  /** 同步时间戳 */
  syncedAt: number;
}

/**
 * 同步状态
 */
export interface SyncStatus {
  /** 上次同步时间 */
  lastSyncAt: number | null;
  /** 是否有待同步数据 */
  hasPendingChanges: boolean;
  /** 待同步记录数 */
  pendingCount: number;
  /** 同步状态 */
  status: 'idle' | 'syncing' | 'error';
  /** 错误信息 */
  error?: string;
}

// ===================== 接口定义 =====================

/**
 * 存储服务接口
 * 定义统一的存储操作 API
 */
export interface IStorageService {
  // ==================== Word 操作 ====================

  /**
   * 获取单个单词
   * @param wordId 单词ID
   */
  getWord(wordId: string): Promise<Word | null>;

  /**
   * 获取词书中的所有单词
   * @param bookId 词书ID
   */
  getWordsByBook(bookId: string): Promise<Word[]>;

  /**
   * 搜索单词
   * @param query 搜索关键词
   * @param limit 返回结果数量限制
   */
  searchWords(query: string, limit?: number): Promise<Word[]>;

  /**
   * 下载词书到本地
   * @param bookId 词书ID
   */
  downloadWordBook(bookId: string): Promise<void>;

  // ==================== 学习状态 ====================

  /**
   * 获取单词学习状态
   * @param userId 用户ID
   * @param wordId 单词ID
   */
  getLearningState(userId: string, wordId: string): Promise<WordLearningState | null>;

  /**
   * 保存单词学习状态
   * @param state 学习状态
   */
  saveLearningState(state: WordLearningState): Promise<void>;

  /**
   * 获取到期需要复习的单词
   * @param userId 用户ID
   * @param limit 返回数量限制
   */
  getDueWords(userId: string, limit?: number): Promise<WordLearningState[]>;

  /**
   * 获取学习统计数据
   * @param userId 用户ID
   */
  getLearningStats(userId: string): Promise<LearningStats>;

  // ==================== 答题记录 ====================

  /**
   * 保存答题记录
   * @param record 答题记录
   */
  saveAnswerRecord(record: AnswerRecord): Promise<void>;

  /**
   * 获取今日学习统计
   * @param userId 用户ID
   */
  getTodayStats(userId: string): Promise<DailyStats>;

  // ==================== 同步 ====================

  /**
   * 同步本地数据到云端
   */
  syncToCloud(): Promise<SyncResult>;

  /**
   * 从云端同步数据到本地
   */
  syncFromCloud(): Promise<SyncResult>;

  /**
   * 获取同步状态
   */
  getSyncStatus(): Promise<SyncStatus>;
}

// ===================== 错误类型 =====================

/**
 * 存储服务错误
 */
export class StorageServiceError extends Error {
  public readonly code: string;
  public readonly isRetryable: boolean;

  constructor(message: string, code: string, isRetryable: boolean = false) {
    super(message);
    this.name = 'StorageServiceError';
    this.code = code;
    this.isRetryable = isRetryable;
  }
}
