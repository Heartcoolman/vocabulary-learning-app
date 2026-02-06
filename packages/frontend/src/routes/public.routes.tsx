import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import type { AppRoute } from './types';
import { PageLoader } from './components';
import { isTauriEnvironment } from '../utils/tauri-bridge';

// 懒加载页面
const ForbiddenPage = lazy(() => import('../pages/ForbiddenPage'));
const HomePage = lazy(() => import('../pages/HomePage'));

// 仅 Web 模式需要的页面（懒加载）
const LoginPage = lazy(() => import('../pages/LoginPage'));
const RegisterPage = lazy(() => import('../pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('../pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('../pages/ResetPasswordPage'));

// eslint-disable-next-line react-refresh/only-export-components
const LazyWrapper = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<PageLoader />}>{children}</Suspense>
);

/**
 * 公开路由配置
 * 无需登录即可访问的页面
 */
const baseRoutes: AppRoute[] = [
  {
    path: '/',
    element: (
      <LazyWrapper>
        <HomePage />
      </LazyWrapper>
    ),
    meta: { title: '首页', requireAuth: false },
  },
  {
    path: '/403',
    element: (
      <LazyWrapper>
        <ForbiddenPage />
      </LazyWrapper>
    ),
    meta: { title: '访问被拒绝', requireAuth: false },
  },
];

// 认证相关路由（仅 Web 模式）
const authRoutes: AppRoute[] = [
  {
    path: '/',
    element: (
      <LazyWrapper>
        <HomePage />
      </LazyWrapper>
    ),
    meta: { title: '首页', requireAuth: false },
  },
  {
    path: '/login',
    element: (
      <LazyWrapper>
        <LoginPage />
      </LazyWrapper>
    ),
    meta: { title: '登录', requireAuth: false },
  },
  {
    path: '/register',
    element: (
      <LazyWrapper>
        <RegisterPage />
      </LazyWrapper>
    ),
    meta: { title: '注册', requireAuth: false },
  },
  {
    path: '/forgot-password',
    element: (
      <LazyWrapper>
        <ForgotPasswordPage />
      </LazyWrapper>
    ),
    meta: { title: '忘记密码', requireAuth: false },
  },
  {
    path: '/reset-password',
    element: (
      <LazyWrapper>
        <ResetPasswordPage />
      </LazyWrapper>
    ),
    meta: { title: '重置密码', requireAuth: false },
  },
];

// 桌面模式：认证路由重定向到学习页面
const desktopAuthRedirects: AppRoute[] = [
  {
    path: '/login',
    element: <Navigate to="/learning" replace />,
    meta: { title: '登录', requireAuth: false },
  },
  {
    path: '/register',
    element: <Navigate to="/learning" replace />,
    meta: { title: '注册', requireAuth: false },
  },
  {
    path: '/forgot-password',
    element: <Navigate to="/learning" replace />,
    meta: { title: '忘记密码', requireAuth: false },
  },
  {
    path: '/reset-password',
    element: <Navigate to="/learning" replace />,
    meta: { title: '重置密码', requireAuth: false },
  },
];

export const publicRoutes: AppRoute[] = [
  ...baseRoutes,
  ...(isTauriEnvironment() ? desktopAuthRedirects : authRoutes),
];
