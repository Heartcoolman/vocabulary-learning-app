import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import PlanPage from '../PlanPage';

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
const mockPlan = {
  dailyTarget: 20,
  estimatedCompletionDate: '2024-03-31',
  wordbookDistribution: [
    { wordbookName: 'CET-4 词汇', percentage: 60, priority: 1 },
    { wordbookName: 'CET-6 词汇', percentage: 40, priority: 2 },
  ],
  weeklyMilestones: [
    { week: 1, target: 140, description: '第一周目标', completed: true },
    { week: 2, target: 140, description: '第二周目标', completed: false },
  ],
};

const mockProgress = {
  completedToday: 15,
  targetToday: 20,
  weeklyProgress: 75,
  overallProgress: 45,
  onTrack: true,
  deviation: 5.2,
  status: 'on_track',
};

vi.mock('../../services/client', () => ({
  default: {
    getLearningPlan: vi.fn(),
    getPlanProgress: vi.fn(),
    generateLearningPlan: vi.fn(),
    adjustLearningPlan: vi.fn(),
  },
}));

// Mock utils
vi.mock('../../utils/errorHandler', () => ({
  handleError: vi.fn((err) => err.message || '发生错误'),
}));

import ApiClient from '../../services/client';

describe('PlanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ApiClient.getLearningPlan as any).mockResolvedValue(mockPlan);
    (ApiClient.getPlanProgress as any).mockResolvedValue(mockProgress);
    (ApiClient.generateLearningPlan as any).mockResolvedValue(mockPlan);
    (ApiClient.adjustLearningPlan as any).mockResolvedValue(mockPlan);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <PlanPage />
      </MemoryRouter>,
    );
  };

  describe('Rendering', () => {
    it('should render page title', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('学习计划')).toBeInTheDocument();
      });
    });

    it('should render daily target card', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('今日目标')).toBeInTheDocument();
      });
    });

    it('should render weekly progress card', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('本周进度')).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      renderComponent();
      expect(screen.getByText('正在加载学习计划...')).toBeInTheDocument();
    });
  });

  describe('Plan Display', () => {
    it('should display daily target', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('20 词')).toBeInTheDocument();
      });
    });

    it('should display completion progress', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/15.*\/.*20/)).toBeInTheDocument();
      });
    });

    it('should display weekly progress percentage', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('75%')).toBeInTheDocument();
      });
    });

    it('should display overall progress', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('45%')).toBeInTheDocument();
      });
    });

    it('should display plan status as on track', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('按计划进行')).toBeInTheDocument();
      });
    });
  });

  describe('Estimated Completion Date', () => {
    it('should display estimated completion date section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('预计完成日期')).toBeInTheDocument();
      });
    });
  });

  describe('Wordbook Distribution', () => {
    it('should display wordbook distribution section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('词书分配')).toBeInTheDocument();
      });
    });

    it('should display wordbook names', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('CET-4 词汇')).toBeInTheDocument();
        expect(screen.getByText('CET-6 词汇')).toBeInTheDocument();
      });
    });
  });

  describe('Weekly Milestones', () => {
    it('should display weekly milestones section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('周里程碑')).toBeInTheDocument();
      });
    });

    it('should display milestone targets', async () => {
      renderComponent();

      await waitFor(() => {
        // There can be multiple milestone targets (one per week)
        expect(screen.getAllByText('140 词').length).toBeGreaterThan(0);
      });
    });
  });

  describe('Plan Status - Behind Schedule', () => {
    it('should show needs improvement indicator when behind schedule', async () => {
      (ApiClient.getPlanProgress as any).mockResolvedValue({
        ...mockProgress,
        onTrack: false,
        deviation: -10,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('需要加油')).toBeInTheDocument();
      });
    });
  });

  describe('No Plan State', () => {
    it('should show create plan message when no plan exists', async () => {
      (ApiClient.getLearningPlan as any).mockResolvedValue(null);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('还没有学习计划')).toBeInTheDocument();
      });
    });

    it('should show create plan button when no plan exists', async () => {
      (ApiClient.getLearningPlan as any).mockResolvedValue(null);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('创建学习计划')).toBeInTheDocument();
      });
    });
  });

  describe('Plan Generation', () => {
    it('should open create plan modal when clicking create button', async () => {
      (ApiClient.getLearningPlan as any).mockResolvedValue(null);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('创建学习计划')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('创建学习计划'));

      await waitFor(() => {
        expect(screen.getByText('每日学习目标（单词数）')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate to learning when clicking start learning', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('开始学习')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('开始学习'));
      expect(mockNavigate).toHaveBeenCalledWith('/learning');
    });
  });

  describe('Error Handling', () => {
    it('should show error message when loading fails', async () => {
      (ApiClient.getLearningPlan as any).mockRejectedValue(new Error('加载失败'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('出错了')).toBeInTheDocument();
      });
    });

    it('should show retry button on error', async () => {
      (ApiClient.getLearningPlan as any).mockRejectedValue(new Error('加载失败'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });
    });

    it('should retry loading when clicking retry button', async () => {
      (ApiClient.getLearningPlan as any)
        .mockRejectedValueOnce(new Error('加载失败'))
        .mockResolvedValueOnce(mockPlan);
      (ApiClient.getPlanProgress as any).mockResolvedValue(mockProgress);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('重试'));

      await waitFor(() => {
        expect(screen.getByText('学习计划')).toBeInTheDocument();
      });
    });
  });
});
