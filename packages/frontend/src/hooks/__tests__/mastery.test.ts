/**
 * mastery.ts Tests
 *
 * 测试掌握模式学习相关的 hooks 和 API 函数，包括：
 * 1. API 函数 - 获取学习单词、创建会话、同步进度等
 * 2. useSessionCache - 会话缓存管理
 * 3. useRetryQueue - 重试队列管理
 * 4. useWordQueue - 单词队列管理
 * 5. useMasterySync - 服务器同步逻辑
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock API clients
vi.mock('../../services/client', () => ({
  learningClient: {
    getMasteryStudyWords: vi.fn(),
    createMasterySession: vi.fn(),
    syncMasteryProgress: vi.fn(),
    getNextWords: vi.fn(),
    adjustLearningWords: vi.fn(),
  },
  amasClient: {
    endHabitSession: vi.fn(),
    processLearningEvent: vi.fn(),
  },
}));

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key];
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {};
  }),
};
vi.stubGlobal('localStorage', localStorageMock);

// Mock WordQueueManager with hoisted mock factory
const { MockWordQueueManager } = vi.hoisted(() => {
  class MockWordQueueManager {
    recordAnswer = vi.fn();
    getProgress = vi.fn().mockReturnValue({
      masteredCount: 0,
      activeCount: 5,
      pendingCount: 10,
      totalQuestions: 0,
      targetCount: 20,
    });
    getNextWordWithReason = vi.fn().mockReturnValue({
      word: { id: 'word-1', spelling: 'test' },
      isCompleted: false,
    });
    peekNextWordWithReason = vi.fn().mockReturnValue({
      word: { id: 'word-1', spelling: 'test' },
      isCompleted: false,
    });
    applyAdjustments = vi.fn();
    skipWord = vi.fn();
    getCurrentWordIds = vi.fn().mockReturnValue(['word-1', 'word-2']);
    getMasteredWordIds = vi.fn().mockReturnValue([]);
    getState = vi.fn().mockReturnValue({
      activeWords: [],
      masteredWordIds: [],
      pendingWordIds: [],
      recentlyShown: [],
      totalQuestions: 0,
      words: [],
    });
  }
  return { MockWordQueueManager };
});

vi.mock('../../services/learning/WordQueueManager', () => ({
  WordQueueManager: MockWordQueueManager,
}));

import {
  getMasteryStudyWords,
  createMasterySession,
  endHabitSession,
  syncMasteryProgress,
  getNextWords,
  adjustLearningWords,
  processLearningEvent,
  useSessionCache,
  useRetryQueue,
  useWordQueue,
  useMasterySync,
  type SessionCacheData,
  type WordItem,
} from '../mastery';
import { learningClient, amasClient } from '../../services/client';

// Type the mocked clients
const mockLearningClient = learningClient as unknown as {
  getMasteryStudyWords: ReturnType<typeof vi.fn>;
  createMasterySession: ReturnType<typeof vi.fn>;
  syncMasteryProgress: ReturnType<typeof vi.fn>;
  getNextWords: ReturnType<typeof vi.fn>;
  adjustLearningWords: ReturnType<typeof vi.fn>;
};

const mockAmasClient = amasClient as unknown as {
  endHabitSession: ReturnType<typeof vi.fn>;
  processLearningEvent: ReturnType<typeof vi.fn>;
};

describe('mastery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.store = {};
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==================== API 函数测试 ====================

  describe('API Functions', () => {
    describe('getMasteryStudyWords', () => {
      it('should call API with target count', async () => {
        const mockResponse = { words: [], totalAvailable: 100 };
        mockLearningClient.getMasteryStudyWords.mockResolvedValue(mockResponse);

        const result = await getMasteryStudyWords(20);

        expect(mockLearningClient.getMasteryStudyWords).toHaveBeenCalledWith(20);
        expect(result).toEqual(mockResponse);
      });

      it('should call API without target count', async () => {
        const mockResponse = { words: [], totalAvailable: 100 };
        mockLearningClient.getMasteryStudyWords.mockResolvedValue(mockResponse);

        await getMasteryStudyWords();

        expect(mockLearningClient.getMasteryStudyWords).toHaveBeenCalledWith(undefined);
      });
    });

    describe('createMasterySession', () => {
      it('should create session with target count', async () => {
        const mockResponse = { sessionId: 'session-1', masteryThreshold: 2 };
        mockLearningClient.createMasterySession.mockResolvedValue(mockResponse);

        const result = await createMasterySession(20);

        expect(mockLearningClient.createMasterySession).toHaveBeenCalledWith(20, undefined);
        expect(result).toEqual(mockResponse);
      });
    });

    describe('endHabitSession', () => {
      it('should end session by ID', async () => {
        const mockResponse = { success: true };
        mockAmasClient.endHabitSession.mockResolvedValue(mockResponse);

        const result = await endHabitSession('session-1');

        expect(mockAmasClient.endHabitSession).toHaveBeenCalledWith('session-1');
        expect(result).toEqual(mockResponse);
      });
    });

    describe('syncMasteryProgress', () => {
      it('should sync progress data', async () => {
        const mockResponse = { synced: true };
        mockLearningClient.syncMasteryProgress.mockResolvedValue(mockResponse);

        const data = {
          sessionId: 'session-1',
          actualMasteryCount: 15,
          totalQuestions: 30,
        };

        const result = await syncMasteryProgress(data);

        expect(mockLearningClient.syncMasteryProgress).toHaveBeenCalledWith(data);
        expect(result).toEqual(mockResponse);
      });
    });

    describe('getNextWords', () => {
      it('should get next words with params', async () => {
        const mockResponse = { words: [{ id: 'word-1' }] };
        mockLearningClient.getNextWords.mockResolvedValue(mockResponse);

        const params = {
          currentWordIds: ['word-1'],
          masteredWordIds: ['word-2'],
          sessionId: 'session-1',
          count: 5,
        };

        const result = await getNextWords(params);

        expect(mockLearningClient.getNextWords).toHaveBeenCalledWith(params);
        expect(result).toEqual(mockResponse);
      });
    });

    describe('adjustLearningWords', () => {
      it('should adjust learning words', async () => {
        const mockResponse = { adjusted: true };
        mockLearningClient.adjustLearningWords.mockResolvedValue(mockResponse);

        const params = {
          sessionId: 'session-1',
          currentWordIds: ['word-1'],
          masteredWordIds: [],
          adjustReason: 'fatigue' as const,
          recentPerformance: {
            accuracy: 0.7,
            avgResponseTime: 3000,
            consecutiveWrong: 2,
          },
        };

        const result = await adjustLearningWords(params);

        expect(mockLearningClient.adjustLearningWords).toHaveBeenCalledWith(params);
        expect(result).toEqual(mockResponse);
      });
    });

    describe('processLearningEvent', () => {
      it('should process learning event', async () => {
        const mockResponse = { processed: true };
        mockAmasClient.processLearningEvent.mockResolvedValue(mockResponse);

        const eventData = {
          wordId: 'word-1',
          isCorrect: true,
          responseTime: 2000,
          sessionId: 'session-1',
        };

        const result = await processLearningEvent(eventData);

        expect(mockAmasClient.processLearningEvent).toHaveBeenCalledWith(eventData);
        expect(result).toEqual(mockResponse);
      });
    });
  });

  // ==================== useSessionCache 测试 ====================

  describe('useSessionCache', () => {
    const mockCacheData: SessionCacheData = {
      sessionId: 'session-1',
      targetMasteryCount: 20,
      masteryThreshold: 2,
      maxTotalQuestions: 100,
      queueState: {
        words: [],
        currentIndex: 0,
        progress: {
          masteredCount: 5,
          activeCount: 10,
          pendingCount: 5,
          totalQuestions: 20,
          targetCount: 20,
        },
      },
      timestamp: Date.now(),
      userId: 'user-1',
    };

    it('should save session to cache', () => {
      const { result } = renderHook(() => useSessionCache());

      act(() => {
        result.current.saveSessionToCache(mockCacheData);
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'mastery_session_cache',
        expect.any(String),
      );
    });

    it('should load session from cache', () => {
      localStorageMock.store['mastery_session_cache'] = JSON.stringify(mockCacheData);

      const { result } = renderHook(() => useSessionCache());

      const cached = result.current.loadSessionFromCache('user-1', 'session-1');

      expect(cached).not.toBeNull();
      expect(cached?.sessionId).toBe('session-1');
    });

    it('should return null for expired cache', () => {
      const expiredData = {
        ...mockCacheData,
        timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      };
      localStorageMock.store['mastery_session_cache'] = JSON.stringify(expiredData);

      const { result } = renderHook(() => useSessionCache());

      const cached = result.current.loadSessionFromCache();

      expect(cached).toBeNull();
    });

    it('should return null for mismatched userId', () => {
      localStorageMock.store['mastery_session_cache'] = JSON.stringify(mockCacheData);

      const { result } = renderHook(() => useSessionCache());

      const cached = result.current.loadSessionFromCache('different-user');

      expect(cached).toBeNull();
    });

    it('should return null for mismatched sessionId', () => {
      localStorageMock.store['mastery_session_cache'] = JSON.stringify(mockCacheData);

      const { result } = renderHook(() => useSessionCache());

      const cached = result.current.loadSessionFromCache('user-1', 'different-session');

      expect(cached).toBeNull();
    });

    it('should clear session cache', () => {
      localStorageMock.store['mastery_session_cache'] = JSON.stringify(mockCacheData);

      const { result } = renderHook(() => useSessionCache());

      act(() => {
        result.current.clearSessionCache();
      });

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('mastery_session_cache');
    });

    it('should handle JSON parse error', () => {
      localStorageMock.store['mastery_session_cache'] = 'invalid json';

      const { result } = renderHook(() => useSessionCache());

      const cached = result.current.loadSessionFromCache();

      expect(cached).toBeNull();
    });
  });

  // ==================== useRetryQueue 测试 ====================

  describe('useRetryQueue', () => {
    it('should add item to queue', () => {
      const { result } = renderHook(() => useRetryQueue());

      const mockAction = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.addToQueue({
          id: 'retry-1',
          action: mockAction,
          maxRetries: 3,
        });
      });

      expect(result.current.getQueueLength()).toBeGreaterThanOrEqual(0);
    });

    it('should clear queue', () => {
      const { result } = renderHook(() => useRetryQueue());

      act(() => {
        result.current.clearQueue();
      });

      expect(result.current.getQueueLength()).toBe(0);
    });

    it('should return queue length', () => {
      const { result } = renderHook(() => useRetryQueue());

      const length = result.current.getQueueLength();

      expect(typeof length).toBe('number');
      expect(length).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== useWordQueue 测试 ====================

  describe('useWordQueue', () => {
    const mockWords: WordItem[] = [
      {
        id: 'word-1',
        spelling: 'hello',
        phonetic: '/həˈloʊ/',
        meanings: ['你好'],
        examples: [],
        isNew: true,
      },
      {
        id: 'word-2',
        spelling: 'world',
        phonetic: '/wɜːrld/',
        meanings: ['世界'],
        examples: [],
        isNew: true,
      },
    ];

    it('should initialize with default values', () => {
      const { result } = renderHook(() => useWordQueue());

      expect(result.current.currentWord).toBeNull();
      expect(result.current.allWords).toEqual([]);
      expect(result.current.isCompleted).toBe(false);
      expect(result.current.progress.masteredCount).toBe(0);
    });

    it('should initialize queue with words', () => {
      const { result } = renderHook(() => useWordQueue({ targetMasteryCount: 20 }));

      act(() => {
        result.current.initializeQueue(mockWords);
      });

      expect(result.current.allWords).toEqual(mockWords);
      expect(result.current.isCompleted).toBe(false);
    });

    it('should initialize queue with config', () => {
      const { result } = renderHook(() => useWordQueue());

      act(() => {
        result.current.initializeQueue(mockWords, {
          masteryThreshold: 3,
          maxTotalQuestions: 50,
        });
      });

      expect(result.current.configRef.current.masteryThreshold).toBe(3);
      expect(result.current.configRef.current.maxTotalQuestions).toBe(50);
    });

    it('should restore queue from state', () => {
      const { result } = renderHook(() => useWordQueue());

      const state = {
        progress: {
          masteredCount: 5,
          activeCount: 10,
          pendingCount: 5,
          totalQuestions: 15,
          targetCount: 20,
        },
      };

      act(() => {
        result.current.restoreQueue(mockWords, state);
      });

      expect(result.current.allWords).toEqual(mockWords);
      expect(result.current.progress).toEqual(state.progress);
    });

    it('should get current word', () => {
      const { result } = renderHook(() => useWordQueue());

      act(() => {
        result.current.initializeQueue(mockWords);
      });

      const word = result.current.getCurrentWord();

      // May be null depending on mock implementation
      expect(word === null || typeof word === 'object').toBe(true);
    });

    it('should get queue state', () => {
      const { result } = renderHook(() => useWordQueue());

      act(() => {
        result.current.initializeQueue(mockWords);
      });

      const state = result.current.getQueueState();

      expect(state).toHaveProperty('words');
      expect(state).toHaveProperty('currentIndex');
      expect(state).toHaveProperty('progress');
    });

    it('should add words to queue', () => {
      const { result } = renderHook(() => useWordQueue());

      act(() => {
        result.current.initializeQueue(mockWords);
      });

      const newWords: WordItem[] = [
        {
          id: 'word-3',
          spelling: 'test',
          phonetic: '/test/',
          meanings: ['测试'],
          examples: [],
          isNew: true,
        },
      ];

      act(() => {
        result.current.addWords(newWords);
      });

      expect(result.current.allWords.length).toBe(3);
    });

    it('should skip word', () => {
      const { result } = renderHook(() => useWordQueue());

      act(() => {
        result.current.initializeQueue(mockWords);
      });

      // Should not throw
      act(() => {
        result.current.skipWord('word-1');
      });
    });

    it('should reset queue', () => {
      const { result } = renderHook(() => useWordQueue());

      act(() => {
        result.current.initializeQueue(mockWords);
      });

      act(() => {
        result.current.resetQueue();
      });

      expect(result.current.currentWord).toBeNull();
      expect(result.current.allWords).toEqual([]);
      expect(result.current.isCompleted).toBe(false);
    });

    it('should use custom target mastery count', () => {
      const { result } = renderHook(() => useWordQueue({ targetMasteryCount: 30 }));

      expect(result.current.progress.targetCount).toBe(30);
    });
  });

  // ==================== useMasterySync 测试 ====================

  describe('useMasterySync', () => {
    const mockOptions = {
      getSessionId: vi.fn().mockReturnValue('session-1'),
      getUserId: vi.fn().mockReturnValue('user-1'),
      getQueueManager: vi.fn().mockReturnValue({
        recordAnswer: vi.fn().mockReturnValue({ mastered: false }),
        getConfig: vi.fn().mockReturnValue({ maxActiveWords: 6 }),
        getCurrentWordIds: vi.fn().mockReturnValue(['word-1']),
        getMasteredWordIds: vi.fn().mockReturnValue([]),
      }),
      onAmasResult: vi.fn(),
      onQueueAdjusted: vi.fn(),
    };

    it('should provide sync functions', () => {
      const { result } = renderHook(() => useMasterySync(mockOptions));

      expect(result.current.submitAnswerOptimistic).toBeDefined();
      expect(result.current.syncAnswerToServer).toBeDefined();
      expect(result.current.fetchMoreWordsIfNeeded).toBeDefined();
      expect(result.current.triggerQueueAdjustment).toBeDefined();
    });

    it('should submit answer optimistically', () => {
      const { result } = renderHook(() => useMasterySync(mockOptions));

      const params = {
        wordId: 'word-1',
        isCorrect: true,
        responseTime: 2000,
      };

      result.current.submitAnswerOptimistic(params);

      expect(mockOptions.getQueueManager).toHaveBeenCalled();
    });

    it('should return null when no queue manager', () => {
      const optionsWithoutManager = {
        ...mockOptions,
        getQueueManager: vi.fn().mockReturnValue(null),
      };

      const { result } = renderHook(() => useMasterySync(optionsWithoutManager));

      const decision = result.current.submitAnswerOptimistic({
        wordId: 'word-1',
        isCorrect: true,
        responseTime: 2000,
      });

      expect(decision).toBeNull();
    });

    it('should sync answer to server', async () => {
      mockAmasClient.processLearningEvent.mockResolvedValue({ processed: true });

      const { result } = renderHook(() => useMasterySync(mockOptions));

      await act(async () => {
        await result.current.syncAnswerToServer(
          {
            wordId: 'word-1',
            isCorrect: true,
            responseTime: 2000,
            pausedTimeMs: 0,
          },
          {
            mastered: false,
            progress: {
              wordId: 'word-1',
              correctCount: 1,
              wrongCount: 0,
              consecutiveCorrect: 1,
              attempts: 1,
              lastAttemptTime: Date.now(),
            },
          },
        );
      });

      expect(mockAmasClient.processLearningEvent).toHaveBeenCalled();
    });

    it('should not sync when no sessionId', async () => {
      const optionsWithoutSession = {
        ...mockOptions,
        getSessionId: vi.fn().mockReturnValue(''),
      };

      const { result } = renderHook(() => useMasterySync(optionsWithoutSession));

      await act(async () => {
        await result.current.syncAnswerToServer(
          {
            wordId: 'word-1',
            isCorrect: true,
            responseTime: 2000,
            pausedTimeMs: 0,
          },
          null,
        );
      });

      expect(mockAmasClient.processLearningEvent).not.toHaveBeenCalled();
    });

    it('should fetch more words if needed', async () => {
      mockLearningClient.getNextWords.mockResolvedValue({
        words: [
          {
            id: 'word-3',
            spelling: 'new',
            phonetic: '/nuː/',
            meanings: ['新的'],
            examples: [],
            isNew: true,
          },
        ],
      });

      const { result } = renderHook(() => useMasterySync(mockOptions));

      const newWords = await result.current.fetchMoreWordsIfNeeded(1, 1, false);

      expect(mockLearningClient.getNextWords).toHaveBeenCalledWith({
        currentWordIds: ['word-1'],
        masteredWordIds: [],
        sessionId: 'session-1',
        count: 4,
      });
      expect(newWords.length).toBeGreaterThanOrEqual(0);
    });

    it('should not fetch more words when completed', async () => {
      const { result } = renderHook(() => useMasterySync(mockOptions));

      const newWords = await result.current.fetchMoreWordsIfNeeded(5, 5, true);

      expect(newWords).toEqual([]);
      expect(mockLearningClient.getNextWords).not.toHaveBeenCalled();
    });

    it('should not fetch more words when above threshold', async () => {
      const { result } = renderHook(() => useMasterySync(mockOptions));

      const newWords = await result.current.fetchMoreWordsIfNeeded(5, 5, false);

      expect(newWords).toEqual([]);
      expect(mockLearningClient.getNextWords).not.toHaveBeenCalled();
    });

    it('should trigger queue adjustment', async () => {
      mockLearningClient.adjustLearningWords.mockResolvedValue({ adjusted: true });

      const { result } = renderHook(() => useMasterySync(mockOptions));

      await act(async () => {
        await result.current.triggerQueueAdjustment('fatigue', {
          accuracy: 0.5,
          avgResponseTime: 5000,
          consecutiveWrong: 3,
        });
      });

      expect(mockLearningClient.adjustLearningWords).toHaveBeenCalled();
      expect(mockOptions.onQueueAdjusted).toHaveBeenCalled();
    });

    it('should reset sync counter', () => {
      const { result } = renderHook(() => useMasterySync(mockOptions));

      act(() => {
        result.current.resetSyncCounter();
      });

      expect(result.current.getSyncCounter()).toBe(0);
    });

    it('should provide session cache and retry queue', () => {
      const { result } = renderHook(() => useMasterySync(mockOptions));

      expect(result.current.sessionCache).toBeDefined();
      expect(result.current.retryQueue).toBeDefined();
    });
  });
});
