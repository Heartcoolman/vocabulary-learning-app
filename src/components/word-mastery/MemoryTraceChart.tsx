import React from 'react';
import { ReviewTraceRecord } from '../../types/word-mastery';

interface MemoryTraceChartProps {
  trace: ReviewTraceRecord[];
}

export const MemoryTraceChart: React.FC<MemoryTraceChartProps> = ({ trace }) => {
  if (!trace || trace.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        暂无记忆轨迹数据
      </div>
    );
  }

  const width = 600;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const minTime = Math.min(...trace.map(t => new Date(t.timestamp).getTime()));
  const maxTime = Math.max(...trace.map(t => new Date(t.timestamp).getTime()));
  const timeRange = maxTime - minTime || 1;

  const points = trace.map(t => {
    const x = padding.left + ((new Date(t.timestamp).getTime() - minTime) / timeRange) * chartWidth;
    const y = padding.top + chartHeight - (t.isCorrect ? 1 : 0) * chartHeight;
    return { x, y, data: t };
  });

  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg width={width} height={height} className="mx-auto">
        {/* Grid lines */}
        {[0, 1].map(value => {
          const y = padding.top + chartHeight - value * chartHeight;
          return (
            <g key={value}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="#9ca3af"
              >
                {value === 1 ? '正确' : '错误'}
              </text>
            </g>
          );
        })}

        {/* Line */}
        <path
          d={pathData}
          fill="none"
          stroke="#8b5cf6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points */}
        {points.map((p, i) => {
          const isCorrect = p.data.isCorrect;
          return (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r="4"
                fill={isCorrect ? '#10b981' : '#ef4444'}
                stroke="white"
                strokeWidth="2"
                className="transition-transform origin-center hover:scale-150 cursor-pointer"
              >
                <title>
                  {formatDate(p.data.timestamp)}: {isCorrect ? '正确' : '错误'} ({p.data.responseTime.toFixed(1)}s)
                </title>
              </circle>
            </g>
          );
        })}

        {/* X-axis labels */}
        {points.filter((_, i) => i % Math.max(1, Math.ceil(points.length / 5)) === 0).map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={height - padding.bottom + 20}
            textAnchor="middle"
            fontSize="10"
            fill="#9ca3af"
          >
            {formatDate(p.data.timestamp)}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span>正确</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span>错误</span>
        </div>
      </div>
    </div>
  );
};
