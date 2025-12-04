import { useNavigate } from 'react-router-dom';
import { DailyMissionCard } from '../components/dashboard/DailyMissionCard';
import { useStudyPlan } from '../hooks/useStudyPlan';
import { useAuth } from '../contexts/AuthContext';
import { CircleNotch, Books } from '../components/Icon';

export default function TodayWordsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { plan, loading, error, refresh } = useStudyPlan();

  const handleStartSession = () => {
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <CircleNotch className="animate-spin mx-auto mb-4" size={48} weight="bold" color="#3b82f6" />
          <p className="text-gray-600">正在加载今日学习计划...</p>
        </div>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <Books size={64} weight="thin" color="#9ca3af" className="mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">无法加载学习计划</h2>
          <p className="text-gray-600 mb-6">{error || '无法生成今日学习计划'}</p>
          <button
            onClick={refresh}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  const estimatedTime = Math.ceil(plan.words.length * 0.5);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            欢迎回来，{user?.username || '学习者'}！
          </h1>
          <p className="mt-2 text-gray-600">你的每日词汇学习旅程已准备就绪</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <DailyMissionCard
              totalWords={plan.words.length}
              todayStudied={plan.todayStudied}
              todayTarget={plan.todayTarget}
              estimatedTime={estimatedTime}
              correctRate={plan.correctRate}
              onStart={handleStartSession}
            />

            {plan.words.length > 0 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4">今日单词预览</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {plan.words.slice(0, 6).map((word, index) => (
                    <div
                      key={word.id}
                      className="p-3 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
                    >
                      <div className="text-sm font-bold text-blue-600">#{index + 1}</div>
                      <div className="font-bold text-gray-900 mt-1">{word.spelling}</div>
                      <div className="text-xs text-gray-500 mt-1 truncate">
                        {word.meanings[0]}
                      </div>
                    </div>
                  ))}
                </div>
                {plan.words.length > 6 && (
                  <p className="text-center text-sm text-gray-500 mt-4">
                    还有 {plan.words.length - 6} 个单词等待学习...
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-800 mb-4">学习统计</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">累计学习</span>
                  <span className="text-xl font-bold text-blue-600">{plan.totalStudied}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">正确率</span>
                  <span className="text-xl font-bold text-green-600">
                    {plan.correctRate}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">今日目标</span>
                  <span className="text-xl font-bold text-purple-600">{plan.todayTarget}</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-6 rounded-2xl shadow-lg text-white relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="font-bold text-lg mb-1">继续加油！</h3>
                <p className="text-indigo-100 text-sm mb-4">
                  每天坚持学习，词汇量持续提升
                </p>
                <div className="flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-2 rounded-lg inline-block">
                  <Books size={20} weight="fill" />
                  <span className="text-sm font-medium">词汇大师之路</span>
                </div>
              </div>
              <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
