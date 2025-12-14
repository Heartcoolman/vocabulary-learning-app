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
          bg: 'bg-blue-500',
        };
      case 'slow':
        return {
          icon: <Hourglass size={32} weight="duotone" className="text-emerald-500" />,
          title: '沉浸型',
          desc: '喜欢长时间、深入的专注学习时段。',
          color: 'text-emerald-500',
          bg: 'bg-emerald-500',
        };
      default:
        return {
          icon: <Timer size={32} weight="duotone" className="text-purple-500" />,
          title: '混合节奏',
          desc: '根据内容难度灵活调整学习步调。',
          color: 'text-purple-500',
          bg: 'bg-purple-500',
        };
    }
  };

  const meta = getMeta();

  return (
    <div className="group relative overflow-hidden rounded-card border border-gray-100 bg-white p-6 shadow-soft transition-all duration-g3-normal hover:shadow-elevated">
      <div
        className={`absolute right-0 top-0 -mr-10 -mt-10 h-32 w-32 rounded-full opacity-10 blur-3xl transition-colors duration-g3-slow ${meta.bg}`}
      />

      <div className="relative z-10">
        <div className="mb-4 flex items-start justify-between">
          <div className="rounded-card bg-gray-50 p-3 transition-transform duration-g3-normal group-hover:scale-110">
            {meta.icon}
          </div>
        </div>

        <h3 className="mb-1 text-lg font-bold text-gray-800">{meta.title}</h3>
        <p className="mb-4 h-10 text-sm leading-relaxed text-gray-500">{meta.desc}</p>

        <div className="grid grid-cols-2 gap-3 border-t border-gray-50 pt-4">
          <div>
            <span className="mb-1 block text-xs text-gray-400">平均时长</span>
            <span className="text-sm font-semibold text-gray-700">
              {Math.round(avgDuration)} 分钟
            </span>
          </div>
          <div>
            <span className="mb-1 block text-xs text-gray-400">学习配速</span>
            <span className={`text-sm font-semibold ${meta.color}`}>
              {preferredPace > 0 ? preferredPace : '--'} 词/分
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
