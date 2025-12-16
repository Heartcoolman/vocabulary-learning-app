import React from 'react';
import { CheckCircle, Clock, Fire, BookOpen } from '@phosphor-icons/react';

interface MasteryStatsCardProps {
  label: string;
  value: number;
  icon: 'mastered' | 'learning' | 'review' | 'total';
  color: 'green' | 'blue' | 'orange' | 'purple';
}

export const MasteryStatsCard: React.FC<MasteryStatsCardProps> = ({
  label,
  value,
  icon,
  color,
}) => {
  const getIcon = () => {
    const iconProps = { size: 32, weight: 'duotone' as const };
    switch (icon) {
      case 'mastered':
        return <CheckCircle {...iconProps} className="text-green-500" />;
      case 'learning':
        return <Clock {...iconProps} className="text-blue-500" />;
      case 'review':
        return <Fire {...iconProps} className="text-orange-500" />;
      case 'total':
        return <BookOpen {...iconProps} className="text-purple-500" />;
    }
  };

  const getColorClasses = () => {
    switch (color) {
      case 'green':
        return {
          bg: 'bg-green-500',
          text: 'text-green-600',
          lightBg: 'bg-green-50',
        };
      case 'blue':
        return {
          bg: 'bg-blue-500',
          text: 'text-blue-600',
          lightBg: 'bg-blue-50',
        };
      case 'orange':
        return {
          bg: 'bg-orange-500',
          text: 'text-orange-600',
          lightBg: 'bg-orange-50',
        };
      case 'purple':
        return {
          bg: 'bg-purple-500',
          text: 'text-purple-600',
          lightBg: 'bg-purple-50',
        };
    }
  };

  const colors = getColorClasses();

  return (
    <div className="group relative overflow-hidden rounded-card border border-gray-100 bg-white p-6 shadow-soft transition-all duration-g3-normal hover:shadow-elevated">
      <div
        className={`absolute right-0 top-0 -mr-10 -mt-10 h-32 w-32 rounded-full opacity-10 blur-3xl ${colors.bg}`}
      />

      <div className="relative z-10">
        <div
          className={`p-3 ${colors.lightBg} mb-4 inline-block rounded-card transition-transform duration-g3-normal group-hover:scale-110`}
        >
          {getIcon()}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className={`text-3xl font-black ${colors.text}`}>{value}</p>
        </div>
      </div>
    </div>
  );
};
