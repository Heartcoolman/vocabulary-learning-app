import React from 'react';
import { AlgorithmWeights } from '../../types/explainability';

interface WeightRadarChartProps {
  weights: AlgorithmWeights;
}

const WeightRadarChart: React.FC<WeightRadarChartProps> = React.memo(({ weights }) => {
  // Config
  const size = 300;
  const center = size / 2;
  const radius = 100;

  // Data processing
  const data = [
    { key: 'Thompson', value: weights.thompson, label: 'Thompson' },
    { key: 'LinUCB', value: weights.linucb, label: 'LinUCB' },
    { key: 'ACT-R', value: weights.actr, label: 'ACT-R' },
    { key: 'Heuristic', value: weights.heuristic, label: 'Heuristic' },
  ];

  // Calculate points
  const totalPoints = data.length;
  const angleStep = (Math.PI * 2) / totalPoints;

  const getPoint = (index: number, value: number) => {
    const angle = index * angleStep - Math.PI / 2; // Start from top
    const r = value * radius;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y };
  };

  const polygonPoints = data
    .map((d, i) => {
      const p = getPoint(i, d.value);
      return `${p.x},${p.y}`;
    })
    .join(' ');

  // Axis lines
  const axisLines = data.map((_, i) => {
    const p = getPoint(i, 1.0);
    return (
      <line
        key={`axis-${i}`}
        x1={center}
        y1={center}
        x2={p.x}
        y2={p.y}
        stroke="#e5e7eb"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
    );
  });

  // Grid levels
  const gridLevels = [0.25, 0.5, 0.75, 1.0].map((level, idx) => {
    const points = data
      .map((_, i) => {
        const p = getPoint(i, level);
        return `${p.x},${p.y}`;
      })
      .join(' ');
    return (
      <polygon key={`grid-${idx}`} points={points} fill="none" stroke="#e5e7eb" strokeWidth="1" />
    );
  });

  return (
    <div className="flex animate-fade-in flex-col items-center justify-center py-6">
      <div className="relative">
        <svg width={size} height={size} className="overflow-visible">
          {/* Background Grid */}
          {gridLevels}
          {axisLines}

          {/* Data Polygon */}
          <polygon
            points={polygonPoints}
            fill="rgba(99, 102, 241, 0.2)"
            stroke="#6366f1"
            strokeWidth="2"
            className="transition-all duration-g3-slower ease-g3"
          />

          {/* Data Points */}
          {data.map((d, i) => {
            const p = getPoint(i, d.value);
            return (
              <g key={`point-${i}`}>
                <circle cx={p.x} cy={p.y} r="4" fill="#6366f1" stroke="white" strokeWidth="2" />
                {/* Labels */}
                <text
                  x={getPoint(i, 1.2).x}
                  y={getPoint(i, 1.2).y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-gray-600 text-xs font-medium dark:fill-gray-400"
                >
                  {d.label}
                </text>
                {/* Values */}
                <text
                  x={getPoint(i, 1.2).x}
                  y={getPoint(i, 1.2).y + 14}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-indigo-600 text-xs font-bold dark:fill-indigo-400"
                >
                  {d.value.toFixed(2)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-6 max-w-md text-center">
        <h4 className="mb-2 font-medium text-gray-900 dark:text-white">算法混合策略</h4>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          当前决策主要由
          <span className="mx-1 font-bold text-indigo-600 dark:text-indigo-400">
            {data.reduce((prev, current) => (prev.value > current.value ? prev : current)).label}
          </span>
          主导，结合其他模型进行平衡。
        </p>
      </div>
    </div>
  );
});

WeightRadarChart.displayName = 'WeightRadarChart';

export default WeightRadarChart;
