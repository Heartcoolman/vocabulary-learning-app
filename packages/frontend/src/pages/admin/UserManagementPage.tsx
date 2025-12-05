import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient, { UserOverview, User as UserDetail } from '../../services/ApiClient';
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
} from '../../components/Icon';
import { adminLogger } from '../../utils/logger';
import { Modal } from '../../components/ui';

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
                    <div className="text-center py-8">
                        <p className="text-red-600 mb-4">{error}</p>
                        <button
                            onClick={loadUserDetail}
                            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        >
                            重试
                        </button>
                    </div>
                ) : userDetail ? (
                    <div className="space-y-6">
                        {/* 用户基本信息 */}
                        <div className="flex items-center gap-4 pb-6 border-b border-gray-200">
                            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                                <User size={32} weight="bold" className="text-blue-600" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-xl font-bold text-gray-900">{userDetail.username}</h3>
                                <p className="text-sm text-gray-600">{userDetail.email}</p>
                            </div>
                            <span
                                className={`px-3 py-1 rounded-full text-xs font-medium ${
                                    userDetail.role === 'ADMIN'
                                        ? 'bg-purple-100 text-purple-700'
                                        : 'bg-blue-100 text-blue-700'
                                }`}
                            >
                                {userDetail.role === 'ADMIN' ? '管理员' : '用户'}
                            </span>
                        </div>

                        {/* 账户信息 */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-900 mb-3">账户信息</h4>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">用户 ID</span>
                                    <span className="font-mono text-gray-900">{userDetail.id}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">注册时间</span>
                                    <span className="text-gray-900">
                                        {new Date(userDetail.createdAt).toLocaleDateString('zh-CN')}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 操作按钮 */}
                        <div className="flex gap-3 pt-4">
                            <button
                                onClick={handleViewFullDetails}
                                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95"
                            >
                                查看完整详情
                            </button>
                            <button
                                onClick={onClose}
                                className="px-4 py-2 bg-gray-100 text-gray-900 rounded-lg font-medium hover:bg-gray-200 transition-all duration-200"
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

    // 快速查看弹窗状态
    const [quickViewModal, setQuickViewModal] = useState<{ isOpen: boolean; userId: string | null }>({
        isOpen: false,
        userId: null,
    });

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
                <div className="flex items-center justify-center min-h-[400px] animate-g3-fade-in">
                    <div className="text-center">
                        <CircleNotch className="animate-spin mx-auto mb-4" size={48} weight="bold" color="#3b82f6" />
                        <p className="text-gray-600" role="status" aria-live="polite">正在加载...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 animate-g3-fade-in">
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

            {/* 用户快速查看弹窗 */}
            <UserQuickViewModal
                userId={quickViewModal.userId}
                isOpen={quickViewModal.isOpen}
                onClose={handleCloseQuickView}
                onViewDetails={handleViewFullDetails}
            />
        </div>
    );
}
