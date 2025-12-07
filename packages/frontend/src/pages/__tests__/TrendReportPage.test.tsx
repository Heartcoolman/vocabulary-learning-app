import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import TrendReportPage from '../TrendReportPage';

// Mock 导航
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock data matching actual component expectations
const mockTrendInfo = {
  state: 'up' as const,
  stateDescription: '你的学习趋势正在上升，继续保持！',
  consecutiveDays: 5,
};

const mockTrendReport = {
  accuracyTrend: {
    direction: 'up' as const,
    changePercent: 5.2,
    points: [
      { date: '2024-01-15', value: 88 },
      { date: '2024-01-14', value: 85 },
      { date: '2024-01-13', value: 82 },
    ],
  },
  responseTimeTrend: {
    direction: 'down' as const,
    changePercent: -10,
    points: [
      { date: '2024-01-15', value: 1200 },
      { date: '2024-01-14', value: 1300 },
      { date: '2024-01-13', value: 1400 },
    ],
  },
  motivationTrend: {
    direction: 'up' as const,
    changePercent: 8,
    points: [
      { date: '2024-01-15', value: 85 },
      { date: '2024-01-14', value: 80 },
      { date: '2024-01-13', value: 78 },
    ],
  },
  summary: '你的学习表现很好，正确率持续上升。',
  recommendations: ['继续保持当前的学习节奏', '可以适当增加学习量'],
};

const mockTrendHistory = {
  daily: [
    {
      date: '2024-01-15',
      state: 'up' as const,
      accuracy: 0.88,
      avgResponseTime: 1200,
      motivation: 0.1,
    },
    {
      date: '2024-01-14',
      state: 'stable' as const,
      accuracy: 0.85,
      avgResponseTime: 1300,
      motivation: 0.05,
    },
    {
      date: '2024-01-13',
      state: 'up' as const,
      accuracy: 0.82,
      avgResponseTime: 1400,
      motivation: 0.08,
    },
  ],
};

const mockIntervention = {
  needsIntervention: true,
  type: 'encouragement' as const,
  message: '表现出色！继续保持这个势头！',
  actions: ['可以挑战更高难度的单词'],
};

vi.mock('../../services/ApiClient', () => ({
  default: {
    getCurrentTrend: vi.fn(),
    getTrendReport: vi.fn(),
    getTrendHistory: vi.fn(),
    getIntervention: vi.fn(),
  },
}));

// Mock utils
vi.mock('../../utils/errorHandler', () => ({
  handleError: vi.fn((err) => err.message || '发生错误'),
}));

// Mock LineChart component
vi.mock('../../components/LineChart', () => ({
  default: () => <div data-testid="line-chart">LineChart</div>,
}));

import ApiClient from '../../services/ApiClient';

