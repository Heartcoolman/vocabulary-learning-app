import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft } from '../components/Icon';

/**
 * 注册页面组件
 */
export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * 处理表单提交
   */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // 验证输入
    if (!email || !password || !confirmPassword || !username) {
      setError('请填写所有字段');
      return;
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }

    // 验证密码长度和复杂度
    if (password.length < 10) {
      setError('密码长度至少为10个字符');
      return;
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*()_\-+=\[\]{};:'",.<>/?\\|`~]/.test(password);
    if (!hasLetter || !hasDigit || !hasSpecial) {
      setError('密码需包含字母、数字和特殊符号');
      return;
    }

    // 验证密码匹配
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    // 验证用户名
    if (username.trim().length < 2) {
      setError('用户名至少为2个字符');
      return;
    }

    setLoading(true);

    try {
      await register(email, password, username);
      // 注册成功，跳转到首页
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 处理键盘事件
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleSubmit(e as any);
    }
  };

  return (
    <div className="flex min-h-screen animate-g3-fade-in items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md">
        {/* 标题 */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">创建账号</h1>
          <p className="text-gray-600">注册后即可开始您的学习之旅</p>
        </div>

        {/* 注册表单 */}
        <div className="rounded-button border border-gray-200 bg-white p-6 shadow-soft md:p-8">
          <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
            {/* 错误提示 */}
            {error && (
              <div
                className="mb-4 rounded-button border border-red-300 bg-red-100 p-3 text-sm text-red-700"
                role="alert"
                aria-live="assertive"
              >
                {error}
              </div>
            )}

            {/* 用户名输入 */}
            <div className="mb-4">
              <label htmlFor="username" className="mb-2 block text-sm font-medium text-gray-700">
                用户名
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                className="w-full rounded-button border border-gray-300 px-4 py-2 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="您的昵称"
                autoComplete="name"
                aria-required="true"
                aria-invalid={!!error}
              />
            </div>

            {/* 邮箱输入 */}
            <div className="mb-4">
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">
                邮箱地址
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full rounded-button border border-gray-300 px-4 py-2 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="your@email.com"
                autoComplete="email"
                aria-required="true"
                aria-invalid={!!error}
              />
            </div>

            {/* 密码输入 */}
            <div className="mb-4">
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-700">
                密码
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full rounded-button border border-gray-300 px-4 py-2 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="至少10个字符"
                autoComplete="new-password"
                aria-required="true"
                aria-invalid={!!error}
                aria-describedby="password-hint"
              />
              <p id="password-hint" className="mt-1 text-xs text-gray-500">
                密码长度至少10个字符，需包含字母、数字和特殊符号
              </p>
            </div>

            {/* 确认密码输入 */}
            <div className="mb-6">
              <label
                htmlFor="confirmPassword"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                确认密码
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                className="w-full rounded-button border border-gray-300 px-4 py-2 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="再次输入密码"
                autoComplete="new-password"
                aria-required="true"
                aria-invalid={!!error}
              />
            </div>

            {/* 注册按钮 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-button bg-blue-500 px-6 py-3 font-medium text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
              aria-label={loading ? '正在注册...' : '注册'}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <span className="mr-2 h-5 w-5 animate-spin rounded-full border-b-2 border-white"></span>
                  注册中...
                </span>
              ) : (
                '注册'
              )}
            </button>
          </form>

          {/* 登录链接 */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              已有账号？{' '}
              <Link
                to="/login"
                className="rounded font-medium text-blue-500 transition-colors hover:text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                立即登录
              </Link>
            </p>
          </div>
        </div>

        {/* 了解更多链接 */}
        <div className="mt-4 text-center">
          <Link
            to="/about"
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-gray-600 transition-colors hover:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <ArrowLeft size={14} weight="bold" />
            了解更多
          </Link>
        </div>
      </div>
    </div>
  );
}
