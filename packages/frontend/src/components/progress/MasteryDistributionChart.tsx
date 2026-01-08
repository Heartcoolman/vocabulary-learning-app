import { useState } from 'react';

interface MasteryLevel {
  level: number;
  count: number;
  percentage: number;
}

interface MasteryDistributionChartProps {
  distribution: MasteryLevel[];
}

const levelLabels = ['新词', '初识', '熟悉', '掌握', '精通', '母语'];
const levelColors = [
  {
    bg: 'bg-red-100 dark:bg-red-900/30',
    bar: 'bg-red-500',
    text: 'text-red-700 dark:text-red-400',
  },
  {
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    bar: 'bg-orange-500',
    text: 'text-orange-700 dark:text-orange-400',
  },
  {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    bar: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-400',
  },
  {
    bg: 'bg-lime-100 dark:bg-lime-900/30',
    bar: 'bg-lime-500',
    text: 'text-lime-700 dark:text-lime-400',
  },
  {
    bg: 'bg-green-100 dark:bg-green-900/30',
    bar: 'bg-green-500',
    text: 'text-green-700 dark:text-green-400',
  },
  {
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    bar: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
];

export const MasteryDistributionChart = ({ distribution }: MasteryDistributionChartProps) => {
  const [hoveredLevel, setHoveredLevel] = useState<number | null>(null);

  const maxCount = Math.max(...distribution.map((d) => d.count), 1);

  return (
    <div className="rounded-card border border-gray-100 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800">
      <h3 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">单词掌握度分布</h3>

      {/* 图表区域 */}
      <div className="mb-6 flex h-64 items-end justify-between gap-3">
        {distribution.map((item) => {
          const heightPercent = (item.count / maxCount) * 100;
          const colors = levelColors[item.level] || levelColors[0];
          const isHovered = hoveredLevel === item.level;

          return (
            <div
              key={item.level}
              className="group flex flex-1 cursor-pointer flex-col items-center gap-2"
              onMouseEnter={() => setHoveredLevel(item.level)}
              onMouseLeave={() => setHoveredLevel(null)}
            >
              <div className="relative flex w-full flex-col items-center">
                {/* 悬浮提示 */}
                {isHovered && (
                  <div className="absolute -top-16 z-10 whitespace-nowrap rounded-button bg-gray-900 px-3 py-2 text-xs text-white shadow-elevated dark:bg-slate-700">
                    <div className="font-semibold">{levelLabels[item.level]}</div>
                    <div className="text-gray-300 dark:text-gray-400">{item.count} 个单词</div>
                    <div className="text-gray-300 dark:text-gray-400">
                      {item.percentage.toFixed(1)}%
                    </div>
                    <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 transform bg-gray-900 dark:bg-slate-700"></div>
                  </div>
                )}

                {/* 条形 */}
                <div
                  className={`w-full rounded-t-lg transition-all duration-g3-normal ${colors.bar} ${
                    isHovered ? 'opacity-100 shadow-elevated' : 'opacity-80'
                  }`}
                  style={{
                    height: `${Math.max(4, heightPercent)}%`,
                    minHeight: item.count > 0 ? '8px' : '0',
                  }}
                />
              </div>

              {/* 标签 */}
              <div className="text-center">
                <div
                  className={`text-xs font-medium ${isHovered ? 'scale-110' : ''} transition-transform`}
                >
                  {levelLabels[item.level]}
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.count}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 图例和统计 */}
      <div className="border-t border-gray-100 pt-4 dark:border-slate-700">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {distribution.map((item) => {
            const colors = levelColors[item.level] || levelColors[0];
            return (
              <div
                key={item.level}
                className={`${colors.bg} flex items-center gap-2 rounded-button p-3 transition-shadow hover:shadow-soft`}
              >
                <div className={`h-3 w-3 ${colors.bar} rounded`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">
                    {levelLabels[item.level]}
                  </div>
                  <div className={`text-xs ${colors.text} font-semibold`}>
                    {item.percentage.toFixed(1)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
