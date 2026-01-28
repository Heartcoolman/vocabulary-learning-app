/**
 * useNotifications Hooks Tests
 *
 * Tests notification query and mutation hooks
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useNotifications,
  useNotificationStats,
  useMarkAsRead,
  useBatchMarkAsRead,
  useMarkAllAsRead,
  useDeleteNotification,
  useBatchDeleteNotifications,
} from '../useNotifications';
import { notificationClient } from '../../../services/client';

// Mock notificationClient
vi.mock('../../../services/client', () => ({
  notificationClient: {
    getNotifications: vi.fn(),
    getStats: vi.fn(),
    markAsRead: vi.fn(),
    batchMarkAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    deleteNotification: vi.fn(),
    batchDelete: vi.fn(),
  },
}));

const mockNotificationClient = notificationClient as unknown as {
  getNotifications: ReturnType<typeof vi.fn>;
  getStats: ReturnType<typeof vi.fn>;
  markAsRead: ReturnType<typeof vi.fn>;
  batchMarkAsRead: ReturnType<typeof vi.fn>;
  markAllAsRead: ReturnType<typeof vi.fn>;
  deleteNotification: ReturnType<typeof vi.fn>;
  batchDelete: ReturnType<typeof vi.fn>;
};

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => {
    return QueryClientProvider({ client: queryClient, children });
  };
};

const mockNotification = {
  id: 'notif-1',
  type: 'system' as const,
  title: '系统通知',
  content: '这是一条测试通知',
  priority: 'medium' as const,
  status: 'unread' as const,
  createdAt: Date.now(),
};

const mockStats = {
  total: 10,
  unread: 3,
  byType: { system: 5, learning: 3, achievement: 2 },
  byPriority: { high: 1, medium: 5, low: 4 },
};

describe('useNotifications hooks', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  describe('useNotifications', () => {
    it('should fetch notifications list', async () => {
      mockNotificationClient.getNotifications.mockResolvedValue([mockNotification]);

      const { result } = renderHook(() => useNotifications(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([mockNotification]);
      expect(mockNotificationClient.getNotifications).toHaveBeenCalledWith(undefined);
    });

    it('should pass query params to API', async () => {
      mockNotificationClient.getNotifications.mockResolvedValue([]);

      const params = { status: 'unread' as const, limit: 10, offset: 0 };
      renderHook(() => useNotifications(params), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(mockNotificationClient.getNotifications).toHaveBeenCalledWith(params);
      });
    });

    it('should respect enabled option', async () => {
      mockNotificationClient.getNotifications.mockResolvedValue([]);

      renderHook(() => useNotifications(undefined, { enabled: false }), {
        wrapper: createWrapper(queryClient),
      });

      // Should not call API when disabled
      expect(mockNotificationClient.getNotifications).not.toHaveBeenCalled();
    });
  });

  describe('useNotificationStats', () => {
    it('should fetch notification stats', async () => {
      mockNotificationClient.getStats.mockResolvedValue(mockStats);

      const { result } = renderHook(() => useNotificationStats(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockStats);
    });

    it('should respect enabled option', async () => {
      mockNotificationClient.getStats.mockResolvedValue(mockStats);

      renderHook(() => useNotificationStats({ enabled: false }), {
        wrapper: createWrapper(queryClient),
      });

      expect(mockNotificationClient.getStats).not.toHaveBeenCalled();
    });
  });

  describe('useMarkAsRead', () => {
    it('should mark notification as read', async () => {
      mockNotificationClient.markAsRead.mockResolvedValue(undefined);

      const { result } = renderHook(() => useMarkAsRead(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        result.current.mutate('notif-1');
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockNotificationClient.markAsRead).toHaveBeenCalledWith('notif-1');
    });
  });

  describe('useBatchMarkAsRead', () => {
    it('should batch mark notifications as read', async () => {
      mockNotificationClient.batchMarkAsRead.mockResolvedValue({ affected: 3 });

      const { result } = renderHook(() => useBatchMarkAsRead(), {
        wrapper: createWrapper(queryClient),
      });

      const ids = ['notif-1', 'notif-2', 'notif-3'];

      await act(async () => {
        result.current.mutate(ids);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockNotificationClient.batchMarkAsRead).toHaveBeenCalledWith(ids);
      expect(result.current.data).toEqual({ affected: 3 });
    });
  });

  describe('useMarkAllAsRead', () => {
    it('should mark all notifications as read', async () => {
      mockNotificationClient.markAllAsRead.mockResolvedValue(undefined);

      const { result } = renderHook(() => useMarkAllAsRead(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        result.current.mutate();
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockNotificationClient.markAllAsRead).toHaveBeenCalled();
    });
  });

  describe('useDeleteNotification', () => {
    it('should delete a notification', async () => {
      mockNotificationClient.deleteNotification.mockResolvedValue(undefined);

      const { result } = renderHook(() => useDeleteNotification(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        result.current.mutate('notif-1');
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockNotificationClient.deleteNotification).toHaveBeenCalledWith('notif-1');
    });
  });

  describe('useBatchDeleteNotifications', () => {
    it('should batch delete notifications', async () => {
      mockNotificationClient.batchDelete.mockResolvedValue({ affected: 2 });

      const { result } = renderHook(() => useBatchDeleteNotifications(), {
        wrapper: createWrapper(queryClient),
      });

      const ids = ['notif-1', 'notif-2'];

      await act(async () => {
        result.current.mutate(ids);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockNotificationClient.batchDelete).toHaveBeenCalledWith(ids);
      expect(result.current.data).toEqual({ affected: 2 });
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate queries after mark as read', async () => {
      mockNotificationClient.markAsRead.mockResolvedValue(undefined);
      mockNotificationClient.getNotifications.mockResolvedValue([mockNotification]);

      // First fetch notifications
      renderHook(() => useNotifications(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(mockNotificationClient.getNotifications).toHaveBeenCalledTimes(1);
      });

      // Then mark as read
      const { result } = renderHook(() => useMarkAsRead(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        result.current.mutate('notif-1');
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Query should be invalidated (refetch triggered)
      await waitFor(() => {
        expect(mockNotificationClient.getNotifications).toHaveBeenCalledTimes(2);
      });
    });
  });
});
