/**
 * 难度范围双滑块组件
 *
 * 遵循 C10:
 * - 取值范围: [0.1, 1.0]
 * - 步长: 0.1
 * - 默认值: min=0.3, max=0.8
 * - 约束: min <= max 始终成立
 * - 标签映射: 0.1-0.3 (简单), 0.4-0.6 (适中), 0.7-1.0 (困难)
 */
import { memo, useCallback } from 'react';
import { getDifficultyLabel } from '../../stores/amasSettingsStore';

export interface DifficultyRangeSliderProps {
  min: number;
  max: number;
  onChange: (range: { min?: number; max?: number }) => void;
}

export const DifficultyRangeSlider = memo(function DifficultyRangeSlider({
  min,
  max,
  onChange,
}: DifficultyRangeSliderProps) {
  const handleMinChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newMin = parseFloat(e.target.value);
      onChange({ min: newMin });
    },
    [onChange],
  );

  const handleMaxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newMax = parseFloat(e.target.value);
      onChange({ max: newMax });
    },
    [onChange],
  );

  // 计算滑块位置百分比
  const minPercent = ((min - 0.1) / 0.9) * 100;
  const maxPercent = ((max - 0.1) / 0.9) * 100;

  return (
    <div className="space-y-4">
      {/* 双滑块轨道 */}
      <div className="relative mb-8 mt-6 h-2">
        {/* 背景轨道 */}
        <div className="absolute inset-0 rounded-full bg-gray-200 dark:bg-gray-700" />

        {/* 选中范围 */}
        <div
          className="absolute h-full rounded-full bg-blue-500"
          style={{
            left: `${minPercent}%`,
            width: `${maxPercent - minPercent}%`,
          }}
        />

        {/* Min 滑块 */}
        <input
          type="range"
          min="0.1"
          max="1.0"
          step="0.1"
          value={min}
          onChange={handleMinChange}
          className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-blue-500 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-soft [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-500 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-soft [&::-webkit-slider-thumb]:active:cursor-grabbing"
          style={{ zIndex: min === max ? 2 : 1 }}
        />

        {/* Max 滑块 */}
        <input
          type="range"
          min="0.1"
          max="1.0"
          step="0.1"
          value={max}
          onChange={handleMaxChange}
          className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-blue-500 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-soft [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-500 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-soft [&::-webkit-slider-thumb]:active:cursor-grabbing"
          style={{ zIndex: 2 }}
        />

        {/* 刻度标签 */}
        <div className="absolute -bottom-6 left-0 right-0 flex justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>0.1</span>
          <span>0.5</span>
          <span>1.0</span>
        </div>
      </div>

      {/* 当前值显示 */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-center">
          <div className="text-sm text-gray-500 dark:text-gray-400">最低难度</div>
          <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{min.toFixed(1)}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500">{getDifficultyLabel(min)}</div>
        </div>
        <div className="flex flex-1 justify-center">
          <div className="h-0.5 w-8 bg-gray-300 dark:bg-gray-600" />
        </div>
        <div className="text-center">
          <div className="text-sm text-gray-500 dark:text-gray-400">最高难度</div>
          <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{max.toFixed(1)}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500">{getDifficultyLabel(max)}</div>
        </div>
      </div>

      {/* 难度区间说明 */}
      <div className="flex justify-between border-t border-gray-100 pt-2 text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">
        <span>0.1-0.3: 简单</span>
        <span>0.4-0.6: 适中</span>
        <span>0.7-1.0: 困难</span>
      </div>
    </div>
  );
});
