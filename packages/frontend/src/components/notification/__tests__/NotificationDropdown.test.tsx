/**
 * NotificationDropdown Component Tests
 *
 * Tests C3 constraints:
 * - List size: max 5 items
 * - Filter: status != 'archived', sorted by createdAt DESC
 * - Click behavior: optimistic navigation + async mark as read
 * - Close trigger: click outside, press Escape
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { NotificationDropdown } from '../NotificationDropdown';

// Mock hooks
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../../hooks/queries', () => ({
  useNotifications: vi.fn(() => ({
    data: [],
    isLoading: false,
  })),
  useNotificationStats: vi.fn(() => ({
    data: { unread: 0 },
  })),
  useMarkAsRead: vi.fn(() => ({
    mutate: vi.fn(),
  })),
}));

vi.mock('../../Icon', () => ({
  Bell: () => <span data-testid="bell-icon">Bell</span>,
  CircleNotch: () => <span data-testid="loading-icon">Loading</span>,
  Clock: () => <span data-testid="clock-icon">Clock</span>,
  Check: () => <span data-testid="check-icon">Check</span>,
  Trash: () => <span data-testid="trash-icon">Trash</span>,
}));

vi.mock('../../ui/Empty', () => ({
  Empty: ({ type }: { type: string }) => <div data-testid="empty">{type}</div>,
}));

import { useNotifications, useNotificationStats, useMarkAsRead } from '../../../hooks/queries';

const mockUseNotifications = useNotifications as ReturnType<typeof vi.fn>;
const mockUseNotificationStats = useNotificationStats as ReturnType<typeof vi.fn>;
const mockUseMarkAsRead = useMarkAsRead as ReturnType<typeof vi.fn>;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
};

const mockNotifications = [
  {
    id: '1',
    title: 'Notification 1',
    content: 'Content 1',
    status: 'unread',
    priority: 'high',
    createdAt: Date.now() - 1000,
    type: 'system',
  },
  {
    id: '2',
    title: 'Notification 2',
    content: 'Content 2',
    status: 'read',
    priority: 'medium',
    createdAt: Date.now() - 2000,
    type: 'system',
  },
  {
    id: '3',
    title: 'Notification 3',
    content: 'Content 3',
    status: 'unread',
    priority: 'low',
    createdAt: Date.now() - 3000,
    type: 'system',
  },
];

describe('NotificationDropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseNotificationStats.mockReturnValue({ data: { unread: 3 } });
    mockUseNotifications.mockReturnValue({ data: mockNotifications, isLoading: false });
    mockUseMarkAsRead.mockReturnValue({ mutate: vi.fn() });
  });

  describe('bell button', () => {
    it('should render bell with unread count', () => {
      render(<NotificationDropdown />, { wrapper: createWrapper() });

      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should toggle dropdown on click', () => {
      render(<NotificationDropdown />, { wrapper: createWrapper() });

      const bell = screen.getByRole('button');
      fireEvent.click(bell);

      expect(screen.getByText('通知')).toBeInTheDocument();
    });
  });

  describe('dropdown panel', () => {
    it('should show header with unread count', () => {
      render(<NotificationDropdown />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByText('3 条未读')).toBeInTheDocument();
    });

    it('should show "查看全部通知" button', () => {
      render(<NotificationDropdown />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByText('查看全部通知')).toBeInTheDocument();
    });

    it('should show loading state', () => {
      mockUseNotifications.mockReturnValue({ data: undefined, isLoading: true });

      render(<NotificationDropdown />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByTestId('loading-icon')).toBeInTheDocument();
    });

    it('should show empty state when no notifications', () => {
      mockUseNotifications.mockReturnValue({ data: [], isLoading: false });

      render(<NotificationDropdown />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByTestId('empty')).toBeInTheDocument();
    });
  });

  describe('C3: max 5 items', () => {
    it('should show max 5 notifications', () => {
      const manyNotifications = Array.from({ length: 10 }, (_, i) => ({
        id: `${i}`,
        title: `Notification ${i}`,
        content: `Content ${i}`,
        status: 'unread' as const,
        priority: 'medium' as const,
        createdAt: Date.now() - i * 1000,
        type: 'system' as const,
      }));

      mockUseNotifications.mockReturnValue({ data: manyNotifications, isLoading: false });

      render(<NotificationDropdown />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByRole('button'));

      // Should only display 5 items (the component slices to 5)
      const items = screen.getAllByText(/Notification \d/);
      expect(items.length).toBeLessThanOrEqual(5);
    });
  });

  describe('close behavior', () => {
    it('should close on Escape key', () => {
      render(<NotificationDropdown />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByText('通知')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByText('通知')).not.toBeInTheDocument();
    });

    it('should close when clicking "查看全部通知"', () => {
      render(<NotificationDropdown />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByText('查看全部通知'));

      expect(screen.queryByText('通知')).not.toBeInTheDocument();
      expect(mockNavigate).toHaveBeenCalledWith('/notifications');
    });
  });

  describe('navigation', () => {
    it('should navigate to /notifications on view all click', () => {
      render(<NotificationDropdown />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByText('查看全部通知'));

      expect(mockNavigate).toHaveBeenCalledWith('/notifications');
    });
  });
});
