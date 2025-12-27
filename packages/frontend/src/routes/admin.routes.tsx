import { lazy, Suspense } from 'react';
import { AppRoute } from './types';
import { PageLoader } from './components';
import ProtectedRoute from '../components/ProtectedRoute';

// 懒加载 - 管理员页面
const AdminLayout = lazy(() => import('../pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'));
const UserManagementPage = lazy(() => import('../pages/admin/UserManagementPage'));
const UserDetailPage = lazy(() => import('../pages/admin/UserDetailPage'));
const WordDetailPage = lazy(() => import('../pages/admin/WordDetailPage'));
const AdminWordBooks = lazy(() => import('../pages/admin/AdminWordBooks'));
const BatchImportPage = lazy(() => import('../pages/BatchImportPage'));
const AlgorithmConfigPage = lazy(() => import('../pages/admin/AlgorithmConfigPage'));
const ConfigHistoryPage = lazy(() => import('../pages/admin/ConfigHistoryPage'));
const ExperimentDashboard = lazy(() => import('../pages/admin/ExperimentDashboard'));
const LogViewerPage = lazy(() => import('../pages/admin/LogViewerPage'));
const LogAlertsPage = lazy(() => import('../pages/admin/LogAlertsPage'));
const OptimizationDashboard = lazy(() => import('../pages/admin/OptimizationDashboard'));
const CausalInferencePage = lazy(() => import('../pages/admin/CausalInferencePage'));
const LLMAdvisorPage = lazy(() => import('../pages/admin/LLMAdvisorPage'));
const AMASExplainabilityPage = lazy(() => import('../pages/admin/AMASExplainabilityPage'));
const SystemDebugPage = lazy(() => import('../pages/admin/SystemDebugPage'));
const WeeklyReportPage = lazy(() => import('../pages/admin/WeeklyReportPage'));
const WordQualityPage = lazy(() => import('../pages/admin/WordQualityPage'));

/**
 * 懒加载包装组件
 */
const LazyWrapper = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<PageLoader />}>{children}</Suspense>
);

/**
 * 管理员子路由配置
 */
const adminChildren: AppRoute[] = [
  {
    index: true,
    element: (
      <LazyWrapper>
        <AdminDashboard />
      </LazyWrapper>
    ),
    meta: { title: '管理后台', requireAuth: true, requireAdmin: true },
  },
  {
    path: 'users',
    element: (
      <LazyWrapper>
        <UserManagementPage />
      </LazyWrapper>
    ),
    meta: { title: '用户管理', requireAuth: true, requireAdmin: true },
  },
  {
    path: 'users/:userId',
    element: (
      <LazyWrapper>
        <UserDetailPage />
      </LazyWrapper>
    ),
    meta: { title: '用户详情', requireAuth: true, requireAdmin: true },
  },
  {
    path: 'users/:userId/words',
    element: (
      <LazyWrapper>
        <WordDetailPage />
      </LazyWrapper>
    ),
    meta: { title: '用户单词', requireAuth: true, requireAdmin: true },
  },
  {
    path: 'wordbooks',
    element: (
      <LazyWrapper>
        <AdminWordBooks />
      </LazyWrapper>
    ),
    meta: { title: '词书管理', requireAuth: true, requireAdmin: true },
  },
  {
    path: 'batch-import',
    element: (
      <LazyWrapper>
        <BatchImportPage />
      </LazyWrapper>
    ),
    meta: { title: '批量导入', requireAuth: true, requireAdmin: true },
  },
  {
    path: 'algorithm-config',
    element: (
      <LazyWrapper>
        <AlgorithmConfigPage />
      </LazyWrapper>
    ),
    meta: { title: '算法配置', requireAuth: true, requireAdmin: true },
  },
  {
    path: 'config-history',
    element: (
      <LazyWrapper>
        <ConfigHistoryPage />
      </LazyWrapper>
    ),
    meta: { title: '配置历史', requireAuth: true, requireAdmin: true },
  },
  {
    path: 'experiments',
    element: (
      <LazyWrapper>
        <ExperimentDashboard />
      </LazyWrapper>
    ),
    meta: { title: '实验管理', requireAuth: true, requireAdmin: true },
  },
  {
    path: 'logs',
    element: (
      <LazyWrapper>
        <LogViewerPage />
      </LazyWrapper>
    ),
    meta: { title: '日志查看', requireAuth: true, requireAdmin: true },
  },
  {
    path: 'log-alerts',
    element: (
      <LazyWrapper>
        <LogAlertsPage />
      </LazyWrapper>
    ),
    meta: { title: '日志告警', requireAuth: true, requireAdmin: true },
  },
  {
    path: 'optimization',
    element: (
      <LazyWrapper>
        <OptimizationDashboard />
      </LazyWrapper>
    ),
    meta: { title: '优化仪表盘', requireAuth: true, requireAdmin: true },
  },
  {
    path: 'causal-analysis',
    element: (
      <LazyWrapper>
        <CausalInferencePage />
      </LazyWrapper>
    ),
    meta: { title: '因果分析', requireAuth: true, requireAdmin: true },
  },
  {
    path: 'llm-advisor',
    element: (
      <LazyWrapper>
        <LLMAdvisorPage />
      </LazyWrapper>
    ),
    meta: { title: 'LLM顾问', requireAuth: true, requireAdmin: true },
  },
  {
    path: 'amas-explainability',
    element: (
      <LazyWrapper>
        <AMASExplainabilityPage />
      </LazyWrapper>
    ),
    meta: { title: 'AMAS可解释性', requireAuth: true, requireAdmin: true },
  },
  {
    path: 'system-debug',
    element: (
      <LazyWrapper>
        <SystemDebugPage />
      </LazyWrapper>
    ),
    meta: { title: '系统调试', requireAuth: true, requireAdmin: true },
  },
  {
    path: 'weekly-report',
    element: (
      <LazyWrapper>
        <WeeklyReportPage />
      </LazyWrapper>
    ),
    meta: { title: '运营周报', requireAuth: true, requireAdmin: true },
  },
  {
    path: 'word-quality',
    element: (
      <LazyWrapper>
        <WordQualityPage />
      </LazyWrapper>
    ),
    meta: { title: '词库质量', requireAuth: true, requireAdmin: true },
  },
];

/**
 * 管理员路由配置
 * 需要管理员权限才能访问
 */
export const adminRoutes: AppRoute[] = [
  {
    path: '/admin',
    element: (
      <ProtectedRoute requireAdmin>
        <LazyWrapper>
          <AdminLayout />
        </LazyWrapper>
      </ProtectedRoute>
    ),
    meta: { title: '管理后台', requireAuth: true, requireAdmin: true },
    children: adminChildren,
  },
];
