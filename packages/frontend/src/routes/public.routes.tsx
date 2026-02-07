import { lazy, Suspense } from 'react';
import type { AppRoute } from './types';
import { PageLoader } from './components';

// 懒加载页面
const ForbiddenPage = lazy(() => import('../pages/ForbiddenPage'));
const HomePage = lazy(() => import('../pages/HomePage'));
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

const authRoutes: AppRoute[] = [
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

export const publicRoutes: AppRoute[] = [...baseRoutes, ...authRoutes];
