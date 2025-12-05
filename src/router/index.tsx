import { createBrowserRouter, Navigate, RouteObject } from 'react-router-dom';
import RootLayout from './RootLayout';

// 导入各模块路由配置
import { publicRoutes } from './public.routes';
import { userRoutes } from './user.routes';
import { adminRoutes } from './admin.routes';
import { amasRoutes } from './amas.routes';

// 导出组件供其他模块使用
export { default as LazyRoute, PageLoader, createLazyElement } from './LazyRoute';
export { default as AdminRoute } from './AdminRoute';
export { default as RootLayout } from './RootLayout';

// 导出各路由配置
export { publicRoutes } from './public.routes';
export { userRoutes } from './user.routes';
export { adminRoutes } from './admin.routes';
export { amasRoutes } from './amas.routes';

/**
 * 子路由配置（在 RootLayout 内渲染）
 */
const childRoutes: RouteObject[] = [
  // 公开路由（登录、注册、About）
  ...publicRoutes,

  // 用户保护路由
  ...userRoutes,

  // AMAS 增强功能路由
  ...amasRoutes,

  // 管理员路由
  ...adminRoutes,

  // 404 重定向
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
];

/**
 * 完整路由配置
 */
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: childRoutes,
  },
];

/**
 * 创建路由器实例
 *
 * 使用 createBrowserRouter 配合 RouterProvider
 * 支持数据路由 API（loader, action 等）
 */
export const router = createBrowserRouter(routes);

export default router;
