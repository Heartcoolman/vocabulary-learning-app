import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../services/ApiClient';
import StorageService from '../services/StorageService';

/**
 * 个人资料页面组件
 */
export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  
  // 统计信息
  const [statistics, setStatistics] = useState({
    totalWords: 0,
    totalRecords: 0,
    correctRate: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // 数据迁移状态
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState('');
  const [migrationSuccess, setMigrationSuccess] = useState('');
  const [isMigrated, setIsMigrated] = useState(false);

  /**
   * 加载统计信息和迁移状态
   */
  useEffect(() => {
    const loadData = async () => {
      try {
        const stats = await apiClient.getUserStatistics();
        setStatistics(stats);
        
        const migrated = await StorageService.isMigrated();
        setIsMigrated(migrated);
      } catch (err) {
        console.error('加载数据失败:', err);
      } finally {
        setStatsLoading(false);
      }
    };

    loadData();
  }, []);

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

    // 验证新密码长度
    if (newPassword.length < 8) {
      setError('新密码长度至少为8个字符');
      return;
    }

    // 验证密码匹配
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
    if (window.confirm('确定要退出登录吗？')) {
      await logout();
      navigate('/login');
    }
  };

  /**
   * 处理数据迁移
   */
  const handleMigration = async () => {
    if (!window.confirm('确定要将本地数据迁移到云端吗？')) {
      return;
    }

    setIsMigrating(true);
    setMigrationError('');
    setMigrationSuccess('');

    try {
      const result = await StorageService.migrateToCloud();
      setMigrationSuccess(`成功迁移 ${result.words} 个单词和 ${result.records} 条学习记录`);
      setIsMigrated(true);
      
      // 刷新统计信息
      const stats = await apiClient.getUserStatistics();
      setStatistics(stats);
    } catch (err) {
      setMigrationError(err instanceof Error ? err.message : '迁移失败');
    } finally {
      setIsMigrating(false);
    }
  };

  /**
   * 手动触发同步
   */
  const handleSync = async () => {
    try {
      await StorageService.syncToCloud();
      // 同步成功，状态会通过 SyncIndicator 显示
    } catch (err) {
      // 同步失败，错误会通过 SyncIndicator 显示
      console.error('手动同步失败:', err);
    }
  };

  /**
   * 清除本地数据库
   */
  const handleClearDatabase = async () => {
    if (!window.confirm('⚠️ 警告：这将删除所有本地数据（IndexedDB）！\n\n如果你已经同步到云端，可以重新登录恢复数据。\n\n确定要继续吗？')) {
      return;
    }

    try {
      await StorageService.deleteDatabase();
      alert('✅ 本地数据库已清除！\n\n页面将刷新以重新初始化。');
      window.location.reload();
    } catch (err) {
      alert('❌ 清除失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-fade-in">
      {/* 页面标题 */}
      <h1 className="text-3xl font-bold text-gray-900 mb-8">个人资料</h1>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 用户信息卡片 */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-xl font-bold text-gray-900 mb-4">基本信息</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                用户名
              </label>
              <p className="text-base text-gray-900">{user.username}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                邮箱地址
              </label>
              <p className="text-base text-gray-900">{user.email}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                注册时间
              </label>
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

        {/* 学习统计卡片 */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-xl font-bold text-gray-900 mb-4">学习统计</h2>
          
          {statsLoading ? (
            <div className="text-center py-8" role="status" aria-live="polite">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
              <p className="text-gray-600 text-sm">加载中...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  词库单词数
                </label>
                <p className="text-2xl font-bold text-blue-500">
                  {statistics.totalWords}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  学习记录数
                </label>
                <p className="text-2xl font-bold text-blue-500">
                  {statistics.totalRecords}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  正确率
                </label>
                <p className="text-2xl font-bold text-green-500">
                  {(statistics.correctRate * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 修改密码表单 */}
      <div className="mt-6 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">修改密码</h2>

        <form onSubmit={handleChangePassword} className="max-w-md">
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

          {/* 成功提示 */}
          {success && (
            <div
              className="mb-4 p-3 bg-green-100 border border-green-300 text-green-700 rounded-lg text-sm"
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
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              当前密码
            </label>
            <input
              id="oldPassword"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="输入当前密码"
              autoComplete="current-password"
            />
          </div>

          {/* 新密码 */}
          <div className="mb-4">
            <label
              htmlFor="newPassword"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              新密码
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="至少8个字符"
              autoComplete="new-password"
              aria-describedby="new-password-hint"
            />
            <p id="new-password-hint" className="mt-1 text-xs text-gray-500">
              密码长度至少为8个字符
            </p>
          </div>

          {/* 确认新密码 */}
          <div className="mb-6">
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              确认新密码
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="再次输入新密码"
              autoComplete="new-password"
            />
          </div>

          {/* 提交按钮 */}
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {loading ? '修改中...' : '修改密码'}
          </button>
        </form>
      </div>

      {/* 数据同步管理 */}
      <div className="mt-6 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">数据同步</h2>

        {/* 迁移错误提示 */}
        {migrationError && (
          <div
            className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg text-sm"
            role="alert"
            aria-live="assertive"
          >
            {migrationError}
          </div>
        )}

        {/* 迁移成功提示 */}
        {migrationSuccess && (
          <div
            className="mb-4 p-3 bg-green-100 border border-green-300 text-green-700 rounded-lg text-sm"
            role="status"
            aria-live="polite"
          >
            {migrationSuccess}
          </div>
        )}

        <div className="space-y-4">
          {!isMigrated ? (
            <div>
              <p className="text-gray-600 mb-4">
                将你的本地数据（单词和学习记录）迁移到云端，实现多设备同步。
              </p>
              <button
                onClick={handleMigration}
                disabled={isMigrating}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {isMigrating ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    正在迁移...
                  </span>
                ) : (
                  '迁移本地数据到云端'
                )}
              </button>
            </div>
          ) : (
            <div>
              <p className="text-green-600 mb-4 flex items-center gap-2">
                <span className="text-xl">✓</span>
                数据已迁移到云端，正在自动同步
              </p>
              <button
                onClick={handleSync}
                className="px-6 py-3 bg-gray-100 text-gray-900 rounded-lg font-medium hover:bg-gray-200 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                手动同步
              </button>
            </div>
          )}
        </div>

        {/* 清除本地数据库 */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="text-sm font-medium text-gray-700 mb-2">开发者工具</h3>
          <p className="text-sm text-gray-600 mb-3">
            清除本地IndexedDB数据库（用于解决数据格式不兼容问题）
          </p>
          <button
            onClick={handleClearDatabase}
            className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            🗑️ 清除本地数据库
          </button>
          <p className="text-xs text-gray-500 mt-2">
            ⚠️ 警告：这将删除所有本地数据。如已同步到云端，可重新登录恢复。
          </p>
        </div>
      </div>

      {/* 退出登录按钮 */}
      <div className="mt-6 text-center">
        <button
          onClick={handleLogout}
          className="px-6 py-3 bg-gray-100 text-gray-900 rounded-lg font-medium hover:bg-gray-200 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        >
          退出登录
        </button>
      </div>
    </div>
  );
}
