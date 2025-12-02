import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock functions defined inside the mock factory to avoid hoisting issues
vi.mock('../../../src/amas/modeling/chronotype', () => {
  const mockAnalyze = vi.fn();
  return {
    ChronotypeDetector: class {
      analyzeChronotype = mockAnalyze;
    },
    mockAnalyzeChronotype: mockAnalyze,
  };
});

vi.mock('../../../src/amas/modeling/learning-style', () => {
  const mockDetect = vi.fn();
  return {
    LearningStyleProfiler: class {
      detectLearningStyle = mockDetect;
    },
    mockDetectLearningStyle: mockDetect,
  };
});

// NOW import the service after mocks are set up
import {
  getChronotypeProfile,
  getLearningStyleProfile,
  invalidateCognitiveCacheForUser,
  InsufficientDataError,
  AnalysisError,
} from '../../../src/services/cognitive-profiling.service';

// Import the mock functions
import { mockAnalyzeChronotype } from '../../../src/amas/modeling/chronotype';
import { mockDetectLearningStyle } from '../../../src/amas/modeling/learning-style';

describe('CognitiveProfilingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear cache between tests
    invalidateCognitiveCacheForUser('test-user');
  });

  describe('getChronotypeProfile', () => {
    it('should return chronotype profile for valid user', async () => {
      const mockProfile = {
        category: 'morning' as const,
        peakHours: [7, 8, 9],
        confidence: 0.85,
        sampleCount: 50,
        learningHistory: [],
      };

      mockAnalyzeChronotype.mockResolvedValue(mockProfile);

      const result = await getChronotypeProfile('test-user');

      expect(result).toEqual(mockProfile);
      expect(mockAnalyzeChronotype).toHaveBeenCalledWith('test-user');
    });

    it('should cache chronotype profile and return from cache on subsequent calls', async () => {
      const mockProfile = {
        category: 'evening' as const,
        peakHours: [19, 20, 21],
        confidence: 0.75,
        sampleCount: 50,
        learningHistory: [],
      };

      mockAnalyzeChronotype.mockResolvedValue(mockProfile);

      // First call
      const result1 = await getChronotypeProfile('test-user');
      expect(mockAnalyzeChronotype).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await getChronotypeProfile('test-user');
      expect(mockAnalyzeChronotype).toHaveBeenCalledTimes(1); // Not called again
      expect(result1).toEqual(result2);
    });

    it('should throw AnalysisError when chronotype detection fails', async () => {
      mockAnalyzeChronotype.mockRejectedValue(new Error('Detection failed'));

      await expect(getChronotypeProfile('test-user')).rejects.toThrow(AnalysisError);
    });

    it('should throw error when userId is missing', async () => {
      await expect(getChronotypeProfile(undefined as any)).rejects.toThrow('Missing user id');
    });
  });

  describe('getLearningStyleProfile', () => {
    it('should return learning style profile for valid user', async () => {
      const mockProfile = {
        style: 'visual' as const,
        confidence: 0.8,
        sampleCount: 80,
        scores: {
          visual: 0.7,
          auditory: 0.2,
          kinesthetic: 0.1,
        },
        interactionPatterns: {
          avgDwellTime: 5000,
          avgResponseTime: 2000,
          pauseFrequency: 0,
          switchFrequency: 0,
        },
      };

      mockDetectLearningStyle.mockResolvedValue(mockProfile);

      const result = await getLearningStyleProfile('test-user');

      expect(result).toEqual(mockProfile);
      expect(mockDetectLearningStyle).toHaveBeenCalledWith('test-user');
    });

    it('should cache learning style profile', async () => {
      const mockProfile = {
        style: 'kinesthetic' as const,
        confidence: 0.65,
        sampleCount: 80,
        scores: {
          visual: 0.2,
          auditory: 0.3,
          kinesthetic: 0.5,
        },
        interactionPatterns: {
          avgDwellTime: 3000,
          avgResponseTime: 1500,
          pauseFrequency: 0,
          switchFrequency: 0,
        },
      };

      mockDetectLearningStyle.mockResolvedValue(mockProfile);

      // First call
      await getLearningStyleProfile('test-user');
      expect(mockDetectLearningStyle).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      await getLearningStyleProfile('test-user');
      expect(mockDetectLearningStyle).toHaveBeenCalledTimes(1);
    });

    it('should throw AnalysisError when learning style detection fails', async () => {
      mockDetectLearningStyle.mockRejectedValue(new Error('Detection failed'));

      await expect(getLearningStyleProfile('test-user')).rejects.toThrow(AnalysisError);
    });
  });

  describe('invalidateCognitiveCacheForUser', () => {
    it('should clear cache for specific user', async () => {
      const mockProfile = {
        category: 'morning' as const,
        peakHours: [7, 8],
        confidence: 0.8,
        sampleCount: 50,
        learningHistory: [],
      };

      mockAnalyzeChronotype.mockResolvedValue(mockProfile);

      // First call
      await getChronotypeProfile('test-user');
      expect(mockAnalyzeChronotype).toHaveBeenCalledTimes(1);

      // Invalidate cache
      invalidateCognitiveCacheForUser('test-user');

      // Next call should hit the analyzer again
      await getChronotypeProfile('test-user');
      expect(mockAnalyzeChronotype).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Types', () => {
    it('should create InsufficientDataError with correct properties', () => {
      const error = new InsufficientDataError(20, 10);

      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe('INSUFFICIENT_DATA');
      expect(error.required).toBe(20);
      expect(error.actual).toBe(10);
      expect(error.message).toContain('need 20');
      expect(error.message).toContain('have 10');
    });

    it('should create AnalysisError with correct code', () => {
      const error = new AnalysisError('Test analysis error');

      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe('ANALYSIS_FAILED');
      expect(error.message).toBe('Test analysis error');
    });
  });
});
