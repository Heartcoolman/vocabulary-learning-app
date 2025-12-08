import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import apiClient, { UserOverview, AdminUsersResponse } from '../../services/client';
import { CircleNotch } from '../../components/Icon';
import { useToast, ConfirmModal } from '../../components/ui';
import { adminLogger } from '../../utils/logger';

export default function AdminUsers() {
  const toast = useToast();
  const [users, setUsers] = useState<UserOverview[]>([]);
  const [pagination, setPagination] = useState<AdminUsersResponse['pagination'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

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
  const [isProcessing, setIsProcessing] = useState(false);

  // 使用 ref 跟踪搜索变化，避免 setPage(1) 触发重复请求
  const isSearchChangeRef = useRef(false);

  useEffect(() => {
    // 如果是搜索词变化导致的 page 重置，跳过本次加载（等待 page 变化后再加载）
    if (isSearchChangeRef.current && page !== 1) {
      return;
    }
    isSearchChangeRef.current = false;
    loadUsers();
  }, [page, search]);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.adminGetUsers({
        page,
        pageSize: 20,
        search: search || undefined,
      });
      setUsers(data.users);
      setPagination(data.pagination);
    } catch (err) {
      adminLogger.error({ err, page, search }, '加载用户列表失败');
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  const openDeleteConfirm = (userId: string, username: string) => {
    setDeleteConfirm({ isOpen: true, userId, username });
  };

  const handleDeleteUser = async () => {
    setIsProcessing(true);
    try {
      await apiClient.adminDeleteUser(deleteConfirm.userId);
      toast.success('用户已删除');
      loadUsers();
    } catch (err) {
      adminLogger.error({ err, userId: deleteConfirm.userId }, '删除用户失败');
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setIsProcessing(false);
      setDeleteConfirm({ isOpen: false, userId: '', username: '' });
    }
  };

  const openRoleConfirm = (userId: string, currentRole: string, username: string) => {
    setRoleConfirm({ isOpen: true, userId, username, currentRole });
  };

  const handleToggleRole = async () => {
    const newRole = roleConfirm.currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
    setIsProcessing(true);
    try {
      await apiClient.adminUpdateUserRole(roleConfirm.userId, newRole as 'USER' | 'ADMIN');
      toast.success('用户角色已修改');
      loadUsers();
    } catch (err) {
      adminLogger.error({ err, userId: roleConfirm.userId, newRole }, '修改用户角色失败');
      toast.error(err instanceof Error ? err.message : '修改失败');
    } finally {
      setIsProcessing(false);
      setRoleConfirm({ isOpen: false, userId: '', username: '', currentRole: '' });
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">用户管理</h1>
      </div>

      {/* 搜索栏 */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            const newSearch = e.target.value;
            setSearch(newSearch);
            // 标记为搜索变化，避免双重请求
            if (page !== 1) {
              isSearchChangeRef.current = true;
            }
            setPage(1);
          }}
          placeholder="搜索用户名或邮箱..."
          className="w-full max-w-md rounded-lg border border-gray-300 px-4 py-2 transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-600">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center">
          <CircleNotch
            className="mx-auto mb-4 animate-spin"
            size={48}
            weight="bold"
            color="#3b82f6"
          />
          <p className="text-gray-600">正在加载...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="py-8 text-center text-gray-500">没有找到用户</div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white/80 backdrop-blur-sm">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">用户名</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">邮箱</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">角色</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                    注册时间
                  </th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.username}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`rounded px-2 py-1 text-xs ${
                          user.role === 'ADMIN'
                            ? 'bg-purple-100 text-purple-600'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {user.role === 'ADMIN' ? '管理员' : '普通用户'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
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
              <div className="text-sm text-gray-600">
                共 {pagination.total} 个用户，第 {pagination.page} / {pagination.totalPages} 页
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg border border-gray-300 px-4 py-2 transition-all duration-200 hover:scale-105 hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                  className="rounded-lg border border-gray-300 px-4 py-2 transition-all duration-200 hover:scale-105 hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
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
        isLoading={isProcessing}
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
        isLoading={isProcessing}
      />
    </div>
  );
}
