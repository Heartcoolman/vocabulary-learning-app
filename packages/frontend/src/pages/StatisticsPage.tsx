import { useNavigate } from 'react-router-dom';
import {
  ChartBar,
  Target,
  CheckCircle,
  Clock,
  TrendUp,
  ArrowLeft,
  Warning,
} from '../components/Icon';
import { Spinner } from '../components/ui';
import LineChart from '../components/LineChart';
import { useStatistics } from '../hooks/queries';
import { ErrorAnalysisPanel } from '../components/semantic/ErrorAnalysisPanel';

/**
 * 学习统计页面
 * 显示用户的学习统计数据、掌握程度分布、遗忘曲线和学习热力图
 * 使用 React Query 管理数据，每分钟自动刷新
 */
export default function StatisticsPage() {
  const navigate = useNavigate();
  const { data: statistics, isLoading, error } = useStatistics();

  if (isLoading) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="text-center">
          <Spinner className="mx-auto mb-4" size="xl" color="primary" />
          <p className="text-gray-600 dark:text-gray-400">正在加载统计数据...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="max-w-md px-4 text-center">
          <Warning size={64} color="#ef4444" className="mx-auto mb-4" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">加载失败</h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            {error instanceof Error ? error.message : '加载统计数据失败'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="rounded-button bg-blue-500 px-6 py-3 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
          >
            返回学习
          </button>
        </div>
      </div>
    );
  }

  if (!statistics) {
    return null;
  }

  return (
    <div className="min-h-screen animate-g3-fade-in bg-gray-50 px-4 py-8 dark:bg-slate-900">
      <div className="mx-auto max-w-6xl">
        {/* 页面标题 */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white transition-all duration-g3-fast hover:scale-105 hover:bg-gray-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
              aria-label="返回"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">学习统计</h1>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* 总学习单词数 */}
          <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:shadow-elevated dark:border-slate-700 dark:bg-slate-800/80">
            <div className="mb-4 flex items-center justify-between">
              <ChartBar size={32} color="#3b82f6" />
            </div>
            <p className="mb-1 text-sm text-gray-600 dark:text-gray-400">总学习单词</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {statistics.totalWords}
            </p>
          </div>

          {/* 整体正确率 */}
          <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:shadow-elevated dark:border-slate-700 dark:bg-slate-800/80">
            <div className="mb-4 flex items-center justify-between">
              <Target size={32} color="#a855f7" />
            </div>
            <p className="mb-1 text-sm text-gray-600 dark:text-gray-400">整体正确率</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {(statistics.overallAccuracy * 100).toFixed(1)}%
            </p>
          </div>

          {/* 学习天数 */}
          <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:shadow-elevated dark:border-slate-700 dark:bg-slate-800/80">
            <div className="mb-4 flex items-center justify-between">
              <Clock size={32} color="#f59e0b" />
            </div>
            <p className="mb-1 text-sm text-gray-600 dark:text-gray-400">学习天数</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {statistics.studyDays}
            </p>
          </div>

          {/* 连续学习天数 */}
          <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:shadow-elevated dark:border-slate-700 dark:bg-slate-800/80">
            <div className="mb-4 flex items-center justify-between">
              <TrendUp size={32} color="#16a34a" />
            </div>
            <p className="mb-1 text-sm text-gray-600 dark:text-gray-400">连续学习</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {statistics.consecutiveDays} 天
            </p>
          </div>
        </div>

        {/* 掌握程度分布 */}
        <div className="mb-8 rounded-card border border-gray-200/60 bg-white/80 p-4 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80 sm:p-8">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white sm:mb-6 sm:text-xl">
            <CheckCircle size={24} color="#3b82f6" />
            掌握程度分布
          </h2>
          <div className="space-y-3 sm:space-y-4">
            {statistics.masteryDistribution.map(({ level, count }) => {
              const percentage =
                statistics.totalWords > 0 ? (count / statistics.totalWords) * 100 : 0;

              return (
                <div key={level} className="flex items-center gap-2 sm:gap-4">
                  <div className="w-12 text-xs font-medium text-gray-700 dark:text-gray-300 sm:w-20 sm:text-sm">
                    {level} 级
                  </div>
                  <div className="h-6 flex-1 overflow-hidden rounded-button bg-gray-100 dark:bg-slate-700 sm:h-8">
                    <div
                      className="flex h-full items-center justify-end bg-gradient-to-r from-blue-400 to-blue-600 pr-2 transition-all duration-g3-slow sm:pr-3"
                      style={{ width: `${percentage}%` }}
                    >
                      {count > 0 && (
                        <span className="text-[10px] font-medium text-white sm:text-xs">
                          {count}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-12 text-right text-xs text-gray-600 dark:text-gray-400 sm:w-16 sm:text-sm">
                    {percentage.toFixed(0)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 每日正确率趋势 */}
        <div className="mb-8 rounded-card border border-gray-200/60 bg-white/80 p-4 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80 sm:p-8">
          <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-white sm:mb-6 sm:text-xl">
            每日正确率趋势
          </h2>
          {statistics.dailyAccuracy.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-gray-400 dark:text-gray-500 sm:h-64">
              暂无学习记录
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <div className="min-w-[320px]">
                  <LineChart
                    data={statistics.dailyAccuracy.map((p) => ({
                      date: p.date.slice(5),
                      value: p.accuracy * 100,
                    }))}
                    yAxisLabel="正确率(%)"
                    height={240}
                  />
                </div>
              </div>
              <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400 sm:mt-4 sm:text-sm">
                最近14天每日正确率
              </p>
            </>
          )}
        </div>

        {/* 学习热力图（按星期统计） */}
        <div className="rounded-card border border-gray-200/60 bg-white/80 p-4 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80 sm:p-8">
          <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-white sm:mb-6 sm:text-xl">
            每周学习分布
          </h2>
          <div className="grid grid-cols-7 gap-1 sm:gap-3">
            {['日', '一', '二', '三', '四', '五', '六'].map((label, idx) => {
              const count = statistics.weekdayHeat[idx] ?? 0;
              const maxCount = Math.max(...statistics.weekdayHeat, 1);
              const intensity = Math.min(0.9, 0.1 + (count / maxCount) * 0.8);
              return (
                <div
                  key={label}
                  className="flex flex-col items-center gap-1 rounded-card border border-gray-200/60 p-2 transition-all duration-g3-fast hover:shadow-elevated dark:border-slate-700 sm:gap-2 sm:p-4"
                  style={{ backgroundColor: `rgba(59, 130, 246, ${intensity})` }}
                  title={`星期${label}：${count} 次练习`}
                >
                  <span
                    className={`text-xs font-medium sm:text-sm ${intensity > 0.5 ? 'text-white' : 'text-gray-700'}`}
                  >
                    {label}
                  </span>
                  <span
                    className={`text-lg font-bold sm:text-2xl ${intensity > 0.5 ? 'text-white' : 'text-gray-900'}`}
                  >
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 错题语义分析 */}
        <ErrorAnalysisPanel />
      </div>
    </div>
  );
}
