import { Navigate } from 'react-router-dom';
import { publicRoutes } from './public.routes';
import { userRoutes } from './user.routes';
import { adminRoutes } from './admin.routes';
import { aboutRoutes } from './about.routes';
import { AppRoute } from './types';

/**
 * 所有路由配置汇总
 * 按模块组织，便于维护和扩展
 */
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
    meta: { title: '页面未找到' }
  }
];

// 导出类型
export * from './types';

// 导出各模块路由
export { publicRoutes } from './public.routes';
export { userRoutes } from './user.routes';
export { adminRoutes } from './admin.routes';
export { aboutRoutes } from './about.routes';

// 导出组件
export { PageLoader, lazyLoad, createLazyComponent } from './components';
