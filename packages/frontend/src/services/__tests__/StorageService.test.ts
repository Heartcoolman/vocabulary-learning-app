/**
 * StorageService Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  Word,
  AnswerRecord,
  WordLearningState,
  WordScore,
  WordState,
} from '../../types/models';

// Mock client
vi.mock('../client', () => ({
  default: {
    getToken: vi.fn(),
    getWords: vi.fn(),
    createWord: vi.fn(),
    updateWord: vi.fn(),
    deleteWord: vi.fn(),
    getRecords: vi.fn(),
    createRecord: vi.fn(),
    getWordLearningState: vi.fn(),
    saveWordLearningState: vi.fn(),
    getWordLearningStates: vi.fn(),
    getWordsByState: vi.fn(),
    getDueWords: vi.fn(),
    getWordScore: vi.fn(),
    saveWordScore: vi.fn(),
    getWordScores: vi.fn(),
    getWordsByScoreRange: vi.fn(),
    getAlgorithmConfig: vi.fn(),
    updateAlgorithmConfig: vi.fn(),
    resetAlgorithmConfig: vi.fn(),
    getConfigHistory: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  storageLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// Import after mocking
import ApiClient from '../client';

// We need to reset the module to get a fresh instance for each test
const getStorageService = async () => {
  vi.resetModules();
  const { default: StorageService } = await import('../StorageService');
  return StorageService;
};

describe('StorageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==================== 缓存管理测试 ====================
  describe('Cache Management', () => {
    describe('isCacheValid', () => {
      it('should return cached words if cache is valid', async () => {
        const StorageService = await getStorageService();
        const mockWords: Word[] = [
          {
            id: 'word-1',
            spelling: 'hello',
            phonetic: '/həˈləʊ/',
            meanings: ['你好'],
            examples: ['Hello, world!'],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWords).mockResolvedValue(mockWords);

        // 第一次调用会从 API 获取
        const words1 = await StorageService.getWords();
        expect(ApiClient.getWords).toHaveBeenCalledTimes(1);
        expect(words1).toEqual(mockWords);

        // 第二次调用应该返回缓存（在 5 分钟内）
        const words2 = await StorageService.getWords();
        expect(ApiClient.getWords).toHaveBeenCalledTimes(1); // 仍然是 1 次
        expect(words2).toEqual(mockWords);
      });

      it('should fetch from API if cache is expired', async () => {
        const StorageService = await getStorageService();
        const mockWords: Word[] = [
          {
            id: 'word-1',
            spelling: 'hello',
            phonetic: '/həˈləʊ/',
            meanings: ['你好'],
            examples: ['Hello, world!'],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWords).mockResolvedValue(mockWords);

        // 第一次调用
        await StorageService.getWords();
        expect(ApiClient.getWords).toHaveBeenCalledTimes(1);

        // 时间前进 6 分钟（超过 5 分钟的 TTL）
        vi.advanceTimersByTime(6 * 60 * 1000);

        // 第二次调用应该重新从 API 获取
        await StorageService.getWords();
        expect(ApiClient.getWords).toHaveBeenCalledTimes(2);
      });

      it('should return stale cache if API fails and cache exists', async () => {
        const StorageService = await getStorageService();
        const mockWords: Word[] = [
          {
            id: 'word-1',
            spelling: 'hello',
            phonetic: '/həˈləʊ/',
            meanings: ['你好'],
            examples: ['Hello, world!'],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWords).mockResolvedValueOnce(mockWords);

        // 第一次调用成功
        await StorageService.getWords();

        // 时间前进超过 TTL
        vi.advanceTimersByTime(6 * 60 * 1000);

        // API 失败
        vi.mocked(ApiClient.getWords).mockRejectedValueOnce(new Error('Network error'));

        // 应该返回过期的缓存数据
        const words = await StorageService.getWords();
        expect(words).toEqual(mockWords);
      });
    });
  });

  // ==================== 单词数据测试 ====================
  describe('Word Data', () => {
    describe('getWords', () => {
      it('should fetch words from API and cache them', async () => {
        const StorageService = await getStorageService();
        const mockWords: Word[] = [
          {
            id: 'word-1',
            spelling: 'test',
            phonetic: '/test/',
            meanings: ['测试'],
            examples: ['This is a test.'],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          {
            id: 'word-2',
            spelling: 'hello',
            phonetic: '/həˈləʊ/',
            meanings: ['你好'],
            examples: ['Hello!'],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWords).mockResolvedValue(mockWords);

        const words = await StorageService.getWords();

        expect(ApiClient.getWords).toHaveBeenCalled();
        expect(words).toEqual(mockWords);
        expect(words).toHaveLength(2);
      });

      it('should throw error if API fails and no cache', async () => {
        const StorageService = await getStorageService();

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWords).mockRejectedValue(new Error('API Error'));

        await expect(StorageService.getWords()).rejects.toThrow('API Error');
      });
    });

    describe('addWord', () => {
      it('should add word via API and refresh cache', async () => {
        const StorageService = await getStorageService();
        const newWord: Word = {
          id: 'word-new',
          spelling: 'new',
          phonetic: '/njuː/',
          meanings: ['新的'],
          examples: ['This is new.'],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.createWord).mockResolvedValue(newWord);
        vi.mocked(ApiClient.getWords).mockResolvedValue([newWord]);

        await StorageService.addWord(newWord);

        expect(ApiClient.createWord).toHaveBeenCalledWith({
          spelling: newWord.spelling,
          phonetic: newWord.phonetic,
          meanings: newWord.meanings,
          examples: newWord.examples,
          audioUrl: newWord.audioUrl,
        });
        expect(ApiClient.getWords).toHaveBeenCalled();
      });
    });

    describe('updateWord', () => {
      it('should update word via API and refresh cache', async () => {
        const StorageService = await getStorageService();
        const updatedWord: Word = {
          id: 'word-1',
          spelling: 'updated',
          phonetic: '/ʌpˈdeɪtɪd/',
          meanings: ['更新的'],
          examples: ['This is updated.'],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.updateWord).mockResolvedValue(updatedWord);
        vi.mocked(ApiClient.getWords).mockResolvedValue([updatedWord]);

        await StorageService.updateWord(updatedWord);

        expect(ApiClient.updateWord).toHaveBeenCalledWith(updatedWord.id, {
          spelling: updatedWord.spelling,
          phonetic: updatedWord.phonetic,
          meanings: updatedWord.meanings,
          examples: updatedWord.examples,
          audioUrl: updatedWord.audioUrl,
        });
        expect(ApiClient.getWords).toHaveBeenCalled();
      });
    });

    describe('deleteWord', () => {
      it('should delete word via API and update cache', async () => {
        const StorageService = await getStorageService();
        const wordId = 'word-to-delete';

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.deleteWord).mockResolvedValue(undefined);

        await StorageService.deleteWord(wordId);

        expect(ApiClient.deleteWord).toHaveBeenCalledWith(wordId);
      });
    });
  });

  // ==================== 学习状态测试 ====================
  describe('Learning State', () => {
    describe('getWordLearningState', () => {
      it('should get word learning state from API', async () => {
        const StorageService = await getStorageService();
        const mockState: WordLearningState = {
          id: 'state-1',
          userId: 'user-1',
          wordId: 'word-1',
          state: 'learning' as WordState,
          masteryLevel: 2,
          easeFactor: 2.5,
          reviewCount: 5,
          lastReviewDate: Date.now() - 86400000,
          nextReviewDate: Date.now() + 86400000,
          currentInterval: 1,
          consecutiveCorrect: 2,
          consecutiveWrong: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWordLearningState).mockResolvedValue(mockState);

        const state = await StorageService.getWordLearningState('user-1', 'word-1');

        expect(ApiClient.getWordLearningState).toHaveBeenCalledWith('word-1');
        expect(state).toEqual(mockState);
      });

      it('should return null if state not found', async () => {
        const StorageService = await getStorageService();

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWordLearningState).mockResolvedValue(null);

        const state = await StorageService.getWordLearningState('user-1', 'word-1');

        expect(state).toBeNull();
      });

      it('should return null on API error', async () => {
        const StorageService = await getStorageService();

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWordLearningState).mockRejectedValue(new Error('API Error'));

        const state = await StorageService.getWordLearningState('user-1', 'word-1');

        expect(state).toBeNull();
      });
    });

    describe('saveWordLearningState', () => {
      it('should save word learning state via API', async () => {
        const StorageService = await getStorageService();
        const mockState: WordLearningState = {
          id: 'state-1',
          userId: 'user-1',
          wordId: 'word-1',
          state: 'reviewing' as WordState,
          masteryLevel: 3,
          easeFactor: 2.6,
          reviewCount: 10,
          lastReviewDate: Date.now(),
          nextReviewDate: Date.now() + 172800000,
          currentInterval: 2,
          consecutiveCorrect: 5,
          consecutiveWrong: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.saveWordLearningState).mockResolvedValue(undefined);

        await StorageService.saveWordLearningState(mockState);

        expect(ApiClient.saveWordLearningState).toHaveBeenCalledWith(mockState);
      });

      it('should throw error if save fails', async () => {
        const StorageService = await getStorageService();
        const mockState: WordLearningState = {
          id: 'state-1',
          userId: 'user-1',
          wordId: 'word-1',
          state: 'new' as WordState,
          masteryLevel: 0,
          easeFactor: 2.5,
          reviewCount: 0,
          lastReviewDate: null,
          nextReviewDate: null,
          currentInterval: 0,
          consecutiveCorrect: 0,
          consecutiveWrong: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.saveWordLearningState).mockRejectedValue(new Error('Save failed'));

        await expect(StorageService.saveWordLearningState(mockState)).rejects.toThrow(
          'Save failed',
        );
      });
    });

    describe('getWordLearningStates', () => {
      it('should get batch word learning states', async () => {
        const StorageService = await getStorageService();
        const mockStates: WordLearningState[] = [
          {
            id: 'state-1',
            userId: 'user-1',
            wordId: 'word-1',
            state: 'learning' as WordState,
            masteryLevel: 2,
            easeFactor: 2.5,
            reviewCount: 5,
            lastReviewDate: Date.now(),
            nextReviewDate: Date.now() + 86400000,
            currentInterval: 1,
            consecutiveCorrect: 2,
            consecutiveWrong: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          {
            id: 'state-2',
            userId: 'user-1',
            wordId: 'word-2',
            state: 'reviewing' as WordState,
            masteryLevel: 4,
            easeFactor: 2.8,
            reviewCount: 15,
            lastReviewDate: Date.now(),
            nextReviewDate: Date.now() + 604800000,
            currentInterval: 7,
            consecutiveCorrect: 8,
            consecutiveWrong: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWordLearningStates).mockResolvedValue(mockStates);

        const states = await StorageService.getWordLearningStates('user-1', ['word-1', 'word-2']);

        expect(ApiClient.getWordLearningStates).toHaveBeenCalledWith(['word-1', 'word-2']);
        expect(states).toEqual(mockStates);
        expect(states).toHaveLength(2);
      });

      it('should return empty array for empty wordIds', async () => {
        const StorageService = await getStorageService();

        const states = await StorageService.getWordLearningStates('user-1', []);

        expect(ApiClient.getWordLearningStates).not.toHaveBeenCalled();
        expect(states).toEqual([]);
      });

      it('should return empty array on API error', async () => {
        const StorageService = await getStorageService();

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWordLearningStates).mockRejectedValue(new Error('API Error'));

        const states = await StorageService.getWordLearningStates('user-1', ['word-1']);

        expect(states).toEqual([]);
      });
    });

    describe('getWordsByState', () => {
      it('should get words by state from API', async () => {
        const StorageService = await getStorageService();
        const mockStates: WordLearningState[] = [
          {
            id: 'state-1',
            userId: 'user-1',
            wordId: 'word-1',
            state: 'learning' as WordState,
            masteryLevel: 2,
            easeFactor: 2.5,
            reviewCount: 5,
            lastReviewDate: Date.now(),
            nextReviewDate: Date.now() + 86400000,
            currentInterval: 1,
            consecutiveCorrect: 2,
            consecutiveWrong: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWordsByState).mockResolvedValue(mockStates);

        const states = await StorageService.getWordsByState('user-1', 'learning' as WordState);

        expect(ApiClient.getWordsByState).toHaveBeenCalledWith('learning');
        expect(states).toEqual(mockStates);
      });
    });

    describe('getDueWords', () => {
      it('should get due words from API', async () => {
        const StorageService = await getStorageService();
        const mockStates: WordLearningState[] = [
          {
            id: 'state-1',
            userId: 'user-1',
            wordId: 'word-1',
            state: 'reviewing' as WordState,
            masteryLevel: 3,
            easeFactor: 2.5,
            reviewCount: 10,
            lastReviewDate: Date.now() - 86400000,
            nextReviewDate: Date.now() - 3600000, // 已过期
            currentInterval: 1,
            consecutiveCorrect: 3,
            consecutiveWrong: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getDueWords).mockResolvedValue(mockStates);

        const states = await StorageService.getDueWords('user-1');

        expect(ApiClient.getDueWords).toHaveBeenCalled();
        expect(states).toEqual(mockStates);
      });

      it('should return empty array on API error', async () => {
        const StorageService = await getStorageService();

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getDueWords).mockRejectedValue(new Error('API Error'));

        const states = await StorageService.getDueWords('user-1');

        expect(states).toEqual([]);
      });
    });
  });

  // ==================== 同步功能测试 ====================
  describe('Sync Functions', () => {
    describe('syncToCloud', () => {
      it('should refresh cache from cloud', async () => {
        const StorageService = await getStorageService();
        const mockWords: Word[] = [
          {
            id: 'word-1',
            spelling: 'synced',
            phonetic: '/sɪŋkt/',
            meanings: ['同步的'],
            examples: ['Data is synced.'],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWords).mockResolvedValue(mockWords);

        await StorageService.syncToCloud();

        expect(ApiClient.getWords).toHaveBeenCalled();
        const syncStatus = StorageService.getSyncStatus();
        expect(syncStatus.lastSyncTime).not.toBeNull();
        expect(syncStatus.error).toBeNull();
      });

      it('should not sync if already syncing', async () => {
        const StorageService = await getStorageService();

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        // 模拟长时间请求
        vi.mocked(ApiClient.getWords).mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve([]), 5000)),
        );

        // 第一次调用
        const sync1 = StorageService.syncToCloud();
        // 立即第二次调用
        const sync2 = StorageService.syncToCloud();

        // 等待第一次调用完成
        vi.advanceTimersByTime(5000);
        await sync1;
        await sync2;

        // 应该只调用一次
        expect(ApiClient.getWords).toHaveBeenCalledTimes(1);
      });

      it('should set error status on sync failure', async () => {
        const StorageService = await getStorageService();

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWords).mockRejectedValue(new Error('Sync failed'));

        await expect(StorageService.syncToCloud()).rejects.toThrow('Sync failed');

        const syncStatus = StorageService.getSyncStatus();
        expect(syncStatus.error).toBe('Sync failed');
        expect(syncStatus.isSyncing).toBe(false);
      });

      it('should skip sync if not authenticated', async () => {
        const StorageService = await getStorageService();

        vi.mocked(ApiClient.getToken).mockReturnValue(null);

        await StorageService.syncToCloud();

        expect(ApiClient.getWords).not.toHaveBeenCalled();
      });
    });

    describe('getSyncStatus', () => {
      it('should return current sync status', async () => {
        const StorageService = await getStorageService();

        const status = StorageService.getSyncStatus();

        expect(status).toHaveProperty('isSyncing');
        expect(status).toHaveProperty('lastSyncTime');
        expect(status).toHaveProperty('error');
        expect(status).toHaveProperty('pendingChanges');
      });
    });

    describe('onSyncStatusChange', () => {
      it('should call listener when sync status changes', async () => {
        const StorageService = await getStorageService();
        const mockWords: Word[] = [];

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWords).mockResolvedValue(mockWords);

        const listener = vi.fn();
        const unsubscribe = StorageService.onSyncStatusChange(listener);

        await StorageService.syncToCloud();

        expect(listener).toHaveBeenCalled();

        unsubscribe();
      });

      it('should unsubscribe listener', async () => {
        const StorageService = await getStorageService();
        const mockWords: Word[] = [];

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWords).mockResolvedValue(mockWords);

        const listener = vi.fn();
        const unsubscribe = StorageService.onSyncStatusChange(listener);

        unsubscribe();

        await StorageService.syncToCloud();

        // 取消订阅后不应该再调用
        expect(listener).not.toHaveBeenCalled();
      });
    });
  });

  // ==================== 清除功能测试 ====================
  describe('Clear Functions', () => {
    describe('clearLocalData', () => {
      it('should clear word cache', async () => {
        const StorageService = await getStorageService();
        const mockWords: Word[] = [
          {
            id: 'word-1',
            spelling: 'cached',
            phonetic: '/kæʃt/',
            meanings: ['缓存的'],
            examples: ['Data is cached.'],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWords).mockResolvedValue(mockWords);

        // 先获取数据建立缓存
        await StorageService.getWords();
        expect(ApiClient.getWords).toHaveBeenCalledTimes(1);

        // 清除缓存
        await StorageService.clearLocalData();

        // 再次获取应该重新调用 API
        await StorageService.getWords();
        expect(ApiClient.getWords).toHaveBeenCalledTimes(2);
      });
    });

    describe('deleteDatabase', () => {
      it('should clear all local data', async () => {
        const StorageService = await getStorageService();

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWords).mockResolvedValue([]);

        // 先获取数据建立缓存
        await StorageService.getWords();

        // 删除数据库
        await StorageService.deleteDatabase();

        // 再次获取应该重新调用 API
        await StorageService.getWords();
        expect(ApiClient.getWords).toHaveBeenCalledTimes(2);
      });
    });

    describe('setCurrentUser', () => {
      it('should clear cache when switching user', async () => {
        const StorageService = await getStorageService();
        const mockWords: Word[] = [
          {
            id: 'word-1',
            spelling: 'test',
            phonetic: '/test/',
            meanings: ['测试'],
            examples: ['Test.'],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWords).mockResolvedValue(mockWords);

        // 先获取数据
        await StorageService.getWords();
        expect(ApiClient.getWords).toHaveBeenCalledTimes(1);

        // 切换用户
        await StorageService.setCurrentUser('user-2');

        // 应该重新调用 API（切换用户时会重新初始化）
        expect(ApiClient.getWords).toHaveBeenCalledTimes(2);
      });

      it('should reset sync status when clearing user', async () => {
        const StorageService = await getStorageService();

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');

        await StorageService.setCurrentUser(null);

        const status = StorageService.getSyncStatus();
        expect(status.lastSyncTime).toBeNull();
        expect(status.pendingChanges).toBe(0);
        expect(status.error).toBeNull();
      });
    });
  });

  // ==================== 答题记录测试 ====================
  describe('Answer Records', () => {
    describe('saveAnswerRecord', () => {
      it('should save answer record via API', async () => {
        const StorageService = await getStorageService();
        const mockRecord: AnswerRecord = {
          id: 'record-1',
          userId: 'user-1',
          wordId: 'word-1',
          selectedAnswer: '你好',
          correctAnswer: '你好',
          isCorrect: true,
          timestamp: Date.now(),
          responseTime: 2000,
          dwellTime: 5000,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.createRecord).mockResolvedValue(mockRecord);

        await StorageService.saveAnswerRecord(mockRecord);

        expect(ApiClient.createRecord).toHaveBeenCalledWith({
          wordId: mockRecord.wordId,
          selectedAnswer: mockRecord.selectedAnswer,
          correctAnswer: mockRecord.correctAnswer,
          isCorrect: mockRecord.isCorrect,
          timestamp: mockRecord.timestamp,
        });
      });
    });

    describe('getAnswerRecords', () => {
      it('should get answer records for a word', async () => {
        const StorageService = await getStorageService();
        const mockRecords: AnswerRecord[] = [
          {
            id: 'record-1',
            userId: 'user-1',
            wordId: 'word-1',
            selectedAnswer: '你好',
            correctAnswer: '你好',
            isCorrect: true,
            timestamp: Date.now() - 86400000,
            createdAt: Date.now() - 86400000,
            updatedAt: Date.now() - 86400000,
          },
          {
            id: 'record-2',
            userId: 'user-1',
            wordId: 'word-1',
            selectedAnswer: '再见',
            correctAnswer: '你好',
            isCorrect: false,
            timestamp: Date.now(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getRecords).mockResolvedValue({
          records: mockRecords,
          pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
        });

        const records = await StorageService.getAnswerRecords('word-1');

        expect(ApiClient.getRecords).toHaveBeenCalledWith({ page: 1, pageSize: 100 });
        expect(records).toHaveLength(2);
        expect(records.every((r) => r.wordId === 'word-1')).toBe(true);
      });

      it('should return empty array on API error', async () => {
        const StorageService = await getStorageService();

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getRecords).mockRejectedValue(new Error('API Error'));

        const records = await StorageService.getAnswerRecords('word-1');

        expect(records).toEqual([]);
      });
    });

    describe('saveAnswerRecordExtended', () => {
      it('should save extended answer record with all fields', async () => {
        const StorageService = await getStorageService();
        const mockRecord: AnswerRecord = {
          id: 'record-1',
          userId: 'user-1',
          wordId: 'word-1',
          selectedAnswer: '你好',
          correctAnswer: '你好',
          isCorrect: true,
          timestamp: Date.now(),
          responseTime: 2500,
          dwellTime: 8000,
          sessionId: 'session-1',
          masteryLevelBefore: 2,
          masteryLevelAfter: 3,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.createRecord).mockResolvedValue(mockRecord);

        await StorageService.saveAnswerRecordExtended(mockRecord);

        expect(ApiClient.createRecord).toHaveBeenCalledWith({
          wordId: mockRecord.wordId,
          selectedAnswer: mockRecord.selectedAnswer,
          correctAnswer: mockRecord.correctAnswer,
          isCorrect: mockRecord.isCorrect,
          timestamp: mockRecord.timestamp,
          responseTime: mockRecord.responseTime,
          dwellTime: mockRecord.dwellTime,
          sessionId: mockRecord.sessionId,
          masteryLevelBefore: mockRecord.masteryLevelBefore,
          masteryLevelAfter: mockRecord.masteryLevelAfter,
        });
      });
    });
  });

  // ==================== 学习统计测试 ====================
  describe('Study Statistics', () => {
    describe('getStudyStatistics', () => {
      it('should calculate study statistics correctly', async () => {
        const StorageService = await getStorageService();
        const mockWords: Word[] = [
          {
            id: 'word-1',
            spelling: 'hello',
            phonetic: '',
            meanings: [],
            examples: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          {
            id: 'word-2',
            spelling: 'world',
            phonetic: '',
            meanings: [],
            examples: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          {
            id: 'word-3',
            spelling: 'test',
            phonetic: '',
            meanings: [],
            examples: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];
        const mockRecords: AnswerRecord[] = [
          {
            id: 'r1',
            userId: 'user-1',
            wordId: 'word-1',
            selectedAnswer: 'a',
            correctAnswer: 'a',
            isCorrect: true,
            timestamp: Date.now() - 100000,
            createdAt: Date.now() - 100000,
            updatedAt: Date.now() - 100000,
          },
          {
            id: 'r2',
            userId: 'user-1',
            wordId: 'word-1',
            selectedAnswer: 'a',
            correctAnswer: 'a',
            isCorrect: true,
            timestamp: Date.now(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          {
            id: 'r3',
            userId: 'user-1',
            wordId: 'word-2',
            selectedAnswer: 'b',
            correctAnswer: 'a',
            isCorrect: false,
            timestamp: Date.now(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWords).mockResolvedValue(mockWords);
        vi.mocked(ApiClient.getRecords).mockResolvedValue({
          records: mockRecords,
          pagination: { page: 1, pageSize: 100, total: 3, totalPages: 1 },
        });

        const stats = await StorageService.getStudyStatistics();

        expect(stats.totalWords).toBe(3);
        expect(stats.studiedWords).toBe(2); // word-1 and word-2
        expect(stats.correctRate).toBeCloseTo(2 / 3); // 2 correct out of 3
        expect(stats.wordStats.size).toBe(2);
        expect(stats.wordStats.get('word-1')?.attempts).toBe(2);
        expect(stats.wordStats.get('word-1')?.correct).toBe(2);
        expect(stats.wordStats.get('word-2')?.attempts).toBe(1);
        expect(stats.wordStats.get('word-2')?.correct).toBe(0);
      });

      it('should return empty statistics on error', async () => {
        const StorageService = await getStorageService();

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWords).mockRejectedValue(new Error('API Error'));

        const stats = await StorageService.getStudyStatistics();

        expect(stats.totalWords).toBe(0);
        expect(stats.studiedWords).toBe(0);
        expect(stats.correctRate).toBe(0);
        expect(stats.wordStats.size).toBe(0);
      });
    });
  });

  // ==================== 单词得分测试 ====================
  describe('Word Score', () => {
    describe('getWordScore', () => {
      it('should get word score from API', async () => {
        const StorageService = await getStorageService();
        const mockScore: WordScore = {
          id: 'score-1',
          userId: 'user-1',
          wordId: 'word-1',
          totalScore: 85,
          accuracyScore: 90,
          speedScore: 80,
          stabilityScore: 85,
          proficiencyScore: 85,
          totalAttempts: 10,
          correctAttempts: 9,
          averageResponseTime: 2500,
          averageDwellTime: 5000,
          recentAccuracy: 0.95,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWordScore).mockResolvedValue(mockScore);

        const score = await StorageService.getWordScore('user-1', 'word-1');

        expect(ApiClient.getWordScore).toHaveBeenCalledWith('word-1');
        expect(score).toEqual(mockScore);
      });

      it('should return null if score not found', async () => {
        const StorageService = await getStorageService();

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWordScore).mockResolvedValue(null);

        const score = await StorageService.getWordScore('user-1', 'word-1');

        expect(score).toBeNull();
      });
    });

    describe('saveWordScore', () => {
      it('should save word score via API', async () => {
        const StorageService = await getStorageService();
        const mockScore: WordScore = {
          id: 'score-1',
          userId: 'user-1',
          wordId: 'word-1',
          totalScore: 90,
          accuracyScore: 95,
          speedScore: 85,
          stabilityScore: 90,
          proficiencyScore: 90,
          totalAttempts: 15,
          correctAttempts: 14,
          averageResponseTime: 2000,
          averageDwellTime: 4500,
          recentAccuracy: 0.98,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.saveWordScore).mockResolvedValue(undefined);

        await StorageService.saveWordScore(mockScore);

        expect(ApiClient.saveWordScore).toHaveBeenCalledWith(mockScore);
      });
    });

    describe('getWordScores', () => {
      it('should get batch word scores', async () => {
        const StorageService = await getStorageService();
        const mockScores: WordScore[] = [
          {
            id: 'score-1',
            userId: 'user-1',
            wordId: 'word-1',
            totalScore: 85,
            accuracyScore: 90,
            speedScore: 80,
            stabilityScore: 85,
            proficiencyScore: 85,
            totalAttempts: 10,
            correctAttempts: 9,
            averageResponseTime: 2500,
            averageDwellTime: 5000,
            recentAccuracy: 0.95,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWordScores).mockResolvedValue(mockScores);

        const scores = await StorageService.getWordScores('user-1', ['word-1']);

        expect(ApiClient.getWordScores).toHaveBeenCalledWith(['word-1']);
        expect(scores).toEqual(mockScores);
      });
    });

    describe('getWordsByScoreRange', () => {
      it('should get words by score range', async () => {
        const StorageService = await getStorageService();
        const mockScores: WordScore[] = [
          {
            id: 'score-1',
            userId: 'user-1',
            wordId: 'word-1',
            totalScore: 75,
            accuracyScore: 80,
            speedScore: 70,
            stabilityScore: 75,
            proficiencyScore: 75,
            totalAttempts: 10,
            correctAttempts: 8,
            averageResponseTime: 3000,
            averageDwellTime: 6000,
            recentAccuracy: 0.8,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWordsByScoreRange).mockResolvedValue(mockScores);

        const scores = await StorageService.getWordsByScoreRange('user-1', 60, 80);

        expect(ApiClient.getWordsByScoreRange).toHaveBeenCalledWith(60, 80);
        expect(scores).toEqual(mockScores);
      });
    });
  });

  // ==================== 算法配置测试 ====================
  describe('Algorithm Config', () => {
    describe('getAlgorithmConfig', () => {
      it('should get algorithm config from API', async () => {
        const StorageService = await getStorageService();
        const mockConfig = {
          id: 'config-1',
          name: 'Default',
          description: 'Default configuration',
          reviewIntervals: [1, 3, 7, 14, 30],
          consecutiveCorrectThreshold: 5,
          consecutiveWrongThreshold: 3,
          difficultyAdjustmentInterval: 1,
          priorityWeights: {
            newWord: 0.3,
            errorRate: 0.3,
            overdueTime: 0.2,
            wordScore: 0.2,
          },
          masteryThresholds: [],
          scoreWeights: {
            accuracy: 0.4,
            speed: 0.2,
            stability: 0.2,
            proficiency: 0.2,
          },
          speedThresholds: {
            excellent: 3000,
            good: 5000,
            average: 10000,
            slow: 15000,
          },
          newWordRatio: {
            default: 0.3,
            highAccuracy: 0.5,
            lowAccuracy: 0.1,
            highAccuracyThreshold: 0.85,
            lowAccuracyThreshold: 0.65,
          },
          isDefault: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: 'system',
        };

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getAlgorithmConfig).mockResolvedValue(mockConfig);

        const config = await StorageService.getAlgorithmConfig();

        expect(ApiClient.getAlgorithmConfig).toHaveBeenCalled();
        expect(config).toEqual(mockConfig);
      });

      it('should return null on API error', async () => {
        const StorageService = await getStorageService();

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getAlgorithmConfig).mockRejectedValue(new Error('API Error'));

        const config = await StorageService.getAlgorithmConfig();

        expect(config).toBeNull();
      });
    });

    describe('updateAlgorithmConfig', () => {
      it('should update algorithm config via API', async () => {
        const StorageService = await getStorageService();
        const configUpdate = {
          consecutiveCorrectThreshold: 6,
        };
        const mockUpdatedConfig = {
          id: 'config-1',
          name: 'Default',
          description: 'Default configuration',
          reviewIntervals: [1, 3, 7, 14, 30],
          consecutiveCorrectThreshold: 6,
          consecutiveWrongThreshold: 3,
          difficultyAdjustmentInterval: 1,
          priorityWeights: {
            newWord: 0.3,
            errorRate: 0.3,
            overdueTime: 0.2,
            wordScore: 0.2,
          },
          masteryThresholds: [],
          scoreWeights: {
            accuracy: 0.4,
            speed: 0.2,
            stability: 0.2,
            proficiency: 0.2,
          },
          speedThresholds: {
            excellent: 3000,
            good: 5000,
            average: 10000,
            slow: 15000,
          },
          newWordRatio: {
            default: 0.3,
            highAccuracy: 0.5,
            lowAccuracy: 0.1,
            highAccuracyThreshold: 0.85,
            lowAccuracyThreshold: 0.65,
          },
          isDefault: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.updateAlgorithmConfig).mockResolvedValue(mockUpdatedConfig);

        await StorageService.updateAlgorithmConfig('config-1', configUpdate, 'Testing update');

        expect(ApiClient.updateAlgorithmConfig).toHaveBeenCalledWith(
          'config-1',
          configUpdate,
          'Testing update',
        );
      });
    });

    describe('resetAlgorithmConfig', () => {
      it('should reset algorithm config via API', async () => {
        const StorageService = await getStorageService();
        const mockResetConfig = {
          id: 'config-1',
          name: 'Default',
          description: 'Default configuration',
          reviewIntervals: [1, 3, 7, 14, 30],
          consecutiveCorrectThreshold: 5,
          consecutiveWrongThreshold: 3,
          difficultyAdjustmentInterval: 1,
          priorityWeights: {
            newWord: 0.3,
            errorRate: 0.3,
            overdueTime: 0.2,
            wordScore: 0.2,
          },
          masteryThresholds: [],
          scoreWeights: {
            accuracy: 0.4,
            speed: 0.2,
            stability: 0.2,
            proficiency: 0.2,
          },
          speedThresholds: {
            excellent: 3000,
            good: 5000,
            average: 10000,
            slow: 15000,
          },
          newWordRatio: {
            default: 0.3,
            highAccuracy: 0.5,
            lowAccuracy: 0.1,
            highAccuracyThreshold: 0.85,
            lowAccuracyThreshold: 0.65,
          },
          isDefault: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.resetAlgorithmConfig).mockResolvedValue(mockResetConfig);

        await StorageService.resetAlgorithmConfig('config-1');

        expect(ApiClient.resetAlgorithmConfig).toHaveBeenCalledWith('config-1');
      });
    });

    describe('getConfigHistory', () => {
      it('should get config history from API', async () => {
        const StorageService = await getStorageService();
        const mockHistory = [
          {
            id: 'history-1',
            configId: 'config-1',
            changedBy: 'admin',
            changeReason: 'Initial config',
            previousValue: {},
            newValue: {},
            timestamp: Date.now(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getConfigHistory).mockResolvedValue(mockHistory);

        const history = await StorageService.getConfigHistory(10);

        expect(ApiClient.getConfigHistory).toHaveBeenCalledWith(10);
        expect(history).toEqual(mockHistory);
      });
    });
  });

  // ==================== 初始化测试 ====================
  describe('Initialization', () => {
    describe('init', () => {
      it('should skip initialization if not authenticated', async () => {
        const StorageService = await getStorageService();

        vi.mocked(ApiClient.getToken).mockReturnValue(null);

        await StorageService.init();

        expect(ApiClient.getWords).not.toHaveBeenCalled();
      });

      it('should initialize cache from cloud if authenticated', async () => {
        const StorageService = await getStorageService();
        const mockWords: Word[] = [
          {
            id: 'word-1',
            spelling: 'init',
            phonetic: '/ɪnɪt/',
            meanings: ['初始化'],
            examples: ['Initialize.'],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWords).mockResolvedValue(mockWords);

        await StorageService.init();

        expect(ApiClient.getWords).toHaveBeenCalled();
        const status = StorageService.getSyncStatus();
        expect(status.lastSyncTime).not.toBeNull();
      });

      it('should handle initialization error gracefully', async () => {
        const StorageService = await getStorageService();

        vi.mocked(ApiClient.getToken).mockReturnValue('mock-token');
        vi.mocked(ApiClient.getWords).mockRejectedValue(new Error('Init failed'));

        // 初始化失败不应该抛出异常
        await expect(StorageService.init()).resolves.not.toThrow();

        const status = StorageService.getSyncStatus();
        expect(status.error).toBe('Init failed');
      });
    });
  });
});
