import { useNavigate } from 'react-router-dom';
import { DailyMissionCard } from '../components/dashboard/DailyMissionCard';
import { useTodayWordsCompat } from '../hooks/queries/useTodayWords';
import { useAuth } from '../contexts/AuthContext';
import { CircleNotch, Books } from '../components/Icon';

export default function TodayWordsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { plan, loading, error, refresh } = useTodayWordsCompat();

  const handleStartSession = () => {
    navigate('/');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <CircleNotch className="mx-auto mb-4 animate-spin" size={48} color="#3b82f6" />
          <p className="text-gray-600 dark:text-gray-400">正在加载今日学习计划...</p>
        </div>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-slate-900">
        <div className="max-w-md rounded-card border border-gray-100 bg-white p-8 text-center shadow-soft dark:border-slate-700 dark:bg-slate-800">
          <Books size={64} color="#9ca3af" className="mx-auto mb-4" />
          <h2 className="mb-2 text-xl font-bold text-gray-800 dark:text-gray-200">
            无法加载学习计划
          </h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">{error || '无法生成今日学习计划'}</p>
          <button
            onClick={() => refresh()}
            className="rounded-button bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  const estimatedTime = Math.ceil(plan.words.length * 0.5);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 dark:bg-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            欢迎回来，{user?.username || '学习者'}！
          </h1>
          <p className="mt-1 text-base text-gray-600 dark:text-gray-400">
            你的每日词汇学习旅程已准备就绪
          </p>
        </header>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <DailyMissionCard
              totalWords={plan.words.length}
              todayStudied={plan.todayStudied}
              todayTarget={plan.todayTarget}
              estimatedTime={estimatedTime}
              correctRate={plan.correctRate}
              onStart={handleStartSession}
            />

            {plan.words.length > 0 && (
              <div className="rounded-card border border-gray-100 bg-white p-4 shadow-soft dark:border-slate-700 dark:bg-slate-800">
                <h3 className="mb-3 text-xl font-bold text-gray-800 dark:text-gray-200">
                  今日单词预览
                </h3>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {plan.words.slice(0, 6).map((word, index) => (
                    <div
                      key={word.id}
                      className="rounded-button border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 p-2.5 transition-colors hover:border-blue-300 dark:border-slate-600 dark:from-slate-800 dark:to-slate-700 dark:hover:border-blue-600"
                    >
                      <div className="text-sm font-bold text-blue-600">#{index + 1}</div>
                      <div className="mt-0.5 text-lg font-bold text-gray-900 dark:text-white">
                        {word.spelling}
                      </div>
                      <div className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">
                        {word.meanings[0]}
                      </div>
                    </div>
                  ))}
                </div>
                {plan.words.length > 6 && (
                  <p className="mt-3 text-center text-base text-gray-500 dark:text-gray-400">
                    还有 {plan.words.length - 6} 个单词等待学习...
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-card border border-gray-100 bg-white p-4 shadow-soft dark:border-slate-700 dark:bg-slate-800">
              <h3 className="mb-3 text-lg font-bold text-gray-800 dark:text-gray-200">学习统计</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-base text-gray-600 dark:text-gray-400">累计学习</span>
                  <span className="text-2xl font-bold text-blue-600">{plan.totalStudied}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-base text-gray-600 dark:text-gray-400">正确率</span>
                  <span className="text-2xl font-bold text-green-600">{plan.correctRate}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-base text-gray-600 dark:text-gray-400">今日目标</span>
                  <span className="text-2xl font-bold text-blue-600">{plan.todayTarget}</span>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-blue-600 to-blue-500 p-4 text-white shadow-elevated">
              <div className="relative z-10">
                <h3 className="mb-1 text-xl font-bold">继续加油！</h3>
                <p className="mb-3 text-base text-blue-100">每天坚持学习，词汇量持续提升</p>
                <div className="inline-block flex items-center gap-2 rounded-button bg-white/20 px-3 py-2 backdrop-blur-md">
                  <Books size={20} />
                  <span className="text-base font-medium">词汇大师之路</span>
                </div>
              </div>
              <div className="absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-white/10 blur-2xl"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
