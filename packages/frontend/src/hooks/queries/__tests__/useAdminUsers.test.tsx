import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAdminUsers, useDeleteUser, useUpdateUserRole } from '../useAdminUsers';
import { apiClient } from '@/services/client';

// Mock ApiClient
vi.mock('@/services/client', () => ({
  apiClient: {
    adminGetUsers: vi.fn(),
    adminDeleteUser: vi.fn(),
    adminUpdateUserRole: vi.fn(),
  },
}));

describe('useAdminUsers', () => {
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

  it('应该成功获取用户列表', async () => {
    const mockResponse = {
      users: [
        {
          id: '1',
          username: 'testuser',
          email: 'test@example.com',
          role: 'USER' as const,
          createdAt: '2024-01-01',
          totalWordsLearned: 100,
          averageScore: 85,
          accuracy: 90,
          lastLearningTime: '2024-01-15',
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      },
      total: 1,
      page: 1,
      pageSize: 20,
    };

    vi.mocked(apiClient.adminGetUsers).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useAdminUsers({ page: 1, pageSize: 20 }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.users).toHaveLength(1);
    expect(result.current.data?.users[0].username).toBe('testuser');
    expect(apiClient.adminGetUsers).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      search: undefined,
    });
  });

  it('应该支持搜索功能', async () => {
    const mockResponse = {
      users: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      total: 0,
      page: 1,
      pageSize: 20,
    };

    vi.mocked(apiClient.adminGetUsers).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useAdminUsers({ page: 1, pageSize: 20, search: 'test' }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiClient.adminGetUsers).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      search: 'test',
    });
  });

  it('应该支持客户端排序', async () => {
    const mockResponse = {
      users: [
        {
          id: '1',
          username: 'alice',
          email: 'alice@example.com',
          role: 'USER' as const,
          createdAt: '2024-01-01',
          totalWordsLearned: 100,
          averageScore: 85,
          accuracy: 90,
          lastLearningTime: null,
        },
        {
          id: '2',
          username: 'bob',
          email: 'bob@example.com',
          role: 'USER' as const,
          createdAt: '2024-01-02',
          totalWordsLearned: 50,
          averageScore: 75,
          accuracy: 80,
          lastLearningTime: null,
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
      total: 2,
      page: 1,
      pageSize: 20,
    };

    vi.mocked(apiClient.adminGetUsers).mockResolvedValue(mockResponse);

    const { result } = renderHook(
      () => useAdminUsers({ page: 1, pageSize: 20, sortBy: 'username', sortOrder: 'asc' }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // 应该按 username 升序排序
    expect(result.current.data?.users[0].username).toBe('alice');
    expect(result.current.data?.users[1].username).toBe('bob');
  });

  it('应该处理加载错误', async () => {
    vi.mocked(apiClient.adminGetUsers).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAdminUsers({ page: 1, pageSize: 20 }), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useDeleteUser', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('应该成功删除用户', async () => {
    vi.mocked(apiClient.adminDeleteUser).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteUser(), { wrapper });

    await result.current.mutateAsync('user-id');

    expect(apiClient.adminDeleteUser).toHaveBeenCalledWith('user-id');
  });

  it('应该在删除成功后使查询失效', async () => {
    vi.mocked(apiClient.adminDeleteUser).mockResolvedValue(undefined);

    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteUser(), { wrapper });

    await result.current.mutateAsync('user-id');

    expect(invalidateQueriesSpy).toHaveBeenCalled();
  });
});

describe('useUpdateUserRole', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('应该成功更新用户角色', async () => {
    const mockUser = {
      id: 'user-id',
      email: 'test@example.com',
      username: 'test',
      role: 'ADMIN' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    vi.mocked(apiClient.adminUpdateUserRole).mockResolvedValue(mockUser);

    const { result } = renderHook(() => useUpdateUserRole(), { wrapper });

    await result.current.mutateAsync({ userId: 'user-id', role: 'ADMIN' });

    expect(apiClient.adminUpdateUserRole).toHaveBeenCalledWith('user-id', 'ADMIN');
  });

  it('应该在更新成功后使查询失效', async () => {
    const mockUser = {
      id: 'user-id',
      email: 'test@example.com',
      username: 'test',
      role: 'ADMIN' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    vi.mocked(apiClient.adminUpdateUserRole).mockResolvedValue(mockUser);

    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateUserRole(), { wrapper });

    await result.current.mutateAsync({ userId: 'user-id', role: 'ADMIN' });

    expect(invalidateQueriesSpy).toHaveBeenCalled();
  });
});
