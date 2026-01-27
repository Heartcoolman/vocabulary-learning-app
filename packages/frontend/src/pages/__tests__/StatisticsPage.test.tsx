import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import StatisticsPage from '../StatisticsPage';
import type { FullStatisticsData } from '../../hooks/queries/useStatistics';

// Mock 导航
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock logger - 需要导出所有 logger 实例
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  learningLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  apiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  uiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  authLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  storageLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  amasLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  adminLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  trackingLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock 统计数据
const mockStatisticsData: FullStatisticsData = {
  totalWords: 3,
  masteryDistribution: [
    { level: 0, count: 0 },
    { level: 1, count: 1 },
    { level: 2, count: 0 },
    { level: 3, count: 1 },
    { level: 4, count: 0 },
    { level: 5, count: 1 },
  ],
  overallAccuracy: 0.855,
  studyDays: 3,
  consecutiveDays: 2,
  dailyAccuracy: [
    { date: '2024-01-13', accuracy: 1.0 },
    { date: '2024-01-14', accuracy: 0 },
    { date: '2024-01-15', accuracy: 1.0 },
  ],
  weekdayHeat: [1, 2, 0, 0, 0, 0, 1],
};

// Mock useStatistics hook and related semantic hooks used by ErrorAnalysisPanel
const mockUseStatistics = vi.fn();
const mockUseSemanticStats = vi.fn();
const mockUseErrorAnalysis = vi.fn();
vi.mock('../../hooks/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/queries')>();
  return {
    ...actual,
    useStatistics: () => mockUseStatistics(),
    useSemanticStats: () => mockUseSemanticStats(),
    useErrorAnalysis: (enabled?: boolean) => mockUseErrorAnalysis(enabled),
  };
});

// 创建测试用的 QueryClient
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

describe('StatisticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认返回成功状态
    mockUseStatistics.mockReturnValue({
      data: mockStatisticsData,
      isLoading: false,
      error: null,
    });
    mockUseSemanticStats.mockReturnValue({
      stats: { available: false },
      isLoading: false,
      error: null,
    });
    mockUseErrorAnalysis.mockReturnValue({
      analysis: null,
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    const queryClient = createTestQueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StatisticsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  describe('Rendering', () => {
    it('should render page title', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('学习统计')).toBeInTheDocument();
      });
    });

    it('should render total words card', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('总学习单词')).toBeInTheDocument();
      });
    });

    it('should render accuracy card', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('整体正确率')).toBeInTheDocument();
      });
    });

    it('should render study days card', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('学习天数')).toBeInTheDocument();
      });
    });

    it('should render consecutive days card', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('连续学习')).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      mockUseStatistics.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });
      renderComponent();
      expect(screen.getByText('正在加载统计数据...')).toBeInTheDocument();
    });
  });

  describe('Statistics Display', () => {
    it('should display total words count', async () => {
      renderComponent();

      await waitFor(() => {
        // The total words count appears in the stats card
        expect(screen.getByText('总学习单词')).toBeInTheDocument();
        // There can be multiple '3' elements in the DOM
        expect(screen.getAllByText('3').length).toBeGreaterThan(0);
      });
    });

    it('should display accuracy percentage', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('85.5%')).toBeInTheDocument();
      });
    });
  });

  describe('Mastery Distribution', () => {
    it('should display mastery distribution section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('掌握程度分布')).toBeInTheDocument();
      });
    });

    it('should display mastery levels', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('0 级')).toBeInTheDocument();
        expect(screen.getByText('1 级')).toBeInTheDocument();
        expect(screen.getByText('5 级')).toBeInTheDocument();
      });
    });
  });

  describe('Daily Accuracy Trend', () => {
    it('should display daily accuracy trend section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('每日正确率趋势')).toBeInTheDocument();
      });
    });
  });

  describe('Weekly Learning Distribution', () => {
    it('should display weekly learning distribution section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('每周学习分布')).toBeInTheDocument();
      });
    });

    it('should display weekday labels', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('日')).toBeInTheDocument();
        expect(screen.getByText('一')).toBeInTheDocument();
        expect(screen.getByText('六')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error message when loading fails', async () => {
      mockUseStatistics.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('加载失败'),
      });

      renderComponent();

      await waitFor(() => {
        // There are multiple "加载失败" texts (in h2 and p), so use getAllByText
        const errorTexts = screen.getAllByText('加载失败');
        expect(errorTexts.length).toBeGreaterThan(0);
      });
    });

    it('should show return to learning button on error', async () => {
      mockUseStatistics.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('加载失败'),
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('返回学习')).toBeInTheDocument();
      });
    });
  });

  // Note: Testing "not logged in" state would require resetting the module,
  // which is complex with the current mock structure.
  // The login check is covered by the error handling tests.
});
