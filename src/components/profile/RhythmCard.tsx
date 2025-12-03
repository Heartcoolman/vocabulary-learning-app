import React from 'react';
import { Lightning, Timer, Hourglass } from '@phosphor-icons/react';

interface RhythmCardProps {
  type: 'fast' | 'slow' | 'mixed';
  avgDuration: number;
  preferredPace: number;
}

export const RhythmCard: React.FC<RhythmCardProps> = ({ type, avgDuration, preferredPace }) => {
  const getMeta = () => {
    switch (type) {
      case 'fast':
        return {
          icon: <Lightning size={32} weight="duotone" className="text-blue-500" />,
          title: '闪电战型',
          desc: '偏好短时间、高强度的爆发式学习。',
          color: 'text-blue-500',
          bg: 'bg-blue-500'
        };
      case 'slow':
        return {
          icon: <Hourglass size={32} weight="duotone" className="text-emerald-500" />,
          title: '沉浸型',
          desc: '喜欢长时间、深入的专注学习时段。',
          color: 'text-emerald-500',
          bg: 'bg-emerald-500'
        };
      default:
        return {
          icon: <Timer size={32} weight="duotone" className="text-purple-500" />,
          title: '混合节奏',
          desc: '根据内容难度灵活调整学习步调。',
          color: 'text-purple-500',
          bg: 'bg-purple-500'
        };
    }
  };

  const meta = getMeta();

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 relative overflow-hidden group">
      <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-10 -mr-10 -mt-10 transition-colors duration-500 ${meta.bg}`} />

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-4">
          <div className="p-3 bg-gray-50 rounded-xl group-hover:scale-110 transition-transform duration-300">
            {meta.icon}
          </div>
        </div>

        <h3 className="text-lg font-bold text-gray-800 mb-1">{meta.title}</h3>
        <p className="text-sm text-gray-500 mb-4 h-10 leading-relaxed">{meta.desc}</p>

        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-50">
          <div>
            <span className="text-xs text-gray-400 block mb-1">平均时长</span>
            <span className="text-sm font-semibold text-gray-700">{Math.round(avgDuration)} 分钟</span>
          </div>
          <div>
            <span className="text-xs text-gray-400 block mb-1">学习配速</span>
            <span className={`text-sm font-semibold ${meta.color}`}>{preferredPace > 0 ? preferredPace : '--'} 词/分</span>
          </div>
        </div>
      </div>
    </div>
  );
};
