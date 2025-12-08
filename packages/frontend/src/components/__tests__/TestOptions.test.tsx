/**
 * TestOptions Component Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TestOptions from '../TestOptions';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, onClick, disabled, ...props }: any) => (
      <button onClick={onClick} disabled={disabled} {...props}>
        {children}
      </button>
    ),
  },
}));

describe('TestOptions', () => {
  const defaultProps = {
    options: ['你好', '再见', '谢谢', '对不起'],
    correctAnswers: ['你好'], // 支持多个正确答案（多义词）
    onSelect: vi.fn(),
    showResult: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render all options', () => {
      render(<TestOptions {...defaultProps} />);

      expect(screen.getByText('你好')).toBeInTheDocument();
      expect(screen.getByText('再见')).toBeInTheDocument();
      expect(screen.getByText('谢谢')).toBeInTheDocument();
      expect(screen.getByText('对不起')).toBeInTheDocument();
    });

    it('should render option numbers', () => {
      render(<TestOptions {...defaultProps} />);

      expect(screen.getByText('1.')).toBeInTheDocument();
      expect(screen.getByText('2.')).toBeInTheDocument();
      expect(screen.getByText('3.')).toBeInTheDocument();
      expect(screen.getByText('4.')).toBeInTheDocument();
    });

    it('should have group role with label', () => {
      render(<TestOptions {...defaultProps} />);

      expect(screen.getByRole('group', { name: '测试选项' })).toBeInTheDocument();
    });
  });

  // ==================== Selection Tests ====================

  describe('selection', () => {
    it('should call onSelect when option clicked', () => {
      const onSelect = vi.fn();
      render(<TestOptions {...defaultProps} onSelect={onSelect} />);

      fireEvent.click(screen.getByText('再见'));

      expect(onSelect).toHaveBeenCalledWith('再见');
    });

    it('should not call onSelect when showResult is true', () => {
      const onSelect = vi.fn();
      render(<TestOptions {...defaultProps} onSelect={onSelect} showResult={true} />);

      fireEvent.click(screen.getByText('再见'));

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('should call onSelect on number key press', () => {
      const onSelect = vi.fn();
      render(<TestOptions {...defaultProps} onSelect={onSelect} />);

      fireEvent.keyDown(window, { key: '2' });

      expect(onSelect).toHaveBeenCalledWith('再见');
    });

    it('should call onSelect for keys 1-4', () => {
      const onSelect = vi.fn();
      render(<TestOptions {...defaultProps} onSelect={onSelect} />);

      fireEvent.keyDown(window, { key: '1' });
      expect(onSelect).toHaveBeenCalledWith('你好');

      fireEvent.keyDown(window, { key: '3' });
      expect(onSelect).toHaveBeenCalledWith('谢谢');

      fireEvent.keyDown(window, { key: '4' });
      expect(onSelect).toHaveBeenCalledWith('对不起');
    });

    it('should not respond to keys when showResult is true', () => {
      const onSelect = vi.fn();
      render(<TestOptions {...defaultProps} onSelect={onSelect} showResult={true} />);

      fireEvent.keyDown(window, { key: '1' });

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('should ignore invalid key numbers', () => {
      const onSelect = vi.fn();
      render(<TestOptions {...defaultProps} onSelect={onSelect} />);

      fireEvent.keyDown(window, { key: '5' });
      fireEvent.keyDown(window, { key: '0' });
      fireEvent.keyDown(window, { key: 'a' });

      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  // ==================== Result Display Tests ====================

  describe('result display', () => {
    it('should highlight correct answer when selected correctly', () => {
      render(<TestOptions {...defaultProps} selectedAnswer="你好" showResult={true} />);

      const correctButton = screen.getByText('你好').closest('button');
      expect(correctButton?.className).toContain('bg-green-500');
    });

    it('should show wrong selection and highlight correct', () => {
      render(<TestOptions {...defaultProps} selectedAnswer="再见" showResult={true} />);

      // Wrong selection should be red
      const wrongButton = screen.getByText('再见').closest('button');
      expect(wrongButton?.className).toContain('bg-red-500');

      // Correct answer should be highlighted
      const correctButton = screen.getByText('你好').closest('button');
      expect(correctButton?.className).toContain('border-green-500');
    });

    it('should disable buttons when showing result', () => {
      render(<TestOptions {...defaultProps} selectedAnswer="你好" showResult={true} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });
  });

  // ==================== Accessibility Tests ====================

  describe('accessibility', () => {
    it('should have proper ARIA labels before selection', () => {
      render(<TestOptions {...defaultProps} />);

      expect(screen.getByLabelText(/选项 1: 你好.*按 1 键选择/)).toBeInTheDocument();
      expect(screen.getByLabelText(/选项 2: 再见.*按 2 键选择/)).toBeInTheDocument();
    });

    it('should have aria-pressed on selected answer', () => {
      render(<TestOptions {...defaultProps} selectedAnswer="你好" showResult={true} />);

      const selectedButton = screen.getByText('你好').closest('button');
      expect(selectedButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('should have descriptive label for correct answer after selection', () => {
      render(<TestOptions {...defaultProps} selectedAnswer="你好" showResult={true} />);

      expect(screen.getByLabelText(/正确答案，你选对了/)).toBeInTheDocument();
    });

    it('should have descriptive label for wrong selection', () => {
      render(<TestOptions {...defaultProps} selectedAnswer="再见" showResult={true} />);

      expect(screen.getByLabelText(/你的选择，答案错误/)).toBeInTheDocument();
    });

    it('should handle Enter key on buttons', () => {
      const onSelect = vi.fn();
      render(<TestOptions {...defaultProps} onSelect={onSelect} />);

      const button = screen.getByText('你好').closest('button')!;
      fireEvent.keyDown(button, { key: 'Enter' });

      expect(onSelect).toHaveBeenCalledWith('你好');
    });

    it('should remove tab focus from buttons when showing result', () => {
      render(<TestOptions {...defaultProps} selectedAnswer="你好" showResult={true} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveAttribute('tabIndex', '-1');
      });
    });
  });
});
