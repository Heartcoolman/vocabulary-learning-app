import { RouteObject } from 'react-router-dom';
import { createLazyElement } from './LazyRoute';

// 核心页面 - 同步导入（首屏必需）
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';

/**
 * 公开路由配置
 *
 * 包含：
 * - /login - 登录页
 * - /register - 注册页
 * - /about/* - AMAS 公开展示页面
 */
export const publicRoutes: RouteObject[] = [
  // 核心认证页面（同步加载）
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },

  // AMAS 公开展示路由（懒加载）
  {
    path: '/about',
    element: createLazyElement(() => import('../pages/about/AboutLayout')),
    children: [
      {
        index: true,
        element: createLazyElement(() => import('../pages/about/AboutHomePage')),
      },
      {
        path: 'simulation',
        element: createLazyElement(() => import('../pages/about/SimulationPage')),
      },
      {
        path: 'dashboard',
        element: createLazyElement(() => import('../pages/about/DashboardPage')),
      },
      {
        path: 'stats',
        element: createLazyElement(() => import('../pages/about/StatsPage')),
      },
      {
        path: 'system-status',
        element: createLazyElement(() => import('../pages/about/SystemStatusPage')),
      },
    ],
  },
];

export default publicRoutes;
