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
  { bg: 'bg-red-100', bar: 'bg-red-500', text: 'text-red-700' },
  { bg: 'bg-orange-100', bar: 'bg-orange-500', text: 'text-orange-700' },
  { bg: 'bg-amber-100', bar: 'bg-amber-500', text: 'text-amber-700' },
  { bg: 'bg-lime-100', bar: 'bg-lime-500', text: 'text-lime-700' },
  { bg: 'bg-green-100', bar: 'bg-green-500', text: 'text-green-700' },
  { bg: 'bg-emerald-100', bar: 'bg-emerald-500', text: 'text-emerald-700' },
];

export const MasteryDistributionChart = ({
  distribution,
}: MasteryDistributionChartProps) => {
  const [hoveredLevel, setHoveredLevel] = useState<number | null>(null);

  const maxCount = Math.max(...distribution.map(d => d.count), 1);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-xl font-bold text-gray-900 mb-6">单词掌握度分布</h3>

      {/* 图表区域 */}
      <div className="h-64 flex items-end justify-between gap-3 mb-6">
        {distribution.map((item) => {
          const heightPercent = (item.count / maxCount) * 100;
          const colors = levelColors[item.level] || levelColors[0];
          const isHovered = hoveredLevel === item.level;

          return (
            <div
              key={item.level}
              className="flex-1 flex flex-col items-center gap-2 group cursor-pointer"
              onMouseEnter={() => setHoveredLevel(item.level)}
              onMouseLeave={() => setHoveredLevel(null)}
            >
              <div className="relative w-full flex flex-col items-center">
                {/* 悬浮提示 */}
                {isHovered && (
                  <div className="absolute -top-16 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg z-10 whitespace-nowrap">
                    <div className="font-semibold">{levelLabels[item.level]}</div>
                    <div className="text-gray-300">{item.count} 个单词</div>
                    <div className="text-gray-300">{item.percentage.toFixed(1)}%</div>
                    <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
                  </div>
                )}

                {/* 条形 */}
                <div
                  className={`w-full rounded-t-lg transition-all duration-300 ${colors.bar} ${
                    isHovered ? 'opacity-100 shadow-lg' : 'opacity-80'
                  }`}
                  style={{
                    height: `${Math.max(4, heightPercent)}%`,
                    minHeight: item.count > 0 ? '8px' : '0',
                  }}
                />
              </div>

              {/* 标签 */}
              <div className="text-center">
                <div className={`text-xs font-medium ${isHovered ? 'scale-110' : ''} transition-transform`}>
                  {levelLabels[item.level]}
                </div>
                <div className="text-xs text-gray-500 mt-1">{item.count}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 图例和统计 */}
      <div className="border-t border-gray-100 pt-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {distribution.map((item) => {
            const colors = levelColors[item.level] || levelColors[0];
            return (
              <div
                key={item.level}
                className={`${colors.bg} rounded-lg p-3 flex items-center gap-2 hover:shadow-sm transition-shadow`}
              >
                <div className={`w-3 h-3 ${colors.bar} rounded`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-700 truncate">
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
