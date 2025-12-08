import { Suspense, ReactNode, lazy, ComponentType } from 'react';

/**
 * 页面加载组件
 */
export const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-blue-500"></div>
  </div>
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = any;

/**
 * 懒加载包装器 - 自动添加 Suspense
 */
export function lazyLoad<T extends ComponentType<AnyProps>>(
  importFn: () => Promise<{ default: T }>,
): ReactNode {
  const LazyComponent = lazy(importFn);
  return (
    <Suspense fallback={<PageLoader />}>
      <LazyComponent {...({} as AnyProps)} />
    </Suspense>
  );
}

/**
 * 创建懒加载组件的工厂函数
 */
export function createLazyComponent<T extends ComponentType<AnyProps>>(
  importFn: () => Promise<{ default: T }>,
) {
  const LazyComponent = lazy(importFn);
  return function LazyWrapper(props: Record<string, unknown>) {
    return (
      <Suspense fallback={<PageLoader />}>
        <LazyComponent {...(props as AnyProps)} />
      </Suspense>
    );
  };
}
