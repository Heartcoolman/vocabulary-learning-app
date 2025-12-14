/**
 * Word Context Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { ContextType } from '@prisma/client';

// Mock dependencies
const mockWordContextCreate = vi.fn();
const mockWordContextFindUnique = vi.fn();
const mockWordContextFindMany = vi.fn();
const mockWordContextUpdate = vi.fn();
const mockWordContextDelete = vi.fn();
const mockWordContextDeleteMany = vi.fn();
const mockWordContextCount = vi.fn();
const mockWordFindUnique = vi.fn();
const mockTransaction = vi.fn();

vi.mock('../../../src/config/database', () => ({
  default: {
    wordContext: {
      create: (...args: any[]) => mockWordContextCreate(...args),
      findUnique: (...args: any[]) => mockWordContextFindUnique(...args),
      findMany: (...args: any[]) => mockWordContextFindMany(...args),
      update: (...args: any[]) => mockWordContextUpdate(...args),
      delete: (...args: any[]) => mockWordContextDelete(...args),
      deleteMany: (...args: any[]) => mockWordContextDeleteMany(...args),
      count: (...args: any[]) => mockWordContextCount(...args),
    },
    word: {
      findUnique: (...args: any[]) => mockWordFindUnique(...args),
    },
    $transaction: (fn: any) => mockTransaction(fn),
  },
}));

describe('WordContextService', () => {
  let wordContextService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Setup transaction mock
    mockTransaction.mockImplementation(async (operations) => {
      if (typeof operations === 'function') {
        return operations({
          wordContext: {
            create: mockWordContextCreate,
          },
        });
      }
      return await Promise.all(operations);
    });

    const module = await import('../../../src/services/word-context.service');
    wordContextService = module.wordContextService;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('addContext', () => {
    it('应该成功添加语境', async () => {
      const wordId = 'word-1';
      const contextType = 'SENTENCE' as ContextType;
      const content = 'This is a sample sentence.';

      mockWordFindUnique.mockResolvedValue({
        id: wordId,
        spelling: 'sample',
      });

      mockWordContextCreate.mockResolvedValue({
        id: 'context-1',
        wordId,
        contextType,
        content,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await wordContextService.addContext({
        wordId,
        contextType,
        content,
      });

      expect(result).toMatchObject({
        id: 'context-1',
        wordId,
        contextType,
        content,
      });
      expect(mockWordFindUnique).toHaveBeenCalledWith({
        where: { id: wordId },
        select: { id: true, spelling: true },
      });
      expect(mockWordContextCreate).toHaveBeenCalled();
    });

    it('应该在单词不存在时抛出错误', async () => {
      const wordId = 'non-existent-word';

      mockWordFindUnique.mockResolvedValue(null);

      await expect(
        wordContextService.addContext({
          wordId,
          contextType: 'SENTENCE',
          content: 'Test',
        }),
      ).rejects.toThrow(`单词不存在: ${wordId}`);
    });

    it('应该支持添加元数据', async () => {
      const wordId = 'word-1';
      const metadata = {
        source: 'test-book',
        difficulty: 'medium',
        tags: ['common', 'daily'],
      };

      mockWordFindUnique.mockResolvedValue({ id: wordId, spelling: 'test' });
      mockWordContextCreate.mockResolvedValue({
        id: 'context-1',
        wordId,
        contextType: 'SENTENCE',
        content: 'Test',
        metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await wordContextService.addContext({
        wordId,
        contextType: 'SENTENCE',
        content: 'Test',
        metadata,
      });

      expect(result.metadata).toEqual(metadata);
    });
  });

  describe('addContexts', () => {
    it('应该批量添加语境', async () => {
      const requests = [
        {
          wordId: 'word-1',
          contextType: 'SENTENCE' as ContextType,
          content: 'First sentence',
        },
        {
          wordId: 'word-2',
          contextType: 'CONVERSATION' as ContextType,
          content: 'Hello there!',
        },
      ];

      const mockContexts = requests.map((req, index) => ({
        id: `context-${index + 1}`,
        ...req,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      mockWordContextCreate.mockImplementation((data: any) => {
        const index = requests.findIndex((r) => r.content === data.data.content);
        return Promise.resolve(mockContexts[index]);
      });

      mockTransaction.mockImplementation(async (operations: any[]) => {
        return await Promise.all(operations);
      });

      const result = await wordContextService.addContexts(requests);

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('First sentence');
      expect(result[1].content).toBe('Hello there!');
    });
  });

  describe('getContexts', () => {
    it('应该获取单词的语境列表', async () => {
      const wordId = 'word-1';
      const mockContexts = [
        {
          id: 'context-1',
          wordId,
          contextType: 'SENTENCE' as ContextType,
          content: 'First sentence',
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'context-2',
          wordId,
          contextType: 'CONVERSATION' as ContextType,
          content: 'Hello!',
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockWordContextFindMany.mockResolvedValue(mockContexts);

      const result = await wordContextService.getContexts(wordId);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'context-1',
        wordId,
      });
    });

    it('应该支持按类型过滤', async () => {
      const wordId = 'word-1';

      mockWordContextFindMany.mockResolvedValue([]);

      await wordContextService.getContexts(wordId, { type: 'SENTENCE' });

      expect(mockWordContextFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            contextType: 'SENTENCE',
          }),
        }),
      );
    });

    it('应该支持分页', async () => {
      const wordId = 'word-1';

      mockWordContextFindMany.mockResolvedValue([]);

      await wordContextService.getContexts(wordId, {
        limit: 10,
        offset: 20,
      });

      expect(mockWordContextFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        }),
      );
    });
  });

  describe('getRandomContext', () => {
    it('应该返回随机语境', async () => {
      const wordId = 'word-1';

      mockWordContextCount.mockResolvedValue(5);
      mockWordContextFindMany.mockResolvedValue([
        {
          id: 'context-3',
          wordId,
          contextType: 'SENTENCE' as ContextType,
          content: 'Random sentence',
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await wordContextService.getRandomContext(wordId);

      expect(result).not.toBeNull();
      expect(result?.wordId).toBe(wordId);
    });

    it('应该在没有语境时返回 null', async () => {
      const wordId = 'word-1';

      mockWordContextCount.mockResolvedValue(0);

      const result = await wordContextService.getRandomContext(wordId);

      expect(result).toBeNull();
    });
  });

  describe('updateContext', () => {
    it('应该更新语境内容', async () => {
      const contextId = 'context-1';
      const newContent = 'Updated content';

      mockWordContextUpdate.mockResolvedValue({
        id: contextId,
        wordId: 'word-1',
        contextType: 'SENTENCE',
        content: newContent,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await wordContextService.updateContext(contextId, newContent);

      expect(result.content).toBe(newContent);
      expect(mockWordContextUpdate).toHaveBeenCalledWith({
        where: { id: contextId },
        data: { content: newContent },
      });
    });
  });

  describe('updateContextMetadata', () => {
    it('应该更新语境元数据', async () => {
      const contextId = 'context-1';
      const existingMetadata = { source: 'book-1', difficulty: 'easy' };
      const newMetadata = { difficulty: 'medium', tags: ['updated'] };

      mockWordContextFindUnique.mockResolvedValue({
        metadata: existingMetadata,
      });

      mockWordContextUpdate.mockResolvedValue({
        id: contextId,
        wordId: 'word-1',
        contextType: 'SENTENCE',
        content: 'Test',
        metadata: { ...existingMetadata, ...newMetadata },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await wordContextService.updateContextMetadata(contextId, newMetadata);

      expect(result.metadata).toMatchObject({
        source: 'book-1',
        difficulty: 'medium',
        tags: ['updated'],
      });
    });

    it('应该在语境不存在时抛出错误', async () => {
      const contextId = 'non-existent-context';

      mockWordContextFindUnique.mockResolvedValue(null);

      await expect(wordContextService.updateContextMetadata(contextId, {})).rejects.toThrow(
        `语境不存在: ${contextId}`,
      );
    });
  });

  describe('deleteContext', () => {
    it('应该删除语境', async () => {
      const contextId = 'context-1';

      mockWordContextDelete.mockResolvedValue({});

      await wordContextService.deleteContext(contextId);

      expect(mockWordContextDelete).toHaveBeenCalledWith({
        where: { id: contextId },
      });
    });
  });

  describe('deleteContexts', () => {
    it('应该批量删除语境', async () => {
      const contextIds = ['context-1', 'context-2', 'context-3'];

      mockWordContextDeleteMany.mockResolvedValue({ count: 3 });

      const count = await wordContextService.deleteContexts(contextIds);

      expect(count).toBe(3);
      expect(mockWordContextDeleteMany).toHaveBeenCalledWith({
        where: { id: { in: contextIds } },
      });
    });
  });

  describe('getContextStats', () => {
    it('应该返回语境统计数据', async () => {
      const wordId = 'word-1';
      const mockContexts = [
        {
          id: 'context-1',
          wordId,
          contextType: 'SENTENCE' as ContextType,
          content: 'Test 1',
          metadata: { usageCount: 10, effectivenessScore: 0.8 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'context-2',
          wordId,
          contextType: 'SENTENCE' as ContextType,
          content: 'Test 2',
          metadata: { usageCount: 5, effectivenessScore: 0.6 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'context-3',
          wordId,
          contextType: 'CONVERSATION' as ContextType,
          content: 'Test 3',
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockWordContextFindMany.mockResolvedValue(mockContexts);

      const stats = await wordContextService.getContextStats(wordId);

      expect(stats.wordId).toBe(wordId);
      expect(stats.total).toBe(3);
      expect(stats.byType.SENTENCE).toBe(2);
      expect(stats.byType.CONVERSATION).toBe(1);
      expect(stats.mostUsed).not.toBeNull();
      expect(stats.mostEffective).not.toBeNull();
    });
  });

  describe('recordContextUsage', () => {
    it('应该记录语境使用', async () => {
      const contextId = 'context-1';
      const metadata = { usageCount: 5, viewCount: 10 };

      mockWordContextFindUnique.mockResolvedValue({
        metadata,
      });

      mockWordContextUpdate.mockResolvedValue({});

      await wordContextService.recordContextUsage(contextId);

      expect(mockWordContextUpdate).toHaveBeenCalledWith({
        where: { id: contextId },
        data: {
          metadata: expect.objectContaining({
            usageCount: 6,
            viewCount: 11,
          }),
        },
      });
    });

    it('应该初始化使用计数', async () => {
      const contextId = 'context-1';

      mockWordContextFindUnique.mockResolvedValue({
        metadata: null,
      });

      mockWordContextUpdate.mockResolvedValue({});

      await wordContextService.recordContextUsage(contextId);

      expect(mockWordContextUpdate).toHaveBeenCalledWith({
        where: { id: contextId },
        data: {
          metadata: expect.objectContaining({
            usageCount: 1,
            viewCount: 1,
          }),
        },
      });
    });
  });

  describe('updateEffectivenessScore', () => {
    it('应该更新效果评分', async () => {
      const contextId = 'context-1';
      const score = 0.85;

      mockWordContextFindUnique.mockResolvedValue({
        metadata: {},
      });

      mockWordContextUpdate.mockResolvedValue({});

      await wordContextService.updateEffectivenessScore(contextId, score);

      expect(mockWordContextUpdate).toHaveBeenCalledWith({
        where: { id: contextId },
        data: {
          metadata: expect.objectContaining({
            effectivenessScore: score,
          }),
        },
      });
    });

    it('应该在评分无效时抛出错误', async () => {
      const contextId = 'context-1';

      await expect(wordContextService.updateEffectivenessScore(contextId, -0.1)).rejects.toThrow();
      await expect(wordContextService.updateEffectivenessScore(contextId, 1.1)).rejects.toThrow();
    });
  });

  describe('getBestContext', () => {
    it('应该返回最佳语境', async () => {
      const wordId = 'word-1';

      // Mock count call
      mockWordContextCount.mockResolvedValue(3);

      // Mock findMany call
      mockWordContextFindMany.mockResolvedValue([
        {
          id: 'context-1',
          wordId,
          contextType: 'SENTENCE' as ContextType,
          content: 'Best context',
          metadata: { effectivenessScore: 0.9 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await wordContextService.getBestContext(wordId, {
        preferredType: 'SENTENCE',
        userLevel: 'intermediate',
      });

      expect(result).not.toBeNull();
      expect(result?.contextType).toBe('SENTENCE');
    });

    it('应该在没有找到时返回 null', async () => {
      const wordId = 'word-1';

      mockWordContextCount.mockResolvedValue(0);

      const result = await wordContextService.getBestContext(wordId);

      expect(result).toBeNull();
    });
  });

  describe('recommendContextsForWords', () => {
    it('应该为多个单词推荐语境', async () => {
      const wordIds = ['word-1', 'word-2'];

      mockWordContextFindMany.mockImplementation((params: any) => {
        const wordId = params.where.wordId;
        return Promise.resolve([
          {
            id: `context-${wordId}`,
            wordId,
            contextType: 'SENTENCE',
            content: `Context for ${wordId}`,
            metadata: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);
      });

      const result = await wordContextService.recommendContextsForWords(wordIds);

      expect(result['word-1']).toHaveLength(1);
      expect(result['word-2']).toHaveLength(1);
    });
  });
});
