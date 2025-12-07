import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useSyncProgress, syncProgress } from '../useSyncProgress';
import ApiClient from '../../../services/ApiClient';
import type { SyncProgressParams } from '../useSyncProgress';

// Mock ApiClient
vi.mock('../../../services/ApiClient', () => ({
  default: {
    syncMasteryProgress: vi.fn(),
  },
}));

const mockApiClient = ApiClient as {
  syncMasteryProgress: ReturnType<typeof vi.fn>;
};

// 创建测试用的QueryClient
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

// Wrapper组件
const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

// Mock数据
const mockParams: SyncProgressParams = {
  sessionId: 'session-123',
  actualMasteryCount: 15,
  totalQuestions: 45,
};

describe('useSyncProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sync progress successfully', async () => {
    mockApiClient.syncMasteryProgress.mockResolvedValue(undefined);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useSyncProgress(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isPending).toBe(false);

    // 触发mutation
    result.current.mutate(mockParams);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockApiClient.syncMasteryProgress).toHaveBeenCalledTimes(1);
    expect(mockApiClient.syncMasteryProgress).toHaveBeenCalledWith(mockParams);
  });

  it('should handle sync progress error', async () => {
    const error = new Error('Sync failed');
    mockApiClient.syncMasteryProgress.mockRejectedValue(error);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useSyncProgress({ retry: false }), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate(mockParams);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(error);
  });

  it('should call onSuccess callback', async () => {
    mockApiClient.syncMasteryProgress.mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useSyncProgress({ onSuccess }), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate(mockParams);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('should call onError callback', async () => {
    const error = new Error('Sync failed');
    mockApiClient.syncMasteryProgress.mockRejectedValue(error);
    const onError = vi.fn();
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useSyncProgress({ onError, retry: false }), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate(mockParams);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(onError).toHaveBeenCalledTimes(1);
    // Check that error was called with at least the error and params
    expect(onError.mock.calls[0][0]).toEqual(error);
    expect(onError.mock.calls[0][1]).toEqual(mockParams);
  });

  it('should use mutateAsync', async () => {
    mockApiClient.syncMasteryProgress.mockResolvedValue(undefined);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useSyncProgress(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync(mockParams);

    expect(mockApiClient.syncMasteryProgress).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple sync requests', async () => {
    mockApiClient.syncMasteryProgress.mockResolvedValue(undefined);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useSyncProgress(), {
      wrapper: createWrapper(queryClient),
    });

    // 第一次同步
    result.current.mutate(mockParams);
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // 第二次同步
    const newParams = { ...mockParams, totalQuestions: 50 };
    result.current.mutate(newParams);
    await waitFor(() => {
      expect(mockApiClient.syncMasteryProgress).toHaveBeenCalledTimes(2);
    });

    expect(mockApiClient.syncMasteryProgress).toHaveBeenLastCalledWith(newParams);
  });

  it('should reset mutation state', async () => {
    mockApiClient.syncMasteryProgress.mockResolvedValue(undefined);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useSyncProgress(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate(mockParams);
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // 重置状态
    result.current.reset();

    // After reset, the mutation returns to idle state
    await waitFor(() => {
      expect(result.current.isIdle).toBe(true);
    });
    expect(result.current.isSuccess).toBe(false);
  });
});

describe('syncProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sync progress directly', async () => {
    mockApiClient.syncMasteryProgress.mockResolvedValue(undefined);

    await syncProgress(mockParams);

    expect(mockApiClient.syncMasteryProgress).toHaveBeenCalledTimes(1);
    expect(mockApiClient.syncMasteryProgress).toHaveBeenCalledWith(mockParams);
  });

  it('should handle API error', async () => {
    const error = new Error('Sync failed');
    mockApiClient.syncMasteryProgress.mockRejectedValue(error);

    await expect(syncProgress(mockParams)).rejects.toThrow('Sync failed');
  });
});
