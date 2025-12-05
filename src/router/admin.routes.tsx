import { ComponentType } from 'react';
import { RouteObject } from 'react-router-dom';
import { createLazyElement } from './LazyRoute';
import AdminRoute from './AdminRoute';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LazyImportFn = () => Promise<{ default: ComponentType<any> }>;

/**
 * 创建管理员保护的懒加载路由元素
 */
function createAdminLazyElement(importFn: LazyImportFn): React.ReactNode {
  return <AdminRoute>{createLazyElement(importFn)}</AdminRoute>;
}

/**
 * 管理员路由配置
 *
 * 包含：
 * - /admin - 管理后台（需要 ADMIN 角色）
 * - /admin/users - 用户管理
 * - /admin/users/:userId - 用户详情
 * - /admin/users/:userId/words - 用户单词详情
 * - /admin/wordbooks - 词书管理
 * - /admin/batch-import - 批量导入
 * - /admin/algorithm-config - 算法配置
 * - /admin/config-history - 配置历史
 * - /admin/experiments - 实验管理
 * - /admin/logs - 日志查看
 * - /admin/log-alerts - 日志告警
 * - /admin/optimization - 优化面板
 * - /admin/causal-analysis - 因果分析
 * - /admin/llm-advisor - LLM 顾问
 * - /admin/amas-explainability - AMAS 可解释性
 */
export const adminRoutes: RouteObject[] = [
  {
    path: '/admin',
    element: createAdminLazyElement(() => import('../pages/admin/AdminLayout')),
    children: [
      {
        index: true,
        element: createLazyElement(() => import('../pages/admin/AdminDashboard')),
      },
      {
        path: 'users',
        element: createLazyElement(() => import('../pages/admin/UserManagementPage')),
      },
      {
        path: 'users/:userId',
        element: createLazyElement(() => import('../pages/admin/UserDetailPage')),
      },
      {
        path: 'users/:userId/words',
        element: createLazyElement(() => import('../pages/admin/WordDetailPage')),
      },
      {
        path: 'wordbooks',
        element: createLazyElement(() => import('../pages/admin/AdminWordBooks')),
      },
      {
        path: 'batch-import',
        element: createLazyElement(() => import('../pages/BatchImportPage')),
      },
      {
        path: 'algorithm-config',
        element: createLazyElement(() => import('../pages/admin/AlgorithmConfigPage')),
      },
      {
        path: 'config-history',
        element: createLazyElement(() => import('../pages/admin/ConfigHistoryPage')),
      },
      {
        path: 'experiments',
        element: createLazyElement(() => import('../pages/admin/ExperimentDashboard')),
      },
      {
        path: 'logs',
        element: createLazyElement(() => import('../pages/admin/LogViewerPage')),
      },
      {
        path: 'log-alerts',
        element: createLazyElement(() => import('../pages/admin/LogAlertsPage')),
      },
      {
        path: 'optimization',
        element: createLazyElement(() => import('../pages/admin/OptimizationDashboard')),
      },
      {
        path: 'causal-analysis',
        element: createLazyElement(() => import('../pages/admin/CausalInferencePage')),
      },
      {
        path: 'llm-advisor',
        element: createLazyElement(() => import('../pages/admin/LLMAdvisorPage')),
      },
      {
        path: 'amas-explainability',
        element: createLazyElement(() => import('../pages/admin/AMASExplainabilityPage')),
      },
    ],
  },
];

export default adminRoutes;
