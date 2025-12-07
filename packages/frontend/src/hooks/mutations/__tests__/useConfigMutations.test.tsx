/**
 * useConfigMutations Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useUpdateAlgorithmConfig,
  useResetAlgorithmConfig,
  useUpdateStudyConfig,
} from '../useConfigMutations';
import apiClient from '../../../services/ApiClient';
import type { AlgorithmConfig, StudyConfig } from '../../../types/models';

// Mock apiClient
vi.mock('../../../services/ApiClient', () => ({
  default: {
    updateAlgorithmConfig: vi.fn(),
    resetAlgorithmConfig: vi.fn(),
    updateStudyConfig: vi.fn(),
  },
}));

const mockApiClient = apiClient as {
  updateAlgorithmConfig: ReturnType<typeof vi.fn>;
  resetAlgorithmConfig: ReturnType<typeof vi.fn>;
  updateStudyConfig: ReturnType<typeof vi.fn>;
};

// 创建测试用的 QueryClient
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// 创建 wrapper 组件
function createWrapper() {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockAlgorithmConfig: AlgorithmConfig = {
  id: 'test-config-id',
  name: '测试配置',
  reviewIntervals: [1, 3, 7, 15, 30],
  consecutiveCorrectThreshold: 5,
  consecutiveWrongThreshold: 3,
  difficultyAdjustmentInterval: 5,
  priorityWeights: {
    newWord: 30,
    errorRate: 30,
    overdueTime: 25,
    wordScore: 15,
  },
  masteryThresholds: [
    { level: 1, requiredCorrectStreak: 3, minAccuracy: 0.7, minScore: 60 },
  ],
  scoreWeights: {
    accuracy: 40,
    speed: 30,
    stability: 20,
    proficiency: 10,
  },
  speedThresholds: {
    excellent: 2000,
    good: 3000,
    average: 5000,
    slow: 8000,
  },
  newWordRatio: {
    default: 0.3,
    highAccuracy: 0.5,
    lowAccuracy: 0.1,
    highAccuracyThreshold: 0.85,
    lowAccuracyThreshold: 0.6,
  },
  isDefault: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockStudyConfig: StudyConfig = {
  id: 'test-config-id',
  userId: 'test-user-id',
  selectedWordBookIds: ['book-1', 'book-2'],
  dailyWordCount: 30,
  studyMode: 'sequential',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

describe('useUpdateAlgorithmConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('更新算法配置', () => {
    it('应该成功更新算法配置', async () => {
      const updatedConfig = {
        ...mockAlgorithmConfig,
        consecutiveCorrectThreshold: 6,
      };
      mockApiClient.updateAlgorithmConfig.mockResolvedValueOnce(updatedConfig);

      const { result } = renderHook(() => useUpdateAlgorithmConfig(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isPending).toBe(false);

      act(() => {
        result.current.mutate({
          configId: 'test-config-id',
          config: { consecutiveCorrectThreshold: 6 },
          changeReason: '测试更新',
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockApiClient.updateAlgorithmConfig).toHaveBeenCalledWith(
        'test-config-id',
        { consecutiveCorrectThreshold: 6 },
        '测试更新'
      );
      expect(result.current.data).toEqual(updatedConfig);
    });

    it('应该正确处理更新错误', async () => {
      const error = new Error('更新失败');
      mockApiClient.updateAlgorithmConfig.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useUpdateAlgorithmConfig(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.mutate({
          configId: 'test-config-id',
          config: { consecutiveCorrectThreshold: 6 },
        });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.data).toBeUndefined();
    });

    it('更新成功后应该触发查询失效', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      mockApiClient.updateAlgorithmConfig.mockResolvedValueOnce(mockAlgorithmConfig);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useUpdateAlgorithmConfig(), { wrapper });

      act(() => {
        result.current.mutate({
          configId: 'test-config-id',
          config: mockAlgorithmConfig,
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // 验证 invalidateQueries 被调用
      expect(invalidateSpy).toHaveBeenCalled();
    });
  });
});

describe('useResetAlgorithmConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('重置算法配置', () => {
    it('应该成功重置算法配置', async () => {
      const resetConfig = { ...mockAlgorithmConfig, isDefault: true };
      mockApiClient.resetAlgorithmConfig.mockResolvedValueOnce(resetConfig);

      const { result } = renderHook(() => useResetAlgorithmConfig(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.mutate('test-config-id');
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockApiClient.resetAlgorithmConfig).toHaveBeenCalledWith('test-config-id');
      expect(result.current.data).toEqual(resetConfig);
    });

    it('应该正确处理重置错误', async () => {
      const error = new Error('重置失败');
      mockApiClient.resetAlgorithmConfig.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useResetAlgorithmConfig(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.mutate('test-config-id');
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeTruthy();
    });
  });
});

describe('useUpdateStudyConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('更新学习配置', () => {
    it('应该成功更新学习配置', async () => {
      const updatedConfig = {
        ...mockStudyConfig,
        dailyWordCount: 50,
      };
      mockApiClient.updateStudyConfig.mockResolvedValueOnce(updatedConfig);

      const { result } = renderHook(() => useUpdateStudyConfig(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.mutate({
          selectedWordBookIds: ['book-1', 'book-2'],
          dailyWordCount: 50,
          studyMode: 'sequential',
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockApiClient.updateStudyConfig).toHaveBeenCalledWith({
        selectedWordBookIds: ['book-1', 'book-2'],
        dailyWordCount: 50,
        studyMode: 'sequential',
      });
      expect(result.current.data).toEqual(updatedConfig);
    });

    it('应该正确处理更新错误', async () => {
      const error = new Error('更新失败');
      mockApiClient.updateStudyConfig.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useUpdateStudyConfig(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.mutate({
          selectedWordBookIds: [],
          dailyWordCount: 20,
        });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeTruthy();
    });

    it('更新成功后应该触发相关查询失效', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      mockApiClient.updateStudyConfig.mockResolvedValueOnce(mockStudyConfig);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useUpdateStudyConfig(), { wrapper });

      act(() => {
        result.current.mutate({
          selectedWordBookIds: ['book-1'],
          dailyWordCount: 30,
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // 验证 invalidateQueries 被调用（应该失效学习配置、今日单词、学习进度等查询）
      expect(invalidateSpy).toHaveBeenCalled();
    });
  });
});
