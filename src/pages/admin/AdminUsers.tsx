import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../services/ApiClient';

export default function AdminUsers() {
    const [users, setUsers] = useState<any[]>([]);
    const [pagination, setPagination] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    useEffect(() => {
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
            console.error('加载用户列表失败:', err);
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteUser = async (userId: string, username: string) => {
        if (!confirm(`确定要删除用户"${username}"吗？此操作无法撤销。`)) {
            return;
        }

        try {
            await apiClient.adminDeleteUser(userId);
            loadUsers();
        } catch (err) {
            console.error('删除用户失败:', err);
            alert(err instanceof Error ? err.message : '删除失败');
        }
    };

    const handleToggleRole = async (
        userId: string,
        currentRole: string,
        username: string
    ) => {
        const newRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
        if (
            !confirm(
                `确定要将用户"${username}"的角色改为${newRole === 'ADMIN' ? '管理员' : '普通用户'
                }吗？`
            )
        ) {
            return;
        }

        try {
            await apiClient.adminUpdateUserRole(userId, newRole as 'USER' | 'ADMIN');
            loadUsers();
        } catch (err) {
            console.error('修改用户角色失败:', err);
            alert(err instanceof Error ? err.message : '修改失败');
        }
    };

    return (
        <div className="p-8">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold text-gray-900">用户管理</h1>
            </div>

            {/* 搜索栏 */}
            <div className="mb-6">
                <input
                    type="text"
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                    }}
                    placeholder="搜索用户名或邮箱..."
                    className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
                    {error}
                </div>
            )}

            {isLoading ? (
                <div className="text-center py-8 text-gray-500">加载中...</div>
            ) : users.length === 0 ? (
                <div className="text-center py-8 text-gray-500">没有找到用户</div>
            ) : (
                <>
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                                        用户名
                                    </th>
                                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                                        邮箱
                                    </th>
                                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                                        角色
                                    </th>
                                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                                        注册时间
                                    </th>
                                    <th className="px-6 py-3 text-right text-sm font-medium text-gray-700">
                                        操作
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {users.map((user) => (
                                    <tr key={user.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                                            {user.username}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600">
                                            {user.email}
                                        </td>
                                        <td className="px-6 py-4 text-sm">
                                            <span
                                                className={`px-2 py-1 rounded text-xs ${user.role === 'ADMIN'
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
                                                    onClick={() =>
                                                        handleToggleRole(user.id, user.role, user.username)
                                                    }
                                                    className="text-purple-600 hover:text-purple-800"
                                                >
                                                    {user.role === 'ADMIN' ? '降为用户' : '升为管理员'}
                                                </button>
                                                {user.role !== 'ADMIN' && (
                                                    <button
                                                        onClick={() =>
                                                            handleDeleteUser(user.id, user.username)
                                                        }
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
                                共 {pagination.total} 个用户，第 {pagination.page} /{' '}
                                {pagination.totalPages} 页
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                                >
                                    上一页
                                </button>
                                <button
                                    onClick={() =>
                                        setPage((p) => Math.min(pagination.totalPages, p + 1))
                                    }
                                    disabled={page === pagination.totalPages}
                                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                                >
                                    下一页
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
