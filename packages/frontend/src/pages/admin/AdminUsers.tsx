import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, Shield, User as UserIcon } from '../../components/Icon';
import { useToast, ConfirmModal, Spinner, Tooltip } from '../../components/ui';
import { adminLogger } from '../../utils/logger';
import {
  useAdminUsers,
  useDeleteUser,
  useUpdateUserRole,
  AdminUsersParams,
} from '../../hooks/queries';

// 角色权限说明
const ROLE_DESCRIPTIONS = {
  USER: {
    name: '普通用户',
    description: '可以使用学习功能、查看个人统计',
    permissions: ['学习单词', '查看个人进度', '修改个人设置'],
    color: 'gray',
  },
  ADMIN: {
    name: '管理员',
    description: '继承用户权限，并可管理系统',
    permissions: ['所有用户权限', '用户管理', '内容管理', '系统配置', '数据分析'],
    color: 'purple',
  },
};

export default function AdminUsers() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<AdminUsersParams['sortBy']>('createdAt');
  const [sortOrder, setSortOrder] = useState<AdminUsersParams['sortOrder']>('desc');
  const [showRoleHelp, setShowRoleHelp] = useState(false);

  // 使用新的 React Query hooks
  const {
    data: response,
    isLoading,
    error,
  } = useAdminUsers({
    page,
    pageSize: 20,
    search: search || undefined,
    sortBy,
    sortOrder,
  });

  const deleteUserMutation = useDeleteUser();
  const updateRoleMutation = useUpdateUserRole();

  // 确认弹窗状态
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    userId: string;
    username: string;
  }>({
    isOpen: false,
    userId: '',
    username: '',
  });
  const [roleConfirm, setRoleConfirm] = useState<{
    isOpen: boolean;
    userId: string;
    username: string;
    currentRole: string;
  }>({
    isOpen: false,
    userId: '',
    username: '',
    currentRole: '',
  });

  const users = response?.users || [];
  const pagination = response?.pagination;

  const handleSearchChange = (newSearch: string) => {
    setSearch(newSearch);
    // 搜索时重置页码
    if (page !== 1) {
      setPage(1);
    }
  };

  const openDeleteConfirm = (userId: string, username: string) => {
    setDeleteConfirm({ isOpen: true, userId, username });
  };

  const handleDeleteUser = async () => {
    try {
      await deleteUserMutation.mutateAsync(deleteConfirm.userId);
      toast.success('用户已删除');
    } catch (err) {
      adminLogger.error({ err, userId: deleteConfirm.userId }, '删除用户失败');
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleteConfirm({ isOpen: false, userId: '', username: '' });
    }
  };

  const openRoleConfirm = (userId: string, currentRole: string, username: string) => {
    setRoleConfirm({ isOpen: true, userId, username, currentRole });
  };

  const handleToggleRole = async () => {
    const newRole = roleConfirm.currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
    try {
      await updateRoleMutation.mutateAsync({
        userId: roleConfirm.userId,
        role: newRole as 'USER' | 'ADMIN',
      });
      toast.success('用户角色已修改');
    } catch (err) {
      adminLogger.error({ err, userId: roleConfirm.userId, newRole }, '修改用户角色失败');
      toast.error(err instanceof Error ? err.message : '修改失败');
    } finally {
      setRoleConfirm({ isOpen: false, userId: '', username: '', currentRole: '' });
    }
  };

  const handleSort = (field: AdminUsersParams['sortBy']) => {
    if (sortBy === field) {
      // 切换排序顺序
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // 新字段默认降序
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">用户管理</h1>
        <Tooltip content="查看角色权限说明">
          <button
            onClick={() => setShowRoleHelp(!showRoleHelp)}
            className="flex items-center gap-2 rounded-button border border-gray-300 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-600 dark:text-gray-400 dark:hover:bg-slate-700"
          >
            <Info size={16} />
            角色说明
          </button>
        </Tooltip>
      </div>

      {/* 角色继承说明面板 */}
      {showRoleHelp && (
        <div className="mb-6 rounded-card border border-blue-200 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-900/20">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <Shield size={20} className="text-blue-500" />
            角色权限继承说明
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(ROLE_DESCRIPTIONS).map(([role, info]) => (
              <div
                key={role}
                className="rounded-button border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="mb-2 flex items-center gap-2">
                  {role === 'ADMIN' ? (
                    <Shield size={20} className="text-purple-500" />
                  ) : (
                    <UserIcon size={20} className="text-gray-500" />
                  )}
                  <span className="font-semibold text-gray-900 dark:text-white">{info.name}</span>
                </div>
                <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">{info.description}</p>
                <div className="flex flex-wrap gap-1">
                  {info.permissions.map((perm) => (
                    <span
                      key={perm}
                      className={`rounded px-2 py-0.5 text-xs ${
                        role === 'ADMIN'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-400'
                      }`}
                    >
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            <strong>继承关系：</strong>管理员角色包含普通用户的所有权限，并额外拥有系统管理权限。
          </p>
        </div>
      )}

      {/* 搜索栏 */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="搜索用户名或邮箱..."
          className="w-full max-w-md rounded-button border border-gray-300 px-4 py-2 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-gray-400"
        />
      </div>

      {error && (
        <div className="mb-6 rounded-button border border-red-200 bg-red-50 p-4 text-red-600 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {error instanceof Error ? error.message : '加载失败'}
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center">
          <Spinner className="mx-auto mb-4" size="xl" color="primary" />
          <p className="text-gray-600 dark:text-gray-400">正在加载...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">没有找到用户</div>
      ) : (
        <>
          <div className="overflow-hidden rounded-card border border-gray-200/60 bg-white/80 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-900">
                <tr>
                  <th
                    className="cursor-pointer px-6 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700"
                    onClick={() => handleSort('username')}
                  >
                    用户名 {sortBy === 'username' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="cursor-pointer px-6 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700"
                    onClick={() => handleSort('email')}
                  >
                    邮箱 {sortBy === 'email' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                    角色
                  </th>
                  <th
                    className="cursor-pointer px-6 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700"
                    onClick={() => handleSort('totalWordsLearned')}
                  >
                    学习单词数 {sortBy === 'totalWordsLearned' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="cursor-pointer px-6 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700"
                    onClick={() => handleSort('averageScore')}
                  >
                    平均分 {sortBy === 'averageScore' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="cursor-pointer px-6 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700"
                    onClick={() => handleSort('createdAt')}
                  >
                    注册时间 {sortBy === 'createdAt' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                      {user.username}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`rounded px-2 py-1 text-xs ${
                          user.role === 'ADMIN'
                            ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-400'
                        }`}
                      >
                        {user.role === 'ADMIN' ? '管理员' : '普通用户'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {user.totalWordsLearned}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {user.averageScore.toFixed(1)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-6 py-4 text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/admin/users/${user.id}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          查看
                        </Link>
                        <button
                          onClick={() => openRoleConfirm(user.id, user.role, user.username)}
                          className="text-purple-600 hover:text-purple-800"
                        >
                          {user.role === 'ADMIN' ? '降为用户' : '升为管理员'}
                        </button>
                        {user.role !== 'ADMIN' && (
                          <button
                            onClick={() => openDeleteConfirm(user.id, user.username)}
                            className="text-red-600 hover:text-red-800"
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                共 {pagination.total} 个用户，第 {pagination.page} / {pagination.totalPages} 页
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-button border border-gray-300 px-4 py-2 transition-all duration-g3-fast hover:scale-105 hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-700"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                  className="rounded-button border border-gray-300 px-4 py-2 transition-all duration-g3-fast hover:scale-105 hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-700"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 删除用户确认弹窗 */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, userId: '', username: '' })}
        onConfirm={handleDeleteUser}
        title="删除用户"
        message={`确定要删除用户"${deleteConfirm.username}"吗？此操作无法撤销。`}
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        isLoading={deleteUserMutation.isPending}
      />

      {/* 修改角色确认弹窗 */}
      <ConfirmModal
        isOpen={roleConfirm.isOpen}
        onClose={() => setRoleConfirm({ isOpen: false, userId: '', username: '', currentRole: '' })}
        onConfirm={handleToggleRole}
        title="修改用户角色"
        message={`确定要将用户"${roleConfirm.username}"的角色改为${roleConfirm.currentRole === 'ADMIN' ? '普通用户' : '管理员'}吗？`}
        confirmText="确定"
        cancelText="取消"
        variant="warning"
        isLoading={updateRoleMutation.isPending}
      />
    </div>
  );
}
