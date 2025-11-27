import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import StorageService from '../services/StorageService';
import ApiClient from '../services/ApiClient';
import { handleError } from '../utils/errorHandler';
import {
  StateHistoryPoint,
  SignificantChange,
  DateRangeOption,
  CognitiveGrowthResult
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
  Calendar
} from '../components/Icon';

interface WordStats {
  wordId: string;
  spelling: string;
  attempts: number;
  correct: number;
  correctRate: number;
  lastStudied: number;
}

/**
 * HistoryPage - 学习历史页面（增强版）
 * 显示学习统计、状态历史折线图、认知成长对比、显著变化标记
 * Requirements: 5.1, 5.3, 5.4, 5.5
 */
type SortType = 'time' | 'correctRate' | 'attempts';
type FilterType = 'all' | 'mastered' | 'reviewing' | 'struggling';
type ViewMode = 'words' | 'state';

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

  // 状态历史相关状态
  const [dateRange, setDateRange] = useState<DateRangeOption>(30);
  const [stateHistory, setStateHistory] = useState<StateHistoryPoint[]>([]);
  const [cognitiveGrowth, setCognitiveGrowth] = useState<CognitiveGrowthResult | null>(null);
  const [significantChanges, setSignificantChanges] = useState<(SignificantChange & { description: string })[]>([]);
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
        statistics.wordStats.forEach((stat, wordId) => {
          const word = words.find(w => w.id === wordId);
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
          ApiClient.getCognitiveGrowth(),
          ApiClient.getSignificantChanges(dateRange)
        ]);

        if (mounted) {
          setStateHistory(historyData.history);
          setCognitiveGrowth(growthData);
          setSignificantChanges(changesData.changes);
        }
      } catch (err) {
        console.error('加载状态历史失败:', err);
      } finally {
        if (mounted) setIsLoadingState(false);
      }
    };

    loadStateHistory();

    return () => {
      mounted = false;
    };
  }, [viewMode, dateRange]);

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
    if (rate >= 80) return {
      label: '已掌握',
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-50',
      border: 'border-green-300'
    };
    if (rate >= 40) return {
      label: '需复习',
      icon: Warning,
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
      border: 'border-yellow-300'
    };
    return {
      label: '未掌握',
      icon: Warning,
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-300'
    };
  };

  // 渲染状态历史折线图
  const renderStateChart = (
    data: StateHistoryPoint[],
    metric: keyof Omit<StateHistoryPoint, 'date' | 'trendState'>,
    color: string,
    label: string
  ) => {
    if (!data || data.length === 0) return null;

    const width = 100;
    const height = 60;
    const padding = 5;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const values = data.map(d => d[metric] as number);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue || 1;

    // 处理单条数据的边界情况，避免除零异常
    const points = data.map((d, i) => {
      const x = data.length === 1
        ? padding + chartWidth / 2  // 单点居中
        : padding + (i / (data.length - 1)) * chartWidth;
      const y = padding + chartHeight - ((d[metric] as number - minValue) / range) * chartHeight;
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          <span className="text-sm text-gray-500">
            {(values[values.length - 1] * 100).toFixed(0)}%
          </span>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-16">
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />
        </svg>
      </div>
    );
  };

  // 过滤和排序
  const filteredAndSortedStats = useMemo(() => {
    let filtered = stats;

    if (filterBy !== 'all') {
      filtered = stats.filter(stat => getMasteryLevel(stat.correctRate) === filterBy);
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
    if (stats.length === 0) return { total: 0, avgCorrectRate: 0, mastered: 0, reviewing: 0, struggling: 0 };

    const total = stats.length;
    const avgCorrectRate = stats.reduce((sum, stat) => sum + stat.correctRate, 0) / total;
    const mastered = stats.filter(s => s.correctRate >= 80).length;
    const reviewing = stats.filter(s => s.correctRate >= 40 && s.correctRate < 80).length;
    const struggling = stats.filter(s => s.correctRate < 40).length;

    return { total, avgCorrectRate, mastered, reviewing, struggling };
  }, [stats]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="text-center">
          <CircleNotch className="animate-spin mx-auto mb-4" size={48} weight="bold" color="#3b82f6" />
          <p className="text-gray-600" role="status" aria-live="polite">正在加载...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="text-center max-w-md px-4" role="alert">
          <Warning className="mx-auto mb-4" size={64} weight="fill" color="#ef4444" aria-hidden="true" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">出错了</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8 animate-fade-in">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">学习历史</h1>
          <p className="text-gray-600">追踪你的学习进度，掌握每个单词</p>
        </header>

        {/* 视图切换 */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setViewMode('words')}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${viewMode === 'words'
              ? 'bg-blue-500 text-white shadow-sm'
              : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
          >
            <BookOpen size={18} weight="bold" />
            单词统计
          </button>
          <button
            onClick={() => setViewMode('state')}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${viewMode === 'state'
              ? 'bg-blue-500 text-white shadow-sm'
              : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
          >
            <ChartLine size={18} weight="bold" />
            状态历史
          </button>
        </div>

        {/* 状态历史视图 */}
        {viewMode === 'state' && (
          <>
            {/* 日期范围选择器 */}
            <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-4 mb-6 shadow-sm">
              <div className="flex items-center gap-4">
                <Calendar size={20} weight="duotone" color="#3b82f6" />
                <span className="text-sm font-medium text-gray-700">时间范围:</span>
                <div className="flex gap-2">
                  {([7, 30, 90] as DateRangeOption[]).map(range => (
                    <button
                      key={range}
                      onClick={() => setDateRange(range)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${dateRange === range
                        ? 'bg-blue-500 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                      {range} 天
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {isLoadingState ? (
              <div className="text-center py-12">
                <CircleNotch className="animate-spin mx-auto mb-4" size={48} weight="bold" color="#3b82f6" />
                <p className="text-gray-600">正在加载状态历史...</p>
              </div>
            ) : (
              <>
                {/* 认知成长对比卡片 */}
                {cognitiveGrowth && (
                  <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
                    <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Brain size={24} weight="duotone" color="#a855f7" />
                      认知成长对比（{cognitiveGrowth.period} 天）
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* 记忆力 */}
                      <div className="bg-purple-50 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-purple-700">记忆力</span>
                          <div className={`flex items-center gap-1 ${cognitiveGrowth.changes.memory.direction === 'up' ? 'text-green-600' : 'text-red-600'
                            }`}>
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
                          <span className="text-gray-500 text-sm">
                            {(cognitiveGrowth.past.memory * 100).toFixed(0)}%
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="text-purple-700 font-bold">
                            {(cognitiveGrowth.current.memory * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>

                      {/* 速度 */}
                      <div className="bg-blue-50 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-blue-700">速度</span>
                          <div className={`flex items-center gap-1 ${cognitiveGrowth.changes.speed.direction === 'up' ? 'text-green-600' : 'text-red-600'
                            }`}>
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
                          <span className="text-gray-500 text-sm">
                            {(cognitiveGrowth.past.speed * 100).toFixed(0)}%
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="text-blue-700 font-bold">
                            {(cognitiveGrowth.current.speed * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>

                      {/* 稳定性 */}
                      <div className="bg-green-50 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-green-700">稳定性</span>
                          <div className={`flex items-center gap-1 ${cognitiveGrowth.changes.stability.direction === 'up' ? 'text-green-600' : 'text-red-600'
                            }`}>
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
                          <span className="text-gray-500 text-sm">
                            {(cognitiveGrowth.past.stability * 100).toFixed(0)}%
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="text-green-700 font-bold">
                            {(cognitiveGrowth.current.stability * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 状态历史折线图 */}
                {stateHistory.length > 0 && (
                  <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
                    <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <ChartLine size={24} weight="duotone" color="#3b82f6" />
                      状态历史趋势
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {renderStateChart(stateHistory, 'attention', '#3b82f6', '注意力')}
                      {renderStateChart(stateHistory, 'motivation', '#22c55e', '动机')}
                      {renderStateChart(stateHistory, 'memory', '#a855f7', '记忆力')}
                      {renderStateChart(stateHistory, 'speed', '#f59e0b', '速度')}
                      {renderStateChart(stateHistory, 'stability', '#06b6d4', '稳定性')}
                      {renderStateChart(stateHistory, 'fatigue', '#ef4444', '疲劳度')}
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-4 pt-4 border-t border-gray-200">
                      {stateHistory.length > 0 && (
                        <>
                          <span>{formatShortDate(stateHistory[0].date)}</span>
                          <span>{formatShortDate(stateHistory[stateHistory.length - 1].date)}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* 显著变化标记 */}
                {significantChanges.length > 0 && (
                  <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6 shadow-sm">
                    <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Target size={24} weight="duotone" color="#f59e0b" />
                      显著变化
                    </h2>
                    <div className="space-y-3">
                      {significantChanges.map((change, index) => (
                        <div
                          key={index}
                          className={`
                            flex items-center gap-4 p-4 rounded-xl border-2 transition-all
                            ${change.isPositive
                              ? 'bg-green-50 border-green-300'
                              : 'bg-red-50 border-red-300'
                            }
                          `}
                        >
                          <div className={`
                            w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
                            ${change.isPositive ? 'bg-green-500' : 'bg-red-500'}
                          `}>
                            {change.direction === 'up' ? (
                              <TrendUp size={20} weight="fill" color="#ffffff" />
                            ) : (
                              <TrendDown size={20} weight="fill" color="#ffffff" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className={`font-medium ${change.isPositive ? 'text-green-700' : 'text-red-700'}`}>
                              {change.metricLabel}
                            </p>
                            <p className="text-sm text-gray-600">{change.description}</p>
                          </div>
                          <div className={`text-right ${change.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            <p className="font-bold text-lg">
                              {change.changePercent > 0 ? '+' : ''}{change.changePercent.toFixed(1)}%
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatShortDate(change.startDate)} - {formatShortDate(change.endDate)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {stateHistory.length === 0 && !cognitiveGrowth && significantChanges.length === 0 && (
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-8 text-center">
                    <ChartLine size={64} weight="duotone" color="#3b82f6" className="mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-blue-800 mb-2">暂无状态历史数据</h2>
                    <p className="text-blue-600 mb-4">
                      继续学习，系统会自动记录你的学习状态
                    </p>
                    <button
                      onClick={() => navigate('/learning')}
                      className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95"
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
              <div className="text-center py-16 animate-slide-up">
                <BookOpen className="mx-auto mb-6 animate-pulse" size={96} weight="thin" color="#9ca3af" />
                <h2 className="text-2xl font-bold text-gray-900 mb-3">还没有学习记录</h2>
                <p className="text-gray-600 mb-8">开始学习单词后，这里会显示你的学习统计</p>
                <button
                  onClick={() => navigate('/')}
                  className="px-8 py-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg hover:shadow-xl"
                >
                  开始学习
                </button>
              </div>
            ) : (
              <>
                {/* 统计面板 */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                  <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-sm border border-gray-200/60">
                    <div className="flex items-center gap-3 mb-2">
                      <ChartBar size={32} weight="duotone" color="#3b82f6" />
                      <span className="text-sm text-gray-600 font-medium">总学习单词</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">{statistics.total}</p>
                  </div>

                  <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-sm border border-gray-200/60">
                    <div className="flex items-center gap-3 mb-2">
                      <Target size={32} weight="duotone" color="#a855f7" />
                      <span className="text-sm text-gray-600 font-medium">平均正确率</span>
                    </div>
                    <p className={`text-3xl font-bold ${getCorrectRateColor(statistics.avgCorrectRate)}`}>
                      {statistics.avgCorrectRate.toFixed(0)}%
                    </p>
                  </div>

                  <div className="bg-green-50 rounded-xl p-6 shadow-sm border border-green-200">
                    <div className="flex items-center gap-3 mb-2">
                      <CheckCircle size={32} weight="duotone" color="#16a34a" />
                      <span className="text-sm text-green-700 font-medium">已掌握</span>
                    </div>
                    <p className="text-3xl font-bold text-green-600">{statistics.mastered}</p>
                  </div>

                  <div className="bg-red-50 rounded-xl p-6 shadow-sm border border-red-200">
                    <div className="flex items-center gap-3 mb-2">
                      <Warning size={32} weight="duotone" color="#dc2626" />
                      <span className="text-sm text-red-700 font-medium">需复习</span>
                    </div>
                    <p className="text-3xl font-bold text-red-600">{statistics.reviewing + statistics.struggling}</p>
                  </div>
                </div>

                {/* 筛选和排序 */}
                <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-sm border border-gray-200/60 mb-8">
                  <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-3">筛选</h3>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setFilterBy('all')}
                          className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 hover:scale-105 active:scale-95 ${filterBy === 'all'
                            ? 'bg-blue-500 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                          全部 ({stats.length})
                        </button>
                        <button
                          onClick={() => setFilterBy('mastered')}
                          className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2 ${filterBy === 'mastered'
                            ? 'bg-green-500 text-white shadow-md'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                            }`}
                        >
                          <CheckCircle size={16} weight="bold" />
                          已掌握 ({statistics.mastered})
                        </button>
                        <button
                          onClick={() => setFilterBy('reviewing')}
                          className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2 ${filterBy === 'reviewing'
                            ? 'bg-yellow-500 text-white shadow-md'
                            : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                            }`}
                        >
                          <Warning size={16} weight="bold" />
                          需复习 ({statistics.reviewing})
                        </button>
                        <button
                          onClick={() => setFilterBy('struggling')}
                          className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2 ${filterBy === 'struggling'
                            ? 'bg-red-500 text-white shadow-md'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                            }`}
                        >
                          <Warning size={16} weight="bold" />
                          未掌握 ({statistics.struggling})
                        </button>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-3">排序</h3>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setSortBy('time')}
                          className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2 ${sortBy === 'time'
                            ? 'bg-gray-900 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                          <Clock size={16} weight="bold" />
                          最近学习
                        </button>
                        <button
                          onClick={() => setSortBy('correctRate')}
                          className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2 ${sortBy === 'correctRate'
                            ? 'bg-gray-900 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                          <TrendUp size={16} weight="bold" />
                          正确率
                        </button>
                        <button
                          onClick={() => setSortBy('attempts')}
                          className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2 ${sortBy === 'attempts'
                            ? 'bg-gray-900 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                          <Hash size={16} weight="bold" />
                          学习次数
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 单词卡片网格 */}
                {currentStats.length === 0 ? (
                  <div className="text-center py-12 animate-fade-in">
                    <MagnifyingGlass className="mx-auto mb-4" size={80} weight="thin" color="#9ca3af" />
                    <p className="text-gray-600 text-lg">没有找到符合条件的单词</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {currentStats.map((stat, index) => {
                        const mastery = getMasteryLabel(stat.correctRate);
                        return (
                          <div
                            key={stat.wordId}
                            className={`group relative bg-white/80 backdrop-blur-sm rounded-xl p-4 shadow-sm border hover:shadow-lg transition-all duration-200 hover:scale-105 animate-fade-in ${mastery.border}`}
                            style={{ animationDelay: `${index * 30}ms` }}
                          >
                            {/* 掌握程度标签 */}
                            <div className={`absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${mastery.bg} ${mastery.color}`}>
                              <mastery.icon size={10} weight="bold" />
                              {mastery.label}
                            </div>

                            {/* 单词名称 */}
                            <div className="mb-4">
                              <h3 className="text-xl font-bold text-gray-900 mb-0.5 truncate" title={stat.spelling}>
                                {stat.spelling}
                              </h3>
                              <p className="text-xs text-gray-500">
                                {formatDate(stat.lastStudied)}
                              </p>
                            </div>

                            {/* 圆形进度条 - 缩小尺寸 */}
                            <div className="flex items-center justify-center mb-4">
                              <div className="relative w-20 h-20">
                                <svg className="transform -rotate-90 w-20 h-20">
                                  <circle
                                    cx="40"
                                    cy="40"
                                    r="36"
                                    stroke="currentColor"
                                    strokeWidth="6"
                                    fill="none"
                                    className="text-gray-200"
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
                                    className={`transition-all duration-500 ${stat.correctRate >= 80 ? 'text-green-500' :
                                      stat.correctRate >= 40 ? 'text-yellow-500' :
                                        'text-red-500'
                                      }`}
                                    strokeLinecap="round"
                                  />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                  <span className={`text-lg font-bold ${getCorrectRateColor(stat.correctRate)}`}>
                                    {stat.correctRate.toFixed(0)}%
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* 统计信息 - 紧凑布局 */}
                            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-100">
                              <div className="text-center">
                                <p className="text-xs text-gray-500 mb-0.5">次数</p>
                                <p className="text-sm font-bold text-gray-900">{stat.attempts}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-gray-500 mb-0.5">正确</p>
                                <p className="text-sm font-bold text-green-600">{stat.correct}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 分页控件 */}
                    {totalPages > 1 && (
                      <div className="flex justify-center items-center gap-2 mt-8">
                        <button
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="px-3 py-1 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                        >
                          上一页
                        </button>
                        <span className="text-sm text-gray-600">
                          {currentPage} / {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="px-3 py-1 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
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
