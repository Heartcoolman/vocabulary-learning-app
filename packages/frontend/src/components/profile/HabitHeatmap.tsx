import React, { useMemo } from 'react';
import { Info, Moon, SunHorizon, Sun, CloudSun, SunDim, MoonStars } from '@phosphor-icons/react';

interface HabitHeatmapProps {
  /** 24小时时段数据数组 */
  data?: number[];
  /** timePref 作为 data 的别名，向后兼容 */
  timePref?: number[];
  /** 是否显示卡片容器，默认 true */
  showCard?: boolean;
}

export const HabitHeatmap: React.FC<HabitHeatmapProps> = ({ data, timePref, showCard = true }) => {
  // 支持 timePref 作为 data 的别名，向后兼容
  const timeData = data ?? timePref ?? [];

  const hours = Array.from({ length: 24 }, (_, i) => i);

  // 检查是否有有效数据
  const hasData = timeData && timeData.length > 0 && timeData.some((v) => v > 0);

  // useMemo 性能优化：计算最大值
  const maxVal = useMemo(() => {
    if (!hasData) return 1;
    return Math.max(...timeData, 1);
  }, [timeData, hasData]);

  const getColorClasses = (value: number) => {
    if (value === 0) return { bg: 'bg-gray-50', text: 'text-gray-500', subtext: 'text-gray-400' };
    const intensity = value / maxVal;
    if (intensity < 0.25)
      return { bg: 'bg-blue-100', text: 'text-blue-700', subtext: 'text-blue-600' };
    if (intensity < 0.5)
      return { bg: 'bg-blue-300', text: 'text-blue-800', subtext: 'text-blue-700' };
    if (intensity < 0.75)
      return { bg: 'bg-blue-500', text: 'text-white', subtext: 'text-blue-100' };
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

  // useMemo 性能优化：时段分组汇总数据
  const timeGroupData = useMemo(() => {
    return [
      { label: '凌晨', range: [0, 6], Icon: Moon, color: 'text-indigo-500' },
      { label: '上午', range: [6, 12], Icon: SunHorizon, color: 'text-orange-400' },
      { label: '中午', range: [12, 14], Icon: Sun, color: 'text-yellow-500' },
      { label: '下午', range: [14, 18], Icon: CloudSun, color: 'text-amber-500' },
      { label: '晚上', range: [18, 22], Icon: SunDim, color: 'text-orange-600' },
      { label: '深夜', range: [22, 24], Icon: MoonStars, color: 'text-indigo-600' },
    ].map(({ label, range, Icon, color }) => {
      const sum = timeData.slice(range[0], range[1]).reduce((a, b) => a + b, 0);
      const intensity = sum / maxVal / (range[1] - range[0]);
      return { label, range, Icon, color, sum, intensity };
    });
  }, [timeData, maxVal]);

  // 无数据时的空状态
  const emptyContent = (
    <div className="py-8 text-center text-gray-400">
      <p>暂无学习时段数据</p>
      <p className="mt-2 text-sm">开始学习后，系统会自动记录你的学习时段偏好</p>
    </div>
  );

  if (!hasData) {
    if (!showCard) {
      return (
        <>
          <div className="mb-6 flex items-center gap-2">
            <h3 className="text-lg font-bold text-gray-800">学习时段热力图</h3>
          </div>
          {emptyContent}
        </>
      );
    }
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <h3 className="text-lg font-bold text-gray-800">学习时段热力图</h3>
        </div>
        {emptyContent}
      </div>
    );
  }

  // 主内容渲染
  const mainContent = (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-gray-800">学习时段偏好</h3>
          <div className="group relative">
            <Info size={18} className="cursor-help text-gray-400" />
            <div className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 w-48 -translate-y-1/2 rounded bg-gray-800 p-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              颜色越深代表该时段的学习频率越高
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>少</span>
          <div className="flex gap-1">
            <div className="h-3 w-3 rounded-sm border border-gray-100 bg-gray-50"></div>
            <div className="h-3 w-3 rounded-sm bg-blue-100"></div>
            <div className="h-3 w-3 rounded-sm bg-blue-300"></div>
            <div className="h-3 w-3 rounded-sm bg-blue-500"></div>
            <div className="h-3 w-3 rounded-sm bg-blue-700"></div>
          </div>
          <span>多</span>
        </div>
      </div>

      {/* 24小时时段网格 */}
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-12">
        {hours.map((hour) => {
          const val = timeData[hour] || 0;
          const colors = getColorClasses(val);
          return (
            <div
              key={hour}
              role="button"
              tabIndex={0}
              aria-label={`${hour}:00 - ${hour}:59 (${getTimeLabel(hour)}) - 活跃度: ${val.toFixed(1)}`}
              className={`flex aspect-square cursor-default flex-col items-center justify-center rounded-lg transition-all hover:scale-105 ${colors.bg}`}
              title={`${hour}:00 - ${hour}:59 (${getTimeLabel(hour)}) - 活跃度: ${val.toFixed(1)}`}
            >
              <span className={`font-mono text-xs font-medium ${colors.text}`}>{hour}</span>
              {val > 0 && (
                <span className={`mt-0.5 text-[10px] ${colors.subtext}`}>{val.toFixed(0)}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* 时段分组汇总 */}
      <div className="mt-6 border-t border-gray-100 pt-4">
        <h4 className="mb-3 text-sm font-medium text-gray-600">时段汇总</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {timeGroupData.map(({ label, Icon, color, sum, intensity }) => (
            <div
              key={label}
              role="button"
              tabIndex={0}
              aria-label={`${label}时段 - 活跃度: ${sum.toFixed(1)}`}
              className={`rounded-lg p-3 text-center ${
                intensity > 0.5 ? 'bg-blue-100' : intensity > 0.2 ? 'bg-blue-50' : 'bg-gray-50'
              }`}
            >
              <Icon size={24} weight="duotone" className={`mx-auto ${color}`} />
              <p className="mt-1 text-xs font-medium text-gray-700">{label}</p>
              <p className="text-xs text-gray-500">{sum.toFixed(0)}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );

  // 根据 showCard 决定是否包裹卡片容器
  if (!showCard) {
    return mainContent;
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">{mainContent}</div>
  );
};

// 默认导出，向后兼容
export default HabitHeatmap;
