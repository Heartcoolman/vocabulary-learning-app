/**
 * Cognitive Profiling Service Unit Tests
 * Tests for the actual cognitive profiling service API
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the AMAS modeling modules with proper class constructors
vi.mock('../../../src/amas/modeling/chronotype', () => {
  return {
    ChronotypeDetector: class MockChronotypeDetector {
      analyzeChronotype = vi.fn().mockResolvedValue({
        category: 'morning',
        peakHours: [9, 10, 11],
        confidence: 0.85,
        sampleCount: 50,
        learningHistory: [],
      });
    },
  };
});

vi.mock('../../../src/amas/modeling/learning-style', () => {
  return {
    LearningStyleProfiler: class MockLearningStyleProfiler {
      detectLearningStyle = vi.fn().mockResolvedValue({
        style: 'visual',
        scores: { visual: 0.6, auditory: 0.3, kinesthetic: 0.1 },
        confidence: 0.8,
        sampleCount: 50,
        interactionPatterns: {
          avgDwellTime: 2500,
          avgResponseTime: 1500,
          pauseFrequency: 0.1,
          switchFrequency: 0.05,
        },
      });
    },
  };
});

describe('CognitiveProfilingService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('getChronotypeProfile', () => {
    it('should return chronotype profile for user', async () => {
      const { getChronotypeProfile, invalidateCognitiveCacheForUser } =
        await import('../../../src/services/cognitive-profiling.service');

      // Clear cache first
      invalidateCognitiveCacheForUser('user-chrono-1');

      const result = await getChronotypeProfile('user-chrono-1');

      expect(result).toBeDefined();
      expect(result.category).toBe('morning');
    });

    it('should throw error for missing user id', async () => {
      const { getChronotypeProfile } =
        await import('../../../src/services/cognitive-profiling.service');

      await expect(getChronotypeProfile(undefined as any)).rejects.toThrow('Missing user id');
    });

    it('should cache results', async () => {
      const { getChronotypeProfile, invalidateCognitiveCacheForUser } =
        await import('../../../src/services/cognitive-profiling.service');

      // Clear cache
      invalidateCognitiveCacheForUser('user-cache-1');

      // First call
      const result1 = await getChronotypeProfile('user-cache-1');

      // Second call should use cache
      const result2 = await getChronotypeProfile('user-cache-1');

      expect(result1).toEqual(result2);
    });
  });

  describe('getLearningStyleProfile', () => {
    it('should return learning style profile for user', async () => {
      const { getLearningStyleProfile, invalidateCognitiveCacheForUser } =
        await import('../../../src/services/cognitive-profiling.service');

      invalidateCognitiveCacheForUser('user-style-1');

      const result = await getLearningStyleProfile('user-style-1');

      expect(result).toBeDefined();
      expect(result.style).toBe('visual');
    });

    it('should throw error for missing user id', async () => {
      const { getLearningStyleProfile } =
        await import('../../../src/services/cognitive-profiling.service');

      await expect(getLearningStyleProfile(undefined as any)).rejects.toThrow('Missing user id');
    });
  });

  describe('invalidateCognitiveCacheForUser', () => {
    it('should invalidate cache for user', async () => {
      const { getChronotypeProfile, invalidateCognitiveCacheForUser } =
        await import('../../../src/services/cognitive-profiling.service');

      // Populate cache
      await getChronotypeProfile('user-invalidate-1');

      // Should not throw
      expect(() => {
        invalidateCognitiveCacheForUser('user-invalidate-1');
      }).not.toThrow();
    });
  });

  describe('module exports', () => {
    it('should export getChronotypeProfile', async () => {
      const module = await import('../../../src/services/cognitive-profiling.service');
      expect(module.getChronotypeProfile).toBeDefined();
      expect(typeof module.getChronotypeProfile).toBe('function');
    });

    it('should export getLearningStyleProfile', async () => {
      const module = await import('../../../src/services/cognitive-profiling.service');
      expect(module.getLearningStyleProfile).toBeDefined();
      expect(typeof module.getLearningStyleProfile).toBe('function');
    });

    it('should export invalidateCognitiveCacheForUser', async () => {
      const module = await import('../../../src/services/cognitive-profiling.service');
      expect(module.invalidateCognitiveCacheForUser).toBeDefined();
      expect(typeof module.invalidateCognitiveCacheForUser).toBe('function');
    });

    it('should export MIN_PROFILING_RECORDS constant', async () => {
      const module = await import('../../../src/services/cognitive-profiling.service');
      expect(module.MIN_PROFILING_RECORDS).toBeDefined();
      expect(typeof module.MIN_PROFILING_RECORDS).toBe('number');
      expect(module.MIN_PROFILING_RECORDS).toBe(20);
    });

    it('should export InsufficientDataError class', async () => {
      const module = await import('../../../src/services/cognitive-profiling.service');
      expect(module.InsufficientDataError).toBeDefined();
    });

    it('should export AnalysisError class', async () => {
      const module = await import('../../../src/services/cognitive-profiling.service');
      expect(module.AnalysisError).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('InsufficientDataError should contain required and actual counts', async () => {
      const module = await import('../../../src/services/cognitive-profiling.service');
      const error = new module.InsufficientDataError(20, 5);

      expect(error.required).toBe(20);
      expect(error.actual).toBe(5);
      expect(error.code).toBe('INSUFFICIENT_DATA');
    });

    it('AnalysisError should have correct code', async () => {
      const module = await import('../../../src/services/cognitive-profiling.service');
      const error = new module.AnalysisError('test error');

      expect(error.code).toBe('ANALYSIS_FAILED');
    });
  });
});
