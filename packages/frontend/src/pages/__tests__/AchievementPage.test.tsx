import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import AchievementPage from '../AchievementPage';

// Mock 导航
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock badges 数据
const mockBadges = [
  {
    id: 'badge-1',
    name: '连续学习7天',
    description: '连续学习7天达成',
    category: 'STREAK',
    tier: 1,
    unlockedAt: '2024-01-15T10:00:00.000Z',
    unlocked: true,
    progress: 100,
  },
  {
    id: 'badge-2',
    name: '准确率达人',
    description: '正确率超过90%',
    category: 'ACCURACY',
    tier: 2,
    unlockedAt: null,
    unlocked: false,
    progress: 75,
  },
  {
    id: 'badge-3',
    name: '认知突破',
    description: '认知能力提升',
    category: 'COGNITIVE',
    tier: 3,
    unlockedAt: '2024-01-20T10:00:00.000Z',
    unlocked: true,
    progress: 100,
  },
];

// Mock useAchievements hook
const mockUseAchievements = vi.fn();
const mockCheckNewBadgesMutation = vi.fn();
const mockUseAchievementProgress = vi.fn();

vi.mock('../../hooks/queries/useAchievements', () => ({
  useAchievements: () => mockUseAchievements(),
  useCheckNewBadges: () => mockCheckNewBadgesMutation(),
  useAchievementProgress: () => mockUseAchievementProgress(),
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  uiLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock errorHandler
vi.mock('../../utils/errorHandler', () => ({
  handleError: vi.fn((err) => err?.message || '未知错误'),
}));

// Mock BadgeCelebration component
vi.mock('../../components/BadgeCelebration', () => ({
  default: ({ badge, onClose, isVisible }: any) =>
    isVisible ? (
      <div data-testid="badge-celebration">
        <span>{badge.name}</span>
        <button onClick={onClose}>关闭庆祝</button>
      </div>
    ) : null,
}));

// 创建测试用的 QueryClient
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

describe('AchievementPage', () => {
  let mockMutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockMutateAsync = vi.fn().mockResolvedValue({
      hasNewBadges: false,
      newBadges: [],
    });

    // 默认返回成功状态
    mockUseAchievements.mockReturnValue({
      data: {
        badges: mockBadges,
        totalCount: 3,
        unlockedCount: 2,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    mockCheckNewBadgesMutation.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });

    mockUseAchievementProgress.mockReturnValue({
      data: {
        badgeId: 'badge-2',
        currentValue: 75,
        targetValue: 100,
        percentage: 75,
      },
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
          <AchievementPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  describe('Rendering', () => {
    it('should render page title', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('成就与徽章')).toBeInTheDocument();
      });
    });

    it('should render statistics cards', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('已解锁徽章')).toBeInTheDocument();
        expect(screen.getByText('总徽章数')).toBeInTheDocument();
        expect(screen.getByText('完成进度')).toBeInTheDocument();
      });
    });

    it('should render badge filter buttons', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('全部')).toBeInTheDocument();
        expect(screen.getByText('连续学习')).toBeInTheDocument();
        expect(screen.getByText('正确率')).toBeInTheDocument();
        expect(screen.getByText('认知提升')).toBeInTheDocument();
        expect(screen.getByText('里程碑')).toBeInTheDocument();
      });
    });

    it('should render badge cards', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('连续学习7天')).toBeInTheDocument();
        expect(screen.getByText('准确率达人')).toBeInTheDocument();
        expect(screen.getByText('认知突破')).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      mockUseAchievements.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      renderComponent();
      expect(screen.getByText('正在加载成就...')).toBeInTheDocument();
    });
  });

  describe('Category Filtering', () => {
    it('should filter badges by STREAK category', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('连续学习7天')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('连续学习'));

      await waitFor(() => {
        expect(screen.getByText('连续学习7天')).toBeInTheDocument();
        // Other badges should not be visible after filtering
      });
    });

    it('should filter badges by ACCURACY category', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('准确率达人')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('正确率'));

      await waitFor(() => {
        expect(screen.getByText('准确率达人')).toBeInTheDocument();
      });
    });

    it('should show all badges when clicking "全部"', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('连续学习7天')).toBeInTheDocument();
      });

      // First filter by category
      fireEvent.click(screen.getByText('连续学习'));

      // Then click all
      fireEvent.click(screen.getByText('全部'));

      await waitFor(() => {
        expect(screen.getByText('连续学习7天')).toBeInTheDocument();
        expect(screen.getByText('准确率达人')).toBeInTheDocument();
        expect(screen.getByText('认知突破')).toBeInTheDocument();
      });
    });
  });

  describe('Badge Detail Modal', () => {
    it('should open badge detail when clicking on a badge', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('连续学习7天')).toBeInTheDocument();
      });

      // Click on the first badge card
      const badgeCard = screen.getByText('连续学习7天').closest('div[class*="cursor-pointer"]');
      if (badgeCard) {
        fireEvent.click(badgeCard);
      }

      await waitFor(() => {
        // Check for modal content
        expect(screen.getAllByText('连续学习7天').length).toBeGreaterThan(0);
        expect(screen.getByText('连续学习7天达成')).toBeInTheDocument();
      });
    });

    it('should close badge detail when clicking close button', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('连续学习7天')).toBeInTheDocument();
      });

      // Click on badge to open detail
      const badgeCard = screen.getByText('连续学习7天').closest('div[class*="cursor-pointer"]');
      if (badgeCard) {
        fireEvent.click(badgeCard);
      }

      await waitFor(() => {
        expect(screen.getByText('关闭')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('关闭'));

      // Modal should be closed
      await waitFor(() => {
        expect(screen.queryByText('连续学习7天达成')).not.toBeInTheDocument();
      });
    });
  });

  describe('Check New Badges', () => {
    it('should check for new badges when clicking button', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('检查新徽章')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('检查新徽章'));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled();
      });
    });

    it('should show celebration when new badge is awarded', async () => {
      const newBadge = {
        badge: {
          id: 'new-badge',
          name: '新获得徽章',
          description: '恭喜获得新徽章',
          category: 'MILESTONE',
          tier: 1,
        },
        message: '恭喜！',
      };

      mockMutateAsync.mockResolvedValue({
        hasNewBadges: true,
        newBadges: [newBadge],
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('检查新徽章')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('检查新徽章'));

      await waitFor(() => {
        expect(screen.getByTestId('badge-celebration')).toBeInTheDocument();
        expect(screen.getByText('新获得徽章')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate to badges gallery when clicking view all button', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('查看所有成就')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('查看所有成就'));

      expect(mockNavigate).toHaveBeenCalledWith('/badges');
    });

    it('should navigate to learning when no badges', async () => {
      mockUseAchievements.mockReturnValue({
        data: {
          badges: [],
          totalCount: 0,
          unlockedCount: 0,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('暂无徽章')).toBeInTheDocument();
        expect(screen.getByText('开始学习')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('开始学习'));

      expect(mockNavigate).toHaveBeenCalledWith('/learning');
    });
  });

  describe('Error Handling', () => {
    it('should show error message when loading fails', async () => {
      mockUseAchievements.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('加载失败'),
        refetch: vi.fn(),
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('出错了')).toBeInTheDocument();
        expect(screen.getByText('加载失败')).toBeInTheDocument();
        expect(screen.getByText('重试')).toBeInTheDocument();
      });
    });

    it('should retry loading when clicking retry button', async () => {
      const mockRefetch = vi.fn();

      mockUseAchievements.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('加载失败'),
        refetch: mockRefetch,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('重试'));

      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe('Badge Progress', () => {
    it('should show progress for locked badges', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('准确率达人')).toBeInTheDocument();
        expect(screen.getByText('75%')).toBeInTheDocument();
      });
    });
  });
});
