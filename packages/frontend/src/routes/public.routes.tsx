import { lazy, Suspense } from 'react';
import { AppRoute } from './types';
import { PageLoader } from './components';

// 核心页面 - 同步导入（首屏必需）
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';

/**
 * 公开路由配置
 * 无需登录即可访问的页面
 */
export const publicRoutes: AppRoute[] = [
  {
    path: '/login',
    element: <LoginPage />,
    meta: { title: '登录', requireAuth: false }
  },
  {
    path: '/register',
    element: <RegisterPage />,
    meta: { title: '注册', requireAuth: false }
  },
];
