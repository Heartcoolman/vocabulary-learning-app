import { AnswerRecord, WordLearningState, WordScore, WordState } from '../../types/models';

/**
 * 单词状态管理器
 * 负责单词学习状态的初始化、查询和更新
 */
export class WordStateManager {
  // 内存缓存，用于快速访问
  private stateCache: Map<string, WordLearningState> = new Map();
  
  // 存储接口（需要外部注入）
  private storage: WordStateStorage;

  constructor(storage: WordStateStorage) {
    this.storage = storage;
  }

  /**
   * 初始化单词状态
   * 为新单词创建初始学习状态
   * 
   * @param userId 用户ID
   * @param wordId 单词ID
   * @returns 初始化的单词状态
   */
  async initializeWordState(userId: string, wordId: string): Promise<WordLearningState> {
    const now = Date.now();
    
    const initialState: WordLearningState = {
      id: `${userId}-${wordId}-${now}`,
      userId,
      wordId,
      state: WordState.NEW,
      masteryLevel: 0,
      easeFactor: 2.5,
      reviewCount: 0,
      lastReviewDate: 0,
      nextReviewDate: now, // 新单词立即可学
      currentInterval: 1,
      consecutiveCorrect: 0,
      consecutiveWrong: 0,
      createdAt: now,
      updatedAt: now
    };
    
    // 保存到存储
    await this.storage.saveState(initialState);
    
    // 更新缓存
    const cacheKey = this.getCacheKey(userId, wordId);
    this.stateCache.set(cacheKey, initialState);
    
    return initialState;
  }

  /**
   * 获取单词状态
   * 
   * @param userId 用户ID
   * @param wordId 单词ID
   * @returns 单词状态，如果不存在则返回null
   */
  async getState(userId: string, wordId: string): Promise<WordLearningState | null> {
    const cacheKey = this.getCacheKey(userId, wordId);
    
    // 先查缓存
    if (this.stateCache.has(cacheKey)) {
      return this.stateCache.get(cacheKey)!;
    }
    
    // 从存储加载
    const state = await this.storage.loadState(userId, wordId);
    
    // 更新缓存
    if (state) {
      this.stateCache.set(cacheKey, state);
    }
    
    return state;
  }

  /**
   * 更新单词状态
   * 
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param updates 要更新的字段
   * @returns 更新后的单词状态
   */
  async updateState(
    userId: string,
    wordId: string,
    updates: Partial<WordLearningState>
  ): Promise<WordLearningState> {
    // 获取当前状态
    let currentState = await this.getState(userId, wordId);
    
    // 如果状态不存在，先初始化
    if (!currentState) {
      currentState = await this.initializeWordState(userId, wordId);
    }
    
    // 合并更新
    const updatedState: WordLearningState = {
      ...currentState,
      ...updates,
      updatedAt: Date.now()
    };
    
    // 保存到存储
    await this.storage.saveState(updatedState);
    
    // 更新缓存
    const cacheKey = this.getCacheKey(userId, wordId);
    this.stateCache.set(cacheKey, updatedState);
    
    return updatedState;
  }

  /**
   * 批量获取单词状态
   * 
   * @param userId 用户ID
   * @param wordIds 单词ID列表
   * @returns 单词状态列表
   */
  async batchGetStates(userId: string, wordIds: string[]): Promise<WordLearningState[]> {
    const states: WordLearningState[] = [];
    const missingWordIds: string[] = [];
    
    // 先从缓存获取
    for (const wordId of wordIds) {
      const cacheKey = this.getCacheKey(userId, wordId);
      const cachedState = this.stateCache.get(cacheKey);
      
      if (cachedState) {
        states.push(cachedState);
      } else {
        missingWordIds.push(wordId);
      }
    }
    
    // 批量加载缺失的状态
    if (missingWordIds.length > 0) {
      const loadedStates = await this.storage.batchLoadStates(userId, missingWordIds);
      
      // 更新缓存
      for (const state of loadedStates) {
        const cacheKey = this.getCacheKey(userId, state.wordId);
        this.stateCache.set(cacheKey, state);
      }
      
      states.push(...loadedStates);
    }
    
    return states;
  }

  /**
   * 按状态获取单词
   * 
   * @param userId 用户ID
   * @param state 单词状态
   * @returns 符合条件的单词ID列表
   */
  async getWordsByState(userId: string, state: WordState): Promise<string[]> {
    const allStates = await this.storage.loadAllStates(userId);
    
    return allStates
      .filter(s => s.state === state)
      .map(s => s.wordId);
  }

  /**
   * 获取到期需要复习的单词
   * 
   * @param userId 用户ID
   * @returns 到期单词的ID列表
   */
  async getDueWords(userId: string): Promise<string[]> {
    const now = Date.now();
    const allStates = await this.storage.loadAllStates(userId);
    
    return allStates
      .filter(s => 
        s.nextReviewDate && 
        s.nextReviewDate <= now &&
        s.state !== WordState.NEW
      )
      .map(s => s.wordId);
  }

  /**
   * 获取所有单词状态
   * 
   * @param userId 用户ID
   * @returns 所有单词状态列表
   */
  async getAllStates(userId: string): Promise<WordLearningState[]> {
    return await this.storage.loadAllStates(userId);
  }

  /**
   * 清除缓存
   * 
   * @param userId 用户ID（可选，如果不提供则清除所有缓存）
   */
  clearCache(userId?: string): void {
    if (userId) {
      // 清除特定用户的缓存
      const keysToDelete: string[] = [];
      for (const key of this.stateCache.keys()) {
        if (key.startsWith(`${userId}:`)) {
          keysToDelete.push(key);
        }
      }
      for (const key of keysToDelete) {
        this.stateCache.delete(key);
      }
    } else {
      // 清除所有缓存
      this.stateCache.clear();
    }
  }

  /**
   * 生成缓存键
   * 
   * @param userId 用户ID
   * @param wordId 单词ID
   * @returns 缓存键
   */
  private getCacheKey(userId: string, wordId: string): string {
    return `${userId}:${wordId}`;
  }
}

/**
 * 单词状态存储接口
 * 需要由具体的存储实现（IndexedDB、API等）来实现
 */
export interface WordStateStorage {
  /**
   * 保存单词状态
   */
  saveState(state: WordLearningState): Promise<void>;

  /**
   * 加载单词状态
   */
  loadState(userId: string, wordId: string): Promise<WordLearningState | null>;

  /**
   * 批量加载单词状态
   */
  batchLoadStates(userId: string, wordIds: string[]): Promise<WordLearningState[]>;

  /**
   * 加载用户的所有单词状态
   */
  loadAllStates(userId: string): Promise<WordLearningState[]>;

  /**
   * 删除单词状态
   */
  deleteState(userId: string, wordId: string): Promise<void>;

  /**
   * 加载单词得分（可选）
   */
  loadScore?(userId: string, wordId: string): Promise<WordScore | null>;

  /**
   * 批量加载单词得分（可选）
   */
  batchLoadScores?(userId: string, wordIds: string[]): Promise<WordScore[]>;

  /**
   * 加载最近的答题记录（可选，用于计算稳定性得分）
   */
  loadRecentAnswerRecords?(userId: string, wordId: string, limit?: number): Promise<AnswerRecord[]>;
}
