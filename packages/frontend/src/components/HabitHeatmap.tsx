import React, { useMemo } from 'react';

interface HabitHeatmapProps {
  timePref: number[];
}

const HabitHeatmap: React.FC<HabitHeatmapProps> = ({ timePref }) => {
  const hasData = timePref && timePref.length > 0;

  const maxValue = useMemo(() => {
    if (!hasData) return 1;
    return Math.max(...timePref, 1);
  }, [timePref, hasData]);

  const groupedHours = useMemo(() => {
    if (!hasData) return [];
    const groups = [];
    for (let i = 0; i < 24; i += 3) {
      const segment = timePref.slice(i, i + 3);
      const avgValue = segment.reduce((sum, val) => sum + val, 0) / segment.length;
      groups.push({
        start: i,
        end: i + 2,
        value: avgValue,
        label: `${i}:00 - ${i + 2}:59`,
      });
    }
    return groups;
  }, [timePref, hasData]);

  const getColor = (value: number): string => {
    if (value === 0) return 'bg-gray-100 dark:bg-slate-800';
    const intensity = value / maxValue;
    if (intensity < 0.2) return 'bg-blue-100 dark:bg-blue-900/40';
    if (intensity < 0.4) return 'bg-blue-200 dark:bg-blue-800/50';
    if (intensity < 0.6) return 'bg-blue-300 dark:bg-blue-700/60';
    if (intensity < 0.8) return 'bg-blue-400 dark:bg-blue-600/70';
    return 'bg-blue-500 dark:bg-blue-500';
  };

  const getIntensityLabel = (value: number): string => {
    if (value === 0) return '无活动';
    const intensity = value / maxValue;
    if (intensity < 0.2) return '极少';
    if (intensity < 0.4) return '较少';
    if (intensity < 0.6) return '中等';
    if (intensity < 0.8) return '较多';
    return '频繁';
  };

  if (!hasData) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400 dark:text-gray-500">
        <p>暂无时间偏好数据</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          学习时间偏好 (24小时制)
        </h3>
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <span>低</span>
          <div className="flex gap-1">
            <div className="h-3 w-3 rounded bg-gray-100 dark:bg-slate-800"></div>
            <div className="h-3 w-3 rounded bg-blue-100 dark:bg-blue-900/40"></div>
            <div className="h-3 w-3 rounded bg-blue-200 dark:bg-blue-800/50"></div>
            <div className="h-3 w-3 rounded bg-blue-300 dark:bg-blue-700/60"></div>
            <div className="h-3 w-3 rounded bg-blue-400 dark:bg-blue-600/70"></div>
            <div className="h-3 w-3 rounded bg-blue-500 dark:bg-blue-500"></div>
          </div>
          <span>高</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {groupedHours.map((group) => (
          <div
            key={`group-${group.start}-${group.end}`}
            className="group relative"
            role="button"
            tabIndex={0}
            aria-label={`${group.label}: ${getIntensityLabel(group.value)}`}
          >
            <div
              className={`${getColor(group.value)} cursor-pointer rounded-button p-4 transition-all duration-g3-fast hover:scale-105 hover:shadow-elevated`}
            >
              <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                {group.label}
              </div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                {getIntensityLabel(group.value)}
              </div>
            </div>

            <div className="invisible absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 transform whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white group-hover:visible">
              活动频次: {(group.value * 100).toFixed(0)}%
              <div className="absolute left-1/2 top-full -translate-x-1/2 transform border-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-gray-200 pt-4 dark:border-slate-700">
        <h4 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
          详细时段统计
        </h4>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12">
          {timePref.map((value, hour) => (
            <div
              key={`hour-${hour}`}
              className="group relative"
              role="button"
              tabIndex={0}
              aria-label={`${hour}:00 - ${hour}:59: ${getIntensityLabel(value)}`}
            >
              <div
                className={`${getColor(value)} flex aspect-square cursor-pointer flex-col items-center justify-center rounded transition-all duration-g3-fast hover:scale-110 hover:shadow-elevated`}
              >
                <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">{hour}</div>
              </div>

              <div className="invisible absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 transform whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white group-hover:visible">
                {hour}:00 - {hour}:59
                <br />
                频次: {(value * 100).toFixed(0)}%
                <div className="absolute left-1/2 top-full -translate-x-1/2 transform border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HabitHeatmap;
