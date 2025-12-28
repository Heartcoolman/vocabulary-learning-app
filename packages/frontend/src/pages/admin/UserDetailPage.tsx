import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { exportUserWords } from '../../hooks/queries/useUserDetail';
import { ChartBar, ArrowLeft, WarningCircle } from '../../components/Icon';
import { ListDashes, Brain, ChartLine } from '@phosphor-icons/react';
import LearningRecordsTab from '../../components/admin/LearningRecordsTab';
import AMASDecisionsTab from '../../components/admin/AMASDecisionsTab';
import { useToast } from '../../components/ui';
import { adminLogger } from '../../utils/logger';
import { useLearningData } from '../../hooks/useLearningData';
import { useUserStatistics, useUserWords } from '../../hooks/queries';

// Import sub-components
import {
  UserBasicInfo,
  UserStatistics,
  UserWordList,
  UserAnalytics,
  type FilterState,
  type AnalyticsData,
} from './components/UserDetail';

type TabType = 'overview' | 'records' | 'decisions' | 'analytics';

export default function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FilterState>({
    sortBy: 'lastReview',
    sortOrder: 'desc',
  });

  const [showFilters, setShowFilters] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // 使用新的 React Query hooks
  const {
    data: statistics,
    isLoading: isLoadingStats,
    error: statsError,
  } = useUserStatistics(userId || '');

  const {
    data: wordsResponse,
    isLoading: isLoadingWords,
    error: wordsError,
  } = useUserWords({
    userId: userId || '',
    page,
    pageSize: 20,
    ...filters,
  });

  const words = wordsResponse?.words || [];
  const pagination = wordsResponse?.pagination || {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  };
  const error = statsError || wordsError;

  // 使用 useLearningData hook 获取学习数据
  const { data: learningData, loading: learningDataLoading } = useLearningData(userId || '', 100);

  // Event handlers
  const handleExport = useCallback(
    async (format: 'csv' | 'excel') => {
      if (!userId) return;

      try {
        setIsExporting(true);
        await exportUserWords(userId, format);
        toast.success(`${format.toUpperCase()} 导出成功`);
      } catch (err) {
        adminLogger.error({ err, userId, format }, '导出用户单词失败');
        toast.error('导出失败，请重试');
      } finally {
        setIsExporting(false);
      }
    },
    [userId, toast],
  );

  const handleFilterChange = useCallback((newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleToggleFilters = useCallback(() => {
    setShowFilters((prev) => !prev);
  }, []);

  const handleToggleSortOrder = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  // 计算学习分析数据
  const analyticsData: AnalyticsData | null = useMemo(() => {
    if (!learningData || !learningData.recentRecords || learningData.recentRecords.length === 0) {
      return null;
    }

    const records = learningData.recentRecords;

    // 1. 30天学习活动热力图数据
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      return date.toISOString().split('T')[0];
    });

    const heatmapData = last30Days.map((date) => {
      const dayRecords = records.filter((r) => {
        const recordDate = new Date(r.timestamp).toISOString().split('T')[0];
        return recordDate === date;
      });
      return {
        date,
        count: dayRecords.length,
        accuracy:
          dayRecords.length > 0
            ? dayRecords.filter((r) => r.isCorrect).length / dayRecords.length
            : 0,
      };
    });

    // 2. 学习时段分布（按小时统计）
    const hourDistribution = Array(24).fill(0);
    records.forEach((r) => {
      const hour = new Date(r.timestamp).getHours();
      hourDistribution[hour]++;
    });

    // 找出最活跃的时段
    const maxHourCount = Math.max(...hourDistribution);
    const peakHours = hourDistribution
      .map((count, hour) => ({ hour, count }))
      .filter((h) => h.count === maxHourCount && h.count > 0)
      .map((h) => h.hour);

    // 3. 准确率趋势（按天）
    const dailyAccuracyTrend = last30Days
      .map((date) => {
        const dayRecords = records.filter((r) => {
          const recordDate = new Date(r.timestamp).toISOString().split('T')[0];
          return recordDate === date;
        });
        return {
          date,
          accuracy:
            dayRecords.length > 0
              ? (dayRecords.filter((r) => r.isCorrect).length / dayRecords.length) * 100
              : null,
        };
      })
      .filter((d) => d.accuracy !== null);

    // 4. 响应时间统计
    const responseTimes = records
      .filter((r) => r.responseTime && r.responseTime > 0)
      .map((r) => r.responseTime || 0);

    const avgResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length / 1000 // 转换为秒
        : 0;

    // 5. 学习模式识别
    const morningRecords = records.filter((r) => {
      const hour = new Date(r.timestamp).getHours();
      return hour >= 6 && hour < 12;
    });
    const afternoonRecords = records.filter((r) => {
      const hour = new Date(r.timestamp).getHours();
      return hour >= 12 && hour < 18;
    });
    const eveningRecords = records.filter((r) => {
      const hour = new Date(r.timestamp).getHours();
      return hour >= 18 && hour < 24;
    });
    const nightRecords = records.filter((r) => {
      const hour = new Date(r.timestamp).getHours();
      return hour >= 0 && hour < 6;
    });

    const learningPattern = {
      morning: morningRecords.length,
      afternoon: afternoonRecords.length,
      evening: eveningRecords.length,
      night: nightRecords.length,
    };

    const maxPattern = Math.max(...Object.values(learningPattern));
    const preferredTime =
      Object.entries(learningPattern).find(([_, count]) => count === maxPattern)?.[0] || 'unknown';

    // 6. 薄弱环节识别（错误率高的单词）
    type WordInfo = { spelling: string; phonetic: string; meanings: string[] };
    const wordErrorMap = new Map<string, { total: number; errors: number; word: WordInfo }>();
    records.forEach((r) => {
      if (!wordErrorMap.has(r.wordId)) {
        wordErrorMap.set(r.wordId, { total: 0, errors: 0, word: r.word });
      }
      const stats = wordErrorMap.get(r.wordId)!;
      stats.total++;
      if (!r.isCorrect) {
        stats.errors++;
      }
    });

    const weakWords = Array.from(wordErrorMap.entries())
      .filter(([_, stats]) => stats.word) // 过滤掉 word 为 undefined 的记录
      .map(([wordId, stats]) => ({
        wordId,
        spelling: stats.word?.spelling || '未知单词',
        phonetic: stats.word?.phonetic || '',
        total: stats.total,
        errors: stats.errors,
        errorRate: stats.errors / stats.total,
      }))
      .filter((w) => w.total >= 3) // 至少学习3次
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, 10); // 取前10个

    return {
      heatmapData,
      hourDistribution,
      peakHours,
      dailyAccuracyTrend,
      avgResponseTime,
      learningPattern,
      preferredTime,
      weakWords,
    };
  }, [learningData]);

  // Loading state
  if (isLoadingStats && !statistics) {
    return (
      <div className="p-8">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500" />
            <p className="text-gray-600 dark:text-gray-400">加载中...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !statistics) {
    return (
      <div className="p-8">
        <div className="py-12 text-center">
          <WarningCircle size={64} weight="fill" className="mx-auto mb-4 text-red-500" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">加载失败</h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            {error instanceof Error ? error.message : String(error)}
          </p>
          <button
            onClick={() => navigate('/admin/users')}
            className="rounded-button bg-blue-500 px-6 py-3 text-white transition-all hover:bg-blue-600"
          >
            返回用户列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-g3-fade-in p-8">
      {/* 返回按钮 */}
      <button
        onClick={() => navigate('/admin/users')}
        className="mb-6 flex items-center gap-2 text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
      >
        <ArrowLeft size={20} weight="bold" />
        <span>返回用户列表</span>
      </button>

      {/* 用户信息头部 */}
      {statistics && <UserBasicInfo statistics={statistics} />}

      {/* 标签页导航 */}
      <div className="mb-6 flex border-b border-gray-200 dark:border-slate-700">
        <button
          className={`relative px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'overview'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
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
          className={`relative px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'records'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
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
        <button
          className={`relative px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'decisions'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
          onClick={() => setActiveTab('decisions')}
        >
          <div className="flex items-center gap-2">
            <Brain size={18} />
            <span>决策分析</span>
          </div>
          {activeTab === 'decisions' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
        <button
          className={`relative px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'analytics'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
          onClick={() => setActiveTab('analytics')}
        >
          <div className="flex items-center gap-2">
            <ChartLine size={18} />
            <span>学习分析</span>
          </div>
          {activeTab === 'analytics' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
      </div>

      {/* 标签页内容 */}
      {activeTab === 'overview' ? (
        <>
          {/* 掌握程度分布 */}
          {statistics && <UserStatistics masteryDistribution={statistics.masteryDistribution} />}

          {/* 单词列表 */}
          <UserWordList
            userId={userId || ''}
            words={words}
            pagination={pagination}
            isLoading={isLoadingWords}
            isExporting={isExporting}
            filters={filters}
            showFilters={showFilters}
            onFilterChange={handleFilterChange}
            onPageChange={handlePageChange}
            onToggleFilters={handleToggleFilters}
            onToggleSortOrder={handleToggleSortOrder}
            onExport={handleExport}
          />
        </>
      ) : activeTab === 'records' ? (
        <LearningRecordsTab userId={userId || ''} />
      ) : activeTab === 'decisions' ? (
        <AMASDecisionsTab userId={userId || ''} />
      ) : (
        /* 学习分析标签页 */
        <UserAnalytics
          analyticsData={analyticsData}
          isLoading={learningDataLoading}
          isExporting={isExporting}
          onExport={handleExport}
        />
      )}
    </div>
  );
}
