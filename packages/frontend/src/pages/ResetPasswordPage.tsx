import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import apiClient from '../services/client';

const validatePassword = (password: string): string | null => {
  if (password.length < 10) {
    return '密码长度至少为10个字符';
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_\-+=\[\]{};:'",.<>/?\\|`~]/.test(password);
  if (!hasLetter || !hasDigit || !hasSpecial) {
    return '密码需包含字母、数字和特殊符号';
  }
  return null;
};

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-red-500">无效的重置链接</div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const passwordError = validatePassword(password);
    if (passwordError) {
      setStatus('error');
      setErrorMessage(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setStatus('error');
      setErrorMessage('两次输入的密码不一致');
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      await apiClient.resetPassword(token, password);
      setStatus('success');
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : '重置失败');
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <h2 className="mb-6 text-center text-2xl font-bold text-gray-800">重置密码</h2>
        {status === 'success' ? (
          <div className="mb-4 text-center text-green-600">密码重置成功！即将跳转到登录页...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">新密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                密码长度至少10个字符，需包含字母、数字和特殊符号
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {status === 'error' && <div className="text-sm text-red-500">{errorMessage}</div>}
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {status === 'loading' ? '提交中...' : '确认重置'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
export default ResetPasswordPage;
