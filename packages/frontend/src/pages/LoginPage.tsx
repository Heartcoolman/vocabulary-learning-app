import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft } from '../components/Icon';
import { Button, Input } from '../components/ui';

/**
 * 登录页面组件
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * 处理表单提交
   */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // 验证输入
    if (!email || !password) {
      setError('请填写所有字段');
      return;
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }

    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请检查邮箱和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen animate-g3-fade-in items-center justify-center bg-gray-50 px-4 py-8 dark:bg-slate-900">
      <div className="w-full max-w-md">
        {/* 标题 */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">欢迎回来</h1>
          <p className="text-gray-600 dark:text-gray-400">登录您的账号继续学习</p>
        </div>

        {/* 登录表单 */}
        <div className="rounded-card border border-gray-200 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 错误提示 */}
            {error && (
              <div
                className="rounded-button border border-red-300 bg-red-100 p-3 text-sm text-red-700"
                role="alert"
                aria-live="assertive"
              >
                {error}
              </div>
            )}

            <div className="space-y-4">
              {/* 邮箱输入 */}
              <Input
                id="email"
                type="email"
                label="邮箱地址"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                placeholder="your@email.com"
                autoComplete="email"
                required
                fullWidth
                error={!!error && error.includes('邮箱')}
              />

              {/* 密码输入 */}
              <div>
                <div className="mb-2 flex items-center justify-end">
                  <Link to="/forgot-password" className="text-sm text-blue-500 hover:text-blue-600">
                    忘记密码？
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  label="密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  fullWidth
                  error={!!error && error.includes('密码')}
                />
              </div>
            </div>

            {/* 登录按钮 */}
            <Button
              type="submit"
              disabled={loading}
              loading={loading}
              fullWidth
              variant="primary"
              size="lg"
            >
              登录
            </Button>
          </form>

          {/* 注册链接 */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              还没有账号？{' '}
              <Link
                to="/register"
                className="rounded font-medium text-blue-500 transition-colors hover:text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                立即注册
              </Link>
            </p>
          </div>
        </div>

        {/* 了解更多链接 */}
        <div className="mt-4 text-center">
          <Link
            to="/about"
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-gray-600 transition-colors hover:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-gray-400 dark:hover:text-white"
          >
            <ArrowLeft size={14} />
            了解更多
          </Link>
        </div>
      </div>
    </div>
  );
}
