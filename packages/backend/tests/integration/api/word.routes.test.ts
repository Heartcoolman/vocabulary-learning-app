/**
 * Word Routes Integration Tests
 *
 * Tests for word CRUD API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockWordService } = vi.hoisted(() => ({
  mockWordService: {
    getWordsByUserId: vi.fn(),
    getWordById: vi.fn(),
    createWord: vi.fn(),
    batchCreateWords: vi.fn(),
    updateWord: vi.fn(),
    deleteWord: vi.fn()
  }
}));

vi.mock('../../../src/services/word.service', () => ({
  default: mockWordService
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
    // optionalAuthMiddleware always calls next, even without auth
    next();
  }
}));

import app from '../../../src/app';

describe('Word API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/words ====================

  describe('GET /api/words', () => {
    it('should return all words for user', async () => {
      mockWordService.getWordsByUserId.mockResolvedValue([
        { id: 'word-1', spelling: 'apple', meanings: ['苹果'] },
        { id: 'word-2', spelling: 'banana', meanings: ['香蕉'] },
        { id: 'word-3', spelling: 'cherry', meanings: ['樱桃'] }
      ]);

      const res = await request(app)
        .get('/api/words')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);
      expect(mockWordService.getWordsByUserId).toHaveBeenCalledWith('test-user-id');
    });

    it('should return empty array when user has no words', async () => {
      mockWordService.getWordsByUserId.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/words')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/words');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/words/:id ====================

  describe('GET /api/words/:id', () => {
    const validWordId = '123e4567-e89b-12d3-a456-426614174000';

    it('should return a single word', async () => {
      mockWordService.getWordById.mockResolvedValue({
        id: validWordId,
        spelling: 'hello',
        phonetic: '/həˈloʊ/',
        meanings: ['你好', '喂'],
        examples: ['Hello, world!', 'Hello, how are you?']
      });

      const res = await request(app)
        .get(`/api/words/${validWordId}`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.spelling).toBe('hello');
      expect(mockWordService.getWordById).toHaveBeenCalledWith(validWordId, 'test-user-id');
    });

    it('should handle word not found', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      mockWordService.getWordById.mockRejectedValue(new Error('单词不存在'));

      const res = await request(app)
        .get(`/api/words/${nonExistentId}`)
        .set('Authorization', 'Bearer valid-token');

      // 404 for resource not found, 500 for unexpected errors
      expect([404, 500]).toContain(res.status);
    });
  });

  // ==================== POST /api/words ====================

  describe('POST /api/words', () => {
    const validWord = {
      spelling: 'test',
      phonetic: '/test/',
      meanings: ['测试'],
      examples: ['This is a test.']
    };

    it('should create a new word', async () => {
      mockWordService.createWord.mockResolvedValue({
        id: 'new-word-id',
        ...validWord,
        createdAt: new Date().toISOString()
      });

      const res = await request(app)
        .post('/api/words')
        .set('Authorization', 'Bearer valid-token')
        .send(validWord);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('new-word-id');
      expect(mockWordService.createWord).toHaveBeenCalledWith('test-user-id', validWord);
    });

    it('should return 400 for invalid word data', async () => {
      const res = await request(app)
        .post('/api/words')
        .set('Authorization', 'Bearer valid-token')
        .send({ meanings: ['test'] }); // missing required spelling

      expect(res.status).toBe(400);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/words')
        .send(validWord);

      expect(res.status).toBe(401);
    });
  });

  // ==================== POST /api/words/batch ====================

  describe('POST /api/words/batch', () => {
    const batchWords = [
      { spelling: 'word1', phonetic: '/wɜːrd1/', meanings: ['meaning1'], examples: ['example1'] },
      { spelling: 'word2', phonetic: '/wɜːrd2/', meanings: ['meaning2'], examples: ['example2'] },
      { spelling: 'word3', phonetic: '/wɜːrd3/', meanings: ['meaning3'], examples: ['example3'] }
    ];

    it('should batch create words', async () => {
      mockWordService.batchCreateWords.mockResolvedValue({
        created: 3,
        failed: 0,
        words: batchWords.map((w, i) => ({ id: `word-${i}`, ...w }))
      });

      const res = await request(app)
        .post('/api/words/batch')
        .set('Authorization', 'Bearer valid-token')
        .send({ words: batchWords });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.created).toBe(3);
    });

    it('should return 400 for non-array words', async () => {
      const res = await request(app)
        .post('/api/words/batch')
        .set('Authorization', 'Bearer valid-token')
        .send({ words: 'not-an-array' });

      // 400 for validation errors
      expect(res.status).toBe(400);
    });

    it('should handle partial success', async () => {
      mockWordService.batchCreateWords.mockResolvedValue({
        created: 2,
        failed: 1,
        errors: [{ spelling: 'word3', error: 'duplicate' }]
      });

      const res = await request(app)
        .post('/api/words/batch')
        .set('Authorization', 'Bearer valid-token')
        .send({ words: batchWords });

      expect(res.status).toBe(201);
      expect(res.body.data.created).toBe(2);
      expect(res.body.data.failed).toBe(1);
    });
  });

  // ==================== PUT /api/words/:id ====================

  describe('PUT /api/words/:id', () => {
    const validWordId = '123e4567-e89b-12d3-a456-426614174000';
    const updateData = {
      meanings: ['更新的含义'],
      examples: ['Updated example sentence.']
    };

    it('should update a word', async () => {
      mockWordService.updateWord.mockResolvedValue({
        id: validWordId,
        spelling: 'test',
        ...updateData,
        updatedAt: new Date().toISOString()
      });

      const res = await request(app)
        .put(`/api/words/${validWordId}`)
        .set('Authorization', 'Bearer valid-token')
        .send(updateData);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.meanings).toEqual(['更新的含义']);
      expect(mockWordService.updateWord).toHaveBeenCalledWith(
        validWordId,
        'test-user-id',
        updateData
      );
    });

    it('should return 400 for invalid update data', async () => {
      const res = await request(app)
        .put(`/api/words/${validWordId}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ meanings: 'not-an-array' });

      expect(res.status).toBe(400);
    });

    it('should handle word not found on update', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      mockWordService.updateWord.mockRejectedValue(new Error('单词不存在'));

      const res = await request(app)
        .put(`/api/words/${nonExistentId}`)
        .set('Authorization', 'Bearer valid-token')
        .send(updateData);

      // 404 for resource not found, 500 for unexpected errors
      expect([404, 500]).toContain(res.status);
    });
  });

  // ==================== DELETE /api/words/:id ====================

  describe('DELETE /api/words/:id', () => {
    const validWordId = '123e4567-e89b-12d3-a456-426614174000';

    it('should delete a word', async () => {
      mockWordService.deleteWord.mockResolvedValue(undefined);

      const res = await request(app)
        .delete(`/api/words/${validWordId}`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('删除成功');
      expect(mockWordService.deleteWord).toHaveBeenCalledWith(validWordId, 'test-user-id');
    });

    it('should handle word not found on delete', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      mockWordService.deleteWord.mockRejectedValue(new Error('单词不存在'));

      const res = await request(app)
        .delete(`/api/words/${nonExistentId}`)
        .set('Authorization', 'Bearer valid-token');

      // 404 for resource not found, 500 for unexpected errors
      expect([404, 500]).toContain(res.status);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).delete(`/api/words/${validWordId}`);

      expect(res.status).toBe(401);
    });
  });
});
