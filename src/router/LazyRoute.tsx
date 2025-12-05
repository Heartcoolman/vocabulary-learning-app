import { Suspense, lazy, ComponentType } from 'react';

/**
 * 页面加载组件
 */
export const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
  </div>
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LazyImportFn = () => Promise<{ default: ComponentType<any> }>;

/**
 * LazyRoute 配置类型
 */
export interface LazyRouteConfig {
  /** 懒加载导入函数 */
  importFn: LazyImportFn;
  /** 自定义加载组件 */
  fallback?: React.ReactNode;
}

/**
 * 创建懒加载路由元素
 *
 * @param importFn - 懒加载导入函数
 * @param fallback - 可选的自定义加载组件
 * @returns 包装了 Suspense 的懒加载组件
 */
export function createLazyElement(
  importFn: LazyImportFn,
  fallback: React.ReactNode = <PageLoader />
): React.ReactNode {
  const LazyComponent = lazy(importFn);
  return (
    <Suspense fallback={fallback}>
      <LazyComponent />
    </Suspense>
  );
}

/**
 * LazyRoute 组件 - 简化懒加载路由配置
 */
interface LazyRouteProps {
  /** 懒加载导入函数 */
  importFn: LazyImportFn;
  /** 自定义加载组件 */
  fallback?: React.ReactNode;
}

export function LazyRoute({ importFn, fallback = <PageLoader /> }: LazyRouteProps) {
  const LazyComponent = lazy(importFn);
  return (
    <Suspense fallback={fallback}>
      <LazyComponent />
    </Suspense>
  );
}

export default LazyRoute;
