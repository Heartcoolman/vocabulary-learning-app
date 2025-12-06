/**
 * WordBook Routes Integration Tests
 *
 * Tests for wordbook API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockWordBookService } = vi.hoisted(() => ({
  mockWordBookService: {
    getUserWordBooks: vi.fn(),
    getSystemWordBooks: vi.fn(),
    getAllAvailableWordBooks: vi.fn(),
    createWordBook: vi.fn(),
    getWordBookById: vi.fn(),
    updateWordBook: vi.fn(),
    deleteWordBook: vi.fn(),
    getWordBookWords: vi.fn(),
    addWordToWordBook: vi.fn(),
    removeWordFromWordBook: vi.fn()
  }
}));

vi.mock('../../../src/services/wordbook.service', () => ({
  default: mockWordBookService
}));

vi.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer valid-token') {
      req.user = { id: 'test-user-id', username: 'testuser' };
      next();
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  },
  optionalAuthMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer valid-token') {
      req.user = { id: 'test-user-id', username: 'testuser' };
    }
    next();
  }
}));

import app from '../../../src/app';

describe('WordBook API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/wordbooks/user ====================

  describe('GET /api/wordbooks/user', () => {
    it('should return user wordbooks', async () => {
      mockWordBookService.getUserWordBooks.mockResolvedValue([
        { id: 'wb-1', name: '我的词书1', wordCount: 50 },
        { id: 'wb-2', name: '我的词书2', wordCount: 100 }
      ]);

      const res = await request(app)
        .get('/api/wordbooks/user')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(mockWordBookService.getUserWordBooks).toHaveBeenCalledWith('test-user-id');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/wordbooks/user');

      expect(res.status).toBe(401);
    });

    it('should return empty array when user has no wordbooks', async () => {
      mockWordBookService.getUserWordBooks.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/wordbooks/user')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  // ==================== GET /api/wordbooks/system ====================

  describe('GET /api/wordbooks/system', () => {
    it('should return system wordbooks', async () => {
      mockWordBookService.getSystemWordBooks.mockResolvedValue([
        { id: 'sys-1', name: 'CET4', wordCount: 4000 },
        { id: 'sys-2', name: 'CET6', wordCount: 6000 }
      ]);

      const res = await request(app)
        .get('/api/wordbooks/system')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/wordbooks/system');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/wordbooks/available ====================

  describe('GET /api/wordbooks/available', () => {
    it('should return all available wordbooks', async () => {
      mockWordBookService.getAllAvailableWordBooks.mockResolvedValue([
        { id: 'sys-1', name: 'CET4', isSystem: true },
        { id: 'wb-1', name: '我的词书', isSystem: false }
      ]);

      const res = await request(app)
        .get('/api/wordbooks/available')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(mockWordBookService.getAllAvailableWordBooks).toHaveBeenCalledWith('test-user-id');
    });
  });

  // ==================== POST /api/wordbooks ====================

  describe('POST /api/wordbooks', () => {
    const validWordBook = {
      name: '新词书',
      description: '这是一个新词书',
      coverImage: 'https://example.com/cover.jpg'
    };

    it('should create a new wordbook', async () => {
      mockWordBookService.createWordBook.mockResolvedValue({
        id: 'new-wb-id',
        ...validWordBook,
        userId: 'test-user-id',
        createdAt: new Date().toISOString()
      });

      const res = await request(app)
        .post('/api/wordbooks')
        .set('Authorization', 'Bearer valid-token')
        .send(validWordBook);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('新词书');
    });

    it('should return 400 for missing name', async () => {
      const res = await request(app)
        .post('/api/wordbooks')
        .set('Authorization', 'Bearer valid-token')
        .send({ description: 'test' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for empty name', async () => {
      const res = await request(app)
        .post('/api/wordbooks')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: '   ' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for name exceeding 100 characters', async () => {
      const res = await request(app)
        .post('/api/wordbooks')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'a'.repeat(101) });

      expect(res.status).toBe(400);
    });

    it('should return 400 for description exceeding 500 characters', async () => {
      const res = await request(app)
        .post('/api/wordbooks')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Test', description: 'a'.repeat(501) });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid cover image URL', async () => {
      const res = await request(app)
        .post('/api/wordbooks')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Test', coverImage: 'not-a-url' });

      expect(res.status).toBe(400);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/wordbooks')
        .send(validWordBook);

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/wordbooks/:id ====================

  describe('GET /api/wordbooks/:id', () => {
    const validId = '123e4567-e89b-12d3-a456-426614174000';

    it('should return wordbook details', async () => {
      mockWordBookService.getWordBookById.mockResolvedValue({
        id: validId,
        name: 'Test WordBook',
        description: 'Test description',
        wordCount: 100
      });

      const res = await request(app)
        .get(`/api/wordbooks/${validId}`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test WordBook');
      expect(mockWordBookService.getWordBookById).toHaveBeenCalledWith(validId, 'test-user-id');
    });

    it('should handle wordbook not found', async () => {
      mockWordBookService.getWordBookById.mockRejectedValue(new Error('词书不存在'));

      const res = await request(app)
        .get(`/api/wordbooks/${validId}`)
        .set('Authorization', 'Bearer valid-token');

      expect([404, 500]).toContain(res.status);
    });

    it('should return 400 for invalid UUID format', async () => {
      const res = await request(app)
        .get('/api/wordbooks/invalid-id')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
    });
  });

  // ==================== PUT /api/wordbooks/:id ====================

  describe('PUT /api/wordbooks/:id', () => {
    const validId = '123e4567-e89b-12d3-a456-426614174000';
    const updateData = {
      name: '更新的词书名称',
      description: '更新的描述'
    };

    it('should update wordbook', async () => {
      mockWordBookService.updateWordBook.mockResolvedValue({
        id: validId,
        ...updateData,
        updatedAt: new Date().toISOString()
      });

      const res = await request(app)
        .put(`/api/wordbooks/${validId}`)
        .set('Authorization', 'Bearer valid-token')
        .send(updateData);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('更新的词书名称');
    });

    it('should return 400 for empty name', async () => {
      const res = await request(app)
        .put(`/api/wordbooks/${validId}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ name: '  ' });

      expect(res.status).toBe(400);
    });

    it('should handle wordbook not found on update', async () => {
      mockWordBookService.updateWordBook.mockRejectedValue(new Error('词书不存在'));

      const res = await request(app)
        .put(`/api/wordbooks/${validId}`)
        .set('Authorization', 'Bearer valid-token')
        .send(updateData);

      expect([404, 500]).toContain(res.status);
    });
  });

  // ==================== DELETE /api/wordbooks/:id ====================

  describe('DELETE /api/wordbooks/:id', () => {
    const validId = '123e4567-e89b-12d3-a456-426614174000';

    it('should delete wordbook', async () => {
      mockWordBookService.deleteWordBook.mockResolvedValue(undefined);

      const res = await request(app)
        .delete(`/api/wordbooks/${validId}`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('删除成功');
      expect(mockWordBookService.deleteWordBook).toHaveBeenCalledWith(validId, 'test-user-id');
    });

    it('should handle wordbook not found on delete', async () => {
      mockWordBookService.deleteWordBook.mockRejectedValue(new Error('词书不存在'));

      const res = await request(app)
        .delete(`/api/wordbooks/${validId}`)
        .set('Authorization', 'Bearer valid-token');

      expect([404, 500]).toContain(res.status);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).delete(`/api/wordbooks/${validId}`);

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/wordbooks/:id/words ====================

  describe('GET /api/wordbooks/:id/words', () => {
    const validId = '123e4567-e89b-12d3-a456-426614174000';

    it('should return words in wordbook', async () => {
      mockWordBookService.getWordBookWords.mockResolvedValue([
        { id: 'word-1', spelling: 'apple', meanings: ['苹果'] },
        { id: 'word-2', spelling: 'banana', meanings: ['香蕉'] }
      ]);

      const res = await request(app)
        .get(`/api/wordbooks/${validId}/words`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    it('should return empty array when wordbook has no words', async () => {
      mockWordBookService.getWordBookWords.mockResolvedValue([]);

      const res = await request(app)
        .get(`/api/wordbooks/${validId}/words`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  // ==================== POST /api/wordbooks/:id/words ====================

  describe('POST /api/wordbooks/:id/words', () => {
    const validId = '123e4567-e89b-12d3-a456-426614174000';
    const validWord = {
      spelling: 'test',
      phonetic: '/test/',
      meanings: ['测试'],
      examples: ['This is a test.']
    };

    it('should add word to wordbook', async () => {
      mockWordBookService.addWordToWordBook.mockResolvedValue({
        id: 'new-word-id',
        ...validWord,
        createdAt: new Date().toISOString()
      });

      const res = await request(app)
        .post(`/api/wordbooks/${validId}/words`)
        .set('Authorization', 'Bearer valid-token')
        .send(validWord);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.spelling).toBe('test');
    });

    it('should return 400 for missing spelling', async () => {
      const res = await request(app)
        .post(`/api/wordbooks/${validId}/words`)
        .set('Authorization', 'Bearer valid-token')
        .send({ meanings: ['test'] });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid meanings format', async () => {
      const res = await request(app)
        .post(`/api/wordbooks/${validId}/words`)
        .set('Authorization', 'Bearer valid-token')
        .send({ spelling: 'test', meanings: 'not-an-array' });

      expect(res.status).toBe(400);
    });
  });

  // ==================== DELETE /api/wordbooks/:wordBookId/words/:wordId ====================

  describe('DELETE /api/wordbooks/:wordBookId/words/:wordId', () => {
    const wordBookId = '123e4567-e89b-12d3-a456-426614174000';
    const wordId = '223e4567-e89b-12d3-a456-426614174001';

    it('should remove word from wordbook', async () => {
      mockWordBookService.removeWordFromWordBook.mockResolvedValue(undefined);

      const res = await request(app)
        .delete(`/api/wordbooks/${wordBookId}/words/${wordId}`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('删除成功');
      expect(mockWordBookService.removeWordFromWordBook).toHaveBeenCalledWith(
        wordBookId,
        wordId,
        'test-user-id'
      );
    });

    it('should handle word not found in wordbook', async () => {
      mockWordBookService.removeWordFromWordBook.mockRejectedValue(new Error('单词不存在'));

      const res = await request(app)
        .delete(`/api/wordbooks/${wordBookId}/words/${wordId}`)
        .set('Authorization', 'Bearer valid-token');

      expect([404, 500]).toContain(res.status);
    });

    it('should return 400 for invalid UUID format', async () => {
      const res = await request(app)
        .delete(`/api/wordbooks/invalid-id/words/${wordId}`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
    });
  });
});
