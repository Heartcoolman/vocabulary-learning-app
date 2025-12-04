import { Trophy, Star, Target, Zap } from 'lucide-react';

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
  zap: Zap,
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
      className={`${colors.bg} ${colors.border} border rounded-xl p-5 hover:shadow-md transition-all duration-200`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 ${colors.progress} rounded-lg flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {milestone.achieved && (
          <div className="bg-white px-2 py-1 rounded-full">
            <span className="text-xs font-bold text-green-600">已达成</span>
          </div>
        )}
      </div>

      <h3 className="text-base font-bold text-gray-900 mb-1">{milestone.title}</h3>
      <p className="text-xs text-gray-600 mb-3">{milestone.description}</p>

      <div className="space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-600">进度</span>
          <span className={`font-semibold ${colors.text}`}>
            {milestone.current} / {milestone.target}
          </span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className={`${colors.progress} h-2 rounded-full transition-all duration-500`}
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
