import { lazy, Suspense } from 'react';
import { AppRoute } from './types';
import { PageLoader } from './components';

// 懒加载 - AMAS 公开展示页面（About）
const SystemStatusPage = lazy(() => import('../pages/about/SystemStatusPage'));

// 六个设计方案
const AboutGlassStack = lazy(() => import('../pages/about/AboutGlassStack'));
const AboutNeuralHub = lazy(() => import('../pages/about/AboutNeuralHub'));
const AboutPipeline = lazy(() => import('../pages/about/AboutPipeline'));
const AboutCascade = lazy(() => import('../pages/about/AboutCascade'));
const AboutLens = lazy(() => import('../pages/about/AboutLens'));
const AboutRibbon = lazy(() => import('../pages/about/AboutRibbon'));

// 实时数据流可视化
const AboutDataFlow = lazy(() => import('../pages/about/AboutDataFlow'));

const LazyWrapper = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<PageLoader />}>{children}</Suspense>
);

/**
 * About 页面路由配置
 * 公开访问的 AMAS 展示页面
 */
export const aboutRoutes: AppRoute[] = [
  // 系统状态（独立页面）
  {
    path: '/system-status',
    element: (
      <LazyWrapper>
        <SystemStatusPage />
      </LazyWrapper>
    ),
    meta: { title: '系统状态', requireAuth: false },
  },
  // 六个设计方案（独立页面）
  {
    path: '/about/v1',
    element: (
      <LazyWrapper>
        <AboutGlassStack />
      </LazyWrapper>
    ),
    meta: { title: '方案一：玻璃卡片堆叠', requireAuth: false },
  },
  {
    path: '/about/v2',
    element: (
      <LazyWrapper>
        <AboutNeuralHub />
      </LazyWrapper>
    ),
    meta: { title: '方案二：神经中枢', requireAuth: false },
  },
  {
    path: '/about/v3',
    element: (
      <LazyWrapper>
        <AboutPipeline />
      </LazyWrapper>
    ),
    meta: { title: '方案三：动态流水线', requireAuth: false },
  },
  {
    path: '/about/v4',
    element: (
      <LazyWrapper>
        <AboutCascade />
      </LazyWrapper>
    ),
    meta: { title: '方案四：斜轴级联', requireAuth: false },
  },
  {
    path: '/about/v5',
    element: (
      <LazyWrapper>
        <AboutLens />
      </LazyWrapper>
    ),
    meta: { title: '方案五：四象限透镜', requireAuth: false },
  },
  {
    path: '/about/v6',
    element: (
      <LazyWrapper>
        <AboutRibbon />
      </LazyWrapper>
    ),
    meta: { title: '方案六：电路丝带', requireAuth: false },
  },
  // About 主页（数据流可视化）
  {
    path: '/about',
    element: (
      <LazyWrapper>
        <AboutDataFlow />
      </LazyWrapper>
    ),
    meta: { title: 'AMAS 数据流可视化', requireAuth: false },
  },
];
