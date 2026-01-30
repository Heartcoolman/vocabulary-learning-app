/**
 * 路由预加载模块
 *
 * 提供页面代码和数据的预加载功能，减少页面切换时的等待时间
 *
 * 使用方式：
 * 1. 在导航链接上添加 onMouseEnter 事件触发预加载
 * 2. 在用户登录后空闲时预加载常用路由
 */

import { queryClient } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import { opsEnhanceKeys } from '../hooks/queries/useOpsEnhance';
import {
  wordBookClient,
  learningClient,
  amasClient,
  authClient,
  apiClient,
  adminClient,
  opsEnhanceClient,
} from '../services/client';
import { PAGINATION_CONFIG } from '../constants/pagination';

// ==================== 页面代码预加载 ====================

/**
 * 路由到页面导入函数的映射
 * 用于预加载页面组件代码
 */
export const routePrefetchers: Record<string, () => Promise<unknown>> = {
  // 用户基础页面
  '/vocabulary': () => import('../pages/VocabularyPage'),
  '/flashcard': () => import('../pages/FlashcardPage'),
  '/study-settings': () => import('../pages/StudySettingsPage'),
  '/history': () => import('../pages/HistoryPage'),
  '/profile': () => import('../pages/ProfilePage'),
  '/today-words': () => import('../pages/TodayWordsPage'),
  '/progress': () => import('../pages/StudyProgressPage'),

  // 学习洞察页面
  '/statistics': () => import('../pages/StatisticsPage'),
  '/learning-time': () => import('../pages/LearningTimePage'),
  '/trend-report': () => import('../pages/TrendReportPage'),
  '/achievements': () => import('../pages/AchievementPage'),
  '/badges': () => import('../pages/BadgeGalleryPage'),
  '/plan': () => import('../pages/PlanPage'),
  '/word-mastery': () => import('../pages/WordMasteryPage'),
  '/habit-profile': () => import('../pages/HabitProfilePage'),
  '/learning-profile': () => import('../pages/LearningProfilePage'),
  '/learning-objectives': () => import('../pages/LearningObjectivesPage'),
  '/word-list': () => import('../pages/WordListPage'),

  // 管理员页面
  '/admin': () => import('../pages/admin/AdminDashboard'),
  '/admin/users': () => import('../pages/admin/UserManagementPage'),
  '/admin/wordbooks': () => import('../pages/admin/AdminWordBooks'),
  '/admin/word-quality': () => import('../pages/admin/WordQualityPage'),
  '/admin/algorithm-config': () => import('../pages/admin/AlgorithmConfigPage'),
  '/admin/config-history': () => import('../pages/admin/ConfigHistoryPage'),
  '/admin/optimization': () => import('../pages/admin/OptimizationDashboard'),
  '/admin/causal-analysis': () => import('../pages/admin/CausalInferencePage'),
  '/admin/llm-advisor': () => import('../pages/admin/LLMAdvisorPage'),
  '/admin/amas-explainability': () => import('../pages/admin/AMASExplainabilityPage'),
  '/admin/weekly-report': () => import('../pages/admin/WeeklyReportPage'),
  '/admin/logs': () => import('../pages/admin/LogViewerPage'),
  '/admin/log-alerts': () => import('../pages/admin/LogAlertsPage'),
  '/admin/system-debug': () => import('../pages/admin/SystemDebugPage'),
  '/admin/experiments': () => import('../pages/admin/ExperimentDashboard'),
  '/admin/batch-import': () => import('../pages/BatchImportPage'),
  '/admin/llm-tasks': () => import('../pages/admin/LLMTasksPage'),
  '/admin/amas-monitoring': () => import('../pages/admin/AMASMonitoringPage'),
  '/admin/settings': () => import('../pages/admin/SystemSettingsPage'),
  '/admin/broadcasts': () => import('../pages/admin/BroadcastPage'),
  '/admin/workflow-monitor': () => import('../pages/admin/WorkflowMonitorPage'),
};

/**
 * 预加载指定路由的页面代码
 * @param path 路由路径
 */
export const prefetchRoute = (path: string): void => {
  const prefetcher = routePrefetchers[path];
  if (prefetcher) {
    prefetcher().catch(() => {
      // 静默处理预加载失败，不影响用户体验
    });
  }
};

// ==================== 页面数据预加载 ====================

/**
 * 路由到数据预取函数的映射
 * 用于预加载页面所需的 API 数据
 */
