import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import StorageService from '../services/StorageService';
import ApiClient from '../services/client';
import { handleError } from '../utils/errorHandler';
import { learningLogger } from '../utils/logger';
import { getMasteryLevel } from '../utils/historyUtils';
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
  CircleNotch,
  ChartLine,
  BookOpen,
  Calendar,
} from '../components/Icon';

// 导入子组件
import FilterControls from '../components/history/FilterControls';
import WordStatsTable from '../components/history/WordStatsTable';
import StateHistoryChart from '../components/history/StateHistoryChart';
import CognitiveGrowthPanel from '../components/history/CognitiveGrowthPanel';
import SignificantChanges from '../components/history/SignificantChanges';

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
 * HistoryPage - 学习历史页面（优化版）
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

  // 过滤和排序 - 使用useMemo缓存
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

  // 分页逻辑 - 使用useMemo缓存
  const totalPages = Math.ceil(filteredAndSortedStats.length / itemsPerPage);
  const currentStats = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedStats.slice(start, start + itemsPerPage);
  }, [filteredAndSortedStats, currentPage]);

  // 重置页码当筛选/排序改变时
  useEffect(() => {
    setCurrentPage(1);
  }, [filterBy, sortBy]);

  // 统计数据 - 使用useMemo缓存
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

  const getCorrectRateColor = (rate: number) => {
    if (rate >= 80) return 'text-green-600';
    if (rate >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="text-center">
          <CircleNotch
            className="mx-auto mb-4 animate-spin"
            size={48}
            weight="bold"
            color="#3b82f6"
          />
          <p className="text-gray-600" role="status" aria-live="polite">
            正在加载...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="max-w-md px-4 text-center" role="alert">
          <Warning
            className="mx-auto mb-4"
            size={64}
            weight="fill"
            color="#ef4444"
            aria-hidden="true"
          />
          <h2 className="mb-2 text-2xl font-bold text-gray-900">出错了</h2>
          <p className="mb-6 text-gray-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-blue-500 px-6 py-3 text-white transition-all duration-200 hover:scale-105 hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="mx-auto max-w-7xl animate-g3-fade-in px-4 py-8">
        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">学习历史</h1>
          <p className="text-gray-600">追踪你的学习进度，掌握每个单词</p>
        </header>

        {/* 视图切换 */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setViewMode('words')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-all duration-200 ${
              viewMode === 'words'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            <BookOpen size={18} weight="bold" />
            单词统计
          </button>
          <button
            onClick={() => setViewMode('state')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-all duration-200 ${
              viewMode === 'state'
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
            <div className="mb-6 rounded-2xl border border-gray-200 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <Calendar size={20} weight="duotone" color="#3b82f6" />
                <span className="text-sm font-medium text-gray-700">时间范围:</span>
                <div className="flex gap-2">
                  {([7, 30, 90] as DateRangeOption[]).map((range) => (
                    <button
                      key={range}
                      onClick={() => setDateRange(range)}
                      className={`rounded-lg px-4 py-2 font-medium transition-all duration-200 ${
                        dateRange === range
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
              <div className="py-12 text-center">
                <CircleNotch
                  className="mx-auto mb-4 animate-spin"
                  size={48}
                  weight="bold"
                  color="#3b82f6"
                />
                <p className="text-gray-600">正在加载状态历史...</p>
              </div>
            ) : (
              <>
                {/* 认知成长对比卡片 */}
                {cognitiveGrowth && <CognitiveGrowthPanel cognitiveGrowth={cognitiveGrowth} />}

                {/* 状态历史折线图 */}
                {stateHistory.length > 0 && <StateHistoryChart stateHistory={stateHistory} />}

                {/* 显著变化标记 */}
                {significantChanges.length > 0 && (
                  <SignificantChanges significantChanges={significantChanges} />
                )}

                {stateHistory.length === 0 &&
                  !cognitiveGrowth &&
                  significantChanges.length === 0 && (
                    <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-8 text-center">
                      <ChartLine
                        size={64}
                        weight="duotone"
                        color="#3b82f6"
                        className="mx-auto mb-4"
                      />
                      <h2 className="mb-2 text-xl font-bold text-blue-800">暂无状态历史数据</h2>
                      <p className="mb-4 text-blue-600">继续学习，系统会自动记录你的学习状态</p>
                      <button
                        onClick={() => navigate('/learning')}
                        className="rounded-lg bg-blue-500 px-6 py-3 text-white transition-all duration-200 hover:scale-105 hover:bg-blue-600 active:scale-95"
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
                  color="#9ca3af"
                />
                <h2 className="mb-3 text-2xl font-bold text-gray-900">还没有学习记录</h2>
                <p className="mb-8 text-gray-600">开始学习单词后，这里会显示你的学习统计</p>
                <button
                  onClick={() => navigate('/')}
                  className="rounded-lg bg-blue-500 px-8 py-4 font-medium text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-blue-600 hover:shadow-xl focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95"
                >
                  开始学习
                </button>
              </div>
            ) : (
              <>
                {/* 统计面板 */}
                <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
                  <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
                    <div className="mb-2 flex items-center gap-3">
                      <ChartBar size={32} weight="duotone" color="#3b82f6" />
                      <span className="text-sm font-medium text-gray-600">总学习单词</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">{statistics.total}</p>
                  </div>

                  <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
                    <div className="mb-2 flex items-center gap-3">
                      <Target size={32} weight="duotone" color="#a855f7" />
                      <span className="text-sm font-medium text-gray-600">平均正确率</span>
                    </div>
                    <p
                      className={`text-3xl font-bold ${getCorrectRateColor(statistics.avgCorrectRate)}`}
                    >
                      {statistics.avgCorrectRate.toFixed(0)}%
                    </p>
                  </div>

                  <div className="rounded-xl border border-green-200 bg-green-50 p-6 shadow-sm">
                    <div className="mb-2 flex items-center gap-3">
                      <CheckCircle size={32} weight="duotone" color="#16a34a" />
                      <span className="text-sm font-medium text-green-700">已掌握</span>
                    </div>
                    <p className="text-3xl font-bold text-green-600">{statistics.mastered}</p>
                  </div>

                  <div className="rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm">
                    <div className="mb-2 flex items-center gap-3">
                      <Warning size={32} weight="duotone" color="#dc2626" />
                      <span className="text-sm font-medium text-red-700">需复习</span>
                    </div>
                    <p className="text-3xl font-bold text-red-600">
                      {statistics.reviewing + statistics.struggling}
                    </p>
                  </div>
                </div>

                {/* 筛选和排序控件 */}
                <FilterControls
                  sortBy={sortBy}
                  filterBy={filterBy}
                  statistics={statistics}
                  onSortChange={setSortBy}
                  onFilterChange={setFilterBy}
                />

                {/* 单词卡片网格 */}
                <WordStatsTable
                  stats={currentStats}
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
