/**
 * WordClient 单元测试
 *
 * 测试单词 API 客户端的所有方法
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { WordClient } from '../WordClient';

// Mock BaseClient
vi.mock('../../base/BaseClient', () => ({
  BaseClient: class MockBaseClient {
    request = vi.fn();
  },
}));

describe('WordClient', () => {
  let client: WordClient;
  let mockRequest: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new WordClient();
    mockRequest = (client as unknown as { request: Mock }).request;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getWords', () => {
    it('should fetch all words', async () => {
      const mockApiWords = [
        {
          id: '1',
          spelling: 'apple',
          phonetic: 'ˈæpl',
          meanings: ['苹果'],
          examples: ['I eat an apple.'],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          spelling: 'banana',
          phonetic: 'bəˈnænə',
          meanings: ['香蕉'],
          examples: ['A yellow banana.'],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];
      mockRequest.mockResolvedValue(mockApiWords);

      const result = await client.getWords();

      expect(mockRequest).toHaveBeenCalledWith('/api/words');
      expect(result).toHaveLength(2);
      expect(result[0].spelling).toBe('apple');
      // 验证日期转换
      expect(typeof result[0].createdAt).toBe('number');
    });
  });

  describe('getLearnedWords', () => {
    it('should fetch learned words', async () => {
      const mockApiWords = [
        {
          id: '1',
          spelling: 'apple',
          phonetic: 'ˈæpl',
          meanings: ['苹果'],
          examples: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];
      mockRequest.mockResolvedValue(mockApiWords);

      const result = await client.getLearnedWords();

      expect(mockRequest).toHaveBeenCalledWith('/api/words/learned');
      expect(result).toHaveLength(1);
    });
  });

  describe('createWord', () => {
    it('should create a new word', async () => {
      const newWord = {
        spelling: 'test',
        phonetic: 'test',
        meanings: ['测试'],
        examples: ['This is a test.'],
      };
      const mockApiWord = {
        id: '123',
        ...newWord,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      mockRequest.mockResolvedValue(mockApiWord);

      const result = await client.createWord(newWord);

      expect(mockRequest).toHaveBeenCalledWith('/api/words', {
        method: 'POST',
        body: JSON.stringify(newWord),
      });
      expect(result.id).toBe('123');
      expect(result.spelling).toBe('test');
    });
  });

  describe('updateWord', () => {
    it('should update an existing word', async () => {
      const updates = { meanings: ['更新后的意思'] };
      const mockApiWord = {
        id: '1',
        spelling: 'apple',
        phonetic: 'ˈæpl',
        meanings: ['更新后的意思'],
        examples: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };
      mockRequest.mockResolvedValue(mockApiWord);

      const result = await client.updateWord('1', updates);

      expect(mockRequest).toHaveBeenCalledWith('/api/words/1', {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      expect(result.meanings).toEqual(['更新后的意思']);
    });
  });

  describe('deleteWord', () => {
    it('should delete a word', async () => {
      mockRequest.mockResolvedValue(undefined);

      await client.deleteWord('1');

      expect(mockRequest).toHaveBeenCalledWith('/api/words/1', {
        method: 'DELETE',
      });
    });
  });

  describe('batchCreateWords', () => {
    it('should create multiple words at once', async () => {
      const words = [
        { spelling: 'word1', phonetic: 'w1', meanings: ['意思1'], examples: [] },
        { spelling: 'word2', phonetic: 'w2', meanings: ['意思2'], examples: [] },
      ];
      const mockApiWords = words.map((w, i) => ({
        id: `${i + 1}`,
        ...w,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }));
      mockRequest.mockResolvedValue(mockApiWords);

      const result = await client.batchCreateWords(words);

      expect(mockRequest).toHaveBeenCalledWith('/api/words/batch', {
        method: 'POST',
        body: JSON.stringify({ words }),
      });
      expect(result).toHaveLength(2);
    });
  });

  describe('searchWords', () => {
    it('should search words by query', async () => {
      const mockApiWords = [
        {
          id: '1',
          spelling: 'apple',
          phonetic: 'ˈæpl',
          meanings: ['苹果'],
          examples: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          wordBook: { id: 'wb1', name: 'CET-4', type: 'BUILTIN' },
        },
      ];
      mockRequest.mockResolvedValue(mockApiWords);

      const result = await client.searchWords('app');

      expect(mockRequest).toHaveBeenCalledWith('/api/words/search?q=app&limit=20');
      expect(result).toHaveLength(1);
      expect(result[0].wordBook?.name).toBe('CET-4');
    });

    it('should respect limit parameter', async () => {
      mockRequest.mockResolvedValue([]);

      await client.searchWords('test', 10);

      expect(mockRequest).toHaveBeenCalledWith('/api/words/search?q=test&limit=10');
    });
  });

  describe('batchImportWords', () => {
    it('should import words to a word book', async () => {
      const words = [
        { spelling: 'word1', phonetic: 'w1', meanings: ['意思1'], examples: [] },
        { spelling: 'word2', phonetic: 'w2', meanings: ['意思2'], examples: [] },
      ];
      const mockResponse = { imported: 2, failed: 0 };
      mockRequest.mockResolvedValue(mockResponse);

      const result = await client.batchImportWords('wordbook-123', words);

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/wordbooks/wordbook-123/words/batch', {
        method: 'POST',
        body: JSON.stringify({ words }),
      });
      expect(result).toEqual({ imported: 2, failed: 0 });
    });

    it('should throw error if wordBookId is empty', async () => {
      await expect(client.batchImportWords('', [])).rejects.toThrow('wordBookId 必须是非空字符串');
    });

    it('should throw error if words array is empty', async () => {
      await expect(client.batchImportWords('book-1', [])).rejects.toThrow('words 必须是非空数组');
    });

    it('should throw error if words array exceeds 1000', async () => {
      const tooManyWords = Array(1001).fill({
        spelling: 'test',
        phonetic: 't',
        meanings: ['测试'],
        examples: [],
      });
      await expect(client.batchImportWords('book-1', tooManyWords)).rejects.toThrow(
        '单次导入不能超过1000个单词',
      );
    });
  });

  describe('batchImportWordsToUserWordbook', () => {
    it('should import words to a user word book', async () => {
      const words = [
        { spelling: 'word1', meanings: ['意思1'] },
        { spelling: 'word2', phonetic: 'w2', meanings: ['意思2'], examples: [] },
      ];
      const mockResponse = { imported: 2, failed: 0 };
      mockRequest.mockResolvedValue(mockResponse);

      const result = await client.batchImportWordsToUserWordbook('wordbook-123', words);

      expect(mockRequest).toHaveBeenCalledWith('/api/wordbooks/wordbook-123/words/batch', {
        method: 'POST',
        body: JSON.stringify({ words }),
      });
      expect(result).toEqual({ imported: 2, failed: 0 });
    });

    it('should throw error if wordBookId is empty', async () => {
      await expect(client.batchImportWordsToUserWordbook('', [])).rejects.toThrow(
        'wordBookId 必须是非空字符串',
      );
    });

    it('should throw error if words array is empty', async () => {
      await expect(client.batchImportWordsToUserWordbook('book-1', [])).rejects.toThrow(
        'words 必须是非空数组',
      );
    });

    it('should throw error if words array exceeds 1000', async () => {
      const tooManyWords = Array(1001).fill({
        spelling: 'test',
        meanings: ['测试'],
      });
      await expect(client.batchImportWordsToUserWordbook('book-1', tooManyWords)).rejects.toThrow(
        '单次导入不能超过1000个单词',
      );
    });
  });
});
