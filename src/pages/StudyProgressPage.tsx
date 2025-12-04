import { ProgressOverviewCard } from '../components/dashboard/ProgressOverviewCard';
import { useStudyProgress } from '../hooks/useStudyProgress';
import { useExtendedProgress } from '../hooks/useExtendedProgress';
import { useAuth } from '../contexts/AuthContext';
import { TrendUp, Activity, WarningCircle, Calendar, CircleNotch, Fire, Confetti, Lightning } from '../components/Icon';
import { MilestoneCard } from '../components/progress/MilestoneCard';
import { GoalTracker } from '../components/progress/GoalTracker';
import { MasteryDistributionChart } from '../components/progress/MasteryDistributionChart';
import LineChart from '../components/LineChart';

export default function StudyProgressPage() {
  const { user } = useAuth();
  const { progress, loading, error, refresh } = useStudyProgress();
  const { progress: extendedProgress, loading: extendedLoading } = useExtendedProgress(user?.id);

  const weeklyTrend = progress?.weeklyTrend ?? [0, 0, 0, 0, 0, 0, 0];
  const maxTrend = Math.max(...weeklyTrend, 1);

  // 准备月度趋势数据用于图表
  const monthlyChartData = extendedProgress?.monthlyTrend.map((value, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - index));
    return {
      date: `${date.getMonth() + 1}/${date.getDate()}`,
      value,
    };
  }) ?? [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <CircleNotch className="animate-spin mx-auto mb-4" size={48} weight="bold" color="#3b82f6" />
          <p className="text-gray-600">正在分析你的学习进度...</p>
        </div>
      </div>
    );
  }

  if (error || !progress) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-red-100 max-w-md w-full text-center">
          <WarningCircle className="w-12 h-12 text-red-500 mx-auto mb-4" weight="bold" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">无法加载进度数据</h2>
          <p className="text-gray-600 mb-6">{error || '获取数据时发生错误'}</p>
          <button
            onClick={refresh}
            className="px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const isFullyLoaded = !loading && !extendedLoading;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">学习进度</h1>
            <p className="mt-1 text-gray-500">追踪你的词汇掌握进程</p>
          </div>
          <div className="text-sm text-gray-400 hidden sm:block">
            最后更新: {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {/* 基础进度概览 */}
        <section>
          <ProgressOverviewCard data={progress} />
        </section>

        {/* 学习里程碑 */}
        {isFullyLoaded && extendedProgress && (
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <TrendUp className="w-6 h-6 text-blue-500" weight="bold" />
              学习里程碑
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {extendedProgress.milestones.map(milestone => (
                <MilestoneCard key={milestone.id} milestone={milestone} />
              ))}
            </div>
          </section>
        )}

        {/* 目标追踪 */}
        {isFullyLoaded && extendedProgress && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GoalTracker
              dailyGoal={extendedProgress.todayTarget}
              currentProgress={extendedProgress.todayStudied}
              weeklyGoal={extendedProgress.weeklyTarget}
              weeklyProgress={extendedProgress.weeklyProgress}
              estimatedDaysToComplete={extendedProgress.estimatedDaysToComplete}
            />

            {/* 学习连胜统计 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Activity className="w-6 h-6 text-amber-500" weight="bold" />
                学习连胜
              </h3>

              <div className="text-center py-6">
                <div className="inline-block relative">
                  <div className="text-6xl font-bold text-amber-600">
                    {extendedProgress.learningStreak}
                  </div>
                  <div className="absolute -right-8 top-0"><Fire size={32} weight="fill" className="text-orange-500" /></div>
                </div>
                <p className="text-lg text-gray-600 mt-4">连续学习天数</p>
              </div>

              <div className="mt-6 space-y-3">
                {extendedProgress.learningStreak >= 7 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="text-sm text-amber-800 font-medium flex items-center gap-1">
                      <Confetti size={16} weight="fill" className="text-amber-600" /> 太棒了！你已经连续学习 {extendedProgress.learningStreak} 天了！
                    </p>
                  </div>
                )}

                {extendedProgress.learningStreak < 7 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800 font-medium flex items-center gap-1">
                      <Lightning size={16} weight="fill" className="text-blue-600" /> 再坚持 {7 - extendedProgress.learningStreak} 天，达成一周学习目标！
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>目标：7 天连续学习</span>
                  <span className="font-semibold text-amber-600">
                    {Math.min(100, Math.round((extendedProgress.learningStreak / 7) * 100))}%
                  </span>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-amber-400 to-amber-600 h-2 rounded-full transition-all duration-500"
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
            <MasteryDistributionChart
              distribution={extendedProgress.masteryDistribution}
            />
          </section>
        )}

        {/* 月度学习趋势 */}
        {isFullyLoaded && monthlyChartData.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-purple-500" weight="bold" />
              30天学习趋势
            </h3>
            <LineChart
              data={monthlyChartData}
              yAxisLabel="学习单词数"
              height={280}
            />
            <p className="text-sm text-gray-500 text-center mt-4">
              过去30天的每日学习单词数量变化
            </p>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <TrendUp className="w-5 h-5 text-blue-500" weight="bold" />
                7日学习活动
              </h3>
            </div>

            <div className="h-64 flex items-end justify-between gap-2 sm:gap-4">
              {weeklyTrend.map((value, idx) => (
                <div key={idx} className="flex-1 flex flex-col justify-end group relative">
                  <div
                    className={`w-full rounded-t-lg transition-all duration-500 relative ${
                      idx === 6 ? 'bg-blue-500' : 'bg-blue-100 group-hover:bg-blue-200'
                    }`}
                    style={{ height: `${(value / maxTrend) * 100}%` }}
                  >
                    <div className="opacity-0 group-hover:opacity-100 absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs py-1 px-2 rounded pointer-events-none transition-opacity whitespace-nowrap z-10">
                      {value} 个单词
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 text-center mt-2 font-medium">
                    {['一', '二', '三', '四', '五', '六', '日'][idx]}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-500" weight="bold" />
                学习效率
              </h3>
            </div>

            <div className="space-y-6">
              <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-100">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-emerald-800 font-medium">答题准确率</span>
                  <span className="text-2xl font-bold text-emerald-600">{progress.correctRate}%</span>
                </div>
                <div className="w-full bg-emerald-200 rounded-full h-2.5">
                  <div
                    className="bg-emerald-500 h-2.5 rounded-full transition-all duration-1000"
                    style={{ width: `${progress.correctRate}%` }}
                  ></div>
                </div>
                {progress.correctRate >= 80 && (
                  <p className="text-xs text-emerald-600 mt-2">
                    表现优秀！继续保持高准确率！
                  </p>
                )}
                {progress.correctRate < 80 && progress.correctRate >= 60 && (
                  <p className="text-xs text-emerald-600 mt-2">
                    不错的表现，继续努力提升！
                  </p>
                )}
                {progress.correctRate < 60 && (
                  <p className="text-xs text-amber-600 mt-2">
                    建议加强复习，提高单词掌握度
                  </p>
                )}
              </div>

              <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-blue-800 font-medium">今日完成度</span>
                  <span className="text-2xl font-bold text-blue-600">
                    {progress.todayTarget > 0
                      ? Math.min(100, Math.round((progress.todayStudied / progress.todayTarget) * 100))
                      : 0}%
                  </span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2.5">
                  <div
                    className="bg-blue-500 h-2.5 rounded-full transition-all duration-1000"
                    style={{
                      width: `${progress.todayTarget > 0
                        ? Math.min(100, Math.round((progress.todayStudied / progress.todayTarget) * 100))
                        : 0}%`
                    }}
                  ></div>
                </div>
                <p className="text-xs text-blue-600 mt-2">
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
