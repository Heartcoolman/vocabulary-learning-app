import React from 'react';
import { CheckCircle, Clock, Fire, BookOpen } from '@phosphor-icons/react';

interface MasteryStatsCardProps {
  label: string;
  value: number;
  icon: 'mastered' | 'learning' | 'review' | 'total';
  color: 'green' | 'blue' | 'orange' | 'purple';
}

export const MasteryStatsCard: React.FC<MasteryStatsCardProps> = ({ label, value, icon, color }) => {
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
          lightBg: 'bg-green-50'
        };
      case 'blue':
        return {
          bg: 'bg-blue-500',
          text: 'text-blue-600',
          lightBg: 'bg-blue-50'
        };
      case 'orange':
        return {
          bg: 'bg-orange-500',
          text: 'text-orange-600',
          lightBg: 'bg-orange-50'
        };
      case 'purple':
        return {
          bg: 'bg-purple-500',
          text: 'text-purple-600',
          lightBg: 'bg-purple-50'
        };
    }
  };

  const colors = getColorClasses();

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 relative overflow-hidden group">
      <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-10 -mr-10 -mt-10 ${colors.bg}`} />

      <div className="relative z-10">
        <div className={`p-3 ${colors.lightBg} rounded-xl inline-block mb-4 group-hover:scale-110 transition-transform duration-300`}>
          {getIcon()}
        </div>

        <div className="space-y-1">
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className={`text-3xl font-black ${colors.text}`}>{value}</p>
        </div>
      </div>
    </div>
  );
};