export const routeDataPrefetchers: Record<string, () => void> = {
  '/vocabulary': () => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.wordbooks.all,
      queryFn: () => wordBookClient.getAllAvailableWordBooks(),
      staleTime: 5 * 60 * 1000, // 5 分钟
    });
  },

  '/statistics': () => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.learningRecords.statistics(),
      queryFn: () => learningClient.getRecords({ page: 1, pageSize: PAGINATION_CONFIG.PREFETCH }),
      staleTime: 2 * 60 * 1000, // 2 分钟
    });
    queryClient.prefetchQuery({
      queryKey: queryKeys.user.statistics(),
      queryFn: () => authClient.getUserStatistics(),
      staleTime: 5 * 60 * 1000,
    });
  },

  '/today-words': () => {
    queryClient.prefetchQuery({
      queryKey: ['todayWords'],
      queryFn: () => wordBookClient.getTodayWords(),
      staleTime: 1 * 60 * 1000, // 1 分钟
    });
  },

  '/progress': () => {
    queryClient.prefetchQuery({
      queryKey: ['studyProgress'],
      queryFn: () => wordBookClient.getStudyProgress(),
      staleTime: 2 * 60 * 1000,
    });
  },

  '/word-mastery': () => {
    queryClient.prefetchQuery({
      queryKey: ['wordMastery', 'stats'],
      queryFn: () => amasClient.getWordMasteryStats(),
      staleTime: 2 * 60 * 1000,
    });
  },

  '/habit-profile': () => {
    queryClient.prefetchQuery({
      queryKey: ['habitProfile'],
      queryFn: () => amasClient.getHabitProfile(),
      staleTime: 5 * 60 * 1000,
    });
  },

  '/trend-report': () => {
    queryClient.prefetchQuery({
      queryKey: ['trendReport'],
      queryFn: () => amasClient.getTrendReport(),
      staleTime: 5 * 60 * 1000,
    });
  },

  '/achievements': () => {
    queryClient.prefetchQuery({
      queryKey: ['badges', 'all'],
      queryFn: () => amasClient.getAllBadgesWithStatus(),
      staleTime: 5 * 60 * 1000,
    });
  },

  '/plan': () => {
    queryClient.prefetchQuery({
      queryKey: ['learningPlan'],
      queryFn: () => amasClient.getLearningPlan(),
      staleTime: 5 * 60 * 1000,
    });
  },

  // 注意: /learning-objectives 和 /word-list 页面直接使用 API 调用而非 React Query
  // 因此不配置数据预取（只保留页面代码预加载）

  // ==================== 管理员页面数据预取 ====================

  '/admin': () => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.admin.statistics.overview(),
      queryFn: () => apiClient.adminGetStatistics(),
      staleTime: 2 * 60 * 1000,
    });
    queryClient.prefetchQuery({
      queryKey: queryKeys.admin.visualFatigue.stats(),
      queryFn: () => adminClient.getVisualFatigueStats(),
      staleTime: 2 * 60 * 1000,
    });
  },

  '/admin/weekly-report': () => {
    queryClient.prefetchQuery({
      queryKey: opsEnhanceKeys.latestWeeklyReport(),
      queryFn: () => opsEnhanceClient.getLatestWeeklyReport(),
      staleTime: 60 * 1000,
    });
    queryClient.prefetchQuery({
      queryKey: [...opsEnhanceKeys.healthTrend(), 8],
      queryFn: () => opsEnhanceClient.getHealthTrend(8),
      staleTime: 5 * 60 * 1000,
    });
  },

  '/admin/wordbooks': () => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.wordbooks.list({ type: 'system' }),
      queryFn: () => apiClient.getSystemWordBooks(),
      staleTime: 5 * 60 * 1000,
    });
  },
};

/**
 * 预取指定路由的数据
 * @param path 路由路径
 */
export const prefetchRouteData = (path: string): void => {
  const prefetcher = routeDataPrefetchers[path];
  if (prefetcher) {
    try {
      prefetcher();
    } catch {
      // 静默处理预取失败
    }
  }
};

// ==================== 完整预加载（代码 + 数据） ====================

/**
 * 完整预加载：同时预加载页面代码和数据
 * @param path 路由路径
 */
export const prefetchAll = (path: string): void => {
  prefetchRoute(path);
  prefetchRouteData(path);
};

// ==================== 空闲时预加载 ====================

/**
 * 优先预加载的路由列表（按使用频率排序）
 */
export const PRIORITY_ROUTES = [
  '/vocabulary',
  '/statistics',
  '/flashcard',
  '/today-words',
  '/progress',
];

/**
 * 在浏览器空闲时预加载常用路由的页面代码
 * 使用 requestIdleCallback 确保不影响用户交互
 */
export const prefetchPriorityRoutes = (): void => {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(
      () => {
        PRIORITY_ROUTES.forEach((route, index) => {
          // 错开预加载时间，避免同时发起多个请求
          setTimeout(() => {
            prefetchRoute(route);
          }, index * 100);
        });
      },
      { timeout: 5000 }, // 最多等待 5 秒
    );
  } else {
    // 降级方案：使用 setTimeout
    setTimeout(() => {
      PRIORITY_ROUTES.forEach((route, index) => {
        setTimeout(() => {
          prefetchRoute(route);
        }, index * 100);
      });
    }, 2000);
  }
};

/**
 * 预加载所有常用路由的数据
 * 建议在用户登录成功后调用
 */
export const prefetchPriorityData = (): void => {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(
      () => {
        // 只预取最重要的数据
        prefetchRouteData('/vocabulary');
        prefetchRouteData('/statistics');
      },
      { timeout: 10000 },
    );
  }
};
