import { ComponentType } from 'react';
import { RouteObject } from 'react-router-dom';
import { createLazyElement } from './LazyRoute';
import ProtectedRoute from '../components/ProtectedRoute';

// 核心页面 - 同步导入（首屏必需）
import LearningPage from '../pages/LearningPage';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LazyImportFn = () => Promise<{ default: ComponentType<any> }>;

/**
 * 创建受保护的懒加载路由元素
 */
function createProtectedLazyElement(importFn: LazyImportFn): React.ReactNode {
  return <ProtectedRoute>{createLazyElement(importFn)}</ProtectedRoute>;
}

/**
 * 用户保护路由配置
 *
 * 包含：
 * - / - 学习首页
 * - /vocabulary - 词汇表
 * - /wordbooks/:id - 词书详情
 * - /study-settings - 学习设置
 * - /learning-objectives - 学习目标
 * - /history - 学习历史
 * - /statistics - 统计数据
 * - /word-list - 单词列表
 * - /profile - 用户资料
 * - /today-words - 今日单词
 * - /progress - 学习进度
 */
export const userRoutes: RouteObject[] = [
  // 核心学习页面（同步加载）
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <LearningPage />
      </ProtectedRoute>
    ),
  },

  // 词汇相关页面（懒加载）
  {
    path: '/vocabulary',
    element: createProtectedLazyElement(() => import('../pages/VocabularyPage')),
  },
  {
    path: '/wordbooks/:id',
    element: createProtectedLazyElement(() => import('../pages/WordBookDetailPage')),
  },
  {
    path: '/word-list',
    element: createProtectedLazyElement(() => import('../pages/WordListPage')),
  },

  // 学习设置和目标（懒加载）
  {
    path: '/study-settings',
    element: createProtectedLazyElement(() => import('../pages/StudySettingsPage')),
  },
  {
    path: '/learning-objectives',
    element: createProtectedLazyElement(() => import('../pages/LearningObjectivesPage')),
  },

  // 学习记录和统计（懒加载）
  {
    path: '/history',
    element: createProtectedLazyElement(() => import('../pages/HistoryPage')),
  },
  {
    path: '/statistics',
    element: createProtectedLazyElement(() => import('../pages/StatisticsPage')),
  },
  {
    path: '/today-words',
    element: createProtectedLazyElement(() => import('../pages/TodayWordsPage')),
  },
  {
    path: '/progress',
    element: createProtectedLazyElement(() => import('../pages/StudyProgressPage')),
  },

  // 用户资料（懒加载）
  {
    path: '/profile',
    element: createProtectedLazyElement(() => import('../pages/ProfilePage')),
  },
];

export default userRoutes;
