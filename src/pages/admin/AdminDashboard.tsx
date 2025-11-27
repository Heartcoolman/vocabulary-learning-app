import { useState, useEffect } from 'react';
import apiClient, { AdminStatistics } from '../../services/ApiClient';
import { UsersThree, Sparkle, Books, BookOpen, Note, FileText, ChartBar, CircleNotch, Warning } from '../../components/Icon';

/** 颜色类名映射 */
type ColorKey = 'blue' | 'green' | 'purple' | 'indigo' | 'pink' | 'yellow' | 'red';

export default function AdminDashboard() {
    const [stats, setStats] = useState<AdminStatistics | null>(null);
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
            <div className="p-8 min-h-[400px] flex items-center justify-center animate-g3-fade-in">
                <div className="text-center">
                    <CircleNotch className="animate-spin mx-auto mb-4" size={48} weight="bold" color="#3b82f6" />
                    <p className="text-gray-600" role="status" aria-live="polite">正在加载...</p>
                </div>
            </div>
        );
    }

    if (error || !stats) {
        return (
            <div className="p-8 min-h-[400px] flex items-center justify-center animate-g3-fade-in">
                <div className="text-center max-w-md" role="alert" aria-live="assertive">
                    <Warning size={64} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">加载失败</h2>
                    <p className="text-gray-600 mb-6">{error || '无法加载统计数据'}</p>
                    <button
                        onClick={loadStatistics}
                        className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95"
                    >
                        重试
                    </button>
                </div>
            </div>
        );
    }

    const statCards: Array<{
        label: string;
        value: number;
        icon: typeof UsersThree;
        color: ColorKey;
    }> = [
        {
            label: '总用户数',
            value: stats.totalUsers,
            icon: UsersThree,
            color: 'blue',
        },
        {
            label: '活跃用户',
            value: stats.activeUsers,
            icon: Sparkle,
            color: 'green',
        },
        {
            label: '总词库数',
            value: stats.totalWordBooks,
            icon: Books,
            color: 'purple',
        },
        {
            label: '系统词库',
            value: stats.systemWordBooks,
            icon: BookOpen,
            color: 'indigo',
        },
        {
            label: '用户词库',
            value: stats.userWordBooks,
            icon: Note,
            color: 'pink',
        },
        {
            label: '总单词数',
            value: stats.totalWords,
            icon: FileText,
            color: 'yellow',
        },
        {
            label: '学习记录',
            value: stats.totalRecords,
            icon: ChartBar,
            color: 'red',
        },
    ];

    const getColorClasses = (color: ColorKey): string => {
        const colors: Record<ColorKey, string> = {
            blue: 'bg-blue-50 text-blue-600',
            green: 'bg-green-50 text-green-600',
            purple: 'bg-purple-50 text-purple-600',
            indigo: 'bg-indigo-50 text-indigo-600',
            pink: 'bg-pink-50 text-pink-600',
            yellow: 'bg-yellow-50 text-yellow-600',
            red: 'bg-red-50 text-red-600',
        };
        return colors[color];
    };

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">系统概览</h1>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
                {statCards.map((card) => {
                    const IconComponent = card.icon;
                    return (
                        <div
                            key={card.label}
                            className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm hover:shadow-lg transition-all duration-200"
                        >
                            <div
                                className={`inline-flex items-center justify-center w-12 h-12 rounded-lg mb-4 ${getColorClasses(
                                    card.color
                                )}`}
                            >
                                <IconComponent size={28} weight="duotone" />
                            </div>
                            <div className="text-gray-600 text-sm mb-1">{card.label}</div>
                            <div className="text-3xl font-bold text-gray-900">{card.value}</div>
                        </div>
                    );
                })}
            </div>

            {/* 额外信息 */}
            <div className="grid gap-6 md:grid-cols-2">
                <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
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

                <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
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
