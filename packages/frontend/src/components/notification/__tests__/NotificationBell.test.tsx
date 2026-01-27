/**
 * NotificationBell Component Tests
 *
 * Tests C2 constraints:
 * - Zero value: hide badge
 * - Cap: count > 99 shows "99+"
 * - Format: 1-99 shows exact number
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationBell } from '../NotificationBell';

vi.mock('../../Icon', () => ({
  Bell: () => <span data-testid="bell-icon">Bell</span>,
}));

describe('NotificationBell', () => {
  describe('badge visibility (C2)', () => {
    it('should hide badge when count is 0', () => {
      render(<NotificationBell count={0} />);

      expect(screen.getByTestId('bell-icon')).toBeInTheDocument();
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('should show badge when count is greater than 0', () => {
      render(<NotificationBell count={5} />);

      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  describe('badge count display (C2)', () => {
    it('should display exact count for 1-99', () => {
      const { rerender } = render(<NotificationBell count={1} />);
      expect(screen.getByText('1')).toBeInTheDocument();

      rerender(<NotificationBell count={50} />);
      expect(screen.getByText('50')).toBeInTheDocument();

      rerender(<NotificationBell count={99} />);
      expect(screen.getByText('99')).toBeInTheDocument();
    });

    it('should display "99+" when count exceeds 99', () => {
      render(<NotificationBell count={100} />);
      expect(screen.getByText('99+')).toBeInTheDocument();
    });

    it('should display "99+" for large counts', () => {
      render(<NotificationBell count={999} />);
      expect(screen.getByText('99+')).toBeInTheDocument();
    });
  });

  describe('click handling', () => {
    it('should call onClick when clicked', () => {
      const handleClick = vi.fn();
      render(<NotificationBell count={5} onClick={handleClick} />);

      fireEvent.click(screen.getByRole('button'));

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not throw when clicked without onClick handler', () => {
      render(<NotificationBell count={5} />);

      expect(() => {
        fireEvent.click(screen.getByRole('button'));
      }).not.toThrow();
    });
  });

  describe('accessibility', () => {
    it('should have accessible label for notifications', () => {
      render(<NotificationBell count={5} />);

      expect(screen.getByRole('button')).toHaveAttribute('aria-label', '5 条未读通知');
    });

    it('should have accessible label when no notifications', () => {
      render(<NotificationBell count={0} />);

      expect(screen.getByRole('button')).toHaveAttribute('aria-label', '通知');
    });

    it('should have correct aria-label for large counts', () => {
      render(<NotificationBell count={150} />);

      expect(screen.getByRole('button')).toHaveAttribute('aria-label', '150 条未读通知');
    });
  });

  describe('styling', () => {
    it('should apply custom className', () => {
      render(<NotificationBell count={5} className="custom-class" />);

      const button = screen.getByRole('button');
      expect(button.className).toContain('custom-class');
    });
  });
});
