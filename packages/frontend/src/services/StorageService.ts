import {
  Word,
  AnswerRecord,
  StudyStatistics,
  WordStatistics,
  WordLearningState,
  WordScore,
  AlgorithmConfig,
  ConfigHistory,
  WordState,
} from '../types/models';
import ApiClient from './client';
import { storageLogger } from '../utils/logger';

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: number | null;
  error: string | null;
  // 注意：当前架构是“云优先”，所有数据操作直接调用API同步，不存在本地待同步队列
  // 此字段仅用于未来扩展，当前始终为0
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
  // 用于解决 syncToCloud 竞态条件的 Promise 锁
  private syncPromise: Promise<void> | null = null;

  /**
   * 初始化服务，从云端加载缓存数据
   */
  async init(): Promise<void> {
    // 检查是否有认证令牌，未认证时跳过初始化
    if (!ApiClient.getToken()) {
      this.wordCache = [];
      this.cacheTimestamp = null;
      return;
    }

    try {
      // 从云端加载数据并初始化缓存
      await this.refreshCacheFromCloud();
      this.updateSyncStatus({
        lastSyncTime: Date.now(),
        pendingChanges: 0, // 云优先架构，无本地待同步数据
        error: null,
      });
    } catch (error) {
      storageLogger.error({ err: error }, '初始化失败');
      // 初始化失败不阻断应用启动，使用空缓存
      this.wordCache = [];
      this.cacheTimestamp = null;
      this.updateSyncStatus({
        error: error instanceof Error ? error.message : '初始化失败',
      });
      // 不再抛出异常，允许应用继续运行
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

  /**
   * 从云端刷新缓存数据
   * 注意：当前架构是"云优先"，所有数据操作（addWord/updateWord/deleteWord/saveAnswerRecord）
   * 都直接调用API同步到云端，不存在本地待上传的变更队列。
   * 此方法仅用于从云端拉取最新数据刷新本地缓存。
   *
   * 使用 Promise-based 锁解决竞态条件：如果有正在进行的同步，返回同一个 Promise
   */
  async syncToCloud(): Promise<void> {
    // 检查是否有认证令牌，未认证时跳过同步
    if (!ApiClient.getToken()) {
      return;
    }

    // 使用 Promise 锁解决竞态条件：如果有正在进行的同步，返回同一个 Promise
    if (this.syncPromise) {
      return this.syncPromise;
    }

    // 创建新的同步 Promise
    this.syncPromise = this.doSync();

    try {
      await this.syncPromise;
    } finally {
      // 同步完成后清除锁
      this.syncPromise = null;
    }
  }

  /**
   * 实际执行同步操作的内部方法
   */
  private async doSync(): Promise<void> {
    this.updateSyncStatus({ isSyncing: true, error: null });
    try {
      await this.refreshCacheFromCloud();
      this.updateSyncStatus({
        isSyncing: false,
        lastSyncTime: Date.now(),
        pendingChanges: 0, // 云优先架构，无本地待同步数据
      });
    } catch (error) {
      this.updateSyncStatus({
        isSyncing: false,
        error: error instanceof Error ? error.message : '同步失败',
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
      storageLogger.error({ err: error }, '获取单词失败');
      // 如果有缓存数据则返回缓存，否则抛出错误让上层处理
      if (this.wordCache.length > 0) {
        return this.wordCache;
      }
      throw error instanceof Error ? error : new Error('获取单词失败');
    }
  }

  /**
   * 添加单词（直接同步到云端）
   */
  async addWord(word: Word): Promise<void> {
    const payload = {
      spelling: word.spelling,
      phonetic: word.phonetic,
      meanings: word.meanings,
      examples: word.examples,
      audioUrl: word.audioUrl,
    };
    // 直接同步到云端
    await ApiClient.createWord(payload);
    // 刷新本地缓存
    await this.refreshCacheFromCloud();
  }

  /**
   * 更新单词（直接同步到云端）
   */
  async updateWord(word: Word): Promise<void> {
    // 直接同步到云端
    await ApiClient.updateWord(word.id, {
      spelling: word.spelling,
      phonetic: word.phonetic,
      meanings: word.meanings,
      examples: word.examples,
      audioUrl: word.audioUrl,
    });
    // 刷新本地缓存
    await this.refreshCacheFromCloud();
  }

  /**
   * 删除单词（直接同步到云端）
   */
  async deleteWord(wordId: string): Promise<void> {
    // 直接同步到云端
    await ApiClient.deleteWord(wordId);
    // 立即从云端刷新缓存，确保数据一致性
    await this.refreshCacheFromCloud();
  }

  /**
   * 保存答题记录（直接同步到云端）
   */
  async saveAnswerRecord(record: AnswerRecord): Promise<void> {
    // 直接同步到云端，无需本地缓存
    await ApiClient.createRecord({
      wordId: record.wordId,
      selectedAnswer: record.selectedAnswer,
      correctAnswer: record.correctAnswer,
      isCorrect: record.isCorrect,
      timestamp: record.timestamp,
    });
  }

  /**
   * 获取指定单词的答题记录
   * 注意：当前实现会迭代获取所有分页数据，大量记录时可能影响性能
   * @param wordId 单词ID
   * @returns 该单词的所有答题记录
   */
  async getAnswerRecords(wordId: string): Promise<AnswerRecord[]> {
    try {
      const PAGE_SIZE = 100;
      let allRecords: AnswerRecord[] = [];
      let page = 1;
      let hasMoreData = true;

      // 迭代获取所有分页数据，避免硬编码 pageSize 导致数据不完整
      while (hasMoreData) {
        const result = await ApiClient.getRecords({ page, pageSize: PAGE_SIZE });
        allRecords = allRecords.concat(result.records);

        // 检查是否还有更多数据
        const rawTotalPages = result.pagination?.totalPages ?? 1;
        const totalPages = Number.isFinite(rawTotalPages) && rawTotalPages > 0 ? rawTotalPages : 1;
        hasMoreData = page < totalPages;
        page++;

        // 安全阈值：最多获取10000条记录，防止无限循环
        if (allRecords.length >= 10000) {
          storageLogger.warn(
            { wordId, totalFetched: allRecords.length },
            '答题记录数量超过安全阈值，停止获取',
          );
          break;
        }
      }

      return allRecords.filter((r) => r.wordId === wordId);
    } catch (error) {
      storageLogger.error({ err: error }, '获取答题记录失败');
      return [];
    }
  }

  async getStudyStatistics(): Promise<StudyStatistics> {
    try {
      const [words, recordsResult] = await Promise.all([
        this.getWords(),
        ApiClient.getRecords({ pageSize: 100 }),
      ]);
      const records = recordsResult.records;
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
      storageLogger.error({ err: error }, '获取学习统计失败');
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

  // ==================== 单词学习状态管理 ====================

  /**
   * 获取单词学习状态
   */
  async getWordLearningState(_userId: string, wordId: string): Promise<WordLearningState | null> {
    try {
      const state = await ApiClient.getWordLearningState(wordId);
      return state;
    } catch (error) {
      storageLogger.error({ err: error }, '获取单词学习状态失败');
      return null;
    }
  }

  /**
   * 创建或更新单词学习状态
   */
  async saveWordLearningState(state: WordLearningState): Promise<void> {
    try {
      await ApiClient.saveWordLearningState(state);
    } catch (error) {
      storageLogger.error({ err: error }, '保存单词学习状态失败');
      throw error;
    }
  }

  /**
   * 批量获取单词学习状态
   */
  async getWordLearningStates(_userId: string, wordIds: string[]): Promise<WordLearningState[]> {
    // 空数组直接返回，避免无效请求
    if (!wordIds || wordIds.length === 0) {
      return [];
    }
    try {
      const states = await ApiClient.getWordLearningStates(wordIds);
      return states;
    } catch (error) {
      storageLogger.error({ err: error }, '批量获取单词学习状态失败');
      return [];
    }
  }

  /**
   * 按状态获取单词
   */
  async getWordsByState(_userId: string, state: WordState): Promise<WordLearningState[]> {
    try {
      const states = await ApiClient.getWordsByState(state);
      return states;
    } catch (error) {
      storageLogger.error({ err: error }, '按状态获取单词失败');
      return [];
    }
  }

  /**
   * 获取到期需要复习的单词
   */
  async getDueWords(_userId: string): Promise<WordLearningState[]> {
    try {
      const states = await ApiClient.getDueWords();
      return states;
    } catch (error) {
      storageLogger.error({ err: error }, '获取到期单词失败');
      return [];
    }
  }

  // ==================== 单词得分管理 ====================

  /**
   * 获取单词得分
   */
  async getWordScore(_userId: string, wordId: string): Promise<WordScore | null> {
    try {
      const score = await ApiClient.getWordScore(wordId);
      return score;
    } catch (error) {
      storageLogger.error({ err: error }, '获取单词得分失败');
      return null;
    }
  }

  /**
   * 保存单词得分
   */
  async saveWordScore(score: WordScore): Promise<void> {
    try {
      await ApiClient.saveWordScore(score);
    } catch (error) {
      storageLogger.error({ err: error }, '保存单词得分失败');
      throw error;
    }
  }

  /**
   * 批量获取单词得分
   */
  async getWordScores(_userId: string, wordIds: string[]): Promise<WordScore[]> {
    try {
      const scores = await ApiClient.getWordScores(wordIds);
      return scores;
    } catch (error) {
      storageLogger.error({ err: error }, '批量获取单词得分失败');
      return [];
    }
  }

  /**
   * 按得分范围获取单词
   */
  async getWordsByScoreRange(
    _userId: string,
    minScore: number,
    maxScore: number,
  ): Promise<WordScore[]> {
    try {
      const scores = await ApiClient.getWordsByScoreRange(minScore, maxScore);
      return scores;
    } catch (error) {
      storageLogger.error({ err: error }, '按得分范围获取单词失败');
      return [];
    }
  }

  // ==================== 算法配置管理 ====================

  /**
   * 获取当前算法配置
   */
  async getAlgorithmConfig(): Promise<AlgorithmConfig | null> {
    try {
      const config = await ApiClient.getAlgorithmConfig();
      return config;
    } catch (error) {
      storageLogger.error({ err: error }, '获取算法配置失败');
      return null;
    }
  }

  /**
   * 更新算法配置（仅管理员）
   */
  async updateAlgorithmConfig(
    configId: string,
    config: Partial<AlgorithmConfig>,
    changeReason?: string,
  ): Promise<void> {
    try {
      await ApiClient.updateAlgorithmConfig(configId, config, changeReason);
    } catch (error) {
      storageLogger.error({ err: error }, '更新算法配置失败');
      throw error;
    }
  }

  /**
   * 重置算法配置为默认值（仅管理员）
   */
  async resetAlgorithmConfig(configId: string): Promise<void> {
    try {
      await ApiClient.resetAlgorithmConfig(configId);
    } catch (error) {
      storageLogger.error({ err: error }, '重置算法配置失败');
      throw error;
    }
  }

  /**
   * 获取配置历史记录
   */
  async getConfigHistory(_limit?: number): Promise<ConfigHistory[]> {
    try {
      const history = await ApiClient.getConfigHistory(_limit);
      return history;
    } catch (error) {
      storageLogger.error({ err: error }, '获取配置历史失败');
      return [];
    }
  }

  // ==================== 扩展答题记录保存 ====================

  /**
   * 保存答题记录（扩展版本，包含新字段）
   */
  async saveAnswerRecordExtended(_record: AnswerRecord): Promise<void> {
    try {
      // 使用现有的createRecord方法，因为它已经支持扩展字段
      await ApiClient.createRecord({
        wordId: _record.wordId,
        selectedAnswer: _record.selectedAnswer,
        correctAnswer: _record.correctAnswer,
        isCorrect: _record.isCorrect,
        timestamp: _record.timestamp,
        responseTime: _record.responseTime,
        dwellTime: _record.dwellTime,
        sessionId: _record.sessionId,
        masteryLevelBefore: _record.masteryLevelBefore,
        masteryLevelAfter: _record.masteryLevelAfter,
      });
    } catch (error) {
      storageLogger.error({ err: error }, '保存扩展答题记录失败');
      throw error;
    }
  }
}

export default new StorageService();
