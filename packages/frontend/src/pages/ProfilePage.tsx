import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Database, Pulse, ArrowRight, Pencil } from '../components/Icon';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../services/client';
import StorageService from '../services/StorageService';
import { useToast, ConfirmModal } from '../components/ui';

/**
 * 个人资料页面组件
 */
export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout, refreshUser } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'profile' | 'password' | 'cache' | 'habit'>('profile');

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // 编辑用户名状态
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);

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

    if (newPassword.length < 10) {
      setError('新密码长度至少为10个字符');
      return;
    }

    const hasLetter = /[a-zA-Z]/.test(newPassword);
    const hasDigit = /[0-9]/.test(newPassword);
    const hasSpecial = /[!@#$%^&*()_\-+=[\]{};:'",.<>/?\\|`~]/.test(newPassword);
    if (!hasLetter || !hasDigit || !hasSpecial) {
      setError('新密码需包含字母、数字和特殊符号');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }

    setLoading(true);

    try {
      await apiClient.updatePassword(oldPassword, newPassword);
      setSuccess('密码修改成功！即将退出登录...');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // 后端已删除所有session，token已失效，强制退出登录
      setTimeout(async () => {
        await logout();
        navigate('/login');
      }, 1500);
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

  const handleEditUsername = () => {
    setEditUsername(user?.username || '');
    setIsEditingUsername(true);
  };

  const handleSaveUsername = async () => {
    if (!editUsername.trim() || editUsername.trim().length < 2) {
      toast.error('用户名至少2个字符');
      return;
    }
    setUsernameLoading(true);
    try {
      await apiClient.updateProfile({ username: editUsername.trim() });
      await refreshUser();
      toast.success('用户名已更新');
      setIsEditingUsername(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    } finally {
      setUsernameLoading(false);
    }
  };

  const handleCancelEditUsername = () => {
    setIsEditingUsername(false);
    setEditUsername('');
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
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="max-w-md px-4 text-center">
          <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">请先登录</h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">登录后即可查看个人资料</p>
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
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl animate-g3-fade-in px-4 py-8">
        {/* 页面标题 */}
        <h1 className="mb-8 text-3xl font-bold text-gray-900 dark:text-white">个人资料</h1>

        {/* Tab 导航 */}
        <div className="mb-6 border-b border-gray-200 dark:border-slate-700">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-slate-600 dark:hover:text-gray-300'
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
              <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
                <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">基本信息</h2>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400">
                      用户名
                    </label>
                    {isEditingUsername ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editUsername}
                          onChange={(e) => setEditUsername(e.target.value)}
                          disabled={usernameLoading}
                          className="flex-1 rounded-button border border-gray-300 bg-white px-3 py-1.5 text-base transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                          autoFocus
                        />
                        <button
                          onClick={handleSaveUsername}
                          disabled={usernameLoading}
                          className="rounded-button bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                        >
                          {usernameLoading ? '...' : '保存'}
                        </button>
                        <button
                          onClick={handleCancelEditUsername}
                          disabled={usernameLoading}
                          className="rounded-button bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-base text-gray-900 dark:text-white">{user.username}</p>
                        <button
                          onClick={handleEditUsername}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-700 dark:hover:text-gray-300"
                          title="编辑用户名"
                        >
                          <Pencil size={14} weight="bold" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400">
                      邮箱地址
                    </label>
                    <p className="text-base text-gray-900 dark:text-white">{user.email}</p>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400">
                      注册时间
                    </label>
                    <p className="text-base text-gray-900 dark:text-white">
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
              <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
                <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">账号管理</h2>
                <button
                  onClick={() => setLogoutConfirm(true)}
                  className="w-full rounded-button border border-red-200 bg-red-50 px-6 py-3 font-medium text-red-600 transition-all duration-g3-fast hover:scale-105 hover:bg-red-100 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 active:scale-95 dark:border-red-900 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
                >
                  退出登录
                </button>
              </div>
            </div>
          )}

          {activeTab === 'password' && (
            <div className="max-w-2xl space-y-6">
              {/* 修改密码表单 */}
              <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
                <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">修改密码</h2>

                <form onSubmit={handleChangePassword}>
                  {/* 错误提示 */}
                  {error && (
                    <div
                      className="mb-4 rounded-button border border-red-300 bg-red-100 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
                      role="alert"
                      aria-live="assertive"
                    >
                      {error}
                    </div>
                  )}

                  {/* 成功提示 */}
                  {success && (
                    <div
                      className="mb-4 rounded-button border border-green-300 bg-green-100 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400"
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
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      当前密码
                    </label>
                    <input
                      id="oldPassword"
                      type="password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      disabled={loading}
                      className="w-full rounded-button border border-gray-300 bg-white px-4 py-2 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-gray-400"
                      placeholder="输入当前密码"
                      autoComplete="current-password"
                    />
                  </div>

                  {/* 新密码 */}
                  <div className="mb-4">
                    <label
                      htmlFor="newPassword"
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      新密码
                    </label>
                    <input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={loading}
                      className="w-full rounded-button border border-gray-300 bg-white px-4 py-2 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-gray-400"
                      placeholder="至少10个字符"
                      autoComplete="new-password"
                      aria-describedby="new-password-hint"
                    />
                    <p
                      id="new-password-hint"
                      className="mt-1 text-xs text-gray-500 dark:text-gray-400"
                    >
                      密码长度至少10个字符，需包含字母、数字和特殊符号
                    </p>
                  </div>

                  {/* 确认新密码 */}
                  <div className="mb-6">
                    <label
                      htmlFor="confirmPassword"
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      确认新密码
                    </label>
                    <input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={loading}
                      className="w-full rounded-button border border-gray-300 bg-white px-4 py-2 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-gray-400"
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
              <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
                <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">数据缓存</h2>

                {cacheError && (
                  <div
                    className="mb-4 rounded-button border border-red-300 bg-red-100 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
                    role="alert"
                    aria-live="assertive"
                  >
                    {cacheError}
                  </div>
                )}

                {cacheSuccess && (
                  <div
                    className="mb-4 rounded-button border border-green-300 bg-green-100 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400"
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
                    className="w-full rounded-button bg-blue-500 px-6 py-3 font-medium text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-slate-800"
                  >
                    {isSyncing ? '同步中...' : '刷新缓存'}
                  </button>

                  <button
                    onClick={() => setClearCacheConfirm(true)}
                    disabled={isSyncing}
                    className="w-full rounded-button bg-gray-100 px-6 py-3 font-medium text-gray-900 transition-all duration-g3-fast hover:scale-105 hover:bg-gray-200 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600 dark:focus:ring-offset-slate-800"
                  >
                    清除本地缓存
                  </button>
                </div>

                <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                  说明：本地数据仅用于缓存和加速访问，所有内容已实时同步到云端。
                </p>
              </div>
            </div>
          )}

          {activeTab === 'habit' && (
            <div className="max-w-2xl space-y-6">
              <div className="rounded-card border border-indigo-100 bg-gradient-to-br from-indigo-50 to-purple-50 p-8 shadow-soft dark:border-indigo-900 dark:from-indigo-950 dark:to-purple-950">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-card bg-indigo-500">
                    <Pulse size={24} weight="bold" className="text-white" />
                  </div>
                  <div className="flex-1">
                    <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
                      学习习惯分析
                    </h2>
                    <p className="mb-4 text-gray-600 dark:text-gray-400">
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
              <div className="rounded-card border border-gray-200/60 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800">
                <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                  包含以下内容：
                </h3>
                <ul className="space-y-2 text-gray-600 dark:text-gray-400">
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
