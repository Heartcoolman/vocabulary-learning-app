import { Word, AnswerRecord, StudyStatistics, WordStatistics } from '../types/models';
import ApiClient from './ApiClient';

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: number | null;
  error: string | null;
  pendingChanges: number;
}

class StorageService {
  private wordCache: Word[] = [];
  private cacheTimestamp: number | null = null;
  private readonly cacheTtl = 5 * 60 * 1000;
  private syncStatus: SyncStatus = {
    isSyncing: false,
    lastSyncTime: null,
    error: null,
    pendingChanges: 0,
  };
  private syncListeners: Array<(status: SyncStatus) => void> = [];

  /**
   * 初始化服务，加载缓存数据
   */
  async init(): Promise<void> {
    try {
      // 尝试从云端加载数据并初始化缓存
      await this.refreshCacheFromCloud();
      this.updateSyncStatus({
        lastSyncTime: Date.now(),
        pendingChanges: 0,
      });
    } catch (error) {
      console.error('初始化失败:', error);
      // 初始化失败不阻断应用启动，使用空缓存
      this.wordCache = [];
      this.cacheTimestamp = null;
      this.updateSyncStatus({
        error: error instanceof Error ? error.message : '初始化失败',
      });
    }
  }

  /**
   * 切换当前用户，清空缓存并重新加载
   */
  async setCurrentUser(userId: string | null): Promise<void> {
    // 清空当前用户的缓存
    this.wordCache = [];
    this.cacheTimestamp = null;

    // 重置同步状态
    this.updateSyncStatus({
      lastSyncTime: null,
      pendingChanges: 0,
      error: null,
    });

    // 如果有新用户，重新初始化
    if (userId) {
      await this.init();
    }
  }

  private updateSyncStatus(updates: Partial<SyncStatus>): void {
    this.syncStatus = { ...this.syncStatus, ...updates };
    this.syncListeners.forEach((listener) => listener(this.syncStatus));
  }

  getSyncStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  onSyncStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.syncListeners.push(listener);
    return () => {
      this.syncListeners = this.syncListeners.filter((l) => l !== listener);
    };
  }

  async syncToCloud(): Promise<void> {
    if (this.syncStatus.isSyncing) return;
    this.updateSyncStatus({ isSyncing: true, error: null });
    try {
      await this.refreshCacheFromCloud();
      this.updateSyncStatus({
        isSyncing: false,
        lastSyncTime: Date.now(),
        pendingChanges: 0,
      });
      return;
    } catch (error) {
      this.updateSyncStatus({
        isSyncing: false,
        error: error instanceof Error ? error.message : '????',
      });
      throw error;
    }
  }

  private isCacheValid(): boolean {
    return !!this.cacheTimestamp && Date.now() - this.cacheTimestamp < this.cacheTtl;
  }

  private async refreshCacheFromCloud(): Promise<Word[]> {
    const words = await ApiClient.getWords();
    this.wordCache = words;
    this.cacheTimestamp = Date.now();
    return words;
  }

  async getWords(): Promise<Word[]> {
    if (this.isCacheValid()) {
      return this.wordCache;
    }
    try {
      return await this.refreshCacheFromCloud();
    } catch (error) {
      console.error('????????:', error);
      return this.wordCache;
    }
  }

  async addWord(word: Word): Promise<void> {
    const payload = {
      spelling: word.spelling,
      phonetic: word.phonetic,
      meanings: word.meanings,
      examples: word.examples,
      audioUrl: word.audioUrl,
    };
    await ApiClient.createWord(payload);
    await this.refreshCacheFromCloud();
  }

  async updateWord(word: Word): Promise<void> {
    await ApiClient.updateWord(word.id, {
      spelling: word.spelling,
      phonetic: word.phonetic,
      meanings: word.meanings,
      examples: word.examples,
      audioUrl: word.audioUrl,
    });
    await this.refreshCacheFromCloud();
  }

  async deleteWord(wordId: string): Promise<void> {
    await ApiClient.deleteWord(wordId);
    this.wordCache = this.wordCache.filter((w) => w.id !== wordId);
    // 重置缓存时间戳，确保下次 getWords 时重新从云端加载
    this.cacheTimestamp = null;
  }

  async saveAnswerRecord(record: AnswerRecord): Promise<void> {
    await ApiClient.createRecord({
      wordId: record.wordId,
      selectedAnswer: record.selectedAnswer,
      correctAnswer: record.correctAnswer,
      isCorrect: record.isCorrect,
      timestamp: record.timestamp,
    });
  }

  async getAnswerRecords(wordId: string): Promise<AnswerRecord[]> {
    try {
      const records = await ApiClient.getRecords();
      return records.filter((r) => r.wordId === wordId);
    } catch (error) {
      console.error('????????:', error);
      return [];
    }
  }

  async getStudyStatistics(): Promise<StudyStatistics> {
    try {
      const [words, records] = await Promise.all([this.getWords(), ApiClient.getRecords()]);
      const wordStats = new Map<string, WordStatistics>();

      records.forEach((record) => {
        const stats = wordStats.get(record.wordId) || {
          attempts: 0,
          correct: 0,
          lastStudied: 0,
        };
        stats.attempts += 1;
        if (record.isCorrect) {
          stats.correct += 1;
        }
        stats.lastStudied = Math.max(stats.lastStudied, record.timestamp);
        wordStats.set(record.wordId, stats);
      });

      const studiedWords = wordStats.size;
      const totalCorrect = Array.from(wordStats.values()).reduce((sum, s) => sum + s.correct, 0);
      const totalAttempts = Array.from(wordStats.values()).reduce((sum, s) => sum + s.attempts, 0);
      const correctRate = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;

      return {
        totalWords: words.length,
        studiedWords,
        correctRate,
        wordStats,
      };
    } catch (error) {
      console.error('????????:', error);
      return {
        totalWords: 0,
        studiedWords: 0,
        correctRate: 0,
        wordStats: new Map(),
      };
    }
  }

  async clearLocalData(): Promise<void> {
    this.wordCache = [];
    this.cacheTimestamp = null;
  }

  async deleteDatabase(): Promise<void> {
    await this.clearLocalData();
  }
}

export default new StorageService();
