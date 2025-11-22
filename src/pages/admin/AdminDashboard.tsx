import { useState, useEffect } from 'react';
import apiClient from '../../services/ApiClient';

export default function AdminDashboard() {
    const [stats, setStats] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadStatistics();
    }, []);

    const loadStatistics = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const data = await apiClient.adminGetStatistics();
            setStats(data);
        } catch (err) {
            console.error('加载统计数据失败:', err);
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="p-8">
                <div className="text-gray-500">加载中...</div>
            </div>
        );
    }

    if (error || !stats) {
        return (
            <div className="p-8">
                <div className="text-red-600">{error || '加载失败'}</div>
            </div>
        );
    }

    const statCards = [
        {
            label: '总用户数',
            value: stats.totalUsers,
            icon: '👥',
            color: 'blue',
        },
        {
            label: '活跃用户',
            value: stats.activeUsers,
            icon: '✨',
            color: 'green',
        },
        {
            label: '总词库数',
            value: stats.totalWordBooks,
            icon: '📚',
            color: 'purple',
        },
        {
            label: '系统词库',
            value: stats.systemWordBooks,
            icon: '📖',
            color: 'indigo',
        },
        {
            label: '用户词库',
            value: stats.userWordBooks,
            icon: '📝',
            color: 'pink',
        },
        {
            label: '总单词数',
            value: stats.totalWords,
            icon: '📄',
            color: 'yellow',
        },
        {
            label: '学习记录',
            value: stats.totalRecords,
            icon: '📊',
            color: 'red',
        },
    ];

    const getColorClasses = (color: string) => {
        const colors: any = {
            blue: 'bg-blue-50 text-blue-600',
            green: 'bg-green-50 text-green-600',
            purple: 'bg-purple-50 text-purple-600',
            indigo: 'bg-indigo-50 text-indigo-600',
            pink: 'bg-pink-50 text-pink-600',
            yellow: 'bg-yellow-50 text-yellow-600',
            red: 'bg-red-50 text-red-600',
        };
        return colors[color] || 'bg-gray-50 text-gray-600';
    };

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">系统概览</h1>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
                {statCards.map((card) => (
                    <div
                        key={card.label}
                        className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all"
                    >
                        <div
                            className={`inline-flex items-center justify-center w-12 h-12 rounded-lg mb-4 ${getColorClasses(
                                card.color
                            )}`}
                        >
                            <span className="text-2xl">{card.icon}</span>
                        </div>
                        <div className="text-gray-600 text-sm mb-1">{card.label}</div>
                        <div className="text-3xl font-bold text-gray-900">{card.value}</div>
                    </div>
                ))}
            </div>

            {/* 额外信息 */}
            <div className="grid gap-6 md:grid-cols-2">
                <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">用户活跃度</h2>
                    <div className="space-y-3">
                        <div className="flex justify-between">
                            <span className="text-gray-600">总用户数</span>
                            <span className="font-medium">{stats.totalUsers}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-600">活跃用户（7天内）</span>
                            <span className="font-medium">{stats.activeUsers}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-600">活跃率</span>
                            <span className="font-medium">
                                {stats.totalUsers > 0
                                    ? Math.round((stats.activeUsers / stats.totalUsers) * 100)
                                    : 0}
                                %
                            </span>
                        </div>
                    </div>
                </div>

                <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">词库统计</h2>
                    <div className="space-y-3">
                        <div className="flex justify-between">
                            <span className="text-gray-600">系统词库</span>
                            <span className="font-medium">{stats.systemWordBooks}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-600">用户词库</span>
                            <span className="font-medium">{stats.userWordBooks}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-600">平均每词库单词数</span>
                            <span className="font-medium">
                                {stats.totalWordBooks > 0
                                    ? Math.round(stats.totalWords / stats.totalWordBooks)
                                    : 0}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
