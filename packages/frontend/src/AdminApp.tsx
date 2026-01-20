import { BrowserRouter, Navigate, useRoutes, RouteObject } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider, useToast } from './components/ui';
import { queryClient } from './lib/queryClient';

const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const UserManagementPage = lazy(() => import('./pages/admin/UserManagementPage'));
const UserDetailPage = lazy(() => import('./pages/admin/UserDetailPage'));
const WordDetailPage = lazy(() => import('./pages/admin/WordDetailPage'));
const AdminWordBooks = lazy(() => import('./pages/admin/AdminWordBooks'));
const BatchImportPage = lazy(() => import('./pages/BatchImportPage'));
const AlgorithmConfigPage = lazy(() => import('./pages/admin/AlgorithmConfigPage'));
const ConfigHistoryPage = lazy(() => import('./pages/admin/ConfigHistoryPage'));
const ExperimentDashboard = lazy(() => import('./pages/admin/ExperimentDashboard'));
const LogViewerPage = lazy(() => import('./pages/admin/LogViewerPage'));
const LogAlertsPage = lazy(() => import('./pages/admin/LogAlertsPage'));
const OptimizationDashboard = lazy(() => import('./pages/admin/OptimizationDashboard'));
const CausalInferencePage = lazy(() => import('./pages/admin/CausalInferencePage'));
const LLMAdvisorPage = lazy(() => import('./pages/admin/LLMAdvisorPage'));
const AMASExplainabilityPage = lazy(() => import('./pages/admin/AMASExplainabilityPage'));
const SystemDebugPage = lazy(() => import('./pages/admin/SystemDebugPage'));
const WeeklyReportPage = lazy(() => import('./pages/admin/WeeklyReportPage'));
const WordQualityPage = lazy(() => import('./pages/admin/WordQualityPage'));
const LLMTasksPage = lazy(() => import('./pages/admin/LLMTasksPage'));
const AMASMonitoringPage = lazy(() => import('./pages/admin/AMASMonitoringPage'));

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500"></div>
        <p className="text-slate-300">加载中...</p>
      </div>
    </div>
  );
}

function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const { showToast } = useToast();

  if (loading) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin-login" replace />;
  }

  if (user?.role !== 'ADMIN') {
    logout();
    showToast('error', '权限不足，仅管理员可访问');
    return <Navigate to="/admin-login" replace />;
  }

  return <>{children}</>;
}

function AdminRoutes() {
  const routes: RouteObject[] = [
    {
      path: '/admin-login',
      element: (
        <Suspense fallback={<PageLoader />}>
          <AdminLoginPage />
        </Suspense>
      ),
    },
    {
      path: '/admin',
      element: (
        <AdminProtectedRoute>
          <Suspense fallback={<PageLoader />}>
            <AdminLayout />
          </Suspense>
        </AdminProtectedRoute>
      ),
      children: [
        {
          index: true,
          element: (
            <Suspense fallback={<PageLoader />}>
              <AdminDashboard />
            </Suspense>
          ),
        },
        {
          path: 'users',
          element: (
            <Suspense fallback={<PageLoader />}>
              <UserManagementPage />
            </Suspense>
          ),
        },
        {
          path: 'users/:userId',
          element: (
            <Suspense fallback={<PageLoader />}>
              <UserDetailPage />
            </Suspense>
          ),
        },
        {
          path: 'users/:userId/words',
          element: (
            <Suspense fallback={<PageLoader />}>
              <WordDetailPage />
            </Suspense>
          ),
        },
        {
          path: 'wordbooks',
          element: (
            <Suspense fallback={<PageLoader />}>
              <AdminWordBooks />
            </Suspense>
          ),
        },
        {
          path: 'batch-import',
          element: (
            <Suspense fallback={<PageLoader />}>
              <BatchImportPage />
            </Suspense>
          ),
        },
        {
          path: 'algorithm-config',
          element: (
            <Suspense fallback={<PageLoader />}>
              <AlgorithmConfigPage />
            </Suspense>
          ),
        },
        {
          path: 'config-history',
          element: (
            <Suspense fallback={<PageLoader />}>
              <ConfigHistoryPage />
            </Suspense>
          ),
        },
        {
          path: 'experiments',
          element: (
            <Suspense fallback={<PageLoader />}>
              <ExperimentDashboard />
            </Suspense>
          ),
        },
        {
          path: 'logs',
          element: (
            <Suspense fallback={<PageLoader />}>
              <LogViewerPage />
            </Suspense>
          ),
        },
        {
          path: 'log-alerts',
          element: (
            <Suspense fallback={<PageLoader />}>
              <LogAlertsPage />
            </Suspense>
          ),
        },
        {
          path: 'optimization',
          element: (
            <Suspense fallback={<PageLoader />}>
              <OptimizationDashboard />
            </Suspense>
          ),
        },
        {
          path: 'causal-analysis',
          element: (
            <Suspense fallback={<PageLoader />}>
              <CausalInferencePage />
            </Suspense>
          ),
        },
        {
          path: 'llm-advisor',
          element: (
            <Suspense fallback={<PageLoader />}>
              <LLMAdvisorPage />
            </Suspense>
          ),
        },
        {
          path: 'amas-explainability',
          element: (
            <Suspense fallback={<PageLoader />}>
              <AMASExplainabilityPage />
            </Suspense>
          ),
        },
        {
          path: 'system-debug',
          element: (
            <Suspense fallback={<PageLoader />}>
              <SystemDebugPage />
            </Suspense>
          ),
        },
        {
          path: 'weekly-report',
          element: (
            <Suspense fallback={<PageLoader />}>
              <WeeklyReportPage />
            </Suspense>
          ),
        },
        {
          path: 'word-quality',
          element: (
            <Suspense fallback={<PageLoader />}>
              <WordQualityPage />
            </Suspense>
          ),
        },
        {
          path: 'llm-tasks',
          element: (
            <Suspense fallback={<PageLoader />}>
              <LLMTasksPage />
            </Suspense>
          ),
        },
        {
          path: 'amas-monitoring',
          element: (
            <Suspense fallback={<PageLoader />}>
              <AMASMonitoringPage />
            </Suspense>
          ),
        },
      ],
    },
    { path: '*', element: <Navigate to="/admin" replace /> },
  ];

  return useRoutes(routes);
}

export default function AdminApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <AdminRoutes />
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
