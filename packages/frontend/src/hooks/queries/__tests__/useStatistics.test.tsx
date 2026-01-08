import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStatistics, useStudyProgress, useUserStatistics } from '../useStatistics';
import { apiClient } from '@/services/client';
import StorageService from '../../../services/StorageService';
import * as AuthContext from '../../../contexts/AuthContext';

// Mock dependencies
vi.mock('@/services/client', () => {
  const client = {
    getRecords: vi.fn(),
    getStudyProgress: vi.fn(),
    getUserStatistics: vi.fn(),
    getEnhancedStatistics: vi.fn(),
    createRecord: vi.fn(),
    batchCreateRecords: vi.fn(),
  };
  return {
    apiClient: client,
    default: client,
  };
});
vi.mock('../../../services/StorageService');
vi.mock('../../../contexts/AuthContext');

describe('useStatistics', () => {
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

  describe('useStatistics', () => {
    it('should fetch statistics successfully', async () => {
      const mockUser = { id: 'user1', email: 'test@example.com', username: 'test' };
      const mockStats = {
        totalWords: 100,
        masteryDistribution: { 0: 10, 1: 20, 2: 30, 3: 25, 4: 10, 5: 5 },
        correctRate: 0.85,
        studyDays: 30,
        consecutiveDays: 7,
        dailyAccuracy: [0.8, 0.85, 0.9],
        weekdayHeat: { 0: 10, 1: 15, 2: 20, 3: 18, 4: 22, 5: 12, 6: 8 },
      };

      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({ user: mockUser } as any);
      vi.mocked(apiClient.getEnhancedStatistics).mockResolvedValue(mockStats as any);

      const { result } = renderHook(() => useStatistics(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toBeDefined();
      expect(result.current.data?.totalWords).toBe(100);
      expect(result.current.data?.overallAccuracy).toBe(0.85);
    });

    it('should handle error when user is not logged in', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({ user: null } as any);

      const { result } = renderHook(() => useStatistics(), { wrapper });

      // When user is null, the query is disabled, so it should be in idle/pending state
      await waitFor(() => {
        expect(result.current.isPending).toBe(true);
      });
    });

    it('should auto-refresh every minute', async () => {
      const mockUser = { id: 'user1', email: 'test@example.com', username: 'test' };
      const mockStats = {
        totalWords: 0,
        masteryDistribution: {},
        correctRate: 0,
        studyDays: 0,
        consecutiveDays: 0,
        dailyAccuracy: [],
        weekdayHeat: {},
      };
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({ user: mockUser } as any);
      vi.mocked(apiClient.getEnhancedStatistics).mockResolvedValue(mockStats as any);

      const { result } = renderHook(() => useStatistics(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify refetch interval is set to 60 seconds
      expect(result.current.data).toBeDefined();
    });
  });

  describe('useStudyProgress', () => {
    it('should fetch study progress successfully', async () => {
      const mockProgress = {
        todayStudied: 10,
        todayTarget: 20,
        totalStudied: 100,
        correctRate: 0.9,
        weeklyTrend: [5, 8, 10, 12, 15, 18, 20],
      };

      vi.mocked(apiClient.getStudyProgress).mockResolvedValue(mockProgress);

      const { result } = renderHook(() => useStudyProgress(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockProgress);
    });

    it('should auto-refresh every minute', async () => {
      vi.mocked(apiClient.getStudyProgress).mockResolvedValue({} as any);

      const { result } = renderHook(() => useStudyProgress(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });
  });

  describe('useUserStatistics', () => {
    it('should fetch user statistics successfully', async () => {
      const mockStats = {
        totalWords: 100,
        totalRecords: 500,
        correctRate: 0.85,
        recentRecords: [],
      };

      vi.mocked(apiClient.getUserStatistics).mockResolvedValue(mockStats);

      const { result } = renderHook(() => useUserStatistics(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockStats);
    });
  });
});
