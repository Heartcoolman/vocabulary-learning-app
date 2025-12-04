import React from 'react';
import { Info, Moon, SunHorizon, Sun, CloudSun, SunDim, MoonStars } from '@phosphor-icons/react';

interface HabitHeatmapProps {
  data: number[];
}

export const HabitHeatmap: React.FC<HabitHeatmapProps> = ({ data }) => {
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // 检查是否有有效数据
  const hasData = data && data.length > 0 && data.some(v => v > 0);
  const maxVal = hasData ? Math.max(...data, 1) : 1;

  const getColorClasses = (value: number) => {
    if (value === 0) return { bg: 'bg-gray-50', text: 'text-gray-500', subtext: 'text-gray-400' };
    const intensity = value / maxVal;
    if (intensity < 0.25) return { bg: 'bg-blue-100', text: 'text-blue-700', subtext: 'text-blue-600' };
    if (intensity < 0.5) return { bg: 'bg-blue-300', text: 'text-blue-800', subtext: 'text-blue-700' };
    if (intensity < 0.75) return { bg: 'bg-blue-500', text: 'text-white', subtext: 'text-blue-100' };
    return { bg: 'bg-blue-700', text: 'text-white', subtext: 'text-blue-200' };
  };

  const getTimeLabel = (hour: number) => {
    if (hour < 6) return '凌晨';
    if (hour < 12) return '上午';
    if (hour < 14) return '中午';
    if (hour < 18) return '下午';
    if (hour < 22) return '晚上';
    return '深夜';
  };

  if (!hasData) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-6">
          <h3 className="text-lg font-bold text-gray-800">学习时段热力图</h3>
        </div>
        <div className="text-center py-8 text-gray-400">
          <p>暂无学习时段数据</p>
          <p className="text-sm mt-2">开始学习后，系统会自动记录你的学习时段偏好</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-gray-800">学习时段偏好</h3>
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
            <div className="w-3 h-3 bg-blue-100 rounded-sm"></div>
            <div className="w-3 h-3 bg-blue-300 rounded-sm"></div>
            <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
            <div className="w-3 h-3 bg-blue-700 rounded-sm"></div>
          </div>
          <span>多</span>
        </div>
      </div>

      {/* 24小时时段网格 */}
      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-2">
        {hours.map((hour) => {
          const val = data[hour] || 0;
          const colors = getColorClasses(val);
          return (
            <div
              key={hour}
              className={`aspect-square rounded-lg transition-all hover:scale-105 cursor-default flex flex-col items-center justify-center ${colors.bg}`}
              title={`${hour}:00 - ${hour}:59 (${getTimeLabel(hour)}) - 活跃度: ${val.toFixed(1)}`}
            >
              <span className={`text-xs font-mono font-medium ${colors.text}`}>{hour}</span>
              {val > 0 && (
                <span className={`text-[10px] mt-0.5 ${colors.subtext}`}>
                  {val.toFixed(0)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 时段分组汇总 */}
      <div className="mt-6 pt-4 border-t border-gray-100">
        <h4 className="text-sm font-medium text-gray-600 mb-3">时段汇总</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: '凌晨', range: [0, 6], Icon: Moon, color: 'text-indigo-500' },
            { label: '上午', range: [6, 12], Icon: SunHorizon, color: 'text-orange-400' },
            { label: '中午', range: [12, 14], Icon: Sun, color: 'text-yellow-500' },
            { label: '下午', range: [14, 18], Icon: CloudSun, color: 'text-amber-500' },
            { label: '晚上', range: [18, 22], Icon: SunDim, color: 'text-orange-600' },
            { label: '深夜', range: [22, 24], Icon: MoonStars, color: 'text-indigo-600' }
          ].map(({ label, range, Icon, color }) => {
            const sum = data.slice(range[0], range[1]).reduce((a, b) => a + b, 0);
            const intensity = sum / maxVal / (range[1] - range[0]);
            return (
              <div
                key={label}
                className={`p-3 rounded-lg text-center ${
                  intensity > 0.5 ? 'bg-blue-100' :
                  intensity > 0.2 ? 'bg-blue-50' : 'bg-gray-50'
                }`}
              >
                <Icon size={24} weight="duotone" className={`mx-auto ${color}`} />
                <p className="text-xs font-medium text-gray-700 mt-1">{label}</p>
                <p className="text-xs text-gray-500">{sum.toFixed(0)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
