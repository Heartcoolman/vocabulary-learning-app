/**
 * useDialogPauseTracking Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDialogPauseTracking, useDialogPauseTrackingWithStates } from '../useDialogPauseTracking';

// Mock TrackingService
vi.mock('../../services/TrackingService', () => ({
  trackingService: {
    trackLearningPause: vi.fn(),
    trackLearningResume: vi.fn(),
  },
}));

import { trackingService } from '../../services/TrackingService';

describe('useDialogPauseTracking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should start with zero paused time', () => {
      const { result } = renderHook(() => useDialogPauseTracking());
      expect(result.current.pausedTime).toBe(0);
    });

    it('should start with dialog closed', () => {
      const { result } = renderHook(() => useDialogPauseTracking());
      expect(result.current.isDialogOpen).toBe(false);
    });

    it('should return zero from getPausedTime initially', () => {
      const { result } = renderHook(() => useDialogPauseTracking());
      expect(result.current.getPausedTime()).toBe(0);
    });
  });

  describe('dialog open/close tracking', () => {
    it('should track time when dialog opens and closes', () => {
      const { result } = renderHook(() => useDialogPauseTracking());

      act(() => {
        result.current.onDialogOpen();
      });

      expect(result.current.isDialogOpen).toBe(true);

      // Advance time by 3 seconds
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      act(() => {
        result.current.onDialogClose();
      });

      expect(result.current.isDialogOpen).toBe(false);
      expect(result.current.pausedTime).toBe(3000);
    });

    it('should accumulate paused time across multiple dialog sessions', () => {
      const { result } = renderHook(() => useDialogPauseTracking());

      // First dialog session: 2 seconds
      act(() => {
        result.current.onDialogOpen();
      });
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      act(() => {
        result.current.onDialogClose();
      });

      expect(result.current.pausedTime).toBe(2000);

      // Second dialog session: 3 seconds
      act(() => {
        result.current.onDialogOpen();
      });
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      act(() => {
        result.current.onDialogClose();
      });

      expect(result.current.pausedTime).toBe(5000);
    });

    it('should not double-count when onDialogOpen is called multiple times', () => {
      const { result } = renderHook(() => useDialogPauseTracking());

      act(() => {
        result.current.onDialogOpen();
      });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      // Call onDialogOpen again - should be ignored
      act(() => {
        result.current.onDialogOpen();
      });
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      act(() => {
        result.current.onDialogClose();
      });

      // Total should be 3 seconds, not more
      expect(result.current.pausedTime).toBe(3000);
    });

    it('should ignore onDialogClose when no dialog is open', () => {
      const { result } = renderHook(() => useDialogPauseTracking());

      act(() => {
        result.current.onDialogClose();
      });

      expect(result.current.pausedTime).toBe(0);
      expect(result.current.isDialogOpen).toBe(false);
    });
  });

  describe('getPausedTime', () => {
    it('should include current open dialog time in getPausedTime', () => {
      const { result } = renderHook(() => useDialogPauseTracking());

      act(() => {
        result.current.onDialogOpen();
      });

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Dialog is still open, getPausedTime should include current time
      expect(result.current.getPausedTime()).toBe(2000);
      // But pausedTime state should still be 0
      expect(result.current.pausedTime).toBe(0);
    });

    it('should return correct value after dialog closes', () => {
      const { result } = renderHook(() => useDialogPauseTracking());

      act(() => {
        result.current.onDialogOpen();
      });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      act(() => {
        result.current.onDialogClose();
      });

      expect(result.current.getPausedTime()).toBe(5000);
      expect(result.current.pausedTime).toBe(5000);
    });
  });

  describe('resetPausedTime', () => {
    it('should reset paused time to zero', () => {
      const { result } = renderHook(() => useDialogPauseTracking());

      act(() => {
        result.current.onDialogOpen();
      });
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      act(() => {
        result.current.onDialogClose();
      });

      expect(result.current.pausedTime).toBe(3000);

      act(() => {
        result.current.resetPausedTime();
      });

      expect(result.current.pausedTime).toBe(0);
    });
  });

  describe('tracking service integration', () => {
    it('should call trackLearningPause when dialog opens', () => {
      const { result } = renderHook(() => useDialogPauseTracking());

      act(() => {
        result.current.onDialogOpen();
      });

      expect(trackingService.trackLearningPause).toHaveBeenCalledWith('dialog_opened');
    });

    it('should call trackLearningResume when dialog closes', () => {
      const { result } = renderHook(() => useDialogPauseTracking());

      act(() => {
        result.current.onDialogOpen();
      });
      act(() => {
        result.current.onDialogClose();
      });

      expect(trackingService.trackLearningResume).toHaveBeenCalledWith('dialog_closed');
    });

    it('should use custom reason when provided', () => {
      const { result } = renderHook(() => useDialogPauseTracking());

      act(() => {
        result.current.onDialogOpen('status_modal');
      });
      act(() => {
        result.current.onDialogClose('status_modal');
      });

      expect(trackingService.trackLearningPause).toHaveBeenCalledWith('status_modal');
      expect(trackingService.trackLearningResume).toHaveBeenCalledWith('status_modal');
    });

    it('should not track when enableTracking is false', () => {
      const { result } = renderHook(() =>
        useDialogPauseTracking({ enableTracking: false })
      );

      act(() => {
        result.current.onDialogOpen();
      });
      act(() => {
        result.current.onDialogClose();
      });

      expect(trackingService.trackLearningPause).not.toHaveBeenCalled();
      expect(trackingService.trackLearningResume).not.toHaveBeenCalled();
    });
  });

  describe('callback options', () => {
    it('should call onPauseChange when dialog closes', () => {
      const onPauseChange = vi.fn();
      const { result } = renderHook(() =>
        useDialogPauseTracking({ onPauseChange })
      );

      act(() => {
        result.current.onDialogOpen();
      });
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      act(() => {
        result.current.onDialogClose();
      });

      expect(onPauseChange).toHaveBeenCalledWith(2000);
    });
  });

  describe('return values', () => {
    it('should return correct interface properties', () => {
      const { result } = renderHook(() => useDialogPauseTracking());

      expect(result.current).toHaveProperty('pausedTime');
      expect(result.current).toHaveProperty('getPausedTime');
      expect(result.current).toHaveProperty('resetPausedTime');
      expect(result.current).toHaveProperty('onDialogOpen');
      expect(result.current).toHaveProperty('onDialogClose');
      expect(result.current).toHaveProperty('isDialogOpen');

      expect(typeof result.current.pausedTime).toBe('number');
      expect(typeof result.current.getPausedTime).toBe('function');
      expect(typeof result.current.resetPausedTime).toBe('function');
      expect(typeof result.current.onDialogOpen).toBe('function');
      expect(typeof result.current.onDialogClose).toBe('function');
      expect(typeof result.current.isDialogOpen).toBe('boolean');
    });

    it('should return stable function references', () => {
      const { result, rerender } = renderHook(() => useDialogPauseTracking());

      const initialOnDialogOpen = result.current.onDialogOpen;
      const initialOnDialogClose = result.current.onDialogClose;
      const initialResetPausedTime = result.current.resetPausedTime;

      rerender();

      expect(result.current.onDialogOpen).toBe(initialOnDialogOpen);
      expect(result.current.resetPausedTime).toBe(initialResetPausedTime);
      // Note: onDialogClose may change due to pausedTime dependency
    });
  });
});

describe('useDialogPauseTrackingWithStates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should start with zero paused time', () => {
      const { result } = renderHook(() =>
        useDialogPauseTrackingWithStates([false, false])
      );
      expect(result.current.pausedTime).toBe(0);
    });

    it('should start with dialog closed', () => {
      const { result } = renderHook(() =>
        useDialogPauseTrackingWithStates([false, false])
      );
      expect(result.current.isDialogOpen).toBe(false);
    });
  });

  describe('automatic state tracking', () => {
    it('should detect when any dialog opens', () => {
      const { result, rerender } = renderHook(
        ({ states }) => useDialogPauseTrackingWithStates(states),
        { initialProps: { states: [false, false, false] } }
      );

      expect(result.current.isDialogOpen).toBe(false);

      // Open first dialog
      rerender({ states: [true, false, false] });

      expect(result.current.isDialogOpen).toBe(true);
      expect(trackingService.trackLearningPause).toHaveBeenCalledWith('dialog_opened');
    });

    it('should track time when dialog closes', () => {
      const { result, rerender } = renderHook(
        ({ states }) => useDialogPauseTrackingWithStates(states),
        { initialProps: { states: [false, false] } }
      );

      // Open dialog
      rerender({ states: [true, false] });

      // Advance time
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      // Close dialog
      rerender({ states: [false, false] });

      expect(result.current.pausedTime).toBe(3000);
      expect(trackingService.trackLearningResume).toHaveBeenCalledWith('dialog_closed');
    });

    it('should not double-track when switching between dialogs', () => {
      const { result, rerender } = renderHook(
        ({ states }) => useDialogPauseTrackingWithStates(states),
        { initialProps: { states: [false, false] } }
      );

      // Open first dialog
      rerender({ states: [true, false] });

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Switch to second dialog (first closes, second opens)
      rerender({ states: [false, true] });

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // Both are still considered "dialog open" state
      expect(result.current.isDialogOpen).toBe(true);

      // Close all
      rerender({ states: [false, false] });

      // Total paused time should be 3 seconds
      expect(result.current.pausedTime).toBe(3000);
    });

    it('should handle multiple dialogs open simultaneously', () => {
      const { result, rerender } = renderHook(
        ({ states }) => useDialogPauseTrackingWithStates(states),
        { initialProps: { states: [false, false] } }
      );

      // Open both dialogs
      rerender({ states: [true, true] });

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Close first dialog, second still open
      rerender({ states: [false, true] });

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // Close second dialog
      rerender({ states: [false, false] });

      // Total should be 3 seconds
      expect(result.current.pausedTime).toBe(3000);
    });
  });

  describe('getPausedTime', () => {
    it('should include current open dialog time', () => {
      const { result, rerender } = renderHook(
        ({ states }) => useDialogPauseTrackingWithStates(states),
        { initialProps: { states: [false] } }
      );

      rerender({ states: [true] });

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(result.current.getPausedTime()).toBe(2000);
      expect(result.current.pausedTime).toBe(0);
    });
  });

  describe('resetPausedTime', () => {
    it('should reset paused time', () => {
      const { result, rerender } = renderHook(
        ({ states }) => useDialogPauseTrackingWithStates(states),
        { initialProps: { states: [false] } }
      );

      rerender({ states: [true] });
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      rerender({ states: [false] });

      expect(result.current.pausedTime).toBe(3000);

      act(() => {
        result.current.resetPausedTime();
      });

      expect(result.current.pausedTime).toBe(0);
    });
  });

  describe('callback options', () => {
    it('should call onPauseChange when dialog closes', () => {
      const onPauseChange = vi.fn();
      const { rerender } = renderHook(
        ({ states }) => useDialogPauseTrackingWithStates(states, { onPauseChange }),
        { initialProps: { states: [false] } }
      );

      rerender({ states: [true] });
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      rerender({ states: [false] });

      expect(onPauseChange).toHaveBeenCalledWith(2000);
    });
  });

  describe('return values', () => {
    it('should return correct interface properties', () => {
      const { result } = renderHook(() =>
        useDialogPauseTrackingWithStates([false])
      );

      expect(result.current).toHaveProperty('pausedTime');
      expect(result.current).toHaveProperty('getPausedTime');
      expect(result.current).toHaveProperty('resetPausedTime');
      expect(result.current).toHaveProperty('isDialogOpen');

      // Should NOT have onDialogOpen/onDialogClose
      expect(result.current).not.toHaveProperty('onDialogOpen');
      expect(result.current).not.toHaveProperty('onDialogClose');
    });
  });
});
