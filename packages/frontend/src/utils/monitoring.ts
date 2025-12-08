/**
 * 前端监控系统
 *
 * 提供错误边界、性能追踪、用户行为追踪等监控功能
 * 集成 Sentry 实现完整的错误监控和性能分析
 */

import * as React from 'react';
import * as Sentry from '@sentry/react';
import { env } from '../config/env';

// ============================================
// 类型定义
// ============================================

/** 性能指标类型 */
export interface PerformanceMetrics {
  /** 首次内容绘制时间 (FCP) */
  fcp?: number;
  /** 最大内容绘制时间 (LCP) */
  lcp?: number;
  /** 首次输入延迟 (FID) */
  fid?: number;
  /** 累计布局偏移 (CLS) */
  cls?: number;
  /** 交互到下一次绘制时间 (INP) */
  inp?: number;
  /** 首字节时间 (TTFB) */
  ttfb?: number;
}

/** 用户行为事件 */
export interface UserBehaviorEvent {
  /** 事件类型 */
  type: 'click' | 'navigation' | 'form_submit' | 'search' | 'error' | 'custom';
  /** 事件名称 */
  name: string;
  /** 事件数据 */
  data?: Record<string, unknown>;
  /** 时间戳 */
  timestamp: number;
}

/** 错误边界回退组件属性 */
export interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
  eventId?: string;
}

// ============================================
// 性能追踪
// ============================================

/**
 * Web Vitals 性能指标收集器
 * 使用 Performance Observer API 收集核心 Web Vitals 指标
 */
class PerformanceTracker {
  private metrics: PerformanceMetrics = {};
  private observers: PerformanceObserver[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      this.initObservers();
    }
  }

  /**
   * 初始化性能观察器
   */
  private initObservers(): void {
    // LCP 观察器
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
        this.metrics.lcp = lastEntry?.startTime;
        this.reportMetric('lcp', this.metrics.lcp);
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      this.observers.push(lcpObserver);
    } catch (e) {
      // LCP 不支持
    }

    // FID 观察器
    try {
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const firstEntry = entries[0] as PerformanceEntry & {
          processingStart: number;
          startTime: number;
        };
        if (firstEntry) {
          this.metrics.fid = firstEntry.processingStart - firstEntry.startTime;
          this.reportMetric('fid', this.metrics.fid);
        }
      });
      fidObserver.observe({ type: 'first-input', buffered: true });
      this.observers.push(fidObserver);
    } catch (e) {
      // FID 不支持
    }

    // CLS 观察器
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutShift = entry as PerformanceEntry & {
            hadRecentInput: boolean;
            value: number;
          };
          if (!layoutShift.hadRecentInput) {
            clsValue += layoutShift.value;
          }
        }
        this.metrics.cls = clsValue;
        this.reportMetric('cls', this.metrics.cls);
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
      this.observers.push(clsObserver);
    } catch (e) {
      // CLS 不支持
    }

    // FCP 观察器
    try {
      const fcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const fcpEntry = entries.find(
          (e) => e.name === 'first-contentful-paint',
        ) as PerformanceEntry & { startTime: number };
        if (fcpEntry) {
          this.metrics.fcp = fcpEntry.startTime;
          this.reportMetric('fcp', this.metrics.fcp);
        }
      });
      fcpObserver.observe({ type: 'paint', buffered: true });
      this.observers.push(fcpObserver);
    } catch (e) {
      // FCP 不支持
    }

    // 收集 TTFB
    if (window.performance && window.performance.timing) {
      const timing = window.performance.timing;
      this.metrics.ttfb = timing.responseStart - timing.requestStart;
      this.reportMetric('ttfb', this.metrics.ttfb);
    }
  }

  /**
   * 上报单个指标到 Sentry
   */
  private reportMetric(name: string, value: number | undefined): void {
    if (value === undefined) return;

    Sentry.setMeasurement(`web_vitals.${name}`, value, 'millisecond');

    // 添加面包屑
    Sentry.addBreadcrumb({
      category: 'performance',
      message: `Web Vital: ${name.toUpperCase()}`,
      level: 'info',
      data: { value, unit: 'ms' },
    });
  }

  /**
   * 获取当前所有指标
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * 清理观察器
   */
  disconnect(): void {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];
  }
}

// 全局性能追踪器实例
let performanceTracker: PerformanceTracker | null = null;

/**
 * 初始化性能追踪
 */
export function initPerformanceTracking(): void {
  if (!performanceTracker) {
    performanceTracker = new PerformanceTracker();
  }
}

/**
 * 获取性能指标
 */
export function getPerformanceMetrics(): PerformanceMetrics {
  return performanceTracker?.getMetrics() ?? {};
}

// ============================================
// 用户行为追踪
// ============================================

