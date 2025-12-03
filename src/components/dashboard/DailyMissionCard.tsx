import { Target, Clock, Zap, Play, CheckCircle } from 'lucide-react';

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
  onStart
}: DailyMissionCardProps) => {
  const progress = todayTarget > 0 ? Math.min(100, Math.round((todayStudied / todayTarget) * 100)) : 0;
  const isCompleted = todayStudied >= todayTarget && todayTarget > 0;
  const remaining = Math.max(0, todayTarget - todayStudied);

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100 transition-all hover:shadow-xl">
      <div className="p-6 sm:p-8 bg-gradient-to-br from-blue-600 to-blue-500 text-white relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-2xl font-bold flex items-center gap-2">
                <Target className="w-6 h-6 text-blue-200" />
                今日学习任务
              </h3>
              <p className="text-blue-100 mt-1 font-medium">
                {isCompleted ? "太棒了！你已完成今日目标" : "继续保持学习节奏！"}
              </p>
            </div>
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-md px-4 py-1.5 rounded-full shadow-inner border border-white/10">
                <Zap className="w-4 h-4 text-yellow-300 fill-yellow-300" />
                <span className="font-bold text-lg">{correctRate}%</span>
                <span className="text-xs font-medium text-blue-50 uppercase tracking-wide">正确率</span>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <div className="flex justify-between text-sm mb-2 font-medium text-blue-100">
              <span>每日目标</span>
              <span>{todayStudied} / {todayTarget} 个单词</span>
            </div>
            <div className="h-4 bg-blue-900/30 rounded-full overflow-hidden backdrop-blur-sm border border-blue-400/20">
              <div
                className="h-full bg-white rounded-full transition-all duration-1000 ease-out relative shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent w-1/2 skew-x-12" />
              </div>
            </div>
          </div>
        </div>

        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      <div className="p-6 sm:p-8">
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex flex-col items-center text-center group hover:bg-emerald-100 transition-colors">
            <div className="text-emerald-600 text-xs font-bold uppercase tracking-wider mb-2">今日已学</div>
            <div className="text-3xl font-bold text-gray-800 group-hover:scale-110 transition-transform">{todayStudied}</div>
          </div>
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex flex-col items-center text-center group hover:bg-amber-100 transition-colors">
            <div className="text-amber-600 text-xs font-bold uppercase tracking-wider mb-2">剩余单词</div>
            <div className="text-3xl font-bold text-gray-800 group-hover:scale-110 transition-transform">{remaining}</div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-6 text-gray-500 text-sm font-medium">
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg">
            <Clock className="w-4 h-4 text-gray-400" />
            <span>预计 ~{estimatedTime} 分钟</span>
          </div>
          <div className="text-gray-600">
            共 {totalWords} 个单词待学习
          </div>
        </div>

        <button
          onClick={onStart}
          disabled={isCompleted}
          className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 ${
            isCompleted
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
              : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-500/30 hover:-translate-y-0.5'
          }`}
        >
          {isCompleted ? (
            <><CheckCircle className="w-5 h-5" /> 今日任务已完成</>
          ) : (
            <><Play className="w-5 h-5 fill-current" /> {todayStudied > 0 ? '继续学习' : '开始学习'}</>
          )}
        </button>
      </div>
    </div>
  );
};
