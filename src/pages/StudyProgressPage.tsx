import { ProgressOverviewCard } from '../components/dashboard/ProgressOverviewCard';
import { useStudyProgress } from '../hooks/useStudyProgress';
import { TrendingUp, Activity, AlertCircle } from 'lucide-react';
import { CircleNotch } from '../components/Icon';

export default function StudyProgressPage() {
  const { progress, loading, error, refresh } = useStudyProgress();

  const weeklyTrend = progress?.weeklyTrend ?? [0, 0, 0, 0, 0, 0, 0];
  const maxTrend = Math.max(...weeklyTrend, 1);

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
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
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

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">学习进度</h1>
            <p className="mt-1 text-gray-500">追踪你的词汇掌握进程</p>
          </div>
          <div className="text-sm text-gray-400 hidden sm:block">
            最后更新: {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        <section>
          <ProgressOverviewCard data={progress} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-500" />
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
                <Activity className="w-5 h-5 text-emerald-500" />
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
