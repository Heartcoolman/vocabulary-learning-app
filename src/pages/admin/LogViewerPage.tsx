import { useState, useEffect } from 'react';
import {
    CircleNotch,
    Warning,
    MagnifyingGlass,
    CaretDown,
    CaretLeft,
    CaretRight,
    File,
    Bug,
    Info,
    WarningCircle,
    XCircle,
} from '../../components/Icon';
import { useToast } from '../../components/ui';
import { adminLogger } from '../../utils/logger';

// 日志级别类型
type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

// 日志来源类型
type LogSource = 'frontend' | 'backend';

// 日志接口
interface LogEntry {
    id: string;
    timestamp: string;
    level: LogLevel;
    message: string;
    module?: string;
    source: LogSource;
    userId?: string;
    metadata?: Record<string, any>;
}

// 统计数据接口
interface LogStats {
    total: number;
    errorCount: number;
    warnCount: number;
    frontendCount: number;
    backendCount: number;
}

// 分页信息接口
interface Pagination {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
}

// 筛选状态接口
interface FilterState {
    levels: LogLevel[];
    module?: string;
    source?: LogSource;
    startDate?: string;
    endDate?: string;
    search?: string;
}

export default function LogViewerPage() {
    const toast = useToast();

    // 状态管理
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [stats, setStats] = useState<LogStats | null>(null);
    const [pagination, setPagination] = useState<Pagination>({
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
    });

    const [isLoadingLogs, setIsLoadingLogs] = useState(true);
    const [isLoadingStats, setIsLoadingStats] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [filters, setFilters] = useState<FilterState>({
        levels: [],
    });
    const [showFilters, setShowFilters] = useState(false);
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

    // 可用的模块列表（可以从后端获取）
    const [availableModules, setAvailableModules] = useState<string[]>([]);

    useEffect(() => {
        loadStats();
        loadLogs();
    }, []);

    useEffect(() => {
        loadLogs();
    }, [filters, pagination.page]);

    // 加载统计数据
    const loadStats = async () => {
        try {
            setIsLoadingStats(true);
            setError(null);

            const response = await fetch('/api/admin/logs/stats', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                },
            });

            if (!response.ok) {
                throw new Error(`加载统计失败: ${response.status}`);
            }

            const data = await response.json();
            if (data.success) {
                setStats(data.data);
            } else {
                throw new Error(data.error || '加载统计失败');
            }
        } catch (err) {
            adminLogger.error({ err }, '加载日志统计失败');
            setError(err instanceof Error ? err.message : '加载统计失败');
        } finally {
            setIsLoadingStats(false);
        }
    };

    // 加载日志列表
    const loadLogs = async () => {
        try {
            setIsLoadingLogs(true);
            setError(null);

            const queryParams = new URLSearchParams();
            queryParams.append('page', pagination.page.toString());
            queryParams.append('pageSize', pagination.pageSize.toString());

            if (filters.levels.length > 0) {
                queryParams.append('levels', filters.levels.join(','));
            }
            if (filters.module) {
                queryParams.append('module', filters.module);
            }
            if (filters.source) {
                queryParams.append('source', filters.source);
            }
            if (filters.startDate) {
                queryParams.append('startDate', filters.startDate);
            }
            if (filters.endDate) {
                queryParams.append('endDate', filters.endDate);
            }
            if (filters.search) {
                queryParams.append('search', filters.search);
            }

            const response = await fetch(`/api/admin/logs?${queryParams.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                },
            });

            if (!response.ok) {
                throw new Error(`加载日志失败: ${response.status}`);
            }

            const data = await response.json();
            if (data.success) {
                setLogs(data.data.logs);
                setPagination(data.data.pagination);

                // 提取所有唯一的模块名
                const modules = Array.from(
                    new Set(data.data.logs.map((log: LogEntry) => log.module).filter(Boolean))
                ) as string[];
                setAvailableModules(modules);
            } else {
                throw new Error(data.error || '加载日志失败');
            }
        } catch (err) {
            adminLogger.error({ err, filters }, '加载日志列表失败');
            setError(err instanceof Error ? err.message : '加载日志失败');
        } finally {
            setIsLoadingLogs(false);
        }
    };

    // 处理筛选变化
    const handleFilterChange = (newFilters: Partial<FilterState>) => {
        setFilters((prev) => ({ ...prev, ...newFilters }));
        setPagination((prev) => ({ ...prev, page: 1 }));
    };

    // 处理级别筛选
    const handleLevelToggle = (level: LogLevel) => {
        setFilters((prev) => {
            const levels = prev.levels.includes(level)
                ? prev.levels.filter((l) => l !== level)
                : [...prev.levels, level];
            return { ...prev, levels };
        });
        setPagination((prev) => ({ ...prev, page: 1 }));
    };

    // 处理分页
    const handlePageChange = (newPage: number) => {
        setPagination((prev) => ({ ...prev, page: newPage }));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // 切换日志详情展开状态
    const toggleLogExpand = (logId: string) => {
        setExpandedLogId(expandedLogId === logId ? null : logId);
    };

    // 获取日志级别图标
    const getLevelIcon = (level: LogLevel) => {
        switch (level) {
            case 'ERROR':
                return <XCircle size={20} weight="fill" className="text-red-500" />;
            case 'WARN':
                return <WarningCircle size={20} weight="fill" className="text-yellow-500" />;
            case 'INFO':
                return <Info size={20} weight="fill" className="text-blue-500" />;
            case 'DEBUG':
                return <Bug size={20} weight="fill" className="text-gray-500" />;
            default:
                return <File size={20} weight="fill" className="text-gray-400" />;
        }
    };

    // 获取日志级别颜色
    const getLevelColor = (level: LogLevel) => {
        switch (level) {
            case 'ERROR':
                return 'bg-red-50 text-red-700 border-red-200';
            case 'WARN':
                return 'bg-yellow-50 text-yellow-700 border-yellow-200';
            case 'INFO':
                return 'bg-blue-50 text-blue-700 border-blue-200';
            case 'DEBUG':
                return 'bg-gray-50 text-gray-700 border-gray-200';
            default:
                return 'bg-gray-50 text-gray-600 border-gray-200';
        }
    };

    // 获取来源标签颜色
    const getSourceColor = (source: LogSource) => {
        return source === 'frontend'
            ? 'bg-purple-50 text-purple-700'
            : 'bg-green-50 text-green-700';
    };

    // 格式化时间
    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    };

    if (isLoadingStats && !stats) {
        return (
            <div className="p-8">
                <div className="flex items-center justify-center min-h-[400px]">
                    <div className="text-center">
                        <CircleNotch
                            className="animate-spin mx-auto mb-4"
                            size={48}
                            weight="bold"
                            color="#3b82f6"
                        />
                        <p className="text-gray-600">加载中...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error && !stats) {
        return (
            <div className="p-8">
                <div className="text-center py-12">
                    <Warning size={64} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">加载失败</h2>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <button
                        onClick={() => {
                            loadStats();
                            loadLogs();
                        }}
                        className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
                    >
                        重试
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 animate-g3-fade-in">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">系统日志</h1>

            {/* 统计卡片 */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
                    {/* 总日志数 */}
                    <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <File size={32} weight="duotone" className="text-gray-500" />
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-1">{stats.total}</div>
                        <div className="text-sm text-gray-600">总日志数</div>
                    </div>

                    {/* ERROR 数量 */}
                    <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <XCircle size={32} weight="duotone" className="text-red-500" />
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-1">
                            {stats.errorCount}
                        </div>
                        <div className="text-sm text-gray-600">错误数量</div>
                    </div>

                    {/* WARN 数量 */}
                    <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <WarningCircle size={32} weight="duotone" className="text-yellow-500" />
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-1">
                            {stats.warnCount}
                        </div>
                        <div className="text-sm text-gray-600">警告数量</div>
                    </div>

                    {/* 前端日志数 */}
                    <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <Info size={32} weight="duotone" className="text-purple-500" />
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-1">
                            {stats.frontendCount}
                        </div>
                        <div className="text-sm text-gray-600">前端日志</div>
                    </div>

                    {/* 后端日志数 */}
                    <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <Info size={32} weight="duotone" className="text-green-500" />
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-1">
                            {stats.backendCount}
                        </div>
                        <div className="text-sm text-gray-600">后端日志</div>
                    </div>
                </div>
            )}

            {/* 日志列表 */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
                <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-gray-900">日志列表</h2>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                            <MagnifyingGlass size={16} weight="bold" />
                            <span>筛选</span>
                            <CaretDown
                                size={16}
                                weight="bold"
                                className={`transition-transform ${showFilters ? 'rotate-180' : ''}`}
                            />
                        </button>
                    </div>

                    {/* 筛选器 */}
                    {showFilters && (
                        <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                            {/* 级别多选 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    日志级别
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {(['ERROR', 'WARN', 'INFO', 'DEBUG'] as LogLevel[]).map(
                                        (level) => (
                                            <button
                                                key={level}
                                                onClick={() => handleLevelToggle(level)}
                                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                                    filters.levels.includes(level)
                                                        ? getLevelColor(level)
                                                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                                                }`}
                                            >
                                                {level}
                                            </button>
                                        )
                                    )}
                                </div>
                            </div>

                            {/* 其他筛选选项 */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* 模块选择 */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        模块
                                    </label>
                                    <select
                                        value={filters.module || ''}
                                        onChange={(e) =>
                                            handleFilterChange({ module: e.target.value || undefined })
                                        }
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value="">全部模块</option>
                                        {availableModules.map((module) => (
                                            <option key={module} value={module}>
                                                {module}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* 来源选择 */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        来源
                                    </label>
                                    <select
                                        value={filters.source || ''}
                                        onChange={(e) =>
                                            handleFilterChange({
                                                source: e.target.value as LogSource | undefined,
                                            })
                                        }
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value="">全部来源</option>
                                        <option value="frontend">前端</option>
                                        <option value="backend">后端</option>
                                    </select>
                                </div>

                                {/* 搜索框 */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        搜索
                                    </label>
                                    <input
                                        type="text"
                                        value={filters.search || ''}
                                        onChange={(e) =>
                                            handleFilterChange({ search: e.target.value || undefined })
                                        }
                                        placeholder="搜索日志内容..."
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                            </div>

                            {/* 时间范围 */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        开始时间
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={filters.startDate || ''}
                                        onChange={(e) =>
                                            handleFilterChange({ startDate: e.target.value || undefined })
                                        }
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        结束时间
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={filters.endDate || ''}
                                        onChange={(e) =>
                                            handleFilterChange({ endDate: e.target.value || undefined })
                                        }
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 日志表格 */}
                {isLoadingLogs ? (
                    <div className="p-12 text-center">
                        <CircleNotch
                            className="animate-spin mx-auto mb-4"
                            size={48}
                            weight="bold"
                            color="#3b82f6"
                        />
                        <p className="text-gray-600">加载中...</p>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="p-12 text-center">
                        <File size={64} weight="thin" className="text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500 text-lg">暂无日志数据</p>
                    </div>
                ) : (
                    <>
                        <div className="divide-y divide-gray-200">
                            {logs.map((log) => (
                                <div
                                    key={log.id}
                                    className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                                    onClick={() => toggleLogExpand(log.id)}
                                >
                                    <div className="flex items-start gap-4">
                                        {/* 级别图标 */}
                                        <div className="flex-shrink-0 mt-1">
                                            {getLevelIcon(log.level)}
                                        </div>

                                        {/* 主要内容 */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                {/* 级别标签 */}
                                                <span
                                                    className={`px-2 py-1 rounded text-xs font-medium border ${getLevelColor(
                                                        log.level
                                                    )}`}
                                                >
                                                    {log.level}
                                                </span>

                                                {/* 来源标签 */}
                                                <span
                                                    className={`px-2 py-1 rounded text-xs font-medium ${getSourceColor(
                                                        log.source
                                                    )}`}
                                                >
                                                    {log.source === 'frontend' ? '前端' : '后端'}
                                                </span>

                                                {/* 模块标签 */}
                                                {log.module && (
                                                    <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
                                                        {log.module}
                                                    </span>
                                                )}

                                                {/* 时间 */}
                                                <span className="text-xs text-gray-500 ml-auto">
                                                    {formatTime(log.timestamp)}
                                                </span>
                                            </div>

                                            {/* 日志消息 */}
                                            <p className="text-sm text-gray-900 mb-1 break-words">
                                                {log.message}
                                            </p>

                                            {/* 展开的详细信息 */}
                                            {expandedLogId === log.id && log.metadata && (
                                                <div className="mt-3 p-3 bg-gray-900 rounded text-xs text-gray-100 overflow-x-auto">
                                                    <pre className="whitespace-pre-wrap break-words">
                                                        {JSON.stringify(log.metadata, null, 2)}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* 分页 */}
                        {pagination.totalPages > 1 && (
                            <div className="p-6 border-t border-gray-200 flex items-center justify-between">
                                <div className="text-sm text-gray-600">
                                    显示第 {(pagination.page - 1) * pagination.pageSize + 1} -{' '}
                                    {Math.min(pagination.page * pagination.pageSize, pagination.total)}{' '}
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
                                        {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                                            .filter((page) => {
                                                return (
                                                    page === 1 ||
                                                    page === pagination.totalPages ||
                                                    Math.abs(page - pagination.page) <= 2
                                                );
                                            })
                                            .map((page, index, array) => {
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
        </div>
    );
}
