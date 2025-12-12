/**
 * Web 存储服务实现
 *
 * 通过 HTTP API 调用后端实现存储操作
 * 用于 Web 环境（非 Tauri 桌面端/移动端）
 *
 * 特点：
 * - 所有数据直接存储在服务器端
 * - 无需本地存储或同步
 * - 依赖网络连接
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
import { wordClient, learningClient, wordBookClient } from './client';
import { ApiError } from './client/base/BaseClient';

/**
 * Web 存储服务
 * 通过 API Client 调用后端接口
 */
export class WebStorageService implements IStorageService {
  // ==================== Word 操作 ====================

  /**
   * 获取单个单词
   * @param wordId 单词ID
   */
  async getWord(wordId: string): Promise<Word | null> {
    try {
      const word = await wordClient.getWordById(wordId);
      return word;
    } catch (error) {
      // 404 表示数据不存在，返回 null
      if (error instanceof ApiError && error.isNotFound) {
        return null;
      }
      console.error('[WebStorage] 获取单词失败:', error);
      throw new StorageServiceError(
        `获取单词失败: ${(error as Error).message}`,
        'GET_WORD_ERROR',
        true,
      );
    }
  }

  /**
   * 获取词书中的所有单词
   * @param bookId 词书ID
   */
  async getWordsByBook(bookId: string): Promise<Word[]> {
    try {
      const words = await wordBookClient.getWordBookWords(bookId);
      return words;
    } catch (error) {
      if (error instanceof ApiError && error.isNotFound) {
        return [];
      }
      console.error('[WebStorage] 获取词书单词失败:', error);
      throw new StorageServiceError(
        `获取词书单词失败: ${(error as Error).message}`,
        'GET_WORDS_BY_BOOK_ERROR',
        true,
      );
    }
  }

  /**
   * 搜索单词
   * @param query 搜索关键词
   * @param limit 返回结果数量限制
   */
  async searchWords(query: string, limit: number = 20): Promise<Word[]> {
    try {
      const results = await wordClient.searchWords(query, limit);
      // 移除 wordBook 字段以匹配接口类型
      return results.map(({ wordBook, ...word }) => word);
    } catch (error) {
      console.error('[WebStorage] 搜索单词失败:', error);
      throw new StorageServiceError(
        `搜索单词失败: ${(error as Error).message}`,
        'SEARCH_WORDS_ERROR',
        true,
      );
    }
  }

  /**
   * 下载词书到本地
   * Web 环境不需要下载，数据从服务器获取
   * @param _bookId 词书ID（未使用）
   */
  async downloadWordBook(_bookId: string): Promise<void> {
    // Web 环境不需要下载，数据从服务器获取
    // 此方法为空实现，保持接口一致性
    console.log('[WebStorage] Web 环境无需下载词书');
  }

  // ==================== 学习状态 ====================

  /**
   * 获取单词学习状态
   * @param _userId 用户ID（服务端自动识别）
   * @param wordId 单词ID
   */
  async getLearningState(_userId: string, wordId: string): Promise<WordLearningState | null> {
    try {
      const state = await learningClient.getWordLearningState(wordId);
      return state;
    } catch (error) {
      if (error instanceof ApiError && error.isNotFound) {
        return null;
      }
      console.error('[WebStorage] 获取学习状态失败:', error);
      throw new StorageServiceError(
        `获取学习状态失败: ${(error as Error).message}`,
        'GET_LEARNING_STATE_ERROR',
        true,
      );
    }
  }

  /**
   * 保存单词学习状态
   * @param state 学习状态
   */
  async saveLearningState(state: WordLearningState): Promise<void> {
    try {
      await learningClient.saveWordLearningState(state);
    } catch (error) {
      console.error('[WebStorage] 保存学习状态失败:', error);
      throw new StorageServiceError(
        `保存学习状态失败: ${(error as Error).message}`,
        'SAVE_LEARNING_STATE_ERROR',
        true,
      );
    }
  }

  /**
   * 获取到期需要复习的单词
   * @param _userId 用户ID（服务端自动识别）
   * @param _limit 返回数量限制（当前API不支持）
   */
  async getDueWords(_userId: string, _limit?: number): Promise<WordLearningState[]> {
    try {
      const dueWords = await learningClient.getDueWords();
      return dueWords;
    } catch (error) {
      console.error('[WebStorage] 获取到期单词失败:', error);
      return [];
    }
  }

