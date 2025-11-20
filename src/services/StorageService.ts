import { Word, AnswerRecord, StudyStatistics, WordStatistics } from '../types/models';
import ApiClient from './ApiClient';

/**
 * 同步状态
 */
export interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: number | null;
  error: string | null;
  pendingChanges: number;
}

/**
 * 存储模式
 */
type StorageMode = 'local' | 'cloud' | 'hybrid';

/**
 * 存储服务 - 处理数据持久化
 * 支持本地存储（IndexedDB）和云端存储（API）
 * 提供自动同步和离线支持
 */
class StorageService {
  private dbName = 'VocabularyLearningDB';
  private dbVersion = 2;
  private db: IDBDatabase | null = null;
  private mode: StorageMode = 'local';
  private syncStatus: SyncStatus = {
    isSyncing: false,
    lastSyncTime: null,
    error: null,
    pendingChanges: 0
  };
  private syncListeners: Array<(status: SyncStatus) => void> = [];
  private autoSyncInterval: number | null = null;
  private debounceSyncTimer: number | null = null;

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('Failed to open database:', request.error);
        reject(new Error('数据库打开失败'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建单词存储
        if (!db.objectStoreNames.contains('words')) {
          const wordStore = db.createObjectStore('words', { keyPath: 'id' });
          wordStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // 创建答题记录存储
        if (!db.objectStoreNames.contains('answerRecords')) {
          const recordStore = db.createObjectStore('answerRecords', { keyPath: 'id' });
          recordStore.createIndex('wordId', 'wordId', { unique: false });
          recordStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // 创建同步元数据存储
        if (!db.objectStoreNames.contains('syncMeta')) {
          db.createObjectStore('syncMeta', { keyPath: 'key' });
        }

        // 创建待同步队列
        if (!db.objectStoreNames.contains('syncQueue')) {
          const queueStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
          queueStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('数据库未初始化');
    }
    return this.db;
  }

  // ==================== 模式管理 ====================

  /**
   * 设置存储模式
   */
  setMode(mode: StorageMode): void {
    this.mode = mode;
    localStorage.setItem('storage_mode', mode);
    
    // 如果切换到云端或混合模式，启动自动同步
    if (mode === 'cloud' || mode === 'hybrid') {
      this.startAutoSync();
    } else {
      this.stopAutoSync();
    }
  }

  /**
   * 获取当前存储模式
   */
  getMode(): StorageMode {
    return this.mode;
  }

  /**
   * 检查是否已登录（有token）
   */
  private isLoggedIn(): boolean {
    return !!ApiClient.getToken();
  }

  // ==================== 同步状态管理 ====================

  /**
   * 获取同步状态
   */
  getSyncStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  /**
   * 订阅同步状态变化
   */
  onSyncStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.syncListeners.push(listener);
    return () => {
      this.syncListeners = this.syncListeners.filter(l => l !== listener);
    };
  }

  /**
   * 更新同步状态
   */
  private updateSyncStatus(updates: Partial<SyncStatus>): void {
    this.syncStatus = { ...this.syncStatus, ...updates };
    this.syncListeners.forEach(listener => listener(this.syncStatus));
  }

  // ==================== 自动同步 ====================

  /**
   * 启动自动同步（每30秒）
   */
  private startAutoSync(): void {
    if (this.autoSyncInterval) return;
    
    this.autoSyncInterval = window.setInterval(() => {
      if (this.isLoggedIn() && !this.syncStatus.isSyncing) {
        this.syncToCloud().catch(err => {
          console.error('自动同步失败:', err);
        });
      }
    }, 30000); // 30秒
  }

  /**
   * 停止自动同步
   */
  private stopAutoSync(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }

  /**
   * 手动触发同步
   */
  async syncToCloud(): Promise<void> {
    if (!this.isLoggedIn()) {
      throw new Error('未登录，无法同步');
    }

    if (this.syncStatus.isSyncing) {
      return; // 已经在同步中
    }

    try {
      this.updateSyncStatus({ isSyncing: true, error: null });

      // 1. 上传本地变更到云端
      await this.uploadLocalChanges();

      // 2. 从云端下载数据
      await this.downloadFromCloud();

      // 3. 更新同步时间
      const now = Date.now();
      await this.setSyncMeta('lastSyncTime', now);
      
      this.updateSyncStatus({
        isSyncing: false,
        lastSyncTime: now,
        pendingChanges: 0
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '同步失败';
      this.updateSyncStatus({
        isSyncing: false,
        error: errorMessage
      });
      throw error;
    }
  }

  /**
   * 防抖同步 - 延迟触发同步，避免频繁调用
   * @param delay 延迟时间（毫秒），默认 1000ms
   */
  private debouncedSync(delay: number = 1000): void {
    // 清除之前的定时器
    if (this.debounceSyncTimer) {
      clearTimeout(this.debounceSyncTimer);
    }

    // 设置新的定时器
    this.debounceSyncTimer = window.setTimeout(() => {
      this.syncToCloud().catch(err => {
        console.error('防抖同步失败:', err);
      });
    }, delay);
  }

  /**
   * 清理学习记录数据，用于上传
   */
  private sanitizeRecordForUpload(record: AnswerRecord): any {
    if (!record || !record.wordId) {
      return null;
    }
    
    return {
      wordId: record.wordId,
      selectedAnswer: record.selectedAnswer,
      correctAnswer: record.correctAnswer,
      isCorrect: record.isCorrect,
      timestamp: record.timestamp
    };
  }

  /**
   * 上传本地变更到云端
   */
  private async uploadLocalChanges(): Promise<void> {
    const db = await this.ensureDB();
    
    // 获取同步队列
    const queue = await new Promise<any[]>((resolve, reject) => {
      const transaction = db.transaction(['syncQueue'], 'readonly');
      const store = transaction.objectStore('syncQueue');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('读取同步队列失败'));
    });

    // 按类型排序：先处理单词操作，再处理学习记录操作
    // 这样可以确保学习记录引用的单词已经存在
    const sortedQueue = queue.sort((a, b) => {
      const priority: Record<string, number> = {
        'createWord': 1,
        'updateWord': 2,
        'deleteWord': 3,
        'createRecord': 4,
      };
      return (priority[a.type] || 999) - (priority[b.type] || 999);
    });

    // 处理队列中的每个操作
    for (const item of sortedQueue) {
      try {
        switch (item.type) {
          case 'createWord':
            await ApiClient.createWord(item.data);
            break;
          case 'updateWord':
            await ApiClient.updateWord(item.data.id, item.data);
            break;
          case 'deleteWord':
            await ApiClient.deleteWord(item.data.id);
            break;
          case 'createRecord':
            {
              const sanitized = this.sanitizeRecordForUpload(item.data);
              if (!sanitized) {
                console.warn('跳过无效的学习记录队列项:', item);
                break;
              }
              await ApiClient.createRecord(sanitized);
            }
            break;
        }

        // 从队列中删除已处理的项
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(['syncQueue'], 'readwrite');
          const store = transaction.objectStore('syncQueue');
          const request = store.delete(item.id);
          
          request.onsuccess = () => resolve();
          request.onerror = () => reject(new Error('删除队列项失败'));
        });
      } catch (error) {
        console.error('上传变更失败:', item, error);
        // 继续处理其他项
      }
    }

    // 比较本地和云端数据，上传本地更新或独有的单词
    try {
      const cloudWords = await ApiClient.getWords();
      const localWords = await this.getWordsFromDB();
      
      // 创建云端单词映射（按拼写）
      const cloudWordMap = new Map(cloudWords.map(w => [w.spelling.toLowerCase(), w]));
      
      // 分类本地单词
      const wordsToUpdate: Word[] = []; // 需要更新的
      const wordsToCreate: Word[] = []; // 需要创建的
      
      for (const localWord of localWords) {
        const cloudWord = cloudWordMap.get(localWord.spelling.toLowerCase());
        
        if (!cloudWord) {
          // 云端没有，需要创建
          wordsToCreate.push(localWord);
        } else if (localWord.updatedAt > cloudWord.updatedAt) {
          // 本地更新，需要更新云端
          wordsToUpdate.push(localWord);
        }
      }
      
      // 批量创建云端没有的单词
      if (wordsToCreate.length > 0) {
        try {
          const wordsData = wordsToCreate.map(w => ({
            spelling: w.spelling,
            phonetic: w.phonetic,
            meanings: w.meanings,
            examples: w.examples,
            audioUrl: w.audioUrl
          }));
          await ApiClient.batchCreateWords(wordsData);
          console.log(`上传了 ${wordsToCreate.length} 个本地独有的单词`);
        } catch (error) {
          console.error('批量创建单词失败:', error);
        }
      }
      
      // 更新本地修改过的单词
      for (const localWord of wordsToUpdate) {
        const cloudWord = cloudWordMap.get(localWord.spelling.toLowerCase());
        if (cloudWord) {
          try {
            await ApiClient.updateWord(cloudWord.id, {
              spelling: localWord.spelling,
              phonetic: localWord.phonetic,
              meanings: localWord.meanings,
              examples: localWord.examples,
              audioUrl: localWord.audioUrl
            });
          } catch (error) {
            console.error(`上传更新单词失败: ${localWord.spelling}`, error);
          }
        }
      }
      
      if (wordsToUpdate.length > 0) {
        console.log(`更新了 ${wordsToUpdate.length} 个本地修改的单词`);
      }
    } catch (error) {
      console.error('比较和上传单词失败:', error);
    }

    // 比较本地和云端数据，上传本地独有的学习记录
    try {
      const cloudRecords = await ApiClient.getRecords();
      const db = await this.ensureDB();
      const localRecords = await new Promise<AnswerRecord[]>((resolve, reject) => {
        const transaction = db.transaction(['answerRecords'], 'readonly');
        const store = transaction.objectStore('answerRecords');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('获取本地学习记录失败'));
      });
      
      // 创建云端记录映射（按wordId+timestamp）
      const cloudRecordKeys = new Set(
        cloudRecords.map(r => `${r.wordId}-${r.timestamp}`)
      );
      
      // 找出本地独有的记录（通过wordId+timestamp匹配）
      console.log(`本地记录示例:`, localRecords.slice(0, 2).map(r => ({
        wordId: r.wordId,
        timestamp: r.timestamp,
        timestampType: typeof r.timestamp
      })));
      
      const recordsToCreate = localRecords.filter(r => {
        const key = `${r.wordId}-${r.timestamp}`;
        const exists = cloudRecordKeys.has(key);
        if (!exists && localRecords.indexOf(r) < 2) {
          console.log(`本地key: ${key}, 云端keys示例:`, Array.from(cloudRecordKeys).slice(0, 3));
        }
        return !exists;
      });
      
      // 批量上传本地独有的记录
      if (recordsToCreate.length > 0) {
        try {
          const recordsData = recordsToCreate.map(r => ({
            wordId: r.wordId,
            selectedAnswer: r.selectedAnswer,
            correctAnswer: r.correctAnswer,
            isCorrect: r.isCorrect,
            timestamp: r.timestamp
          }));
          await ApiClient.batchCreateRecords(recordsData);
          console.log(`上传了 ${recordsToCreate.length} 条本地独有的学习记录`);
        } catch (error) {
          console.error('批量创建学习记录失败:', error);
        }
      }
    } catch (error) {
      console.error('比较和上传学习记录失败:', error);
    }
  }

