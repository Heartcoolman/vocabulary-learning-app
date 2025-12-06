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

    // 验证密码长度
    if (password.length < 8) {
      setError('密码长度至少为8个字符');
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8 animate-g3-fade-in">
      <div className="max-w-md w-full">
        {/* 标题 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            创建账号
          </h1>
          <p className="text-gray-600">
            注册后即可开始您的学习之旅
          </p>
        </div>

        {/* 注册表单 */}
        <div className="bg-white p-6 md:p-8 rounded-lg shadow-sm border border-gray-200">
          <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
            {/* 错误提示 */}
            {error && (
              <div
                className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg text-sm"
                role="alert"
                aria-live="assertive"
              >
                {error}
              </div>
            )}

            {/* 用户名输入 */}
            <div className="mb-4">
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                用户名
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="您的昵称"
                autoComplete="name"
                aria-required="true"
                aria-invalid={!!error}
              />
            </div>

            {/* 邮箱输入 */}
            <div className="mb-4">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                邮箱地址
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="your@email.com"
                autoComplete="email"
                aria-required="true"
                aria-invalid={!!error}
              />
            </div>

            {/* 密码输入 */}
            <div className="mb-4">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                密码
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="至少8个字符"
                autoComplete="new-password"
                aria-required="true"
                aria-invalid={!!error}
                aria-describedby="password-hint"
              />
              <p id="password-hint" className="mt-1 text-xs text-gray-500">
                密码长度至少为8个字符
              </p>
            </div>

            {/* 确认密码输入 */}
            <div className="mb-6">
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                确认密码
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              aria-label={loading ? '正在注册...' : '注册'}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></span>
                  注册中...
                </span>
              ) : (
                '注册'
              )}
            </button>
          </form>

          {/* 登录链接 */}
          <div className="mt-6 text-center">
            <p className="text-gray-600 text-sm">
              已有账号？{' '}
              <Link
                to="/login"
                className="text-blue-500 hover:text-blue-600 font-medium transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
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
            className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900 text-sm transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded px-2 py-1"
          >
            <ArrowLeft size={14} weight="bold" />
            了解更多
          </Link>
        </div>
      </div>
    </div>
  );
}
