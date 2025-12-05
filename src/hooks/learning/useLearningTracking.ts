import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackingService } from '../../services/TrackingService';

/**
 * 学习页面埋点追踪 Hook
 *
 * 封装学习页面相关的埋点逻辑：
 * - 页面切换埋点
 * - 会话开始/结束埋点
 * - 学习暂停/恢复事件追踪
 */
export interface UseLearningTrackingResult {
  /** 手动触发学习暂停埋点 */
  trackPause: (reason: string) => void;
  /** 手动触发学习恢复埋点 */
  trackResume: (reason: string) => void;
  /** 触发页面切换埋点 */
  trackPageSwitch: (fromPage: string, toPage: string) => void;
  /** 触发交互事件埋点 */
  trackInteraction: (action: string, target: string, metadata?: Record<string, unknown>) => void;
}

export interface UseLearningTrackingOptions {
  /** 页面标识，用于会话开始埋点 */
  page?: string;
  /** 是否启用页面切换追踪 */
  enablePageSwitchTracking?: boolean;
  /** 是否启用会话追踪 */
  enableSessionTracking?: boolean;
}

/**
 * 学习页面埋点追踪 Hook
 *
 * @param options - 配置选项
 * @returns 埋点相关的方法
 *
 * @example
 * ```tsx
 * const { trackPause, trackResume } = useLearningTracking({
 *   page: 'learning',
 *   enablePageSwitchTracking: true,
 *   enableSessionTracking: true,
 * });
 * ```
 */
export function useLearningTracking({
  page = 'learning',
  enablePageSwitchTracking = true,
  enableSessionTracking = true,
}: UseLearningTrackingOptions = {}): UseLearningTrackingResult {
  const location = useLocation();
  const previousPathRef = useRef<string | null>(null);

  // 页面切换埋点
  useEffect(() => {
    if (!enablePageSwitchTracking) return;

    if (previousPathRef.current !== null && previousPathRef.current !== location.pathname) {
      trackingService.trackPageSwitch(previousPathRef.current, location.pathname);
    }
    previousPathRef.current = location.pathname;
  }, [location.pathname, enablePageSwitchTracking]);

  // 会话开始/结束埋点
  useEffect(() => {
    if (!enableSessionTracking) return;

    trackingService.trackSessionStart({ page });

    return () => {
      // 组件卸载时记录会话结束（页面离开）
      trackingService.trackLearningPause('page_leave');
    };
  }, [page, enableSessionTracking]);

  // 手动触发学习暂停埋点
  const trackPause = (reason: string) => {
    trackingService.trackLearningPause(reason);
  };

  // 手动触发学习恢复埋点
  const trackResume = (reason: string) => {
    trackingService.trackLearningResume(reason);
  };

  // 触发页面切换埋点
  const trackPageSwitch = (fromPage: string, toPage: string) => {
    trackingService.trackPageSwitch(fromPage, toPage);
  };

  // 触发交互事件埋点
  const trackInteraction = (action: string, target: string, metadata?: Record<string, unknown>) => {
    trackingService.trackInteraction(action, target, metadata);
  };

  return {
    trackPause,
    trackResume,
    trackPageSwitch,
    trackInteraction,
  };
}

export default useLearningTracking;
