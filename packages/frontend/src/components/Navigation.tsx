import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect, memo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  CaretDown,
  Clock,
  TrendUp,
  CalendarCheck,
  ChartBar,
  Target,
  UserCircle,
  List,
  X,
  Shuffle,
} from './Icon';
import { ThemeToggle } from './ThemeToggle';
import { NotificationDropdown } from './notification';
import { prefetchAll } from '../routes/prefetch';
import { Button, Dropdown, buttonVariants, DropdownItem } from './ui';
import { cn } from './ui/utils';

/**
 * Navigation 组件 - 顶部导航栏
 * 提供应用内页面导航，支持移动端响应式
 * 使用 React.memo 优化：该组件在所有页面都存在，避免不必要的重渲染
 */
function NavigationComponent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // 点击外部关闭移动端菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // 检查点击是否在移动菜单或汉堡按钮之外
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
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  // 路由变化时关闭移动端菜单
  useEffect(() => {
    setIsMobileMenuOpen(false);
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
      '/plan',
      '/word-mastery',
      '/habit-profile',
      '/confusion-words',
    ].includes(location.pathname);
  };

  const insightsLinks = [
    { path: '/statistics', icon: <ChartBar size={18} />, label: '学习统计' },
    { path: '/learning-time', icon: <Clock size={18} />, label: '学习时机' },
    { path: '/trend-report', icon: <TrendUp size={18} />, label: '趋势分析' },
    { path: '/plan', icon: <CalendarCheck size={18} />, label: '学习计划' },
    { path: '/word-mastery', icon: <Target size={18} />, label: '单词精通度' },
    { path: '/habit-profile', icon: <UserCircle size={18} />, label: '习惯画像' },
    { path: '/confusion-words', icon: <Shuffle size={18} />, label: '易混淆词' },
  ];

  // 转换 insightsLinks 为 DropdownItem
  const dropdownItems: DropdownItem[] = insightsLinks.map((link) => ({
    key: link.path,
    label: link.label,
    icon: link.icon,
    onClick: () => {
      navigate(link.path);
    },
  }));

  const mobileLinkClass = (path: string) => {
    return buttonVariants({
      variant: isActive(path) ? 'primary' : 'ghost',
      fullWidth: true,
      className: 'justify-start',
    });
  };

  return (
    <header
      className="fixed left-0 right-0 top-0 z-50 border-b border-gray-200/50 bg-white/80 shadow-soft backdrop-blur-md dark:border-slate-700/50 dark:bg-slate-800/80"
      role="banner"
    >
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center space-x-2 rounded-button focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="返回首页"
          >
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">词汇学习</h1>
          </Link>

          {/* 桌面端导航 */}
          <nav
            className="hidden items-center space-x-1 lg:flex"
            role="navigation"
            aria-label="主导航"
          >
            <Link
              to="/"
              className={buttonVariants({ variant: isActive('/') ? 'primary' : 'ghost' })}
              aria-current={isActive('/') ? 'page' : undefined}
            >
              学习
            </Link>
            <Link
              to="/vocabulary"
              className={buttonVariants({ variant: isActive('/vocabulary') ? 'primary' : 'ghost' })}
              aria-current={isActive('/vocabulary') ? 'page' : undefined}
              onMouseEnter={() => handlePrefetch('/vocabulary')}
            >
              词库管理
            </Link>
            <Link
              to="/wordbook-center"
              className={buttonVariants({
                variant: isActive('/wordbook-center') ? 'primary' : 'ghost',
              })}
              aria-current={isActive('/wordbook-center') ? 'page' : undefined}
              onMouseEnter={() => handlePrefetch('/wordbook-center')}
            >
              词库中心
            </Link>
            <Link
              to="/study-settings"
              className={buttonVariants({
                variant: isActive('/study-settings') ? 'primary' : 'ghost',
              })}
              aria-current={isActive('/study-settings') ? 'page' : undefined}
              onMouseEnter={() => handlePrefetch('/study-settings')}
            >
              学习设置
            </Link>
            <Link
              to="/history"
              className={buttonVariants({ variant: isActive('/history') ? 'primary' : 'ghost' })}
              aria-current={isActive('/history') ? 'page' : undefined}
              onMouseEnter={() => handlePrefetch('/history')}
            >
              学习历史
            </Link>

            {/* 学习洞察下拉菜单 */}
            {isAuthenticated && (
              <Dropdown
                trigger={<span>学习洞察</span>}
                items={dropdownItems}
                variant="ghost"
                className={isInsightsActive() ? 'font-medium text-blue-600' : ''}
              />
            )}

            {/* 管理后台入口 - 仅管理员可见 */}
            {isAuthenticated && user?.role === 'ADMIN' && (
              <Link
                to="/admin"
                reloadDocument
                className={buttonVariants({
                  variant: isActive('/admin') ? 'primary' : 'ghost',
                })}
                aria-current={isActive('/admin') ? 'page' : undefined}
              >
                管理后台
              </Link>
            )}

            {/* 认证相关导航 */}
            {isAuthenticated ? (
              <>
                <NotificationDropdown />
                <Link
                  to="/profile"
                  className={buttonVariants({
                    variant: isActive('/profile') ? 'primary' : 'ghost',
                  })}
                  aria-current={isActive('/profile') ? 'page' : undefined}
                  aria-label={`个人资料 - ${user?.username}`}
                  onMouseEnter={() => handlePrefetch('/profile')}
                >
                  {user?.username || '个人资料'}
                </Link>
              </>
            ) : (
              <Link
                to="/login"
                className={buttonVariants({ variant: isActive('/login') ? 'primary' : 'ghost' })}
                aria-current={isActive('/login') ? 'page' : undefined}
              >
                登录
              </Link>
            )}

            {/* 主题切换按钮 */}
            <ThemeToggle />
          </nav>

          {/* 移动端汉堡菜单按钮 */}
          <div className="lg:hidden">
            <Button
              ref={hamburgerRef} // Note: Button Component should forwardRef properly
              variant="ghost"
              size="sm"
              iconOnly
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-expanded={isMobileMenuOpen}
              aria-label={isMobileMenuOpen ? '关闭菜单' : '打开菜单'}
            >
              {isMobileMenuOpen ? <X size={24} /> : <List size={24} />}
            </Button>
          </div>
        </div>

        {/* 移动端菜单 */}
        {isMobileMenuOpen && (
          <div
            ref={mobileMenuRef}
            className="animate-expand mt-4 border-t border-gray-200 pb-4 pt-4 dark:border-slate-700 lg:hidden"
          >
            <nav className="flex flex-col space-y-1" role="navigation" aria-label="移动端导航">
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
                to="/wordbook-center"
                className={mobileLinkClass('/wordbook-center')}
                onTouchStart={() => handlePrefetch('/wordbook-center')}
              >
                词库中心
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
                  <div className="px-4 py-2 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    学习洞察
                  </div>
                  {insightsLinks.map(({ path, icon, label }) => (
                    <Link
                      key={path}
                      to={path}
                      className={cn(mobileLinkClass(path), 'pl-8')}
                      onTouchStart={() => handlePrefetch(path)}
                    >
                      <span className="mr-2">{icon}</span>
                      {label}
                    </Link>
                  ))}
                </>
              )}

              {/* 管理后台 */}
              {isAuthenticated && user?.role === 'ADMIN' && (
                <Link to="/admin" reloadDocument className={mobileLinkClass('/admin')}>
                  管理后台
                </Link>
              )}

              {/* 分隔线 */}
              <div className="my-2 border-t border-gray-200 dark:border-slate-700" />

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
const Navigation = memo(NavigationComponent);

export default Navigation;
