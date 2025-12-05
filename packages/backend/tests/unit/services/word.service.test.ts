/**
 * Word Service Unit Tests
 * Tests for the actual WordService API (deprecated, use WordBookService)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../../src/config/database', () => ({
  default: {
    word: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    wordBook: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    userStudyConfig: {
      findUnique: vi.fn()
    },
    $transaction: vi.fn((operations) => Promise.all(operations))
  }
}));

import prisma from '../../../src/config/database';

describe('WordService', () => {
  let wordService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import('../../../src/services/word.service');
    wordService = module.default;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getWordsByUserId', () => {
    it('should return words for user wordbooks', async () => {
      // Mock userStudyConfig with selected word book IDs
      (prisma.userStudyConfig.findUnique as any).mockResolvedValue({
        selectedWordBookIds: ['wb-1', 'wb-2']
      });
      (prisma.word.findMany as any).mockResolvedValue([
        { id: 'w1', spelling: 'apple' },
        { id: 'w2', spelling: 'banana' }
      ]);

      const result = await wordService.getWordsByUserId('user-1');

      expect(result).toHaveLength(2);
      expect(prisma.word.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            wordBookId: { in: ['wb-1', 'wb-2'] }
          }
        })
      );
    });
  });

  describe('getWords', () => {
    it('should return all words when no userId provided', async () => {
      (prisma.word.findMany as any).mockResolvedValue([
        { id: 'w1', spelling: 'apple' }
      ]);

      const result = await wordService.getWords();

      expect(result).toHaveLength(1);
    });

    it('should delegate to getWordsByUserId when userId provided', async () => {
      // Mock userStudyConfig with selected word book IDs
      (prisma.userStudyConfig.findUnique as any).mockResolvedValue({
        selectedWordBookIds: ['wb-1']
      });
      (prisma.word.findMany as any).mockResolvedValue([{ id: 'w1' }]);

      const result = await wordService.getWords('user-1');

      expect(result).toBeDefined();
    });
  });

  describe('getWordById', () => {
    it('should return word by id', async () => {
      const mockWord = {
        id: 'w1',
        spelling: 'apple',
        wordBook: { type: 'SYSTEM', userId: null }
      };
      (prisma.word.findFirst as any).mockResolvedValue(mockWord);

      const result = await wordService.getWordById('w1');

      expect(result).toEqual(mockWord);
    });

    it('should return null for non-existent word', async () => {
      (prisma.word.findFirst as any).mockResolvedValue(null);

      const result = await wordService.getWordById('non-existent');

      expect(result).toBeNull();
    });

    it('should check permission when userId provided', async () => {
      (prisma.word.findFirst as any).mockResolvedValue({
        id: 'w1',
        wordBook: { type: 'USER', userId: 'other-user' }
      });

      await expect(
        wordService.getWordById('w1', 'user-1')
      ).rejects.toThrow('无权访问此单词');
    });

    it('should allow access to own words', async () => {
      (prisma.word.findFirst as any).mockResolvedValue({
        id: 'w1',
        wordBook: { type: 'USER', userId: 'user-1' }
      });

      const result = await wordService.getWordById('w1', 'user-1');

      expect(result).toBeDefined();
    });
  });

  describe('createWord', () => {
    it('should create word with wordBookId', async () => {
      (prisma.word.create as any).mockResolvedValue({
        id: 'w-new',
        spelling: 'newword'
      });
      (prisma.wordBook.update as any).mockResolvedValue({});

      const result = await wordService.createWord({
        spelling: 'newword',
        meanings: ['新词'],
        wordBookId: 'wb-1'
      });

      expect(result.spelling).toBe('newword');
    });

    it('should create default wordbook if needed', async () => {
      (prisma.wordBook.findFirst as any).mockResolvedValue(null);
      (prisma.wordBook.create as any).mockResolvedValue({ id: 'wb-new' });
      (prisma.word.create as any).mockResolvedValue({ id: 'w-new', spelling: 'test' });
      (prisma.wordBook.update as any).mockResolvedValue({});

      const result = await wordService.createWord('user-1', {
        spelling: 'test',
        meanings: ['测试']
      });

      expect(prisma.wordBook.create).toHaveBeenCalled();
    });

    it('should throw if no wordBookId and no userId', async () => {
      await expect(
        wordService.createWord({
          spelling: 'test',
          meanings: ['测试']
        })
      ).rejects.toThrow('wordBookId is required');
    });
  });

  describe('updateWord', () => {
    it('should update word', async () => {
      (prisma.word.update as any).mockResolvedValue({
        id: 'w1',
        spelling: 'updated'
      });

      const result = await wordService.updateWord('w1', {
        spelling: 'updated',
        meanings: ['更新']
      });

      expect(result.spelling).toBe('updated');
    });

    it('should check permission when userId provided', async () => {
      (prisma.word.findFirst as any).mockResolvedValue({
        id: 'w1',
        wordBook: { type: 'USER', userId: 'other-user' }
      });

      await expect(
        wordService.updateWord('w1', 'user-1', { spelling: 'test', meanings: [] })
      ).rejects.toThrow('无权访问');
    });
  });

  describe('deleteWord', () => {
    it('should delete word and update wordbook count', async () => {
      (prisma.word.findUnique as any).mockResolvedValue({
        id: 'w1',
        wordBookId: 'wb-1'
      });
      (prisma.$transaction as any).mockResolvedValue([{}, {}]);

      await wordService.deleteWord('w1');

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should do nothing if word not found', async () => {
      (prisma.word.findUnique as any).mockResolvedValue(null);

      await wordService.deleteWord('non-existent');

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('batchCreateWords', () => {
    it('should create multiple words', async () => {
      (prisma.wordBook.findFirst as any).mockResolvedValue({ id: 'wb-1' });
      (prisma.$transaction as any).mockResolvedValue([
        { id: 'w1', spelling: 'apple' },
        { id: 'w2', spelling: 'banana' }
      ]);
      (prisma.wordBook.update as any).mockResolvedValue({});

      const result = await wordService.batchCreateWords('user-1', [
        { spelling: 'apple', meanings: ['苹果'] },
        { spelling: 'banana', meanings: ['香蕉'] }
      ]);

      expect(result).toHaveLength(2);
    });

    it('should create default wordbook if needed', async () => {
      (prisma.wordBook.findFirst as any).mockResolvedValue(null);
      (prisma.wordBook.create as any).mockResolvedValue({ id: 'wb-new' });
      (prisma.$transaction as any).mockResolvedValue([{ id: 'w1' }]);
      (prisma.wordBook.update as any).mockResolvedValue({});

      await wordService.batchCreateWords('user-1', [
        { spelling: 'test', meanings: ['测试'] }
      ]);

      expect(prisma.wordBook.create).toHaveBeenCalled();
    });
  });

  describe('exports', () => {
    it('should export WordService class', async () => {
      const module = await import('../../../src/services/word.service');
      expect(module.WordService).toBeDefined();
    });

    it('should export default singleton', async () => {
      const module = await import('../../../src/services/word.service');
      expect(module.default).toBeDefined();
    });
  });
});
