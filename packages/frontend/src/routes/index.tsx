import { Navigate } from 'react-router-dom';
import { publicRoutes } from './public.routes';
import { userRoutes } from './user.routes';
import { adminRoutes } from './admin.routes';
import { aboutRoutes } from './about.routes';
import type { AppRoute } from './types';

// eslint-disable-next-line react-refresh/only-export-components
export const routes: AppRoute[] = [
  // 公开路由（登录、注册等）
  ...publicRoutes,

  // About 页面路由（公开访问）
  ...aboutRoutes,

  // 用户功能路由（需要登录）
  ...userRoutes,

  // 管理员路由（需要管理员权限）
  ...adminRoutes,

  // 404 重定向
  {
    path: '*',
    element: <Navigate to="/" replace />,
    meta: { title: '页面未找到' },
  },
];

// 导出类型
// eslint-disable-next-line react-refresh/only-export-components
export * from './types';

// 导出各模块路由
// eslint-disable-next-line react-refresh/only-export-components
export { publicRoutes } from './public.routes';
// eslint-disable-next-line react-refresh/only-export-components
export { userRoutes } from './user.routes';
// eslint-disable-next-line react-refresh/only-export-components
export { adminRoutes } from './admin.routes';
// eslint-disable-next-line react-refresh/only-export-components
export { aboutRoutes } from './about.routes';

// 导出组件
// eslint-disable-next-line react-refresh/only-export-components
export { PageLoader, lazyLoad, createLazyComponent } from './components';
