import { useRoutes, BrowserRouter, useLocation, RouteObject } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { IconContext } from '@phosphor-icons/react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider, OfflineIndicator } from './components/ui';
import Navigation from './components/Navigation';
import SyncIndicator from './components/SyncIndicator';
import { BroadcastListener } from './components/notification/BroadcastListener';
import { routes } from './routes';
import { queryClient } from './lib/queryClient';
import { prefetchPriorityRoutes, prefetchPriorityData } from './routes/prefetch';

/**
 * 路由渲染组件
 */
function AppRoutes() {
  const element = useRoutes(routes as RouteObject[]);
  return element;
}

/**
 * AppContent - 应用主内容（需要在AuthProvider内部）
 */
function AppContent() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const hasPrefetchedRef = useRef(false);

  // 独立页面路由，不显示主导航栏
  const isStandalonePage =
    location.pathname.startsWith('/about') || location.pathname === '/system-status';

  // 用户登录后，在浏览器空闲时预加载常用路由
  useEffect(() => {
    if (isAuthenticated && !hasPrefetchedRef.current) {
      hasPrefetchedRef.current = true;
      // 预加载常用页面代码
      prefetchPriorityRoutes();
      // 预取常用页面数据
      prefetchPriorityData();
    }
  }, [isAuthenticated]);

  return (
    <>
      {/* 离线状态提示 */}
      <OfflineIndicator position="top" />

      <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
        {!isStandalonePage && <Navigation />}
        <main role="main" className={isStandalonePage ? '' : 'pt-[72px]'}>
          <AppRoutes />
        </main>
      </div>

      {/* 同步状态指示器（仅登录时显示） */}
      {isAuthenticated && <SyncIndicator />}

      {/* 广播监听器（仅登录时启用） */}
      {isAuthenticated && <BroadcastListener />}
    </>
  );
}

function App() {
  return (
    <IconContext.Provider value={{ weight: 'duotone' }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <BrowserRouter>
            <AuthProvider>
              <ToastProvider>
                <AppContent />
              </ToastProvider>
            </AuthProvider>
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </IconContext.Provider>
  );
}

export default App;
