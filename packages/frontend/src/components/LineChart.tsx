import React, { useState, useRef, useEffect, useCallback } from 'react';

export interface LineChartData {
  date: string;
  value: number;
}

interface LineChartProps {
  data: LineChartData[];
  title?: string;
  yAxisLabel?: string;
  height?: number;
}

const LineChart: React.FC<LineChartProps> = ({ data, title, yAxisLabel, height = 300 }) => {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height });
  const containerRef = useRef<HTMLDivElement>(null);

  // 使用debounce优化resize事件处理，避免频繁重渲染
  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const width = containerRef.current.offsetWidth;
      setDimensions({ width, height });
    }
  }, [height]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const debouncedUpdateDimensions = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        updateDimensions();
      }, 150); // 150ms debounce延迟
    };

    // 初始化时立即更新尺寸
    updateDimensions();

    window.addEventListener('resize', debouncedUpdateDimensions);
    return () => {
      window.removeEventListener('resize', debouncedUpdateDimensions);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [updateDimensions]);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <p>暂无数据</p>
      </div>
    );
  }

  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = dimensions.width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const values = data.map((d) => d.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1;

  const xStep = chartWidth / Math.max(data.length - 1, 1);

  const points = data.map((point, index) => {
    const x = padding.left + index * xStep;
    const y = padding.top + chartHeight - ((point.value - minValue) / valueRange) * chartHeight;
    return { x, y, data: point };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks }, (_, i) => {
    return minValue + (valueRange / (yTicks - 1)) * i;
  });

  const xTickInterval = Math.max(1, Math.floor(data.length / 8));

  return (
    <div ref={containerRef} className="w-full">
      {title && <h3 className="mb-4 text-lg font-semibold text-gray-800">{title}</h3>}

      <svg
        width={dimensions.width}
        height={height}
        className="overflow-visible"
        role="img"
        aria-label={`折线图${title ? `: ${title}` : ''}`}
      >
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {yAxisLabel && (
          <text
            x={15}
            y={padding.top + chartHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90, 15, ${padding.top + chartHeight / 2})`}
            className="fill-gray-600 text-xs"
          >
            {yAxisLabel}
          </text>
        )}

        {yTickValues.map((value, i) => {
          const y = padding.top + chartHeight - (i / (yTicks - 1)) * chartHeight;
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + chartWidth}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                className="fill-gray-500 text-xs"
              >
                {value.toFixed(0)}
              </text>
            </g>
          );
        })}

        <polygon
          points={`${padding.left},${padding.top + chartHeight} ${points.map((p) => `${p.x},${p.y}`).join(' ')} ${padding.left + chartWidth},${padding.top + chartHeight}`}
          fill="url(#lineGradient)"
        />

        <path
          d={pathD}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((point, index) => (
          <g key={index}>
            <circle
              cx={point.x}
              cy={point.y}
              r={hoveredPoint === index ? 6 : 4}
              fill="#3b82f6"
              stroke="white"
              strokeWidth="2"
              className="cursor-pointer transition-all duration-200"
              onMouseEnter={() => setHoveredPoint(index)}
              onMouseLeave={() => setHoveredPoint(null)}
            />
            {hoveredPoint === index && (
              <>
                <rect
                  x={point.x - 40}
                  y={point.y - 40}
                  width="80"
                  height="30"
                  rx="4"
                  fill="#1f2937"
                  opacity="0.9"
                />
                <text
                  x={point.x}
                  y={point.y - 30}
                  textAnchor="middle"
                  className="fill-white text-xs font-medium"
                >
                  {point.data.date}
                </text>
                <text
                  x={point.x}
                  y={point.y - 18}
                  textAnchor="middle"
                  className="fill-white text-xs font-semibold"
                >
                  {point.data.value.toFixed(1)}
                </text>
              </>
            )}
          </g>
        ))}

        {data
          .filter((_, i) => i % xTickInterval === 0 || i === data.length - 1)
          .map((point, i, filtered) => {
            const originalIndex = data.indexOf(point);
            const x = padding.left + originalIndex * xStep;
            return (
              <text
                key={originalIndex}
                x={x}
                y={padding.top + chartHeight + 20}
                textAnchor={i === 0 ? 'start' : i === filtered.length - 1 ? 'end' : 'middle'}
                className="fill-gray-600 text-xs"
              >
                {point.date}
              </text>
            );
          })}
      </svg>
    </div>
  );
};

export default LineChart;
