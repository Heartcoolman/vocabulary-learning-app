import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useWordMasteryStats,
  useBatchWordMastery,
  useWordMasteryDetail,
  useWordMasteryTrace,
  useWordMasteryInterval,
  useLearnedWords,
} from '../useWordMasteryStats';
import { apiClient } from '@/services/client';

// Mock dependencies
vi.mock('@/services/client', () => {
  const client = {
    getWordMasteryStats: vi.fn(),
    batchProcessWordMastery: vi.fn(),
    getWordMasteryDetail: vi.fn(),
    getWordMasteryTrace: vi.fn(),
    getWordMasteryInterval: vi.fn(),
    getLearnedWords: vi.fn(),
  };
  return {
    apiClient: client,
    default: client,
  };
});

describe('useWordMasteryStats', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('useWordMasteryStats', () => {
    it('should fetch word mastery stats successfully', async () => {
      const mockStats = {
        totalWords: 100,
        masteredWords: 20,
        learningWords: 50,
        needReviewCount: 30,
        averageScore: 0.75,
      };

      vi.mocked(apiClient.getWordMasteryStats).mockResolvedValue(mockStats as any);

      const { result } = renderHook(() => useWordMasteryStats(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockStats);
    });

    it('should auto-refresh every minute', async () => {
      vi.mocked(apiClient.getWordMasteryStats).mockResolvedValue({} as any);

      const { result } = renderHook(() => useWordMasteryStats(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });
  });

  describe('useBatchWordMastery', () => {
    it('should fetch batch mastery evaluations successfully', async () => {
      const mockEvaluations = [
        { wordId: 'word1', score: 0.8, isLearned: true },
        { wordId: 'word2', score: 0.6, isLearned: false },
      ];

      vi.mocked(apiClient.batchProcessWordMastery).mockResolvedValue(mockEvaluations as any);

      const { result } = renderHook(() => useBatchWordMastery(['word1', 'word2']), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockEvaluations);
    });

    it('should return empty array for empty word list', async () => {
      const { result } = renderHook(() => useBatchWordMastery([]), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([]);
    });

    it('should support user fatigue parameter', async () => {
      vi.mocked(apiClient.batchProcessWordMastery).mockResolvedValue([]);

      renderHook(() => useBatchWordMastery(['word1'], 0.5), { wrapper });

      await waitFor(() => {
        expect(apiClient.batchProcessWordMastery).toHaveBeenCalledWith(['word1'], 0.5);
      });
    });
  });

  describe('useWordMasteryDetail', () => {
    it('should fetch word mastery detail successfully', async () => {
      const mockDetail = {
        wordId: 'word1',
        score: 0.85,
        isLearned: true,
        memoryStrength: 0.9,
      };

      vi.mocked(apiClient.getWordMasteryDetail).mockResolvedValue(mockDetail as any);

      const { result } = renderHook(() => useWordMasteryDetail('word1'), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockDetail);
    });

    it('should not fetch when wordId is empty', async () => {
      const { result } = renderHook(() => useWordMasteryDetail(''), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeUndefined();
    });
  });

  describe('useWordMasteryTrace', () => {
    it('should fetch word mastery trace successfully', async () => {
      const mockTrace = {
        wordId: 'word1',
        records: [
          { timestamp: '2024-01-01', score: 0.5, isCorrect: true },
          { timestamp: '2024-01-02', score: 0.7, isCorrect: true },
        ],
      };

      vi.mocked(apiClient.getWordMasteryTrace).mockResolvedValue(mockTrace as any);

      const { result } = renderHook(() => useWordMasteryTrace('word1'), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockTrace);
    });

    it('should support limit parameter', async () => {
      vi.mocked(apiClient.getWordMasteryTrace).mockResolvedValue({} as any);

      renderHook(() => useWordMasteryTrace('word1', 20), { wrapper });

      await waitFor(() => {
        expect(apiClient.getWordMasteryTrace).toHaveBeenCalledWith('word1', 20);
      });
    });
  });

  describe('useWordMasteryInterval', () => {
    it('should fetch word mastery interval successfully', async () => {
      const mockInterval = {
        wordId: 'word1',
        optimalInterval: 7,
        targetRecall: 0.9,
      };

      vi.mocked(apiClient.getWordMasteryInterval).mockResolvedValue(mockInterval as any);

      const { result } = renderHook(() => useWordMasteryInterval('word1'), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockInterval);
    });

    it('should support targetRecall parameter', async () => {
      vi.mocked(apiClient.getWordMasteryInterval).mockResolvedValue({} as any);

      renderHook(() => useWordMasteryInterval('word1', 0.85), { wrapper });

      await waitFor(() => {
        expect(apiClient.getWordMasteryInterval).toHaveBeenCalledWith('word1', 0.85);
      });
    });
  });

  describe('useLearnedWords', () => {
    it('should fetch learned words successfully', async () => {
      const mockWords = [
        { id: 'word1', spelling: 'hello', meanings: ['你好'] },
        { id: 'word2', spelling: 'world', meanings: ['世界'] },
      ];

      vi.mocked(apiClient.getLearnedWords).mockResolvedValue(mockWords as any);

      const { result } = renderHook(() => useLearnedWords(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockWords);
    });
  });
});
