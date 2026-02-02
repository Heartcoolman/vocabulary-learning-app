/**
 * StatusModal Component Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import StatusModal from '../StatusModal';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: ComponentProps<'div'>) => <div {...props}>{children}</div>,
  },
}));

// Mock Icon components
vi.mock('../Icon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../Icon')>();
  return {
    ...actual,
    X: () => <span data-testid="x-icon">X</span>,
    ChartPie: () => <span data-testid="chart-icon">Chart</span>,
  };
});

// Mock animations
vi.mock('../../utils/animations', () => ({
  fadeInVariants: {},
  scaleInVariants: {},
}));

// Mock AmasStatus component
type MockAmasStatusProps = {
  detailed?: boolean;
  refreshTrigger?: number;
};

vi.mock('../AmasStatus', () => ({
  default: ({ detailed, refreshTrigger }: MockAmasStatusProps) => (
    <div data-testid="amas-status" data-detailed={detailed} data-refresh={refreshTrigger}>
      AMAS Status Component
    </div>
  ),
}));

describe('StatusModal', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== Visibility Tests ====================

  describe('visibility', () => {
    it('should return null when isOpen is false', () => {
      const { container } = render(<StatusModal isOpen={false} onClose={mockOnClose} />);
      expect(container.firstChild).toBeNull();
    });

    it('should render when isOpen is true', () => {
      render(<StatusModal isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText('学习状态监控')).toBeInTheDocument();
    });
  });

  // ==================== Content Tests ====================

  describe('content', () => {
    it('should display modal title', () => {
      render(<StatusModal isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText('学习状态监控')).toBeInTheDocument();
    });

    it('should render AmasStatus component', () => {
      render(<StatusModal isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByTestId('amas-status')).toBeInTheDocument();
    });

    it('should pass detailed=true to AmasStatus', () => {
      render(<StatusModal isOpen={true} onClose={mockOnClose} />);
      const amasStatus = screen.getByTestId('amas-status');
      expect(amasStatus).toHaveAttribute('data-detailed', 'true');
    });

    it('should pass refreshTrigger to AmasStatus', () => {
      render(<StatusModal isOpen={true} onClose={mockOnClose} refreshTrigger={5} />);
      const amasStatus = screen.getByTestId('amas-status');
      expect(amasStatus).toHaveAttribute('data-refresh', '5');
    });

    it('should have close button with X icon', () => {
      render(<StatusModal isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByTestId('x-icon')).toBeInTheDocument();
    });

    it('should have footer close button', () => {
      render(<StatusModal isOpen={true} onClose={mockOnClose} />);
      // The footer button has text "关闭", the header button has aria-label "关闭"
      const footerButton = screen.getAllByRole('button').find((btn) => btn.textContent === '关闭');
      expect(footerButton).toBeInTheDocument();
    });
  });

  // ==================== Interaction Tests ====================

  describe('interactions', () => {
    it('should call onClose when footer button is clicked', () => {
      render(<StatusModal isOpen={true} onClose={mockOnClose} />);

      // Get the footer button (the one with text "关闭", not aria-label)
      const footerButton = screen.getAllByRole('button').find((btn) => btn.textContent === '关闭');
      if (footerButton) {
        fireEvent.click(footerButton);
      }

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when header close button is clicked', () => {
      render(<StatusModal isOpen={true} onClose={mockOnClose} />);

      const headerCloseButton = screen.getByLabelText('关闭');
      fireEvent.click(headerCloseButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  // ==================== Accessibility Tests ====================

  describe('accessibility', () => {
    it('should have aria-label on close button', () => {
      render(<StatusModal isOpen={true} onClose={mockOnClose} />);

      const closeButton = screen.getByLabelText('关闭');
      expect(closeButton).toBeInTheDocument();
    });
  });

  // ==================== Default Props Tests ====================

  describe('default props', () => {
    it('should use default refreshTrigger of 0', () => {
      render(<StatusModal isOpen={true} onClose={mockOnClose} />);
      const amasStatus = screen.getByTestId('amas-status');
      expect(amasStatus).toHaveAttribute('data-refresh', '0');
    });
  });

  // ==================== Styling Tests ====================

  describe('styling', () => {
    it('should have modal overlay', () => {
      render(<StatusModal isOpen={true} onClose={mockOnClose} />);

      const overlay = document.body.querySelector('.bg-black\\/50');
      expect(overlay).toBeInTheDocument();
    });

    it('should have rounded modal', () => {
      render(<StatusModal isOpen={true} onClose={mockOnClose} />);

      const modal = screen.getByRole('dialog');
      expect(modal?.className).toContain('rounded');
    });
  });
});
