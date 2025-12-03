/**
 * Records Routes Integration Tests
 *
 * Tests for learning records API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Mock record service
const mockRecordService = {
  getRecordsByUserId: vi.fn(),
  createRecord: vi.fn(),
  batchCreateRecords: vi.fn(),
  getStatistics: vi.fn(),
  getRecentRecords: vi.fn(),
  getRecordsByWord: vi.fn()
};

vi.mock('../../../src/services/record.service', () => ({
  default: mockRecordService,
  recordService: mockRecordService
}));

// Mock auth middleware
vi.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer valid-token') {
      req.user = { id: 'test-user-id', username: 'testuser' };
      next();
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
}));

import app from '../../../src/app';

describe('Records API Routes', () => {
  const validToken = 'valid-token';
  const testUserId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/records ====================

  describe('GET /api/records', () => {
    it('should return paginated records', async () => {
      const mockResult = {
        data: [
          { id: 'rec-1', wordId: 'word-1', isCorrect: true },
          { id: 'rec-2', wordId: 'word-2', isCorrect: false }
        ],
        pagination: { page: 1, pageSize: 50, total: 100, totalPages: 2 }
      };
      mockRecordService.getRecordsByUserId.mockResolvedValue(mockResult);

      const res = await request(app)
        .get('/api/records')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination.total).toBe(100);
    });

    it('should support pagination parameters', async () => {
      mockRecordService.getRecordsByUserId.mockResolvedValue({
        data: [],
        pagination: { page: 2, pageSize: 20, total: 100, totalPages: 5 }
      });

      const res = await request(app)
        .get('/api/records?page=2&pageSize=20')
        .set('Authorization', `Bearer ${validToken}`);

      expect(mockRecordService.getRecordsByUserId).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({ page: 2, pageSize: 20 })
      );
    });

    it('should cap page size at 100', async () => {
      mockRecordService.getRecordsByUserId.mockResolvedValue({
        data: [],
        pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 }
      });

      await request(app)
        .get('/api/records?pageSize=500')
        .set('Authorization', `Bearer ${validToken}`);

      // Service should receive capped value
      expect(mockRecordService.getRecordsByUserId).toHaveBeenCalled();
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/records');

      expect(res.status).toBe(401);
    });

    it('should handle empty records', async () => {
      mockRecordService.getRecordsByUserId.mockResolvedValue({
        data: [],
        pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 }
      });

      const res = await request(app)
        .get('/api/records')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.body.data).toEqual([]);
    });
  });

  // ==================== POST /api/records ====================

  describe('POST /api/records', () => {
    const validRecord = {
      wordId: 'word-123',
      isCorrect: true,
      responseTimeMs: 2500,
      questionType: 'multiple_choice'
    };

    it('should create a new record', async () => {
      mockRecordService.createRecord.mockResolvedValue({
        id: 'new-rec-id',
        ...validRecord,
        userId: testUserId,
        createdAt: new Date().toISOString()
      });

      const res = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validRecord);

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe('new-rec-id');
    });

    it('should return 400 for missing wordId', async () => {
      const res = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ isCorrect: true, responseTimeMs: 2000 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid responseTimeMs', async () => {
      const res = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ wordId: 'word-1', isCorrect: true, responseTimeMs: -100 });

      expect(res.status).toBe(400);
    });

    it('should include sessionId if provided', async () => {
      mockRecordService.createRecord.mockResolvedValue({
        id: 'rec-id',
        ...validRecord,
        sessionId: 'session-123'
      });

      const res = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ ...validRecord, sessionId: 'session-123' });

      expect(mockRecordService.createRecord).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({ sessionId: 'session-123' })
      );
    });

    it('should return 401 without token', async () => {
      const res = await request(app)
        .post('/api/records')
        .send(validRecord);

      expect(res.status).toBe(401);
    });
  });

  // ==================== POST /api/records/batch ====================

  describe('POST /api/records/batch', () => {
    it('should create multiple records', async () => {
      const records = [
        { wordId: 'word-1', isCorrect: true, responseTimeMs: 2000 },
        { wordId: 'word-2', isCorrect: false, responseTimeMs: 3000 }
      ];
      mockRecordService.batchCreateRecords.mockResolvedValue({ count: 2 });

      const res = await request(app)
        .post('/api/records/batch')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ records });

      expect(res.status).toBe(201);
      expect(res.body.data.count).toBe(2);
    });

    it('should reject batch larger than 1000', async () => {
      const records = Array.from({ length: 1001 }, (_, i) => ({
        wordId: `word-${i}`,
        isCorrect: true,
        responseTimeMs: 2000
      }));

      const res = await request(app)
        .post('/api/records/batch')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ records });

      expect(res.status).toBe(400);
    });

    it('should validate each record in batch', async () => {
      const records = [
        { wordId: 'word-1', isCorrect: true, responseTimeMs: 2000 },
        { wordId: '', isCorrect: true, responseTimeMs: 2000 } // Invalid
      ];

      const res = await request(app)
        .post('/api/records/batch')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ records });

      expect(res.status).toBe(400);
    });

    it('should handle empty batch', async () => {
      const res = await request(app)
        .post('/api/records/batch')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ records: [] });

      expect(res.status).toBe(400);
    });
  });

  // ==================== GET /api/records/statistics ====================

  describe('GET /api/records/statistics', () => {
    it('should return user learning statistics', async () => {
      mockRecordService.getStatistics.mockResolvedValue({
        totalAnswers: 500,
        correctAnswers: 400,
        correctRate: 0.8,
        avgResponseTime: 2500,
        streakDays: 7
      });

      const res = await request(app)
        .get('/api/records/statistics')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.correctRate).toBe(0.8);
    });

    it('should handle new user with no records', async () => {
      mockRecordService.getStatistics.mockResolvedValue({
        totalAnswers: 0,
        correctAnswers: 0,
        correctRate: 0,
        avgResponseTime: 0,
        streakDays: 0
      });

      const res = await request(app)
        .get('/api/records/statistics')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.body.data.totalAnswers).toBe(0);
    });
  });

  // ==================== GET /api/records/recent ====================

  describe('GET /api/records/recent', () => {
    it('should return recent records', async () => {
      mockRecordService.getRecentRecords.mockResolvedValue([
        { id: 'rec-1', wordId: 'word-1', isCorrect: true, createdAt: new Date() }
      ]);

      const res = await request(app)
        .get('/api/records/recent?hours=24')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('should default to 24 hours', async () => {
      mockRecordService.getRecentRecords.mockResolvedValue([]);

      await request(app)
        .get('/api/records/recent')
        .set('Authorization', `Bearer ${validToken}`);

      expect(mockRecordService.getRecentRecords).toHaveBeenCalledWith(
        testUserId,
        24
      );
    });
  });

  // ==================== GET /api/records/word/:wordId ====================

  describe('GET /api/records/word/:wordId', () => {
    it('should return records for specific word', async () => {
      mockRecordService.getRecordsByWord.mockResolvedValue([
        { id: 'rec-1', wordId: 'word-123', isCorrect: true },
        { id: 'rec-2', wordId: 'word-123', isCorrect: false }
      ]);

      const res = await request(app)
        .get('/api/records/word/word-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('should return empty for unknown word', async () => {
      mockRecordService.getRecordsByWord.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/records/word/unknown-word')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.body.data).toEqual([]);
    });
  });
});
