import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import StorageService from '../services/StorageService';
import ApiClient, { type SessionStats } from '../services/client';
import { handleError } from '../utils/errorHandler';
import { learningLogger } from '../utils/logger';
import {
  StateHistoryPoint,
  SignificantChange,
  DateRangeOption,
  CognitiveGrowthResult,
} from '../types/amas-enhanced';
import {
  ChartBar,
  Target,
  CheckCircle,
  Warning,
  Clock,
  TrendUp,
  TrendDown,
  Hash,
  BookOpen,
  MagnifyingGlass,
  CircleNotch,
  ChartLine,
  Brain,
  ArrowUp,
  ArrowDown,
  Calendar,
  Play,
  Timer,
} from '../components/Icon';
import { IconColor, chartColors } from '../utils/iconColors';

interface WordStats {
  wordId: string;
  spelling: string;
  attempts: number;
  correct: number;
  correctRate: number;
  lastStudied: number;
}

interface WordStatRecord {
  attempts: number;
  correct: number;
  lastStudied: number;
}

/**
 * HistoryPage - 学习历史页面（增强版）
 * 显示学习统计、状态历史折线图、认知成长对比、显著变化标记
 * Requirements: 5.1, 5.3, 5.4, 5.5
 */
type SortType = 'time' | 'correctRate' | 'attempts';
type FilterType = 'all' | 'mastered' | 'reviewing' | 'struggling';
type ViewMode = 'words' | 'state' | 'sessions';

