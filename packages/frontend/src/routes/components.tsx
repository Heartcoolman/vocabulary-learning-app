import { Suspense, ReactNode, lazy, ComponentType } from 'react';
import { PageSkeleton } from '../components/skeletons/PageSkeleton';

export const PageLoader = () => <PageSkeleton />;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = any;

// eslint-disable-next-line react-refresh/only-export-components
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

// eslint-disable-next-line react-refresh/only-export-components
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
