/**
 * Records Routes Integration Tests
 *
 * Tests for learning records API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';

// Use vi.hoisted to ensure mock is available after hoisting
const { mockRecordService } = vi.hoisted(() => ({
  mockRecordService: {
    getRecordsByUserId: vi.fn(),
    createRecord: vi.fn(),
    batchCreateRecords: vi.fn(),
    getStatistics: vi.fn()
  }
}));

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

    it('should handle invalid page parameter gracefully', async () => {
      mockRecordService.getRecordsByUserId.mockResolvedValue({
        data: [],
        pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 }
      });

      const res = await request(app)
        .get('/api/records?page=invalid')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      // Invalid params should be treated as undefined
      expect(mockRecordService.getRecordsByUserId).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({ page: undefined })
      );
    });
  });

  // ==================== POST /api/records ====================

  describe('POST /api/records', () => {
    const wordId = randomUUID();
    const validRecord = {
      wordId,
      isCorrect: true,
      responseTime: 2500
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
        .send({ isCorrect: true, responseTime: 2000 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid wordId format', async () => {
      const res = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ wordId: 'not-a-uuid', isCorrect: true, responseTime: 2000 });

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

    it('should accept optional fields', async () => {
      const recordWithOptionals = {
        ...validRecord,
        selectedAnswer: 'test answer',
        correctAnswer: 'correct answer',
        dwellTime: 5000,
        masteryLevelBefore: 2,
        masteryLevelAfter: 3
      };
      mockRecordService.createRecord.mockResolvedValue({
        id: 'rec-id',
        ...recordWithOptionals
      });

      const res = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${validToken}`)
        .send(recordWithOptionals);

      expect(res.status).toBe(201);
    });
  });

  // ==================== POST /api/records/batch ====================

  describe('POST /api/records/batch', () => {
    const wordId1 = randomUUID();
    const wordId2 = randomUUID();

    it('should create multiple records', async () => {
      const records = [
        { wordId: wordId1, isCorrect: true, responseTime: 2000 },
        { wordId: wordId2, isCorrect: false, responseTime: 3000 }
      ];
      mockRecordService.batchCreateRecords.mockResolvedValue({ count: 2 });

      const res = await request(app)
        .post('/api/records/batch')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ records });

      expect(res.status).toBe(201);
      expect(res.body.data.count).toBe(2);
    });

    it('should validate each record in batch', async () => {
      const records = [
        { wordId: wordId1, isCorrect: true, responseTime: 2000 },
        { wordId: 'invalid-uuid', isCorrect: true, responseTime: 2000 } // Invalid UUID
      ];

      const res = await request(app)
        .post('/api/records/batch')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ records });

      expect(res.status).toBe(400);
    });

    it('should handle empty batch', async () => {
      mockRecordService.batchCreateRecords.mockResolvedValue({ count: 0 });

      const res = await request(app)
        .post('/api/records/batch')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ records: [] });

      // Empty batch is allowed per schema
      expect(res.status).toBe(201);
      expect(res.body.data.count).toBe(0);
    });

    it('should return 401 without token', async () => {
      const res = await request(app)
        .post('/api/records/batch')
        .send({ records: [] });

      expect(res.status).toBe(401);
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

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/records/statistics');

      expect(res.status).toBe(401);
    });
  });
});
