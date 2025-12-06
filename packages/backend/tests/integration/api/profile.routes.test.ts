/**
 * Profile Routes Integration Tests
 *
 * Tests for cognitive profile API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// All mock definitions need to be hoisted to avoid initialization errors
const { mockGetChronotypeProfile, mockGetLearningStyleProfile, MockInsufficientDataError, MockAnalysisError } = vi.hoisted(() => {
  // Define error classes inside hoisted block
  class InsufficientDataError extends Error {
    code = 'INSUFFICIENT_DATA';
    required: number;
    actual: number;
    constructor(required: number, actual: number) {
      super(`Insufficient data to build profile (need ${required}, have ${actual})`);
      this.required = required;
      this.actual = actual;
    }
  }

  class AnalysisError extends Error {
    code = 'ANALYSIS_FAILED';
    constructor(message: string) {
      super(message);
    }
  }

  return {
    mockGetChronotypeProfile: vi.fn(),
    mockGetLearningStyleProfile: vi.fn(),
    MockInsufficientDataError: InsufficientDataError,
    MockAnalysisError: AnalysisError
  };
});

// Mock the cognitive-profiling service directly
vi.mock('../../../src/services/cognitive-profiling.service', () => ({
  getChronotypeProfile: mockGetChronotypeProfile,
  getLearningStyleProfile: mockGetLearningStyleProfile,
  InsufficientDataError: MockInsufficientDataError,
  AnalysisError: MockAnalysisError,
  MIN_PROFILING_RECORDS: 20,
  CACHE_TTL_MS: 6 * 60 * 60 * 1000,
  invalidateCognitiveCacheForUser: vi.fn(),
  default: {
    getChronotypeProfile: mockGetChronotypeProfile,
    getLearningStyleProfile: mockGetLearningStyleProfile,
    invalidateCognitiveCacheForUser: vi.fn(),
  }
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

// Use the mock error classes defined above
const InsufficientDataError = MockInsufficientDataError;
const AnalysisError = MockAnalysisError;

describe('Profile API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/users/profile/chronotype ====================

  describe('GET /api/users/profile/chronotype', () => {
    it('should return chronotype profile', async () => {
      mockGetChronotypeProfile.mockResolvedValue({
        type: 'morning_lark',
        peakHours: [8, 9, 10],
        troughHours: [14, 15],
        confidence: 0.85
      });

      const res = await request(app)
        .get('/api/users/profile/chronotype')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('morning_lark');
      expect(res.body.data.peakHours).toContain(9);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/users/profile/chronotype');

      expect(res.status).toBe(401);
    });

    it('should return 400 for insufficient data', async () => {
      mockGetChronotypeProfile.mockRejectedValue(
        new InsufficientDataError(10, 3)
      );

      const res = await request(app)
        .get('/api/users/profile/chronotype')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 500 for analysis error', async () => {
      mockGetChronotypeProfile.mockRejectedValue(
        new AnalysisError('Analysis failed')
      );

      const res = await request(app)
        .get('/api/users/profile/chronotype')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(500);
    });
  });

  // ==================== GET /api/users/profile/learning-style ====================

  describe('GET /api/users/profile/learning-style', () => {
    it('should return learning style profile', async () => {
      mockGetLearningStyleProfile.mockResolvedValue({
        dominantStyle: 'visual',
        scores: {
          visual: 0.6,
          auditory: 0.25,
          kinesthetic: 0.15
        },
        recommendations: ['Use flashcards', 'Watch videos']
      });

      const res = await request(app)
        .get('/api/users/profile/learning-style')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dominantStyle).toBe('visual');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/users/profile/learning-style');

      expect(res.status).toBe(401);
    });

    it('should return 400 for insufficient data', async () => {
      mockGetLearningStyleProfile.mockRejectedValue(
        new InsufficientDataError(20, 5)
      );

      const res = await request(app)
        .get('/api/users/profile/learning-style')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
    });
  });

  // ==================== GET /api/users/profile/cognitive ====================

  describe('GET /api/users/profile/cognitive', () => {
    it('should return combined cognitive profile', async () => {
      mockGetChronotypeProfile.mockResolvedValue({
        type: 'night_owl',
        peakHours: [20, 21, 22],
        confidence: 0.9
      });

      mockGetLearningStyleProfile.mockResolvedValue({
        dominantStyle: 'auditory',
        scores: { visual: 0.3, auditory: 0.5, kinesthetic: 0.2 }
      });

      const res = await request(app)
        .get('/api/users/profile/cognitive')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.chronotype).toBeDefined();
      expect(res.body.data.learningStyle).toBeDefined();
      expect(res.body.data.chronotype.type).toBe('night_owl');
      expect(res.body.data.learningStyle.dominantStyle).toBe('auditory');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/users/profile/cognitive');

      expect(res.status).toBe(401);
    });

    it('should handle partial failure', async () => {
      mockGetChronotypeProfile.mockRejectedValue(
        new InsufficientDataError(10, 2)
      );

      const res = await request(app)
        .get('/api/users/profile/cognitive')
        .set('Authorization', 'Bearer valid-token');

      // The combined endpoint should fail if any part fails
      expect(res.status).toBe(400);
    });
  });
});
