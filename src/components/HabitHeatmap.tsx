import React, { useMemo } from 'react';

interface HabitHeatmapProps {
  timePref: number[];
}

const HabitHeatmap: React.FC<HabitHeatmapProps> = ({ timePref }) => {
  const maxValue = useMemo(() => {
    if (!timePref || timePref.length === 0) return 1;
    return Math.max(...timePref, 1);
  }, [timePref]);

  if (!timePref || timePref.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <p>暂无时间偏好数据</p>
      </div>
    );
  }

  const getColor = (value: number): string => {
    if (value === 0) return 'bg-gray-100';
    const intensity = value / maxValue;
    if (intensity < 0.2) return 'bg-blue-100';
    if (intensity < 0.4) return 'bg-blue-200';
    if (intensity < 0.6) return 'bg-blue-300';
    if (intensity < 0.8) return 'bg-blue-400';
    return 'bg-blue-500';
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

  const groupedHours = useMemo(() => {
    const groups = [];
    for (let i = 0; i < 24; i += 3) {
      const segment = timePref.slice(i, i + 3);
      const avgValue = segment.reduce((sum, val) => sum + val, 0) / segment.length;
      groups.push({
        start: i,
        end: i + 2,
        value: avgValue,
        label: `${i}:00 - ${i + 2}:59`
      });
    }
    return groups;
  }, [timePref]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">学习时间偏好 (24小时制)</h3>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span>低</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 bg-gray-100 rounded"></div>
            <div className="w-3 h-3 bg-blue-100 rounded"></div>
            <div className="w-3 h-3 bg-blue-200 rounded"></div>
            <div className="w-3 h-3 bg-blue-300 rounded"></div>
            <div className="w-3 h-3 bg-blue-400 rounded"></div>
            <div className="w-3 h-3 bg-blue-500 rounded"></div>
          </div>
          <span>高</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {groupedHours.map((group, index) => (
          <div
            key={index}
            className="relative group"
            role="button"
            tabIndex={0}
            aria-label={`${group.label}: ${getIntensityLabel(group.value)}`}
          >
            <div
              className={`${getColor(group.value)} rounded-lg p-4 transition-all duration-200 hover:scale-105 hover:shadow-md cursor-pointer`}
            >
              <div className="text-xs font-medium text-gray-700 mb-1">{group.label}</div>
              <div className="text-sm font-semibold text-gray-900">
                {getIntensityLabel(group.value)}
              </div>
            </div>

            <div className="absolute invisible group-hover:visible bg-gray-900 text-white text-xs rounded py-1 px-2 bottom-full left-1/2 transform -translate-x-1/2 mb-2 whitespace-nowrap z-10">
              活动频次: {group.value.toFixed(2)}
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">详细时段统计</h4>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
          {timePref.map((value, hour) => (
            <div
              key={hour}
              className="relative group"
              role="button"
              tabIndex={0}
              aria-label={`${hour}:00 - ${hour}:59: ${getIntensityLabel(value)}`}
            >
              <div
                className={`${getColor(value)} rounded aspect-square flex flex-col items-center justify-center transition-all duration-200 hover:scale-110 hover:shadow-md cursor-pointer`}
              >
                <div className="text-xs font-semibold text-gray-700">{hour}</div>
              </div>

              <div className="absolute invisible group-hover:visible bg-gray-900 text-white text-xs rounded py-1 px-2 bottom-full left-1/2 transform -translate-x-1/2 mb-2 whitespace-nowrap z-10">
                {hour}:00 - {hour}:59
                <br />
                频次: {value.toFixed(2)}
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HabitHeatmap;
