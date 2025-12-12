/**
 * Tauri 存储服务实现
 *
 * 通过 Tauri invoke 调用 Rust 原生命令实现本地存储
 * 适用于 Tauri 桌面和移动端环境
 *
 * 特点：
 * - 数据存储在本地 SQLite 数据库
 * - 支持离线使用
 * - 需要与服务器同步
 */

import type { Word, WordLearningState, AnswerRecord } from '../types/models';
import {
  IStorageService,
  LearningStats,
  DailyStats,
  SyncResult,
  SyncStatus,
  StorageServiceError,
} from './IStorageService';
import TokenManager from './client/base/TokenManager';

// ===================== Tauri API 类型声明 =====================

/**
 * Tauri invoke 函数类型
 * 动态导入以支持非 Tauri 环境
 */
type InvokeFunction = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

// ===================== 工具函数 =====================

/**
 * 重试包装器
 * @param fn 需要重试的函数
 * @param maxRetries 最大重试次数
 * @param delay 重试延迟 (毫秒)
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // 检查是否为可重试错误
      if (error instanceof StorageServiceError && !error.isRetryable) {
        throw error;
      }

      // 最后一次尝试不等待
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error('Unknown error during retry');
}

// ===================== Tauri 存储服务实现 =====================

/**
 * Tauri 存储服务
 * 通过 invoke 调用 Rust 原生命令实现本地存储
 */
export class TauriStorageService implements IStorageService {
  private invokePromise: Promise<InvokeFunction> | null = null;

  /**
   * 延迟加载 Tauri invoke 函数
   * 支持在非 Tauri 环境中优雅降级
   */
  private async getInvoke(): Promise<InvokeFunction> {
    if (!this.invokePromise) {
      this.invokePromise = (async () => {
        try {
          // 动态导入 Tauri API
          // 使用 @vite-ignore 注释避免打包工具静态分析
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const module = (await import(/* @vite-ignore */ '@tauri-apps/api/core')) as any;
          return module.invoke as InvokeFunction;
        } catch (error) {
          console.warn('[TauriStorage] 无法加载 Tauri API, 可能不在 Tauri 环境中:', error);
          throw new StorageServiceError('Tauri API 不可用', 'TAURI_NOT_AVAILABLE', false);
        }
      })();
    }
    return this.invokePromise;
  }

