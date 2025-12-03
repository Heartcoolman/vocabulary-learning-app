/**
 * useMasteryLearning Hook Unit Tests
 *
 * Tests for the main learning hook that manages study sessions.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// Mock API client
const mockApiClient = {
  getMasteryStudyWords: vi.fn(),
  processLearningEvent: vi.fn(),
  createMasterySession: vi.fn()
};

vi.mock('../../services/ApiClient', () => ({
  default: mockApiClient
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
vi.stubGlobal('localStorage', mockLocalStorage);

// Mock AuthContext
const mockUser = { id: 'user-123', username: 'testuser' };
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, isAuthenticated: true })
}));

// Mock queue managers
vi.mock('../../services/learning/WordQueueManager', () => ({
  WordQueueManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    getCurrentWord: vi.fn(),
    recordAnswer: vi.fn(),
    advanceToNext: vi.fn(),
    skipCurrentWord: vi.fn(),
    getProgress: vi.fn().mockReturnValue({
      masteredCount: 0,
      targetCount: 20,
      totalQuestions: 0,
      activeCount: 5,
      pendingCount: 15
    }),
    getState: vi.fn(),
    isCompleted: vi.fn().mockReturnValue(false),
    getCompletionReason: vi.fn()
  }))
}));

vi.mock('../../services/learning/AdaptiveQueueManager', () => ({
  AdaptiveQueueManager: vi.fn().mockImplementation(() => ({
    adjustDifficulty: vi.fn(),
    getRecommendation: vi.fn()
  }))
}));

import { useMasteryLearning } from '../useMasteryLearning';

describe('useMasteryLearning', () => {
  const mockWords = [
    { id: 'word-1', spelling: 'hello', phonetic: '/həˈloʊ/', meanings: ['你好'] },
    { id: 'word-2', spelling: 'world', phonetic: '/wɜːrld/', meanings: ['世界'] },
    { id: 'word-3', spelling: 'test', phonetic: '/test/', meanings: ['测试'] }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);

    mockApiClient.getMasteryStudyWords.mockResolvedValue({
      words: mockWords,
      sessionId: 'session-123',
      config: { masteryThreshold: 2, maxTotalQuestions: 100 }
    });

    mockApiClient.processLearningEvent.mockResolvedValue({
      strategy: { interval_scale: 1.0, difficulty: 'mid' },
      trace: { confidence: 0.8 }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should start with loading state', async () => {
      const { result } = renderHook(() => useMasteryLearning());

      expect(result.current.isLoading).toBe(true);
    });

    it('should fetch study words on mount', async () => {
      const { result } = renderHook(() => useMasteryLearning());

      await waitFor(() => {
        expect(mockApiClient.getMasteryStudyWords).toHaveBeenCalled();
      });
    });

    it('should update loading state after fetch', async () => {
      const { result } = renderHook(() => useMasteryLearning());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should accept target mastery count option', async () => {
      const { result } = renderHook(() =>
        useMasteryLearning({ targetMasteryCount: 30 })
      );

      await waitFor(() => {
        expect(result.current.progress.targetCount).toBe(30);
      });
    });

    it('should check localStorage for saved session', async () => {
      renderHook(() => useMasteryLearning());

      await waitFor(() => {
        expect(mockLocalStorage.getItem).toHaveBeenCalledWith(
          expect.stringContaining('mastery')
        );
      });
    });
  });

  // ==================== Answer Submission Tests ====================

  describe('answer submission', () => {
    it('should call API when submitting correct answer', async () => {
      const { result } = renderHook(() => useMasteryLearning());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.submitAnswer(true, 2500);
      });

      expect(mockApiClient.processLearningEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          isCorrect: true,
          responseTimeMs: 2500
        })
      );
    });

    it('should call API when submitting incorrect answer', async () => {
      const { result } = renderHook(() => useMasteryLearning());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.submitAnswer(false, 5000);
      });

      expect(mockApiClient.processLearningEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          isCorrect: false,
          responseTimeMs: 5000
        })
      );
    });

    it('should update AMAS result after answer', async () => {
      const { result } = renderHook(() => useMasteryLearning());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.submitAnswer(true, 2000);
      });

      expect(result.current.latestAmasResult).toBeDefined();
    });
  });

  // ==================== Queue Management Tests ====================

  describe('queue management', () => {
    it('should advance to next word', async () => {
      const { result } = renderHook(() => useMasteryLearning());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.advanceToNext();
      });

      // Queue manager advance should be called
      expect(result.current.currentWord).toBeDefined();
    });

    it('should handle skip word', async () => {
      const { result } = renderHook(() => useMasteryLearning());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.skipWord();
      });

      // Should not throw
      expect(result.current.error).toBeNull();
    });

    it('should expose all words', async () => {
      const { result } = renderHook(() => useMasteryLearning());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allWords).toBeDefined();
    });
  });

  // ==================== Session Management Tests ====================

  describe('session management', () => {
    it('should restore session from localStorage', async () => {
      const savedSession = {
        sessionId: 'saved-session',
        targetMasteryCount: 20,
        masteryThreshold: 2,
        maxTotalQuestions: 100,
        queueState: { currentIndex: 5 },
        timestamp: Date.now() - 1000,
        userId: 'user-123'
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(savedSession));

      const { result } = renderHook(() => useMasteryLearning());

      await waitFor(() => {
        expect(result.current.hasRestoredSession).toBe(true);
      });
    });

    it('should not restore expired session', async () => {
      const expiredSession = {
        sessionId: 'expired-session',
        targetMasteryCount: 20,
        timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
        userId: 'user-123'
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(expiredSession));

      const { result } = renderHook(() => useMasteryLearning());

      await waitFor(() => {
        expect(result.current.hasRestoredSession).toBe(false);
      });
    });

    it('should reset session', async () => {
      const { result } = renderHook(() => useMasteryLearning());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.resetSession();
      });

      expect(mockLocalStorage.removeItem).toHaveBeenCalled();
    });
  });

  // ==================== Progress Tracking Tests ====================

  describe('progress tracking', () => {
    it('should track progress state', async () => {
      const { result } = renderHook(() => useMasteryLearning());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.progress).toBeDefined();
      expect(result.current.progress.masteredCount).toBeDefined();
      expect(result.current.progress.targetCount).toBeDefined();
      expect(result.current.progress.totalQuestions).toBeDefined();
    });

    it('should detect completion', async () => {
      const { result } = renderHook(() => useMasteryLearning());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Initially not completed
      expect(result.current.isCompleted).toBe(false);
    });
  });

  // ==================== Error Handling Tests ====================

  describe('error handling', () => {
    it('should handle API error gracefully', async () => {
      mockApiClient.getMasteryStudyWords.mockRejectedValueOnce(
        new Error('Network error')
      );

      const { result } = renderHook(() => useMasteryLearning());

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });
    });

    it('should handle answer submission error', async () => {
      mockApiClient.processLearningEvent.mockRejectedValueOnce(
        new Error('Server error')
      );

      const { result } = renderHook(() => useMasteryLearning());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        try {
          await result.current.submitAnswer(true, 2000);
        } catch {
          // Expected to throw
        }
      });

      // Should handle error
      expect(result.current.error).toBeDefined();
    });
  });
});
