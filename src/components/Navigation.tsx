import { Link, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { CaretDown, Clock, TrendUp, Trophy, CalendarCheck, ChartBar, Target, UserCircle, List, X } from './Icon';
import { fadeInVariants, g3SpringStandard } from '../utils/animations';

/**
 * Navigation 组件 - 顶部导航栏
 * 提供应用内页面导航，支持移动端响应式
 */
export default function Navigation() {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const insightsRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (insightsRef.current && !insightsRef.current.contains(event.target as Node)) {
        setIsInsightsOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
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

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const isInsightsActive = () => {
    return ['/statistics', '/learning-time', '/trend-report', '/achievements', '/plan', '/word-mastery', '/habit-profile'].includes(location.pathname);
  };

  const linkClass = (path: string) => {
    const base = 'px-4 py-2 rounded-lg text-base font-medium transition-all duration-200';
    return isActive(path)
      ? `${base} bg-blue-500 text-white shadow-sm`
      : `${base} text-gray-700 hover:bg-gray-100 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`;
  };

  const mobileLinkClass = (path: string) => {
    const base = 'block px-4 py-3 rounded-lg text-base font-medium transition-all duration-200';
    return isActive(path)
      ? `${base} bg-blue-500 text-white shadow-sm`
      : `${base} text-gray-700 hover:bg-gray-100`;
  };

  const dropdownLinkClass = (path: string) => {
    const base = 'flex items-center gap-2 px-4 py-2 text-sm transition-colors';
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

          {/* 桌面端导航 */}
          <nav
            className="hidden lg:flex items-center space-x-2"
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
                  <motion.div
                    animate={{ rotate: isInsightsOpen ? 180 : 0 }}
                    transition={g3SpringStandard}
                  >
                    <CaretDown size={16} weight="bold" />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {isInsightsOpen && (
                    <motion.div
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      variants={fadeInVariants}
                      className="absolute top-full right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
                    >
                      {insightsLinks.map(({ path, icon: Icon, label }) => (
                        <Link
                          key={path}
                          to={path}
                          className={dropdownLinkClass(path)}
                          onClick={() => setIsInsightsOpen(false)}
                        >
                          <Icon size={18} weight="bold" />
                          {label}
                        </Link>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
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

          {/* 移动端汉堡菜单按钮 */}
          <button
            className="lg:hidden p-2 rounded-lg text-gray-700 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? '关闭菜单' : '打开菜单'}
          >
            {isMobileMenuOpen ? (
              <X size={24} weight="bold" />
            ) : (
              <List size={24} weight="bold" />
            )}
          </button>
        </div>

        {/* 移动端菜单 */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              ref={mobileMenuRef}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden mt-4 pb-4 border-t border-gray-200 pt-4"
            >
              <nav className="flex flex-col space-y-2" role="navigation" aria-label="移动端导航">
                <Link to="/" className={mobileLinkClass('/')}>
                  学习
                </Link>
                <Link to="/vocabulary" className={mobileLinkClass('/vocabulary')}>
                  词库管理
                </Link>
                <Link to="/study-settings" className={mobileLinkClass('/study-settings')}>
                  学习设置
                </Link>
                <Link to="/history" className={mobileLinkClass('/history')}>
                  学习历史
                </Link>

                {/* 学习洞察子菜单 */}
                {isAuthenticated && (
                  <>
                    <div className="px-4 py-2 text-sm font-semibold text-gray-500 uppercase tracking-wider">
                      学习洞察
                    </div>
                    {insightsLinks.map(({ path, icon: Icon, label }) => (
                      <Link
                        key={path}
                        to={path}
                        className={`${mobileLinkClass(path)} flex items-center gap-2 pl-8`}
                      >
                        <Icon size={18} weight="bold" />
                        {label}
                      </Link>
                    ))}
                  </>
                )}

                {/* 管理后台 */}
                {isAuthenticated && user?.role === 'ADMIN' && (
                  <Link to="/admin" className={mobileLinkClass('/admin')}>
                    管理后台
                  </Link>
                )}

                {/* 分隔线 */}
                <div className="border-t border-gray-200 my-2" />

                {/* 认证相关 */}
                {isAuthenticated ? (
                  <Link to="/profile" className={mobileLinkClass('/profile')}>
                    {user?.username || '个人资料'}
                  </Link>
                ) : (
                  <Link to="/login" className={mobileLinkClass('/login')}>
                    登录
                  </Link>
                )}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
