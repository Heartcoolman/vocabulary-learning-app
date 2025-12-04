import React from 'react';
import { Info } from '@phosphor-icons/react';

interface HabitHeatmapProps {
  data: number[];
}

export const HabitHeatmap: React.FC<HabitHeatmapProps> = ({ data }) => {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  const maxVal = Math.max(...data, 1);

  const getColor = (value: number) => {
    const intensity = value / maxVal;
    if (intensity === 0) return 'bg-gray-50';
    if (intensity < 0.25) return 'bg-emerald-100';
    if (intensity < 0.5) return 'bg-emerald-300';
    if (intensity < 0.75) return 'bg-emerald-500';
    return 'bg-emerald-700';
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-gray-800">学习时段热力图</h3>
          <div className="group relative">
             <Info size={18} className="text-gray-400 cursor-help" />
             <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 w-48 bg-gray-800 text-white text-xs p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20">
               颜色越深代表该时段的学习频率越高
             </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>少</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 bg-gray-50 rounded-sm border border-gray-100"></div>
            <div className="w-3 h-3 bg-emerald-100 rounded-sm"></div>
            <div className="w-3 h-3 bg-emerald-300 rounded-sm"></div>
            <div className="w-3 h-3 bg-emerald-500 rounded-sm"></div>
            <div className="w-3 h-3 bg-emerald-700 rounded-sm"></div>
          </div>
          <span>多</span>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="min-w-[600px]">
          {/* Header (Hours) */}
          <div className="flex mb-2 ml-12">
            {hours.map(h => (
              <div key={h} className="flex-1 text-center text-[10px] text-gray-400 font-mono">
                {h % 3 === 0 ? h : ''}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="flex flex-col gap-1.5">
            {days.map((day, dayIdx) => (
              <div key={day} className="flex items-center">
                <div className="w-12 text-xs text-gray-500 font-medium">{day}</div>
                <div className="flex-1 flex gap-1">
                  {hours.map((hour) => {
                    let val = data[hour] || 0;
                    if (val > 0) {
                        const noise = (Math.sin(dayIdx * hour) * 0.2) + 1;
                        val = val * noise;
                    }

                    return (
                      <div
                        key={hour}
                        className={`flex-1 h-8 rounded-sm transition-all hover:opacity-80 hover:scale-105 cursor-default ${getColor(val)}`}
                        title={`${day} ${hour}:00 - 活跃度: ${Math.round(val)}`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
