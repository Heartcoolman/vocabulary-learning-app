import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient, { UserOverview } from '../../services/client';
import type { User as UserDetail } from '../../services/client/admin/AdminClient';
import {
  UsersThree,
  MagnifyingGlass,
  CaretLeft,
  CaretRight,
  User,
  ChartBar,
  Target,
  Clock,
  CircleNotch,
  Prohibit,
  CheckCircle,
} from '../../components/Icon';
import { adminLogger } from '../../utils/logger';
import { Modal, useToast, Checkbox } from '../../components/ui';

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface UserQuickViewModalProps {
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onViewDetails: (userId: string) => void;
}

function UserQuickViewModal({ userId, isOpen, onClose, onViewDetails }: UserQuickViewModalProps) {
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userId && isOpen) {
      loadUserDetail();
    }
  }, [userId, isOpen]);

  const loadUserDetail = async () => {
    if (!userId) return;

    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.adminGetUserById(userId);
      setUserDetail(data);
    } catch (err) {
      adminLogger.error({ err, userId }, '加载用户详情失败');
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewFullDetails = () => {
    if (userId) {
      onViewDetails(userId);
      onClose();
    }
  };

  if (!isOpen || !userId) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="用户快速查看">
      <div className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <CircleNotch className="animate-spin" size={48} weight="bold" color="#3b82f6" />
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="mb-4 text-red-600">{error}</p>
            <button
              onClick={loadUserDetail}
              className="rounded-button bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600"
            >
              重试
            </button>
          </div>
        ) : userDetail ? (
          <div className="space-y-6">
            {/* 用户基本信息 */}
            <div className="flex items-center gap-4 border-b border-gray-200 pb-6 dark:border-slate-700">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                <User size={32} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {userDetail.username}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{userDetail.email}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  userDetail.role === 'ADMIN'
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                }`}
              >
                {userDetail.role === 'ADMIN' ? '管理员' : '用户'}
              </span>
            </div>

            {/* 账户信息 */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">账户信息</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">用户 ID</span>
                  <span className="font-mono text-gray-900 dark:text-white">{userDetail.id}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">注册时间</span>
                  <span className="text-gray-900 dark:text-white">
                    {new Date(userDetail.createdAt).toLocaleDateString('zh-CN')}
                  </span>
                </div>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleViewFullDetails}
                className="flex-1 rounded-button bg-blue-500 px-4 py-2 font-medium text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
              >
                查看完整详情
              </button>
              <button
                onClick={onClose}
                className="rounded-button bg-gray-100 px-4 py-2 font-medium text-gray-900 transition-all duration-g3-fast hover:bg-gray-200 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
              >
                关闭
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export default function UserManagementPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [users, setUsers] = useState<UserOverview[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // 批量选择状态
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // 快速查看弹窗状态
  const [quickViewModal, setQuickViewModal] = useState<{ isOpen: boolean; userId: string | null }>({
    isOpen: false,
    userId: null,
  });

  // 批量操作确认弹窗
  const [batchConfirmModal, setBatchConfirmModal] = useState<{
    isOpen: boolean;
    action: 'ban' | 'unban' | null;
  }>({ isOpen: false, action: null });

  useEffect(() => {
    loadUsers();
  }, [pagination.page, searchQuery]);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.adminGetUsers({
        page: pagination.page,
        pageSize: pagination.pageSize,
        search: searchQuery || undefined,
      });

      setUsers(response.users);
      setPagination(response.pagination);
    } catch (err) {
      adminLogger.error({ err, page: pagination.page, search: searchQuery }, '加载用户列表失败');
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    setSearchQuery(searchInput);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handlePageChange = (newPage: number) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUserClick = (userId: string) => {
    // 打开快速查看弹窗而不是直接跳转
    setQuickViewModal({ isOpen: true, userId });
  };

  const handleViewFullDetails = (userId: string) => {
    navigate(`/admin/users/${userId}`);
  };

  const handleCloseQuickView = () => {
    setQuickViewModal({ isOpen: false, userId: null });
  };

  // 批量选择处理
  const handleSelectUser = useCallback((userId: string, checked: boolean) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(userId);
      } else {
        next.delete(userId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedUserIds(new Set(users.map((u) => u.id)));
      } else {
        setSelectedUserIds(new Set());
      }
    },
    [users],
  );

  // 批量操作
  const handleBatchAction = useCallback((action: 'ban' | 'unban') => {
    setBatchConfirmModal({ isOpen: true, action });
  }, []);

  const confirmBatchAction = useCallback(async () => {
    if (!batchConfirmModal.action || selectedUserIds.size === 0) return;

    try {
      setIsBatchProcessing(true);
      const userIds = Array.from(selectedUserIds);
      const newRole = batchConfirmModal.action === 'ban' ? 'BANNED' : 'USER';

      // 批量更新用户角色
      await Promise.all(
        userIds.map((userId) =>
          apiClient.admin.requestAdmin(`/api/admin/users/${userId}/role`, {
            method: 'PATCH',
            body: JSON.stringify({ role: newRole }),
          }),
        ),
      );

      toast.success(
        `已${batchConfirmModal.action === 'ban' ? '禁用' : '启用'} ${userIds.length} 个用户`,
      );
      setSelectedUserIds(new Set());
      setBatchConfirmModal({ isOpen: false, action: null });
      loadUsers();
    } catch (err) {
      adminLogger.error({ err, action: batchConfirmModal.action }, '批量操作失败');
      toast.error('批量操作失败，请重试');
    } finally {
      setIsBatchProcessing(false);
    }
  }, [batchConfirmModal.action, selectedUserIds, toast]);

  const closeBatchConfirmModal = useCallback(() => {
    setBatchConfirmModal({ isOpen: false, action: null });
  }, []);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '从未学习';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays}天前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}个月前`;
    return `${Math.floor(diffDays / 365)}年前`;
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return '管理员';
      case 'BANNED':
        return '已封禁';
      default:
        return '用户';
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
      case 'BANNED':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
      default:
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
    }
  };

  if (isLoading && users.length === 0) {
    return (
      <div className="p-8">
        <div className="flex min-h-[400px] animate-g3-fade-in items-center justify-center">
          <div className="text-center">
            <CircleNotch
              className="mx-auto mb-4 animate-spin"
              size={48}
              weight="bold"
              color="#3b82f6"
            />
            <p className="text-gray-600 dark:text-gray-300" role="status" aria-live="polite">
              正在加载...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-g3-fade-in p-8">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-3">
          <UsersThree size={32} className="text-blue-500" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">用户管理</h1>
        </div>
        <p className="text-gray-600 dark:text-gray-400">查看和管理所有用户的学习数据</p>
      </div>

      {/* 搜索栏 */}
      <div className="mb-6">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <MagnifyingGlass
              size={20}
              className="absolute left-4 top-1/2 -translate-y-1/2 transform text-gray-400"
            />
            <input
              type="text"
              placeholder="搜索用户名或邮箱..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyPress={handleSearchKeyPress}
              className="w-full rounded-button border border-gray-300 bg-white py-3 pl-12 pr-4 text-gray-900 placeholder-gray-400 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleSearch}
            className="rounded-button bg-blue-500 px-6 py-3 font-medium text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95"
          >
            搜索
          </button>
        </div>
      </div>

      {/* 批量操作栏 */}
      {selectedUserIds.size > 0 && (
        <div className="mb-6 flex items-center justify-between rounded-card border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <CheckCircle size={20} weight="fill" />
            <span>
              已选择 <strong>{selectedUserIds.size}</strong> 个用户
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleBatchAction('ban')}
              disabled={isBatchProcessing}
              className="flex items-center gap-2 rounded-button bg-red-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-600 disabled:opacity-50"
            >
              <Prohibit size={18} />
              批量禁用
            </button>
            <button
              onClick={() => handleBatchAction('unban')}
              disabled={isBatchProcessing}
              className="flex items-center gap-2 rounded-button bg-green-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-green-600 disabled:opacity-50"
            >
              <CheckCircle size={18} />
              批量启用
            </button>
            <button
              onClick={() => setSelectedUserIds(new Set())}
              className="rounded-button px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            >
              取消选择
            </button>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mb-6 rounded-button border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* 用户列表 */}
      {users.length === 0 ? (
        <div className="py-12 text-center">
          <User size={64} weight="thin" className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p className="text-lg text-gray-500 dark:text-gray-400">
            {searchQuery ? '未找到匹配的用户' : '暂无用户数据'}
          </p>
        </div>
      ) : (
        <>
          {/* 统计信息 */}
          <div className="mb-6 rounded-button border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-900/20">
            <p className="text-blue-900 dark:text-blue-300">
              共找到 <span className="font-bold">{pagination.total}</span> 个用户
            </p>
          </div>

          {/* 用户表格 */}
          <div className="overflow-hidden rounded-button border border-gray-200 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-800">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-900">
                  <tr>
                    <th className="w-12 px-4 py-4">
                      <Checkbox
                        checked={users.length > 0 && selectedUserIds.size === users.length}
                        indeterminate={
                          selectedUserIds.size > 0 && selectedUserIds.size < users.length
                        }
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        aria-label="全选"
                      />
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                      用户信息
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">
                      角色
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">
                      学习单词数
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">
                      平均得分
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">
                      正确率
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">
                      最后学习
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      onClick={() => handleUserClick(user.id)}
                      className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-slate-700/50"
                    >
                      <td className="w-12 px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedUserIds.has(user.id)}
                          onChange={(e) => handleSelectUser(user.id, e.target.checked)}
                          aria-label={`选择 ${user.username}`}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                            <User size={20} className="text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {user.username}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getRoleBadgeColor(
                            user.role,
                          )}`}
                        >
                          {getRoleLabel(user.role)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <ChartBar size={16} className="text-gray-400 dark:text-gray-500" />
                          <span className="font-medium text-gray-900 dark:text-white">
                            {user.totalWordsLearned}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Target size={16} className="text-gray-400 dark:text-gray-500" />
                          <span className="font-medium text-gray-900 dark:text-white">
                            {(user.averageScore ?? 0).toFixed(1)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div
                            className={`font-medium ${
                              (user.accuracy ?? 0) >= 80
                                ? 'text-green-600 dark:text-green-400'
                                : (user.accuracy ?? 0) >= 60
                                  ? 'text-yellow-600 dark:text-yellow-400'
                                  : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {(user.accuracy ?? 0).toFixed(1)}%
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Clock size={16} className="text-gray-400 dark:text-gray-500" />
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {formatDate(user.lastLearningTime)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 分页 */}
          {pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                显示第 {(pagination.page - 1) * pagination.pageSize + 1} -{' '}
                {Math.min(pagination.page * pagination.pageSize, pagination.total)} 条，共{' '}
                {pagination.total} 条
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="rounded-button border border-gray-300 px-4 py-2 text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-700"
                >
                  <CaretLeft size={16} />
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                    .filter((page) => {
                      // 显示当前页前后2页
                      return (
                        page === 1 ||
                        page === pagination.totalPages ||
                        Math.abs(page - pagination.page) <= 2
                      );
                    })
                    .map((page, index, array) => {
                      // 添加省略号
                      if (index > 0 && page - array[index - 1] > 1) {
                        return (
                          <span
                            key={`ellipsis-${page}`}
                            className="px-2 text-gray-400 dark:text-gray-500"
                          >
                            ...
                          </span>
                        );
                      }
                      return (
                        <button
                          key={page}
                          onClick={() => handlePageChange(page)}
                          className={`rounded-button px-4 py-2 transition-all ${
                            page === pagination.page
                              ? 'bg-blue-500 text-white'
                              : 'border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-700'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                </div>
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  className="rounded-button border border-gray-300 px-4 py-2 text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-700"
                >
                  <CaretRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 用户快速查看弹窗 */}
      <UserQuickViewModal
        userId={quickViewModal.userId}
        isOpen={quickViewModal.isOpen}
        onClose={handleCloseQuickView}
        onViewDetails={handleViewFullDetails}
      />

      {/* 批量操作确认弹窗 */}
      <Modal
        isOpen={batchConfirmModal.isOpen}
        onClose={closeBatchConfirmModal}
        title={batchConfirmModal.action === 'ban' ? '确认批量禁用' : '确认批量启用'}
      >
        <div className="p-6">
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            确定要{batchConfirmModal.action === 'ban' ? '禁用' : '启用'}已选择的{' '}
            <strong className="text-gray-900 dark:text-white">{selectedUserIds.size}</strong>{' '}
            个用户吗？
            {batchConfirmModal.action === 'ban' && (
              <span className="mt-2 block text-sm text-red-500">
                禁用后，这些用户将无法登录系统。
              </span>
            )}
          </p>
          <div className="flex gap-3">
            <button
              onClick={closeBatchConfirmModal}
              disabled={isBatchProcessing}
              className="flex-1 rounded-button bg-gray-100 px-4 py-2 font-medium text-gray-900 transition-all hover:bg-gray-200 disabled:opacity-50 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
            >
              取消
            </button>
            <button
              onClick={confirmBatchAction}
              disabled={isBatchProcessing}
              className={`flex-1 rounded-button px-4 py-2 font-medium text-white transition-all disabled:opacity-50 ${
                batchConfirmModal.action === 'ban'
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-green-500 hover:bg-green-600'
              }`}
            >
              {isBatchProcessing ? '处理中...' : '确认'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
