/**
 * AMAS 公开展示布局组件
 *
 * 包含侧边栏导航和主内容区域
 * 无需登录即可访问
 */

import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  Sparkle,
  SlidersHorizontal,
  Pulse,
  ChartBar,
  Cpu,
  ArrowRight,
} from '../../components/Icon';

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
    <div className="relative flex h-dvh min-h-screen w-full overflow-hidden bg-slate-50 text-slate-900 selection:bg-blue-100 dark:bg-slate-900 dark:text-slate-100">
      {/* Aurora Background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-64 -top-64 h-[500px] w-[500px] rounded-full bg-blue-200/40 blur-[100px] dark:bg-blue-900/20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-64 -right-64 h-[500px] w-[500px] rounded-full bg-purple-200/40 blur-[100px] dark:bg-purple-900/20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-1/2 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-emerald-100/40 blur-[100px] dark:bg-emerald-900/20"
      />

      {/* 侧边栏 */}
      <aside className="z-20 flex w-72 flex-col border-r border-white/40 bg-white/60 backdrop-blur-2xl dark:border-slate-700/40 dark:bg-slate-800/60">
        {/* 标题区 */}
        <div className="border-b border-white/20 p-8 dark:border-slate-700/20">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-600 shadow-lg shadow-blue-500/20">
              <Sparkle size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                AMAS
              </h1>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">智能学习引擎</p>
            </div>
          </div>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 space-y-2 p-4">
          {menuItems.map((item) => {
            const finalActive = item.exact
              ? location.pathname === item.path
              : location.pathname.startsWith(item.path);

            const IconComponent = item.icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={finalActive ? 'page' : undefined}
                className={`group flex items-center gap-3 rounded-2xl px-5 py-3.5 text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                  finalActive
                    ? 'bg-white text-blue-600 shadow-soft shadow-slate-200/50 ring-1 ring-black/5 dark:bg-slate-700 dark:text-blue-400 dark:shadow-none'
                    : 'text-slate-500 hover:bg-white/50 hover:text-slate-900 hover:shadow-sm dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-200'
                }`}
              >
                <IconComponent
                  size={18}
                  weight={finalActive ? 'fill' : 'regular'}
                  className={`transition-transform duration-300 ${finalActive ? 'scale-110' : 'group-hover:scale-110'}`}
                />
                <span>{item.label}</span>
                {finalActive && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-500" />}
              </Link>
            );
          })}
        </nav>

        {/* 底部登录按钮 */}
        <div className="border-t border-white/20 p-6 dark:border-slate-700/20">
          <Link
            to="/login"
            className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-medium text-white shadow-lg shadow-slate-900/20 transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-xl active:translate-y-0 dark:bg-blue-600 dark:shadow-blue-500/20 dark:hover:bg-blue-500"
          >
            <span>开始学习</span>
            <ArrowRight
              size={16}
              className="transition-transform duration-300 group-hover:translate-x-1"
            />
          </Link>
          <p className="mt-4 text-center text-xs font-medium uppercase tracking-wider text-slate-400">
            登录后体验完整功能
          </p>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="z-10 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
