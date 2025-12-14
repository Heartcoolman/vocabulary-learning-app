import React from 'react';

interface WeightSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  colorClass?: string;
}

/**
 * WeightSlider - 权重配置滑块组件
 */
export function WeightSlider({ label, value, onChange, colorClass = 'blue' }: WeightSliderProps) {
  const colorMap: Record<string, { text: string; bg: string; accent: string }> = {
    blue: { text: 'text-blue-600', bg: 'bg-blue-100', accent: 'accent-blue-500' },
    purple: { text: 'text-purple-600', bg: 'bg-purple-100', accent: 'accent-purple-500' },
    green: { text: 'text-green-600', bg: 'bg-green-100', accent: 'accent-green-500' },
  };

  const colors = colorMap[colorClass] || colorMap.blue;

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm font-semibold text-gray-700">{label}</label>
        <span className={`rounded-button px-3 py-1 text-sm font-bold ${colors.bg} ${colors.text}`}>
          {(value * 100).toFixed(0)}%
        </span>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 transition-all hover:shadow-elevated ${colors.accent}`}
      />
    </div>
  );
}

export default WeightSlider;
