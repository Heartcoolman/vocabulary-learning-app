import { lazy, Suspense } from 'react';
import { AppRoute } from './types';
import { PageLoader } from './components';

// 懒加载 - AMAS 公开展示页面（About）
const AboutLayout = lazy(() => import('../pages/about/AboutLayout'));
const AboutHomePage = lazy(() => import('../pages/about/AboutHomePage'));
const SimulationPage = lazy(() => import('../pages/about/SimulationPage'));
const DashboardPage = lazy(() => import('../pages/about/DashboardPage'));
const StatsPage = lazy(() => import('../pages/about/StatsPage'));
const SystemStatusPage = lazy(() => import('../pages/about/SystemStatusPage'));

/**
 * 懒加载包装组件
 */
const LazyWrapper = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<PageLoader />}>
    {children}
  </Suspense>
);

/**
 * About 子路由配置
 */
const aboutChildren: AppRoute[] = [
  {
    index: true,
    element: <LazyWrapper><AboutHomePage /></LazyWrapper>,
    meta: { title: '关于AMAS', requireAuth: false }
  },
  {
    path: 'simulation',
    element: <LazyWrapper><SimulationPage /></LazyWrapper>,
    meta: { title: '算法模拟', requireAuth: false }
  },
  {
    path: 'dashboard',
    element: <LazyWrapper><DashboardPage /></LazyWrapper>,
    meta: { title: '仪表盘', requireAuth: false }
  },
  {
    path: 'stats',
    element: <LazyWrapper><StatsPage /></LazyWrapper>,
    meta: { title: '统计', requireAuth: false }
  },
  {
    path: 'system-status',
    element: <LazyWrapper><SystemStatusPage /></LazyWrapper>,
    meta: { title: '系统状态', requireAuth: false }
  },
];

/**
 * About 页面路由配置
 * 公开访问的 AMAS 展示页面
 */
export const aboutRoutes: AppRoute[] = [
  {
    path: '/about',
    element: (
      <LazyWrapper>
        <AboutLayout />
      </LazyWrapper>
    ),
    meta: { title: '关于', requireAuth: false },
    children: aboutChildren
  }
];
