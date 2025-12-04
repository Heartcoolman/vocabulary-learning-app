export interface MasteryProgressProps {
  progress: {
    masteredCount: number;
    targetCount: number;
    totalQuestions: number;
    activeCount: number;
    pendingCount: number;
  };
  currentWordStatus?: 'new' | 'learning' | 'almost' | 'mastered';
  isCompleted?: boolean;
  className?: string;
}

const STATUS_CONFIG = {
  new: { label: '新词', emoji: '🆕', color: 'blue' },
  learning: { label: '学习中', emoji: '🔄', color: 'orange' },
  almost: { label: '即将掌握', emoji: '⭐', color: 'indigo' },
  mastered: { label: '已掌握', emoji: '✅', color: 'green' }
} as const;

export default function MasteryProgress({
  progress,
  currentWordStatus,
  isCompleted = false,
  className = ''
}: MasteryProgressProps) {
  const percentage = Math.min(100, Math.max(0,
    progress.targetCount > 0 ? (progress.masteredCount / progress.targetCount) * 100 : 0
  ));

  const status = currentWordStatus ? STATUS_CONFIG[currentWordStatus] : null;

  return (
    <div
      className={`w-full bg-white rounded-lg shadow-sm border border-gray-100 p-4 ${className}`}
      role="region"
      aria-label="掌握模式学习进度"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">📊</span>
          <h3 className="font-semibold text-gray-800">
            {isCompleted ? '学习目标达成' : '学习进度'}
          </h3>
        </div>

        <div className={`text-lg font-bold ${
          isCompleted ? 'text-green-600' : 'text-blue-600'
        }`}>
          {Math.round(percentage)}%
        </div>
      </div>

      <div className="relative h-3 w-full bg-gray-100 rounded-full overflow-hidden mb-4">
        <div
          className={`h-full transition-all duration-700 ease-out rounded-full ${
            isCompleted
              ? 'bg-gradient-to-r from-green-400 to-green-500'
              : 'bg-gradient-to-r from-blue-400 to-blue-600'
          }`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={progress.masteredCount}
          aria-valuemin={0}
          aria-valuemax={progress.targetCount}
          aria-label={`已掌握 ${progress.masteredCount} 个单词，共 ${progress.targetCount} 个目标，进度 ${Math.round(percentage)}%`}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${
              isCompleted ? 'bg-green-500' : 'bg-blue-500'
            }`} />
            已记住: <span className="font-medium text-gray-900">
              {progress.masteredCount}/{progress.targetCount}词
            </span>
          </span>
          <span className="w-px h-3 bg-gray-300" />
          <span>
            本次答题: <span className="font-medium text-gray-900">
              {progress.totalQuestions}题
            </span>
          </span>
        </div>

        {status && !isCompleted && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-50 text-xs font-medium text-gray-700">
            <span>{status.emoji}</span>
            {status.label}
          </div>
        )}

        {isCompleted && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-50 text-xs font-medium text-green-700">
            <span>✅</span>
            完成
          </div>
        )}
      </div>
    </div>
  );
}
