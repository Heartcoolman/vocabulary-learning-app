/**
 * LogViewerPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LogViewerPage from '../LogViewerPage';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(() => 'mock-token'),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// Mock Icon components
vi.mock('../../../components/Icon', () => ({
  CircleNotch: ({ className }: { className?: string }) => (
    <span data-testid="loading-spinner" className={className}>Loading</span>
  ),
  Warning: () => <span data-testid="warning-icon">Warning</span>,
  MagnifyingGlass: () => <span data-testid="search-icon">Search</span>,
  CaretDown: () => <span data-testid="caret-down-icon">CaretDown</span>,
  CaretLeft: () => <span data-testid="caret-left-icon">CaretLeft</span>,
  CaretRight: () => <span data-testid="caret-right-icon">CaretRight</span>,
  File: () => <span data-testid="file-icon">File</span>,
  Bug: () => <span data-testid="bug-icon">Bug</span>,
  Info: () => <span data-testid="info-icon">Info</span>,
  WarningCircle: () => <span data-testid="warning-circle-icon">WarningCircle</span>,
  XCircle: () => <span data-testid="x-circle-icon">XCircle</span>,
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
  adminLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockLogs = [
  {
    id: 'log-1',
    timestamp: '2024-01-15T10:30:00Z',
    level: 'ERROR',
    message: 'Test error message',
    module: 'auth',
    source: 'backend',
    userId: 'user-123',
    metadata: { stack: 'Error stack trace' },
  },
  {
    id: 'log-2',
    timestamp: '2024-01-15T10:25:00Z',
    level: 'WARN',
    message: 'Test warning message',
    module: 'api',
    source: 'frontend',
    userId: 'user-456',
    metadata: null,
  },
  {
    id: 'log-3',
    timestamp: '2024-01-15T10:20:00Z',
    level: 'INFO',
    message: 'Test info message',
    module: 'learning',
    source: 'backend',
    userId: null,
    metadata: null,
  },
  {
    id: 'log-4',
    timestamp: '2024-01-15T10:15:00Z',
    level: 'DEBUG',
    message: 'Test debug message',
    module: 'amas',
    source: 'frontend',
    userId: 'user-789',
    metadata: { debug: true },
  },
];

const mockStats = {
  total: 100,
  errorCount: 10,
  warnCount: 20,
  frontendCount: 40,
  backendCount: 60,
};

const mockPagination = {
  page: 1,
  pageSize: 20,
  total: 100,
  totalPages: 5,
};

const renderWithRouter = () => {
  return render(
    <MemoryRouter>
      <LogViewerPage />
    </MemoryRouter>
  );
};

describe('LogViewerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/admin/logs/stats')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockStats }),
        });
      }
      if (url.includes('/api/admin/logs')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { logs: mockLogs, pagination: mockPagination },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  describe('rendering', () => {
    it('should render page title', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('系统日志')).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      renderWithRouter();

      expect(screen.getByText('加载中...')).toBeInTheDocument();
    });
  });

  describe('stats display', () => {
    it('should display total logs count', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('总日志数')).toBeInTheDocument();
        expect(screen.getByText('100')).toBeInTheDocument();
      });
    });

    it('should display error count', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('错误数量')).toBeInTheDocument();
        expect(screen.getByText('10')).toBeInTheDocument();
      });
    });

    it('should display warning count', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('警告数量')).toBeInTheDocument();
        expect(screen.getByText('20')).toBeInTheDocument();
      });
    });

    it('should display frontend logs count', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('前端日志')).toBeInTheDocument();
        expect(screen.getByText('40')).toBeInTheDocument();
      });
    });

    it('should display backend logs count', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('后端日志')).toBeInTheDocument();
        expect(screen.getByText('60')).toBeInTheDocument();
      });
    });
  });

  describe('logs list', () => {
    it('should display log messages', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Test error message')).toBeInTheDocument();
        expect(screen.getByText('Test warning message')).toBeInTheDocument();
        expect(screen.getByText('Test info message')).toBeInTheDocument();
        expect(screen.getByText('Test debug message')).toBeInTheDocument();
      });
    });

    it('should display log levels', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('ERROR')).toBeInTheDocument();
        expect(screen.getByText('WARN')).toBeInTheDocument();
        expect(screen.getByText('INFO')).toBeInTheDocument();
        expect(screen.getByText('DEBUG')).toBeInTheDocument();
      });
    });

    it('should display log sources', async () => {
      renderWithRouter();

      await waitFor(() => {
        const frontendLabels = screen.getAllByText('前端');
        const backendLabels = screen.getAllByText('后端');
        expect(frontendLabels.length).toBeGreaterThan(0);
        expect(backendLabels.length).toBeGreaterThan(0);
      });
    });

    it('should display module names', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('auth')).toBeInTheDocument();
        expect(screen.getByText('api')).toBeInTheDocument();
        expect(screen.getByText('learning')).toBeInTheDocument();
        expect(screen.getByText('amas')).toBeInTheDocument();
      });
    });
  });

  describe('log expansion', () => {
    it('should expand log on click to show metadata', async () => {
      renderWithRouter();

      await waitFor(() => {
        const errorLog = screen.getByText('Test error message');
        fireEvent.click(errorLog.closest('div[class*="hover:bg-gray-50"]')!);
      });

      await waitFor(() => {
        expect(screen.getByText(/"stack": "Error stack trace"/)).toBeInTheDocument();
      });
    });

    it('should collapse expanded log on second click', async () => {
      renderWithRouter();

      await waitFor(() => {
        const errorLog = screen.getByText('Test error message');
        const logRow = errorLog.closest('div[class*="hover:bg-gray-50"]')!;

        // Expand
        fireEvent.click(logRow);
      });

      await waitFor(() => {
        expect(screen.getByText(/"stack": "Error stack trace"/)).toBeInTheDocument();
      });

      // Collapse
      const errorLog = screen.getByText('Test error message');
      const logRow = errorLog.closest('div[class*="hover:bg-gray-50"]')!;
      fireEvent.click(logRow);

      await waitFor(() => {
        expect(screen.queryByText(/"stack": "Error stack trace"/)).not.toBeInTheDocument();
      });
    });
  });

  describe('filters', () => {
    it('should have filter toggle button', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('筛选')).toBeInTheDocument();
      });
    });

    it('should show filter panel on toggle', async () => {
      renderWithRouter();

      await waitFor(() => {
        const filterButton = screen.getByText('筛选');
        fireEvent.click(filterButton);
      });

      await waitFor(() => {
        expect(screen.getByText('日志级别')).toBeInTheDocument();
      });
    });

    it('should have level filter buttons', async () => {
      renderWithRouter();

      await waitFor(() => {
        const filterButton = screen.getByText('筛选');
        fireEvent.click(filterButton);
      });

      await waitFor(() => {
        const levelButtons = screen.getAllByRole('button');
        const errorButton = levelButtons.find(btn => btn.textContent === 'ERROR');
        expect(errorButton).toBeDefined();
      });
    });

    it('should filter by level when clicked', async () => {
      renderWithRouter();

      await waitFor(() => {
        const filterButton = screen.getByText('筛选');
        fireEvent.click(filterButton);
      });

      await waitFor(() => {
        const errorButton = screen.getAllByRole('button').find(btn => btn.textContent === 'ERROR');
        if (errorButton) {
          fireEvent.click(errorButton);
        }
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('levels=ERROR'),
          expect.anything()
        );
      });
    });

    it('should have source filter dropdown', async () => {
      renderWithRouter();

      await waitFor(() => {
        const filterButton = screen.getByText('筛选');
        fireEvent.click(filterButton);
      });

      await waitFor(() => {
        expect(screen.getByText('来源')).toBeInTheDocument();
        expect(screen.getByText('全部来源')).toBeInTheDocument();
      });
    });

    it('should filter by source when selected', async () => {
      renderWithRouter();

      await waitFor(() => {
        const filterButton = screen.getByText('筛选');
        fireEvent.click(filterButton);
      });

      await waitFor(() => {
        // Get all comboboxes - module select is first, source select is second
        const selects = screen.getAllByRole('combobox');
        const sourceSelect = selects[1]; // Source select is the second combobox
        fireEvent.change(sourceSelect, { target: { value: 'frontend' } });
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('source=frontend'),
          expect.anything()
        );
      });
    });

    it('should have search input', async () => {
      renderWithRouter();

      await waitFor(() => {
        const filterButton = screen.getByText('筛选');
        fireEvent.click(filterButton);
      });

      await waitFor(() => {
        expect(screen.getByPlaceholderText('搜索日志内容...')).toBeInTheDocument();
      });
    });

    it('should filter by search term', async () => {
      renderWithRouter();

      await waitFor(() => {
        const filterButton = screen.getByText('筛选');
        fireEvent.click(filterButton);
      });

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('搜索日志内容...');
        fireEvent.change(searchInput, { target: { value: 'error' } });
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('search=error'),
          expect.anything()
        );
      });
    });

    it('should have date range filters', async () => {
      renderWithRouter();

      await waitFor(() => {
        const filterButton = screen.getByText('筛选');
        fireEvent.click(filterButton);
      });

      await waitFor(() => {
        expect(screen.getByText('开始时间')).toBeInTheDocument();
        expect(screen.getByText('结束时间')).toBeInTheDocument();
      });
    });
  });

  describe('pagination', () => {
    it('should display pagination info', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/显示第 1 - 20 条，共 100 条/)).toBeInTheDocument();
      });
    });

    it('should have navigation buttons', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getAllByTestId('caret-left-icon').length).toBeGreaterThan(0);
        expect(screen.getAllByTestId('caret-right-icon').length).toBeGreaterThan(0);
      });
    });

    it('should navigate to next page on button click', async () => {
      renderWithRouter();

      await waitFor(() => {
        const nextButton = screen.getAllByRole('button').find(btn =>
          btn.querySelector('[data-testid="caret-right-icon"]')
        );
        if (nextButton) {
          fireEvent.click(nextButton);
        }
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('page=2'),
          expect.anything()
        );
      });
    });

    it('should display page numbers', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('1')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('should show error when fetch fails', async () => {
      mockFetch.mockRejectedValue(new Error('API Error'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('加载失败')).toBeInTheDocument();
      });
    });

    it('should show retry button on error', async () => {
      mockFetch.mockRejectedValue(new Error('API Error'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });
    });

    it('should retry fetch on retry button click', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API Error'));
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/admin/logs/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, data: mockStats }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { logs: mockLogs, pagination: mockPagination },
          }),
        });
      });

      renderWithRouter();

      await waitFor(() => {
        const retryButton = screen.getByText('重试');
        fireEvent.click(retryButton);
      });

      await waitFor(() => {
        expect(screen.getByText('系统日志')).toBeInTheDocument();
      });
    });
  });

  describe('empty state', () => {
    it('should show empty state when no logs', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/admin/logs/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, data: mockStats }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { logs: [], pagination: { ...mockPagination, total: 0, totalPages: 0 } },
          }),
        });
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('暂无日志数据')).toBeInTheDocument();
      });
    });
  });

  describe('level icons', () => {
    it('should display correct icons for each level', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getAllByTestId('x-circle-icon').length).toBeGreaterThan(0); // ERROR
        expect(screen.getAllByTestId('warning-circle-icon').length).toBeGreaterThan(0); // WARN
        expect(screen.getAllByTestId('info-icon').length).toBeGreaterThan(0); // INFO
        expect(screen.getAllByTestId('bug-icon').length).toBeGreaterThan(0); // DEBUG
      });
    });
  });
});
