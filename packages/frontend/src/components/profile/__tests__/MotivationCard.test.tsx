/**
 * MotivationCard Component Unit Tests
 * 动机追踪卡片组件测试
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MotivationCard } from '../MotivationCard';

// Mock phosphor-icons
vi.mock('@phosphor-icons/react', () => ({
  Fire: ({ className, weight }: { className?: string; weight?: string }) => (
    <span data-testid="fire-icon" className={className} data-weight={weight}>
      🔥
    </span>
  ),
  TrendUp: ({ className }: { className?: string }) => (
    <span data-testid="trend-up-icon" className={className}>
      📈
    </span>
  ),
  TrendDown: ({ className }: { className?: string }) => (
    <span data-testid="trend-down-icon" className={className}>
      📉
    </span>
  ),
  Minus: ({ className, weight }: { className?: string; weight?: string }) => (
    <span data-testid="minus-icon" className={className} data-weight={weight}>
      ➖
    </span>
  ),
  Lightning: ({ className, weight }: { className?: string; weight?: string }) => (
    <span data-testid="lightning-icon" className={className} data-weight={weight}>
      ⚡
    </span>
  ),
  Coffee: ({ className, weight }: { className?: string; weight?: string }) => (
    <span data-testid="coffee-icon" className={className} data-weight={weight}>
      ☕
    </span>
  ),
}));

describe('MotivationCard', () => {
  // ==================== Rendering Tests ====================
  describe('rendering', () => {
    it('should render motivation tracking title', () => {
      render(<MotivationCard streak={5} level={60} trend="stable" />);

      expect(screen.getByText('动机追踪')).toBeInTheDocument();
    });

    it('should render fire icon', () => {
      render(<MotivationCard streak={5} level={60} trend="stable" />);

      expect(screen.getAllByTestId('fire-icon').length).toBeGreaterThan(0);
    });

    it('should render streak label', () => {
      render(<MotivationCard streak={5} level={60} trend="stable" />);

      expect(screen.getByText('当前连胜')).toBeInTheDocument();
    });
  });

  // ==================== Streak Display Tests ====================
  describe('streak display', () => {
    it('should display streak number', () => {
      render(<MotivationCard streak={7} level={60} trend="stable" />);

      expect(screen.getByText('7')).toBeInTheDocument();
    });

    it('should display days unit', () => {
      render(<MotivationCard streak={5} level={60} trend="stable" />);

      expect(screen.getByText('天')).toBeInTheDocument();
    });

    it('should handle zero streak', () => {
      render(<MotivationCard streak={0} level={60} trend="stable" />);

      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('should handle large streak numbers', () => {
      render(<MotivationCard streak={365} level={60} trend="stable" />);

      expect(screen.getByText('365')).toBeInTheDocument();
    });
  });

  // ==================== Trend Display Tests ====================
  describe('trend display', () => {
    it('should show trend up icon and text for upward trend', () => {
      render(<MotivationCard streak={5} level={60} trend="up" />);

      expect(screen.getByTestId('trend-up-icon')).toBeInTheDocument();
      expect(screen.getByText('上升中')).toBeInTheDocument();
    });

    it('should show trend down icon and text for downward trend', () => {
      render(<MotivationCard streak={5} level={60} trend="down" />);

      expect(screen.getByTestId('trend-down-icon')).toBeInTheDocument();
      expect(screen.getByText('需调整')).toBeInTheDocument();
    });

    it('should show minus icon and text for stable trend', () => {
      render(<MotivationCard streak={5} level={60} trend="stable" />);

      expect(screen.getAllByTestId('minus-icon').length).toBeGreaterThan(0);
      expect(screen.getByText('稳定')).toBeInTheDocument();
    });
  });

  // ==================== Level Display Tests ====================
  describe('level display', () => {
    it('should show extreme level label for level >= 80', () => {
      render(<MotivationCard streak={5} level={85} trend="stable" />);

      expect(screen.getByText('极高')).toBeInTheDocument();
      expect(screen.getAllByTestId('fire-icon').length).toBeGreaterThan(0);
    });

    it('should show vigorous level label for level >= 60', () => {
      render(<MotivationCard streak={5} level={65} trend="stable" />);

      expect(screen.getByText('旺盛')).toBeInTheDocument();
      expect(screen.getByTestId('lightning-icon')).toBeInTheDocument();
    });

    it('should show stable level label for level >= 40', () => {
      render(<MotivationCard streak={5} level={45} trend="stable" />);

      expect(screen.getByText('平稳')).toBeInTheDocument();
    });

    it('should show low level label for level < 40', () => {
      render(<MotivationCard streak={5} level={30} trend="stable" />);

      expect(screen.getByText('低迷')).toBeInTheDocument();
      expect(screen.getByTestId('coffee-icon')).toBeInTheDocument();
    });

    it('should show extreme level at boundary (level = 80)', () => {
      render(<MotivationCard streak={5} level={80} trend="stable" />);

      expect(screen.getByText('极高')).toBeInTheDocument();
    });

    it('should show vigorous level at boundary (level = 60)', () => {
      render(<MotivationCard streak={5} level={60} trend="stable" />);

      expect(screen.getByText('旺盛')).toBeInTheDocument();
    });

    it('should show stable level at boundary (level = 40)', () => {
      render(<MotivationCard streak={5} level={40} trend="stable" />);

      expect(screen.getByText('平稳')).toBeInTheDocument();
    });
  });

  // ==================== Progress Bar Tests ====================
  describe('progress bar', () => {
    it('should render progress bar', () => {
      const { container } = render(<MotivationCard streak={5} level={60} trend="stable" />);

      expect(container.querySelector('.bg-gradient-to-r')).toBeInTheDocument();
    });

    it('should render progress bar labels', () => {
      render(<MotivationCard streak={5} level={60} trend="stable" />);

      expect(screen.getByText('低')).toBeInTheDocument();
      expect(screen.getByText('高')).toBeInTheDocument();
    });

    it('should clamp level to minimum 5% width', () => {
      const { container } = render(<MotivationCard streak={5} level={0} trend="stable" />);

      const progressBar = container.querySelector('.bg-gradient-to-r');
      expect(progressBar).toHaveStyle({ width: '5%' });
    });

    it('should clamp level to maximum 100% width', () => {
      const { container } = render(<MotivationCard streak={5} level={150} trend="stable" />);

      const progressBar = container.querySelector('.bg-gradient-to-r');
      expect(progressBar).toHaveStyle({ width: '100%' });
    });

    it('should display correct width for middle level', () => {
      const { container } = render(<MotivationCard streak={5} level={50} trend="stable" />);

      const progressBar = container.querySelector('.bg-gradient-to-r');
      expect(progressBar).toHaveStyle({ width: '50%' });
    });
  });

  // ==================== Edge Cases Tests ====================
  describe('edge cases', () => {
    it('should handle level of 0', () => {
      render(<MotivationCard streak={5} level={0} trend="stable" />);

      expect(screen.getByText('低迷')).toBeInTheDocument();
    });

    it('should handle level of 100', () => {
      render(<MotivationCard streak={5} level={100} trend="stable" />);

      expect(screen.getByText('极高')).toBeInTheDocument();
    });

    it('should handle negative level', () => {
      const { container } = render(<MotivationCard streak={5} level={-10} trend="stable" />);

      // Should clamp to minimum
      const progressBar = container.querySelector('.bg-gradient-to-r');
      expect(progressBar).toHaveStyle({ width: '5%' });
    });

    it('should handle decimal level values', () => {
      render(<MotivationCard streak={5} level={79.9} trend="stable" />);

      // 79.9 < 80, so should show vigorous
      expect(screen.getByText('旺盛')).toBeInTheDocument();
    });
  });

  // ==================== Styling Tests ====================
  describe('styling', () => {
    it('should render card with white background', () => {
      const { container } = render(<MotivationCard streak={5} level={60} trend="stable" />);

      expect(container.querySelector('.bg-white')).toBeInTheDocument();
    });

    it('should render card with rounded corners', () => {
      const { container } = render(<MotivationCard streak={5} level={60} trend="stable" />);

      expect(container.querySelector('.rounded-card')).toBeInTheDocument();
    });

    it('should have hover shadow effect', () => {
      const { container } = render(<MotivationCard streak={5} level={60} trend="stable" />);

      expect(container.querySelector('.hover\\:shadow-elevated')).toBeInTheDocument();
    });

    it('should have orange background blur effect', () => {
      const { container } = render(<MotivationCard streak={5} level={60} trend="stable" />);

      expect(container.querySelector('.bg-orange-500')).toBeInTheDocument();
    });
  });

  // ==================== Props Update Tests ====================
  describe('props update', () => {
    it('should update when streak changes', () => {
      const { rerender } = render(<MotivationCard streak={5} level={60} trend="stable" />);

      expect(screen.getByText('5')).toBeInTheDocument();

      rerender(<MotivationCard streak={10} level={60} trend="stable" />);

      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('should update when level changes', () => {
      const { rerender } = render(<MotivationCard streak={5} level={30} trend="stable" />);

      expect(screen.getByText('低迷')).toBeInTheDocument();

      rerender(<MotivationCard streak={5} level={85} trend="stable" />);

      expect(screen.getByText('极高')).toBeInTheDocument();
    });

    it('should update when trend changes', () => {
      const { rerender } = render(<MotivationCard streak={5} level={60} trend="up" />);

      expect(screen.getByText('上升中')).toBeInTheDocument();

      rerender(<MotivationCard streak={5} level={60} trend="down" />);

      expect(screen.getByText('需调整')).toBeInTheDocument();
    });
  });
});
