/**
 * useStudyProgress React Query Hook Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useStudyProgress, useStudyProgressWithRefresh } from '../useStudyProgress';
import apiClient, { StudyProgress } from '../../../services/ApiClient';
import React from 'react';

// Mock ApiClient
vi.mock('../../../services/ApiClient', () => ({
  default: {
    getStudyProgress: vi.fn(),
  },
}));

const mockApiClient = apiClient as {
  getStudyProgress: ReturnType<typeof vi.fn>;
};

const mockProgressData: StudyProgress = {
  todayStudied: 25,
  todayTarget: 50,
  totalStudied: 500,
  correctRate: 85,
  weeklyTrend: [10, 15, 20, 25, 30, 35, 25],
};

// Helper to create a new QueryClient for each test
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

// Helper to wrap components with QueryClientProvider
const createWrapper = (queryClient: QueryClient) => {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
};

describe('useStudyProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('data fetching', () => {
    it('should fetch progress data successfully', async () => {
      mockApiClient.getStudyProgress.mockResolvedValueOnce(mockProgressData);
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useStudyProgress(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockApiClient.getStudyProgress).toHaveBeenCalledTimes(1);
      expect(result.current.data).toEqual(mockProgressData);
      expect(result.current.error).toBeNull();
    });

    it('should handle loading state', () => {
      mockApiClient.getStudyProgress.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useStudyProgress(), {
        wrapper: createWrapper(queryClient),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
      expect(result.current.error).toBeNull();
    });

    it('should handle API errors', async () => {
      const mockError = new Error('Network error');
      mockApiClient.getStudyProgress.mockRejectedValueOnce(mockError);
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useStudyProgress(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.data).toBeUndefined();
    });
  });

  describe('data correctness', () => {
    it('should return todayStudied correctly', async () => {
      mockApiClient.getStudyProgress.mockResolvedValueOnce(mockProgressData);
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useStudyProgress(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.todayStudied).toBe(25);
    });

    it('should return weeklyTrend array correctly', async () => {
      mockApiClient.getStudyProgress.mockResolvedValueOnce(mockProgressData);
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useStudyProgress(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.weeklyTrend).toEqual([10, 15, 20, 25, 30, 35, 25]);
      expect(result.current.data?.weeklyTrend).toHaveLength(7);
    });

    it('should return correctRate correctly', async () => {
      mockApiClient.getStudyProgress.mockResolvedValueOnce(mockProgressData);
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useStudyProgress(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.correctRate).toBe(85);
    });
  });
});

describe('useStudyProgressWithRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('compatibility layer', () => {
    it('should return data in old format', async () => {
      mockApiClient.getStudyProgress.mockResolvedValueOnce(mockProgressData);
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useStudyProgressWithRefresh(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.progress).toEqual(mockProgressData);
      expect(result.current.error).toBeNull();
    });

    it('should return null when no data', () => {
      mockApiClient.getStudyProgress.mockImplementation(
        () => new Promise(() => {}),
      );
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useStudyProgressWithRefresh(), {
        wrapper: createWrapper(queryClient),
      });

      expect(result.current.progress).toBeNull();
      expect(result.current.loading).toBe(true);
    });

    it('should expose refresh function', async () => {
      mockApiClient.getStudyProgress.mockResolvedValueOnce(mockProgressData);
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useStudyProgressWithRefresh(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.refresh).toBeDefined();
      expect(typeof result.current.refresh).toBe('function');

      // Test refresh
      const updatedData = { ...mockProgressData, todayStudied: 30 };
      mockApiClient.getStudyProgress.mockResolvedValueOnce(updatedData);

      await result.current.refresh();

      await waitFor(() => {
        expect(result.current.progress?.todayStudied).toBe(30);
      });

      expect(mockApiClient.getStudyProgress).toHaveBeenCalledTimes(2);
    });

    it('should return error message string', async () => {
      const mockError = new Error('Network error');
      mockApiClient.getStudyProgress.mockRejectedValueOnce(mockError);
      const queryClient = createTestQueryClient();

      const { result } = renderHook(() => useStudyProgressWithRefresh(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
      });

      expect(result.current.progress).toBeNull();
    });
  });
});
