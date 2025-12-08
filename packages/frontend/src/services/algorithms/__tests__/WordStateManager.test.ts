/**
 * WordStateManager Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WordStateManager, WordStateStorage } from '../WordStateManager';
import { WordLearningState, WordState } from '../../../types/models';

// 创建模拟学习状态
const createMockLearningState = (overrides?: Partial<WordLearningState>): WordLearningState => ({
  id: 'state-1',
  userId: 'user-1',
  wordId: 'word-1',
  state: WordState.LEARNING,
  masteryLevel: 1,
  easeFactor: 2.0,
  reviewCount: 1,
  lastReviewDate: Date.now() - 24 * 60 * 60 * 1000,
  nextReviewDate: Date.now(),
  currentInterval: 1,
  consecutiveCorrect: 1,
  consecutiveWrong: 0,
  createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
  updatedAt: Date.now(),
  ...overrides,
});

// 创建模拟存储
const createMockStorage = (): WordStateStorage => ({
  saveState: vi.fn().mockResolvedValue(undefined),
  loadState: vi.fn().mockResolvedValue(null),
  batchLoadStates: vi.fn().mockResolvedValue([]),
  loadAllStates: vi.fn().mockResolvedValue([]),
  deleteState: vi.fn().mockResolvedValue(undefined),
});

describe('WordStateManager', () => {
  let manager: WordStateManager;
  let mockStorage: WordStateStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = createMockStorage();
    manager = new WordStateManager(mockStorage);
  });

  describe('initializeWordState', () => {
    it('should create initial state with correct default values', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const state = await manager.initializeWordState('user-1', 'word-1');

      expect(state.userId).toBe('user-1');
      expect(state.wordId).toBe('word-1');
      expect(state.state).toBe(WordState.NEW);
      expect(state.masteryLevel).toBe(0);
      expect(state.easeFactor).toBe(2.5);
      expect(state.reviewCount).toBe(0);
      expect(state.lastReviewDate).toBe(0);
      expect(state.nextReviewDate).toBe(now);
      expect(state.currentInterval).toBe(1);
      expect(state.consecutiveCorrect).toBe(0);
      expect(state.consecutiveWrong).toBe(0);

      vi.useRealTimers();
    });

    it('should save state to storage', async () => {
      await manager.initializeWordState('user-1', 'word-1');

      expect(mockStorage.saveState).toHaveBeenCalledTimes(1);
      expect(mockStorage.saveState).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          wordId: 'word-1',
          state: WordState.NEW,
        }),
      );
    });

    it('should cache the initialized state', async () => {
      await manager.initializeWordState('user-1', 'word-1');

      // 再次获取应该从缓存返回
      const cachedState = await manager.getState('user-1', 'word-1');

      expect(mockStorage.loadState).not.toHaveBeenCalled();
      expect(cachedState).not.toBeNull();
      expect(cachedState?.userId).toBe('user-1');
    });

    it('should generate unique id for each state', async () => {
      const state1 = await manager.initializeWordState('user-1', 'word-1');
      manager.clearCache();
      const state2 = await manager.initializeWordState('user-1', 'word-2');

      expect(state1.id).not.toBe(state2.id);
    });
  });

  describe('getState', () => {
    it('should return cached state if available', async () => {
      // 先初始化状态
      await manager.initializeWordState('user-1', 'word-1');

      // 获取状态
      const state = await manager.getState('user-1', 'word-1');

      expect(state).not.toBeNull();
      expect(mockStorage.loadState).not.toHaveBeenCalled();
    });

    it('should load from storage if not cached', async () => {
      const storedState = createMockLearningState();
      vi.mocked(mockStorage.loadState).mockResolvedValue(storedState);

      const state = await manager.getState('user-1', 'word-1');

      expect(mockStorage.loadState).toHaveBeenCalledWith('user-1', 'word-1');
      expect(state).toEqual(storedState);
    });

    it('should return null if state does not exist', async () => {
      vi.mocked(mockStorage.loadState).mockResolvedValue(null);

      const state = await manager.getState('user-1', 'nonexistent');

      expect(state).toBeNull();
    });

    it('should cache loaded state from storage', async () => {
      const storedState = createMockLearningState();
      vi.mocked(mockStorage.loadState).mockResolvedValue(storedState);

      // 第一次加载
      await manager.getState('user-1', 'word-1');
      // 第二次加载（应该从缓存）
      await manager.getState('user-1', 'word-1');

      expect(mockStorage.loadState).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateState', () => {
    it('should update existing state', async () => {
      const existingState = createMockLearningState();
      vi.mocked(mockStorage.loadState).mockResolvedValue(existingState);

      const updates = {
        masteryLevel: 3,
        consecutiveCorrect: 5,
      };

      const updatedState = await manager.updateState('user-1', 'word-1', updates);

      expect(updatedState.masteryLevel).toBe(3);
      expect(updatedState.consecutiveCorrect).toBe(5);
      expect(updatedState.userId).toBe('user-1'); // 保留原有字段
    });

    it('should initialize state if it does not exist', async () => {
      vi.mocked(mockStorage.loadState).mockResolvedValue(null);

      const updates = {
        masteryLevel: 2,
      };

      const updatedState = await manager.updateState('user-1', 'word-1', updates);

      expect(updatedState.masteryLevel).toBe(2);
      expect(updatedState.state).toBe(WordState.NEW); // 初始状态
      expect(mockStorage.saveState).toHaveBeenCalledTimes(2); // 初始化 + 更新
    });

    it('should save updated state to storage', async () => {
      const existingState = createMockLearningState();
      vi.mocked(mockStorage.loadState).mockResolvedValue(existingState);

      await manager.updateState('user-1', 'word-1', { masteryLevel: 4 });

      expect(mockStorage.saveState).toHaveBeenCalledWith(
        expect.objectContaining({
          masteryLevel: 4,
        }),
      );
    });

    it('should update updatedAt timestamp', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const existingState = createMockLearningState({
        updatedAt: now - 1000,
      });
      vi.mocked(mockStorage.loadState).mockResolvedValue(existingState);

      const updatedState = await manager.updateState('user-1', 'word-1', { masteryLevel: 2 });

      expect(updatedState.updatedAt).toBe(now);

      vi.useRealTimers();
    });

    it('should update cache with new state', async () => {
      const existingState = createMockLearningState();
      vi.mocked(mockStorage.loadState).mockResolvedValue(existingState);

      await manager.updateState('user-1', 'word-1', { masteryLevel: 5 });

      // 获取缓存的状态
      const cachedState = await manager.getState('user-1', 'word-1');

      expect(cachedState?.masteryLevel).toBe(5);
      expect(mockStorage.loadState).toHaveBeenCalledTimes(1); // 只加载一次
    });
  });

  describe('batchGetStates', () => {
    it('should return states from cache and storage', async () => {
      // 先缓存一个状态
      await manager.initializeWordState('user-1', 'word-1');

      // 模拟从存储加载另一个状态
      const storedState = createMockLearningState({ wordId: 'word-2' });
      vi.mocked(mockStorage.batchLoadStates).mockResolvedValue([storedState]);

      const states = await manager.batchGetStates('user-1', ['word-1', 'word-2']);

      expect(states.length).toBe(2);
      expect(mockStorage.batchLoadStates).toHaveBeenCalledWith('user-1', ['word-2']);
    });

    it('should return only cached states if all are in cache', async () => {
      await manager.initializeWordState('user-1', 'word-1');
      await manager.initializeWordState('user-1', 'word-2');

      const states = await manager.batchGetStates('user-1', ['word-1', 'word-2']);

      expect(states.length).toBe(2);
      expect(mockStorage.batchLoadStates).not.toHaveBeenCalled();
    });

    it('should load all from storage if none are cached', async () => {
      const storedStates = [
        createMockLearningState({ wordId: 'word-1' }),
        createMockLearningState({ wordId: 'word-2' }),
      ];
      vi.mocked(mockStorage.batchLoadStates).mockResolvedValue(storedStates);

      const states = await manager.batchGetStates('user-1', ['word-1', 'word-2']);

      expect(states.length).toBe(2);
      expect(mockStorage.batchLoadStates).toHaveBeenCalledWith('user-1', ['word-1', 'word-2']);
    });

    it('should cache loaded states', async () => {
      const storedStates = [createMockLearningState({ wordId: 'word-1' })];
      vi.mocked(mockStorage.batchLoadStates).mockResolvedValue(storedStates);

      await manager.batchGetStates('user-1', ['word-1']);
      // 再次获取应该从缓存
      await manager.batchGetStates('user-1', ['word-1']);

      expect(mockStorage.batchLoadStates).toHaveBeenCalledTimes(1);
    });

    it('should return empty array for empty word list', async () => {
      const states = await manager.batchGetStates('user-1', []);

      expect(states).toEqual([]);
      expect(mockStorage.batchLoadStates).not.toHaveBeenCalled();
    });
  });

  describe('getWordsByState', () => {
    it('should return word IDs filtered by state', async () => {
      const allStates = [
        createMockLearningState({ wordId: 'word-1', state: WordState.NEW }),
        createMockLearningState({ wordId: 'word-2', state: WordState.LEARNING }),
        createMockLearningState({ wordId: 'word-3', state: WordState.NEW }),
        createMockLearningState({ wordId: 'word-4', state: WordState.MASTERED }),
      ];
      vi.mocked(mockStorage.loadAllStates).mockResolvedValue(allStates);

      const newWords = await manager.getWordsByState('user-1', WordState.NEW);

      expect(newWords).toEqual(['word-1', 'word-3']);
    });

    it('should return empty array when no words match state', async () => {
      const allStates = [createMockLearningState({ wordId: 'word-1', state: WordState.LEARNING })];
      vi.mocked(mockStorage.loadAllStates).mockResolvedValue(allStates);

      const masteredWords = await manager.getWordsByState('user-1', WordState.MASTERED);

      expect(masteredWords).toEqual([]);
    });
  });

  describe('getDueWords', () => {
    it('should return word IDs that are due for review', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const allStates = [
        createMockLearningState({
          wordId: 'due-1',
          state: WordState.LEARNING,
          nextReviewDate: now - 1000,
        }),
        createMockLearningState({
          wordId: 'due-2',
          state: WordState.REVIEWING,
          nextReviewDate: now - 24 * 60 * 60 * 1000,
        }),
        createMockLearningState({
          wordId: 'not-due',
          state: WordState.LEARNING,
          nextReviewDate: now + 24 * 60 * 60 * 1000,
        }),
        createMockLearningState({
          wordId: 'new-word',
          state: WordState.NEW,
          nextReviewDate: now - 1000,
        }),
      ];
      vi.mocked(mockStorage.loadAllStates).mockResolvedValue(allStates);

      const dueWords = await manager.getDueWords('user-1');

      expect(dueWords).toContain('due-1');
      expect(dueWords).toContain('due-2');
      expect(dueWords).not.toContain('not-due');
      expect(dueWords).not.toContain('new-word');

      vi.useRealTimers();
    });

    it('should return empty array when no words are due', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const allStates = [
        createMockLearningState({
          wordId: 'word-1',
          state: WordState.LEARNING,
          nextReviewDate: now + 24 * 60 * 60 * 1000,
        }),
      ];
      vi.mocked(mockStorage.loadAllStates).mockResolvedValue(allStates);

      const dueWords = await manager.getDueWords('user-1');

      expect(dueWords).toEqual([]);

      vi.useRealTimers();
    });
  });

  describe('getAllStates', () => {
    it('should return all states from storage', async () => {
      const allStates = [
        createMockLearningState({ wordId: 'word-1' }),
        createMockLearningState({ wordId: 'word-2' }),
      ];
      vi.mocked(mockStorage.loadAllStates).mockResolvedValue(allStates);

      const states = await manager.getAllStates('user-1');

      expect(states).toEqual(allStates);
      expect(mockStorage.loadAllStates).toHaveBeenCalledWith('user-1');
    });
  });

  describe('clearCache', () => {
    it('should clear all cache when no userId provided', async () => {
      await manager.initializeWordState('user-1', 'word-1');
      await manager.initializeWordState('user-2', 'word-2');

      manager.clearCache();

      // 重新获取应该从存储加载
      vi.mocked(mockStorage.loadState).mockResolvedValue(null);
      const state1 = await manager.getState('user-1', 'word-1');
      const state2 = await manager.getState('user-2', 'word-2');

      expect(mockStorage.loadState).toHaveBeenCalledTimes(2);
      expect(state1).toBeNull();
      expect(state2).toBeNull();
    });

    it('should clear only specific user cache when userId provided', async () => {
      await manager.initializeWordState('user-1', 'word-1');
      await manager.initializeWordState('user-2', 'word-2');

      manager.clearCache('user-1');

      // user-1 的缓存应该被清除
      vi.mocked(mockStorage.loadState).mockResolvedValue(null);
      const state1 = await manager.getState('user-1', 'word-1');
      expect(mockStorage.loadState).toHaveBeenCalledWith('user-1', 'word-1');
      expect(state1).toBeNull();

      // user-2 的缓存应该还在
      vi.mocked(mockStorage.loadState).mockClear();
      const state2 = await manager.getState('user-2', 'word-2');
      expect(mockStorage.loadState).not.toHaveBeenCalled();
      expect(state2).not.toBeNull();
    });
  });
});
