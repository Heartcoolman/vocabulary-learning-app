import { Calendar, Target, TrendUp } from '../Icon';

interface GoalTrackerProps {
  dailyGoal: number;
  currentProgress: number;
  weeklyGoal: number;
  weeklyProgress: number;
  estimatedDaysToComplete: number | null;
}

export const GoalTracker = ({
  dailyGoal,
  currentProgress,
  weeklyGoal,
  weeklyProgress,
  estimatedDaysToComplete,
}: GoalTrackerProps) => {
  const dailyPercentage = Math.min(100, Math.round((currentProgress / dailyGoal) * 100));
  const weeklyPercentage = Math.min(100, Math.round((weeklyProgress / weeklyGoal) * 100));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Target className="w-6 h-6 text-blue-500" weight="duotone" />
        学习目标追踪
      </h3>

      <div className="space-y-6">
        {/* 每日目标 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-500" weight="bold" />
              <span className="text-sm font-medium text-gray-700">每日目标</span>
            </div>
            <span className="text-sm font-bold text-blue-600">
              {currentProgress} / {dailyGoal} 个单词
            </span>
          </div>

          <div className="relative">
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  dailyPercentage >= 100
                    ? 'bg-gradient-to-r from-green-400 to-green-600'
                    : 'bg-gradient-to-r from-blue-400 to-blue-600'
                }`}
                style={{ width: `${dailyPercentage}%` }}
              />
            </div>
            <div className="absolute -top-1 left-1/2 transform -translate-x-1/2">
              {dailyPercentage >= 50 && (
                <span className="text-xs font-semibold text-white drop-shadow-md">
                  {dailyPercentage}%
                </span>
              )}
            </div>
          </div>

          {dailyPercentage >= 100 ? (
            <p className="text-xs text-green-600 font-medium">🎉 太棒了！今日目标已完成！</p>
          ) : dailyPercentage >= 80 ? (
            <p className="text-xs text-blue-600 font-medium">💪 快完成了，继续加油！</p>
          ) : (
            <p className="text-xs text-gray-500">
              还需学习 {dailyGoal - currentProgress} 个单词
            </p>
          )}
        </div>

        {/* 每周目标 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendUp className="w-4 h-4 text-purple-500" weight="bold" />
              <span className="text-sm font-medium text-gray-700">本周目标</span>
            </div>
            <span className="text-sm font-bold text-purple-600">
              {weeklyProgress} / {weeklyGoal} 个单词
            </span>
          </div>

          <div className="relative">
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  weeklyPercentage >= 100
                    ? 'bg-gradient-to-r from-green-400 to-green-600'
                    : 'bg-gradient-to-r from-purple-400 to-purple-600'
                }`}
                style={{ width: `${weeklyPercentage}%` }}
              />
            </div>
          </div>

          <p className="text-xs text-gray-500">
            本周已完成 {weeklyPercentage}%
          </p>
        </div>

        {/* 预计完成时间 */}
        {estimatedDaysToComplete !== null && estimatedDaysToComplete > 0 && (
          <div className="pt-4 border-t border-gray-100">
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-indigo-600" weight="bold" />
                <span className="text-sm font-semibold text-gray-900">完成预测</span>
              </div>
              <p className="text-sm text-gray-700">
                按当前进度，预计{' '}
                <span className="font-bold text-indigo-600">{estimatedDaysToComplete} 天</span>{' '}
                后达成学习目标
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
