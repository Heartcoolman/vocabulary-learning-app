import { Calendar, Target, TrendUp, Confetti, Lightning } from '@phosphor-icons/react';

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
  const dailyPercentage =
    dailyGoal > 0 ? Math.min(100, Math.round((currentProgress / dailyGoal) * 100)) : 0;
  const weeklyPercentage =
    weeklyGoal > 0 ? Math.min(100, Math.round((weeklyProgress / weeklyGoal) * 100)) : 0;

  return (
    <div className="rounded-card border border-gray-100 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800">
      <h3 className="mb-6 flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
        <Target className="h-6 w-6 text-blue-500" />
        学习目标追踪
      </h3>

      <div className="space-y-6">
        {/* 每日目标 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">每日目标</span>
            </div>
            <span className="text-sm font-bold text-blue-600">
              {currentProgress} / {dailyGoal} 个单词
            </span>
          </div>

          <div className="relative">
            <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
              <div
                className={`h-3 rounded-full transition-all duration-g3-slow ${
                  dailyPercentage >= 100
                    ? 'bg-gradient-to-r from-green-400 to-green-600'
                    : 'bg-gradient-to-r from-blue-400 to-blue-600'
                }`}
                style={{ width: `${dailyPercentage}%` }}
              />
            </div>
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 transform">
              {dailyPercentage >= 50 && (
                <span className="drop-shadow-elevated text-xs font-semibold text-white">
                  {dailyPercentage}%
                </span>
              )}
            </div>
          </div>

          {dailyPercentage >= 100 ? (
            <p className="flex items-center gap-1 text-xs font-medium text-green-600">
              <Confetti size={14} /> 太棒了！今日目标已完成！
            </p>
          ) : dailyPercentage >= 80 ? (
            <p className="flex items-center gap-1 text-xs font-medium text-blue-600">
              <Lightning size={14} /> 快完成了，继续加油！
            </p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              还需学习 {dailyGoal - currentProgress} 个单词
            </p>
          )}
        </div>

        {/* 每周目标 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendUp className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">本周目标</span>
            </div>
            <span className="text-sm font-bold text-purple-600">
              {weeklyProgress} / {weeklyGoal} 个单词
            </span>
          </div>

          <div className="relative">
            <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
              <div
                className={`h-3 rounded-full transition-all duration-g3-slow ${
                  weeklyPercentage >= 100
                    ? 'bg-gradient-to-r from-green-400 to-green-600'
                    : 'bg-gradient-to-r from-purple-400 to-purple-600'
                }`}
                style={{ width: `${weeklyPercentage}%` }}
              />
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">本周已完成 {weeklyPercentage}%</p>
        </div>

        {/* 预计完成时间 */}
        {estimatedDaysToComplete !== null && estimatedDaysToComplete > 0 && (
          <div className="border-t border-gray-100 pt-4 dark:border-slate-700">
            <div className="rounded-button bg-gradient-to-r from-blue-50 to-purple-50 p-4 dark:from-blue-900/20 dark:to-purple-900/20">
              <div className="mb-2 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  完成预测
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                按当前进度，预计{' '}
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  {estimatedDaysToComplete} 天
                </span>{' '}
                后达成学习目标
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
