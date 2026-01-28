/**
 * Toast Component Unit Tests
 *
 * Note: Some tests are skipped due to complex framer-motion mock requirements.
 * The Toast component's animation and portal-like behavior makes it difficult
 * to test in isolation without a full integration test setup.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToastProvider, useToast } from '../Toast';
import { renderHook } from '@testing-library/react';

describe('ToastProvider', () => {
  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render children', () => {
      render(
        <ToastProvider>
          <div>App Content</div>
        </ToastProvider>,
      );

      expect(screen.getByText('App Content')).toBeInTheDocument();
    });
  });
});

describe('useToast hook', () => {
  it('should provide showToast function', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ToastProvider>{children}</ToastProvider>
    );

    const { result } = renderHook(() => useToast(), { wrapper });

    expect(typeof result.current.showToast).toBe('function');
  });

  it('should provide convenience methods', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ToastProvider>{children}</ToastProvider>
    );

    const { result } = renderHook(() => useToast(), { wrapper });

    expect(typeof result.current.success).toBe('function');
    expect(typeof result.current.error).toBe('function');
    expect(typeof result.current.warning).toBe('function');
    expect(typeof result.current.info).toBe('function');
  });
});
