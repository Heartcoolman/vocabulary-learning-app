import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import type { AppRoute } from './types';
import { PageLoader } from './components';
import ProtectedRoute from '../components/ProtectedRoute';

// 核心页面 - 同步导入（首屏必需）
import LearningPage from '../pages/LearningPage';

// 懒加载 - 用户基础页面
const VocabularyPage = lazy(() => import('../pages/VocabularyPage'));
const WordBookDetailPage = lazy(() => import('../pages/WordBookDetailPage'));
const WordBookCenterPage = lazy(() => import('../pages/WordBookCenterPage'));
const StudySettingsPage = lazy(() => import('../pages/StudySettingsPage'));
const HistoryPage = lazy(() => import('../pages/HistoryPage'));
const StatisticsPage = lazy(() => import('../pages/StatisticsPage'));
const WordListPage = lazy(() => import('../pages/WordListPage'));
const ProfilePage = lazy(() => import('../pages/ProfilePage'));
const WordMasteryPage = lazy(() => import('../pages/WordMasteryPage'));
const HabitProfilePage = lazy(() => import('../pages/HabitProfilePage'));
const TodayWordsPage = lazy(() => import('../pages/TodayWordsPage'));
const StudyProgressPage = lazy(() => import('../pages/StudyProgressPage'));
const LearningObjectivesPage = lazy(() => import('../pages/LearningObjectivesPage'));
const FlashcardPage = lazy(() => import('../pages/FlashcardPage'));

// 懒加载 - AMAS 增强功能页面
const LearningTimePage = lazy(() => import('../pages/LearningTimePage'));
const TrendReportPage = lazy(() => import('../pages/TrendReportPage'));
const AchievementPage = lazy(() => import('../pages/AchievementPage'));
const BadgeGalleryPage = lazy(() => import('../pages/BadgeGalleryPage'));
const PlanPage = lazy(() => import('../pages/PlanPage'));
const LearningProfilePage = lazy(() => import('../pages/LearningProfilePage'));
const PreferencesPage = lazy(() => import('../pages/PreferencesPage'));

// 语义搜索功能页面
const ConfusionWordsPage = lazy(() => import('../pages/ConfusionWordsPage'));
const SemanticSearchPage = lazy(() => import('../pages/SemanticSearchPage'));

// 通知功能页面
const NotificationCenterPage = lazy(() => import('../pages/NotificationCenterPage'));

// eslint-disable-next-line react-refresh/only-export-components
const LazyWrapper = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<PageLoader />}>{children}</Suspense>
);

// eslint-disable-next-line react-refresh/only-export-components
const ProtectedLazy = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <LazyWrapper>{children}</LazyWrapper>
  </ProtectedRoute>
);

/**
 * 用户路由配置
 * 需要登录后访问的用户功能页面
 */
