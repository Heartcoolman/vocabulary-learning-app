import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Database, Pulse, ArrowRight } from '../components/Icon';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../services/client';
import StorageService from '../services/StorageService';
import { useToast, ConfirmModal } from '../components/ui';

/**
 * 个人资料页面组件
 */
export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'profile' | 'password' | 'cache' | 'habit'>('profile');

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // 缓存/同步状态
  const [cacheError, setCacheError] = useState('');
  const [cacheSuccess, setCacheSuccess] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // 确认弹窗状态
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [clearCacheConfirm, setClearCacheConfirm] = useState(false);

  /**
   * 处理修改密码
   */
  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // 验证输入
    if (!oldPassword || !newPassword || !confirmPassword) {
      setError('请填写所有密码字段');
      return;
    }

    if (newPassword.length < 8) {
      setError('新密码长度至少为8个字符');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }

    setLoading(true);

    try {
      await apiClient.updatePassword(oldPassword, newPassword);
      setSuccess('密码修改成功！');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '密码修改失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 处理退出登录
   */
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  /**
   * 手动刷新缓存
   */
  const handleSync = async () => {
    setCacheError('');
    setCacheSuccess('');
    setIsSyncing(true);
    try {
      await StorageService.syncToCloud();
      setCacheSuccess('已刷新缓存并同步最新数据');
    } catch (err) {
      setCacheError(err instanceof Error ? err.message : '同步失败');
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * 清除本地缓存数据
   */
  const handleClearCache = async () => {
    try {
      await StorageService.deleteDatabase();
      toast.success('本地缓存已清除');
      setCacheError('');
      setCacheSuccess('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '清除缓存失败');
    }
    setClearCacheConfirm(false);
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
        <div className="max-w-md px-4 text-center">
          <h2 className="mb-4 text-2xl font-bold text-gray-900">请先登录</h2>
          <p className="mb-6 text-gray-600">登录后即可查看个人资料</p>
          <button
            onClick={() => navigate('/login')}
            className="rounded-button bg-blue-500 px-6 py-3 font-medium text-white transition-all duration-g3-fast hover:bg-blue-600"
          >
            前往登录
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'profile' as const, label: '基本信息', icon: User },
    { id: 'password' as const, label: '修改密码', icon: Lock },
    { id: 'cache' as const, label: '数据管理', icon: Database },
    { id: 'habit' as const, label: '学习习惯', icon: Pulse },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="mx-auto max-w-7xl animate-g3-fade-in px-4 py-8">
        {/* 页面标题 */}
        <h1 className="mb-8 text-3xl font-bold text-gray-900">个人资料</h1>

        {/* Tab 导航 */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  } `}
                  aria-current={activeTab === tab.id ? 'page' : undefined}
                >
                  <Icon size={18} weight="bold" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab 内容 */}
        <div className="mt-6">
          {activeTab === 'profile' && (
            <div className="max-w-2xl space-y-6">
              {/* 用户信息卡片 */}
              <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm">
                <h2 className="mb-4 text-xl font-bold text-gray-900">基本信息</h2>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-600">用户名</label>
                    <p className="text-base text-gray-900">{user.username}</p>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-600">邮箱地址</label>
                    <p className="text-base text-gray-900">{user.email}</p>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-600">注册时间</label>
                    <p className="text-base text-gray-900">
                      {new Date(user.createdAt).toLocaleDateString('zh-CN', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              </div>

              {/* 账号管理 */}
              <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm">
                <h2 className="mb-4 text-xl font-bold text-gray-900">账号管理</h2>
                <button
                  onClick={() => setLogoutConfirm(true)}
                  className="w-full rounded-button border border-red-200 bg-red-50 px-6 py-3 font-medium text-red-600 transition-all duration-g3-fast hover:scale-105 hover:bg-red-100 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 active:scale-95"
                >
                  退出登录
                </button>
              </div>
            </div>
          )}

          {activeTab === 'password' && (
            <div className="max-w-2xl space-y-6">
              {/* 修改密码表单 */}
              <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm">
                <h2 className="mb-4 text-xl font-bold text-gray-900">修改密码</h2>

                <form onSubmit={handleChangePassword}>
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

                  {/* 成功提示 */}
                  {success && (
                    <div
                      className="mb-4 rounded-button border border-green-300 bg-green-100 p-3 text-sm text-green-700"
                      role="status"
                      aria-live="polite"
                    >
                      {success}
                    </div>
                  )}

                  {/* 旧密码 */}
                  <div className="mb-4">
                    <label
                      htmlFor="oldPassword"
                      className="mb-2 block text-sm font-medium text-gray-700"
                    >
                      当前密码
                    </label>
                    <input
                      id="oldPassword"
                      type="password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      disabled={loading}
                      className="w-full rounded-button border border-gray-300 px-4 py-2 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="输入当前密码"
                      autoComplete="current-password"
                    />
                  </div>

                  {/* 新密码 */}
                  <div className="mb-4">
                    <label
                      htmlFor="newPassword"
                      className="mb-2 block text-sm font-medium text-gray-700"
                    >
                      新密码
                    </label>
                    <input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={loading}
                      className="w-full rounded-button border border-gray-300 px-4 py-2 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="至少8个字符"
                      autoComplete="new-password"
                      aria-describedby="new-password-hint"
                    />
                    <p id="new-password-hint" className="mt-1 text-xs text-gray-500">
                      密码长度至少8个字符
                    </p>
                  </div>

                  {/* 确认新密码 */}
                  <div className="mb-6">
                    <label
                      htmlFor="confirmPassword"
                      className="mb-2 block text-sm font-medium text-gray-700"
                    >
                      确认新密码
                    </label>
                    <input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={loading}
                      className="w-full rounded-button border border-gray-300 px-4 py-2 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="再次输入新密码"
                      autoComplete="new-password"
                    />
                  </div>

                  {/* 提交按钮 */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-button bg-blue-500 px-6 py-3 font-medium text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                  >
                    {loading ? '修改中...' : '修改密码'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'cache' && (
            <div className="max-w-2xl space-y-6">
              {/* 数据缓存管理 */}
              <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm">
                <h2 className="mb-4 text-xl font-bold text-gray-900">数据缓存</h2>

                {cacheError && (
                  <div
                    className="mb-4 rounded-button border border-red-300 bg-red-100 p-3 text-sm text-red-700"
                    role="alert"
                    aria-live="assertive"
                  >
                    {cacheError}
                  </div>
                )}

                {cacheSuccess && (
                  <div
                    className="mb-4 rounded-button border border-green-300 bg-green-100 p-3 text-sm text-green-700"
                    role="status"
                    aria-live="polite"
                  >
                    {cacheSuccess}
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="w-full rounded-button bg-blue-500 px-6 py-3 font-medium text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSyncing ? '同步中...' : '刷新缓存'}
                  </button>

                  <button
                    onClick={() => setClearCacheConfirm(true)}
                    disabled={isSyncing}
                    className="w-full rounded-button bg-gray-100 px-6 py-3 font-medium text-gray-900 transition-all duration-g3-fast hover:scale-105 hover:bg-gray-200 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    清除本地缓存
                  </button>
                </div>

                <p className="mt-4 text-xs text-gray-500">
                  说明：本地数据仅用于缓存和加速访问，所有内容已实时同步到云端。
                </p>
              </div>
            </div>
          )}

          {activeTab === 'habit' && (
            <div className="max-w-2xl space-y-6">
              <div className="rounded-card border border-indigo-100 bg-gradient-to-br from-indigo-50 to-purple-50 p-8 shadow-soft">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-card bg-indigo-500">
                    <Pulse size={24} weight="bold" className="text-white" />
                  </div>
                  <div className="flex-1">
                    <h2 className="mb-2 text-2xl font-bold text-gray-900">学习习惯分析</h2>
                    <p className="mb-4 text-gray-600">
                      深入了解您的学习节奏、偏好时段和动机模式。基于 AMAS
                      系统的实时数据分析，为您提供个性化的学习建议。
                    </p>
                    <button
                      onClick={() => navigate('/habit-profile')}
                      className="inline-flex items-center gap-2 rounded-button bg-indigo-600 px-6 py-3 font-medium text-white shadow-elevated transition-all duration-g3-fast hover:scale-105 hover:bg-indigo-700 hover:shadow-elevated active:scale-95"
                    >
                      查看完整分析
                      <ArrowRight size={18} weight="bold" />
                    </button>
                  </div>
                </div>
              </div>

              {/* 功能说明 */}
              <div className="rounded-card border border-gray-200/60 bg-white p-6 shadow-soft">
                <h3 className="mb-3 text-lg font-semibold text-gray-900">包含以下内容：</h3>
                <ul className="space-y-2 text-gray-600">
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-indigo-500"></div>
                    <span>生物钟类型分析（早鸟型 / 夜猫子型）</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-indigo-500"></div>
                    <span>学习节奏评估（快节奏 / 慢节奏）</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-indigo-500"></div>
                    <span>动机模式识别（学习动力来源分析）</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-indigo-500"></div>
                    <span>学习热力图（活跃时段可视化）</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 退出登录确认弹窗 */}
      <ConfirmModal
        isOpen={logoutConfirm}
        onClose={() => setLogoutConfirm(false)}
        onConfirm={handleLogout}
        title="退出登录"
        message="确定要退出登录吗？"
        confirmText="退出"
        cancelText="取消"
        variant="warning"
      />

      {/* 清除缓存确认弹窗 */}
      <ConfirmModal
        isOpen={clearCacheConfirm}
        onClose={() => setClearCacheConfirm(false)}
        onConfirm={handleClearCache}
        title="清除缓存"
        message="将清除本地缓存数据（不影响云端），确定继续吗？"
        confirmText="清除"
        cancelText="取消"
        variant="warning"
      />
    </div>
  );
}
