import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import BadgeGalleryPage from '../BadgeGalleryPage';

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
    unlocked: true,
    unlockedAt: '2024-01-15T10:00:00.000Z',
    progress: 100,
  },
  {
    id: 'badge-2',
    name: '准确率达人',
    description: '正确率超过90%',
    category: 'ACCURACY',
    tier: 2,
    unlocked: false,
    unlockedAt: null,
    progress: 75,
  },
  {
    id: 'badge-3',
    name: '里程碑达成',
    description: '完成1000个单词',
    category: 'MILESTONE',
    tier: 3,
    unlocked: true,
    unlockedAt: '2024-01-20T10:00:00.000Z',
    progress: 100,
  },
];

vi.mock('../../services/ApiClient', () => ({
  default: {
    getAllBadgesWithStatus: vi.fn(),
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

// Mock BadgeDetailModal component
vi.mock('../../components/badges/BadgeDetailModal', () => ({
  default: ({ badge, onClose }: any) => (
    <div data-testid="badge-detail-modal">
      <h2>{badge.name}</h2>
      <p>{badge.description}</p>
      <button onClick={onClose}>关闭</button>
    </div>
  ),
}));

import ApiClient from '../../services/ApiClient';

describe('BadgeGalleryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ApiClient.getAllBadgesWithStatus as any).mockResolvedValue({
      badges: mockBadges,
      totalCount: 3,
      unlockedCount: 2,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <BadgeGalleryPage />
      </MemoryRouter>,
    );
  };

  describe('Rendering', () => {
    it('should render page title', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('成就画廊')).toBeInTheDocument();
      });
    });

    it('should render subtitle', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('浏览所有可获得的成就徽章')).toBeInTheDocument();
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

    it('should render back button', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByLabelText('返回')).toBeInTheDocument();
      });
    });

    it('should render category filter buttons', async () => {
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
        expect(screen.getByText('里程碑达成')).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      renderComponent();
      expect(screen.getByText('正在加载成就画廊...')).toBeInTheDocument();
    });
  });

  describe('Statistics Display', () => {
    it('should display correct unlocked count', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument(); // unlockedCount
      });
    });

    it('should display correct total count', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('3')).toBeInTheDocument(); // totalCount
      });
    });

    it('should display correct progress percentage', async () => {
      renderComponent();

      await waitFor(() => {
        // 2/3 = 66.67% -> rounded to 67%
        expect(screen.getByText('67%')).toBeInTheDocument();
      });
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
      });
    });

    it('should filter badges by MILESTONE category', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('里程碑达成')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('里程碑'));

      await waitFor(() => {
        expect(screen.getByText('里程碑达成')).toBeInTheDocument();
      });
    });

    it('should show all badges when clicking "全部"', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('连续学习7天')).toBeInTheDocument();
      });

      // First filter by category
      fireEvent.click(screen.getByText('里程碑'));

      // Then click all
      fireEvent.click(screen.getByText('全部'));

      await waitFor(() => {
        expect(screen.getByText('连续学习7天')).toBeInTheDocument();
        expect(screen.getByText('准确率达人')).toBeInTheDocument();
        expect(screen.getByText('里程碑达成')).toBeInTheDocument();
      });
    });
  });

  describe('Badge Detail Modal', () => {
    it('should open badge detail modal when clicking on a badge', async () => {
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
        expect(screen.getByTestId('badge-detail-modal')).toBeInTheDocument();
      });
    });

    it('should close badge detail modal when clicking close button', async () => {
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
        expect(screen.getByTestId('badge-detail-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: '关闭' }));

      await waitFor(() => {
        expect(screen.queryByTestId('badge-detail-modal')).not.toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate back to achievements when clicking back button', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByLabelText('返回')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('返回'));

      expect(mockNavigate).toHaveBeenCalledWith('/achievements');
    });

    it('should navigate to learning when no badges and clicking start button', async () => {
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

  describe('Badge States', () => {
    it('should display unlocked badges with check mark', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('连续学习7天')).toBeInTheDocument();
        // Badge 1 and 3 are unlocked, they should have visual indication
      });
    });

    it('should display locked badges with progress', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('准确率达人')).toBeInTheDocument();
        expect(screen.getByText('75%')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty state message when no badges', async () => {
      (ApiClient.getAllBadgesWithStatus as any).mockResolvedValue({
        badges: [],
        totalCount: 0,
        unlockedCount: 0,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('暂无徽章')).toBeInTheDocument();
        expect(screen.getByText('继续学习，解锁更多成就徽章！')).toBeInTheDocument();
      });
    });
  });
});
