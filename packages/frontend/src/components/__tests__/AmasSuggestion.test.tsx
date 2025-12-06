/**
 * AmasSuggestion Component Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AmasSuggestion from '../AmasSuggestion';
import { AmasProcessResult } from '../../types/amas';

// Mock Icon components
vi.mock('../Icon', () => ({
  Coffee: () => <span data-testid="coffee-icon">Coffee</span>,
  Lightbulb: () => <span data-testid="lightbulb-icon">Lightbulb</span>,
  PushPin: () => <span data-testid="pushpin-icon">PushPin</span>,
}));

describe('AmasSuggestion', () => {
  const mockOnBreak = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== Null/Empty State Tests ====================

  describe('null/empty states', () => {
    it('should return null when result is null', () => {
      const { container } = render(<AmasSuggestion result={null} />);
      expect(container.firstChild).toBeNull();
    });

    it('should return null when result has no content', () => {
      const result: AmasProcessResult = {
        explanation: '',
        suggestion: '',
        shouldBreak: false,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      const { container } = render(<AmasSuggestion result={result} />);
      expect(container.firstChild).toBeNull();
    });
  });

  // ==================== AI Suggestion Display ====================

  describe('AI suggestion display', () => {
    it('should display AI suggestion title', () => {
      const result: AmasProcessResult = {
        explanation: 'Test explanation',
        suggestion: '',
        shouldBreak: false,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      render(<AmasSuggestion result={result} />);

      expect(screen.getByText('AI建议')).toBeInTheDocument();
    });

    it('should display lightbulb icon for AI suggestion', () => {
      const result: AmasProcessResult = {
        explanation: 'Test explanation',
        suggestion: '',
        shouldBreak: false,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      render(<AmasSuggestion result={result} />);

      expect(screen.getByTestId('lightbulb-icon')).toBeInTheDocument();
    });

    it('should display explanation text', () => {
      const result: AmasProcessResult = {
        explanation: 'This is a test explanation',
        suggestion: '',
        shouldBreak: false,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      render(<AmasSuggestion result={result} />);

      expect(screen.getByText('This is a test explanation')).toBeInTheDocument();
    });

    it('should display suggestion text', () => {
      const result: AmasProcessResult = {
        explanation: '',
        suggestion: 'This is a test suggestion',
        shouldBreak: false,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      render(<AmasSuggestion result={result} />);

      expect(screen.getByText('This is a test suggestion')).toBeInTheDocument();
    });

    it('should display pushpin icon for suggestion', () => {
      const result: AmasProcessResult = {
        explanation: '',
        suggestion: 'Test suggestion',
        shouldBreak: false,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      render(<AmasSuggestion result={result} />);

      expect(screen.getByTestId('pushpin-icon')).toBeInTheDocument();
    });
  });

  // ==================== Break Suggestion Tests ====================

  describe('break suggestion', () => {
    it('should display break suggestion title', () => {
      const result: AmasProcessResult = {
        explanation: 'You need a break',
        suggestion: '',
        shouldBreak: true,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      render(<AmasSuggestion result={result} onBreak={mockOnBreak} />);

      expect(screen.getByText('休息建议')).toBeInTheDocument();
    });

    it('should display coffee icon for break suggestion', () => {
      const result: AmasProcessResult = {
        explanation: 'You need a break',
        suggestion: '',
        shouldBreak: true,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      render(<AmasSuggestion result={result} onBreak={mockOnBreak} />);

      expect(screen.getByTestId('coffee-icon')).toBeInTheDocument();
    });

    it('should display break button when shouldBreak is true', () => {
      const result: AmasProcessResult = {
        explanation: 'You need a break',
        suggestion: '',
        shouldBreak: true,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      render(<AmasSuggestion result={result} onBreak={mockOnBreak} />);

      expect(screen.getByText('好的，休息一下')).toBeInTheDocument();
    });

    it('should call onBreak when break button is clicked', () => {
      const result: AmasProcessResult = {
        explanation: 'You need a break',
        suggestion: '',
        shouldBreak: true,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      render(<AmasSuggestion result={result} onBreak={mockOnBreak} />);

      const breakButton = screen.getByText('好的，休息一下');
      fireEvent.click(breakButton);

      expect(mockOnBreak).toHaveBeenCalledTimes(1);
    });

    it('should not display break button when onBreak is not provided', () => {
      const result: AmasProcessResult = {
        explanation: 'You need a break',
        suggestion: '',
        shouldBreak: true,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      render(<AmasSuggestion result={result} />);

      expect(screen.queryByText('好的，休息一下')).not.toBeInTheDocument();
    });
  });

  // ==================== Strategy Display Tests ====================

  describe('strategy display', () => {
    it('should display strategy parameters', () => {
      const result: AmasProcessResult = {
        explanation: 'Test',
        suggestion: '',
        shouldBreak: false,
        strategy: {
          batch_size: 15,
          difficulty: 'easy',
          new_ratio: 0.5,
          hint_level: 2,
        },
      };
      render(<AmasSuggestion result={result} />);

      expect(screen.getByText('批量:')).toBeInTheDocument();
      expect(screen.getByText('15')).toBeInTheDocument();
      expect(screen.getByText('难度:')).toBeInTheDocument();
      expect(screen.getByText('简单')).toBeInTheDocument();
      expect(screen.getByText('新词:')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(screen.getByText('提示:')).toBeInTheDocument();
      expect(screen.getByText('多')).toBeInTheDocument();
    });

    it('should display difficulty as 简单 for easy', () => {
      const result: AmasProcessResult = {
        explanation: 'Test',
        suggestion: '',
        shouldBreak: false,
        strategy: {
          batch_size: 10,
          difficulty: 'easy',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      render(<AmasSuggestion result={result} />);

      expect(screen.getByText('简单')).toBeInTheDocument();
    });

    it('should display difficulty as 中等 for mid', () => {
      const result: AmasProcessResult = {
        explanation: 'Test',
        suggestion: '',
        shouldBreak: false,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      render(<AmasSuggestion result={result} />);

      expect(screen.getByText('中等')).toBeInTheDocument();
    });

    it('should display difficulty as 困难 for hard', () => {
      const result: AmasProcessResult = {
        explanation: 'Test',
        suggestion: '',
        shouldBreak: false,
        strategy: {
          batch_size: 10,
          difficulty: 'hard',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      render(<AmasSuggestion result={result} />);

      expect(screen.getByText('困难')).toBeInTheDocument();
    });

    it('should display hint level as 无 for 0', () => {
      const result: AmasProcessResult = {
        explanation: 'Test',
        suggestion: '',
        shouldBreak: false,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 0,
        },
      };
      render(<AmasSuggestion result={result} />);

      expect(screen.getByText('无')).toBeInTheDocument();
    });

    it('should display hint level as 少 for 1', () => {
      const result: AmasProcessResult = {
        explanation: 'Test',
        suggestion: '',
        shouldBreak: false,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      render(<AmasSuggestion result={result} />);

      expect(screen.getByText('少')).toBeInTheDocument();
    });

    it('should display hint level as 多 for 2', () => {
      const result: AmasProcessResult = {
        explanation: 'Test',
        suggestion: '',
        shouldBreak: false,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 2,
        },
      };
      render(<AmasSuggestion result={result} />);

      expect(screen.getByText('多')).toBeInTheDocument();
    });
  });

  // ==================== Accessibility Tests ====================

  describe('accessibility', () => {
    it('should have role alert', () => {
      const result: AmasProcessResult = {
        explanation: 'Test',
        suggestion: '',
        shouldBreak: false,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      render(<AmasSuggestion result={result} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should have aria-live polite', () => {
      const result: AmasProcessResult = {
        explanation: 'Test',
        suggestion: '',
        shouldBreak: false,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      render(<AmasSuggestion result={result} />);

      expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite');
    });

    it('should have aria-label on break button', () => {
      const result: AmasProcessResult = {
        explanation: 'Test',
        suggestion: '',
        shouldBreak: true,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      render(<AmasSuggestion result={result} onBreak={mockOnBreak} />);

      expect(screen.getByRole('button')).toHaveAttribute('aria-label', '休息一下');
    });
  });

  // ==================== Styling Tests ====================

  describe('styling', () => {
    it('should have orange styling for break suggestion', () => {
      const result: AmasProcessResult = {
        explanation: 'Test',
        suggestion: '',
        shouldBreak: true,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      render(<AmasSuggestion result={result} />);

      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('bg-orange');
    });

    it('should have blue styling for AI suggestion', () => {
      const result: AmasProcessResult = {
        explanation: 'Test',
        suggestion: '',
        shouldBreak: false,
        strategy: {
          batch_size: 10,
          difficulty: 'mid',
          new_ratio: 0.3,
          hint_level: 1,
        },
      };
      render(<AmasSuggestion result={result} />);

      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('bg-blue');
    });
  });
});
