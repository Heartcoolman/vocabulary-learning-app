import React from 'react';
import { LearningCurvePoint } from '../../types/explainability';
import { chartColors, iconColors } from '../../utils/iconColors';

interface LearningCurveChartProps {
  data: LearningCurvePoint[];
}

// 格式化日期为 MM/DD 格式
const formatDate = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      // 如果无法解析，尝试直接提取
      const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return `${match[2]}/${match[3]}`;
      }
      return dateStr;
    }
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}/${day}`;
  } catch {
    return dateStr;
  }
};

const LearningCurveChart: React.FC<LearningCurveChartProps> = React.memo(({ data }) => {
  const height = 250;
  const width = 500; // ViewBox width
  const padding = 40;

  if (data.length === 0) return <div className="py-10 text-center text-gray-400">暂无数据</div>;

  // 获取有效的 mastery 值（0-100 百分比）
  const getMasteryValue = (d: LearningCurvePoint): number => {
    const val = d.mastery ?? 0;
    // 确保值在合理范围内（0-100）
    return Math.max(0, Math.min(100, val));
  };

  const maxMastery = Math.max(...data.map(getMasteryValue), 10);
  const divisor = data.length > 1 ? data.length - 1 : 1; // 避免除以0
  const points = data.map((d, i) => {
    const masteryVal = getMasteryValue(d);
    const x = padding + (i / divisor) * (width - padding * 2);
    const y = height - padding - (masteryVal / maxMastery) * (height - padding * 2);
    return { x, y, masteryVal, ...d };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
  const areaPathD = `${pathD} L ${points[points.length - 1].x},${height - padding} L ${points[0].x},${height - padding} Z`;

  return (
    <div className="w-full animate-fade-in">
      <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white">最近30天学习曲线</h3>
      <div className="aspect-[2/1] w-full rounded-card border border-gray-100 bg-white p-2 shadow-soft dark:border-gray-700 dark:bg-gray-800">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.primary} stopOpacity="0.3" />
              <stop offset="100%" stopColor={chartColors.primary} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Axes */}
          <line
            x1={padding}
            y1={height - padding}
            x2={width - padding}
            y2={height - padding}
            stroke={chartColors.axis}
            strokeWidth="1"
          />
          <line
            x1={padding}
            y1={padding}
            x2={padding}
            y2={height - padding}
            stroke={chartColors.axis}
            strokeWidth="1"
          />

          {/* Area */}
          <path d={areaPathD} fill="url(#curveGradient)" />

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke={chartColors.primary}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Points */}
          {points.map((p, i) => (
            <g key={i} className="group">
              <circle
                cx={p.x}
                cy={p.y}
                r="4"
                fill={iconColors.white}
                stroke={chartColors.primary}
                strokeWidth="2"
                className="origin-center transition-transform group-hover:scale-150"
              />
              {/* Tooltip */}
              <g className="opacity-0 transition-opacity group-hover:opacity-100">
                <rect
                  x={p.x - 30}
                  y={p.y - 45}
                  width="60"
                  height="35"
                  rx="4"
                  fill={chartColors.text}
                />
                <text
                  x={p.x}
                  y={p.y - 22}
                  textAnchor="middle"
                  fill="white"
                  fontSize="12"
                  fontWeight="bold"
                >
                  {Math.round(p.masteryVal)}%
                </text>
                <text
                  x={p.x}
                  y={p.y - 15}
                  textAnchor="middle"
                  fill={chartColors.label}
                  fontSize="8"
                >
                  记忆强度
                </text>
              </g>
            </g>
          ))}

          {/* X-Axis Labels (Show roughly 5) */}
          {points
            .filter((_, i) => i % Math.max(1, Math.ceil(data.length / 5)) === 0)
            .map((p, i) => (
              <text
                key={i}
                x={p.x}
                y={height - 15}
                textAnchor="middle"
                fontSize="10"
                fill={iconColors.gray[500]}
              >
                {formatDate(p.date)}
              </text>
            ))}
        </svg>
      </div>
      <p className="mt-2 text-center text-sm text-gray-500">记忆强度变化趋势</p>
    </div>
  );
});

LearningCurveChart.displayName = 'LearningCurveChart';

export default LearningCurveChart;
