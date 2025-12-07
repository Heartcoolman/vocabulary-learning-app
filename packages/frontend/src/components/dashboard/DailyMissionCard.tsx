import { Target, Clock, Lightning, Play, CheckCircle } from '../../components/Icon';

interface DailyMissionCardProps {
  totalWords: number;
  todayStudied: number;
  todayTarget: number;
  estimatedTime: number;
  correctRate: number;
  onStart: () => void;
}

export const DailyMissionCard = ({
  totalWords,
  todayStudied,
  todayTarget,
  estimatedTime,
  correctRate,
  onStart,
}: DailyMissionCardProps) => {
  const progress =
    todayTarget > 0 ? Math.min(100, Math.round((todayStudied / todayTarget) * 100)) : 0;
  const isCompleted = todayStudied >= todayTarget && todayTarget > 0;
  const remaining = Math.max(0, todayTarget - todayStudied);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg transition-all hover:shadow-xl">
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-blue-500 p-6 text-white sm:p-8">
        <div className="relative z-10">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-2xl font-bold">
                <Target className="h-6 w-6 text-blue-200" weight="duotone" />
                今日学习任务
              </h3>
              <p className="mt-1 font-medium text-blue-100">
                {isCompleted ? '太棒了！你已完成今日目标' : '继续保持学习节奏！'}
              </p>
            </div>
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/20 px-4 py-1.5 shadow-inner backdrop-blur-md">
                <Lightning className="h-4 w-4 fill-yellow-300 text-yellow-300" weight="fill" />
                <span className="text-lg font-bold">{correctRate}%</span>
                <span className="text-xs font-medium uppercase tracking-wide text-blue-50">
                  正确率
                </span>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <div className="mb-2 flex justify-between text-sm font-medium text-blue-100">
              <span>每日目标</span>
              <span>
                {todayStudied} / {todayTarget} 个单词
              </span>
            </div>
            <div className="h-4 overflow-hidden rounded-full border border-blue-400/20 bg-blue-900/30 backdrop-blur-sm">
              <div
                className="relative h-full rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-all duration-1000 ease-out"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute inset-0 w-1/2 skew-x-12 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
              </div>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute right-0 top-0 -mr-10 -mt-10 h-64 w-64 rounded-full bg-white/10 blur-3xl"></div>
      </div>

      <div className="p-6 sm:p-8">
        <div className="mb-8 grid grid-cols-2 gap-4">
          <div className="group flex flex-col items-center rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-center transition-colors hover:bg-emerald-100">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-600">
              今日已学
            </div>
            <div className="text-3xl font-bold text-gray-800 transition-transform group-hover:scale-110">
              {todayStudied}
            </div>
          </div>
          <div className="group flex flex-col items-center rounded-xl border border-amber-100 bg-amber-50 p-4 text-center transition-colors hover:bg-amber-100">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-600">
              剩余单词
            </div>
            <div className="text-3xl font-bold text-gray-800 transition-transform group-hover:scale-110">
              {remaining}
            </div>
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between text-sm font-medium text-gray-500">
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5">
            <Clock className="h-4 w-4 text-gray-400" weight="bold" />
            <span>预计 ~{estimatedTime} 分钟</span>
          </div>
          <div className="text-gray-600">共 {totalWords} 个单词待学习</div>
        </div>

        <button
          onClick={onStart}
          disabled={isCompleted}
          className={`flex w-full transform items-center justify-center gap-2 rounded-xl py-4 text-lg font-bold shadow-lg transition-all active:scale-[0.98] ${
            isCompleted
              ? 'cursor-not-allowed bg-gray-100 text-gray-400 shadow-none'
              : 'bg-blue-600 text-white hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-blue-500/30'
          }`}
        >
          {isCompleted ? (
            <>
              <CheckCircle className="h-5 w-5" weight="bold" /> 今日任务已完成
            </>
          ) : (
            <>
              <Play className="h-5 w-5 fill-current" weight="fill" />{' '}
              {todayStudied > 0 ? '继续学习' : '开始学习'}
            </>
          )}
        </button>
      </div>
    </div>
  );
};
