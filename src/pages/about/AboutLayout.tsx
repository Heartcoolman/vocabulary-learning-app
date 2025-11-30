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
  SignIn
} from '../../components/Icon';

/** 菜单项配置 */
const menuItems = [
  { path: '/about', label: '概览', icon: Sparkle, exact: true },
  { path: '/about/simulation', label: '模拟演示', icon: SlidersHorizontal },
  { path: '/about/dashboard', label: '实时仪表盘', icon: Pulse },
  { path: '/about/stats', label: '统计大屏', icon: ChartBar },
];

export default function AboutLayout() {
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* 侧边栏 */}
      <aside className="w-64 bg-white/80 backdrop-blur-sm border-r border-gray-200/60 flex flex-col">
        {/* 标题区 */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Sparkle size={24} weight="fill" className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">AMAS</h1>
              <p className="text-xs text-gray-500">智能学习引擎</p>
            </div>
          </div>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 p-4 space-y-2">
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
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl
                  transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]
                  ${finalActive
                    ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/25'
                    : 'text-gray-700 hover:bg-gray-100'
                  }
                `}
              >
                <IconComponent
                  size={20}
                  weight={finalActive ? 'fill' : 'regular'}
                />
                <span className={finalActive ? 'font-medium' : ''}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* 底部登录按钮 */}
        <div className="p-4 border-t border-gray-200">
          <Link
            to="/login"
            className="
              flex items-center justify-center gap-2 w-full px-4 py-3
              bg-gradient-to-r from-green-500 to-emerald-500
              text-white font-medium rounded-xl
              shadow-lg shadow-green-500/25
              transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]
              hover:shadow-xl hover:shadow-green-500/30
            "
          >
            <SignIn size={20} weight="bold" />
            开始学习
          </Link>

          <p className="mt-3 text-xs text-center text-gray-400">
            登录后体验完整功能
          </p>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
