import { Link, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { CaretDown, Clock, TrendUp, Trophy, CalendarCheck, ChartBar } from './Icon';

/**
 * Navigation 组件 - 顶部导航栏
 * 提供应用内页面导航
 */
export default function Navigation() {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const insightsRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (insightsRef.current && !insightsRef.current.contains(event.target as Node)) {
        setIsInsightsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const isInsightsActive = () => {
    return ['/statistics', '/learning-time', '/trend-report', '/achievements', '/plan'].includes(location.pathname);
  };

  const linkClass = (path: string) => {
    const base = 'px-4 py-2 rounded-lg text-base font-medium transition-all duration-200';
    return isActive(path)
      ? `${base} bg-blue-500 text-white shadow-sm`
      : `${base} text-gray-700 hover:bg-gray-100 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`;
  };

  const dropdownLinkClass = (path: string) => {
    const base = 'flex items-center gap-2 px-4 py-2 text-sm transition-colors';
    return isActive(path)
      ? `${base} bg-blue-50 text-blue-600`
      : `${base} text-gray-700 hover:bg-gray-100`;
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200/50 shadow-sm"
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
              to="/study-settings"
              className={linkClass('/study-settings')}
              aria-current={isActive('/study-settings') ? 'page' : undefined}
            >
              学习设置
            </Link>
            <Link
              to="/history"
              className={linkClass('/history')}
              aria-current={isActive('/history') ? 'page' : undefined}
            >
              学习历史
            </Link>

            {/* 学习洞察下拉菜单 */}
            {isAuthenticated && (
              <div className="relative" ref={insightsRef}>
                <button
                  onClick={() => setIsInsightsOpen(!isInsightsOpen)}
                  className={`px-4 py-2 rounded-lg text-base font-medium transition-all duration-200 flex items-center gap-1 ${isInsightsActive()
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
                    }`}
                  aria-expanded={isInsightsOpen}
                  aria-haspopup="true"
                >
                  学习洞察
                  <CaretDown
                    size={16}
                    weight="bold"
                    className={`transition-transform ${isInsightsOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isInsightsOpen && (
                  <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 animate-fade-in">
                    <Link
                      to="/statistics"
                      className={dropdownLinkClass('/statistics')}
                      onClick={() => setIsInsightsOpen(false)}
                    >
                      <ChartBar size={18} weight="bold" />
                      学习统计
                    </Link>
                    <Link
                      to="/learning-time"
                      className={dropdownLinkClass('/learning-time')}
                      onClick={() => setIsInsightsOpen(false)}
                    >
                      <Clock size={18} weight="bold" />
                      学习时机
                    </Link>
                    <Link
                      to="/trend-report"
                      className={dropdownLinkClass('/trend-report')}
                      onClick={() => setIsInsightsOpen(false)}
                    >
                      <TrendUp size={18} weight="bold" />
                      趋势分析
                    </Link>
                    <Link
                      to="/achievements"
                      className={dropdownLinkClass('/achievements')}
                      onClick={() => setIsInsightsOpen(false)}
                    >
                      <Trophy size={18} weight="bold" />
                      成就徽章
                    </Link>
                    <Link
                      to="/plan"
                      className={dropdownLinkClass('/plan')}
                      onClick={() => setIsInsightsOpen(false)}
                    >
                      <CalendarCheck size={18} weight="bold" />
                      学习计划
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* 管理后台入口 - 仅管理员可见 */}
            {isAuthenticated && user?.role === 'ADMIN' && (
              <Link
                to="/admin"
                className={linkClass('/admin')}
                aria-current={isActive('/admin') ? 'page' : undefined}
              >
                管理后台
              </Link>
            )}

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
