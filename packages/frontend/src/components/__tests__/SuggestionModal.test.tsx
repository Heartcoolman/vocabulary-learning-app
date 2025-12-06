/**
 * SuggestionModal Component Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SuggestionModal from '../SuggestionModal';
import { AmasProcessResult } from '../../types/amas';

// Mock Icon components
vi.mock('../Icon', () => ({
  X: () => <span data-testid="x-icon">X</span>,
  Lightbulb: () => <span data-testid="lightbulb-icon">Lightbulb</span>,
}));

// Mock AmasSuggestion component
vi.mock('../AmasSuggestion', () => ({
  default: ({ result, onBreak }: any) => (
    <div data-testid="amas-suggestion">
      <span>Explanation: {result?.explanation}</span>
      {onBreak && <button onClick={onBreak}>Take Break</button>}
    </div>
  ),
}));

describe('SuggestionModal', () => {
  const mockOnClose = vi.fn();
  const mockOnBreak = vi.fn();

  const mockResult: AmasProcessResult = {
    explanation: 'Test explanation',
    suggestion: 'Test suggestion',
    shouldBreak: false,
    strategy: {
      batch_size: 10,
      difficulty: 'mid',
      new_ratio: 0.3,
      hint_level: 1,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== Visibility Tests ====================

  describe('visibility', () => {
    it('should return null when isOpen is false', () => {
      const { container } = render(
        <SuggestionModal
          isOpen={false}
          onClose={mockOnClose}
          result={mockResult}
          onBreak={mockOnBreak}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it('should return null when result is null', () => {
      const { container } = render(
        <SuggestionModal
          isOpen={true}
          onClose={mockOnClose}
          result={null}
          onBreak={mockOnBreak}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it('should render when isOpen is true and result is provided', () => {
      render(
        <SuggestionModal
          isOpen={true}
          onClose={mockOnClose}
          result={mockResult}
          onBreak={mockOnBreak}
        />
      );
      expect(screen.getByText('AI 学习建议')).toBeInTheDocument();
    });
  });

  // ==================== Content Tests ====================

  describe('content', () => {
    it('should display modal title', () => {
      render(
        <SuggestionModal
          isOpen={true}
          onClose={mockOnClose}
          result={mockResult}
          onBreak={mockOnBreak}
        />
      );
      expect(screen.getByText('AI 学习建议')).toBeInTheDocument();
    });

    it('should display lightbulb icon', () => {
      render(
        <SuggestionModal
          isOpen={true}
          onClose={mockOnClose}
          result={mockResult}
          onBreak={mockOnBreak}
        />
      );
      expect(screen.getByTestId('lightbulb-icon')).toBeInTheDocument();
    });

    it('should render AmasSuggestion component', () => {
      render(
        <SuggestionModal
          isOpen={true}
          onClose={mockOnClose}
          result={mockResult}
          onBreak={mockOnBreak}
        />
      );
      expect(screen.getByTestId('amas-suggestion')).toBeInTheDocument();
    });

    it('should pass result to AmasSuggestion', () => {
      render(
        <SuggestionModal
          isOpen={true}
          onClose={mockOnClose}
          result={mockResult}
          onBreak={mockOnBreak}
        />
      );
      expect(screen.getByText('Explanation: Test explanation')).toBeInTheDocument();
    });

    it('should pass onBreak to AmasSuggestion', () => {
      render(
        <SuggestionModal
          isOpen={true}
          onClose={mockOnClose}
          result={mockResult}
          onBreak={mockOnBreak}
        />
      );

      const breakButton = screen.getByText('Take Break');
      fireEvent.click(breakButton);

      expect(mockOnBreak).toHaveBeenCalledTimes(1);
    });

    it('should have close button in header', () => {
      render(
        <SuggestionModal
          isOpen={true}
          onClose={mockOnClose}
          result={mockResult}
          onBreak={mockOnBreak}
        />
      );
      expect(screen.getByLabelText('关闭')).toBeInTheDocument();
    });

    it('should have "明白了" button in footer', () => {
      render(
        <SuggestionModal
          isOpen={true}
          onClose={mockOnClose}
          result={mockResult}
          onBreak={mockOnBreak}
        />
      );
      expect(screen.getByText('明白了')).toBeInTheDocument();
    });
  });

  // ==================== Interaction Tests ====================

  describe('interactions', () => {
    it('should call onClose when X button is clicked', () => {
      render(
        <SuggestionModal
          isOpen={true}
          onClose={mockOnClose}
          result={mockResult}
          onBreak={mockOnBreak}
        />
      );

      const closeButton = screen.getByLabelText('关闭');
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when "明白了" button is clicked', () => {
      render(
        <SuggestionModal
          isOpen={true}
          onClose={mockOnClose}
          result={mockResult}
          onBreak={mockOnBreak}
        />
      );

      const confirmButton = screen.getByText('明白了');
      fireEvent.click(confirmButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  // ==================== Styling Tests ====================

  describe('styling', () => {
    it('should have backdrop blur', () => {
      render(
        <SuggestionModal
          isOpen={true}
          onClose={mockOnClose}
          result={mockResult}
          onBreak={mockOnBreak}
        />
      );

      const backdrop = screen.getByText('AI 学习建议').closest('.fixed');
      expect(backdrop?.className).toContain('backdrop-blur');
    });

    it('should have rounded modal', () => {
      render(
        <SuggestionModal
          isOpen={true}
          onClose={mockOnClose}
          result={mockResult}
          onBreak={mockOnBreak}
        />
      );

      const modal = screen.getByText('AI 学习建议').closest('.bg-white');
      expect(modal?.className).toContain('rounded');
    });

    it('should have shadow on modal', () => {
      render(
        <SuggestionModal
          isOpen={true}
          onClose={mockOnClose}
          result={mockResult}
          onBreak={mockOnBreak}
        />
      );

      const modal = screen.getByText('AI 学习建议').closest('.bg-white');
      expect(modal?.className).toContain('shadow');
    });

    it('should have animation class', () => {
      render(
        <SuggestionModal
          isOpen={true}
          onClose={mockOnClose}
          result={mockResult}
          onBreak={mockOnBreak}
        />
      );

      const modal = screen.getByText('AI 学习建议').closest('.animate-g3-scale-in');
      expect(modal).toBeInTheDocument();
    });
  });

  // ==================== Layout Tests ====================

  describe('layout', () => {
    it('should have header with border', () => {
      render(
        <SuggestionModal
          isOpen={true}
          onClose={mockOnClose}
          result={mockResult}
          onBreak={mockOnBreak}
        />
      );

      const header = screen.getByText('AI 学习建议').closest('.border-b');
      expect(header).toBeInTheDocument();
    });

    it('should have footer with background', () => {
      render(
        <SuggestionModal
          isOpen={true}
          onClose={mockOnClose}
          result={mockResult}
          onBreak={mockOnBreak}
        />
      );

      const footer = screen.getByText('明白了').closest('.bg-gray-50');
      expect(footer).toBeInTheDocument();
    });

    it('should have max width on modal', () => {
      render(
        <SuggestionModal
          isOpen={true}
          onClose={mockOnClose}
          result={mockResult}
          onBreak={mockOnBreak}
        />
      );

      const modal = screen.getByText('AI 学习建议').closest('.max-w-md');
      expect(modal).toBeInTheDocument();
    });
  });

  // ==================== Icon Color Tests ====================

  describe('icon colors', () => {
    it('should have blue color on lightbulb icon container', () => {
      render(
        <SuggestionModal
          isOpen={true}
          onClose={mockOnClose}
          result={mockResult}
          onBreak={mockOnBreak}
        />
      );

      const iconContainer = screen.getByTestId('lightbulb-icon').closest('.text-blue-600');
      expect(iconContainer).toBeInTheDocument();
    });
  });
});
