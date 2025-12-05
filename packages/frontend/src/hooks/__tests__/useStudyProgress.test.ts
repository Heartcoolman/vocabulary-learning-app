/**
 * useStudyProgress Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useStudyProgress, StudyProgressData } from '../useStudyProgress';
import apiClient from '@/services/ApiClient';

vi.mock('@/services/ApiClient', () => ({
  default: {
    getStudyProgress: vi.fn(),
  },
}));

vi.mock('@/utils/logger', () => ({
  learningLogger: {
    error: vi.fn(),
  },
}));

const mockApiClient = apiClient as {
  getStudyProgress: ReturnType<typeof vi.fn>;
};

const mockProgressData: StudyProgressData = {
  todayStudied: 25,
  todayTarget: 50,
  totalStudied: 500,
  correctRate: 0.85,
  weeklyTrend: [10, 15, 20, 25, 30, 35, 25],
};

describe('useStudyProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('progress fetching', () => {
    it('should fetch progress data on mount', async () => {
      mockApiClient.getStudyProgress.mockResolvedValueOnce(mockProgressData);

      const { result } = renderHook(() => useStudyProgress());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockApiClient.getStudyProgress).toHaveBeenCalledTimes(1);
      expect(result.current.progress).toEqual(mockProgressData);
      expect(result.current.error).toBeNull();
    });

    it('should handle loading state correctly', async () => {
      let resolvePromise: (value: StudyProgressData) => void;
      const promise = new Promise<StudyProgressData>((resolve) => {
        resolvePromise = resolve;
      });
      mockApiClient.getStudyProgress.mockReturnValueOnce(promise);

      const { result } = renderHook(() => useStudyProgress());

      // 初始状态应该是 loading
      expect(result.current.loading).toBe(true);
      expect(result.current.progress).toBeNull();
      expect(result.current.error).toBeNull();

      // 解析 promise
      await act(async () => {
        resolvePromise!(mockProgressData);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.progress).toEqual(mockProgressData);
    });
  });

  describe('progress data', () => {
    it('should return todayStudied from progress data', async () => {
      mockApiClient.getStudyProgress.mockResolvedValueOnce(mockProgressData);

      const { result } = renderHook(() => useStudyProgress());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.progress?.todayStudied).toBe(25);
    });

    it('should return todayTarget from progress data', async () => {
      mockApiClient.getStudyProgress.mockResolvedValueOnce(mockProgressData);

      const { result } = renderHook(() => useStudyProgress());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.progress?.todayTarget).toBe(50);
    });

    it('should return totalStudied from progress data', async () => {
      mockApiClient.getStudyProgress.mockResolvedValueOnce(mockProgressData);

      const { result } = renderHook(() => useStudyProgress());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.progress?.totalStudied).toBe(500);
    });

    it('should return correctRate from progress data', async () => {
      mockApiClient.getStudyProgress.mockResolvedValueOnce(mockProgressData);

      const { result } = renderHook(() => useStudyProgress());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.progress?.correctRate).toBe(0.85);
    });

    it('should return weeklyTrend array from progress data', async () => {
      mockApiClient.getStudyProgress.mockResolvedValueOnce(mockProgressData);

      const { result } = renderHook(() => useStudyProgress());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.progress?.weeklyTrend).toEqual([10, 15, 20, 25, 30, 35, 25]);
      expect(result.current.progress?.weeklyTrend).toHaveLength(7);
    });
  });

  describe('error handling', () => {
    it('should handle API error and set error message', async () => {
      const mockError = new Error('Network error');
      mockApiClient.getStudyProgress.mockRejectedValueOnce(mockError);

      const { result } = renderHook(() => useStudyProgress());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('无法加载学习进度，请检查网络连接。');
      expect(result.current.progress).toBeNull();
    });

    it('should clear error on successful refresh after error', async () => {
      mockApiClient.getStudyProgress.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useStudyProgress());

      await waitFor(() => {
        expect(result.current.error).toBe('无法加载学习进度，请检查网络连接。');
      });

      // 设置成功的响应
      mockApiClient.getStudyProgress.mockResolvedValueOnce(mockProgressData);

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.progress).toEqual(mockProgressData);
    });
  });

  describe('refresh functionality', () => {
    it('should refresh progress data when refresh is called', async () => {
      mockApiClient.getStudyProgress.mockResolvedValueOnce(mockProgressData);

      const { result } = renderHook(() => useStudyProgress());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const updatedProgressData: StudyProgressData = {
        ...mockProgressData,
        todayStudied: 30,
        totalStudied: 505,
      };
      mockApiClient.getStudyProgress.mockResolvedValueOnce(updatedProgressData);

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockApiClient.getStudyProgress).toHaveBeenCalledTimes(2);
      expect(result.current.progress?.todayStudied).toBe(30);
      expect(result.current.progress?.totalStudied).toBe(505);
    });

    it('should set loading to true during refresh', async () => {
      mockApiClient.getStudyProgress.mockResolvedValueOnce(mockProgressData);

      const { result } = renderHook(() => useStudyProgress());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let resolvePromise: (value: StudyProgressData) => void;
      const promise = new Promise<StudyProgressData>((resolve) => {
        resolvePromise = resolve;
      });
      mockApiClient.getStudyProgress.mockReturnValueOnce(promise);

      act(() => {
        result.current.refresh();
      });

      // 刷新期间应该是 loading 状态
      expect(result.current.loading).toBe(true);

      await act(async () => {
        resolvePromise!(mockProgressData);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('should handle refresh error gracefully', async () => {
      mockApiClient.getStudyProgress.mockResolvedValueOnce(mockProgressData);

      const { result } = renderHook(() => useStudyProgress());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockApiClient.getStudyProgress.mockRejectedValueOnce(new Error('Refresh failed'));

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.error).toBe('无法加载学习进度，请检查网络连接。');
    });
  });

  describe('edge cases', () => {
    it('should handle empty progress data', async () => {
      const emptyProgress: StudyProgressData = {
        todayStudied: 0,
        todayTarget: 0,
        totalStudied: 0,
        correctRate: 0,
        weeklyTrend: [],
      };
      mockApiClient.getStudyProgress.mockResolvedValueOnce(emptyProgress);

      const { result } = renderHook(() => useStudyProgress());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.progress).toEqual(emptyProgress);
      expect(result.current.progress?.todayStudied).toBe(0);
      expect(result.current.progress?.weeklyTrend).toEqual([]);
    });

    it('should handle 100% correct rate', async () => {
      const perfectProgress: StudyProgressData = {
        ...mockProgressData,
        correctRate: 1.0,
      };
      mockApiClient.getStudyProgress.mockResolvedValueOnce(perfectProgress);

      const { result } = renderHook(() => useStudyProgress());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.progress?.correctRate).toBe(1.0);
    });

    it('should handle progress exceeding target', async () => {
      const exceededProgress: StudyProgressData = {
        ...mockProgressData,
        todayStudied: 75,
        todayTarget: 50,
      };
      mockApiClient.getStudyProgress.mockResolvedValueOnce(exceededProgress);

      const { result } = renderHook(() => useStudyProgress());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.progress?.todayStudied).toBeGreaterThan(
        result.current.progress?.todayTarget ?? 0
      );
    });
  });
});
