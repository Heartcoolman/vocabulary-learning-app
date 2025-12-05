import { RouteObject } from 'react-router-dom';
import { ReactNode } from 'react';

/**
 * 路由元信息接口
 */
export interface RouteMeta {
  /** 页面标题 */
  title?: string;
  /** 是否需要认证 */
  requireAuth?: boolean;
  /** 是否需要管理员权限 */
  requireAdmin?: boolean;
  /** 是否懒加载 */
  lazy?: boolean;
}

/**
 * 扩展的应用路由接口
 */
export interface AppRoute extends Omit<RouteObject, 'children'> {
  /** 路由元信息 */
  meta?: RouteMeta;
  /** 子路由 */
  children?: AppRoute[];
}

/**
 * 路由配置辅助类型
 */
export type RouteConfig = {
  path: string;
  element: ReactNode;
  meta?: RouteMeta;
  children?: RouteConfig[];
};
