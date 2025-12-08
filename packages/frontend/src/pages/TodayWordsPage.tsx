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
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <CircleNotch
            className="mx-auto mb-4 animate-spin"
            size={48}
            weight="bold"
            color="#3b82f6"
          />
          <p className="text-gray-600">正在加载今日学习计划...</p>
        </div>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <Books size={64} weight="thin" color="#9ca3af" className="mx-auto mb-4" />
          <h2 className="mb-2 text-xl font-bold text-gray-800">无法加载学习计划</h2>
          <p className="mb-6 text-gray-600">{error || '无法生成今日学习计划'}</p>
          <button
            onClick={() => refresh()}
            className="rounded-lg bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  const estimatedTime = Math.ceil(plan.words.length * 0.5);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            欢迎回来，{user?.username || '学习者'}！
          </h1>
          <p className="mt-2 text-gray-600">你的每日词汇学习旅程已准备就绪</p>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <DailyMissionCard
              totalWords={plan.words.length}
              todayStudied={plan.todayStudied}
              todayTarget={plan.todayTarget}
              estimatedTime={estimatedTime}
              correctRate={plan.correctRate}
              onStart={handleStartSession}
            />

            {plan.words.length > 0 && (
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-bold text-gray-800">今日单词预览</h3>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {plan.words.slice(0, 6).map((word, index) => (
                    <div
                      key={word.id}
                      className="rounded-lg border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 p-3 transition-colors hover:border-blue-300"
                    >
                      <div className="text-sm font-bold text-blue-600">#{index + 1}</div>
                      <div className="mt-1 font-bold text-gray-900">{word.spelling}</div>
                      <div className="mt-1 truncate text-xs text-gray-500">{word.meanings[0]}</div>
                    </div>
                  ))}
                </div>
                {plan.words.length > 6 && (
                  <p className="mt-4 text-center text-sm text-gray-500">
                    还有 {plan.words.length - 6} 个单词等待学习...
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h3 className="mb-4 font-bold text-gray-800">学习统计</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">累计学习</span>
                  <span className="text-xl font-bold text-blue-600">{plan.totalStudied}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">正确率</span>
                  <span className="text-xl font-bold text-green-600">{plan.correctRate}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">今日目标</span>
                  <span className="text-xl font-bold text-purple-600">{plan.todayTarget}</span>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 p-6 text-white shadow-lg">
              <div className="relative z-10">
                <h3 className="mb-1 text-lg font-bold">继续加油！</h3>
                <p className="mb-4 text-sm text-indigo-100">每天坚持学习，词汇量持续提升</p>
                <div className="inline-block flex items-center gap-2 rounded-lg bg-white/20 px-3 py-2 backdrop-blur-md">
                  <Books size={20} weight="fill" />
                  <span className="text-sm font-medium">词汇大师之路</span>
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
