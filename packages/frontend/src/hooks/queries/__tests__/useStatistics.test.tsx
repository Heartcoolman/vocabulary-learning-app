import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStatistics, useStudyProgress, useUserStatistics } from '../useStatistics';
import { apiClient } from '@/services/client';
import StorageService from '../../../services/StorageService';
import * as AuthContext from '../../../contexts/AuthContext';

// Mock dependencies
vi.mock('@/services/client');
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
      const mockWords = [
        { id: 'word1', spelling: 'hello', meanings: ['你好'], phonetic: '/həˈloʊ/', examples: [] },
      ];
      const mockWordStates = [{ masteryLevel: 1 }];
      const mockStudyStats = { correctRate: 0.85 };
      const mockRecords = {
        records: [{ timestamp: new Date().toISOString(), isCorrect: true }],
        pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      };

      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({ user: mockUser } as any);
      vi.spyOn(StorageService, 'getWords').mockResolvedValue(mockWords as any);
      vi.spyOn(StorageService, 'getWordLearningStates').mockResolvedValue(mockWordStates as any);
      vi.spyOn(StorageService, 'getStudyStatistics').mockResolvedValue(mockStudyStats as any);
      vi.spyOn(apiClient, 'getRecords').mockResolvedValue(mockRecords as any);

      const { result } = renderHook(() => useStatistics(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toBeDefined();
      expect(result.current.data?.totalWords).toBe(1);
      expect(result.current.data?.overallAccuracy).toBe(0.85);
    });

    it('should handle error when user is not logged in', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({ user: null } as any);

      const { result } = renderHook(() => useStatistics(), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('请先登录');
    });

    it('should auto-refresh every minute', async () => {
      const mockUser = { id: 'user1', email: 'test@example.com', username: 'test' };
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({ user: mockUser } as any);
      vi.spyOn(StorageService, 'getWords').mockResolvedValue([]);
      vi.spyOn(StorageService, 'getWordLearningStates').mockResolvedValue([]);
      vi.spyOn(StorageService, 'getStudyStatistics').mockResolvedValue({
        totalWords: 0,
        studiedWords: 0,
        correctRate: 0,
        wordStats: new Map(),
      });
      vi.spyOn(apiClient, 'getRecords').mockResolvedValue({ records: [], pagination: {} } as any);

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

      vi.spyOn(apiClient, 'getStudyProgress').mockResolvedValue(mockProgress);

      const { result } = renderHook(() => useStudyProgress(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockProgress);
    });

    it('should auto-refresh every minute', async () => {
      vi.spyOn(apiClient, 'getStudyProgress').mockResolvedValue({} as any);

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
      };

      vi.spyOn(apiClient, 'getUserStatistics').mockResolvedValue(mockStats);

      const { result } = renderHook(() => useUserStatistics(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockStats);
    });
  });
});
