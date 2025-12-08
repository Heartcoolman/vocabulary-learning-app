/**
 * WordBookClient 单元测试
 *
 * 测试词书管理 API 客户端的所有方法
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { WordBookClient } from '../WordBookClient';

// Mock BaseClient
vi.mock('../../base/BaseClient', () => ({
  BaseClient: class MockBaseClient {
    request = vi.fn();
  },
}));

describe('WordBookClient', () => {
  let client: WordBookClient;
  let mockRequest: Mock;

  const mockApiWordBook = {
    id: '1',
    name: 'CET-4',
    description: '大学英语四级词汇',
    type: 'SYSTEM' as const,
    isPublic: true,
    wordCount: 4000,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const mockApiWord = {
    id: 'w1',
    wordBookId: '1',
    spelling: 'apple',
    phonetic: 'ˈæpl',
    meanings: ['苹果'],
    examples: ['I eat an apple.'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const mockApiStudyConfig = {
    id: 'sc1',
    userId: 'user1',
    selectedWordBookIds: ['wb1', 'wb2'],
    dailyWordCount: 20,
    studyMode: 'normal',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client = new WordBookClient();
    mockRequest = (client as unknown as { request: Mock }).request;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getUserWordBooks', () => {
    it('should fetch user word books', async () => {
      mockRequest.mockResolvedValue([{ ...mockApiWordBook, type: 'USER' }]);

      const result = await client.getUserWordBooks();

      expect(mockRequest).toHaveBeenCalledWith('/api/wordbooks/user');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('CET-4');
      expect(typeof result[0].createdAt).toBe('number');
    });
  });

  describe('getSystemWordBooks', () => {
    it('should fetch system word books', async () => {
      mockRequest.mockResolvedValue([mockApiWordBook]);

      const result = await client.getSystemWordBooks();

      expect(mockRequest).toHaveBeenCalledWith('/api/wordbooks/system');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('SYSTEM');
    });
  });

  describe('getAllAvailableWordBooks', () => {
    it('should fetch all available word books', async () => {
      mockRequest.mockResolvedValue([
        mockApiWordBook,
        { ...mockApiWordBook, id: '2', type: 'USER' },
      ]);

      const result = await client.getAllAvailableWordBooks();

      expect(mockRequest).toHaveBeenCalledWith('/api/wordbooks/available');
      expect(result).toHaveLength(2);
    });
  });

  describe('getWordBookById', () => {
    it('should fetch a single word book by id', async () => {
      mockRequest.mockResolvedValue(mockApiWordBook);

      const result = await client.getWordBookById('1');

      expect(mockRequest).toHaveBeenCalledWith('/api/wordbooks/1');
      expect(result.id).toBe('1');
      expect(result.name).toBe('CET-4');
    });
  });

  describe('createWordBook', () => {
    it('should create a new word book', async () => {
      const newBookData = { name: 'My Words', description: '我的单词本' };
      mockRequest.mockResolvedValue({
        ...mockApiWordBook,
        ...newBookData,
        id: '123',
        type: 'USER',
      });

      const result = await client.createWordBook(newBookData);

      expect(mockRequest).toHaveBeenCalledWith('/api/wordbooks', {
        method: 'POST',
        body: JSON.stringify(newBookData),
      });
      expect(result.name).toBe('My Words');
    });
  });

  describe('updateWordBook', () => {
    it('should update an existing word book', async () => {
      const updates = { name: '更新后的词书' };
      mockRequest.mockResolvedValue({ ...mockApiWordBook, ...updates });

      const result = await client.updateWordBook('1', updates);

      expect(mockRequest).toHaveBeenCalledWith('/api/wordbooks/1', {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      expect(result.name).toBe('更新后的词书');
    });
  });

  describe('deleteWordBook', () => {
    it('should delete a word book', async () => {
      mockRequest.mockResolvedValue(undefined);

      await client.deleteWordBook('1');

      expect(mockRequest).toHaveBeenCalledWith('/api/wordbooks/1', {
        method: 'DELETE',
      });
    });
  });

  describe('getWordBookWords', () => {
    it('should fetch words in a word book', async () => {
      mockRequest.mockResolvedValue([mockApiWord]);

      const result = await client.getWordBookWords('1');

      expect(mockRequest).toHaveBeenCalledWith('/api/wordbooks/1/words');
      expect(result).toHaveLength(1);
      expect(result[0].spelling).toBe('apple');
    });
  });

  describe('addWordToWordBook', () => {
    it('should add a word to a word book', async () => {
      const wordData = {
        spelling: 'banana',
        phonetic: 'bəˈnænə',
        meanings: ['香蕉'],
        examples: ['A yellow banana.'],
      };
      mockRequest.mockResolvedValue({
        ...mockApiWord,
        ...wordData,
        id: 'w2',
      });

      const result = await client.addWordToWordBook('1', wordData);

      expect(mockRequest).toHaveBeenCalledWith('/api/wordbooks/1/words', {
        method: 'POST',
        body: JSON.stringify(wordData),
      });
      expect(result.spelling).toBe('banana');
    });
  });

  describe('removeWordFromWordBook', () => {
    it('should remove a word from a word book', async () => {
      mockRequest.mockResolvedValue(undefined);

      await client.removeWordFromWordBook('1', 'w1');

      expect(mockRequest).toHaveBeenCalledWith('/api/wordbooks/1/words/w1', {
        method: 'DELETE',
      });
    });
  });

  describe('getStudyConfig', () => {
    it('should fetch study config', async () => {
      mockRequest.mockResolvedValue(mockApiStudyConfig);

      const result = await client.getStudyConfig();

      expect(mockRequest).toHaveBeenCalledWith('/api/study-config');
      expect(result.dailyWordCount).toBe(20);
      expect(result.selectedWordBookIds).toEqual(['wb1', 'wb2']);
    });
  });

  describe('updateStudyConfig', () => {
    it('should update study config', async () => {
      const updates = {
        selectedWordBookIds: ['wb3'],
        dailyWordCount: 30,
        studyMode: 'intense',
      };
      mockRequest.mockResolvedValue({ ...mockApiStudyConfig, ...updates });

      const result = await client.updateStudyConfig(updates);

      expect(mockRequest).toHaveBeenCalledWith('/api/study-config', {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      expect(result.dailyWordCount).toBe(30);
    });
  });

  describe('getTodayWords', () => {
    it('should fetch today words with progress', async () => {
      const mockResponse = {
        words: [mockApiWord],
        progress: {
          todayStudied: 10,
          todayTarget: 20,
          totalStudied: 500,
          correctRate: 0.85,
          weeklyTrend: [10, 15, 20, 18, 22, 25, 10],
        },
      };
      mockRequest.mockResolvedValue(mockResponse);

      const result = await client.getTodayWords();

      expect(mockRequest).toHaveBeenCalledWith('/api/study-config/today-words');
      expect(result.words).toHaveLength(1);
      expect(result.progress.todayTarget).toBe(20);
    });
  });

  describe('getStudyProgress', () => {
    it('should fetch study progress', async () => {
      const mockProgress = {
        todayStudied: 15,
        todayTarget: 20,
        totalStudied: 600,
        correctRate: 0.9,
        weeklyTrend: [10, 15, 20, 18, 22, 25, 15],
      };
      mockRequest.mockResolvedValue(mockProgress);

      const result = await client.getStudyProgress();

      expect(mockRequest).toHaveBeenCalledWith('/api/study-config/progress');
      expect(result.todayStudied).toBe(15);
      expect(result.correctRate).toBe(0.9);
    });
  });
});
