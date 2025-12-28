import { useNavigate } from 'react-router-dom';
import { WarningCircle, House } from '../components/Icon';

export default function ForbiddenPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-red-50/30 px-4 dark:from-slate-900 dark:via-slate-800 dark:to-red-950/30">
      <div className="max-w-md text-center">
        <div className="mb-6">
          <WarningCircle size={96} weight="duotone" color="#dc2626" className="mx-auto" />
        </div>

        <h1 className="mb-2 text-6xl font-bold text-gray-900 dark:text-white">403</h1>
        <h2 className="mb-4 text-2xl font-semibold text-gray-700 dark:text-gray-300">访问被拒绝</h2>

        <p className="mb-8 text-gray-600 dark:text-gray-400">
          抱歉，您没有权限访问此页面。
          <br />
          请联系管理员获取访问权限。
        </p>

        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <House size={20} weight="duotone" />
          返回首页
        </button>
      </div>
    </div>
  );
}