  /**
   * 调用 Tauri 命令
   */
  private async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const invokeFn = await this.getInvoke();
    return invokeFn<T>(cmd, args);
  }

  // ==================== Word 操作 ====================

  async getWord(wordId: string): Promise<Word | null> {
    try {
      const result = await withRetry(() => this.invoke<Word | null>('get_word', { id: wordId }));
      return result;
    } catch (error) {
      console.error('[TauriStorage] 获取单词失败:', error);
      throw new StorageServiceError(
        `获取单词失败: ${(error as Error).message}`,
        'GET_WORD_ERROR',
        true,
      );
    }
  }

  async getWordsByBook(bookId: string): Promise<Word[]> {
    try {
      const result = await withRetry(() => this.invoke<Word[]>('get_words_by_book', { bookId }));
      return result || [];
    } catch (error) {
      console.error('[TauriStorage] 获取词书单词失败:', error);
      throw new StorageServiceError(
        `获取词书单词失败: ${(error as Error).message}`,
        'GET_WORDS_BY_BOOK_ERROR',
        true,
      );
    }
  }

  async searchWords(query: string, limit: number = 50): Promise<Word[]> {
    try {
      const result = await withRetry(() => this.invoke<Word[]>('search_words', { query, limit }));
      return result || [];
    } catch (error) {
      console.error('[TauriStorage] 搜索单词失败:', error);
      throw new StorageServiceError(
        `搜索单词失败: ${(error as Error).message}`,
        'SEARCH_WORDS_ERROR',
        true,
      );
    }
  }

  async downloadWordBook(bookId: string): Promise<void> {
    try {
      await withRetry(() => this.invoke<void>('download_word_book', { bookId }));
    } catch (error) {
      console.error('[TauriStorage] 下载词书失败:', error);
      throw new StorageServiceError(
        `下载词书失败: ${(error as Error).message}`,
        'DOWNLOAD_WORDBOOK_ERROR',
        true,
      );
    }
  }

  // ==================== 学习状态 ====================

  async getLearningState(userId: string, wordId: string): Promise<WordLearningState | null> {
    try {
      const result = await withRetry(() =>
        this.invoke<WordLearningState | null>('get_learning_state', { userId, wordId }),
      );
      return result;
    } catch (error) {
      console.error('[TauriStorage] 获取学习状态失败:', error);
      throw new StorageServiceError(
        `获取学习状态失败: ${(error as Error).message}`,
        'GET_LEARNING_STATE_ERROR',
        true,
      );
    }
  }

  async saveLearningState(state: WordLearningState): Promise<void> {
    try {
      await withRetry(() => this.invoke<void>('save_learning_state', { learningState: state }));
    } catch (error) {
      console.error('[TauriStorage] 保存学习状态失败:', error);
      throw new StorageServiceError(
        `保存学习状态失败: ${(error as Error).message}`,
        'SAVE_LEARNING_STATE_ERROR',
        true,
      );
    }
  }

  async getDueWords(userId: string, limit?: number): Promise<WordLearningState[]> {
    try {
      const result = await withRetry(() =>
        this.invoke<WordLearningState[]>('get_due_words', { userId, limit: limit ?? 50 }),
      );
      return result || [];
    } catch (error) {
      console.error('[TauriStorage] 获取到期单词失败:', error);
      throw new StorageServiceError(
        `获取到期单词失败: ${(error as Error).message}`,
        'GET_DUE_WORDS_ERROR',
        true,
      );
    }
  }

  async getLearningStats(userId: string): Promise<LearningStats> {
    try {
      // Rust 返回的格式与前端略有不同，需要转换
      interface RustLearningStats {
        total_words: number;
        mastered_words: number;
        learning_words: number;
        due_words: number;
        today_learned: number;
        today_reviewed: number;
        accuracy_rate: number;
        streak_days: number;
      }

      const result = await withRetry(() =>
        this.invoke<RustLearningStats>('get_learning_stats', { userId }),
      );

      // 转换 snake_case 到 camelCase
      return {
        totalWords: result.total_words,
        learnedWords: result.total_words - result.due_words,
        masteredWords: result.mastered_words,
        dueWords: result.due_words,
        todayNew: result.today_learned,
        todayReview: result.today_reviewed,
        streakDays: result.streak_days,
        accuracy: result.accuracy_rate,
      };
    } catch (error) {
      console.error('[TauriStorage] 获取学习统计失败:', error);
      throw new StorageServiceError(
        `获取学习统计失败: ${(error as Error).message}`,
        'GET_LEARNING_STATS_ERROR',
        true,
      );
    }
  }

  // ==================== 答题记录 ====================

  async saveAnswerRecord(record: AnswerRecord): Promise<void> {
    try {
      await withRetry(() => this.invoke<void>('save_answer_record', { record }));
    } catch (error) {
      console.error('[TauriStorage] 保存答题记录失败:', error);
      throw new StorageServiceError(
        `保存答题记录失败: ${(error as Error).message}`,
        'SAVE_ANSWER_RECORD_ERROR',
        true,
      );
    }
  }

  async getTodayStats(userId: string): Promise<DailyStats> {
    try {
      // Rust 返回的格式与前端略有不同，需要转换
      interface RustDailyStats {
        date: string;
        new_words: number;
        reviewed_words: number;
        correct_count: number;
        wrong_count: number;
        accuracy_rate: number;
        total_time_secs: number;
      }

      const result = await withRetry(() =>
        this.invoke<RustDailyStats>('get_today_stats', { userId }),
      );

      // 转换 snake_case 到 camelCase
      return {
        date: result.date,
        wordsStudied: result.new_words + result.reviewed_words,
        newWords: result.new_words,
        reviewWords: result.reviewed_words,
        correctCount: result.correct_count,
        totalCount: result.correct_count + result.wrong_count,
        studyMinutes: Math.round(result.total_time_secs / 60),
      };
    } catch (error) {
      console.error('[TauriStorage] 获取今日统计失败:', error);
      throw new StorageServiceError(
        `获取今日统计失败: ${(error as Error).message}`,
        'GET_TODAY_STATS_ERROR',
        true,
      );
    }
  }

  // ==================== 同步 ====================

  async syncToCloud(): Promise<SyncResult> {
    try {
      // 从 TokenManager 获取认证令牌
      const authToken = TokenManager.getInstance().getToken();
      if (!authToken) {
        return {
          success: false,
          syncedCount: 0,
          conflictCount: 0,
          error: '未登录，无法同步',
          syncedAt: Date.now(),
        };
      }

      // Rust 端返回的结果格式可能使用 snake_case
      interface RustSyncResult {
        success: boolean;
        synced_count: number;
        conflict_count: number;
        error?: string;
      }

      const result = await withRetry(
        () => this.invoke<RustSyncResult>('sync_to_cloud', { authToken }),
        2, // 同步操作减少重试次数
        2000,
      );

      return {
        success: result.success,
        syncedCount: result.synced_count,
        conflictCount: result.conflict_count,
        error: result.error,
        syncedAt: Date.now(),
      };
    } catch (error) {
      console.error('[TauriStorage] 同步到云端失败:', error);
      return {
        success: false,
        syncedCount: 0,
        conflictCount: 0,
        error: (error as Error).message,
        syncedAt: Date.now(),
      };
    }
  }

  async syncFromCloud(): Promise<SyncResult> {
    try {
      // 从 TokenManager 获取认证令牌
      const authToken = TokenManager.getInstance().getToken();
      if (!authToken) {
        return {
          success: false,
          syncedCount: 0,
          conflictCount: 0,
          error: '未登录，无法同步',
          syncedAt: Date.now(),
        };
      }

      // Rust 端返回的结果格式可能使用 snake_case
      interface RustSyncResult {
        success: boolean;
        synced_count: number;
        conflict_count: number;
        error?: string;
      }

      const result = await withRetry(
        () => this.invoke<RustSyncResult>('sync_from_cloud', { authToken }),
        2,
        2000,
      );

      return {
        success: result.success,
        syncedCount: result.synced_count,
        conflictCount: result.conflict_count,
        error: result.error,
        syncedAt: Date.now(),
      };
    } catch (error) {
      console.error('[TauriStorage] 从云端同步失败:', error);
      return {
        success: false,
        syncedCount: 0,
        conflictCount: 0,
        error: (error as Error).message,
        syncedAt: Date.now(),
      };
    }
  }

  async getSyncStatus(): Promise<SyncStatus> {
    try {
      // Rust 端返回的结果格式可能使用 snake_case
      interface RustSyncStatus {
        is_connected: boolean;
        last_sync_time: string | null;
        pending_uploads: number;
        pending_downloads: number;
        is_syncing: boolean;
        last_error: string | null;
      }

      const result = await this.invoke<RustSyncStatus>('get_sync_status', {});

      // 转换为前端格式
      return {
        lastSyncAt: result.last_sync_time ? new Date(result.last_sync_time).getTime() : null,
        hasPendingChanges: result.pending_uploads > 0 || result.pending_downloads > 0,
        pendingCount: result.pending_uploads + result.pending_downloads,
        status: result.is_syncing ? 'syncing' : result.last_error ? 'error' : 'idle',
        error: result.last_error || undefined,
      };
    } catch (error) {
      console.error('[TauriStorage] 获取同步状态失败:', error);
      return {
        lastSyncAt: null,
        hasPendingChanges: false,
        pendingCount: 0,
        status: 'error',
        error: (error as Error).message,
      };
    }
  }
}
