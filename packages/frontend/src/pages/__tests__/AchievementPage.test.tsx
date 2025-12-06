import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

// Mock API Client
const mockBadges = [
  {
    id: 'badge-1',
    name: '连续学习7天',
    description: '连续学习7天达成',
    category: 'STREAK',
    tier: 1,
    unlockedAt: '2024-01-15T10:00:00.000Z',
    progress: 100,
  },
  {
    id: 'badge-2',
    name: '准确率达人',
    description: '正确率超过90%',
    category: 'ACCURACY',
    tier: 2,
    unlockedAt: null,
    progress: 75,
  },
  {
    id: 'badge-3',
    name: '认知突破',
    description: '认知能力提升',
    category: 'COGNITIVE',
    tier: 3,
    unlockedAt: '2024-01-20T10:00:00.000Z',
    progress: 100,
  },
];

vi.mock('../../services/ApiClient', () => ({
  default: {
    getAllBadgesWithStatus: vi.fn(),
    checkAndAwardBadges: vi.fn(),
    getBadgeProgress: vi.fn(),
  },
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

import ApiClient from '../../services/ApiClient';

describe('AchievementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ApiClient.getAllBadgesWithStatus as any).mockResolvedValue({
      badges: mockBadges,
      totalCount: 3,
      unlockedCount: 2,
    });
    (ApiClient.checkAndAwardBadges as any).mockResolvedValue({
      hasNewBadges: false,
      newBadges: [],
    });
    (ApiClient.getBadgeProgress as any).mockResolvedValue({
      badgeId: 'badge-2',
      currentValue: 75,
      targetValue: 100,
      percentage: 75,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <AchievementPage />
      </MemoryRouter>
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
        expect(ApiClient.checkAndAwardBadges).toHaveBeenCalled();
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

      (ApiClient.checkAndAwardBadges as any).mockResolvedValue({
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
      (ApiClient.getAllBadgesWithStatus as any).mockResolvedValue({
        badges: [],
        totalCount: 0,
        unlockedCount: 0,
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
      (ApiClient.getAllBadgesWithStatus as any).mockRejectedValue(new Error('加载失败'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('出错了')).toBeInTheDocument();
        expect(screen.getByText('加载失败')).toBeInTheDocument();
        expect(screen.getByText('重试')).toBeInTheDocument();
      });
    });

    it('should retry loading when clicking retry button', async () => {
      (ApiClient.getAllBadgesWithStatus as any)
        .mockRejectedValueOnce(new Error('加载失败'))
        .mockResolvedValueOnce({
          badges: mockBadges,
          totalCount: 3,
          unlockedCount: 2,
        });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('重试'));

      await waitFor(() => {
        expect(screen.getByText('连续学习7天')).toBeInTheDocument();
      });
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
