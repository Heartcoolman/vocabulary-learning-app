import { useRoutes, BrowserRouter, useLocation, RouteObject } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/ui';
import Navigation from './components/Navigation';
import SyncIndicator from './components/SyncIndicator';
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

  // /about 路由使用独立布局，不显示主导航栏
  const isAboutRoute = location.pathname.startsWith('/about');

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
      <div className="min-h-screen bg-gray-50">
        {!isAboutRoute && <Navigation />}
        <main role="main" className={isAboutRoute ? '' : 'pt-[72px]'}>
          <AppRoutes />
        </main>
      </div>

      {/* 同步状态指示器（仅登录时显示） */}
      {isAuthenticated && <SyncIndicator />}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AppContent />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
