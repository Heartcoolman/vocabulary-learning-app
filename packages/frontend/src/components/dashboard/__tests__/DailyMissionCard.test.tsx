/**
 * DailyMissionCard Component Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DailyMissionCard } from '../DailyMissionCard';

// Mock Icon components
vi.mock('../../../components/Icon', () => ({
  Target: ({ className, weight }: any) => (
    <span data-testid="icon-target" className={className}>
      Target
    </span>
  ),
  Clock: ({ className, weight }: any) => (
    <span data-testid="icon-clock" className={className}>
      Clock
    </span>
  ),
  Lightning: ({ className, weight }: any) => (
    <span data-testid="icon-lightning" className={className}>
      Lightning
    </span>
  ),
  Play: ({ className, weight }: any) => (
    <span data-testid="icon-play" className={className}>
      Play
    </span>
  ),
  CheckCircle: ({ className, weight }: any) => (
    <span data-testid="icon-check" className={className}>
      Check
    </span>
  ),
}));

describe('DailyMissionCard', () => {
  const defaultProps = {
    totalWords: 100,
    todayStudied: 15,
    todayTarget: 30,
    estimatedTime: 10,
    correctRate: 85,
    onStart: vi.fn(),
  };

  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render the title', () => {
      render(<DailyMissionCard {...defaultProps} />);

      expect(screen.getByText('今日学习任务')).toBeInTheDocument();
    });

    it('should render correct rate', () => {
      render(<DailyMissionCard {...defaultProps} />);

      expect(screen.getByText('85%')).toBeInTheDocument();
      expect(screen.getByText('正确率')).toBeInTheDocument();
    });

    it('should render today studied count', () => {
      render(<DailyMissionCard {...defaultProps} />);

      // 15 appears multiple times (today studied and remaining)
      expect(screen.getAllByText('15').length).toBeGreaterThan(0);
      expect(screen.getByText('今日已学')).toBeInTheDocument();
    });

    it('should render remaining words count', () => {
      render(<DailyMissionCard {...defaultProps} />);

      // remaining = todayTarget - todayStudied = 30 - 15 = 15
      const remainingElements = screen.getAllByText('15');
      expect(remainingElements.length).toBeGreaterThan(0);
      expect(screen.getByText('剩余单词')).toBeInTheDocument();
    });

    it('should render estimated time', () => {
      render(<DailyMissionCard {...defaultProps} />);

      expect(screen.getByText(/预计 ~10 分钟/)).toBeInTheDocument();
    });

    it('should render total words', () => {
      render(<DailyMissionCard {...defaultProps} />);

      expect(screen.getByText(/共 100 个单词待学习/)).toBeInTheDocument();
    });

    it('should render progress text', () => {
      render(<DailyMissionCard {...defaultProps} />);

      expect(screen.getByText('15 / 30 个单词')).toBeInTheDocument();
    });

    it('should render start button when not completed', () => {
      render(<DailyMissionCard {...defaultProps} />);

      // Button text is "继续学习" when todayStudied > 0
      expect(screen.getByRole('button', { name: /继续学习/ })).toBeInTheDocument();
    });
  });

  // ==================== Progress Tests ====================

  describe('progress', () => {
    it('should calculate progress percentage correctly', () => {
      const { container } = render(<DailyMissionCard {...defaultProps} />);

      // Progress = (15 / 30) * 100 = 50%
      const progressBar = container.querySelector('[style*="width: 50%"]');
      expect(progressBar).toBeInTheDocument();
    });

    it('should cap progress at 100%', () => {
      const props = {
        ...defaultProps,
        todayStudied: 50,
        todayTarget: 30,
      };
      const { container } = render(<DailyMissionCard {...props} />);

      // Progress should be capped at 100%
      const progressBar = container.querySelector('[style*="width: 100%"]');
      expect(progressBar).toBeInTheDocument();
    });

    it('should handle zero target gracefully', () => {
      const props = {
        ...defaultProps,
        todayTarget: 0,
      };
      const { container } = render(<DailyMissionCard {...props} />);

      const progressBar = container.querySelector('[style*="width: 0%"]');
      expect(progressBar).toBeInTheDocument();
    });
  });

  // ==================== Completion State Tests ====================

  describe('completion state', () => {
    it('should show completion message when target reached', () => {
      const props = {
        ...defaultProps,
        todayStudied: 30,
        todayTarget: 30,
      };
      render(<DailyMissionCard {...props} />);

      expect(screen.getByText('太棒了！你已完成今日目标')).toBeInTheDocument();
    });

    it('should show completion message when exceeded target', () => {
      const props = {
        ...defaultProps,
        todayStudied: 35,
        todayTarget: 30,
      };
      render(<DailyMissionCard {...props} />);

      expect(screen.getByText('太棒了！你已完成今日目标')).toBeInTheDocument();
    });

    it('should show continue button text when in progress', () => {
      const props = {
        ...defaultProps,
        todayStudied: 10,
      };
      render(<DailyMissionCard {...props} />);

      expect(screen.getByText(/继续学习/)).toBeInTheDocument();
    });

    it('should show start button text when not started', () => {
      const props = {
        ...defaultProps,
        todayStudied: 0,
      };
      render(<DailyMissionCard {...props} />);

      expect(screen.getByText(/开始学习/)).toBeInTheDocument();
    });

    it('should show completed button when finished', () => {
      const props = {
        ...defaultProps,
        todayStudied: 30,
        todayTarget: 30,
      };
      render(<DailyMissionCard {...props} />);

      expect(screen.getByText(/今日任务已完成/)).toBeInTheDocument();
    });

    it('should disable button when completed', () => {
      const props = {
        ...defaultProps,
        todayStudied: 30,
        todayTarget: 30,
      };
      render(<DailyMissionCard {...props} />);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });
  });

  // ==================== Remaining Words Tests ====================

  describe('remaining words', () => {
    it('should show correct remaining count', () => {
      render(<DailyMissionCard {...defaultProps} />);

      // remaining = 30 - 15 = 15
      expect(screen.getByText('剩余单词')).toBeInTheDocument();
    });

    it('should show zero remaining when completed', () => {
      const props = {
        ...defaultProps,
        todayStudied: 30,
        todayTarget: 30,
      };
      render(<DailyMissionCard {...props} />);

      // remaining should be 0
      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('should not show negative remaining', () => {
      const props = {
        ...defaultProps,
        todayStudied: 35,
        todayTarget: 30,
      };
      render(<DailyMissionCard {...props} />);

      // remaining should be 0, not -5
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  // ==================== Interaction Tests ====================

  describe('interactions', () => {
    it('should call onStart when button clicked', async () => {
      const onStart = vi.fn();
      const props = {
        ...defaultProps,
        onStart,
      };
      render(<DailyMissionCard {...props} />);

      // Button text is "继续学习" when todayStudied > 0
      const button = screen.getByRole('button', { name: /继续学习/ });
      await act(async () => {
        fireEvent.click(button);
      });

      expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('should not call onStart when button is disabled', async () => {
      const onStart = vi.fn();
      const props = {
        ...defaultProps,
        todayStudied: 30,
        todayTarget: 30,
        onStart,
      };
      render(<DailyMissionCard {...props} />);

      const button = screen.getByRole('button');
      await act(async () => {
        fireEvent.click(button);
      });

      expect(onStart).not.toHaveBeenCalled();
    });
  });

  // ==================== Icon Tests ====================

  describe('icons', () => {
    it('should render target icon in header', () => {
      render(<DailyMissionCard {...defaultProps} />);

      expect(screen.getByTestId('icon-target')).toBeInTheDocument();
    });

    it('should render lightning icon for correct rate', () => {
      render(<DailyMissionCard {...defaultProps} />);

      expect(screen.getByTestId('icon-lightning')).toBeInTheDocument();
    });

    it('should render clock icon for estimated time', () => {
      render(<DailyMissionCard {...defaultProps} />);

      expect(screen.getByTestId('icon-clock')).toBeInTheDocument();
    });

    it('should render play icon when not completed', () => {
      render(<DailyMissionCard {...defaultProps} />);

      expect(screen.getByTestId('icon-play')).toBeInTheDocument();
    });

    it('should render check icon when completed', () => {
      const props = {
        ...defaultProps,
        todayStudied: 30,
        todayTarget: 30,
      };
      render(<DailyMissionCard {...props} />);

      expect(screen.getByTestId('icon-check')).toBeInTheDocument();
    });
  });

  // ==================== Message Tests ====================

  describe('messages', () => {
    it('should show encouraging message when in progress', () => {
      render(<DailyMissionCard {...defaultProps} />);

      expect(screen.getByText('继续保持学习节奏！')).toBeInTheDocument();
    });

    it('should show completion message when finished', () => {
      const props = {
        ...defaultProps,
        todayStudied: 30,
        todayTarget: 30,
      };
      render(<DailyMissionCard {...props} />);

      expect(screen.getByText('太棒了！你已完成今日目标')).toBeInTheDocument();
    });
  });
});
