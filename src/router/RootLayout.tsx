import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Navigation from '../components/Navigation';
import SyncIndicator from '../components/SyncIndicator';

/**
 * RootLayout - 应用根布局组件
 *
 * 功能：
 * - 根据路由决定是否显示导航栏
 * - 管理主内容区域的布局
 * - 显示同步状态指示器
 */
export default function RootLayout() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  // /about 路由使用独立布局，不显示主导航栏
  const isAboutRoute = location.pathname.startsWith('/about');

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {!isAboutRoute && <Navigation />}
        <main role="main" className={isAboutRoute ? '' : 'pt-[72px]'}>
          <Outlet />
        </main>
      </div>

      {/* 同步状态指示器（仅登录时显示） */}
      {isAuthenticated && <SyncIndicator />}
    </>
  );
}
