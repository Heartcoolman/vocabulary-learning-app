import { useNavigate } from 'react-router-dom';
import {
  ChartBar,
  Target,
  CheckCircle,
  Clock,
  TrendUp,
  ArrowLeft,
  CircleNotch,
  Warning,
} from '../components/Icon';
import { useStatistics } from '../hooks/queries';

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
          <CircleNotch
            className="mx-auto mb-4 animate-spin"
            size={48}
            weight="bold"
            color="#3b82f6"
          />
          <p className="text-gray-600">正在加载统计数据...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="max-w-md px-4 text-center">
          <Warning size={64} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900">加载失败</h2>
          <p className="mb-6 text-gray-600">
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
    <div className="min-h-screen animate-g3-fade-in bg-gradient-to-br from-slate-50 via-white to-blue-50/30 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        {/* 页面标题 */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white transition-all duration-g3-fast hover:scale-105 hover:bg-gray-50 active:scale-95"
              aria-label="返回"
            >
              <ArrowLeft size={20} weight="bold" />
            </button>
            <h1 className="text-3xl font-bold text-gray-900">学习统计</h1>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* 总学习单词数 */}
          <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:shadow-elevated">
            <div className="mb-4 flex items-center justify-between">
              <ChartBar size={32} weight="duotone" color="#3b82f6" />
            </div>
            <p className="mb-1 text-sm text-gray-600">总学习单词</p>
            <p className="text-3xl font-bold text-gray-900">{statistics.totalWords}</p>
          </div>

          {/* 整体正确率 */}
          <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:shadow-elevated">
            <div className="mb-4 flex items-center justify-between">
              <Target size={32} weight="duotone" color="#a855f7" />
            </div>
            <p className="mb-1 text-sm text-gray-600">整体正确率</p>
            <p className="text-3xl font-bold text-gray-900">
              {(statistics.overallAccuracy * 100).toFixed(1)}%
            </p>
          </div>

          {/* 学习天数 */}
          <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:shadow-elevated">
            <div className="mb-4 flex items-center justify-between">
              <Clock size={32} weight="duotone" color="#f59e0b" />
            </div>
            <p className="mb-1 text-sm text-gray-600">学习天数</p>
            <p className="text-3xl font-bold text-gray-900">{statistics.studyDays}</p>
          </div>

          {/* 连续学习天数 */}
          <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:shadow-elevated">
            <div className="mb-4 flex items-center justify-between">
              <TrendUp size={32} weight="duotone" color="#16a34a" />
            </div>
            <p className="mb-1 text-sm text-gray-600">连续学习</p>
            <p className="text-3xl font-bold text-gray-900">{statistics.consecutiveDays} 天</p>
          </div>
        </div>

        {/* 掌握程度分布 */}
        <div className="mb-8 rounded-card border border-gray-200/60 bg-white/80 p-8 shadow-soft backdrop-blur-sm">
          <h2 className="mb-6 flex items-center gap-2 text-xl font-bold text-gray-900">
            <CheckCircle size={24} weight="duotone" color="#3b82f6" />
            掌握程度分布
          </h2>
          <div className="space-y-4">
            {statistics.masteryDistribution.map(({ level, count }) => {
              const percentage =
                statistics.totalWords > 0 ? (count / statistics.totalWords) * 100 : 0;

              return (
                <div key={level} className="flex items-center gap-4">
                  <div className="w-20 text-sm font-medium text-gray-700">{level} 级</div>
                  <div className="h-8 flex-1 overflow-hidden rounded-button bg-gray-100">
                    <div
                      className="flex h-full items-center justify-end bg-gradient-to-r from-blue-400 to-blue-600 pr-3 transition-all duration-g3-slow"
                      style={{ width: `${percentage}%` }}
                    >
                      {count > 0 && (
                        <span className="text-xs font-medium text-white">{count} 个</span>
                      )}
                    </div>
                  </div>
                  <div className="w-16 text-right text-sm text-gray-600">
                    {percentage.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 每日正确率趋势（近似遗忘曲线） */}
        <div className="mb-8 rounded-card border border-gray-200/60 bg-white/80 p-8 shadow-soft backdrop-blur-sm">
          <h2 className="mb-6 text-xl font-bold text-gray-900">每日正确率趋势</h2>
          <div className="flex h-64 items-end gap-2 overflow-x-auto pb-4">
            {statistics.dailyAccuracy.length === 0 ? (
              <div className="flex h-full w-full items-center justify-center text-gray-400">
                暂无学习记录
              </div>
            ) : (
              statistics.dailyAccuracy.map((point) => (
                <div key={point.date} className="flex min-w-[40px] flex-col items-center gap-2">
                  <div
                    className="w-8 rounded-t bg-gradient-to-t from-blue-500 to-blue-400 transition-all duration-g3-normal hover:from-blue-600 hover:to-blue-500"
                    style={{ height: `${Math.max(8, point.accuracy * 200)}px` }}
                    title={`${point.date}: ${(point.accuracy * 100).toFixed(1)}%`}
                  />
                  <span className="whitespace-nowrap text-xs text-gray-500">
                    {point.date.slice(5)}
                  </span>
                </div>
              ))
            )}
          </div>
          {statistics.dailyAccuracy.length > 0 && (
            <p className="mt-2 text-center text-sm text-gray-500">最近14天每日正确率</p>
          )}
        </div>

        {/* 学习热力图（按星期统计） */}
        <div className="rounded-card border border-gray-200/60 bg-white/80 p-8 shadow-soft backdrop-blur-sm">
          <h2 className="mb-6 text-xl font-bold text-gray-900">每周学习分布</h2>
          <div className="grid grid-cols-7 gap-3">
            {['日', '一', '二', '三', '四', '五', '六'].map((label, idx) => {
              const count = statistics.weekdayHeat[idx] ?? 0;
              const maxCount = Math.max(...statistics.weekdayHeat, 1);
              const intensity = Math.min(0.9, 0.1 + (count / maxCount) * 0.8);
              return (
                <div
                  key={label}
                  className="flex flex-col items-center gap-2 rounded-card border border-gray-200/60 p-4 transition-all duration-g3-fast hover:shadow-elevated"
                  style={{ backgroundColor: `rgba(59, 130, 246, ${intensity})` }}
                  title={`星期${label}：${count} 次练习`}
                >
                  <span
                    className={`text-sm font-medium ${intensity > 0.5 ? 'text-white' : 'text-gray-700'}`}
                  >
                    周{label}
                  </span>
                  <span
                    className={`text-2xl font-bold ${intensity > 0.5 ? 'text-white' : 'text-gray-900'}`}
                  >
                    {count}
                  </span>
                  <span
                    className={`text-xs ${intensity > 0.5 ? 'text-white/80' : 'text-gray-500'}`}
                  >
                    次
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
