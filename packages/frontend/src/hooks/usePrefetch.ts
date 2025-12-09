import { useCallback } from 'react';
import { prefetchRoute, prefetchRouteData, prefetchAll } from '../routes/prefetch';

/**
 * usePrefetch - 路由预加载 Hook
 *
 * 提供便捷的预加载方法，可用于任何需要预加载的场景
 *
 * @example
 * ```tsx
 * const { prefetch, prefetchOnHover } = usePrefetch();
 *
 * // 方式 1：直接使用 prefetch
 * <button onClick={() => prefetch('/vocabulary')}>Go</button>
 *
 * // 方式 2：使用展开属性
 * <Link to="/vocabulary" {...prefetchOnHover('/vocabulary')}>词库</Link>
 * ```
 */
export function usePrefetch() {
  /**
   * 预加载指定路由的代码和数据
   */
  const prefetch = useCallback((path: string) => {
    prefetchAll(path);
  }, []);

  /**
   * 仅预加载页面代码（不预取数据）
   */
  const prefetchCode = useCallback((path: string) => {
    prefetchRoute(path);
  }, []);

  /**
   * 仅预取页面数据（不预加载代码）
   */
  const prefetchData = useCallback((path: string) => {
    prefetchRouteData(path);
  }, []);

  /**
   * 返回可展开到元素上的事件处理器
   * 支持鼠标悬停（桌面端）和触摸开始（移动端）
   */
  const prefetchOnHover = useCallback(
    (path: string) => ({
      onMouseEnter: () => prefetch(path),
      onFocus: () => prefetch(path),
      onTouchStart: () => prefetch(path),
    }),
    [prefetch],
  );

  /**
   * 返回仅代码预加载的事件处理器
   */
  const prefetchCodeOnHover = useCallback(
    (path: string) => ({
      onMouseEnter: () => prefetchCode(path),
      onFocus: () => prefetchCode(path),
      onTouchStart: () => prefetchCode(path),
    }),
    [prefetchCode],
  );

  return {
    prefetch,
    prefetchCode,
    prefetchData,
    prefetchOnHover,
    prefetchCodeOnHover,
  };
}

export default usePrefetch;
