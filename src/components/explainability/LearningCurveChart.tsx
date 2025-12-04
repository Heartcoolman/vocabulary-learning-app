import React from 'react';
import { LearningCurvePoint } from '../../types/explainability';

interface LearningCurveChartProps {
  data: LearningCurvePoint[];
}

const LearningCurveChart: React.FC<LearningCurveChartProps> = ({ data }) => {
  const height = 250;
  const width = 500; // ViewBox width
  const padding = 40;

  if (data.length === 0) return <div className="text-center py-10 text-gray-400">暂无数据</div>;

  const maxMastery = Math.max(...data.map(d => d.masteredCount || d.mastery || 0), 10);
  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((d.masteredCount || d.mastery || 0) / maxMastery) * (height - padding * 2);
    return { x, y, ...d };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
  const areaPathD = `${pathD} L ${points[points.length-1].x},${height-padding} L ${points[0].x},${height-padding} Z`;

  return (
    <div className="w-full animate-fade-in">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">最近30天学习曲线</h3>
      <div className="w-full aspect-[2/1] bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-2 shadow-sm">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.3"/>
              <stop offset="100%" stopColor="#818cf8" stopOpacity="0"/>
            </linearGradient>
          </defs>

          {/* Axes */}
          <line x1={padding} y1={height-padding} x2={width-padding} y2={height-padding} stroke="#e5e7eb" strokeWidth="1" />
          <line x1={padding} y1={padding} x2={padding} y2={height-padding} stroke="#e5e7eb" strokeWidth="1" />

          {/* Area */}
          <path d={areaPathD} fill="url(#curveGradient)" />

          {/* Line */}
          <path d={pathD} fill="none" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {/* Points */}
          {points.map((p, i) => (
            <g key={i} className="group">
              <circle
                cx={p.x}
                cy={p.y}
                r="4"
                fill="#fff"
                stroke="#6366f1"
                strokeWidth="2"
                className="transition-all group-hover:r-6"
              />
              {/* Tooltip */}
              <g className="opacity-0 group-hover:opacity-100 transition-opacity">
                <rect x={p.x - 30} y={p.y - 45} width="60" height="35" rx="4" fill="#1f2937" />
                <text x={p.x} y={p.y - 22} textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">{p.masteredCount || p.mastery || 0}</text>
                <text x={p.x} y={p.y - 15} textAnchor="middle" fill="#9ca3af" fontSize="8">词</text>
              </g>
            </g>
          ))}

          {/* X-Axis Labels (Show roughly 5) */}
          {points.filter((_, i) => i % Math.ceil(data.length / 5) === 0).map((p, i) => (
             <text key={i} x={p.x} y={height-15} textAnchor="middle" fontSize="10" fill="#6b7280">
               {p.date.split('-').slice(1).join('/')}
             </text>
          ))}
        </svg>
      </div>
      <p className="text-center text-sm text-gray-500 mt-2">累计掌握单词数量趋势</p>
    </div>
  );
};

export default LearningCurveChart;
