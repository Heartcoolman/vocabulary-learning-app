/**
 * BadgeDetailModal Component Unit Tests
 * 徽章详情模态框组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BadgeDetailModal from '../BadgeDetailModal';
import type { Badge, BadgeCategory } from '../../../types/amas-enhanced';

// Mock Icon component
vi.mock('../../Icon', () => ({
  Trophy: ({ size, weight, color, className }: any) => (
    <span
      data-testid="trophy-icon"
      data-size={size}
      data-weight={weight}
      data-color={color}
      className={className}
    >
      🏆
    </span>
  ),
  Star: ({ size, weight, color }: any) => (
    <span data-testid="star-icon" data-size={size} data-weight={weight} data-color={color}>
      ⭐
    </span>
  ),
  Fire: ({ size, weight, color }: any) => (
    <span data-testid="fire-icon" data-size={size} data-weight={weight} data-color={color}>
      🔥
    </span>
  ),
  Brain: ({ size, weight, color }: any) => (
    <span data-testid="brain-icon" data-size={size} data-weight={weight} data-color={color}>
      🧠
    </span>
  ),
  Target: ({ size, weight, color }: any) => (
    <span data-testid="target-icon" data-size={size} data-weight={weight} data-color={color}>
      🎯
    </span>
  ),
  CheckCircle: ({ size, weight, color, className }: any) => (
    <span
      data-testid="check-circle-icon"
      data-size={size}
      data-weight={weight}
      data-color={color}
      className={className}
    >
      ✅
    </span>
  ),
  X: ({ size, weight, color }: any) => (
    <span data-testid="x-icon" data-size={size} data-weight={weight} data-color={color}>
      ❌
    </span>
  ),
  Info: ({ size, weight, color }: any) => (
    <span data-testid="info-icon" data-size={size} data-weight={weight} data-color={color}>
      ℹ️
    </span>
  ),
  CircleNotch: ({ size, weight, color, className }: any) => (
    <span
      data-testid="circle-notch-icon"
      data-size={size}
      data-weight={weight}
      data-color={color}
      className={className}
    >
      ⏳
    </span>
  ),
}));

// Mock amasClient
vi.mock('../../../services/client', () => ({
  amasClient: {
    getBadgeProgress: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
  uiLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { amasClient } from '../../../services/client';

// Helper function to create badge
const createBadge = (overrides: Partial<Badge> = {}): Badge => ({
  id: 'badge-1',
  name: '学习达人',
  description: '完成 100 个单词的学习',
  iconUrl: '/icons/badge.png',
  category: 'MILESTONE' as BadgeCategory,
  tier: 3,
  ...overrides,
});

describe('BadgeDetailModal', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==================== Rendering Tests ====================
  describe('rendering', () => {
    it('should render modal with badge name', () => {
      const badge = createBadge({ name: '连续学习者' });
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(screen.getByText('连续学习者')).toBeInTheDocument();
    });

    it('should render badge description', () => {
      const badge = createBadge({ description: '连续学习 7 天' });
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(screen.getByText('连续学习 7 天')).toBeInTheDocument();
    });

    it('should render stars based on tier', () => {
      const badge = createBadge({ tier: 3 });
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      // Should have 5 stars total
      const stars = screen.getAllByTestId('star-icon');
      expect(stars.length).toBe(5);
    });

    it('should render close buttons', () => {
      const badge = createBadge();
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      // There are two close buttons - one X icon (aria-label=关闭) and one text button
      const closeButtons = screen.getAllByRole('button', { name: /关闭/ });
      expect(closeButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('should render reward section', () => {
      const badge = createBadge();
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(screen.getByText('奖励说明')).toBeInTheDocument();
      expect(screen.getByText(/获得此徽章将提升你的成就等级/)).toBeInTheDocument();
    });
  });

  // ==================== Category Icon Tests ====================
  describe('category icons', () => {
    it('should show fire icon for STREAK category', () => {
      const badge = createBadge({ category: 'STREAK' });
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(screen.getByTestId('fire-icon')).toBeInTheDocument();
    });

    it('should show target icon for ACCURACY category', () => {
      const badge = createBadge({ category: 'ACCURACY' });
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(screen.getByTestId('target-icon')).toBeInTheDocument();
    });

    it('should show brain icon for COGNITIVE category', () => {
      const badge = createBadge({ category: 'COGNITIVE' });
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(screen.getByTestId('brain-icon')).toBeInTheDocument();
    });

    it('should show trophy icon for MILESTONE category', () => {
      const badge = createBadge({ category: 'MILESTONE' });
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(screen.getAllByTestId('trophy-icon').length).toBeGreaterThan(0);
    });
  });

  // ==================== Category Name Tests ====================
  describe('category names', () => {
    it('should display 连续学习 for STREAK category', () => {
      const badge = createBadge({ category: 'STREAK' });
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(screen.getByText('连续学习')).toBeInTheDocument();
    });

    it('should display 正确率 for ACCURACY category', () => {
      const badge = createBadge({ category: 'ACCURACY' });
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(screen.getByText('正确率')).toBeInTheDocument();
    });

    it('should display 认知提升 for COGNITIVE category', () => {
      const badge = createBadge({ category: 'COGNITIVE' });
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(screen.getByText('认知提升')).toBeInTheDocument();
    });

    it('should display 里程碑 for MILESTONE category', () => {
      const badge = createBadge({ category: 'MILESTONE' });
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(screen.getByText('里程碑')).toBeInTheDocument();
    });
  });

  // ==================== Unlocked Badge Tests ====================
  describe('unlocked badge', () => {
    it('should show unlocked status for unlocked badge', () => {
      const badge = createBadge({ unlockedAt: '2024-01-15T10:30:00Z' });
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(screen.getByText('已解锁')).toBeInTheDocument();
    });

    it('should show check circle icon for unlocked badge', () => {
      const badge = createBadge({ unlockedAt: '2024-01-15T10:30:00Z' });
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(screen.getByTestId('check-circle-icon')).toBeInTheDocument();
    });

    it('should display unlock date for unlocked badge', () => {
      const badge = createBadge({ unlockedAt: '2024-01-15T10:30:00Z' });
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      // The date should be formatted in Chinese locale
      expect(screen.getByText(/2024/)).toBeInTheDocument();
    });

    it('should not load progress for unlocked badge', () => {
      const badge = createBadge({ unlockedAt: '2024-01-15T10:30:00Z' });
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(amasClient.getBadgeProgress).not.toHaveBeenCalled();
    });
  });

  // ==================== Locked Badge Tests ====================
  describe('locked badge', () => {
    it('should show progress section for locked badge', async () => {
      const badge = createBadge({ unlockedAt: undefined });
      vi.mocked(amasClient.getBadgeProgress).mockResolvedValue({
        badgeId: 'badge-1',
        currentValue: 50,
        targetValue: 100,
        percentage: 50,
      });

      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(screen.getByText('解锁进度')).toBeInTheDocument();
    });

    it('should load and display progress for locked badge', async () => {
      const badge = createBadge({ unlockedAt: undefined });
      vi.mocked(amasClient.getBadgeProgress).mockResolvedValue({
        badgeId: 'badge-1',
        currentValue: 50,
        targetValue: 100,
        percentage: 50,
      });

      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('50 / 100')).toBeInTheDocument();
        expect(screen.getByText('(50%)')).toBeInTheDocument();
      });
    });

    it('should show loading spinner while loading progress', () => {
      const badge = createBadge({ unlockedAt: undefined });
      vi.mocked(amasClient.getBadgeProgress).mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(screen.getByTestId('circle-notch-icon')).toBeInTheDocument();
    });

    it('should show fallback message when progress load fails', async () => {
      const badge = createBadge({ unlockedAt: undefined });
      vi.mocked(amasClient.getBadgeProgress).mockRejectedValue(new Error('Network error'));

      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('继续学习以解锁此徽章')).toBeInTheDocument();
      });
    });
  });

  // ==================== User Interaction Tests ====================
  describe('user interaction', () => {
    it('should call onClose when close button is clicked', async () => {
      const badge = createBadge();
      const user = userEvent.setup();
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      // Get all buttons with '关闭' name (there are two: X button and text button)
      const closeButtons = screen.getAllByRole('button', { name: /关闭/ });
      // Click the text button (last one)
      await user.click(closeButtons[closeButtons.length - 1]);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when X button is clicked', async () => {
      const badge = createBadge();
      const user = userEvent.setup();
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      // Find the X button by aria-label
      await user.click(screen.getByLabelText('关闭'));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when backdrop is clicked', async () => {
      const badge = createBadge();
      const user = userEvent.setup();
      const { container } = render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      // Click on the backdrop (the outermost div)
      const backdrop = container.querySelector('.fixed.inset-0');
      if (backdrop) {
        await user.click(backdrop);
      }

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should not close when clicking inside modal content', async () => {
      const badge = createBadge();
      const user = userEvent.setup();
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      // Click on the badge name (inside modal)
      await user.click(screen.getByText(badge.name));

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  // ==================== Tier Stars Tests ====================
  describe('tier stars', () => {
    it('should show correct number of filled stars for tier 1', () => {
      const badge = createBadge({ tier: 1, unlockedAt: '2024-01-15T10:30:00Z' });
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      const stars = screen.getAllByTestId('star-icon');
      const filledStars = stars.filter((star) => star.getAttribute('data-weight') === 'fill');
      expect(filledStars.length).toBe(1);
    });

    it('should show correct number of filled stars for tier 5', () => {
      const badge = createBadge({ tier: 5, unlockedAt: '2024-01-15T10:30:00Z' });
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      const stars = screen.getAllByTestId('star-icon');
      const filledStars = stars.filter((star) => star.getAttribute('data-weight') === 'fill');
      expect(filledStars.length).toBe(5);
    });

    it('should show gray stars for locked badge', () => {
      const badge = createBadge({ tier: 3, unlockedAt: undefined });
      vi.mocked(amasClient.getBadgeProgress).mockResolvedValue({
        badgeId: 'badge-1',
        currentValue: 0,
        targetValue: 100,
        percentage: 0,
      });

      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      const stars = screen.getAllByTestId('star-icon');
      // All 5 stars should exist
      expect(stars.length).toBe(5);
      // For locked badge, all stars should be gray (#d1d5db)
      stars.forEach((star) => {
        expect(star.getAttribute('data-color')).toBe('#d1d5db');
      });
    });
  });

  // ==================== Category Color Tests ====================
  describe('category colors', () => {
    it('should apply orange color scheme for STREAK category', () => {
      const badge = createBadge({ category: 'STREAK', unlockedAt: '2024-01-15T10:30:00Z' });
      const { container } = render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(container.querySelector('.bg-orange-100')).toBeInTheDocument();
    });

    it('should apply green color scheme for ACCURACY category', () => {
      const badge = createBadge({ category: 'ACCURACY', unlockedAt: '2024-01-15T10:30:00Z' });
      const { container } = render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(container.querySelector('.bg-green-100')).toBeInTheDocument();
    });

    it('should apply purple color scheme for COGNITIVE category', () => {
      const badge = createBadge({ category: 'COGNITIVE', unlockedAt: '2024-01-15T10:30:00Z' });
      const { container } = render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(container.querySelector('.bg-purple-100')).toBeInTheDocument();
    });

    it('should apply blue color scheme for MILESTONE category', () => {
      const badge = createBadge({ category: 'MILESTONE', unlockedAt: '2024-01-15T10:30:00Z' });
      const { container } = render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(container.querySelector('.bg-blue-100')).toBeInTheDocument();
    });

    it('should apply gray color for locked badge icon', () => {
      const badge = createBadge({ unlockedAt: undefined });
      vi.mocked(amasClient.getBadgeProgress).mockResolvedValue({
        badgeId: 'badge-1',
        currentValue: 0,
        targetValue: 100,
        percentage: 0,
      });

      const { container } = render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(container.querySelector('.bg-gray-200')).toBeInTheDocument();
    });
  });

  // ==================== Props Update Tests ====================
  describe('props update', () => {
    it('should reload progress when badge id changes', async () => {
      const badge1 = createBadge({ id: 'badge-1', unlockedAt: undefined });
      const badge2 = createBadge({ id: 'badge-2', unlockedAt: undefined });

      vi.mocked(amasClient.getBadgeProgress).mockResolvedValue({
        badgeId: 'badge-1',
        currentValue: 50,
        targetValue: 100,
        percentage: 50,
      });

      const { rerender } = render(<BadgeDetailModal badge={badge1} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(amasClient.getBadgeProgress).toHaveBeenCalledWith('badge-1');
      });

      vi.mocked(amasClient.getBadgeProgress).mockResolvedValue({
        badgeId: 'badge-2',
        currentValue: 25,
        targetValue: 100,
        percentage: 25,
      });

      rerender(<BadgeDetailModal badge={badge2} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(amasClient.getBadgeProgress).toHaveBeenCalledWith('badge-2');
      });
    });

    it('should update display when badge name changes', () => {
      const badge1 = createBadge({ name: '初级学者' });
      const badge2 = createBadge({ name: '高级学者' });

      const { rerender } = render(<BadgeDetailModal badge={badge1} onClose={mockOnClose} />);

      expect(screen.getByText('初级学者')).toBeInTheDocument();

      rerender(<BadgeDetailModal badge={badge2} onClose={mockOnClose} />);

      expect(screen.getByText('高级学者')).toBeInTheDocument();
      expect(screen.queryByText('初级学者')).not.toBeInTheDocument();
    });
  });

  // ==================== Accessibility Tests ====================
  describe('accessibility', () => {
    it('should have accessible close button with aria-label', () => {
      const badge = createBadge();
      render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      expect(screen.getByLabelText('关闭')).toBeInTheDocument();
    });

    it('should have modal structure', () => {
      const badge = createBadge();
      const { container } = render(<BadgeDetailModal badge={badge} onClose={mockOnClose} />);

      // Should have backdrop
      expect(container.querySelector('.fixed.inset-0')).toBeInTheDocument();
      // Should have modal content
      expect(container.querySelector('.bg-white.rounded-3xl')).toBeInTheDocument();
    });
  });
});