/**
 * 用户行为追踪器
 * 记录用户交互行为，用于分析和错误重现
 */
class UserBehaviorTracker {
  private events: UserBehaviorEvent[] = [];
  private maxEvents = 100;
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initAutoTracking();
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 初始化自动追踪
   */
  private initAutoTracking(): void {
    if (typeof window === 'undefined') return;

    // 点击追踪
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName?.toLowerCase();
      const id = target.id;
      const className = target.className;
      const text = target.textContent?.slice(0, 50);

      this.track({
        type: 'click',
        name: `click_${tagName}`,
        data: {
          tagName,
          id: id || undefined,
          className: typeof className === 'string' ? className.slice(0, 100) : undefined,
          text: text || undefined,
          path: this.getElementPath(target),
        },
      });
    });

    // 页面导航追踪
    window.addEventListener('popstate', () => {
      this.track({
        type: 'navigation',
        name: 'browser_back_forward',
        data: { url: window.location.href },
      });
    });

    // 表单提交追踪
    document.addEventListener('submit', (e) => {
      const form = e.target as HTMLFormElement;
      this.track({
        type: 'form_submit',
        name: `form_submit_${form.id || form.name || 'unknown'}`,
        data: {
          formId: form.id || undefined,
          formName: form.name || undefined,
          action: form.action || undefined,
        },
      });
    });

    // 错误追踪
    window.addEventListener('error', (e) => {
      this.track({
        type: 'error',
        name: 'window_error',
        data: {
          message: e.message,
          filename: e.filename,
          lineno: e.lineno,
          colno: e.colno,
        },
      });
    });

    // Promise 拒绝追踪
    window.addEventListener('unhandledrejection', (e) => {
      this.track({
        type: 'error',
        name: 'unhandled_rejection',
        data: {
          reason: String(e.reason),
        },
      });
    });
  }

  /**
   * 获取元素路径
   */
  private getElementPath(element: HTMLElement): string {
    const path: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current !== document.body && path.length < 5) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += `#${current.id}`;
      } else if (current.className && typeof current.className === 'string') {
        selector += `.${current.className.split(' ')[0]}`;
      }
      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  /**
   * 记录用户行为事件
   */
  track(event: Omit<UserBehaviorEvent, 'timestamp'>): void {
    const fullEvent: UserBehaviorEvent = {
      ...event,
      timestamp: Date.now(),
    };

    this.events.push(fullEvent);

    // 限制事件数量
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // 添加 Sentry 面包屑
    Sentry.addBreadcrumb({
      category: 'user_behavior',
      message: event.name,
      level: 'info',
      data: event.data,
    });
  }

  /**
   * 记录自定义事件
   */
  trackCustom(name: string, data?: Record<string, unknown>): void {
    this.track({
      type: 'custom',
      name,
      data,
    });
  }

  /**
   * 记录页面导航
   */
  trackNavigation(from: string, to: string): void {
    this.track({
      type: 'navigation',
      name: 'page_navigation',
      data: { from, to },
    });
  }

  /**
   * 记录搜索行为
   */
  trackSearch(query: string, resultsCount?: number): void {
    this.track({
      type: 'search',
      name: 'search_query',
      data: {
        query: query.slice(0, 100),
        resultsCount,
      },
    });
  }

  /**
   * 获取所有记录的事件
   */
  getEvents(): UserBehaviorEvent[] {
    return [...this.events];
  }

  /**
   * 获取会话 ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * 清除事件记录
   */
  clear(): void {
    this.events = [];
  }
}

// 全局用户行为追踪器实例
let behaviorTracker: UserBehaviorTracker | null = null;

/**
 * 初始化用户行为追踪
 */
export function initBehaviorTracking(): void {
  if (!behaviorTracker) {
    behaviorTracker = new UserBehaviorTracker();
  }
}

/**
 * 获取用户行为追踪器
 */
export function getBehaviorTracker(): UserBehaviorTracker | null {
  return behaviorTracker;
}

/**
 * 追踪自定义事件
 */
export function trackEvent(name: string, data?: Record<string, unknown>): void {
  behaviorTracker?.trackCustom(name, data);
}

/**
 * 追踪页面导航
 */
export function trackNavigation(from: string, to: string): void {
  behaviorTracker?.trackNavigation(from, to);
}

/**
 * 追踪搜索行为
 */
export function trackSearch(query: string, resultsCount?: number): void {
  behaviorTracker?.trackSearch(query, resultsCount);
}

// ============================================
// 错误边界组件
// ============================================

/**
 * 默认错误回退组件
 */
