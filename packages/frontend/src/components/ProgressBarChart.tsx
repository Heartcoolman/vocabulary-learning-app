import React from 'react';

export interface ProgressBarData {
  label: string;
  value: number;
  maxValue: number;
  color?: string;
}

interface ProgressBarChartProps {
  data: ProgressBarData[];
  height?: number;
}

const ProgressBarChart: React.FC<ProgressBarChartProps> = ({ data, height = 40 }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <p>暂无数据</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" role="list" aria-label="掌握度进度图表">
      {data.map((item, index) => {
        const percentage = item.maxValue > 0 ? (item.value / item.maxValue) * 100 : 0;
        const clampedPercentage = Math.min(Math.max(percentage, 0), 100);
        const barColor = item.color || 'bg-blue-500';

        return (
          <div key={index} className="flex items-center gap-3" role="listitem">
            <div className="w-24 flex-shrink-0 text-sm font-medium text-gray-700 truncate" title={item.label}>
              {item.label}
            </div>

            <div className="flex-1 relative">
              <div
                className="w-full bg-gray-200 rounded-full overflow-hidden"
                style={{ height: `${height}px` }}
                role="progressbar"
                aria-valuenow={clampedPercentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${item.label}: ${clampedPercentage.toFixed(0)}%`}
              >
                <div
                  className={`h-full ${barColor} transition-all duration-500 ease-out rounded-full`}
                  style={{ width: `${clampedPercentage}%` }}
                />
              </div>
            </div>

            <div className="w-12 flex-shrink-0 text-sm font-semibold text-gray-600 text-right">
              {clampedPercentage.toFixed(0)}%
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ProgressBarChart;
