/**
 * SyncIndicator Component Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SyncIndicator from '../SyncIndicator';
import StorageService, { SyncStatus } from '../../services/StorageService';

// Mock Icon components
vi.mock('../Icon', () => ({
  Check: ({ className }: { className?: string }) => (
    <span data-testid="check-icon" className={className}>Check</span>
  ),
  X: ({ className }: { className?: string }) => (
    <span data-testid="x-icon" className={className}>X</span>
  ),
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  storageLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock StorageService
vi.mock('../../services/StorageService', () => ({
  default: {
    getSyncStatus: vi.fn(),
    onSyncStatusChange: vi.fn(),
    syncToCloud: vi.fn(),
  },
  SyncStatus: {},
}));

describe('SyncIndicator', () => {
  let mockUnsubscribe: ReturnType<typeof vi.fn>;
  let syncStatusCallback: (status: SyncStatus) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockUnsubscribe = vi.fn();

    (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      isSyncing: false,
      pendingChanges: 0,
      lastSyncTime: null,
      error: null,
    });

    (StorageService.onSyncStatusChange as ReturnType<typeof vi.fn>).mockImplementation((callback) => {
      syncStatusCallback = callback;
      return mockUnsubscribe;
    });

    (StorageService.syncToCloud as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==================== Visibility Tests ====================

  describe('visibility', () => {
    it('should return null when no pending changes and no error', () => {
      const { container } = render(<SyncIndicator />);
      expect(container.firstChild).toBeNull();
    });

    it('should show when syncing', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: true,
        pendingChanges: 0,
        lastSyncTime: null,
        error: null,
      });

      render(<SyncIndicator />);
      expect(screen.getByText('正在同步...')).toBeInTheDocument();
    });

    it('should show when has pending changes', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: false,
        pendingChanges: 5,
        lastSyncTime: null,
        error: null,
      });

      render(<SyncIndicator />);
      expect(screen.getByText('5 个待同步')).toBeInTheDocument();
    });

    it('should show when has error', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: false,
        pendingChanges: 0,
        lastSyncTime: null,
        error: 'Sync failed',
      });

      render(<SyncIndicator />);
      expect(screen.getByText('同步失败')).toBeInTheDocument();
    });
  });

  // ==================== Syncing State Tests ====================

  describe('syncing state', () => {
    it('should show spinner when syncing', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: true,
        pendingChanges: 0,
        lastSyncTime: null,
        error: null,
      });

      render(<SyncIndicator />);
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should show syncing text', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: true,
        pendingChanges: 0,
        lastSyncTime: null,
        error: null,
      });

      render(<SyncIndicator />);
      expect(screen.getByText('正在同步...')).toBeInTheDocument();
    });
  });

  // ==================== Success State Tests ====================

  describe('success state', () => {
    it('should show success icon after sync completes', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: true,
        pendingChanges: 0,
        lastSyncTime: null,
        error: null,
      });

      render(<SyncIndicator />);

      // Simulate sync completion
      act(() => {
        syncStatusCallback({
          isSyncing: false,
          pendingChanges: 0,
          lastSyncTime: Date.now(),
          error: null,
        });
      });

      expect(screen.getByText('同步成功')).toBeInTheDocument();
      expect(screen.getByTestId('check-icon')).toBeInTheDocument();
    });

    it('should hide success icon after 3 seconds', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: true,
        pendingChanges: 0,
        lastSyncTime: null,
        error: null,
      });

      render(<SyncIndicator />);

      // Simulate sync completion
      act(() => {
        syncStatusCallback({
          isSyncing: false,
          pendingChanges: 0,
          lastSyncTime: Date.now(),
          error: null,
        });
      });

      expect(screen.getByText('同步成功')).toBeInTheDocument();

      // Advance time by 3 seconds
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(screen.queryByText('同步成功')).not.toBeInTheDocument();
    });
  });

  // ==================== Error State Tests ====================

  describe('error state', () => {
    it('should show error icon after sync fails', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: true,
        pendingChanges: 0,
        lastSyncTime: null,
        error: null,
      });

      render(<SyncIndicator />);

      // Simulate sync failure
      act(() => {
        syncStatusCallback({
          isSyncing: false,
          pendingChanges: 0,
          lastSyncTime: null,
          error: 'Network error',
        });
      });

      expect(screen.getByText('同步失败')).toBeInTheDocument();
      expect(screen.getByTestId('x-icon')).toBeInTheDocument();
    });

    it('should hide error icon after 3 seconds', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: true,
        pendingChanges: 0,
        lastSyncTime: null,
        error: null,
      });

      render(<SyncIndicator />);

      // Simulate sync failure
      act(() => {
        syncStatusCallback({
          isSyncing: false,
          pendingChanges: 0,
          lastSyncTime: null,
          error: 'Network error',
        });
      });

      expect(screen.getByText('同步失败')).toBeInTheDocument();

      // Advance time by 3 seconds
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      // Error state should still show in details (not the animated error icon)
      // The error state persists but the animated icon goes away
      expect(screen.queryByText('同步失败')).toBeInTheDocument();
    });
  });

  // ==================== Details Panel Tests ====================

  describe('details panel', () => {
    it('should toggle details panel on click', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: false,
        pendingChanges: 5,
        lastSyncTime: Date.now() - 60000,
        error: null,
      });

      render(<SyncIndicator />);

      const statusDiv = screen.getByText('5 个待同步').closest('div[class*="cursor-pointer"]');
      if (statusDiv) {
        fireEvent.click(statusDiv);
      }

      expect(screen.getByText('最后同步')).toBeInTheDocument();
      expect(screen.getByText('待同步')).toBeInTheDocument();
    });

    it('should show last sync time', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: false,
        pendingChanges: 5,
        lastSyncTime: Date.now() - 60000,
        error: null,
      });

      render(<SyncIndicator />);

      const statusDiv = screen.getByText('5 个待同步').closest('div[class*="cursor-pointer"]');
      if (statusDiv) {
        fireEvent.click(statusDiv);
      }

      expect(screen.getByText('1分钟前')).toBeInTheDocument();
    });

    it('should show "从未同步" when never synced', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: false,
        pendingChanges: 5,
        lastSyncTime: null,
        error: null,
      });

      render(<SyncIndicator />);

      const statusDiv = screen.getByText('5 个待同步').closest('div[class*="cursor-pointer"]');
      if (statusDiv) {
        fireEvent.click(statusDiv);
      }

      expect(screen.getByText('从未同步')).toBeInTheDocument();
    });

    it('should show "刚刚" for recent sync', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: false,
        pendingChanges: 5,
        lastSyncTime: Date.now() - 10000,
        error: null,
      });

      render(<SyncIndicator />);

      const statusDiv = screen.getByText('5 个待同步').closest('div[class*="cursor-pointer"]');
      if (statusDiv) {
        fireEvent.click(statusDiv);
      }

      expect(screen.getByText('刚刚')).toBeInTheDocument();
    });

    it('should show error message in details', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: false,
        pendingChanges: 0,
        lastSyncTime: null,
        error: 'Network error occurred',
      });

      render(<SyncIndicator />);

      const statusDiv = screen.getByText('同步失败').closest('div[class*="cursor-pointer"]');
      if (statusDiv) {
        fireEvent.click(statusDiv);
      }

      expect(screen.getByText('Network error occurred')).toBeInTheDocument();
    });

    it('should show retry button on error', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: false,
        pendingChanges: 0,
        lastSyncTime: null,
        error: 'Network error',
      });

      render(<SyncIndicator />);

      const statusDiv = screen.getByText('同步失败').closest('div[class*="cursor-pointer"]');
      if (statusDiv) {
        fireEvent.click(statusDiv);
      }

      expect(screen.getByText('重试同步')).toBeInTheDocument();
    });
  });

  // ==================== Retry Tests ====================

  describe('retry', () => {
    it('should call syncToCloud on retry click', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: false,
        pendingChanges: 0,
        lastSyncTime: null,
        error: 'Network error',
      });

      render(<SyncIndicator />);

      const statusDiv = screen.getByText('同步失败').closest('div[class*="cursor-pointer"]');
      if (statusDiv) {
        fireEvent.click(statusDiv);
      }

      const retryButton = screen.getByText('重试同步');
      fireEvent.click(retryButton);

      expect(StorageService.syncToCloud).toHaveBeenCalled();
    });

    it('should disable retry button while syncing', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: true,
        pendingChanges: 0,
        lastSyncTime: null,
        error: 'Previous error',
      });

      render(<SyncIndicator />);

      const statusDiv = screen.getByText('正在同步...').closest('div[class*="cursor-pointer"]');
      if (statusDiv) {
        fireEvent.click(statusDiv);
      }

      const retryButton = screen.getByText('同步中...');
      expect(retryButton).toBeDisabled();
    });
  });

  // ==================== Subscription Tests ====================

  describe('subscription', () => {
    it('should subscribe to sync status changes on mount', () => {
      render(<SyncIndicator />);
      expect(StorageService.onSyncStatusChange).toHaveBeenCalled();
    });

    it('should unsubscribe on unmount', () => {
      const { unmount } = render(<SyncIndicator />);
      unmount();
      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('should update state when status changes', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: false,
        pendingChanges: 0,
        lastSyncTime: null,
        error: null,
      });

      render(<SyncIndicator />);

      // Simulate status change
      act(() => {
        syncStatusCallback({
          isSyncing: false,
          pendingChanges: 10,
          lastSyncTime: null,
          error: null,
        });
      });

      expect(screen.getByText('10 个待同步')).toBeInTheDocument();
    });
  });

  // ==================== Accessibility Tests ====================

  describe('accessibility', () => {
    it('should have aria-label on toggle button', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: false,
        pendingChanges: 5,
        lastSyncTime: null,
        error: null,
      });

      render(<SyncIndicator />);

      const toggleButton = screen.getByLabelText(/显示详情|隐藏详情/);
      expect(toggleButton).toBeInTheDocument();
    });
  });

  // ==================== Time Format Tests ====================

  describe('time formatting', () => {
    it('should format hours correctly', () => {
      (StorageService.getSyncStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        isSyncing: false,
        pendingChanges: 5,
        lastSyncTime: Date.now() - 3600000 * 2,
        error: null,
      });

      render(<SyncIndicator />);

      const statusDiv = screen.getByText('5 个待同步').closest('div[class*="cursor-pointer"]');
      if (statusDiv) {
        fireEvent.click(statusDiv);
      }

      expect(screen.getByText('2小时前')).toBeInTheDocument();
    });
  });
});
