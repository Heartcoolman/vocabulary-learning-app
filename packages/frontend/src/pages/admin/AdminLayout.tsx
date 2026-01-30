import { Outlet, Link, useLocation } from 'react-router-dom';
import { usePrefetch } from '../../hooks/usePrefetch';
import { useSystemVersion } from '../../hooks/queries';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { adminLogout } from '../../services/client/admin/AdminAuthClient';
import {
  ChartBar,
  UsersThree,
  Books,
  ArrowLeft,
  Gear,
  Clock,
  FileText,
  Bell,
  Target,
  Brain,
  Robot,
  Lightbulb,
  Bug,
  ChartLine,
  Sparkle,
  Queue,
  Heartbeat,
  Activity,
} from '../../components/Icon';

function VersionDisplay() {
  const { data: versionInfo } = useSystemVersion();

  if (!versionInfo) {
    return null;
  }

  return (
    <div className="mb-2 flex items-center justify-between px-4 py-2">
      <span className="text-xs text-gray-500 dark:text-gray-400">
        v{versionInfo.currentVersion}
      </span>
      {versionInfo.hasUpdate && versionInfo.releaseUrl && versionInfo.latestVersion && (
        <a
          href={versionInfo.releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50"
        >
          新版本 v{versionInfo.latestVersion}
        </a>
      )}
    </div>
  );
}

export default function AdminLayout() {
  const location = useLocation();
  const { prefetchOnHover } = usePrefetch();
  const { user, clearAuth } = useAdminAuthStore();

  const handleLogout = async () => {
    await adminLogout();
    clearAuth();
  };

  const menuItems = [
    { path: '/admin', label: '仪表盘', icon: ChartBar, exact: true },
    { path: '/admin/users', label: '用户管理', icon: UsersThree },
    { path: '/admin/wordbooks', label: '系统词库', icon: Books },
    { path: '/admin/word-quality', label: '词库质量', icon: Sparkle },
    { path: '/admin/algorithm-config', label: '算法配置', icon: Gear },
    { path: '/admin/config-history', label: '配置历史', icon: Clock },
    { path: '/admin/optimization', label: '优化分析', icon: Target },
    { path: '/admin/causal-analysis', label: '因果分析', icon: Brain },
    { path: '/admin/llm-advisor', label: 'LLM 顾问', icon: Robot },
    { path: '/admin/llm-tasks', label: 'LLM 任务', icon: Queue },
    { path: '/admin/amas-monitoring', label: 'AMAS 监控', icon: Heartbeat },
    { path: '/admin/workflow-monitor', label: '工作流监控', icon: Activity },
    { path: '/admin/amas-explainability', label: 'AMAS 可解释性', icon: Lightbulb },
    { path: '/admin/weekly-report', label: '运营周报', icon: ChartLine },
    { path: '/admin/broadcasts', label: '广播通知', icon: Bell },
    { path: '/admin/logs', label: '系统日志', icon: FileText },
    { path: '/admin/log-alerts', label: '告警规则', icon: Bell },
    { path: '/admin/system-debug', label: '系统调试', icon: Bug },
    { path: '/admin/settings', label: '系统设置', icon: Gear },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* 侧边栏 */}
      <aside className="sticky top-0 flex h-screen w-64 flex-col overflow-y-auto border-r border-gray-200/60 bg-white/80 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
        <div className="border-b border-gray-200 p-6 dark:border-slate-700">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">管理后台</h1>
          {user && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{user.username}</p>}
        </div>

        <nav className="flex-1 space-y-2 p-4">
          {menuItems.map((item) => {
            const isActive = item.exact
              ? location.pathname === item.path
              : location.pathname.startsWith(item.path);

            const IconComponent = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                {...prefetchOnHover(item.path)}
                className={`flex items-center gap-2 rounded-button px-4 py-2 transition-all duration-g3-fast hover:scale-105 active:scale-95 ${
                  isActive
                    ? 'bg-blue-50 font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700'
                } `}
              >
                <IconComponent size={20} weight="bold" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-200 p-4 dark:border-slate-700">
          <VersionDisplay />
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-button px-4 py-2 text-gray-700 transition-all hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700"
          >
            <ArrowLeft size={16} weight="bold" />
            退出登录
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex flex-1 flex-col">
        <div className="flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
