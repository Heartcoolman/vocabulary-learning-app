/**
 * RhythmCard Component Unit Tests
 * 用户学习节奏卡片组件测试
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RhythmCard } from '../RhythmCard';

// Mock phosphor-icons
vi.mock('@phosphor-icons/react', () => ({
  Lightning: ({ className }: { className?: string }) => (
    <span data-testid="lightning-icon" className={className}>
      ⚡
    </span>
  ),
  Timer: ({ className }: { className?: string }) => (
    <span data-testid="timer-icon" className={className}>
      ⏱️
    </span>
  ),
  Hourglass: ({ className }: { className?: string }) => (
    <span data-testid="hourglass-icon" className={className}>
      ⏳
    </span>
  ),
}));

describe('RhythmCard', () => {
  // ==================== Fast Type Tests ====================
  describe('fast type', () => {
    it('should render fast type card with correct title', () => {
      render(<RhythmCard type="fast" avgDuration={15} preferredPace={5} />);

      expect(screen.getByText('闪电战型')).toBeInTheDocument();
    });

    it('should display lightning icon for fast type', () => {
      render(<RhythmCard type="fast" avgDuration={15} preferredPace={5} />);

      expect(screen.getByTestId('lightning-icon')).toBeInTheDocument();
    });

    it('should show fast type description', () => {
      render(<RhythmCard type="fast" avgDuration={15} preferredPace={5} />);

      expect(screen.getByText(/偏好短时间、高强度的爆发式学习/)).toBeInTheDocument();
    });
  });

  // ==================== Slow Type Tests ====================
  describe('slow type', () => {
    it('should render slow type card with correct title', () => {
      render(<RhythmCard type="slow" avgDuration={45} preferredPace={2} />);

      expect(screen.getByText('沉浸型')).toBeInTheDocument();
    });

    it('should display hourglass icon for slow type', () => {
      render(<RhythmCard type="slow" avgDuration={45} preferredPace={2} />);

      expect(screen.getByTestId('hourglass-icon')).toBeInTheDocument();
    });

    it('should show slow type description', () => {
      render(<RhythmCard type="slow" avgDuration={45} preferredPace={2} />);

      expect(screen.getByText(/喜欢长时间、深入的专注学习时段/)).toBeInTheDocument();
    });
  });

  // ==================== Mixed Type Tests ====================
  describe('mixed type', () => {
    it('should render mixed type card with correct title', () => {
      render(<RhythmCard type="mixed" avgDuration={30} preferredPace={3} />);

      expect(screen.getByText('混合节奏')).toBeInTheDocument();
    });

    it('should display timer icon for mixed type', () => {
      render(<RhythmCard type="mixed" avgDuration={30} preferredPace={3} />);

      expect(screen.getByTestId('timer-icon')).toBeInTheDocument();
    });

    it('should show mixed type description', () => {
      render(<RhythmCard type="mixed" avgDuration={30} preferredPace={3} />);

      expect(screen.getByText(/根据内容难度灵活调整学习步调/)).toBeInTheDocument();
    });
  });

  // ==================== Duration Display Tests ====================
  describe('duration display', () => {
    it('should display average duration in minutes', () => {
      render(<RhythmCard type="fast" avgDuration={25} preferredPace={4} />);

      expect(screen.getByText('25 分钟')).toBeInTheDocument();
    });

    it('should round average duration correctly', () => {
      render(<RhythmCard type="fast" avgDuration={25.7} preferredPace={4} />);

      expect(screen.getByText('26 分钟')).toBeInTheDocument();
    });

    it('should display duration label', () => {
      render(<RhythmCard type="fast" avgDuration={20} preferredPace={4} />);

      expect(screen.getByText('平均时长')).toBeInTheDocument();
    });

    it('should handle zero duration', () => {
      render(<RhythmCard type="fast" avgDuration={0} preferredPace={4} />);

      expect(screen.getByText('0 分钟')).toBeInTheDocument();
    });
  });

  // ==================== Pace Display Tests ====================
  describe('pace display', () => {
    it('should display learning pace with unit', () => {
      render(<RhythmCard type="fast" avgDuration={20} preferredPace={5} />);

      expect(screen.getByText('5 词/分')).toBeInTheDocument();
    });

    it('should display pace label', () => {
      render(<RhythmCard type="fast" avgDuration={20} preferredPace={5} />);

      expect(screen.getByText('学习配速')).toBeInTheDocument();
    });

    it('should display placeholder for zero pace', () => {
      render(<RhythmCard type="fast" avgDuration={20} preferredPace={0} />);

      expect(screen.getByText('-- 词/分')).toBeInTheDocument();
    });

    it('should display placeholder for negative pace', () => {
      render(<RhythmCard type="fast" avgDuration={20} preferredPace={-1} />);

      expect(screen.getByText('-- 词/分')).toBeInTheDocument();
    });
  });

  // ==================== Edge Cases Tests ====================
  describe('edge cases', () => {
    it('should handle very large duration values', () => {
      render(<RhythmCard type="slow" avgDuration={999} preferredPace={1} />);

      expect(screen.getByText('999 分钟')).toBeInTheDocument();
    });

    it('should handle decimal pace values', () => {
      render(<RhythmCard type="fast" avgDuration={20} preferredPace={3.5} />);

      expect(screen.getByText('3.5 词/分')).toBeInTheDocument();
    });

    it('should handle very small duration values', () => {
      render(<RhythmCard type="fast" avgDuration={0.4} preferredPace={10} />);

      expect(screen.getByText('0 分钟')).toBeInTheDocument();
    });
  });

  // ==================== Styling Tests ====================
  describe('styling', () => {
    it('should render card container with correct base classes', () => {
      const { container } = render(<RhythmCard type="fast" avgDuration={20} preferredPace={5} />);

      expect(container.querySelector('.bg-white')).toBeInTheDocument();
      expect(container.querySelector('.rounded-card')).toBeInTheDocument();
    });

    it('should have hover shadow effect class', () => {
      const { container } = render(<RhythmCard type="fast" avgDuration={20} preferredPace={5} />);

      expect(container.querySelector('.hover\\:shadow-elevated')).toBeInTheDocument();
    });

    it('should apply blue color for fast type pace', () => {
      const { container } = render(<RhythmCard type="fast" avgDuration={20} preferredPace={5} />);

      expect(container.querySelector('.text-blue-500')).toBeInTheDocument();
    });

    it('should apply emerald color for slow type pace', () => {
      const { container } = render(<RhythmCard type="slow" avgDuration={45} preferredPace={2} />);

      expect(container.querySelector('.text-emerald-500')).toBeInTheDocument();
    });

    it('should apply purple color for mixed type pace', () => {
      const { container } = render(<RhythmCard type="mixed" avgDuration={30} preferredPace={3} />);

      expect(container.querySelector('.text-purple-500')).toBeInTheDocument();
    });
  });

  // ==================== Props Update Tests ====================
  describe('props update', () => {
    it('should update when type changes', () => {
      const { rerender } = render(<RhythmCard type="fast" avgDuration={20} preferredPace={5} />);

      expect(screen.getByText('闪电战型')).toBeInTheDocument();

      rerender(<RhythmCard type="slow" avgDuration={45} preferredPace={2} />);

      expect(screen.getByText('沉浸型')).toBeInTheDocument();
      expect(screen.queryByText('闪电战型')).not.toBeInTheDocument();
    });

    it('should update when duration changes', () => {
      const { rerender } = render(<RhythmCard type="fast" avgDuration={20} preferredPace={5} />);

      expect(screen.getByText('20 分钟')).toBeInTheDocument();

      rerender(<RhythmCard type="fast" avgDuration={30} preferredPace={5} />);

      expect(screen.getByText('30 分钟')).toBeInTheDocument();
    });

    it('should update when pace changes', () => {
      const { rerender } = render(<RhythmCard type="fast" avgDuration={20} preferredPace={5} />);

      expect(screen.getByText('5 词/分')).toBeInTheDocument();

      rerender(<RhythmCard type="fast" avgDuration={20} preferredPace={8} />);

      expect(screen.getByText('8 词/分')).toBeInTheDocument();
    });
  });
});
