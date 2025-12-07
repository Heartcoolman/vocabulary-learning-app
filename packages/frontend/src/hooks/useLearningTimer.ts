import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * 学习计时器 Hook
 * 管理单词展示时间、响应时间和停留时间
 */
export interface UseLearningTimerResult {
  /** 响应时间（毫秒）：从显示单词到用户作答的时间 */
  responseTime: number;
  /** 开始计时（显示新单词时调用） */
  startTimers: () => void;
  /** 停止计时（用户作答时调用），返回最终响应时间 */
  stopTimers: () => number;
  /** 获取当前停留时间（毫秒） */
  getDwellTime: () => number;
  /** 重置所有计时器 */
  reset: () => void;
}

export function useLearningTimer(): UseLearningTimerResult {
  const [responseTime, setResponseTime] = useState(0);

  // 使用 ref 存储时间数据，避免频繁重渲染
  const wordDisplayTimeRef = useRef<number>(0);
  const dwellTimeRef = useRef<number>(0);
  const dwellTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * 开始计时器
   * 在显示新单词时调用
   */
  const startTimers = useCallback(() => {
    // 重置状态
    setResponseTime(0);
    dwellTimeRef.current = 0;
    wordDisplayTimeRef.current = Date.now();

    // 清除旧的停留时长计时器
    if (dwellTimerRef.current) {
      clearInterval(dwellTimerRef.current);
    }

    // 启动停留时长计时器（每 250ms 更新一次，降低性能开销）
    dwellTimerRef.current = setInterval(() => {
      dwellTimeRef.current = Date.now() - wordDisplayTimeRef.current;
    }, 250);
  }, []);

  /**
   * 停止计时器
   * 在用户作答时调用，返回最终响应时间
   */
  const stopTimers = useCallback(() => {
    // 停止停留时长计时器
    if (dwellTimerRef.current) {
      clearInterval(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }

    // 计算最终响应时间
    const finalResponseTime = Date.now() - wordDisplayTimeRef.current;
    setResponseTime(finalResponseTime);

    return finalResponseTime;
  }, []);

  /**
   * 获取当前停留时间
   */
  const getDwellTime = useCallback(() => {
    return dwellTimeRef.current;
  }, []);

  /**
   * 重置所有计时器
   */
  const reset = useCallback(() => {
    if (dwellTimerRef.current) {
      clearInterval(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
    setResponseTime(0);
    dwellTimeRef.current = 0;
    wordDisplayTimeRef.current = 0;
  }, []);

  // 组件卸载时清理计时器
  useEffect(() => {
    return () => {
      if (dwellTimerRef.current) {
        clearInterval(dwellTimerRef.current);
      }
    };
  }, []);

  return {
    responseTime,
    startTimers,
    stopTimers,
    getDwellTime,
    reset,
  };
}

export default useLearningTimer;
