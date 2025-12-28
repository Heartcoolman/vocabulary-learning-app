/**
 * AMAS 公开展示布局组件
 *
 * 包含侧边栏导航和主内容区域
 * 无需登录即可访问
 */

import { Outlet, Link, useLocation } from 'react-router-dom';
import { Sparkle, SlidersHorizontal, Pulse, ChartBar, Cpu, SignIn } from '../../components/Icon';

/** 菜单项配置 */
const menuItems = [
  { path: '/about', label: '概览', icon: Sparkle, exact: true },
  { path: '/about/simulation', label: '模拟演示', icon: SlidersHorizontal },
  { path: '/about/dashboard', label: '实时仪表盘', icon: Pulse },
  { path: '/about/stats', label: '统计大屏', icon: ChartBar },
  { path: '/about/system-status', label: '系统状态', icon: Cpu },
];

export default function AboutLayout() {
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* 侧边栏 */}
      <aside className="flex w-64 flex-col border-r border-gray-200/60 bg-white/80 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-800/80">
        {/* 标题区 */}
        <div className="border-b border-gray-200 p-6 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-card bg-gradient-to-br from-blue-500 to-indigo-600 shadow-elevated shadow-blue-500/25">
              <Sparkle size={24} weight="fill" className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">AMAS</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">智能学习引擎</p>
            </div>
          </div>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 space-y-2 p-4">
          {menuItems.map((item) => {
            // 特殊处理：/about 精确匹配
            const finalActive = item.exact
              ? location.pathname === item.path
              : !item.exact && location.pathname.startsWith(item.path);

            const IconComponent = item.icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 rounded-card px-4 py-3 transition-all duration-g3-fast hover:scale-[1.02] active:scale-[0.98] ${
                  finalActive
                    ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-elevated shadow-blue-500/25'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800'
                } `}
              >
                <IconComponent size={20} weight={finalActive ? 'fill' : 'regular'} />
                <span className={finalActive ? 'font-medium' : ''}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* 底部登录按钮 */}
        <div className="border-t border-gray-200 p-4 dark:border-slate-700">
          <Link
            to="/login"
            className="flex w-full items-center justify-center gap-2 rounded-card bg-gradient-to-r from-green-500 to-emerald-500 px-4 py-3 font-medium text-white shadow-elevated shadow-green-500/25 transition-all duration-g3-fast hover:scale-[1.02] hover:shadow-floating hover:shadow-green-500/30 active:scale-[0.98]"
          >
            <SignIn size={20} weight="bold" />
            开始学习
          </Link>

          <p className="mt-3 text-center text-xs text-gray-400">登录后体验完整功能</p>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
