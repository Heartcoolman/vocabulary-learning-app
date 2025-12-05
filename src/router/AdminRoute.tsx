import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * AdminRoute - 管理员路由守卫组件
 *
 * 功能：
 * 1. 验证用户是否已登录
 * 2. 验证用户是否具有 ADMIN 角色
 * 3. 未登录重定向到登录页
 * 4. 非管理员重定向到首页
 */
interface AdminRouteProps {
  children: React.ReactNode;
}

export default function AdminRoute({ children }: AdminRouteProps) {
  const { user, isAuthenticated, loading } = useAuth();

  // 加载中显示加载状态
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center animate-g3-fade-in">
        <div className="text-center" role="status" aria-live="polite">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">正在验证身份...</p>
        </div>
      </div>
    );
  }

  // 未登录则重定向到登录页
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // 非管理员则重定向到首页
  if (user?.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  // 已登录且是管理员则显示子组件
  return <>{children}</>;
}
