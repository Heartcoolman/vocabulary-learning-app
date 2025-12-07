import { ProgressOverviewCard } from '../components/dashboard/ProgressOverviewCard';
import { useStudyProgressWithRefresh } from '../hooks/queries/useStudyProgress';
import { useExtendedProgress } from '../hooks/useExtendedProgress';
import { useAuth } from '../contexts/AuthContext';
import {
  TrendUp,
  Activity,
  WarningCircle,
  Calendar,
  CircleNotch,
  Fire,
  Confetti,
  Lightning,
} from '../components/Icon';
import { MilestoneCard } from '../components/progress/MilestoneCard';
import { GoalTracker } from '../components/progress/GoalTracker';
import { MasteryDistributionChart } from '../components/progress/MasteryDistributionChart';
import LineChart from '../components/LineChart';

export default function StudyProgressPage() {
  const { user } = useAuth();
  const { progress, loading, error, refresh } = useStudyProgressWithRefresh();
  const { progress: extendedProgress, loading: extendedLoading } = useExtendedProgress(user?.id);

  const weeklyTrend = progress?.weeklyTrend ?? [0, 0, 0, 0, 0, 0, 0];
  const maxTrend = Math.max(...weeklyTrend, 1);

  // 准备月度趋势数据用于图表
  const monthlyChartData =
    extendedProgress?.monthlyTrend.map((value, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - index));
      return {
        date: `${date.getMonth() + 1}/${date.getDate()}`,
        value,
      };
    }) ?? [];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <CircleNotch
            className="mx-auto mb-4 animate-spin"
            size={48}
            weight="bold"
            color="#3b82f6"
          />
          <p className="text-gray-600">正在分析你的学习进度...</p>
        </div>
      </div>
    );
  }

  if (error || !progress) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
          <WarningCircle className="mx-auto mb-4 h-12 w-12 text-red-500" weight="bold" />
          <h2 className="mb-2 text-xl font-bold text-gray-900">无法加载进度数据</h2>
          <p className="mb-6 text-gray-600">{error || '获取数据时发生错误'}</p>
          <button
            onClick={refresh}
            className="rounded-lg border border-gray-300 bg-white px-6 py-2 text-gray-700 transition-colors hover:bg-gray-50"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const isFullyLoaded = !loading && !extendedLoading;

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">学习进度</h1>
            <p className="mt-1 text-gray-500">追踪你的词汇掌握进程</p>
          </div>
          <div className="hidden text-sm text-gray-400 sm:block">
            最后更新:{' '}
            {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {/* 基础进度概览 */}
        <section>
          <ProgressOverviewCard data={progress} />
        </section>

        {/* 学习里程碑 */}
        {isFullyLoaded && extendedProgress && (
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-gray-900">
              <TrendUp className="h-6 w-6 text-blue-500" weight="bold" />
              学习里程碑
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {extendedProgress.milestones.map((milestone) => (
                <MilestoneCard key={milestone.id} milestone={milestone} />
              ))}
            </div>
          </section>
        )}

        {/* 目标追踪 */}
        {isFullyLoaded && extendedProgress && (
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <GoalTracker
              dailyGoal={extendedProgress.todayTarget}
              currentProgress={extendedProgress.todayStudied}
              weeklyGoal={extendedProgress.weeklyTarget}
              weeklyProgress={extendedProgress.weeklyProgress}
              estimatedDaysToComplete={extendedProgress.estimatedDaysToComplete}
            />

            {/* 学习连胜统计 */}
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h3 className="mb-6 flex items-center gap-2 text-xl font-bold text-gray-900">
                <Activity className="h-6 w-6 text-amber-500" weight="bold" />
                学习连胜
              </h3>

              <div className="py-6 text-center">
                <div className="relative inline-block">
                  <div className="text-6xl font-bold text-amber-600">
                    {extendedProgress.learningStreak}
                  </div>
                  <div className="absolute -right-8 top-0">
                    <Fire size={32} weight="fill" className="text-orange-500" />
                  </div>
                </div>
                <p className="mt-4 text-lg text-gray-600">连续学习天数</p>
              </div>

              <div className="mt-6 space-y-3">
                {extendedProgress.learningStreak >= 7 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="flex items-center gap-1 text-sm font-medium text-amber-800">
                      <Confetti size={16} weight="fill" className="text-amber-600" />{' '}
                      太棒了！你已经连续学习 {extendedProgress.learningStreak} 天了！
                    </p>
                  </div>
                )}

                {extendedProgress.learningStreak < 7 && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <p className="flex items-center gap-1 text-sm font-medium text-blue-800">
                      <Lightning size={16} weight="fill" className="text-blue-600" /> 再坚持{' '}
                      {7 - extendedProgress.learningStreak} 天，达成一周学习目标！
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>目标：7 天连续学习</span>
                  <span className="font-semibold text-amber-600">
                    {Math.min(100, Math.round((extendedProgress.learningStreak / 7) * 100))}%
                  </span>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (extendedProgress.learningStreak / 7) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 掌握度分布 */}
        {isFullyLoaded && extendedProgress && (
          <section>
            <MasteryDistributionChart distribution={extendedProgress.masteryDistribution} />
          </section>
        )}

        {/* 月度学习趋势 */}
        {isFullyLoaded && monthlyChartData.length > 0 && (
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-6 flex items-center gap-2 text-xl font-bold text-gray-900">
              <Calendar className="h-6 w-6 text-purple-500" weight="bold" />
              30天学习趋势
            </h3>
            <LineChart data={monthlyChartData} yAxisLabel="学习单词数" height={280} />
            <p className="mt-4 text-center text-sm text-gray-500">过去30天的每日学习单词数量变化</p>
          </section>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-gray-800">
                <TrendUp className="h-5 w-5 text-blue-500" weight="bold" />
                7日学习活动
              </h3>
            </div>

            <div className="flex h-64 items-end justify-between gap-2 sm:gap-4">
              {weeklyTrend.map((value, idx) => (
                <div key={idx} className="group relative flex flex-1 flex-col justify-end">
                  <div
                    className={`relative w-full rounded-t-lg transition-all duration-500 ${
                      idx === 6 ? 'bg-blue-500' : 'bg-blue-100 group-hover:bg-blue-200'
                    }`}
                    style={{ height: `${(value / maxTrend) * 100}%` }}
                  >
                    <div className="pointer-events-none absolute -top-10 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                      {value} 个单词
                    </div>
                  </div>
                  <span className="mt-2 text-center text-xs font-medium text-gray-400">
                    {['一', '二', '三', '四', '五', '六', '日'][idx]}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-gray-800">
                <Activity className="h-5 w-5 text-emerald-500" weight="bold" />
                学习效率
              </h3>
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium text-emerald-800">答题准确率</span>
                  <span className="text-2xl font-bold text-emerald-600">
                    {progress.correctRate}%
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-emerald-200">
                  <div
                    className="h-2.5 rounded-full bg-emerald-500 transition-all duration-1000"
                    style={{ width: `${progress.correctRate}%` }}
                  ></div>
                </div>
                {progress.correctRate >= 80 && (
                  <p className="mt-2 text-xs text-emerald-600">表现优秀！继续保持高准确率！</p>
                )}
                {progress.correctRate < 80 && progress.correctRate >= 60 && (
                  <p className="mt-2 text-xs text-emerald-600">不错的表现，继续努力提升！</p>
                )}
                {progress.correctRate < 60 && (
                  <p className="mt-2 text-xs text-amber-600">建议加强复习，提高单词掌握度</p>
                )}
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium text-blue-800">今日完成度</span>
                  <span className="text-2xl font-bold text-blue-600">
                    {progress.todayTarget > 0
                      ? Math.min(
                          100,
                          Math.round((progress.todayStudied / progress.todayTarget) * 100),
                        )
                      : 0}
                    %
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-blue-200">
                  <div
                    className="h-2.5 rounded-full bg-blue-500 transition-all duration-1000"
                    style={{
                      width: `${
                        progress.todayTarget > 0
                          ? Math.min(
                              100,
                              Math.round((progress.todayStudied / progress.todayTarget) * 100),
                            )
                          : 0
                      }%`,
                    }}
                  ></div>
                </div>
                <p className="mt-2 text-xs text-blue-600">
                  已完成 {progress.todayStudied} / {progress.todayTarget} 个单词
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