export const DefaultErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  resetError,
  eventId,
}) => {
  return React.createElement(
    'div',
    {
      style: {
        padding: '40px',
        textAlign: 'center' as const,
        backgroundColor: '#fff3f3',
        borderRadius: '8px',
        margin: '20px',
      },
    },
    React.createElement(
      'h2',
      {
        style: {
          color: '#d32f2f',
          marginBottom: '16px',
        },
      },
      '页面出现错误',
    ),
    React.createElement(
      'p',
      {
        style: {
          color: '#666',
          marginBottom: '8px',
        },
      },
      '抱歉，页面加载时发生了错误。',
    ),
    React.createElement(
      'p',
      {
        style: {
          color: '#999',
          fontSize: '12px',
          marginBottom: '16px',
        },
      },
      `错误信息: ${error.message}`,
    ),
    eventId &&
      React.createElement(
        'p',
        {
          style: {
            color: '#999',
            fontSize: '12px',
            marginBottom: '16px',
          },
        },
        `错误 ID: ${eventId}`,
      ),
    React.createElement(
      'button',
      {
        onClick: resetError,
        style: {
          padding: '10px 24px',
          backgroundColor: '#1976d2',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
        },
      },
      '重试',
    ),
  );
};

/**
 * 创建错误边界包装器
 * 使用 Sentry.ErrorBoundary 并添加额外的错误处理逻辑
 */
export function createErrorBoundary(
  fallback?: React.ComponentType<ErrorFallbackProps>,
): React.ComponentType<{ children: React.ReactNode }> {
  const FallbackComponent = fallback || DefaultErrorFallback;

  return function ErrorBoundaryWrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      Sentry.ErrorBoundary,
      {
        fallback: ({
          error,
          eventId,
          resetError,
        }: {
          error: unknown;
          componentStack: string;
          eventId: string;
          resetError: () => void;
        }) =>
          React.createElement(FallbackComponent, {
            error: error instanceof Error ? error : new Error(String(error)),
            eventId: eventId ?? undefined,
            resetError,
          }),
        onError: (error: unknown, componentStack: string, eventId: string) => {
          // 记录额外的组件堆栈信息
          Sentry.setContext('component_stack', {
            stack: componentStack,
          });

          // 添加用户行为历史
          if (behaviorTracker) {
            Sentry.setContext('user_behavior', {
              sessionId: behaviorTracker.getSessionId(),
              recentEvents: behaviorTracker.getEvents().slice(-20),
            });
          }

          // 添加性能指标
          if (performanceTracker) {
            const metrics = performanceTracker.getMetrics();
            Sentry.setContext('performance', {
              fcp: metrics.fcp,
              lcp: metrics.lcp,
              fid: metrics.fid,
              cls: metrics.cls,
              inp: metrics.inp,
              ttfb: metrics.ttfb,
            });
          }

          console.error('Error Boundary caught error:', error);
          console.error('Component Stack:', componentStack);
        },
        beforeCapture: (scope: Sentry.Scope) => {
          scope.setTag('error_boundary', 'true');
          scope.setLevel('error');
        },
      },
      children,
    );
  };
}

/**
 * 导出 Sentry 错误边界组件
 */
export const ErrorBoundary = Sentry.ErrorBoundary;

// ============================================
// 自定义 Hooks
// ============================================

/**
 * 性能追踪 Hook
 * 用于追踪组件渲染性能
 */
export function usePerformanceTrace(componentName: string): void {
  React.useEffect(() => {
    const startTime = performance.now();

    return () => {
      const duration = performance.now() - startTime;
      Sentry.addBreadcrumb({
        category: 'component_lifecycle',
        message: `Component unmounted: ${componentName}`,
        level: 'info',
        data: { duration: `${duration.toFixed(2)}ms` },
      });
    };
  }, [componentName]);
}

/**
 * 错误追踪 Hook
 * 用于追踪异步操作错误
 */
export function useErrorTracking() {
  const trackError = React.useCallback(
    (error: Error | unknown, context?: Record<string, unknown>) => {
      Sentry.captureException(error, {
        extra: context,
      });
    },
    [],
  );

  return { trackError };
}

// ============================================
// 监控初始化
// ============================================

/**
 * 初始化所有监控功能
 */
export function initMonitoring(): void {
  // 初始化性能追踪
  initPerformanceTracking();

  // 初始化用户行为追踪
  initBehaviorTracking();

  // 设置会话上下文
  if (behaviorTracker) {
    Sentry.setContext('session', {
      sessionId: behaviorTracker.getSessionId(),
      startTime: new Date().toISOString(),
      userAgent: navigator.userAgent,
      screenSize: `${window.innerWidth}x${window.innerHeight}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }

  console.info('[Monitoring] 前端监控系统已初始化');
}

/**
 * 清理监控资源
 */
export function cleanupMonitoring(): void {
  performanceTracker?.disconnect();
  performanceTracker = null;
  behaviorTracker?.clear();
  behaviorTracker = null;
}

// ============================================
// 导出
// ============================================

export { PerformanceTracker, UserBehaviorTracker };
