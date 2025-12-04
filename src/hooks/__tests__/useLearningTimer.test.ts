/**
 * useLearningTimer Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLearningTimer } from '../useLearningTimer';

describe('useLearningTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should start with zero response time', () => {
      const { result } = renderHook(() => useLearningTimer());
      expect(result.current.responseTime).toBe(0);
    });

    it('should start with zero dwell time', () => {
      const { result } = renderHook(() => useLearningTimer());
      expect(result.current.getDwellTime()).toBe(0);
    });
  });

  describe('timer control', () => {
    it('should start timer and record display time', () => {
      const { result } = renderHook(() => useLearningTimer());

      act(() => {
        result.current.startTimers();
      });

      // 初始响应时间应为 0（因为还没有停止计时）
      expect(result.current.responseTime).toBe(0);
    });

    it('should stop timer and return response time', () => {
      const { result } = renderHook(() => useLearningTimer());

      act(() => {
        result.current.startTimers();
      });

      // 推进时间 3000ms
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      let finalResponseTime: number = 0;
      act(() => {
        finalResponseTime = result.current.stopTimers();
      });

      expect(finalResponseTime).toBe(3000);
      expect(result.current.responseTime).toBe(3000);
    });

    it('should pause timer when stopTimers is called', () => {
      const { result } = renderHook(() => useLearningTimer());

      act(() => {
        result.current.startTimers();
      });

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      act(() => {
        result.current.stopTimers();
      });

      // 停止后再推进时间，停留时间不应再更新
      const dwellTimeAfterStop = result.current.getDwellTime();

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // 停留时间应保持不变
      expect(result.current.getDwellTime()).toBe(dwellTimeAfterStop);
    });

    it('should resume timer when startTimers is called again', () => {
      const { result } = renderHook(() => useLearningTimer());

      // 第一次计时
      act(() => {
        result.current.startTimers();
      });

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      act(() => {
        result.current.stopTimers();
      });

      // 重新开始计时
      act(() => {
        result.current.startTimers();
      });

      // 应该重新从 0 开始
      expect(result.current.responseTime).toBe(0);

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      let newResponseTime: number = 0;
      act(() => {
        newResponseTime = result.current.stopTimers();
      });

      expect(newResponseTime).toBe(2000);
    });

    it('should reset timer and clear all values', () => {
      const { result } = renderHook(() => useLearningTimer());

      act(() => {
        result.current.startTimers();
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      act(() => {
        result.current.stopTimers();
      });

      expect(result.current.responseTime).toBe(5000);

      // 重置计时器
      act(() => {
        result.current.reset();
      });

      expect(result.current.responseTime).toBe(0);
      expect(result.current.getDwellTime()).toBe(0);
    });
  });

  describe('time tracking', () => {
    it('should increment elapsed time while timer is running', () => {
      const { result } = renderHook(() => useLearningTimer());

      act(() => {
        result.current.startTimers();
      });

      // 推进 250ms（停留时间更新间隔）
      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(result.current.getDwellTime()).toBe(250);

      // 再推进 250ms
      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(result.current.getDwellTime()).toBe(500);
    });

    it('should track total session time accurately', () => {
      const { result } = renderHook(() => useLearningTimer());

      act(() => {
        result.current.startTimers();
      });

      // 推进 10 秒
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      let totalTime: number = 0;
      act(() => {
        totalTime = result.current.stopTimers();
      });

      expect(totalTime).toBe(10000);
      expect(result.current.responseTime).toBe(10000);
    });

    it('should update dwell time every 250ms', () => {
      const { result } = renderHook(() => useLearningTimer());

      act(() => {
        result.current.startTimers();
      });

      // 初始停留时间应为 0
      expect(result.current.getDwellTime()).toBe(0);

      // 推进 100ms，不足 250ms，间隔未触发
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(result.current.getDwellTime()).toBe(0);

      // 再推进 150ms，达到 250ms，间隔触发
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(result.current.getDwellTime()).toBe(250);

      // 再推进 500ms，总共 750ms，应触发两次更新
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(result.current.getDwellTime()).toBe(750);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple start calls gracefully', () => {
      const { result } = renderHook(() => useLearningTimer());

      act(() => {
        result.current.startTimers();
      });

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // 再次调用 startTimers，应该重置
      act(() => {
        result.current.startTimers();
      });

      expect(result.current.responseTime).toBe(0);
      expect(result.current.getDwellTime()).toBe(0);

      act(() => {
        vi.advanceTimersByTime(500);
      });

      let responseTime: number = 0;
      act(() => {
        responseTime = result.current.stopTimers();
      });

      expect(responseTime).toBe(500);
    });

    it('should handle stop without start', () => {
      const { result } = renderHook(() => useLearningTimer());

      // 没有 start 就 stop，不应该崩溃
      let responseTime: number = 0;
      act(() => {
        responseTime = result.current.stopTimers();
      });

      // 响应时间应为当前时间（因为 wordDisplayTimeRef.current 为 0）
      expect(typeof responseTime).toBe('number');
    });

    it('should clean up timer on unmount', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      const { result, unmount } = renderHook(() => useLearningTimer());

      act(() => {
        result.current.startTimers();
      });

      unmount();

      // 应该调用 clearInterval 清理计时器
      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });

    it('should handle reset while timer is running', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      const { result } = renderHook(() => useLearningTimer());

      act(() => {
        result.current.startTimers();
      });

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      act(() => {
        result.current.reset();
      });

      // 应该清理间隔计时器
      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(result.current.responseTime).toBe(0);
      expect(result.current.getDwellTime()).toBe(0);

      clearIntervalSpy.mockRestore();
    });
  });

  describe('return values', () => {
    it('should return correct interface properties', () => {
      const { result } = renderHook(() => useLearningTimer());

      expect(result.current).toHaveProperty('responseTime');
      expect(result.current).toHaveProperty('startTimers');
      expect(result.current).toHaveProperty('stopTimers');
      expect(result.current).toHaveProperty('getDwellTime');
      expect(result.current).toHaveProperty('reset');

      expect(typeof result.current.responseTime).toBe('number');
      expect(typeof result.current.startTimers).toBe('function');
      expect(typeof result.current.stopTimers).toBe('function');
      expect(typeof result.current.getDwellTime).toBe('function');
      expect(typeof result.current.reset).toBe('function');
    });

    it('should return stable function references', () => {
      const { result, rerender } = renderHook(() => useLearningTimer());

      const initialStartTimers = result.current.startTimers;
      const initialStopTimers = result.current.stopTimers;
      const initialGetDwellTime = result.current.getDwellTime;
      const initialReset = result.current.reset;

      rerender();

      expect(result.current.startTimers).toBe(initialStartTimers);
      expect(result.current.stopTimers).toBe(initialStopTimers);
      expect(result.current.getDwellTime).toBe(initialGetDwellTime);
      expect(result.current.reset).toBe(initialReset);
    });
  });
});
