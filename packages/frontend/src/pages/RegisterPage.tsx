import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft } from '../components/Icon';
import { Button, Input } from '../components/ui';

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
    const hasSpecial = /[!@#$%^&*()_\-+=[\]{};:'",.<>/?\\|`~]/.test(password);
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
      handleSubmit(e as React.FormEvent);
    }
  };

  return (
    <div className="flex min-h-screen animate-g3-fade-in items-center justify-center bg-gray-50 px-4 py-8 dark:bg-slate-900">
      <div className="w-full max-w-md">
        {/* 标题 */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">创建账号</h1>
          <p className="text-gray-600 dark:text-gray-400">注册后即可开始您的学习之旅</p>
        </div>

        {/* 注册表单 */}
        <div className="rounded-card border border-gray-200 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800 md:p-8">
          <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-6">
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
              {/* 用户名输入 */}
              <Input
                id="username"
                type="text"
                label="用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                placeholder="您的昵称"
                autoComplete="name"
                required
                fullWidth
                error={!!error && error.includes('用户名')}
              />

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
              <Input
                id="password"
                type="password"
                label="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                placeholder="至少10个字符"
                autoComplete="new-password"
                required
                fullWidth
                error={
                  !!error &&
                  (error.includes('密码') || error.includes('长度') || error.includes('一致'))
                }
                helperText="密码长度至少10个字符，需包含字母、数字和特殊符号"
              />

              {/* 确认密码输入 */}
              <Input
                id="confirmPassword"
                type="password"
                label="确认密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                placeholder="再次输入密码"
                autoComplete="new-password"
                required
                fullWidth
                error={!!error && error.includes('一致')}
              />
            </div>

            {/* 注册按钮 */}
            <Button
              type="submit"
              disabled={loading}
              loading={loading}
              fullWidth
              variant="primary"
              size="lg"
            >
              注册
            </Button>
          </form>

          {/* 登录链接 */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
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
