import React from 'react';
import { Fire, TrendUp, TrendDown, Minus, Lightning, Coffee } from '@phosphor-icons/react';

interface MotivationCardProps {
  streak: number;
  level: number;
  trend: 'up' | 'down' | 'stable';
}

export const MotivationCard: React.FC<MotivationCardProps> = ({ streak, level, trend }) => {
  const getTrendIcon = () => {
    if (trend === 'up') return <TrendUp size={20} className="text-green-500" />;
    if (trend === 'down') return <TrendDown size={20} className="text-red-500" />;
    return <Minus size={20} className="text-gray-400" />;
  };

  const getLevelLabel = (l: number) => {
    if (l >= 80)
      return (
        <span className="flex items-center gap-1">
          <Fire size={20} weight="fill" className="text-orange-500" /> 极高
        </span>
      );
    if (l >= 60)
      return (
        <span className="flex items-center gap-1">
          <Lightning size={20} weight="fill" className="text-yellow-500" /> 旺盛
        </span>
      );
    if (l >= 40)
      return (
        <span className="flex items-center gap-1">
          <Minus size={20} weight="bold" className="text-gray-400" /> 平稳
        </span>
      );
    return (
      <span className="flex items-center gap-1">
        <Coffee size={20} weight="duotone" className="text-gray-400" /> 低迷
      </span>
    );
  };

  return (
    <div className="group relative overflow-hidden rounded-card border border-gray-100 bg-white p-6 shadow-soft transition-all duration-g3-normal hover:shadow-elevated">
      <div className="absolute right-0 top-0 -mr-10 -mt-10 h-32 w-32 rounded-full bg-orange-500 opacity-10 blur-3xl" />

      <div className="relative z-10">
        <div className="mb-4 flex items-start justify-between">
          <div className="rounded-card bg-gray-50 p-3 transition-transform duration-g3-normal group-hover:scale-110">
            <Fire size={32} weight="duotone" className="text-orange-500" />
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
              当前连胜
            </span>
            <div className="flex items-end gap-1 text-orange-600">
              <span className="text-2xl font-black leading-none">{streak}</span>
              <span className="mb-1 text-xs font-medium">天</span>
            </div>
          </div>
        </div>

        <h3 className="mb-1 text-lg font-bold text-gray-800">动机追踪</h3>
        <div className="mb-4 flex h-10 items-center gap-2">
          <span className="text-2xl font-bold text-gray-700">{getLevelLabel(level)}</span>
          <div className="flex items-center rounded bg-gray-50 px-2 py-1 text-xs font-medium">
            {getTrendIcon()}
            <span className="ml-1">
              {trend === 'up' ? '上升中' : trend === 'down' ? '需调整' : '稳定'}
            </span>
          </div>
        </div>

        <div className="border-t border-gray-50 pt-4">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-400 to-red-500 transition-all duration-g3-slower"
              style={{ width: `${Math.max(5, Math.min(100, level))}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-[10px] text-gray-400">低</span>
            <span className="text-[10px] text-gray-400">高</span>
          </div>
        </div>
      </div>
    </div>
  );
};
