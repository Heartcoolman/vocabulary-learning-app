import React, { memo } from 'react';
import { Plus, Trash } from '../../../components/Icon';

/**
 * 遗忘曲线参数编辑区块 Props
 */
export interface ReviewIntervalsSectionProps {
  /** 当前复习间隔配置 */
  intervals: number[];
  /** 默认复习间隔配置 */
  defaultIntervals: number[];
  /** 配置变更回调 */
  onChange: (intervals: number[]) => void;
}

/**
 * 遗忘曲线参数编辑区块
 * 配置复习间隔序列（单位：天）
 */
export const ReviewIntervalsSection = memo(function ReviewIntervalsSection({
  intervals,
  defaultIntervals,
  onChange,
}: ReviewIntervalsSectionProps) {
  const addInterval = () => {
    const lastInterval = intervals[intervals.length - 1] || 0;
    onChange([...intervals, lastInterval + 7]);
  };

  const removeInterval = (index: number) => {
    if (intervals.length <= 1) {
      return;
    }
    onChange(intervals.filter((_, i) => i !== index));
  };

  const updateInterval = (index: number, value: number) => {
    const newIntervals = [...intervals];
    newIntervals[index] = value;
    onChange(newIntervals);
  };

  const isDefault = JSON.stringify(intervals) === JSON.stringify(defaultIntervals);

  return (
    <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">遗忘曲线参数</h2>
          <p className="mt-1 text-sm text-gray-600">
            配置复习间隔序列（单位：天）
            {!isDefault && <span className="ml-2 text-blue-600">（已修改）</span>}
          </p>
        </div>
        <button
          onClick={addInterval}
          className="flex items-center gap-1 rounded-lg bg-blue-50 px-4 py-2 text-blue-600 transition-all hover:bg-blue-100"
        >
          <Plus size={16} weight="bold" />
          添加间隔
        </button>
      </div>

      <div className="space-y-3">
        {intervals.map((interval, index) => (
          <div key={index} className="flex items-center gap-4">
            <span className="w-20 text-sm font-medium text-gray-700">第 {index + 1} 次</span>
            <input
              type="number"
              value={interval}
              onChange={(e) => updateInterval(index, parseInt(e.target.value) || 0)}
              min="1"
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            />
            <span className="w-12 text-sm text-gray-600">天后</span>
            {intervals.length > 1 && (
              <button
                onClick={() => removeInterval(index)}
                className="rounded-lg p-2 text-red-500 transition-all hover:bg-red-50"
              >
                <Trash size={18} weight="bold" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg bg-gray-50 p-3">
        <p className="text-sm text-gray-600">
          <strong>默认值：</strong>
          {defaultIntervals.join(', ')} 天
        </p>
      </div>
    </div>
  );
});
