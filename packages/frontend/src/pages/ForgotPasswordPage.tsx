import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../services/client';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    try {
      await apiClient.requestPasswordReset(email);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : '请求失败');
    }
  };

  if (status === 'success') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4 dark:bg-slate-900">
        <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-800">
          <h2 className="mb-4 text-2xl font-bold text-gray-800 dark:text-white">邮件已发送</h2>
          <p className="mb-6 text-gray-600 dark:text-slate-300">
            如果该邮箱已注册，我们已发送了一封包含重置密码链接的邮件，请查收。
          </p>
          <Link to="/login" className="text-blue-600 hover:underline dark:text-blue-400">
            返回登录
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4 dark:bg-slate-900">
      <div className="w-full max-w-md rounded-card bg-white p-8 shadow-soft dark:bg-slate-800">
        <h2 className="mb-6 text-center text-2xl font-bold text-gray-800 dark:text-white">
          找回密码
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300"
            >
              注册邮箱
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-button border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              placeholder="Enter your email"
            />
          </div>
          {status === 'error' && <div className="text-sm text-red-500">{errorMessage}</div>}
          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full rounded-button bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {status === 'loading' ? '发送中...' : '发送重置邮件'}
          </button>
        </form>
        <div className="mt-4 text-center">
          <Link
            to="/login"
            className="text-sm text-gray-600 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            想起密码了？去登录
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
