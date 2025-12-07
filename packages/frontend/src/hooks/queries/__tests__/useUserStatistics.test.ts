import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUserStatistics, useUserLearningData } from '../useUserStatistics';
import apiClient from '../../../services/ApiClient';

// Mock ApiClient
vi.mock('../../../services/ApiClient', () => ({
  default: {
    adminGetUserStatistics: vi.fn(),
    adminGetUserLearningData: vi.fn(),
  },
}));

describe('useUserStatistics', () => {
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

  it('应该成功获取用户统计数据', async () => {
    const mockStatistics = {
      user: {
        id: 'user-1',
        username: 'testuser',
        email: 'test@example.com',
        role: 'USER',
        createdAt: '2024-01-01',
      },
      masteryDistribution: {
        level0: 10,
        level1: 20,
        level2: 30,
        level3: 25,
        level4: 10,
        level5: 5,
      },
      studyDays: 30,
      consecutiveDays: 5,
      totalStudyTime: 180,
      totalWordsLearned: 100,
      averageScore: 85,
      accuracy: 90,
    };

    vi.mocked(apiClient.adminGetUserStatistics).mockResolvedValue(mockStatistics);

    const { result } = renderHook(() => useUserStatistics('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockStatistics);
    expect(result.current.data?.totalWordsLearned).toBe(100);
    expect(result.current.data?.averageScore).toBe(85);
    expect(apiClient.adminGetUserStatistics).toHaveBeenCalledWith('user-1');
  });

  it('应该在 userId 为空时禁用查询', async () => {
    const { result } = renderHook(() => useUserStatistics(''), { wrapper });

    // 查询应该被禁用，不应该调用 API
    expect(result.current.fetchStatus).toBe('idle');
    expect(apiClient.adminGetUserStatistics).not.toHaveBeenCalled();
  });

  it('应该处理加载错误', async () => {
    vi.mocked(apiClient.adminGetUserStatistics).mockRejectedValue(new Error('API Error'));

    const { result } = renderHook(() => useUserStatistics('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('应该缓存统计数据', async () => {
    const mockStatistics = {
      user: {
        id: 'user-1',
        username: 'testuser',
        email: 'test@example.com',
        role: 'USER',
        createdAt: '2024-01-01',
      },
      masteryDistribution: {
        level0: 10,
        level1: 20,
        level2: 30,
        level3: 25,
        level4: 10,
        level5: 5,
      },
      studyDays: 30,
      consecutiveDays: 5,
      totalStudyTime: 180,
      totalWordsLearned: 100,
      averageScore: 85,
      accuracy: 90,
    };

    vi.mocked(apiClient.adminGetUserStatistics).mockResolvedValue(mockStatistics);

    const { result } = renderHook(() => useUserStatistics('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // 第一次调用
    expect(apiClient.adminGetUserStatistics).toHaveBeenCalledTimes(1);

    // 重新渲染应该使用缓存
    const { result: result2 } = renderHook(() => useUserStatistics('user-1'), { wrapper });

    await waitFor(() => expect(result2.current.isSuccess).toBe(true));

    // 由于有缓存，应该还是只调用一次
    expect(apiClient.adminGetUserStatistics).toHaveBeenCalledTimes(1);
  });
});

describe('useUserLearningData', () => {
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

  it('应该成功获取用户学习数据', async () => {
    const mockLearningData = {
      user: {
        id: 'user-1',
        username: 'testuser',
        email: 'test@example.com',
      },
      totalRecords: 100,
      correctRecords: 85,
      averageAccuracy: 0.85,
      totalWordsLearned: 50,
      recentRecords: [],
    };

    vi.mocked(apiClient.adminGetUserLearningData).mockResolvedValue(mockLearningData);

    const { result } = renderHook(() => useUserLearningData('user-1', 50), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockLearningData);
    expect(apiClient.adminGetUserLearningData).toHaveBeenCalledWith('user-1', 50);
  });

  it('应该使用默认 limit 值', async () => {
    const mockLearningData = {
      user: {
        id: 'user-1',
        username: 'testuser',
        email: 'test@example.com',
      },
      totalRecords: 100,
      correctRecords: 85,
      averageAccuracy: 0.85,
      totalWordsLearned: 50,
      recentRecords: [],
    };

    vi.mocked(apiClient.adminGetUserLearningData).mockResolvedValue(mockLearningData);

    const { result } = renderHook(() => useUserLearningData('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // 默认 limit 应该是 100
    expect(apiClient.adminGetUserLearningData).toHaveBeenCalledWith('user-1', 100);
  });

  it('应该在 userId 为空时禁用查询', async () => {
    const { result } = renderHook(() => useUserLearningData(''), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(apiClient.adminGetUserLearningData).not.toHaveBeenCalled();
  });
});
