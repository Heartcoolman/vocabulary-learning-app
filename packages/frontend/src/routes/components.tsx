import { Suspense, ReactNode, lazy, ComponentType } from 'react';
import { PageSkeleton } from '../components/skeletons/PageSkeleton';

/**
 * 页面加载组件 - 使用骨架屏替代全屏旋转加载器
 * 提供更好的用户体验，让用户感知页面结构正在加载
 */
export const PageLoader = () => <PageSkeleton />;

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
