import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Navigation 组件 - 顶部导航栏
 * 提供应用内页面导航
 */
export default function Navigation() {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const linkClass = (path: string) => {
    const base = 'px-4 py-2 rounded-lg text-base font-medium transition-all duration-200';
    return isActive(path)
      ? `${base} bg-blue-500 text-white shadow-sm`
      : `${base} text-gray-700 hover:bg-gray-100 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`;
  };

  return (
    <header 
      className="bg-white border-b border-gray-200 shadow-sm"
      role="banner"
    >
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link 
            to="/" 
            className="flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
            aria-label="返回首页"
          >
            <h1 className="text-2xl font-bold text-gray-900">词汇学习</h1>
          </Link>

          <nav 
            className="flex items-center space-x-2"
            role="navigation"
            aria-label="主导航"
          >
            <Link 
              to="/" 
              className={linkClass('/')}
              aria-current={isActive('/') ? 'page' : undefined}
            >
              学习
            </Link>
            <Link 
              to="/vocabulary" 
              className={linkClass('/vocabulary')}
              aria-current={isActive('/vocabulary') ? 'page' : undefined}
            >
              词库管理
            </Link>
            <Link 
              to="/history" 
              className={linkClass('/history')}
              aria-current={isActive('/history') ? 'page' : undefined}
            >
              学习历史
            </Link>
            
            {/* 认证相关导航 */}
            {isAuthenticated ? (
              <Link 
                to="/profile" 
                className={linkClass('/profile')}
                aria-current={isActive('/profile') ? 'page' : undefined}
                aria-label={`个人资料 - ${user?.username}`}
              >
                {user?.username || '个人资料'}
              </Link>
            ) : (
              <Link 
                to="/login" 
                className={linkClass('/login')}
                aria-current={isActive('/login') ? 'page' : undefined}
              >
                登录
              </Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
