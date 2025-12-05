import { ComponentType } from 'react';
import { RouteObject } from 'react-router-dom';
import { createLazyElement } from './LazyRoute';
import ProtectedRoute from '../components/ProtectedRoute';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LazyImportFn = () => Promise<{ default: ComponentType<any> }>;

/**
 * 创建受保护的懒加载路由元素
 */
function createProtectedLazyElement(importFn: LazyImportFn): React.ReactNode {
  return <ProtectedRoute>{createLazyElement(importFn)}</ProtectedRoute>;
}

/**
 * AMAS 增强功能路由配置
 *
 * 包含：
 * - /learning-time - 学习时间
 * - /trend-report - 趋势报告
 * - /achievements - 成就页面
 * - /badges - 徽章画廊
 * - /plan - 学习计划
 * - /word-mastery - 单词掌握度
 * - /habit-profile - 习惯画像
 * - /learning-profile - 学习画像
 */
export const amasRoutes: RouteObject[] = [
  // 学习时间和趋势
  {
    path: '/learning-time',
    element: createProtectedLazyElement(() => import('../pages/LearningTimePage')),
  },
  {
    path: '/trend-report',
    element: createProtectedLazyElement(() => import('../pages/TrendReportPage')),
  },

  // 成就和徽章
  {
    path: '/achievements',
    element: createProtectedLazyElement(() => import('../pages/AchievementPage')),
  },
  {
    path: '/badges',
    element: createProtectedLazyElement(() => import('../pages/BadgeGalleryPage')),
  },

  // 学习计划
  {
    path: '/plan',
    element: createProtectedLazyElement(() => import('../pages/PlanPage')),
  },

  // 掌握度和画像
  {
    path: '/word-mastery',
    element: createProtectedLazyElement(() => import('../pages/WordMasteryPage')),
  },
  {
    path: '/habit-profile',
    element: createProtectedLazyElement(() => import('../pages/HabitProfilePage')),
  },
  {
    path: '/learning-profile',
    element: createProtectedLazyElement(() => import('../pages/LearningProfilePage')),
  },
];

export default amasRoutes;
