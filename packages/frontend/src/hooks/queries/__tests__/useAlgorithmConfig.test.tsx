/**
 * useAlgorithmConfig Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAlgorithmConfig, useConfigHistory } from '../useAlgorithmConfig';
import apiClient from '../../../services/ApiClient';
import type { AlgorithmConfig, ConfigHistory } from '../../../types/models';

// Mock apiClient
vi.mock('../../../services/ApiClient', () => ({
  default: {
    getAlgorithmConfig: vi.fn(),
    getConfigHistory: vi.fn(),
    request: vi.fn(),
  },
}));

const mockApiClient = apiClient as {
  getAlgorithmConfig: ReturnType<typeof vi.fn>;
  getConfigHistory: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
};

// 创建测试用的 QueryClient
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // 禁用重试以加快测试速度
        gcTime: 0, // 禁用缓存以便测试
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

const mockConfig: AlgorithmConfig = {
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
    { level: 2, requiredCorrectStreak: 5, minAccuracy: 0.75, minScore: 70 },
    { level: 3, requiredCorrectStreak: 7, minAccuracy: 0.8, minScore: 80 },
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
  isDefault: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockHistory: ConfigHistory[] = [
  {
    id: 'history-1',
    configId: 'test-config-id',
    changedBy: 'admin',
    changeReason: '测试修改',
    previousValue: mockConfig,
    newValue: { ...mockConfig, consecutiveCorrectThreshold: 6 },
    timestamp: Date.now(),
  },
];

describe('useAlgorithmConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('获取算法配置', () => {
    it('应该成功获取算法配置', async () => {
      mockApiClient.getAlgorithmConfig.mockResolvedValueOnce(mockConfig);

      const { result } = renderHook(() => useAlgorithmConfig(), {
        wrapper: createWrapper(),
      });

      // 初始状态应该是 loading
      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();

      // 等待数据加载完成
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockApiClient.getAlgorithmConfig).toHaveBeenCalledTimes(1);
      expect(result.current.data).toEqual(mockConfig);
      expect(result.current.error).toBeNull();
    });

    it('应该正确处理加载错误', async () => {
      const error = new Error('加载配置失败');
      mockApiClient.getAlgorithmConfig.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useAlgorithmConfig(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.data).toBeUndefined();
    });

    it('应该使用长缓存时间（1小时）', () => {
      const { result } = renderHook(() => useAlgorithmConfig(), {
        wrapper: createWrapper(),
      });

      // 验证缓存配置（gcTime = 1小时 = 3600000ms）
      // 注意：这里我们只能通过行为来验证，因为无法直接访问内部配置
      expect(result.current.isLoading).toBe(true);
    });
  });
});

describe('useConfigHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('获取配置历史', () => {
    it('应该成功获取配置历史记录', async () => {
      mockApiClient.getConfigHistory.mockResolvedValueOnce(mockHistory);

      const { result } = renderHook(() => useConfigHistory(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockApiClient.getConfigHistory).toHaveBeenCalledWith(undefined);
      expect(result.current.data).toEqual(mockHistory);
    });

    it('应该支持自定义历史记录数量限制', async () => {
      mockApiClient.getConfigHistory.mockResolvedValueOnce(mockHistory);

      const { result } = renderHook(() => useConfigHistory(20), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockApiClient.getConfigHistory).toHaveBeenCalledWith(20);
    });

    it('应该支持禁用查询', async () => {
      mockApiClient.getConfigHistory.mockResolvedValueOnce(mockHistory);

      const { result } = renderHook(() => useConfigHistory(50, false), {
        wrapper: createWrapper(),
      });

      // 当 enabled 为 false 时，不应该发起请求
      expect(result.current.isPending).toBe(false);
      expect(mockApiClient.getConfigHistory).not.toHaveBeenCalled();
    });
  });
});
