import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from 'vitest';
import HabitProfilePage from '../HabitProfilePage';

// Mock 导航
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock API Client with proper profile data
const mockHabitProfile = {
  realtime: {
    timePref: Array(24)
      .fill(0)
      .map((_, i) => (i >= 8 && i <= 10 ? 0.3 : 0.1)),
    rhythmPref: {
      sessionMedianMinutes: 25,
    },
    samples: {
      sessions: 10,
      timeEvents: 50,
    },
  },
  stored: {
    timePref: Array(24)
      .fill(0)
      .map((_, i) => (i >= 8 && i <= 10 ? 0.3 : 0.1)),
    rhythmPref: {
      sessionMedianMinutes: 25,
    },
    updatedAt: '2024-01-15T10:00:00.000Z',
  },
};

vi.mock('../../services/client', () => ({
  default: {
    getHabitProfile: vi.fn(),
    initializeHabitProfile: vi.fn(),
    persistHabitProfile: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  learningLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock useToast (keep other UI exports like Spinner)
vi.mock('../../components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../components/ui')>();
  return {
    ...actual,
    useToast: () => ({
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    }),
  };
});

interface ChronotypeCardProps {
  type: string;
  confidence: number;
  peakHours?: number[];
}

interface RhythmCardProps {
  type: string;
  avgDuration: number;
}

interface MotivationCardProps {
  streak: number;
  level: string;
  trend: string;
}

interface HabitHeatmapProps {
  data?: unknown[];
}

// Mock ChronotypeCard
vi.mock('../../components/ChronotypeCard', () => ({
  default: ({ type, confidence, peakHours }: ChronotypeCardProps) => (
    <div data-testid="chronotype-card">
      <span>{type}</span>
      <span>confidence: {confidence}</span>
      <span>peak: {peakHours?.join(',')}</span>
    </div>
  ),
}));

// Mock RhythmCard
vi.mock('../../components/profile/RhythmCard', () => ({
  RhythmCard: ({ type, avgDuration }: RhythmCardProps) => (
    <div data-testid="rhythm-card">
      <span>{type}</span>
      <span>duration: {avgDuration}</span>
    </div>
  ),
}));

// Mock MotivationCard
vi.mock('../../components/profile/MotivationCard', () => ({
  MotivationCard: ({ streak, level, trend }: MotivationCardProps) => (
    <div data-testid="motivation-card">
      <span>streak: {streak}</span>
      <span>level: {level}</span>
      <span>trend: {trend}</span>
    </div>
  ),
}));

// Mock HabitHeatmap
vi.mock('../../components/profile/HabitHeatmap', () => ({
  HabitHeatmap: ({ data }: HabitHeatmapProps) => (
    <div data-testid="habit-heatmap">
      <span>heatmap data length: {(data as unknown[])?.length}</span>
    </div>
  ),
}));

import apiClient from '../../services/client';

describe('HabitProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.getHabitProfile as Mock).mockResolvedValue(mockHabitProfile);
    (apiClient.initializeHabitProfile as Mock).mockResolvedValue({});
    (apiClient.persistHabitProfile as Mock).mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <HabitProfilePage />
      </MemoryRouter>,
    );
  };

  describe('Rendering', () => {
    it('should render page title', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/我的学习习惯画像/)).toBeInTheDocument();
      });
    });

    it('should render subtitle', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/基于您的历史学习行为分析生成的个性化报告/)).toBeInTheDocument();
      });
    });

    it('should render action buttons', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('重新计算')).toBeInTheDocument();
        expect(screen.getByText('保存画像')).toBeInTheDocument();
      });
    });

    it('should render profile cards when data exists', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('chronotype-card')).toBeInTheDocument();
        expect(screen.getByTestId('rhythm-card')).toBeInTheDocument();
        expect(screen.getByTestId('motivation-card')).toBeInTheDocument();
      });
    });

    it('should render heatmap when data exists', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('habit-heatmap')).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      // Mock slow API response
      (apiClient.getHabitProfile as Mock).mockImplementation(() => new Promise(() => {}));

      renderComponent();

      // Check for spinner element (the component uses a spinner, not text)
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no sessions', async () => {
      (apiClient.getHabitProfile as Mock).mockResolvedValue({
        realtime: {
          timePref: [],
          rhythmPref: {},
          samples: {
            sessions: 0,
            timeEvents: 0,
          },
        },
        stored: null,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('暂无画像数据')).toBeInTheDocument();
        expect(screen.getByText('开始分析')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error message when loading fails', async () => {
      (apiClient.getHabitProfile as Mock).mockRejectedValue(new Error('加载失败'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/加载习惯数据失败/)).toBeInTheDocument();
      });
    });

    it('should show retry button on error', async () => {
      (apiClient.getHabitProfile as Mock).mockRejectedValue(new Error('加载失败'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });
    });

    it('should retry loading when clicking retry button', async () => {
      (apiClient.getHabitProfile as Mock)
        .mockRejectedValueOnce(new Error('加载失败'))
        .mockResolvedValueOnce(mockHabitProfile);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });

      // Initial call was made
      expect(apiClient.getHabitProfile).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText('重试'));

      // After retry, the API should be called again
      await waitFor(() => {
        expect(apiClient.getHabitProfile).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Actions', () => {
    it('should call initializeHabitProfile when clicking recalculate', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('重新计算')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('重新计算'));

      await waitFor(() => {
        expect(apiClient.initializeHabitProfile).toHaveBeenCalled();
      });
    });

    it('should call persistHabitProfile when clicking save', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('保存画像')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('保存画像'));

      await waitFor(() => {
        expect(apiClient.persistHabitProfile).toHaveBeenCalled();
      });
    });
  });

  describe('Stats Footer', () => {
    it('should display session count', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/已分析会话/)).toBeInTheDocument();
        expect(screen.getByText('10')).toBeInTheDocument();
      });
    });

    it('should display data sample count', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/数据采样点/)).toBeInTheDocument();
        expect(screen.getByText('50')).toBeInTheDocument();
      });
    });
  });
});
