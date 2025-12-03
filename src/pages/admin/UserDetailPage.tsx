import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient, {
    UserDetailedStatistics,
    UserWordDetail,
} from '../../services/ApiClient';
import {
    User,
    ChartBar,
    Target,
    Clock,
    TrendUp,
    Books,
    ArrowLeft,
    MagnifyingGlass,
    CaretLeft,
    CaretRight,
} from '../../components/Icon';
import { Flame, CaretDown, ArrowUp, ArrowDown, ListDashes } from '@phosphor-icons/react';
import LearningRecordsTab from '../../components/admin/LearningRecordsTab';

interface FilterState {
    scoreRange?: 'low' | 'medium' | 'high';
    masteryLevel?: number;
    minAccuracy?: number;
    state?: 'new' | 'learning' | 'reviewing' | 'mastered';
    sortBy: 'score' | 'accuracy' | 'reviewCount' | 'lastReview';
    sortOrder: 'asc' | 'desc';
}

export default function UserDetailPage() {
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();

    const [statistics, setStatistics] = useState<UserDetailedStatistics | null>(null);
    const [words, setWords] = useState<UserWordDetail[]>([]);
    const [pagination, setPagination] = useState({
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
    });

    const [isLoadingStats, setIsLoadingStats] = useState(true);
    const [isLoadingWords, setIsLoadingWords] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [filters, setFilters] = useState<FilterState>({
        sortBy: 'lastReview',
        sortOrder: 'desc',
    });

    const [showFilters, setShowFilters] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'records'>('overview');

    const handleExport = async (format: 'csv' | 'excel') => {
        if (!userId) return;

        try {
            setIsExporting(true);
            await apiClient.adminExportUserWords(userId, format);
        } catch (err) {
            console.error('导出失败:', err);
            alert('导出失败，请重试');
        } finally {
            setIsExporting(false);
        }
    };

    useEffect(() => {
        if (userId) {
            loadStatistics();
            loadWords();
        }
    }, [userId]);

    useEffect(() => {
        if (userId) {
            loadWords();
        }
    }, [filters, pagination.page]);

    const loadStatistics = async () => {
        if (!userId) return;

        try {
            setIsLoadingStats(true);
            setError(null);

            const data = await apiClient.adminGetUserStatistics(userId);
            setStatistics(data);
        } catch (err) {
            console.error('加载用户统计失败:', err);
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setIsLoadingStats(false);
        }
    };

    const loadWords = async () => {
        if (!userId) return;

        try {
            setIsLoadingWords(true);

            const response = await apiClient.adminGetUserWords(userId, {
                page: pagination.page,
                pageSize: pagination.pageSize,
                ...filters,
            });

            setWords(response.words);
            setPagination(response.pagination);
        } catch (err) {
            console.error('加载单词列表失败:', err);
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setIsLoadingWords(false);
        }
    };

    const handleFilterChange = (newFilters: Partial<FilterState>) => {
        setFilters((prev) => ({ ...prev, ...newFilters }));
        setPagination((prev) => ({ ...prev, page: 1 }));
    };

    const handlePageChange = (newPage: number) => {
        setPagination((prev) => ({ ...prev, page: newPage }));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const toggleSortOrder = () => {
        setFilters((prev) => ({
            ...prev,
            sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc',
        }));
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
    };

    const getMasteryLevelLabel = (level: number) => {
        const labels = ['新单词', '初识', '熟悉', '掌握', '熟练', '精通'];
        return labels[level] || '未知';
    };

    const getMasteryLevelColor = (level: number) => {
        const colors = [
            'text-gray-500',
            'text-blue-500',
            'text-green-500',
            'text-yellow-500',
            'text-orange-500',
            'text-purple-500',
        ];
        return colors[level] || 'text-gray-500';
    };

    const getStateLabel = (state: string) => {
        const labels: Record<string, string> = {
            NEW: '新单词',
            LEARNING: '学习中',
            REVIEWING: '复习中',
            MASTERED: '已掌握',
        };
        return labels[state] || state;
    };

    const getStateColor = (state: string) => {
        const colors: Record<string, string> = {
            NEW: 'bg-gray-100 text-gray-700',
            LEARNING: 'bg-blue-100 text-blue-700',
            REVIEWING: 'bg-yellow-100 text-yellow-700',
            MASTERED: 'bg-green-100 text-green-700',
        };
        return colors[state] || 'bg-gray-100 text-gray-700';
    };

    if (isLoadingStats && !statistics) {
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

    if (error && !statistics) {
        return (
            <div className="p-8">
                <div className="text-center py-12">
                    <div className="text-red-500 text-5xl mb-4">⚠️</div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">加载失败</h2>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <button
                        onClick={() => navigate('/admin/users')}
                        className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
                    >
                        返回用户列表
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 animate-g3-fade-in">
            {/* 返回按钮 */}
            <button
                onClick={() => navigate('/admin/users')}
                className="mb-6 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
                <ArrowLeft size={20} weight="bold" />
                <span>返回用户列表</span>
            </button>

            {/* 用户信息头部 */}
            {statistics && (
                <div className="mb-8">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                            <User size={32} weight="bold" className="text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">
                                {statistics.user.username}
                            </h1>
                            <p className="text-gray-600">{statistics.user.email}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* 标签页导航 */}
            <div className="flex border-b border-gray-200 mb-6">
                <button
                    className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                        activeTab === 'overview' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
                    }`}
                    onClick={() => setActiveTab('overview')}
                >
                    <div className="flex items-center gap-2">
                        <ChartBar size={18} />
                        <span>统计概览</span>
                    </div>
                    {activeTab === 'overview' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                    )}
                </button>
                <button
                    className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                        activeTab === 'records' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
                    }`}
                    onClick={() => setActiveTab('records')}
                >
                    <div className="flex items-center gap-2">
                        <ListDashes size={18} />
                        <span>学习记录</span>
                    </div>
                    {activeTab === 'records' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                    )}
                </button>
            </div>

            {/* 标签页内容 */}
            {activeTab === 'overview' ? (
                <>
                    {/* 统计卡片 */}
            {statistics && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {/* 总学习单词数 */}
                    <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <Books size={32} weight="duotone" className="text-blue-500" />
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-1">
                            {statistics.totalWordsLearned}
                        </div>
                        <div className="text-sm text-gray-600">总学习单词数</div>
                    </div>

                    {/* 平均得分 */}
                    <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <Target size={32} weight="duotone" className="text-purple-500" />
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-1">
                            {statistics.averageScore.toFixed(1)}
                        </div>
                        <div className="text-sm text-gray-600">平均单词得分</div>
                    </div>

                    {/* 整体正确率 */}
                    <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <ChartBar size={32} weight="duotone" className="text-green-500" />
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-1">
                            {statistics.accuracy.toFixed(1)}%
                        </div>
                        <div className="text-sm text-gray-600">整体正确率</div>
                    </div>

                    {/* 学习天数 */}
                    <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <Clock size={32} weight="duotone" className="text-orange-500" />
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-1">
                            {statistics.studyDays}
                        </div>
                        <div className="text-sm text-gray-600">学习天数</div>
                    </div>

                    {/* 连续学习天数 */}
                    <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <Flame size={32} weight="duotone" className="text-red-500" />
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-1">
                            {statistics.consecutiveDays}
                        </div>
                        <div className="text-sm text-gray-600">连续学习天数</div>
                    </div>

                    {/* 总学习时长 */}
                    <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <TrendUp size={32} weight="duotone" className="text-indigo-500" />
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-1">
                            {statistics.totalStudyTime}
                        </div>
                        <div className="text-sm text-gray-600">总学习时长（分钟）</div>
                    </div>
                </div>
            )}

            {/* 掌握程度分布 */}
            {statistics && (
                <div className="mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
                    <h2 className="text-xl font-bold text-gray-900 mb-6">掌握程度分布</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        {Object.entries(statistics.masteryDistribution).map(
                            ([level, count]) => {
                                const levelNum = parseInt(level.replace('level', ''));
                                return (
                                    <div
                                        key={level}
                                        className="p-4 bg-gray-50 rounded-lg text-center"
                                    >
                                        <div
                                            className={`text-2xl font-bold mb-1 ${getMasteryLevelColor(
                                                levelNum
                                            )}`}
                                        >
                                            {count}
                                        </div>
                                        <div className="text-sm text-gray-600">
                                            {getMasteryLevelLabel(levelNum)}
                                        </div>
                                    </div>
                                );
                            }
                        )}
                    </div>
                </div>
            )}

            {/* 单词列表 */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
                <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-gray-900">单词列表</h2>
                        <div className="flex items-center gap-3">
                            {/* 导出按钮 */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleExport('csv')}
                                    disabled={isExporting || isLoadingWords || words.length === 0}
                                    className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="导出为CSV格式"
                                >
                                    {isExporting ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                    ) : (
                                        <svg
                                            className="w-4 h-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                            />
                                        </svg>
                                    )}
                                    <span>{isExporting ? '导出中...' : '导出CSV'}</span>
                                </button>
                                <button
                                    onClick={() => handleExport('excel')}
                                    disabled={isExporting || isLoadingWords || words.length === 0}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="导出为Excel格式"
                                >
                                    {isExporting ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                    ) : (
                                        <svg
                                            className="w-4 h-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                            />
                                        </svg>
                                    )}
                                    <span>{isExporting ? '导出中...' : '导出Excel'}</span>
                                </button>
                            </div>
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                <MagnifyingGlass size={16} weight="bold" />
                                <span>筛选和排序</span>
                                <CaretDown
                                    size={16}
                                    weight="bold"
                                    className={`transition-transform ${
                                        showFilters ? 'rotate-180' : ''
                                    }`}
                                />
                            </button>
                        </div>
                    </div>

                    {/* 筛选器 */}
                    {showFilters && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                            {/* 得分范围 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    得分范围
                                </label>
                                <select
                                    value={filters.scoreRange || ''}
                                    onChange={(e) =>
                                        handleFilterChange({
                                            scoreRange: e.target.value as any,
                                        })
                                    }
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="">全部</option>
                                    <option value="low">低分 (0-40)</option>
                                    <option value="medium">中等 (40-80)</option>
                                    <option value="high">高分 (80-100)</option>
                                </select>
                            </div>

                            {/* 掌握程度 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    掌握程度
                                </label>
                                <select
                                    value={
                                        filters.masteryLevel !== undefined
                                            ? filters.masteryLevel
                                            : ''
                                    }
                                    onChange={(e) =>
                                        handleFilterChange({
                                            masteryLevel:
                                                e.target.value === ''
                                                    ? undefined
                                                    : parseInt(e.target.value),
                                        })
                                    }
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="">全部</option>
                                    <option value="0">新单词</option>
                                    <option value="1">初识</option>
                                    <option value="2">熟悉</option>
                                    <option value="3">掌握</option>
                                    <option value="4">熟练</option>
                                    <option value="5">精通</option>
                                </select>
                            </div>

                            {/* 学习状态 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    学习状态
                                </label>
                                <select
                                    value={filters.state || ''}
                                    onChange={(e) =>
                                        handleFilterChange({
                                            state: e.target.value as any,
                                        })
                                    }
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="">全部</option>
                                    <option value="new">新单词</option>
                                    <option value="learning">学习中</option>
                                    <option value="reviewing">复习中</option>
                                    <option value="mastered">已掌握</option>
                                </select>
                            </div>

                            {/* 排序方式 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    排序方式
                                </label>
                                <div className="flex gap-2">
                                    <select
                                        value={filters.sortBy}
                                        onChange={(e) =>
                                            handleFilterChange({
                                                sortBy: e.target.value as any,
                                            })
                                        }
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value="score">单词得分</option>
                                        <option value="accuracy">正确率</option>
                                        <option value="reviewCount">学习次数</option>
                                        <option value="lastReview">最近学习时间</option>
                                    </select>
                                    <button
                                        onClick={toggleSortOrder}
                                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                        title={
                                            filters.sortOrder === 'asc' ? '升序' : '降序'
                                        }
                                    >
                                        {filters.sortOrder === 'asc' ? (
                                            <ArrowUp size={20} weight="bold" />
                                        ) : (
                                            <ArrowDown size={20} weight="bold" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 单词表格 */}
                {isLoadingWords ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
                        <p className="text-gray-600">加载中...</p>
                    </div>
                ) : words.length === 0 ? (
                    <div className="p-12 text-center">
                        <Books size={64} weight="thin" className="text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500 text-lg">暂无单词数据</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                                            单词
                                        </th>
                                        <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                                            得分
                                        </th>
                                        <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                                            掌握程度
                                        </th>
                                        <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                                            正确率
                                        </th>
                                        <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                                            学习次数
                                        </th>
                                        <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                                            最近学习
                                        </th>
                                        <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                                            下次复习
                                        </th>
                                        <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                                            状态
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {words.map((wordDetail) => (
                                        <tr
                                            key={wordDetail.word.id}
                                            className="hover:bg-gray-50 transition-colors cursor-pointer"
                                            onClick={() =>
                                                navigate(
                                                    `/admin/users/${userId}/words?wordId=${wordDetail.word.id}`
                                                )
                                            }
                                        >
                                            <td className="px-6 py-4">
                                                <div>
                                                    <div className="font-medium text-gray-900 hover:text-blue-600 transition-colors">
                                                        {wordDetail.word.spelling}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        {wordDetail.word.phonetic}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span
                                                    className={`font-bold ${
                                                        wordDetail.score >= 80
                                                            ? 'text-green-600'
                                                            : wordDetail.score >= 40
                                                            ? 'text-yellow-600'
                                                            : 'text-red-600'
                                                    }`}
                                                >
                                                    {wordDetail.score.toFixed(0)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span
                                                    className={`font-medium ${getMasteryLevelColor(
                                                        wordDetail.masteryLevel
                                                    )}`}
                                                >
                                                    {getMasteryLevelLabel(
                                                        wordDetail.masteryLevel
                                                    )}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span
                                                    className={`font-medium ${
                                                        wordDetail.accuracy >= 80
                                                            ? 'text-green-600'
                                                            : wordDetail.accuracy >= 60
                                                            ? 'text-yellow-600'
                                                            : 'text-red-600'
                                                    }`}
                                                >
                                                    {wordDetail.accuracy.toFixed(1)}%
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="text-gray-900">
                                                    {wordDetail.reviewCount}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="text-sm text-gray-600">
                                                    {formatDate(wordDetail.lastReviewDate)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="text-sm text-gray-600">
                                                    {formatDate(wordDetail.nextReviewDate)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span
                                                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStateColor(
                                                        wordDetail.state
                                                    )}`}
                                                >
                                                    {getStateLabel(wordDetail.state)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* 分页 */}
                        {pagination.totalPages > 1 && (
                            <div className="p-6 border-t border-gray-200 flex items-center justify-between">
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
                                                return (
                                                    page === 1 ||
                                                    page === pagination.totalPages ||
                                                    Math.abs(page - pagination.page) <= 2
                                                );
                                            })
                                            .map((page, index, array) => {
                                                if (
                                                    index > 0 &&
                                                    page - array[index - 1] > 1
                                                ) {
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
                </>
            ) : (
                <LearningRecordsTab userId={userId || ''} />
            )}
        </div>
    );
}
