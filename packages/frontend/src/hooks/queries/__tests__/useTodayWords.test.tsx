/**
 * useTodayWords React Query Hook Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTodayWords, useTodayWordsCompat } from '../useTodayWords';
import { apiClient, type TodayWordsResponse, type StudyProgress } from '../../../services/client';
import type { Word } from '../../../types/models';
import React from 'react';

// Mock services/client
vi.mock('../../../services/client', () => {
  const client = {
    getTodayWords: vi.fn(),
  };
  return {
    apiClient: client,
    default: client,
  };
});

const mockApiClient = apiClient as unknown as {
  getTodayWords: ReturnType<typeof vi.fn>;
};

const mockWords: Word[] = [
  {
    id: '1',
    spelling: 'hello',
    phonetic: '/həˈloʊ/',
    meanings: ['你好'],
    examples: ['Hello, world!'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: '2',
    spelling: 'world',
    phonetic: '/wɜːrld/',
    meanings: ['世界'],
    examples: ['Hello, world!'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const mockProgress: StudyProgress = {
  todayStudied: 10,
  todayTarget: 50,
  totalStudied: 200,
  correctRate: 85,
  weeklyTrend: [10, 15, 20, 25, 30, 35, 25],
};

const mockTodayWordsData: TodayWordsResponse = {
  words: mockWords,
  progress: mockProgress,
};

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

const createWrapper = (queryClient: QueryClient) => {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
};

describe('useTodayWords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('data fetching', () => {
    it('should fetch today words successfully', async () => {
      mockApiClient.getTodayWords.mockResolvedValueOnce(mockTodayWordsData);
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useTodayWords(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockApiClient.getTodayWords).toHaveBeenCalledTimes(1);
      expect(result.current.data).toEqual(mockTodayWordsData);
    });

    it('should handle loading state', () => {
      mockApiClient.getTodayWords.mockImplementation(() => new Promise(() => {}));
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useTodayWords(), {
        wrapper: createWrapper(queryClient),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('should handle API errors', async () => {
      const mockError = new Error('Failed to fetch');
      mockApiClient.getTodayWords.mockRejectedValueOnce(mockError);
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useTodayWords(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(mockError);
    });
  });

  describe('data structure', () => {
    it('should return words array', async () => {
      mockApiClient.getTodayWords.mockResolvedValueOnce(mockTodayWordsData);
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useTodayWords(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.words).toHaveLength(2);
      expect(result.current.data?.words[0].spelling).toBe('hello');
    });

    it('should return progress data', async () => {
      mockApiClient.getTodayWords.mockResolvedValueOnce(mockTodayWordsData);
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useTodayWords(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.progress.todayStudied).toBe(10);
      expect(result.current.data?.progress.todayTarget).toBe(50);
    });
  });
});

describe('useTodayWordsCompat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('compatibility layer', () => {
    it('should return data in plan format', async () => {
      mockApiClient.getTodayWords.mockResolvedValueOnce(mockTodayWordsData);
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useTodayWordsCompat(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.plan).toEqual({
        words: mockWords,
        todayStudied: 10,
        todayTarget: 50,
        totalStudied: 200,
        correctRate: 85,
      });
    });

    it('should return null when no data', () => {
      mockApiClient.getTodayWords.mockImplementation(() => new Promise(() => {}));
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useTodayWordsCompat(), {
        wrapper: createWrapper(queryClient),
      });

      expect(result.current.plan).toBeNull();
      expect(result.current.loading).toBe(true);
    });

    it('should expose refresh function', async () => {
      mockApiClient.getTodayWords.mockResolvedValueOnce(mockTodayWordsData);
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useTodayWordsCompat(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.refresh).toBeDefined();
      expect(typeof result.current.refresh).toBe('function');
    });

    it('should handle empty words array', async () => {
      const emptyData: TodayWordsResponse = {
        words: [],
        progress: mockProgress,
      };
      mockApiClient.getTodayWords.mockResolvedValueOnce(emptyData);
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useTodayWordsCompat(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.plan?.words).toEqual([]);
      expect(result.current.plan?.todayStudied).toBe(10);
    });

    it('should return error message', async () => {
      const mockError = new Error('API Error');
      mockApiClient.getTodayWords.mockRejectedValueOnce(mockError);
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useTodayWordsCompat(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.error).toBe('API Error');
      });
    });
  });
});
