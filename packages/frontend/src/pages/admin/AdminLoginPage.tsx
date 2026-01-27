import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { adminLogin } from '../../services/client/admin/AdminAuthClient';
import { useToast } from '../../components/ui';
import { Eye, EyeSlash, CircleNotch, ShieldCheck } from '../../components/Icon';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading, setAuth } = useAdminAuthStore();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/admin', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError('请输入邮箱和密码');
      return;
    }

    try {
      setIsLoading(true);
      const { user, token } = await adminLogin(email, password);
      setAuth(user, token);
      showToast('success', '登录成功');
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败';
      setError(message);
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <CircleNotch className="h-12 w-12 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 via-blue-50 to-blue-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <ShieldCheck size={32} className="text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">管理后台</h1>
          <p className="mt-2 text-sm text-gray-500">请使用管理员账号登录</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-card bg-white p-8 shadow-elevated"
        >
          {error && (
            <div
              role="alert"
              className="rounded-button border border-red-200 bg-red-50 p-4 text-sm text-red-600"
            >
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              邮箱
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 block w-full rounded-button border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="admin@example.com"
              disabled={isLoading}
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              密码
            </label>
            <div className="relative mt-2">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 pr-12 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="输入密码"
                disabled={isLoading}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-button bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <CircleNotch className="h-5 w-5 animate-spin" />
                登录中...
              </>
            ) : (
              '登录'
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <a href="/" className="text-sm text-gray-500 transition-colors hover:text-blue-600">
            返回主站
          </a>
        </div>
      </div>
    </div>
  );
}