  /**
   * 获取学习统计数据
   * @param _userId 用户ID（服务端自动识别）
   */
  async getLearningStats(_userId: string): Promise<LearningStats> {
    try {
      // 从多个 API 聚合统计数据
      const [progress, dueWords] = await Promise.all([
        wordBookClient.getStudyProgress(),
        learningClient.getDueWords(),
      ]);

      return {
        totalWords: progress.totalStudied + dueWords.length, // 近似总词数
        learnedWords: progress.totalStudied,
        masteredWords: Math.round(progress.totalStudied * progress.correctRate), // 根据正确率估算
        dueWords: dueWords.length,
        todayNew: progress.todayStudied,
        todayReview: 0, // 当前 API 不区分新学和复习
        streakDays: 0, // 需要单独的 API 支持
        accuracy: progress.correctRate,
      };
    } catch (error) {
      console.error('[WebStorage] 获取学习统计失败:', error);
      // 返回默认值
      return {
        totalWords: 0,
        learnedWords: 0,
        masteredWords: 0,
        dueWords: 0,
        todayNew: 0,
        todayReview: 0,
        streakDays: 0,
        accuracy: 0,
      };
    }
  }

  // ==================== 答题记录 ====================

  /**
   * 保存答题记录
   * @param record 答题记录
   */
  async saveAnswerRecord(record: AnswerRecord): Promise<void> {
    try {
      await learningClient.createRecord({
        wordId: record.wordId,
        selectedAnswer: record.selectedAnswer,
        correctAnswer: record.correctAnswer,
        isCorrect: record.isCorrect,
        timestamp: record.timestamp,
        responseTime: record.responseTime,
        dwellTime: record.dwellTime,
        sessionId: record.sessionId,
        masteryLevelBefore: record.masteryLevelBefore,
        masteryLevelAfter: record.masteryLevelAfter,
      });
    } catch (error) {
      console.error('[WebStorage] 保存答题记录失败:', error);
      throw new StorageServiceError(
        `保存答题记录失败: ${(error as Error).message}`,
        'SAVE_ANSWER_RECORD_ERROR',
        true,
      );
    }
  }

  /**
   * 获取今日学习统计
   * @param _userId 用户ID（服务端自动识别）
   */
  async getTodayStats(_userId: string): Promise<DailyStats> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const progress = await wordBookClient.getStudyProgress();

      return {
        date: today,
        wordsStudied: progress.todayStudied,
        newWords: progress.todayStudied, // 当前 API 不区分新学和复习
        reviewWords: 0,
        correctCount: Math.round(progress.todayStudied * progress.correctRate),
        totalCount: progress.todayStudied,
        studyMinutes: 0, // Web 端暂不追踪学习时长
      };
    } catch (error) {
      console.error('[WebStorage] 获取今日统计失败:', error);
      const today = new Date().toISOString().split('T')[0];
      return {
        date: today,
        wordsStudied: 0,
        newWords: 0,
        reviewWords: 0,
        correctCount: 0,
        totalCount: 0,
        studyMinutes: 0,
      };
    }
  }

  // ==================== 同步 ====================

  /**
   * 同步本地数据到云端
   * Web 环境数据直接存储在服务器，无需同步
   */
  async syncToCloud(): Promise<SyncResult> {
    // Web 环境数据直接存储在服务器，无需同步
    return {
      success: true,
      syncedCount: 0,
      conflictCount: 0,
      syncedAt: Date.now(),
    };
  }

  /**
   * 从云端同步数据到本地
   * Web 环境数据直接从服务器获取，无需同步
   */
  async syncFromCloud(): Promise<SyncResult> {
    // Web 环境数据直接从服务器获取，无需同步
    return {
      success: true,
      syncedCount: 0,
      conflictCount: 0,
      syncedAt: Date.now(),
    };
  }

  /**
   * 获取同步状态
   * Web 环境始终处于同步状态
   */
  async getSyncStatus(): Promise<SyncStatus> {
    // Web 环境始终处于同步状态
    return {
      lastSyncAt: Date.now(),
      hasPendingChanges: false,
      pendingCount: 0,
      status: 'idle',
    };
  }
}
