/**
 * MasteryProgress Component Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MasteryProgress from '../MasteryProgress';

describe('MasteryProgress', () => {
  const defaultProgress = {
    masteredCount: 10,
    targetCount: 20,
    totalQuestions: 35,
    activeCount: 5,
    pendingCount: 5,
  };

  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render progress title', () => {
      render(<MasteryProgress progress={defaultProgress} />);

      expect(screen.getByText('学习进度')).toBeInTheDocument();
    });

    it('should render mastered count', () => {
      render(<MasteryProgress progress={defaultProgress} />);

      // 组件分开显示 masteredCount 和 targetCount
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('20')).toBeInTheDocument();
    });

    it('should render total questions', () => {
      render(<MasteryProgress progress={defaultProgress} />);

      // 组件分开显示数字和单位
      expect(screen.getByText('35')).toBeInTheDocument();
      expect(screen.getByText('题')).toBeInTheDocument();
    });

    it('should calculate percentage correctly', () => {
      render(<MasteryProgress progress={defaultProgress} />);

      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('should render progress bar with correct value', () => {
      render(<MasteryProgress progress={defaultProgress} />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '10');
      expect(progressBar).toHaveAttribute('aria-valuemax', '20');
    });
  });

  // ==================== Progress Calculation Tests ====================

  describe('progress calculation', () => {
    it('should show 0% when no progress', () => {
      render(<MasteryProgress progress={{ ...defaultProgress, masteredCount: 0 }} />);

      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('should show 100% when completed', () => {
      render(<MasteryProgress progress={{ ...defaultProgress, masteredCount: 20 }} />);

      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('should handle zero target count', () => {
      render(<MasteryProgress progress={{ ...defaultProgress, targetCount: 0 }} />);

      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('should cap percentage at 100', () => {
      render(
        <MasteryProgress progress={{ ...defaultProgress, masteredCount: 25, targetCount: 20 }} />,
      );

      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  // ==================== Word Status Tests ====================

  describe('word status', () => {
    it('should show new word status', () => {
      render(<MasteryProgress progress={defaultProgress} currentWordStatus="new" />);

      expect(screen.getByText('新词')).toBeInTheDocument();
    });

    it('should show learning status', () => {
      render(<MasteryProgress progress={defaultProgress} currentWordStatus="learning" />);

      expect(screen.getByText('学习中')).toBeInTheDocument();
    });

    it('should show almost mastered status', () => {
      render(<MasteryProgress progress={defaultProgress} currentWordStatus="almost" />);

      expect(screen.getByText('即将掌握')).toBeInTheDocument();
    });

    it('should show mastered status', () => {
      render(<MasteryProgress progress={defaultProgress} currentWordStatus="mastered" />);

      expect(screen.getByText('已掌握')).toBeInTheDocument();
    });

    it('should not show status when not provided', () => {
      render(<MasteryProgress progress={defaultProgress} />);

      expect(screen.queryByText('新词')).not.toBeInTheDocument();
      expect(screen.queryByText('学习中')).not.toBeInTheDocument();
    });
  });

  // ==================== Completion Tests ====================

  describe('completion state', () => {
    it('should show completion title when completed', () => {
      render(<MasteryProgress progress={defaultProgress} isCompleted={true} />);

      expect(screen.getByText('目标达成')).toBeInTheDocument();
    });

    it('should show completion badge when completed', () => {
      render(<MasteryProgress progress={defaultProgress} isCompleted={true} />);

      expect(screen.getByText('完成')).toBeInTheDocument();
    });

    it('should not show word status when completed', () => {
      render(
        <MasteryProgress
          progress={defaultProgress}
          currentWordStatus="learning"
          isCompleted={true}
        />,
      );

      expect(screen.queryByText('学习中')).not.toBeInTheDocument();
    });

    it('should use green color when completed', () => {
      render(<MasteryProgress progress={defaultProgress} isCompleted={true} />);

      // 完成时图标背景变绿色，百分比颜色保持 text-gray-500
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar.className).toContain('from-green-400');
    });
  });

  // ==================== Accessibility Tests ====================

  describe('accessibility', () => {
    it('should have proper region role', () => {
      render(<MasteryProgress progress={defaultProgress} />);

      expect(screen.getByRole('region', { name: '掌握模式学习进度' })).toBeInTheDocument();
    });

    it('should have accessible progress bar values', () => {
      render(<MasteryProgress progress={defaultProgress} />);

      const progressBar = screen.getByRole('progressbar');
      // 组件使用 aria-valuenow/aria-valuemax 而非 aria-label
      expect(progressBar).toHaveAttribute('aria-valuenow', '10');
      expect(progressBar).toHaveAttribute('aria-valuemax', '20');
    });

    it('should have proper aria-valuemin on progress bar', () => {
      render(<MasteryProgress progress={defaultProgress} />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    });
  });

  // ==================== Custom Class Tests ====================

  describe('custom styling', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <MasteryProgress progress={defaultProgress} className="custom-class" />,
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });
});
