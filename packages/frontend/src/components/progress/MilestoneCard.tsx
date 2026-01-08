import { Trophy, Star, Target, Lightning } from '../Icon';

export interface Milestone {
  id: string;
  title: string;
  description: string;
  target: number;
  current: number;
  icon: 'trophy' | 'star' | 'target' | 'zap';
  achieved: boolean;
  color: string;
}

interface MilestoneCardProps {
  milestone: Milestone;
}

const iconMap = {
  trophy: Trophy,
  star: Star,
  target: Target,
  zap: Lightning,
};

const colorMap: Record<string, { bg: string; border: string; text: string; progress: string }> = {
  blue: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-600',
    progress: 'bg-blue-500',
  },
  green: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-600',
    progress: 'bg-green-500',
  },
  purple: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-600',
    progress: 'bg-purple-500',
  },
  amber: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-600',
    progress: 'bg-amber-500',
  },
};

export const MilestoneCard = ({ milestone }: MilestoneCardProps) => {
  const Icon = iconMap[milestone.icon];
  const colors = colorMap[milestone.color] || colorMap.blue;
  const percentage = Math.min(100, Math.round((milestone.current / milestone.target) * 100));

  return (
    <div
      className={`${colors.bg} ${colors.border} rounded-card border p-5 transition-all duration-g3-fast hover:shadow-elevated`}
    >
      <div className="mb-3 flex items-start justify-between">
        <div
          className={`h-10 w-10 ${colors.progress} flex items-center justify-center rounded-button`}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>
        {milestone.achieved && (
          <div className="rounded-full bg-white px-2 py-1">
            <span className="text-xs font-bold text-green-600">已达成</span>
          </div>
        )}
      </div>

      <h3 className="mb-1 text-base font-bold text-gray-900 dark:text-white">{milestone.title}</h3>
      <p className="mb-3 text-xs text-gray-600 dark:text-gray-400">{milestone.description}</p>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">进度</span>
          <span className={`font-semibold ${colors.text}`}>
            {milestone.current} / {milestone.target}
          </span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
          <div
            className={`${colors.progress} h-2 rounded-full transition-all duration-g3-slow`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="text-right">
          <span className={`text-xs font-medium ${colors.text}`}>{percentage}%</span>
        </div>
      </div>
    </div>
  );
};
