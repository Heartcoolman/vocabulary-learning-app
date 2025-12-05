import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * 路由守卫组件 - 保护需要登录的页面
 */
interface ProtectedRouteProps {
  children: React.ReactNode;
  /** 是否要求管理员权限，默认 false */
  requireAdmin?: boolean;
}

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
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

  // 如果要求管理员权限，检查用户角色
  if (requireAdmin && user?.role !== 'ADMIN') {
    return <Navigate to="/403" replace />;
  }

  // 已登录（且权限满足）则显示子组件
  return <>{children}</>;
}
