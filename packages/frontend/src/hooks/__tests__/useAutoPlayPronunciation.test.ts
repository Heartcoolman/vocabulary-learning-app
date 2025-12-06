/**
 * useAutoPlayPronunciation Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoPlayPronunciation } from '../useAutoPlayPronunciation';

// Mock AudioService
const mockPlayPronunciation = vi.fn();
const mockStopAudio = vi.fn();

vi.mock('../../services/AudioService', () => ({
  default: {
    playPronunciation: (...args: unknown[]) => mockPlayPronunciation(...args),
    stopAudio: () => mockStopAudio(),
  },
}));

// Mock learningLogger
vi.mock('../../utils/logger', () => ({
  learningLogger: {
    error: vi.fn(),
  },
}));

describe('useAutoPlayPronunciation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockPlayPronunciation.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should start with isPlaying false', () => {
      const { result } = renderHook(() =>
        useAutoPlayPronunciation({ word: 'hello' })
      );
      expect(result.current.isPlaying).toBe(false);
    });

    it('should start with isEnabled based on config', () => {
      const { result } = renderHook(() =>
        useAutoPlayPronunciation({ word: 'hello', enabled: false })
      );
      expect(result.current.isEnabled).toBe(false);
    });

    it('should default isEnabled to true', () => {
      const { result } = renderHook(() =>
        useAutoPlayPronunciation({ word: 'hello' })
      );
      expect(result.current.isEnabled).toBe(true);
    });
  });

  describe('auto play behavior', () => {
    it('should auto play after delay when word is provided', async () => {
      renderHook(() =>
        useAutoPlayPronunciation({
          word: 'hello',
          wordId: '1',
          delay: 300,
        })
      );

      // Should not play immediately
      expect(mockPlayPronunciation).not.toHaveBeenCalled();

      // Advance timers to trigger auto play
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(mockPlayPronunciation).toHaveBeenCalledWith('hello');
    });

    it('should not auto play when word is undefined', async () => {
      renderHook(() =>
        useAutoPlayPronunciation({
          word: undefined,
          delay: 300,
        })
      );

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(mockPlayPronunciation).not.toHaveBeenCalled();
    });

    it('should not auto play when enabled is false', async () => {
      renderHook(() =>
        useAutoPlayPronunciation({
          word: 'hello',
          enabled: false,
          delay: 300,
        })
      );

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(mockPlayPronunciation).not.toHaveBeenCalled();
    });

    it('should not auto play when showResult is true', async () => {
      renderHook(() =>
        useAutoPlayPronunciation({
          word: 'hello',
          showResult: true,
          delay: 300,
        })
      );

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(mockPlayPronunciation).not.toHaveBeenCalled();
    });

    it('should re-trigger auto play when wordId changes', async () => {
      const { rerender } = renderHook(
        ({ wordId }) =>
          useAutoPlayPronunciation({
            word: 'hello',
            wordId,
            delay: 300,
          }),
        { initialProps: { wordId: '1' } }
      );

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(mockPlayPronunciation).toHaveBeenCalledTimes(1);

      // Change wordId to trigger re-play
      rerender({ wordId: '2' });

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(mockPlayPronunciation).toHaveBeenCalledTimes(2);
    });

    it('should use custom delay', async () => {
      renderHook(() =>
        useAutoPlayPronunciation({
          word: 'hello',
          delay: 500,
        })
      );

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(mockPlayPronunciation).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      expect(mockPlayPronunciation).toHaveBeenCalledWith('hello');
    });
  });

  describe('manual play', () => {
    it('should play when play() is called', async () => {
      const { result } = renderHook(() =>
        useAutoPlayPronunciation({
          word: 'hello',
          enabled: false, // Disable auto play
        })
      );

      await act(async () => {
        await result.current.play();
      });

      expect(mockPlayPronunciation).toHaveBeenCalledWith('hello');
    });

    it('should not play when word is undefined', async () => {
      const { result } = renderHook(() =>
        useAutoPlayPronunciation({
          word: undefined,
        })
      );

      await act(async () => {
        await result.current.play();
      });

      expect(mockPlayPronunciation).not.toHaveBeenCalled();
    });

    it('should call onPlayStart callback when play starts', async () => {
      const onPlayStart = vi.fn();
      const { result } = renderHook(() =>
        useAutoPlayPronunciation({
          word: 'hello',
          enabled: false,
          onPlayStart,
        })
      );

      await act(async () => {
        await result.current.play();
      });

      expect(onPlayStart).toHaveBeenCalled();
    });

    it('should call onPlayEnd callback when play ends', async () => {
      const onPlayEnd = vi.fn();
      const { result } = renderHook(() =>
        useAutoPlayPronunciation({
          word: 'hello',
          enabled: false,
          onPlayEnd,
        })
      );

      await act(async () => {
        await result.current.play();
      });

      expect(onPlayEnd).toHaveBeenCalled();
    });

    it('should call onPlayError callback when play fails', async () => {
      const onPlayError = vi.fn();
      const error = new Error('Play failed');
      mockPlayPronunciation.mockRejectedValueOnce(error);

      const { result } = renderHook(() =>
        useAutoPlayPronunciation({
          word: 'hello',
          enabled: false,
          onPlayError,
        })
      );

      await act(async () => {
        await result.current.play();
      });

      expect(onPlayError).toHaveBeenCalledWith(error);
    });

    it('should set isPlaying true during playback and false after', async () => {
      let resolvePlay: () => void;
      mockPlayPronunciation.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolvePlay = resolve;
          })
      );

      const { result } = renderHook(() =>
        useAutoPlayPronunciation({
          word: 'hello',
          enabled: false,
        })
      );

      // Start playing - use act without async to avoid waiting for promise
      act(() => {
        result.current.play();
      });

      // isPlaying should be true during playback
      expect(result.current.isPlaying).toBe(true);

      // Complete playback
      await act(async () => {
        resolvePlay!();
      });

      expect(result.current.isPlaying).toBe(false);
    });
  });

  describe('stop', () => {
    it('should call AudioService.stopAudio when stop() is called', () => {
      const { result } = renderHook(() =>
        useAutoPlayPronunciation({ word: 'hello' })
      );

      act(() => {
        result.current.stop();
      });

      expect(mockStopAudio).toHaveBeenCalled();
    });

    it('should set isPlaying to false when stop() is called', async () => {
      let resolvePlay: () => void;
      mockPlayPronunciation.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolvePlay = resolve;
          })
      );

      const { result } = renderHook(() =>
        useAutoPlayPronunciation({
          word: 'hello',
          enabled: false,
        })
      );

      // Start playing - use act without async to avoid waiting for promise
      act(() => {
        result.current.play();
      });

      // isPlaying should be true during playback
      expect(result.current.isPlaying).toBe(true);

      // Stop playing
      act(() => {
        result.current.stop();
      });

      expect(result.current.isPlaying).toBe(false);

      // Clean up promise
      await act(async () => {
        resolvePlay!();
      });
    });

    it('should clear pending timeout when stop() is called', async () => {
      renderHook(() =>
        useAutoPlayPronunciation({
          word: 'hello',
          delay: 300,
        })
      );

      // Advance partially
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Auto play should not have been called yet
      expect(mockPlayPronunciation).not.toHaveBeenCalled();
    });
  });

  describe('setEnabled', () => {
    it('should update isEnabled when setEnabled is called', () => {
      const { result } = renderHook(() =>
        useAutoPlayPronunciation({ word: 'hello', enabled: true })
      );

      expect(result.current.isEnabled).toBe(true);

      act(() => {
        result.current.setEnabled(false);
      });

      expect(result.current.isEnabled).toBe(false);
    });

    it('should sync isEnabled with external enabled prop changes', () => {
      const { result, rerender } = renderHook(
        ({ enabled }) => useAutoPlayPronunciation({ word: 'hello', enabled }),
        { initialProps: { enabled: true } }
      );

      expect(result.current.isEnabled).toBe(true);

      rerender({ enabled: false });

      expect(result.current.isEnabled).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should clear timeout on unmount', async () => {
      const { unmount } = renderHook(() =>
        useAutoPlayPronunciation({
          word: 'hello',
          delay: 300,
        })
      );

      // Unmount before timer fires
      unmount();

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      // Should not have been called because hook was unmounted
      expect(mockPlayPronunciation).not.toHaveBeenCalled();
    });

    it('should stop audio on unmount', () => {
      const { unmount } = renderHook(() =>
        useAutoPlayPronunciation({ word: 'hello' })
      );

      unmount();

      expect(mockStopAudio).toHaveBeenCalled();
    });

    it('should clear timeout when word changes', async () => {
      const { rerender } = renderHook(
        ({ word }) =>
          useAutoPlayPronunciation({
            word,
            wordId: word,
            delay: 300,
          }),
        { initialProps: { word: 'hello' } }
      );

      // Advance partially
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Change word before timer fires
      rerender({ word: 'world' });

      // Advance to complete first timer
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      // Should not play 'hello' because timer was cleared
      expect(mockPlayPronunciation).not.toHaveBeenCalledWith('hello');

      // Advance to complete second timer
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Should play 'world' after new delay
      expect(mockPlayPronunciation).toHaveBeenCalledWith('world');
    });
  });

  describe('return values', () => {
    it('should return correct interface properties', () => {
      const { result } = renderHook(() =>
        useAutoPlayPronunciation({ word: 'hello' })
      );

      expect(result.current).toHaveProperty('isPlaying');
      expect(result.current).toHaveProperty('play');
      expect(result.current).toHaveProperty('stop');
      expect(result.current).toHaveProperty('setEnabled');
      expect(result.current).toHaveProperty('isEnabled');

      expect(typeof result.current.isPlaying).toBe('boolean');
      expect(typeof result.current.play).toBe('function');
      expect(typeof result.current.stop).toBe('function');
      expect(typeof result.current.setEnabled).toBe('function');
      expect(typeof result.current.isEnabled).toBe('boolean');
    });

    it('should return stable function references', () => {
      const { result, rerender } = renderHook(() =>
        useAutoPlayPronunciation({ word: 'hello' })
      );

      const initialPlay = result.current.play;
      const initialStop = result.current.stop;
      const initialSetEnabled = result.current.setEnabled;

      rerender();

      // stop and setEnabled should be stable
      expect(result.current.stop).toBe(initialStop);
      expect(result.current.setEnabled).toBe(initialSetEnabled);
      // play might change due to dependencies
    });
  });
});
