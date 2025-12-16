import { Link, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect, memo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  CaretDown,
  Clock,
  TrendUp,
  Trophy,
  CalendarCheck,
  ChartBar,
  Target,
  UserCircle,
  List,
  X,
} from './Icon';
import { prefetchAll } from '../routes/prefetch';

/**
 * Navigation 组件 - 顶部导航栏
 * 提供应用内页面导航，支持移动端响应式
 * 使用 React.memo 优化：该组件在所有页面都存在，避免不必要的重渲染
 */
function NavigationComponent() {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const insightsRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (insightsRef.current && !insightsRef.current.contains(event.target as Node)) {
        setIsInsightsOpen(false);
      }
      // 检查点击是否在移动菜单或汉堡按钮之外
      // 如果点击的是汉堡按钮，则不关闭菜单（由按钮的onClick处理toggle）
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(event.target as Node) &&
        hamburgerRef.current &&
        !hamburgerRef.current.contains(event.target as Node)
      ) {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ESC 关闭菜单
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsInsightsOpen(false);
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  // 路由变化时关闭移动端菜单
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsInsightsOpen(false);
  }, [location.pathname]);

  // 预加载处理函数 - 鼠标悬停时预加载页面代码和数据
  const handlePrefetch = useCallback((path: string) => {
    prefetchAll(path);
  }, []);

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const isInsightsActive = () => {
    return [
      '/statistics',
      '/learning-time',
      '/trend-report',
      '/achievements',
      '/plan',
      '/word-mastery',
      '/habit-profile',
    ].includes(location.pathname);
  };

  const linkClass = (path: string) => {
    const base =
      'px-4 py-2 rounded-button text-base font-medium transition-all duration-g3-fast ease-g3';
    return isActive(path)
      ? `${base} bg-blue-500 text-white shadow-soft`
      : `${base} text-gray-700 hover:bg-gray-100 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`;
  };

  const mobileLinkClass = (path: string) => {
    const base =
      'block px-4 py-3 rounded-button text-base font-medium transition-all duration-g3-fast ease-g3';
    return isActive(path)
      ? `${base} bg-blue-500 text-white shadow-soft`
      : `${base} text-gray-700 hover:bg-gray-100`;
  };

  const dropdownLinkClass = (path: string) => {
    const base =
      'flex items-center gap-2 px-4 py-2 text-sm transition-colors duration-g3-fast ease-g3';
    return isActive(path)
      ? `${base} bg-blue-50 text-blue-600`
      : `${base} text-gray-700 hover:bg-gray-100`;
  };

  const insightsLinks = [
    { path: '/statistics', icon: ChartBar, label: '学习统计' },
    { path: '/learning-time', icon: Clock, label: '学习时机' },
    { path: '/trend-report', icon: TrendUp, label: '趋势分析' },
    { path: '/achievements', icon: Trophy, label: '成就徽章' },
    { path: '/plan', icon: CalendarCheck, label: '学习计划' },
    { path: '/word-mastery', icon: Target, label: '单词精通度' },
    { path: '/habit-profile', icon: UserCircle, label: '习惯画像' },
  ];

  return (
    <header
      className="fixed left-0 right-0 top-0 z-50 border-b border-gray-200/50 bg-white/80 shadow-soft backdrop-blur-md"
      role="banner"
    >
      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center space-x-2 rounded-button focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="返回首页"
          >
            <h1 className="text-2xl font-bold text-gray-900">词汇学习</h1>
          </Link>

          {/* 桌面端导航 */}
          <nav
            className="hidden items-center space-x-2 lg:flex"
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
              onMouseEnter={() => handlePrefetch('/vocabulary')}
            >
              词库管理
            </Link>
            <Link
              to="/study-settings"
              className={linkClass('/study-settings')}
              aria-current={isActive('/study-settings') ? 'page' : undefined}
              onMouseEnter={() => handlePrefetch('/study-settings')}
            >
              学习设置
            </Link>
            <Link
              to="/history"
              className={linkClass('/history')}
              aria-current={isActive('/history') ? 'page' : undefined}
              onMouseEnter={() => handlePrefetch('/history')}
            >
              学习历史
            </Link>

            {/* 学习洞察下拉菜单 */}
            {isAuthenticated && (
              <div className="relative" ref={insightsRef}>
                <button
                  onClick={() => setIsInsightsOpen(!isInsightsOpen)}
                  className={`flex items-center gap-1 rounded-button px-4 py-2 text-base font-medium transition-all duration-g3-fast ${
                    isInsightsActive()
                      ? 'bg-blue-500 text-white shadow-soft'
                      : 'text-gray-700 hover:scale-105 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95'
                  }`}
                  aria-expanded={isInsightsOpen}
                  aria-haspopup="true"
                >
                  学习洞察
                  <span
                    className={`transition-rotate inline-block ${isInsightsOpen ? 'rotate-180' : ''}`}
                  >
                    <CaretDown size={16} weight="bold" />
                  </span>
                </button>

                {isInsightsOpen && (
                  <div className="animate-fade-in-down absolute right-0 top-full z-50 mt-2 w-48 rounded-button border border-gray-200 bg-white py-1 shadow-elevated">
                    {insightsLinks.map(({ path, icon: Icon, label }) => (
                      <Link
                        key={path}
                        to={path}
                        className={dropdownLinkClass(path)}
                        onClick={() => setIsInsightsOpen(false)}
                        onMouseEnter={() => handlePrefetch(path)}
                      >
                        <Icon size={18} weight="bold" />
                        {label}
                      </Link>
                    ))}
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
                onMouseEnter={() => handlePrefetch('/admin')}
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
                onMouseEnter={() => handlePrefetch('/profile')}
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

          {/* 移动端汉堡菜单按钮 */}
          <button
            ref={hamburgerRef}
            className="rounded-button p-2 text-gray-700 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 lg:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? '关闭菜单' : '打开菜单'}
          >
            {isMobileMenuOpen ? <X size={24} weight="bold" /> : <List size={24} weight="bold" />}
          </button>
        </div>

        {/* 移动端菜单 */}
        {isMobileMenuOpen && (
          <div
            ref={mobileMenuRef}
            className="animate-expand mt-4 border-t border-gray-200 pb-4 pt-4 lg:hidden"
          >
            <nav className="flex flex-col space-y-2" role="navigation" aria-label="移动端导航">
              <Link to="/" className={mobileLinkClass('/')}>
                学习
              </Link>
              <Link
                to="/vocabulary"
                className={mobileLinkClass('/vocabulary')}
                onTouchStart={() => handlePrefetch('/vocabulary')}
              >
                词库管理
              </Link>
              <Link
                to="/study-settings"
                className={mobileLinkClass('/study-settings')}
                onTouchStart={() => handlePrefetch('/study-settings')}
              >
                学习设置
              </Link>
              <Link
                to="/history"
                className={mobileLinkClass('/history')}
                onTouchStart={() => handlePrefetch('/history')}
              >
                学习历史
              </Link>

              {/* 学习洞察子菜单 */}
              {isAuthenticated && (
                <>
                  <div className="px-4 py-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                    学习洞察
                  </div>
                  {insightsLinks.map(({ path, icon: Icon, label }) => (
                    <Link
                      key={path}
                      to={path}
                      className={`${mobileLinkClass(path)} flex items-center gap-2 pl-8`}
                      onTouchStart={() => handlePrefetch(path)}
                    >
                      <Icon size={18} weight="bold" />
                      {label}
                    </Link>
                  ))}
                </>
              )}

              {/* 管理后台 */}
              {isAuthenticated && user?.role === 'ADMIN' && (
                <Link
                  to="/admin"
                  className={mobileLinkClass('/admin')}
                  onTouchStart={() => handlePrefetch('/admin')}
                >
                  管理后台
                </Link>
              )}

              {/* 分隔线 */}
              <div className="my-2 border-t border-gray-200" />

              {/* 认证相关 */}
              {isAuthenticated ? (
                <Link
                  to="/profile"
                  className={mobileLinkClass('/profile')}
                  onTouchStart={() => handlePrefetch('/profile')}
                >
                  {user?.username || '个人资料'}
                </Link>
              ) : (
                <Link to="/login" className={mobileLinkClass('/login')}>
                  登录
                </Link>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}

// Navigation 组件无 props，使用默认浅比较即可
// 内部使用 useLocation 和 useAuth hooks，当这些 hooks 的值变化时会触发重渲染
const Navigation = memo(NavigationComponent);

export default Navigation;