describe('TrendReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ApiClient.getCurrentTrend as any).mockResolvedValue(mockTrendInfo);
    (ApiClient.getTrendReport as any).mockResolvedValue(mockTrendReport);
    (ApiClient.getTrendHistory as any).mockResolvedValue(mockTrendHistory);
    (ApiClient.getIntervention as any).mockResolvedValue(mockIntervention);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <TrendReportPage />
      </MemoryRouter>,
    );
  };

  describe('Rendering', () => {
    it('should render page title', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('趋势分析')).toBeInTheDocument();
      });
    });

    it('should render accuracy trend section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('准确率趋势')).toBeInTheDocument();
      });
    });

    it('should render response time trend section', async () => {
      renderComponent();

      await waitFor(() => {
        // There can be multiple elements with this text (in header and table)
        expect(screen.getAllByText('响应时间').length).toBeGreaterThan(0);
      });
    });

    it('should render motivation trend section', async () => {
      renderComponent();

      await waitFor(() => {
        // There can be multiple elements with this text (in header and table)
        expect(screen.getAllByText('学习动力').length).toBeGreaterThan(0);
      });
    });

    it('should show loading state initially', () => {
      renderComponent();
      expect(screen.getByText('正在分析学习趋势...')).toBeInTheDocument();
    });
  });

  describe('Trend Status Display', () => {
    it('should display current trend state', async () => {
      renderComponent();

      await waitFor(() => {
        // There can be multiple '上升' elements (in header and history table)
        expect(screen.getAllByText('上升').length).toBeGreaterThan(0);
      });
    });

    it('should display trend description', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/你的学习趋势正在上升/)).toBeInTheDocument();
      });
    });

    it('should display consecutive days', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/连续 5 天/)).toBeInTheDocument();
      });
    });
  });

  describe('Intervention Display', () => {
    it('should display intervention message when needed', async () => {
      renderComponent();

      await waitFor(() => {
        // The component shows "表现出色！" as the title
        expect(screen.getAllByText(/表现出色/).length).toBeGreaterThan(0);
      });
    });

    it('should display intervention actions', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/挑战更高难度/)).toBeInTheDocument();
      });
    });
  });

  describe('Summary and Recommendations', () => {
    it('should display summary section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('总结')).toBeInTheDocument();
      });
    });

    it('should display summary text', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/学习表现很好/)).toBeInTheDocument();
      });
    });

    it('should display recommendations section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('建议')).toBeInTheDocument();
      });
    });

    it('should display recommendation items', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/继续保持当前的学习节奏/)).toBeInTheDocument();
      });
    });
  });

  describe('History Table', () => {
    it('should display history section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('历史记录')).toBeInTheDocument();
      });
    });

    it('should display history table headers', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('日期')).toBeInTheDocument();
        expect(screen.getByText('趋势')).toBeInTheDocument();
        expect(screen.getByText('准确率')).toBeInTheDocument();
      });
    });
  });

  describe('Time Range Selection', () => {
    it('should display time range buttons', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('最近 7 天')).toBeInTheDocument();
        expect(screen.getByText('最近 28 天')).toBeInTheDocument();
        expect(screen.getByText('最近 90 天')).toBeInTheDocument();
      });
    });

    it('should change time range when clicking button', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('最近 7 天')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('最近 7 天'));

      await waitFor(() => {
        expect(ApiClient.getTrendHistory).toHaveBeenCalledWith(7);
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no data', async () => {
      (ApiClient.getCurrentTrend as any).mockResolvedValue(null);
      (ApiClient.getTrendReport as any).mockResolvedValue(null);
      (ApiClient.getTrendHistory as any).mockResolvedValue({ daily: [] });
      (ApiClient.getIntervention as any).mockResolvedValue({ needsIntervention: false });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('收集数据中')).toBeInTheDocument();
      });
    });

    it('should show start learning button when no data', async () => {
      (ApiClient.getCurrentTrend as any).mockResolvedValue(null);
      (ApiClient.getTrendReport as any).mockResolvedValue(null);
      (ApiClient.getTrendHistory as any).mockResolvedValue({ daily: [] });
      (ApiClient.getIntervention as any).mockResolvedValue({ needsIntervention: false });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('开始学习')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error message when loading fails', async () => {
      (ApiClient.getCurrentTrend as any).mockRejectedValue(new Error('加载失败'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('错误')).toBeInTheDocument();
      });
    });

    it('should show retry button on error', async () => {
      (ApiClient.getCurrentTrend as any).mockRejectedValue(new Error('加载失败'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });
    });

    it('should retry loading when clicking retry button', async () => {
      (ApiClient.getCurrentTrend as any)
        .mockRejectedValueOnce(new Error('加载失败'))
        .mockResolvedValueOnce(mockTrendInfo);
      (ApiClient.getTrendReport as any).mockResolvedValue(mockTrendReport);
      (ApiClient.getTrendHistory as any).mockResolvedValue(mockTrendHistory);
      (ApiClient.getIntervention as any).mockResolvedValue(mockIntervention);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('重试'));

      await waitFor(() => {
        expect(screen.getByText('趋势分析')).toBeInTheDocument();
      });
    });
  });
});
