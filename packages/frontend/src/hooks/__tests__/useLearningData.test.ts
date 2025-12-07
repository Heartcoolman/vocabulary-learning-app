/**
 * useLearningData Tests
 *
 * Tests for the useLearningData hook that fetches user learning data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useLearningData } from '../useLearningData';

// Mock API client
vi.mock('../../services/ApiClient', () => ({
  default: {
    adminGetUserLearningData: vi.fn(),
  },
}));

// Import the mocked module to get reference
import apiClient from '../../services/ApiClient';
const mockApiClient = apiClient as {
  adminGetUserLearningData: ReturnType<typeof vi.fn>;
};

// Mock logger to prevent console output during tests
vi.mock('../../utils/logger', () => ({
  adminLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('useLearningData', () => {
  const mockUserLearningData = {
    user: {
      id: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
    },
    totalRecords: 100,
    correctRecords: 75,
    averageAccuracy: 0.75,
    totalWordsLearned: 50,
    recentRecords: [
      {
        id: 'record-1',
        wordId: 'word-1',
        selectedAnswer: '你好',
        correctAnswer: '你好',
        isCorrect: true,
        timestamp: Date.now() - 1000,
        responseTime: 2500,
        word: {
          spelling: 'hello',
          phonetic: '/həˈloʊ/',
          meanings: ['你好', '喂'],
        },
      },
      {
        id: 'record-2',
        wordId: 'word-2',
        selectedAnswer: '世界',
        correctAnswer: '世界',
        isCorrect: true,
        timestamp: Date.now() - 2000,
        responseTime: 3000,
        word: {
          spelling: 'world',
          phonetic: '/wɜːrld/',
          meanings: ['世界', '地球'],
        },
      },
      {
        id: 'record-3',
        wordId: 'word-3',
        selectedAnswer: '错误答案',
        correctAnswer: '测试',
        isCorrect: false,
        timestamp: Date.now() - 3000,
        responseTime: 5000,
        word: {
          spelling: 'test',
          phonetic: '/test/',
          meanings: ['测试', '考试'],
        },
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.adminGetUserLearningData.mockResolvedValue(mockUserLearningData);
  });

  // ==================== Data Fetching Tests ====================

  describe('data fetching', () => {
    it('should fetch learning data on mount', async () => {
      const userId = 'user-123';
      const { result } = renderHook(() => useLearningData(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockApiClient.adminGetUserLearningData).toHaveBeenCalledWith(userId, 50);
      expect(result.current.data).toEqual(mockUserLearningData);
    });

    it('should use custom limit when provided', async () => {
      const userId = 'user-123';
      const customLimit = 100;
      const { result } = renderHook(() => useLearningData(userId, customLimit));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockApiClient.adminGetUserLearningData).toHaveBeenCalledWith(userId, customLimit);
    });

    it('should fetch data with correct user and limit parameters', async () => {
      const userId = 'user-456';
      const limit = 25;
      const { result } = renderHook(() => useLearningData(userId, limit));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockApiClient.adminGetUserLearningData).toHaveBeenCalledWith(userId, limit);
    });

    it('should handle loading state', async () => {
      const userId = 'user-123';
      // Make API slow to test loading state
      mockApiClient.adminGetUserLearningData.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockUserLearningData), 100)),
      );

      const { result } = renderHook(() => useLearningData(userId));

      // Initially loading should be true
      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockUserLearningData);
    });

    it('should handle error state on API failure', async () => {
      const userId = 'user-123';
      const errorMessage = '获取学习数据失败';
      mockApiClient.adminGetUserLearningData.mockRejectedValueOnce(new Error(errorMessage));

      const { result } = renderHook(() => useLearningData(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe(errorMessage);
      expect(result.current.data).toBeNull();
    });

    it('should handle error state with non-Error objects', async () => {
      const userId = 'user-123';
      mockApiClient.adminGetUserLearningData.mockRejectedValueOnce('Unknown error');

      const { result } = renderHook(() => useLearningData(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('获取学习记录失败');
    });

    it('should set error when userId is empty', async () => {
      const { result } = renderHook(() => useLearningData(''));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('用户ID为空');
      expect(result.current.data).toBeNull();
      expect(mockApiClient.adminGetUserLearningData).not.toHaveBeenCalled();
    });
  });

  // ==================== Answer Record Data Tests ====================

  describe('answer record data', () => {
    it('should return recent records with word information', async () => {
      const userId = 'user-123';
      const { result } = renderHook(() => useLearningData(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data?.recentRecords).toHaveLength(3);
      expect(result.current.data?.recentRecords[0].word).toEqual({
        spelling: 'hello',
        phonetic: '/həˈloʊ/',
        meanings: ['你好', '喂'],
      });
    });

    it('should include correct/incorrect answers in records', async () => {
      const userId = 'user-123';
      const { result } = renderHook(() => useLearningData(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const records = result.current.data?.recentRecords;
      expect(records?.[0].isCorrect).toBe(true);
      expect(records?.[2].isCorrect).toBe(false);
    });

    it('should include response time in records', async () => {
      const userId = 'user-123';
      const { result } = renderHook(() => useLearningData(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const records = result.current.data?.recentRecords;
      expect(records?.[0].responseTime).toBe(2500);
      expect(records?.[1].responseTime).toBe(3000);
    });
  });

  // ==================== Data Transformation Tests ====================

  describe('data transformation', () => {
    it('should return user information correctly', async () => {
      const userId = 'user-123';
      const { result } = renderHook(() => useLearningData(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data?.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
      });
    });

    it('should return statistics correctly', async () => {
      const userId = 'user-123';
      const { result } = renderHook(() => useLearningData(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data?.totalRecords).toBe(100);
      expect(result.current.data?.correctRecords).toBe(75);
      expect(result.current.data?.averageAccuracy).toBe(0.75);
      expect(result.current.data?.totalWordsLearned).toBe(50);
    });

    it('should handle empty records data', async () => {
      const emptyData = {
        ...mockUserLearningData,
        recentRecords: [],
        totalRecords: 0,
        correctRecords: 0,
        averageAccuracy: 0,
      };
      mockApiClient.adminGetUserLearningData.mockResolvedValueOnce(emptyData);

      const userId = 'user-123';
      const { result } = renderHook(() => useLearningData(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data?.recentRecords).toEqual([]);
      expect(result.current.data?.totalRecords).toBe(0);
    });
  });

  // ==================== Loading and Error State Tests ====================

  describe('loading and error state', () => {
    it('should clear error on successful refetch', async () => {
      const userId = 'user-123';
      mockApiClient.adminGetUserLearningData.mockRejectedValueOnce(new Error('First call failed'));

      const { result } = renderHook(() => useLearningData(userId));

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      // Reset mock to succeed
      mockApiClient.adminGetUserLearningData.mockResolvedValueOnce(mockUserLearningData);

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.data).toEqual(mockUserLearningData);
    });

    it('should set loading true during fetch', async () => {
      const userId = 'user-123';
      let resolvePromise: (value: unknown) => void;
      mockApiClient.adminGetUserLearningData.mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
      );

      const { result } = renderHook(() => useLearningData(userId));

      // Loading should be true while waiting
      expect(result.current.loading).toBe(true);

      // Resolve the promise
      await act(async () => {
        resolvePromise!(mockUserLearningData);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('should set loading false after error', async () => {
      const userId = 'user-123';
      mockApiClient.adminGetUserLearningData.mockRejectedValueOnce(new Error('API Error'));

      const { result } = renderHook(() => useLearningData(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('API Error');
    });
  });

  // ==================== Data Refresh Tests ====================

  describe('data refresh', () => {
    it('should provide refresh function', async () => {
      const userId = 'user-123';
      const { result } = renderHook(() => useLearningData(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(typeof result.current.refresh).toBe('function');
    });

    it('should refresh data when refresh is called', async () => {
      const userId = 'user-123';
      const { result } = renderHook(() => useLearningData(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // First call on mount
      expect(mockApiClient.adminGetUserLearningData).toHaveBeenCalledTimes(1);

      // Update mock data for refresh
      const updatedData = {
        ...mockUserLearningData,
        totalRecords: 150,
        correctRecords: 120,
      };
      mockApiClient.adminGetUserLearningData.mockResolvedValueOnce(updatedData);

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockApiClient.adminGetUserLearningData).toHaveBeenCalledTimes(2);
      expect(result.current.data?.totalRecords).toBe(150);
    });

    it('should handle refresh error', async () => {
      const userId = 'user-123';
      const { result } = renderHook(() => useLearningData(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Make refresh fail
      mockApiClient.adminGetUserLearningData.mockRejectedValueOnce(new Error('Refresh failed'));

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.error).toBe('Refresh failed');
    });

    it('should refetch when userId changes', async () => {
      const { result, rerender } = renderHook(({ userId }) => useLearningData(userId), {
        initialProps: { userId: 'user-123' },
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockApiClient.adminGetUserLearningData).toHaveBeenCalledWith('user-123', 50);

      // Change userId
      const newUserData = {
        ...mockUserLearningData,
        user: { id: 'user-456', email: 'new@example.com', username: 'newuser' },
      };
      mockApiClient.adminGetUserLearningData.mockResolvedValueOnce(newUserData);

      rerender({ userId: 'user-456' });

      await waitFor(() => {
        expect(mockApiClient.adminGetUserLearningData).toHaveBeenCalledWith('user-456', 50);
      });
    });

    it('should refetch when limit changes', async () => {
      const { result, rerender } = renderHook(
        ({ userId, limit }) => useLearningData(userId, limit),
        { initialProps: { userId: 'user-123', limit: 50 } },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockApiClient.adminGetUserLearningData).toHaveBeenCalledWith('user-123', 50);

      // Change limit
      mockApiClient.adminGetUserLearningData.mockResolvedValueOnce(mockUserLearningData);

      rerender({ userId: 'user-123', limit: 100 });

      await waitFor(() => {
        expect(mockApiClient.adminGetUserLearningData).toHaveBeenCalledWith('user-123', 100);
      });
    });
  });

  // ==================== Session Management Tests ====================

  describe('session management', () => {
    it('should start with null data', () => {
      // Use a resolved mock but don't wait
      const userId = 'user-123';
      const { result } = renderHook(() => useLearningData(userId));

      // Immediately after render, data should be null
      expect(result.current.data).toBeNull();
    });

    it('should maintain data between renders', async () => {
      const userId = 'user-123';
      const { result, rerender } = renderHook(() => useLearningData(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const firstData = result.current.data;

      // Rerender without changing props
      rerender();

      expect(result.current.data).toBe(firstData);
    });

    it('should track session progress through records', async () => {
      const userId = 'user-123';
      const { result } = renderHook(() => useLearningData(userId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Records should show session progress
      const records = result.current.data?.recentRecords;
      expect(records).toBeDefined();
      expect(records?.length).toBeGreaterThan(0);

      // Verify timestamps are in descending order (most recent first)
      if (records && records.length > 1) {
        expect(records[0].timestamp).toBeGreaterThan(records[1].timestamp);
      }
    });
  });
});