export default function HistoryPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<WordStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortType>('time');
  const [filterBy, setFilterBy] = useState<FilterType>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('words');

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // 会话相关状态
  const [sessions, setSessions] = useState<SessionStats[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionsPagination, setSessionsPagination] = useState({ total: 0, limit: 10, offset: 0 });
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  // 状态历史相关状态
  const [dateRange, setDateRange] = useState<DateRangeOption>(30);
  const [stateHistory, setStateHistory] = useState<StateHistoryPoint[]>([]);
  const [cognitiveGrowth, setCognitiveGrowth] = useState<CognitiveGrowthResult | null>(null);
  const [significantChanges, setSignificantChanges] = useState<
    (SignificantChange & { description: string })[]
  >([]);
  const [isLoadingState, setIsLoadingState] = useState(false);

  // 加载单词统计数据
  useEffect(() => {
    let mounted = true;

    const loadStatistics = async () => {
      try {
        if (mounted) setIsLoading(true);

        const statistics = await StorageService.getStudyStatistics();
        if (!mounted) return;

        const words = await StorageService.getWords();
        if (!mounted) return;

        const statsArray: WordStats[] = [];
        statistics.wordStats.forEach((stat: WordStatRecord, wordId: string) => {
          const word = words.find((w) => w.id === wordId);
          if (word) {
            statsArray.push({
              wordId,
              spelling: word.spelling,
              attempts: stat.attempts,
              correct: stat.correct,
              correctRate: stat.attempts > 0 ? (stat.correct / stat.attempts) * 100 : 0,
              lastStudied: stat.lastStudied,
            });
          }
        });

        statsArray.sort((a, b) => b.lastStudied - a.lastStudied);

        if (mounted) {
          setStats(statsArray);
          setError(null);
        }
      } catch (err) {
        if (mounted) setError(handleError(err));
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadStatistics();

    return () => {
      mounted = false;
    };
  }, []);

  // 加载状态历史数据
  useEffect(() => {
    if (viewMode !== 'state') return;

    let mounted = true;

    const loadStateHistory = async () => {
      try {
        if (mounted) setIsLoadingState(true);

        const [historyData, growthData, changesData] = await Promise.all([
          ApiClient.getStateHistory(dateRange),
          ApiClient.getCognitiveGrowth(dateRange),
          ApiClient.getSignificantChanges(dateRange),
        ]);

        if (mounted) {
          setStateHistory(historyData.history);
          setCognitiveGrowth(growthData);
          setSignificantChanges(changesData.changes);
        }
      } catch (err) {
        learningLogger.error({ err }, '加载状态历史失败');
      } finally {
        if (mounted) setIsLoadingState(false);
      }
    };

    loadStateHistory();

    return () => {
      mounted = false;
    };
  }, [viewMode, dateRange]);

  // 加载会话数据
  useEffect(() => {
    if (viewMode !== 'sessions') return;

    let mounted = true;

    const loadSessions = async () => {
      try {
        if (mounted) setIsLoadingSessions(true);
        const res = await ApiClient.listSessions({
          limit: 10,
          offset: sessionsPagination.offset,
        });
        if (mounted) {
          setSessions(res.data);
          setSessionsPagination(res.pagination);
        }
      } catch (err) {
        learningLogger.error({ err }, '加载会话列表失败');
      } finally {
        if (mounted) setIsLoadingSessions(false);
      }
    };

    loadSessions();

    return () => {
      mounted = false;
    };
  }, [viewMode, sessionsPagination.offset]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;

    return date.toLocaleDateString('zh-CN');
  };

  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const getCorrectRateColor = (rate: number) => {
    if (rate >= 80) return 'text-green-600';
    if (rate >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getMasteryLevel = (rate: number): FilterType => {
    if (rate >= 80) return 'mastered';
    if (rate >= 40) return 'reviewing';
    return 'struggling';
  };

  const getMasteryLabel = (rate: number) => {
    if (rate >= 80)
      return {
        label: '已掌握',
        icon: CheckCircle,
        color: 'text-green-600',
        bg: 'bg-green-50',
        border: 'border-green-300',
      };
    if (rate >= 40)
      return {
        label: '需复习',
        icon: Warning,
        color: 'text-yellow-600',
        bg: 'bg-yellow-50',
        border: 'border-yellow-300',
      };
    return {
      label: '未掌握',
      icon: Warning,
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-300',
    };
  };

  // 渲染状态历史折线图 - 当数据>=3天时显示迷你折线图
  const renderStateChart = (
    data: StateHistoryPoint[],
    metric: keyof Omit<StateHistoryPoint, 'date' | 'trendState'>,
    color: string,
    label: string,
  ) => {
    if (!data || data.length === 0) return null;

    const values = data.map((d) => d[metric] as number);
    const currentValue = values[values.length - 1];
    const previousValue = values.length > 1 ? values[0] : currentValue;
    const change = currentValue - previousValue;

    // 疲劳度特殊处理：下降是好事
    const isPositiveMetric = metric !== 'fatigue';
    const isPositiveChange = isPositiveMetric ? change >= 0 : change <= 0;
    const hasChange = values.length > 1 && Math.abs(change) > 0.001;

    // 转换为百分比显示
    const displayValue = (currentValue * 100).toFixed(0);

    // 生成迷你折线图路径（仅当数据>=3天时）
    const showMiniChart = values.length >= 3;
    let miniChartPath = '';
    if (showMiniChart) {
      const minVal = Math.min(...values);
      const maxVal = Math.max(...values);
      const range = maxVal - minVal || 0.01; // 避免除以0
      const chartWidth = 100;
      const chartHeight = 24;
      const padding = 2;

      const points = values.map((v, i) => {
        const x = padding + (i / (values.length - 1)) * (chartWidth - padding * 2);
        const y = chartHeight - padding - ((v - minVal) / range) * (chartHeight - padding * 2);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
      });
      miniChartPath = points.join(' ');
    }

    return (
      <div className="rounded-card border border-gray-200 bg-white p-5 transition-all hover:shadow-elevated dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
          {hasChange && (
            <span
              className={`text-sm font-semibold ${isPositiveChange ? 'text-green-500' : 'text-red-500'}`}
            >
              {change > 0 ? '↗' : '↘'}
            </span>
          )}
        </div>

        <div className="mb-3 text-center">
          <span className="text-4xl font-bold" style={{ color }}>
            {displayValue}
          </span>
          <span className="ml-1 text-lg text-gray-400">%</span>
        </div>

        {showMiniChart && (
          <div className="mb-3">
            <svg
              viewBox="-2 -2 104 28"
              className="h-6 w-full overflow-visible"
              preserveAspectRatio="none"
            >
              <path
                d={miniChartPath}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.8"
              />
              {values.length > 0 &&
                (() => {
                  const minVal = Math.min(...values);
                  const maxVal = Math.max(...values);
                  const range = maxVal - minVal || 0.01;
                  const chartWidth = 100;
                  const chartHeight = 24;
                  const padding = 2;

                  const startX = padding;
                  const startY =
                    chartHeight -
                    padding -
                    ((values[0] - minVal) / range) * (chartHeight - padding * 2);
                  const endX = chartWidth - padding;
                  const endY =
                    chartHeight -
                    padding -
                    ((values[values.length - 1] - minVal) / range) * (chartHeight - padding * 2);

                  return (
                    <>
                      <circle cx={startX} cy={startY} r="3" fill={color} opacity="0.5" />
                      <circle cx={endX} cy={endY} r="3" fill={color} />
                    </>
                  );
                })()}
            </svg>
          </div>
        )}

        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
          <div
            className="h-full rounded-full transition-all duration-g3-slower ease-g3"
            style={{
              width: `${Math.min(100, currentValue * 100)}%`,
              backgroundColor: color,
            }}
          />
        </div>
      </div>
    );
  };

  // 过滤和排序
  const filteredAndSortedStats = useMemo(() => {
    let filtered = stats;

    if (filterBy !== 'all') {
      filtered = stats.filter((stat) => getMasteryLevel(stat.correctRate) === filterBy);
    }

    const sorted = [...filtered];
    switch (sortBy) {
      case 'correctRate':
        sorted.sort((a, b) => a.correctRate - b.correctRate);
        break;
      case 'attempts':
        sorted.sort((a, b) => b.attempts - a.attempts);
        break;
      case 'time':
      default:
        sorted.sort((a, b) => b.lastStudied - a.lastStudied);
        break;
    }

    return sorted;
  }, [stats, sortBy, filterBy]);

  // 分页逻辑
  const totalPages = Math.ceil(filteredAndSortedStats.length / itemsPerPage);
  const currentStats = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedStats.slice(start, start + itemsPerPage);
  }, [filteredAndSortedStats, currentPage]);

  // 重置页码当筛选/排序改变时
  useEffect(() => {
    setCurrentPage(1);
  }, [filterBy, sortBy]);

  // 统计数据
  const statistics = useMemo(() => {
    if (stats.length === 0)
      return { total: 0, avgCorrectRate: 0, mastered: 0, reviewing: 0, struggling: 0 };

    const total = stats.length;
    const avgCorrectRate = stats.reduce((sum, stat) => sum + stat.correctRate, 0) / total;
    const mastered = stats.filter((s) => s.correctRate >= 80).length;
    const reviewing = stats.filter((s) => s.correctRate >= 40 && s.correctRate < 80).length;
    const struggling = stats.filter((s) => s.correctRate < 40).length;

    return { total, avgCorrectRate, mastered, reviewing, struggling };
  }, [stats]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center dark:bg-slate-900">
        <div className="text-center">
          <CircleNotch
            className="mx-auto mb-4 animate-spin"
            size={48}
            weight="bold"
            color={IconColor.primary}
          />
          <p className="text-gray-600 dark:text-gray-400" role="status" aria-live="polite">
            正在加载...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center dark:bg-slate-900">
        <div className="max-w-md px-4 text-center" role="alert">
          <Warning
            className="mx-auto mb-4"
            size={64}
            weight="fill"
            color={IconColor.danger}
            aria-hidden="true"
          />
          <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">出错了</h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-button bg-blue-500 px-6 py-3 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      <div className="mx-auto max-w-7xl animate-g3-fade-in px-4 py-8">
        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">学习历史</h1>
          <p className="text-gray-600 dark:text-gray-400">追踪你的学习进度，掌握每个单词</p>
        </header>

        {/* 视图切换 */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setViewMode('words')}
            className={`flex items-center gap-2 rounded-button px-4 py-2 font-medium transition-all duration-g3-fast ${
              viewMode === 'words'
                ? 'bg-blue-500 text-white shadow-soft'
                : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700'
            }`}
          >
            <BookOpen size={18} weight="bold" />
            单词统计
          </button>
          <button
            onClick={() => setViewMode('state')}
            className={`flex items-center gap-2 rounded-button px-4 py-2 font-medium transition-all duration-g3-fast ${
              viewMode === 'state'
                ? 'bg-blue-500 text-white shadow-soft'
                : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700'
            }`}
          >
            <ChartLine size={18} weight="bold" />
            状态历史
          </button>
          <button
            onClick={() => setViewMode('sessions')}
            className={`flex items-center gap-2 rounded-button px-4 py-2 font-medium transition-all duration-g3-fast ${
              viewMode === 'sessions'
                ? 'bg-blue-500 text-white shadow-soft'
                : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700'
            }`}
          >
            <Play size={18} weight="bold" />
            学习会话
          </button>
        </div>

        {/* 会话历史视图 */}
        {viewMode === 'sessions' && (
          <>
            {isLoadingSessions ? (
              <div className="py-12 text-center">
                <CircleNotch
                  className="mx-auto mb-4 animate-spin"
                  size={48}
                  weight="bold"
                  color={IconColor.primary}
                />
                <p className="text-gray-600 dark:text-gray-400">正在加载会话列表...</p>
              </div>
            ) : sessions.length === 0 ? (
              <div className="rounded-card border-2 border-blue-200 bg-blue-50 p-8 text-center dark:border-blue-800 dark:bg-blue-900/30">
                <Play
                  size={64}
                  weight="duotone"
                  color={IconColor.primary}
                  className="mx-auto mb-4"
                />
                <h2 className="mb-2 text-xl font-bold text-blue-800 dark:text-blue-200">
                  暂无学习会话
                </h2>
                <p className="mb-4 text-blue-600 dark:text-blue-300">
                  开始学习后会自动创建学习会话
                </p>
                <button
                  onClick={() => navigate('/learning')}
                  className="rounded-button bg-blue-500 px-6 py-3 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
                >
                  开始学习
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {sessions.map((session) => {
                    const startDate = new Date(session.startedAt);
                    const isExpanded = expandedSessionId === session.id;
                    const completionRate = session.targetMasteryCount
                      ? Math.min(
                          100,
                          (session.actualMasteryCount / session.targetMasteryCount) * 100,
                        )
                      : null;

                    return (
                      <div
                        key={session.id}
                        className="rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm transition-all hover:shadow-elevated dark:border-slate-700 dark:bg-slate-800/80"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="mb-2 flex items-center gap-3">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-bold ${
                                  session.endedAt
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300'
                                }`}
                              >
                                {session.endedAt ? '已完成' : '进行中'}
                              </span>
                              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                                {session.sessionType}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {startDate.toLocaleDateString('zh-CN')}{' '}
                              {startDate.toLocaleTimeString('zh-CN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                          <button
                            onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                            className="rounded-button border border-gray-200 px-3 py-1 text-sm text-gray-600 transition-all hover:bg-gray-50 dark:border-slate-600 dark:text-gray-400 dark:hover:bg-slate-700"
                          >
                            {isExpanded ? '收起' : '详情'}
                          </button>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-1 text-gray-500 dark:text-gray-400">
                              <Hash size={14} />
                              <span className="text-xs">题目数</span>
                            </div>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">
                              {session.totalQuestions}
                            </p>
                          </div>
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-1 text-gray-500 dark:text-gray-400">
                              <CheckCircle size={14} />
                              <span className="text-xs">掌握数</span>
                            </div>
                            <p className="text-lg font-bold text-green-600">
                              {session.actualMasteryCount}
                            </p>
                          </div>
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-1 text-gray-500 dark:text-gray-400">
                              <Timer size={14} />
                              <span className="text-xs">时长</span>
                            </div>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">
                              {Math.floor(session.duration / 60)}分{session.duration % 60}秒
                            </p>
                          </div>
                          {session.flowPeakScore !== undefined &&
                            session.flowPeakScore !== null && (
                              <div className="text-center">
                                <div className="flex items-center justify-center gap-1 text-gray-500 dark:text-gray-400">
                                  <Brain size={14} />
                                  <span className="text-xs">心流峰值</span>
                                </div>
                                <p className="text-lg font-bold text-purple-600">
                                  {(session.flowPeakScore * 100).toFixed(0)}%
                                </p>
                              </div>
                            )}
                        </div>

                        {completionRate !== null && (
                          <div className="mt-4">
                            <div className="mb-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                              <span>目标完成度</span>
                              <span>{completionRate.toFixed(0)}%</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all"
                                style={{ width: `${completionRate}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {isExpanded && (
                          <div className="mt-4 border-t border-gray-100 pt-4 dark:border-slate-700">
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              会话ID:{' '}
                              <code className="rounded bg-gray-100 px-2 py-0.5 text-xs dark:bg-slate-700">
                                {session.id}
                              </code>
                            </p>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                              答题记录数: {session.answerRecordCount} | 上下文切换:{' '}
                              {session.contextShifts}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {sessionsPagination.total > sessionsPagination.limit && (
                  <div className="mt-8 flex items-center justify-center gap-2">
                    <button
                      onClick={() =>
                        setSessionsPagination((p) => ({
                          ...p,
                          offset: Math.max(0, p.offset - p.limit),
                        }))
                      }
                      disabled={sessionsPagination.offset === 0}
                      className="rounded-button border border-gray-200 px-3 py-1 text-gray-600 transition-all hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:text-gray-400 dark:hover:bg-slate-700"
                    >
                      上一页
                    </button>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {Math.floor(sessionsPagination.offset / sessionsPagination.limit) + 1} /{' '}
                      {Math.ceil(sessionsPagination.total / sessionsPagination.limit)}
                    </span>
                    <button
                      onClick={() =>
                        setSessionsPagination((p) => ({ ...p, offset: p.offset + p.limit }))
                      }
                      disabled={
                        sessionsPagination.offset + sessionsPagination.limit >=
                        sessionsPagination.total
                      }
                      className="rounded-button border border-gray-200 px-3 py-1 text-gray-600 transition-all hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:text-gray-400 dark:hover:bg-slate-700"
                    >
                      下一页
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* 状态历史视图 */}
        {viewMode === 'state' && (
          <>
            {/* 日期范围选择器 */}
            <div className="mb-6 rounded-card border border-gray-200 bg-white/80 p-4 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
              <div className="flex items-center gap-4">
                <Calendar size={20} weight="duotone" color={IconColor.primary} />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  时间范围:
                </span>
                <div className="flex gap-2">
                  {([7, 30, 90] as DateRangeOption[]).map((range) => (
                    <button
                      key={range}
                      onClick={() => setDateRange(range)}
                      className={`rounded-button px-4 py-2 font-medium transition-all duration-g3-fast ${
                        dateRange === range
                          ? 'bg-blue-500 text-white shadow-soft'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
                      }`}
                    >
                      {range} 天
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {isLoadingState ? (
              <div className="py-12 text-center">
                <CircleNotch
                  className="mx-auto mb-4 animate-spin"
                  size={48}
                  weight="bold"
                  color={IconColor.primary}
                />
                <p className="text-gray-600 dark:text-gray-400">正在加载状态历史...</p>
              </div>
            ) : (
              <>
                {/* 认知成长对比卡片 */}
                {cognitiveGrowth && (
                  <div className="mb-6 rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
                    <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
                      <Brain size={24} weight="duotone" color={chartColors.memory} />
                      认知成长对比（{cognitiveGrowth.period} 天）
                    </h2>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div className="rounded-card bg-purple-50 p-4 dark:bg-purple-900/30">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                            记忆力
                          </span>
                          <div
                            className={`flex items-center gap-1 ${
                              cognitiveGrowth.changes.memory.direction === 'up'
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}
                          >
                            {cognitiveGrowth.changes.memory.direction === 'up' ? (
                              <ArrowUp size={16} weight="bold" />
                            ) : (
                              <ArrowDown size={16} weight="bold" />
                            )}
                            <span className="text-sm font-bold">
                              {cognitiveGrowth.changes.memory.percent.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {(cognitiveGrowth.past.memory * 100).toFixed(0)}%
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="font-bold text-purple-700 dark:text-purple-300">
                            {(cognitiveGrowth.current.memory * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>

                      <div className="rounded-card bg-blue-50 p-4 dark:bg-blue-900/30">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                            速度
                          </span>
                          <div
                            className={`flex items-center gap-1 ${
                              cognitiveGrowth.changes.speed.direction === 'up'
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}
                          >
                            {cognitiveGrowth.changes.speed.direction === 'up' ? (
                              <ArrowUp size={16} weight="bold" />
                            ) : (
                              <ArrowDown size={16} weight="bold" />
                            )}
                            <span className="text-sm font-bold">
                              {cognitiveGrowth.changes.speed.percent.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {(cognitiveGrowth.past.speed * 100).toFixed(0)}%
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="font-bold text-blue-700 dark:text-blue-300">
                            {(cognitiveGrowth.current.speed * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>

                      <div className="rounded-card bg-green-50 p-4 dark:bg-green-900/30">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium text-green-700 dark:text-green-300">
                            稳定性
                          </span>
                          <div
                            className={`flex items-center gap-1 ${
                              cognitiveGrowth.changes.stability.direction === 'up'
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}
                          >
                            {cognitiveGrowth.changes.stability.direction === 'up' ? (
                              <ArrowUp size={16} weight="bold" />
                            ) : (
                              <ArrowDown size={16} weight="bold" />
                            )}
                            <span className="text-sm font-bold">
                              {cognitiveGrowth.changes.stability.percent.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {(cognitiveGrowth.past.stability * 100).toFixed(0)}%
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="font-bold text-green-700 dark:text-green-300">
                            {(cognitiveGrowth.current.stability * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 状态历史折线图 */}
                {stateHistory.length > 0 && (
                  <div className="mb-6 rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
                    <div className="mb-5 flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
                        <ChartLine size={24} weight="duotone" color={IconColor.primary} />
                        状态历史趋势
                      </h2>
                      <span className="text-sm text-gray-400">
                        {formatShortDate(stateHistory[0].date)} -{' '}
                        {formatShortDate(stateHistory[stateHistory.length - 1].date)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
                      {renderStateChart(stateHistory, 'attention', chartColors.attention, '注意力')}
                      {renderStateChart(stateHistory, 'motivation', chartColors.motivation, '动机')}
                      {renderStateChart(stateHistory, 'memory', chartColors.memory, '记���力')}
                      {renderStateChart(stateHistory, 'speed', chartColors.speed, '速度')}
                      {renderStateChart(stateHistory, 'stability', chartColors.stability, '稳定性')}
                      {renderStateChart(stateHistory, 'fatigue', chartColors.fatigue, '疲劳度')}
                    </div>
                  </div>
                )}

                {/* 显著变化标记 */}
                {significantChanges.length > 0 && (
                  <div className="rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
                    <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
                      <Target size={24} weight="duotone" color={IconColor.warning} />
                      显著变化
                    </h2>
                    <div className="space-y-3">
                      {significantChanges.map((change, index) => (
                        <div
                          key={index}
                          className={`flex items-center gap-4 rounded-card border-2 p-4 transition-all ${
                            change.isPositive
                              ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/30'
                              : 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30'
                          } `}
                        >
                          <div
                            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${change.isPositive ? 'bg-green-500' : 'bg-red-500'} `}
                          >
                            {change.direction === 'up' ? (
                              <TrendUp size={20} weight="fill" color={IconColor.white} />
                            ) : (
                              <TrendDown size={20} weight="fill" color={IconColor.white} />
                            )}
                          </div>
                          <div className="flex-1">
                            <p
                              className={`font-medium ${change.isPositive ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}
                            >
                              {change.metricLabel}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {change.description}
                            </p>
                          </div>
                          <div
                            className={`text-right ${change.isPositive ? 'text-green-600' : 'text-red-600'}`}
                          >
                            <p className="text-lg font-bold">
                              {change.changePercent > 0 ? '+' : ''}
                              {change.changePercent.toFixed(1)}%
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {formatShortDate(change.startDate)} -{' '}
                              {formatShortDate(change.endDate)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {stateHistory.length === 0 &&
                  !cognitiveGrowth &&
                  significantChanges.length === 0 && (
                    <div className="rounded-card border-2 border-blue-200 bg-blue-50 p-8 text-center dark:border-blue-800 dark:bg-blue-900/30">
                      <ChartLine
                        size={64}
                        weight="duotone"
                        color={IconColor.primary}
                        className="mx-auto mb-4"
                      />
                      <h2 className="mb-2 text-xl font-bold text-blue-800 dark:text-blue-200">
                        暂无状态历史数据
                      </h2>
                      <p className="mb-4 text-blue-600 dark:text-blue-300">
                        继续学习，系统会自动记录你的学习状态
                      </p>
                      <button
                        onClick={() => navigate('/learning')}
                        className="rounded-button bg-blue-500 px-6 py-3 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
                      >
                        开始学习
                      </button>
                    </div>
                  )}
              </>
            )}
          </>
        )}

        {/* 单词统计视图 */}
        {viewMode === 'words' && (
          <>
            {stats.length === 0 ? (
              <div className="animate-g3-slide-up py-16 text-center">
                <BookOpen
                  className="mx-auto mb-6 animate-pulse"
                  size={96}
                  weight="thin"
                  color={IconColor.muted}
                />
                <h2 className="mb-3 text-2xl font-bold text-gray-900 dark:text-white">
                  还没有学习记录
                </h2>
                <p className="mb-8 text-gray-600 dark:text-gray-400">
                  开始学习单词后，这里会显示你的学习统计
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="rounded-button bg-blue-500 px-8 py-4 font-medium text-white shadow-elevated transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 hover:shadow-floating focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95"
                >
                  开始学习
                </button>
              </div>
            ) : (
              <>
                <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
                  <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
                    <div className="mb-2 flex items-center gap-3">
                      <ChartBar size={32} weight="duotone" color={IconColor.primary} />
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        总学习单词
                      </span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                      {statistics.total}
                    </p>
                  </div>

                  <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
                    <div className="mb-2 flex items-center gap-3">
                      <Target size={32} weight="duotone" color={chartColors.memory} />
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        平均正确率
                      </span>
                    </div>
                    <p
                      className={`text-3xl font-bold ${getCorrectRateColor(statistics.avgCorrectRate)}`}
                    >
                      {statistics.avgCorrectRate.toFixed(0)}%
                    </p>
                  </div>

                  <div className="rounded-card border border-green-200 bg-green-50 p-6 shadow-soft dark:border-green-800 dark:bg-green-900/30">
                    <div className="mb-2 flex items-center gap-3">
                      <CheckCircle size={32} weight="duotone" color={IconColor.success} />
                      <span className="text-sm font-medium text-green-700 dark:text-green-300">
                        已掌握
                      </span>
                    </div>
                    <p className="text-3xl font-bold text-green-600">{statistics.mastered}</p>
                  </div>

                  <div className="rounded-card border border-red-200 bg-red-50 p-6 shadow-soft dark:border-red-800 dark:bg-red-900/30">
                    <div className="mb-2 flex items-center gap-3">
                      <Warning size={32} weight="duotone" color={IconColor.danger} />
                      <span className="text-sm font-medium text-red-700 dark:text-red-300">
                        需复习
                      </span>
                    </div>
                    <p className="text-3xl font-bold text-red-600">
                      {statistics.reviewing + statistics.struggling}
                    </p>
                  </div>
                </div>

                {/* 筛选和排序 */}
                <div className="mb-8 rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
                  <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
                    <div>
                      <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                        筛选
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setFilterBy('all')}
                          className={`rounded-button px-4 py-2 font-medium transition-all duration-g3-fast hover:scale-105 active:scale-95 ${
                            filterBy === 'all'
                              ? 'bg-blue-500 text-white shadow-elevated'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
                          }`}
                        >
                          全部 ({stats.length})
                        </button>
                        <button
                          onClick={() => setFilterBy('mastered')}
                          className={`flex items-center gap-2 rounded-button px-4 py-2 font-medium transition-all duration-g3-fast hover:scale-105 active:scale-95 ${
                            filterBy === 'mastered'
                              ? 'bg-green-500 text-white shadow-elevated'
                              : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:hover:bg-green-900/70'
                          }`}
                        >
                          <CheckCircle size={16} weight="bold" />
                          已掌握 ({statistics.mastered})
                        </button>
                        <button
                          onClick={() => setFilterBy('reviewing')}
                          className={`flex items-center gap-2 rounded-button px-4 py-2 font-medium transition-all duration-g3-fast hover:scale-105 active:scale-95 ${
                            filterBy === 'reviewing'
                              ? 'bg-yellow-500 text-white shadow-elevated'
                              : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-300 dark:hover:bg-yellow-900/70'
                          }`}
                        >
                          <Warning size={16} weight="bold" />
                          需复习 ({statistics.reviewing})
                        </button>
                        <button
                          onClick={() => setFilterBy('struggling')}
                          className={`flex items-center gap-2 rounded-button px-4 py-2 font-medium transition-all duration-g3-fast hover:scale-105 active:scale-95 ${
                            filterBy === 'struggling'
                              ? 'bg-red-500 text-white shadow-elevated'
                              : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900/70'
                          }`}
                        >
                          <Warning size={16} weight="bold" />
                          未掌握 ({statistics.struggling})
                        </button>
                      </div>
                    </div>

                    <div>
                      <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                        排序
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setSortBy('time')}
                          className={`flex items-center gap-2 rounded-button px-4 py-2 font-medium transition-all duration-g3-fast hover:scale-105 active:scale-95 ${
                            sortBy === 'time'
                              ? 'bg-gray-900 text-white shadow-elevated dark:bg-white dark:text-gray-900'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
                          }`}
                        >
                          <Clock size={16} weight="bold" />
                          最近学习
                        </button>
                        <button
                          onClick={() => setSortBy('correctRate')}
                          className={`flex items-center gap-2 rounded-button px-4 py-2 font-medium transition-all duration-g3-fast hover:scale-105 active:scale-95 ${
                            sortBy === 'correctRate'
                              ? 'bg-gray-900 text-white shadow-elevated dark:bg-white dark:text-gray-900'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
                          }`}
                        >
                          <TrendUp size={16} weight="bold" />
                          正确率
                        </button>
                        <button
                          onClick={() => setSortBy('attempts')}
                          className={`flex items-center gap-2 rounded-button px-4 py-2 font-medium transition-all duration-g3-fast hover:scale-105 active:scale-95 ${
                            sortBy === 'attempts'
                              ? 'bg-gray-900 text-white shadow-elevated dark:bg-white dark:text-gray-900'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
                          }`}
                        >
                          <Hash size={16} weight="bold" />
                          学习次数
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {currentStats.length === 0 ? (
                  <div className="animate-g3-fade-in py-12 text-center">
                    <MagnifyingGlass
                      className="mx-auto mb-4"
                      size={80}
                      weight="thin"
                      color={IconColor.muted}
                    />
                    <p className="text-lg text-gray-600 dark:text-gray-400">
                      没有找到符合条件的单词
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                      {currentStats.map((stat, index) => {
                        const mastery = getMasteryLabel(stat.correctRate);
                        return (
                          <div
                            key={stat.wordId}
                            className={`group relative animate-g3-fade-in rounded-card border bg-white/80 p-4 shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:scale-105 hover:shadow-elevated dark:bg-slate-800/80 ${mastery.border}`}
                            style={{ animationDelay: `${index * 30}ms` }}
                          >
                            <div
                              className={`absolute right-3 top-3 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${mastery.bg} ${mastery.color}`}
                            >
                              <mastery.icon size={10} weight="bold" />
                              {mastery.label}
                            </div>

                            <div className="mb-4">
                              <h3
                                className="mb-0.5 truncate text-xl font-bold text-gray-900 dark:text-white"
                                title={stat.spelling}
                              >
                                {stat.spelling}
                              </h3>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {formatDate(stat.lastStudied)}
                              </p>
                            </div>

                            <div className="mb-4 flex items-center justify-center">
                              <div className="relative h-20 w-20">
                                <svg className="h-20 w-20 -rotate-90 transform">
                                  <circle
                                    cx="40"
                                    cy="40"
                                    r="36"
                                    stroke="currentColor"
                                    strokeWidth="6"
                                    fill="none"
                                    className="text-gray-200 dark:text-slate-700"
                                  />
                                  <circle
                                    cx="40"
                                    cy="40"
                                    r="36"
                                    stroke="currentColor"
                                    strokeWidth="6"
                                    fill="none"
                                    strokeDasharray={`${2 * Math.PI * 36}`}
                                    strokeDashoffset={`${2 * Math.PI * 36 * (1 - stat.correctRate / 100)}`}
                                    className={`transition-all duration-g3-slow ${
                                      stat.correctRate >= 80
                                        ? 'text-green-500'
                                        : stat.correctRate >= 40
                                          ? 'text-yellow-500'
                                          : 'text-red-500'
                                    }`}
                                    strokeLinecap="round"
                                  />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                  <span
                                    className={`text-lg font-bold ${getCorrectRateColor(stat.correctRate)}`}
                                  >
                                    {stat.correctRate.toFixed(0)}%
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 dark:border-slate-700">
                              <div className="text-center">
                                <p className="mb-0.5 text-xs text-gray-500 dark:text-gray-400">
                                  次数
                                </p>
                                <p className="text-sm font-bold text-gray-900 dark:text-white">
                                  {stat.attempts}
                                </p>
                              </div>
                              <div className="text-center">
                                <p className="mb-0.5 text-xs text-gray-500 dark:text-gray-400">
                                  正确
                                </p>
                                <p className="text-sm font-bold text-green-600">{stat.correct}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 分页控件 */}
                    {totalPages > 1 && (
                      <div className="mt-8 flex items-center justify-center gap-2">
                        <button
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="rounded-button border border-gray-200 px-3 py-1 text-gray-600 transition-all duration-g3-fast hover:scale-105 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-gray-400 dark:hover:bg-slate-700"
                        >
                          上一页
                        </button>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {currentPage} / {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="rounded-button border border-gray-200 px-3 py-1 text-gray-600 transition-all duration-g3-fast hover:scale-105 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-gray-400 dark:hover:bg-slate-700"
                        >
                          下一页
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