export const userRoutes: AppRoute[] = [
  // 学习页面
  {
    path: '/learning',
    element: (
      <ProtectedRoute>
        <LearningPage />
      </ProtectedRoute>
    ),
    meta: { title: '学习', requireAuth: true },
  },
  {
    path: '/flashcard',
    element: (
      <ProtectedLazy>
        <FlashcardPage />
      </ProtectedLazy>
    ),
    meta: { title: '闪记模式', requireAuth: true },
  },

  // 基础功能页面
  {
    path: '/vocabulary',
    element: (
      <ProtectedLazy>
        <VocabularyPage />
      </ProtectedLazy>
    ),
    meta: { title: '词库', requireAuth: true },
  },
  {
    path: '/wordbooks/:id',
    element: (
      <ProtectedLazy>
        <WordBookDetailPage />
      </ProtectedLazy>
    ),
    meta: { title: '词书详情', requireAuth: true },
  },
  {
    path: '/wordbook-center',
    element: (
      <ProtectedLazy>
        <WordBookCenterPage />
      </ProtectedLazy>
    ),
    meta: { title: '词库中心', requireAuth: true },
  },
  {
    path: '/study-settings',
    element: (
      <ProtectedLazy>
        <StudySettingsPage />
      </ProtectedLazy>
    ),
    meta: { title: '学习设置', requireAuth: true },
  },
  {
    path: '/learning-objectives',
    element: (
      <ProtectedLazy>
        <LearningObjectivesPage />
      </ProtectedLazy>
    ),
    meta: { title: '学习目标', requireAuth: true },
  },
  {
    path: '/history',
    element: (
      <ProtectedLazy>
        <HistoryPage />
      </ProtectedLazy>
    ),
    meta: { title: '学习历史', requireAuth: true },
  },
  {
    path: '/statistics',
    element: (
      <ProtectedLazy>
        <StatisticsPage />
      </ProtectedLazy>
    ),
    meta: { title: '统计数据', requireAuth: true },
  },
  {
    path: '/word-list',
    element: (
      <ProtectedLazy>
        <WordListPage />
      </ProtectedLazy>
    ),
    meta: { title: '单词列表', requireAuth: true },
  },
  {
    path: '/confusion-words',
    element: (
      <ProtectedLazy>
        <ConfusionWordsPage />
      </ProtectedLazy>
    ),
    meta: { title: '易混淆词', requireAuth: true },
  },
  {
    path: '/semantic-search',
    element: (
      <ProtectedLazy>
        <SemanticSearchPage />
      </ProtectedLazy>
    ),
    meta: { title: '语义搜索', requireAuth: true },
  },
  {
    path: '/profile',
    element: (
      <ProtectedLazy>
        <ProfilePage />
      </ProtectedLazy>
    ),
    meta: { title: '个人中心', requireAuth: true },
  },
  {
    path: '/today-words',
    element: (
      <ProtectedLazy>
        <TodayWordsPage />
      </ProtectedLazy>
    ),
    meta: { title: '今日单词', requireAuth: true },
  },
  {
    path: '/progress',
    element: (
      <ProtectedLazy>
        <StudyProgressPage />
      </ProtectedLazy>
    ),
    meta: { title: '学习进度', requireAuth: true },
  },

  // AMAS 增强功能页面
  {
    path: '/learning-time',
    element: (
      <ProtectedLazy>
        <LearningTimePage />
      </ProtectedLazy>
    ),
    meta: { title: '学习时间', requireAuth: true },
  },
  {
    path: '/trend-report',
    element: (
      <ProtectedLazy>
        <TrendReportPage />
      </ProtectedLazy>
    ),
    meta: { title: '趋势报告', requireAuth: true },
  },
  {
    path: '/achievements',
    element: (
      <ProtectedLazy>
        <AchievementPage />
      </ProtectedLazy>
    ),
    meta: { title: '成就', requireAuth: true },
  },
  {
    path: '/badges',
    element: (
      <ProtectedLazy>
        <BadgeGalleryPage />
      </ProtectedLazy>
    ),
    meta: { title: '徽章', requireAuth: true },
  },
  {
    path: '/plan',
    element: (
      <ProtectedLazy>
        <PlanPage />
      </ProtectedLazy>
    ),
    meta: { title: '学习计划', requireAuth: true },
  },
  {
    path: '/word-mastery',
    element: (
      <ProtectedLazy>
        <WordMasteryPage />
      </ProtectedLazy>
    ),
    meta: { title: '单词掌握度', requireAuth: true },
  },
  {
    path: '/habit-profile',
    element: (
      <ProtectedLazy>
        <HabitProfilePage />
      </ProtectedLazy>
    ),
    meta: { title: '习惯画像', requireAuth: true },
  },
  {
    path: '/learning-profile',
    element: (
      <ProtectedLazy>
        <LearningProfilePage />
      </ProtectedLazy>
    ),
    meta: { title: '学习画像', requireAuth: true },
  },
  {
    path: '/preferences',
    element: (
      <ProtectedLazy>
        <PreferencesPage />
      </ProtectedLazy>
    ),
    meta: { title: '偏好设置', requireAuth: true },
  },

  // 通知中心
  {
    path: '/notifications',
    element: (
      <ProtectedLazy>
        <NotificationCenterPage />
      </ProtectedLazy>
    ),
    meta: { title: '通知中心', requireAuth: true },
  },

  // 路径统一：重定向到主学习页面
  {
    path: '/learn',
    element: <Navigate to="/learning" replace />,
    meta: { title: '学习', requireAuth: false },
  },
];
