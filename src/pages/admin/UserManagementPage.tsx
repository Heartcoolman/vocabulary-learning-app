import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient, { UserOverview } from '../../services/ApiClient';
import {
    UsersThree,
    MagnifyingGlass,
    CaretLeft,
    CaretRight,
    User,
    ChartBar,
    Target,
    Clock,
} from '../../components/Icon';

interface PaginationInfo {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
}

export default function UserManagementPage() {
    const navigate = useNavigate();
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
            console.error('加载用户列表失败:', err);
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
        navigate(`/admin/users/${userId}`);
    };

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
        return role === 'ADMIN' ? '管理员' : '用户';
    };

    const getRoleBadgeColor = (role: string) => {
        return role === 'ADMIN'
            ? 'bg-purple-100 text-purple-700'
            : 'bg-blue-100 text-blue-700';
    };

    if (isLoading && users.length === 0) {
        return (
            <div className="p-8">
                <div className="flex items-center justify-center min-h-[400px]">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
                        <p className="text-gray-600">加载中...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 animate-fade-in">
            {/* 页面标题 */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <UsersThree size={32} weight="duotone" className="text-blue-500" />
                    <h1 className="text-3xl font-bold text-gray-900">用户管理</h1>
                </div>
                <p className="text-gray-600">查看和管理所有用户的学习数据</p>
            </div>

            {/* 搜索栏 */}
            <div className="mb-6">
                <div className="flex gap-4">
                    <div className="flex-1 relative">
                        <MagnifyingGlass
                            size={20}
                            className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
                        />
                        <input
                            type="text"
                            placeholder="搜索用户名或邮箱..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyPress={handleSearchKeyPress}
                            className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                    </div>
                    <button
                        onClick={handleSearch}
                        className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                        搜索
                    </button>
                </div>
            </div>

            {/* 错误提示 */}
            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-600">{error}</p>
                </div>
            )}

            {/* 用户列表 */}
            {users.length === 0 ? (
                <div className="text-center py-12">
                    <User size={64} weight="thin" className="text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">
                        {searchQuery ? '未找到匹配的用户' : '暂无用户数据'}
                    </p>
                </div>
            ) : (
                <>
                    {/* 统计信息 */}
                    <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-blue-900">
                            共找到 <span className="font-bold">{pagination.total}</span> 个用户
                        </p>
                    </div>

                    {/* 用户表格 */}
                    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                                            用户信息
                                        </th>
                                        <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                                            角色
                                        </th>
                                        <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                                            学习单词数
                                        </th>
                                        <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                                            平均得分
                                        </th>
                                        <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                                            正确率
                                        </th>
                                        <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                                            最后学习
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {users.map((user) => (
                                        <tr
                                            key={user.id}
                                            onClick={() => handleUserClick(user.id)}
                                            className="hover:bg-gray-50 cursor-pointer transition-colors"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                                                        <User
                                                            size={20}
                                                            weight="bold"
                                                            className="text-blue-600"
                                                        />
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-gray-900">
                                                            {user.username}
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            {user.email}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span
                                                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(
                                                        user.role
                                                    )}`}
                                                >
                                                    {getRoleLabel(user.role)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <ChartBar
                                                        size={16}
                                                        weight="bold"
                                                        className="text-gray-400"
                                                    />
                                                    <span className="font-medium text-gray-900">
                                                        {user.totalWordsLearned}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <Target
                                                        size={16}
                                                        weight="bold"
                                                        className="text-gray-400"
                                                    />
                                                    <span className="font-medium text-gray-900">
                                                        {(user.averageScore ?? 0).toFixed(1)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <div
                                                        className={`font-medium ${
                                                            (user.accuracy ?? 0) >= 80
                                                                ? 'text-green-600'
                                                                : (user.accuracy ?? 0) >= 60
                                                                ? 'text-yellow-600'
                                                                : 'text-red-600'
                                                        }`}
                                                    >
                                                        {(user.accuracy ?? 0).toFixed(1)}%
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <Clock
                                                        size={16}
                                                        weight="bold"
                                                        className="text-gray-400"
                                                    />
                                                    <span className="text-sm text-gray-600">
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
                            <div className="text-sm text-gray-600">
                                显示第 {(pagination.page - 1) * pagination.pageSize + 1} -{' '}
                                {Math.min(
                                    pagination.page * pagination.pageSize,
                                    pagination.total
                                )}{' '}
                                条，共 {pagination.total} 条
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handlePageChange(pagination.page - 1)}
                                    disabled={pagination.page === 1}
                                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    <CaretLeft size={16} weight="bold" />
                                </button>
                                <div className="flex items-center gap-1">
                                    {Array.from(
                                        { length: pagination.totalPages },
                                        (_, i) => i + 1
                                    )
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
                                                        className="px-2 text-gray-400"
                                                    >
                                                        ...
                                                    </span>
                                                );
                                            }
                                            return (
                                                <button
                                                    key={page}
                                                    onClick={() => handlePageChange(page)}
                                                    className={`px-4 py-2 rounded-lg transition-all ${
                                                        page === pagination.page
                                                            ? 'bg-blue-500 text-white'
                                                            : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
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
                                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    <CaretRight size={16} weight="bold" />
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
