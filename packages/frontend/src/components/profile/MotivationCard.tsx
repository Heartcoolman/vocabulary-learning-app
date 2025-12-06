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
    if (l >= 80) return <span className="flex items-center gap-1"><Fire size={20} weight="fill" className="text-orange-500" /> 极高</span>;
    if (l >= 60) return <span className="flex items-center gap-1"><Lightning size={20} weight="fill" className="text-yellow-500" /> 旺盛</span>;
    if (l >= 40) return <span className="flex items-center gap-1"><Minus size={20} weight="bold" className="text-gray-400" /> 平稳</span>;
    return <span className="flex items-center gap-1"><Coffee size={20} weight="duotone" className="text-gray-400" /> 低迷</span>;
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-10 bg-orange-500 -mr-10 -mt-10" />

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-4">
          <div className="p-3 bg-gray-50 rounded-xl group-hover:scale-110 transition-transform duration-300">
            <Fire size={32} weight="duotone" className="text-orange-500" />
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">当前连胜</span>
            <div className="flex items-end gap-1 text-orange-600">
              <span className="text-2xl font-black leading-none">{streak}</span>
              <span className="text-xs font-medium mb-1">天</span>
            </div>
          </div>
        </div>

        <h3 className="text-lg font-bold text-gray-800 mb-1">动机追踪</h3>
        <div className="flex items-center gap-2 mb-4 h-10">
           <span className="text-2xl font-bold text-gray-700">{getLevelLabel(level)}</span>
           <div className="flex items-center bg-gray-50 px-2 py-1 rounded text-xs font-medium">
             {getTrendIcon()}
             <span className="ml-1">{trend === 'up' ? '上升中' : trend === 'down' ? '需调整' : '稳定'}</span>
           </div>
        </div>

        <div className="pt-4 border-t border-gray-50">
          <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-orange-400 to-red-500 h-full rounded-full transition-all duration-1000"
              style={{ width: `${Math.max(5, Math.min(100, level))}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
             <span className="text-[10px] text-gray-400">低</span>
             <span className="text-[10px] text-gray-400">高</span>
          </div>
        </div>
      </div>
    </div>
  );
};
