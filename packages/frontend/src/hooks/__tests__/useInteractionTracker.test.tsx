/**
 * useInteractionTracker Hook Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInteractionTracker, InteractionData } from '../useInteractionTracker';

describe('useInteractionTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==================== Initial State Tests ====================

  describe('initial state', () => {
    it('should return empty interaction data on initialization', () => {
      const { result } = renderHook(() => useInteractionTracker());
      const data = result.current.getData();

      expect(data.imageViewCount).toBe(0);
      expect(data.imageZoomCount).toBe(0);
      expect(data.imageLongPressMs).toBe(0);
      expect(data.audioPlayCount).toBe(0);
      expect(data.audioReplayCount).toBe(0);
      expect(data.audioSpeedAdjust).toBe(false);
      expect(data.definitionReadMs).toBe(0);
      expect(data.exampleReadMs).toBe(0);
      expect(data.noteWriteCount).toBe(0);
    });

    it('should return all tracking functions', () => {
      const { result } = renderHook(() => useInteractionTracker());

      expect(typeof result.current.trackImageView).toBe('function');
      expect(typeof result.current.trackImageZoom).toBe('function');
      expect(typeof result.current.trackImageLongPressStart).toBe('function');
      expect(typeof result.current.trackImageLongPressEnd).toBe('function');
      expect(typeof result.current.trackAudioPlay).toBe('function');
      expect(typeof result.current.trackAudioSpeedAdjust).toBe('function');
      expect(typeof result.current.trackReadingStart).toBe('function');
      expect(typeof result.current.trackReadingEnd).toBe('function');
      expect(typeof result.current.trackNote).toBe('function');
      expect(typeof result.current.getData).toBe('function');
      expect(typeof result.current.reset).toBe('function');
    });
  });

  // ==================== Image Tracking Tests ====================

  describe('image tracking', () => {
    it('should increment imageViewCount when trackImageView is called', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackImageView();
      });

      expect(result.current.getData().imageViewCount).toBe(1);
    });

    it('should accumulate multiple image views', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackImageView();
        result.current.trackImageView();
        result.current.trackImageView();
      });

      expect(result.current.getData().imageViewCount).toBe(3);
    });

    it('should increment imageZoomCount when trackImageZoom is called', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackImageZoom();
      });

      expect(result.current.getData().imageZoomCount).toBe(1);
    });

    it('should track image long press duration', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackImageLongPressStart();
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      act(() => {
        result.current.trackImageLongPressEnd();
      });

      expect(result.current.getData().imageLongPressMs).toBe(500);
    });

    it('should accumulate multiple long press durations', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackImageLongPressStart();
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      act(() => {
        result.current.trackImageLongPressEnd();
      });

      act(() => {
        result.current.trackImageLongPressStart();
      });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      act(() => {
        result.current.trackImageLongPressEnd();
      });

      expect(result.current.getData().imageLongPressMs).toBe(500);
    });

    it('should handle long press end without start', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackImageLongPressEnd();
      });

      expect(result.current.getData().imageLongPressMs).toBe(0);
    });
  });

  // ==================== Audio Tracking Tests ====================

  describe('audio tracking', () => {
    it('should increment audioPlayCount when trackAudioPlay is called', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackAudioPlay();
      });

      expect(result.current.getData().audioPlayCount).toBe(1);
    });

    it('should increment both audioPlayCount and audioReplayCount for replay', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackAudioPlay(true);
      });

      const data = result.current.getData();
      expect(data.audioPlayCount).toBe(1);
      expect(data.audioReplayCount).toBe(1);
    });

    it('should track multiple plays and replays correctly', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackAudioPlay(false);
        result.current.trackAudioPlay(true);
        result.current.trackAudioPlay(true);
        result.current.trackAudioPlay(false);
      });

      const data = result.current.getData();
      expect(data.audioPlayCount).toBe(4);
      expect(data.audioReplayCount).toBe(2);
    });

    it('should set audioSpeedAdjust to true when trackAudioSpeedAdjust is called', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackAudioSpeedAdjust();
      });

      expect(result.current.getData().audioSpeedAdjust).toBe(true);
    });

    it('should remain true after multiple speed adjustments', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackAudioSpeedAdjust();
        result.current.trackAudioSpeedAdjust();
      });

      expect(result.current.getData().audioSpeedAdjust).toBe(true);
    });
  });

  // ==================== Reading Tracking Tests ====================

  describe('reading tracking', () => {
    it('should track definition reading duration', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackReadingStart('definition');
      });

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      act(() => {
        result.current.trackReadingEnd();
      });

      expect(result.current.getData().definitionReadMs).toBe(1000);
    });

    it('should track example reading duration', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackReadingStart('example');
      });

      act(() => {
        vi.advanceTimersByTime(800);
      });

      act(() => {
        result.current.trackReadingEnd();
      });

      expect(result.current.getData().exampleReadMs).toBe(800);
    });

    it('should accumulate multiple reading sessions', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackReadingStart('definition');
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      act(() => {
        result.current.trackReadingEnd();
      });

      act(() => {
        result.current.trackReadingStart('definition');
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      act(() => {
        result.current.trackReadingEnd();
      });

      expect(result.current.getData().definitionReadMs).toBe(800);
    });

    it('should handle reading end without start', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackReadingEnd();
      });

      expect(result.current.getData().definitionReadMs).toBe(0);
      expect(result.current.getData().exampleReadMs).toBe(0);
    });

    it('should track different reading types separately', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackReadingStart('definition');
      });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      act(() => {
        result.current.trackReadingEnd();
      });

      act(() => {
        result.current.trackReadingStart('example');
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      act(() => {
        result.current.trackReadingEnd();
      });

      const data = result.current.getData();
      expect(data.definitionReadMs).toBe(1000);
      expect(data.exampleReadMs).toBe(500);
    });
  });

  // ==================== Note Tracking Tests ====================

  describe('note tracking', () => {
    it('should increment noteWriteCount when trackNote is called', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackNote();
      });

      expect(result.current.getData().noteWriteCount).toBe(1);
    });

    it('should accumulate multiple note writes', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackNote();
        result.current.trackNote();
        result.current.trackNote();
      });

      expect(result.current.getData().noteWriteCount).toBe(3);
    });
  });

  // ==================== getData Tests ====================

  describe('getData', () => {
    it('should finalize ongoing long press when getData is called', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackImageLongPressStart();
      });

      act(() => {
        vi.advanceTimersByTime(400);
      });

      const data = result.current.getData();
      expect(data.imageLongPressMs).toBe(400);
    });

    it('should finalize ongoing reading when getData is called', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackReadingStart('definition');
      });

      act(() => {
        vi.advanceTimersByTime(600);
      });

      const data = result.current.getData();
      expect(data.definitionReadMs).toBe(600);
    });

    it('should return a copy of the data', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackImageView();
      });

      const data1 = result.current.getData();
      const data2 = result.current.getData();

      expect(data1).toEqual(data2);
      expect(data1).not.toBe(data2);
    });
  });

  // ==================== Reset Tests ====================

  describe('reset', () => {
    it('should reset all interaction data to initial state', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackImageView();
        result.current.trackImageZoom();
        result.current.trackAudioPlay(true);
        result.current.trackAudioSpeedAdjust();
        result.current.trackNote();
      });

      act(() => {
        result.current.reset();
      });

      const data = result.current.getData();
      expect(data.imageViewCount).toBe(0);
      expect(data.imageZoomCount).toBe(0);
      expect(data.imageLongPressMs).toBe(0);
      expect(data.audioPlayCount).toBe(0);
      expect(data.audioReplayCount).toBe(0);
      expect(data.audioSpeedAdjust).toBe(false);
      expect(data.definitionReadMs).toBe(0);
      expect(data.exampleReadMs).toBe(0);
      expect(data.noteWriteCount).toBe(0);
    });

    it('should clear ongoing long press tracking', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackImageLongPressStart();
      });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      act(() => {
        result.current.reset();
      });

      act(() => {
        vi.advanceTimersByTime(200);
      });

      act(() => {
        result.current.trackImageLongPressEnd();
      });

      expect(result.current.getData().imageLongPressMs).toBe(0);
    });

    it('should clear ongoing reading tracking', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackReadingStart('example');
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      act(() => {
        result.current.reset();
      });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      act(() => {
        result.current.trackReadingEnd();
      });

      expect(result.current.getData().exampleReadMs).toBe(0);
    });
  });

  // ==================== Integration Tests ====================

  describe('integration', () => {
    it('should track a complete learning session', () => {
      const { result } = renderHook(() => useInteractionTracker());

      act(() => {
        result.current.trackImageView();
      });

      act(() => {
        result.current.trackReadingStart('definition');
      });
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      act(() => {
        result.current.trackReadingEnd();
      });

      act(() => {
        result.current.trackAudioPlay();
      });

      act(() => {
        result.current.trackReadingStart('example');
      });
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      act(() => {
        result.current.trackReadingEnd();
      });

      act(() => {
        result.current.trackAudioPlay(true);
      });

      act(() => {
        result.current.trackNote();
      });

      const data = result.current.getData();
      expect(data.imageViewCount).toBe(1);
      expect(data.definitionReadMs).toBe(2000);
      expect(data.exampleReadMs).toBe(1500);
      expect(data.audioPlayCount).toBe(2);
      expect(data.audioReplayCount).toBe(1);
      expect(data.noteWriteCount).toBe(1);
    });

    it('should maintain stable callback references', () => {
      const { result, rerender } = renderHook(() => useInteractionTracker());

      const firstRenderCallbacks = {
        trackImageView: result.current.trackImageView,
        trackAudioPlay: result.current.trackAudioPlay,
        reset: result.current.reset,
      };

      rerender();

      expect(result.current.trackImageView).toBe(firstRenderCallbacks.trackImageView);
      expect(result.current.trackAudioPlay).toBe(firstRenderCallbacks.trackAudioPlay);
      expect(result.current.reset).toBe(firstRenderCallbacks.reset);
    });
  });
});