  /**
   * 从云端下载数据
   */
  private async downloadFromCloud(): Promise<void> {
    // 下载单词
    const cloudWords = await ApiClient.getWords();
    const db = await this.ensureDB();

    // 获取本地单词
    const localWords = await this.getWordsFromDB();
    // 改为通过拼写匹配，避免ID不同导致的重复
    const localWordMap = new Map(localWords.map(w => [w.spelling.toLowerCase(), w]));

    // 合并策略：通过拼写匹配，时间戳优先
    for (const cloudWord of cloudWords) {
      const localWord = localWordMap.get(cloudWord.spelling.toLowerCase());
      
      if (!localWord) {
        // 本地没有，直接添加
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(['words'], 'readwrite');
          const store = transaction.objectStore('words');
          const request = store.put(cloudWord);
          
          request.onsuccess = () => resolve();
          request.onerror = () => reject(new Error('保存单词失败'));
        });
      } else if (cloudWord.updatedAt > localWord.updatedAt) {
        // 云端更新，替换本地的（删除旧的，添加新的）
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(['words'], 'readwrite');
          const store = transaction.objectStore('words');
          
          // 先删除本地旧的
          const deleteRequest = store.delete(localWord.id);
          deleteRequest.onsuccess = () => {
            // 再添加云端新的
            const putRequest = store.put(cloudWord);
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => reject(new Error('保存单词失败'));
          };
          deleteRequest.onerror = () => reject(new Error('删除旧单词失败'));
        });
      }
      // 如果本地更新，不做任何操作（保持本地版本）
    }

    // 下载学习记录（下载云端独有的记录）
    const cloudRecords = await ApiClient.getRecords();
    
    // 获取本地记录ID
    const localRecords = await new Promise<AnswerRecord[]>((resolve, reject) => {
      const transaction = db.transaction(['answerRecords'], 'readonly');
      const store = transaction.objectStore('answerRecords');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('获取本地记录失败'));
    });
    
    const localRecordIds = new Set(localRecords.map(r => r.id));
    
    // 找出云端独有的记录
    const recordsToDownload = cloudRecords.filter(r => !localRecordIds.has(r.id));

    for (const record of recordsToDownload) {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['answerRecords'], 'readwrite');
        const store = transaction.objectStore('answerRecords');
        const request = store.put(record);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('保存学习记录失败'));
      });
    }
    
    if (recordsToDownload.length > 0) {
      console.log(`下载了 ${recordsToDownload.length} 条云端独有的学习记录`);
    }
  }

  /**
   * 添加到同步队列
   */
  private async addToSyncQueue(type: string, data: any): Promise<void> {
    const db = await this.ensureDB();
    
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['syncQueue'], 'readwrite');
      const store = transaction.objectStore('syncQueue');
      const request = store.add({
        type,
        data,
        timestamp: Date.now()
      });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('添加到同步队列失败'));
    });

    // 更新待同步数量
    const count = await this.getSyncQueueCount();
    this.updateSyncStatus({ pendingChanges: count });
  }

  /**
   * 获取同步队列数量
   */
  private async getSyncQueueCount(): Promise<number> {
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['syncQueue'], 'readonly');
      const store = transaction.objectStore('syncQueue');
      const request = store.count();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('获取队列数量失败'));
    });
  }

  /**
   * 设置同步元数据
   */
  private async setSyncMeta(key: string, value: any): Promise<void> {
    const db = await this.ensureDB();
    
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['syncMeta'], 'readwrite');
      const store = transaction.objectStore('syncMeta');
      const request = store.put({ key, value });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('保存元数据失败'));
    });
  }

  /**
   * 获取同步元数据
   */
  private async getSyncMeta(key: string): Promise<any> {
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['syncMeta'], 'readonly');
      const store = transaction.objectStore('syncMeta');
      const request = store.get(key);
      
      request.onsuccess = () => resolve(request.result?.value);
      request.onerror = () => reject(new Error('获取元数据失败'));
    });
  }

  /**
   * 从IndexedDB获取单词
   */
  private async getWordsFromDB(): Promise<Word[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['words'], 'readonly');
      const store = transaction.objectStore('words');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('获取单词列表失败'));
    });
  }

  /**
   * 获取所有单词
   */
  async getWords(): Promise<Word[]> {
    // 云端模式：直接从API获取
    if (this.mode === 'cloud' && this.isLoggedIn()) {
      try {
        return await ApiClient.getWords();
      } catch (error) {
        console.error('从云端获取单词失败，降级到本地:', error);
        // 降级到本地
      }
    }

    // 本地或混合模式：从IndexedDB获取
    try {
      return await this.getWordsFromDB();
    } catch (error) {
      console.error('Error getting words:', error);
      // 降级策略：从 LocalStorage 读取
      return this.getWordsFromLocalStorage();
    }
  }

  /**
   * 添加单词
   */
  async addWord(word: Word): Promise<void> {
    // 保存到本地
    try {
      const db = await this.ensureDB();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['words'], 'readwrite');
        const store = transaction.objectStore('words');
        const request = store.add(word);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('添加单词失败'));
      });
    } catch (error) {
      console.error('Error adding word:', error);
      // 降级策略：保存到 LocalStorage
      await this.saveWordToLocalStorage(word);
    }

    // 如果是云端或混合模式，添加到同步队列
    if ((this.mode === 'cloud' || this.mode === 'hybrid') && this.isLoggedIn()) {
      await this.addToSyncQueue('createWord', word);
      
      // 使用防抖同步，避免频繁调用
      this.debouncedSync();
    }
  }

  /**
   * 更新单词
   */
  async updateWord(word: Word): Promise<void> {
    // 更新本地
    try {
      const db = await this.ensureDB();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['words'], 'readwrite');
        const store = transaction.objectStore('words');
        const request = store.put(word);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('更新单词失败'));
      });
    } catch (error) {
      console.error('Error updating word:', error);
      throw error;
    }

    // 如果是云端或混合模式，添加到同步队列
    if ((this.mode === 'cloud' || this.mode === 'hybrid') && this.isLoggedIn()) {
      await this.addToSyncQueue('updateWord', word);
      
      // 使用防抖同步，避免频繁调用
      this.debouncedSync();
    }
  }

  /**
   * 删除单词
   */
  async deleteWord(wordId: string): Promise<void> {
    // 删除本地
    try {
      const db = await this.ensureDB();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['words', 'answerRecords'], 'readwrite');
        
        // 删除单词
        const wordStore = transaction.objectStore('words');
        wordStore.delete(wordId);

        // 删除相关的答题记录
        const recordStore = transaction.objectStore('answerRecords');
        const index = recordStore.index('wordId');
        const request = index.openCursor(IDBKeyRange.only(wordId));

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error('删除单词失败'));
      });
    } catch (error) {
      console.error('Error deleting word:', error);
      throw error;
    }

    // 如果是云端或混合模式，添加到同步队列
    if ((this.mode === 'cloud' || this.mode === 'hybrid') && this.isLoggedIn()) {
      await this.addToSyncQueue('deleteWord', { id: wordId });
      
      // 使用防抖同步，避免频繁调用
      this.debouncedSync();
    }
  }

  /**
   * 保存答题记录
   */
  async saveAnswerRecord(record: AnswerRecord): Promise<void> {
    // 保存到本地
    try {
      const db = await this.ensureDB();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['answerRecords'], 'readwrite');
        const store = transaction.objectStore('answerRecords');
        const request = store.add(record);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('保存答题记录失败'));
      });
    } catch (error) {
      console.error('Error saving answer record:', error);
      throw error;
    }

    // 如果是云端或混合模式，添加到同步队列
    if ((this.mode === 'cloud' || this.mode === 'hybrid') && this.isLoggedIn()) {
      await this.addToSyncQueue('createRecord', record);
      
      // 使用防抖同步，避免频繁调用
      this.debouncedSync();
    }
  }

  /**
   * 获取指定单词的答题记录
   */
  async getAnswerRecords(wordId: string): Promise<AnswerRecord[]> {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['answerRecords'], 'readonly');
        const store = transaction.objectStore('answerRecords');
        const index = store.index('wordId');
        const request = index.getAll(wordId);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('获取答题记录失败'));
      });
    } catch (error) {
      console.error('Error getting answer records:', error);
      return [];
    }
  }

  /**
   * 获取学习统计
   */
  async getStudyStatistics(): Promise<StudyStatistics> {
    try {
      const words = await this.getWords();
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['answerRecords'], 'readonly');
        const store = transaction.objectStore('answerRecords');
        const request = store.getAll();

        request.onsuccess = () => {
          const records: AnswerRecord[] = request.result;
          const wordStats = new Map<string, WordStatistics>();

          // 计算每个单词的统计
          records.forEach(record => {
            const stats = wordStats.get(record.wordId) || {
              attempts: 0,
              correct: 0,
              lastStudied: 0
            };

            stats.attempts++;
            if (record.isCorrect) {
              stats.correct++;
            }
            stats.lastStudied = Math.max(stats.lastStudied, record.timestamp);

            wordStats.set(record.wordId, stats);
          });

          // 计算总体统计
          const studiedWords = wordStats.size;
          const totalCorrect = Array.from(wordStats.values()).reduce((sum, s) => sum + s.correct, 0);
          const totalAttempts = Array.from(wordStats.values()).reduce((sum, s) => sum + s.attempts, 0);
          const correctRate = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;

          resolve({
            totalWords: words.length,
            studiedWords,
            correctRate,
            wordStats
          });
        };

        request.onerror = () => reject(new Error('获取学习统计失败'));
      });
    } catch (error) {
      console.error('Error getting study statistics:', error);
      return {
        totalWords: 0,
        studiedWords: 0,
        correctRate: 0,
        wordStats: new Map()
      };
    }
  }

  // ==================== 数据迁移 ====================

  /**
   * 将本地数据迁移到云端
   */
  async migrateToCloud(): Promise<{ words: number; records: number }> {
    if (!this.isLoggedIn()) {
      throw new Error('未登录，无法迁移数据');
    }

    try {
      this.updateSyncStatus({ isSyncing: true, error: null });

      // 1. 获取所有本地单词
      const localWords = await this.getWordsFromDB();
      
      // 2. 批量上传单词
      let uploadedWords = 0;
      if (localWords.length > 0) {
        const wordsToUpload = localWords.map(w => ({
          spelling: w.spelling,
          phonetic: w.phonetic,
          meanings: w.meanings,
          examples: w.examples,
          audioUrl: w.audioUrl
        }));
        
        await ApiClient.batchCreateWords(wordsToUpload);
        uploadedWords = localWords.length;
      }

      // 3. 获取所有本地学习记录
      const db = await this.ensureDB();
      const localRecords = await new Promise<AnswerRecord[]>((resolve, reject) => {
        const transaction = db.transaction(['answerRecords'], 'readonly');
        const store = transaction.objectStore('answerRecords');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('获取学习记录失败'));
      });

      // 4. 批量上传学习记录
      let uploadedRecords = 0;
      if (localRecords.length > 0) {
        const recordsToUpload = localRecords.map(r => ({
          wordId: r.wordId,
          selectedAnswer: r.selectedAnswer,
          correctAnswer: r.correctAnswer,
          isCorrect: r.isCorrect,
          timestamp: r.timestamp
        }));
        
        await ApiClient.batchCreateRecords(recordsToUpload);
        uploadedRecords = localRecords.length;
      }

      // 5. 清空同步队列
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['syncQueue'], 'readwrite');
        const store = transaction.objectStore('syncQueue');
        const request = store.clear();
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('清空同步队列失败'));
      });

      // 6. 更新同步时间
      const now = Date.now();
      await this.setSyncMeta('lastSyncTime', now);
      await this.setSyncMeta('migrated', true);

      this.updateSyncStatus({
        isSyncing: false,
        lastSyncTime: now,
        pendingChanges: 0
      });

      return { words: uploadedWords, records: uploadedRecords };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '迁移失败';
      this.updateSyncStatus({
        isSyncing: false,
        error: errorMessage
      });
      throw error;
    }
  }

  /**
   * 检查是否已迁移
   */
  async isMigrated(): Promise<boolean> {
    try {
      return await this.getSyncMeta('migrated') || false;
    } catch {
      return false;
    }
  }

  /**
   * 清除本地数据（迁移后可选）
   */
  async clearLocalData(): Promise<void> {
    const db = await this.ensureDB();
    
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['words', 'answerRecords'], 'readwrite');
      
      transaction.objectStore('words').clear();
      transaction.objectStore('answerRecords').clear();
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('清除本地数据失败'));
    });
  }

  /**
   * 完全删除IndexedDB数据库
   * 用于清除旧数据或重置应用
   */
  async deleteDatabase(): Promise<void> {
    // 关闭当前连接
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    // 停止自动同步
    this.stopAutoSync();

    // 删除数据库
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName);
      
      request.onsuccess = () => {
        console.log('IndexedDB数据库已删除');
        // 清除LocalStorage中的相关数据
        localStorage.removeItem('vocabulary_words');
        localStorage.removeItem('storage_mode');
        resolve();
      };
      
      request.onerror = () => {
        console.error('删除数据库失败:', request.error);
        reject(new Error('删除数据库失败'));
      };
      
      request.onblocked = () => {
        console.warn('数据库删除被阻止，请关闭所有使用该数据库的标签页');
        reject(new Error('数据库删除被阻止'));
      };
    });
  }

  // LocalStorage 降级方法
  private getWordsFromLocalStorage(): Word[] {
    try {
      const data = localStorage.getItem('vocabulary_words');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private async saveWordToLocalStorage(word: Word): Promise<void> {
    try {
      const words = this.getWordsFromLocalStorage();
      words.push(word);
      localStorage.setItem('vocabulary_words', JSON.stringify(words));
    } catch (error) {
      console.error('Failed to save to LocalStorage:', error);
    }
  }
}

export default new StorageService();
