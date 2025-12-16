import { ReactNode, memo } from 'react';
import {
  ChartBar,
  CheckCircle,
  Sparkle,
  ArrowsClockwise,
  Star,
  Target,
} from '@phosphor-icons/react';

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
  headerActions?: ReactNode;
}

const STATUS_CONFIG = {
  new: { label: '新词', Icon: Sparkle, color: 'text-blue-500', bg: 'bg-blue-50' },
  learning: {
    label: '学习中',
    Icon: ArrowsClockwise,
    color: 'text-orange-500',
    bg: 'bg-orange-50',
  },
  almost: { label: '即将掌握', Icon: Star, color: 'text-indigo-500', bg: 'bg-indigo-50' },
  mastered: { label: '已掌握', Icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
} as const;

/**
 * MasteryProgress 组件 - 使用 React.memo 优化避免不必要的重渲染
 */
function MasteryProgress({
  progress,
  currentWordStatus,
  isCompleted = false,
  className = '',
  headerActions,
}: MasteryProgressProps) {
  const percentage = Math.min(
    100,
    Math.max(
      0,
      progress.targetCount > 0 ? (progress.masteredCount / progress.targetCount) * 100 : 0,
    ),
  );

  const status = currentWordStatus ? STATUS_CONFIG[currentWordStatus] : null;
  const StatusIcon = status?.Icon;

  return (
    <div
      className={`w-full rounded-card border border-gray-100 bg-white px-5 py-4 shadow-soft ${className}`}
      role="region"
      aria-label="掌握模式学习进度"
      data-testid="mastery-progress"
    >
      {/* Header: Title + Actions */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={`rounded-button p-2 ${isCompleted ? 'bg-green-100 text-green-600' : 'bg-blue-50 text-blue-600'}`}
          >
            {isCompleted ? (
              <CheckCircle size={20} weight="fill" />
            ) : (
              <ChartBar size={20} weight="fill" />
            )}
          </div>
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-gray-900">{isCompleted ? '目标达成' : '学习进度'}</h3>
            <span className="text-sm font-medium text-gray-500">{Math.round(percentage)}%</span>
          </div>
        </div>

        {/* Right Actions Toolbar */}
        {headerActions && <div className="flex items-center gap-0.5">{headerActions}</div>}
      </div>

      {/* Progress Bar */}
      <div className="relative mb-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all duration-g3-slower ease-g3 ${
            isCompleted
              ? 'bg-gradient-to-r from-green-400 to-green-500'
              : 'bg-gradient-to-r from-blue-400 to-blue-600'
          }`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={progress.masteredCount}
          aria-valuemin={0}
          aria-valuemax={progress.targetCount}
          data-testid="progress-bar"
        />
      </div>

      {/* Footer Stats */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4 text-gray-600">
          <span
            className="flex items-center gap-1.5"
            title="已掌握/目标"
            data-testid="mastered-count"
          >
            <Target size={16} className={isCompleted ? 'text-green-500' : 'text-blue-500'} />
            <span className="font-medium text-gray-900">{progress.masteredCount}</span>
            <span className="text-gray-400">/</span>
            <span>{progress.targetCount}</span>
          </span>

          <span className="h-4 w-px bg-gray-200" />

          <span
            className="flex items-center gap-1.5"
            title="本次答题数"
            data-testid="question-count"
          >
            <span className="font-medium text-gray-900">{progress.totalQuestions}</span>
            <span>题</span>
          </span>
        </div>

        {status && StatusIcon && !isCompleted && (
          <div
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium ${status.bg} ${status.color}`}
          >
            <StatusIcon size={14} weight="fill" />
            {status.label}
          </div>
        )}

        {isCompleted && (
          <div className="flex items-center gap-1.5 rounded bg-green-50 px-2.5 py-1 text-sm font-medium text-green-600">
            <CheckCircle size={14} weight="fill" />
            完成
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MasteryProgress);
