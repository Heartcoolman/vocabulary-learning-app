/**
 * Wordbook Service Unit Tests
 * Tests for the actual WordBookService API
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../../src/config/database', () => ({
  default: {
    wordBook: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    word: {
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    $transaction: vi.fn((operations) => Promise.all(operations))
  }
}));

import prisma from '../../../src/config/database';

describe('WordbookService', () => {
  let wordbookService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import('../../../src/services/wordbook.service');
    wordbookService = module.wordbookService || module.default;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getWordbooks', () => {
    it('should return all wordbooks when called without userId', async () => {
      const mockWordbooks = [
        { id: 'wb-1', name: 'CET4', type: 'SYSTEM' },
        { id: 'wb-2', name: 'CET6', type: 'SYSTEM' }
      ];
      (prisma.wordBook.findMany as any).mockResolvedValue(mockWordbooks);

      const result = await wordbookService?.getWordbooks?.();

      expect(result).toEqual(mockWordbooks);
    });

    it('should return user-related wordbooks when called with userId', async () => {
      const mockWordbooks = [
        { id: 'wb-1', name: 'CET4', type: 'SYSTEM' },
        { id: 'wb-user-1', name: '我的词书', type: 'USER', userId: 'user-1' }
      ];
      (prisma.wordBook.findMany as any).mockResolvedValue(mockWordbooks);

      const result = await wordbookService?.getWordbooks?.('user-1');

      expect(result).toEqual(mockWordbooks);
    });
  });

  describe('getWordbookById', () => {
    it('should return wordbook with words', async () => {
      const mockWordbook = {
        id: 'wb-1',
        name: 'CET4',
        words: [{ id: 'w1', spelling: 'apple' }]
      };
      (prisma.wordBook.findUnique as any).mockResolvedValue(mockWordbook);

      const result = await wordbookService?.getWordbookById?.('wb-1');

      expect(result).toEqual(mockWordbook);
      expect(prisma.wordBook.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wb-1' },
          include: { words: true }
        })
      );
    });

    it('should return null for non-existent wordbook', async () => {
      (prisma.wordBook.findUnique as any).mockResolvedValue(null);

      const result = await wordbookService?.getWordbookById?.('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('createWordbook', () => {
    it('should create wordbook with correct data', async () => {
      const mockWordbook = {
        id: 'wb-new',
        name: '自定义词书',
        type: 'USER',
        userId: 'user-1'
      };
      (prisma.wordBook.create as any).mockResolvedValue(mockWordbook);

      const result = await wordbookService?.createWordbook?.({
        name: '自定义词书',
        description: '描述',
        userId: 'user-1'
      });

      expect(result).toEqual(mockWordbook);
    });

    it('should set type to SYSTEM when no userId provided', async () => {
      (prisma.wordBook.create as any).mockResolvedValue({});

      await wordbookService?.createWordbook?.({ name: 'System Book' });

      expect(prisma.wordBook.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'SYSTEM'
          })
        })
      );
    });

    it('should set type to USER when userId provided', async () => {
      (prisma.wordBook.create as any).mockResolvedValue({});

      await wordbookService?.createWordbook?.({
        name: 'User Book',
        userId: 'user-1'
      });

      expect(prisma.wordBook.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'USER',
            userId: 'user-1'
          })
        })
      );
    });
  });

  describe('addWordsToWordbook', () => {
    it('should add words to wordbook', async () => {
      const mockWords = [
        { id: 'w1', spelling: 'apple' },
        { id: 'w2', spelling: 'banana' }
      ];
      (prisma.word.findMany as any).mockResolvedValue(mockWords);
      (prisma.word.update as any).mockResolvedValue({});
      (prisma.wordBook.update as any).mockResolvedValue({});
      (prisma.$transaction as any).mockResolvedValue([{}, {}]);

      const result = await wordbookService?.addWordsToWordbook?.('wb-1', ['w1', 'w2']);

      expect(result?.count).toBe(2);
    });
  });

  describe('removeWordFromWordbook', () => {
    it('should remove word from wordbook', async () => {
      (prisma.word.delete as any).mockResolvedValue({});
      (prisma.wordBook.update as any).mockResolvedValue({});

      await wordbookService?.removeWordFromWordbook?.('wb-1', 'w1');

      expect(prisma.word.delete).toHaveBeenCalledWith({
        where: { id: 'w1' }
      });
    });
  });

  describe('deleteWordbook', () => {
    it('should delete wordbook', async () => {
      (prisma.wordBook.delete as any).mockResolvedValue({});

      await wordbookService?.deleteWordbook?.('wb-1');

      expect(prisma.wordBook.delete).toHaveBeenCalledWith({
        where: { id: 'wb-1' }
      });
    });
  });

  describe('getUserWordBooks', () => {
    it('should return user wordbooks only', async () => {
      const mockWordbooks = [
        { id: 'wb-user-1', name: '我的词书', type: 'USER', userId: 'user-1' }
      ];
      (prisma.wordBook.findMany as any).mockResolvedValue(mockWordbooks);

      const result = await wordbookService?.getUserWordBooks?.('user-1');

      expect(result).toEqual(mockWordbooks);
      expect(prisma.wordBook.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            type: 'USER',
            userId: 'user-1'
          }
        })
      );
    });
  });

  describe('getSystemWordBooks', () => {
    it('should return system wordbooks only', async () => {
      const mockWordbooks = [
        { id: 'wb-1', name: 'CET4', type: 'SYSTEM' },
        { id: 'wb-2', name: 'CET6', type: 'SYSTEM' }
      ];
      (prisma.wordBook.findMany as any).mockResolvedValue(mockWordbooks);

      const result = await wordbookService?.getSystemWordBooks?.();

      expect(result).toEqual(mockWordbooks);
      expect(prisma.wordBook.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { type: 'SYSTEM' }
        })
      );
    });
  });

  describe('exports', () => {
    it('should export WordBookService class', async () => {
      const module = await import('../../../src/services/wordbook.service');
      expect(module.WordBookService).toBeDefined();
    });

    it('should export default singleton', async () => {
      const module = await import('../../../src/services/wordbook.service');
      expect(module.default).toBeDefined();
    });
  });
});
