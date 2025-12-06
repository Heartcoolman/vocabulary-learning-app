/**
 * Modal Component Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Modal, ConfirmModal, AlertModal } from '../Modal';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock Icon component
vi.mock('../../Icon', () => ({
  X: ({ size, weight }: any) => <span data-testid="icon-x">X</span>,
}));

describe('Modal', () => {
  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should not render when isOpen is false', () => {
      render(
        <Modal isOpen={false} onClose={vi.fn()}>
          <div>Modal Content</div>
        </Modal>
      );

      expect(screen.queryByText('Modal Content')).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()}>
          <div>Modal Content</div>
        </Modal>
      );

      expect(screen.getByText('Modal Content')).toBeInTheDocument();
    });

    it('should render title when provided', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Test Title">
          <div>Modal Content</div>
        </Modal>
      );

      expect(screen.getByText('Test Title')).toBeInTheDocument();
    });

    it('should render close button by default', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()}>
          <div>Modal Content</div>
        </Modal>
      );

      expect(screen.getByTestId('icon-x')).toBeInTheDocument();
    });

    it('should hide close button when showCloseButton is false', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} showCloseButton={false}>
          <div>Modal Content</div>
        </Modal>
      );

      expect(screen.queryByTestId('icon-x')).not.toBeInTheDocument();
    });

    it('should render children content', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()}>
          <p>Paragraph content</p>
          <button>Action button</button>
        </Modal>
      );

      expect(screen.getByText('Paragraph content')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Action button' })).toBeInTheDocument();
    });
  });

  // ==================== Width Tests ====================

  describe('max width', () => {
    it('should apply default max width (md)', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()}>
          <div>Content</div>
        </Modal>
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog.classList.contains('max-w-md')).toBe(true);
    });

    it('should apply sm max width', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} maxWidth="sm">
          <div>Content</div>
        </Modal>
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog.classList.contains('max-w-sm')).toBe(true);
    });

    it('should apply lg max width', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} maxWidth="lg">
          <div>Content</div>
        </Modal>
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog.classList.contains('max-w-lg')).toBe(true);
    });

    it('should apply xl max width', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} maxWidth="xl">
          <div>Content</div>
        </Modal>
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog.classList.contains('max-w-xl')).toBe(true);
    });
  });

  // ==================== Interaction Tests ====================

  describe('interactions', () => {
    it('should call onClose when close button clicked', async () => {
      const onClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={onClose}>
          <div>Content</div>
        </Modal>
      );

      const closeButton = screen.getByLabelText('关闭');
      await act(async () => {
        fireEvent.click(closeButton);
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when overlay clicked by default', async () => {
      const onClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={onClose}>
          <div>Content</div>
        </Modal>
      );

      const overlay = document.querySelector('.bg-black\\/50');
      await act(async () => {
        fireEvent.click(overlay!);
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should not call onClose when overlay clicked if closeOnOverlayClick is false', async () => {
      const onClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={onClose} closeOnOverlayClick={false}>
          <div>Content</div>
        </Modal>
      );

      const overlay = document.querySelector('.bg-black\\/50');
      await act(async () => {
        fireEvent.click(overlay!);
      });

      expect(onClose).not.toHaveBeenCalled();
    });

    it('should call onClose when Escape key pressed', async () => {
      const onClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={onClose}>
          <div>Content</div>
        </Modal>
      );

      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ==================== Accessibility Tests ====================

  describe('accessibility', () => {
    it('should have role="dialog"', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()}>
          <div>Content</div>
        </Modal>
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should have aria-modal="true"', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()}>
          <div>Content</div>
        </Modal>
      );

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('should have aria-labelledby when title is provided', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Test Title">
          <div>Content</div>
        </Modal>
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
    });

    it('should not have aria-labelledby when title is not provided', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()}>
          <div>Content</div>
        </Modal>
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).not.toHaveAttribute('aria-labelledby');
    });

    it('should have close button with aria-label', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()}>
          <div>Content</div>
        </Modal>
      );

      expect(screen.getByLabelText('关闭')).toBeInTheDocument();
    });
  });

  // ==================== Body Scroll Tests ====================

  describe('body scroll', () => {
    it('should set body overflow to hidden when open', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()}>
          <div>Content</div>
        </Modal>
      );

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('should reset body overflow when closed', () => {
      const { rerender } = render(
        <Modal isOpen={true} onClose={vi.fn()}>
          <div>Content</div>
        </Modal>
      );

      rerender(
        <Modal isOpen={false} onClose={vi.fn()}>
          <div>Content</div>
        </Modal>
      );

      expect(document.body.style.overflow).toBe('');
    });
  });
});

describe('ConfirmModal', () => {
  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render title', () => {
      render(
        <ConfirmModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          title="Confirm Action"
          message="Are you sure?"
        />
      );

      expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    });

    it('should render message', () => {
      render(
        <ConfirmModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          title="Confirm"
          message="This action cannot be undone."
        />
      );

      expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
    });

    it('should render default button text', () => {
      render(
        <ConfirmModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          title="Confirm"
          message="Message"
        />
      );

      expect(screen.getByRole('button', { name: '确定' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
    });

    it('should render custom button text', () => {
      render(
        <ConfirmModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          title="Confirm"
          message="Message"
          confirmText="Delete"
          cancelText="Keep"
        />
      );

      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
    });
  });

  // ==================== Interaction Tests ====================

  describe('interactions', () => {
    it('should call onConfirm when confirm button clicked', async () => {
      const onConfirm = vi.fn();
      render(
        <ConfirmModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={onConfirm}
          title="Confirm"
          message="Message"
        />
      );

      const confirmButton = screen.getByRole('button', { name: '确定' });
      await act(async () => {
        fireEvent.click(confirmButton);
      });

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when cancel button clicked', async () => {
      const onClose = vi.fn();
      render(
        <ConfirmModal
          isOpen={true}
          onClose={onClose}
          onConfirm={vi.fn()}
          title="Confirm"
          message="Message"
        />
      );

      const cancelButton = screen.getByRole('button', { name: '取消' });
      await act(async () => {
        fireEvent.click(cancelButton);
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ==================== Loading State Tests ====================

  describe('loading state', () => {
    it('should show loading text when isLoading is true', () => {
      render(
        <ConfirmModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          title="Confirm"
          message="Message"
          isLoading={true}
        />
      );

      expect(screen.getByRole('button', { name: '处理中...' })).toBeInTheDocument();
    });

    it('should disable buttons when isLoading is true', () => {
      render(
        <ConfirmModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          title="Confirm"
          message="Message"
          isLoading={true}
        />
      );

      expect(screen.getByRole('button', { name: '处理中...' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    });
  });

  // ==================== Variant Tests ====================

  describe('variants', () => {
    it('should apply danger variant styles', () => {
      render(
        <ConfirmModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          title="Confirm"
          message="Message"
          variant="danger"
        />
      );

      const confirmButton = screen.getByRole('button', { name: '确定' });
      expect(confirmButton.classList.contains('bg-red-500')).toBe(true);
    });

    it('should apply warning variant styles', () => {
      render(
        <ConfirmModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          title="Confirm"
          message="Message"
          variant="warning"
        />
      );

      const confirmButton = screen.getByRole('button', { name: '确定' });
      expect(confirmButton.classList.contains('bg-amber-500')).toBe(true);
    });

    it('should apply info variant styles', () => {
      render(
        <ConfirmModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          title="Confirm"
          message="Message"
          variant="info"
        />
      );

      const confirmButton = screen.getByRole('button', { name: '确定' });
      expect(confirmButton.classList.contains('bg-blue-500')).toBe(true);
    });
  });
});

describe('AlertModal', () => {
  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render title', () => {
      render(
        <AlertModal
          isOpen={true}
          onClose={vi.fn()}
          title="Alert Title"
          message="Alert message"
        />
      );

      expect(screen.getByText('Alert Title')).toBeInTheDocument();
    });

    it('should render message', () => {
      render(
        <AlertModal
          isOpen={true}
          onClose={vi.fn()}
          title="Alert"
          message="This is an alert message."
        />
      );

      expect(screen.getByText('This is an alert message.')).toBeInTheDocument();
    });

    it('should render default button text', () => {
      render(
        <AlertModal
          isOpen={true}
          onClose={vi.fn()}
          title="Alert"
          message="Message"
        />
      );

      expect(screen.getByRole('button', { name: '确定' })).toBeInTheDocument();
    });

    it('should render custom button text', () => {
      render(
        <AlertModal
          isOpen={true}
          onClose={vi.fn()}
          title="Alert"
          message="Message"
          buttonText="Got it"
        />
      );

      expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
    });

    it('should not show close button', () => {
      render(
        <AlertModal
          isOpen={true}
          onClose={vi.fn()}
          title="Alert"
          message="Message"
        />
      );

      expect(screen.queryByLabelText('关闭')).not.toBeInTheDocument();
    });
  });

  // ==================== Interaction Tests ====================

  describe('interactions', () => {
    it('should call onClose when button clicked', async () => {
      const onClose = vi.fn();
      render(
        <AlertModal
          isOpen={true}
          onClose={onClose}
          title="Alert"
          message="Message"
        />
      );

      const button = screen.getByRole('button', { name: '确定' });
      await act(async () => {
        fireEvent.click(button);
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ==================== Variant Tests ====================

  describe('variants', () => {
    it('should apply success variant styles', () => {
      render(
        <AlertModal
          isOpen={true}
          onClose={vi.fn()}
          title="Alert"
          message="Message"
          variant="success"
        />
      );

      const button = screen.getByRole('button', { name: '确定' });
      expect(button.classList.contains('bg-green-500')).toBe(true);
    });

    it('should apply error variant styles', () => {
      render(
        <AlertModal
          isOpen={true}
          onClose={vi.fn()}
          title="Alert"
          message="Message"
          variant="error"
        />
      );

      const button = screen.getByRole('button', { name: '确定' });
      expect(button.classList.contains('bg-red-500')).toBe(true);
    });

    it('should apply warning variant styles', () => {
      render(
        <AlertModal
          isOpen={true}
          onClose={vi.fn()}
          title="Alert"
          message="Message"
          variant="warning"
        />
      );

      const button = screen.getByRole('button', { name: '确定' });
      expect(button.classList.contains('bg-amber-500')).toBe(true);
    });

    it('should apply info variant styles by default', () => {
      render(
        <AlertModal
          isOpen={true}
          onClose={vi.fn()}
          title="Alert"
          message="Message"
        />
      );

      const button = screen.getByRole('button', { name: '确定' });
      expect(button.classList.contains('bg-blue-500')).toBe(true);
    });
  });
});
