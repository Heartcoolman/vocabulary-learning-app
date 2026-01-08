import React, { memo } from 'react';
import { AlgorithmConfig } from '../../../types/models';

/**
 * 答题速度评分标准区块 Props
 */
export interface SpeedThresholdsSectionProps {
  /** 当前答题速度阈值配置 */
  thresholds: AlgorithmConfig['speedThresholds'];
  /** 默认答题速度阈值配置 */
  defaultThresholds: AlgorithmConfig['speedThresholds'];
  /** 配置变更回调 */
  onChange: (thresholds: AlgorithmConfig['speedThresholds']) => void;
}

/**
 * 答题速度评分标准区块
 * 配置不同速度等级的时间阈值（单位：毫秒）
 */
export const SpeedThresholdsSection = memo(function SpeedThresholdsSection({
  thresholds,
  defaultThresholds,
  onChange,
}: SpeedThresholdsSectionProps) {
  const isDefault = JSON.stringify(thresholds) === JSON.stringify(defaultThresholds);

  const updateThreshold = (key: keyof typeof thresholds, value: number) => {
    onChange({ ...thresholds, [key]: value });
  };

  return (
    <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">答题速度评分标准</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          配置不同速度等级的时间阈值（单位：毫秒）
          {!isDefault && <span className="ml-2 text-blue-600">（已修改）</span>}
        </p>
      </div>

      <div className="space-y-4">
        {/* 优秀 */}
        <div className="flex items-center gap-4">
          <div className="w-24 flex-shrink-0">
            <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
              优秀
            </span>
          </div>
          <span className="w-12 text-sm text-gray-600 dark:text-gray-400">&lt;</span>
          <input
            type="number"
            value={thresholds.excellent}
            onChange={(e) => updateThreshold('excellent', parseInt(e.target.value) || 0)}
            min="0"
            step="100"
            className="flex-1 rounded-button border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <span className="w-16 text-sm text-gray-600 dark:text-gray-400">毫秒</span>
          <span className="w-24 text-sm text-gray-500 dark:text-gray-400">
            ({(thresholds.excellent / 1000).toFixed(1)} 秒)
          </span>
        </div>

        {/* 良好 */}
        <div className="flex items-center gap-4">
          <div className="w-24 flex-shrink-0">
            <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
              良好
            </span>
          </div>
          <span className="w-12 text-sm text-gray-600 dark:text-gray-400">&lt;</span>
          <input
            type="number"
            value={thresholds.good}
            onChange={(e) => updateThreshold('good', parseInt(e.target.value) || 0)}
            min="0"
            step="100"
            className="flex-1 rounded-button border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <span className="w-16 text-sm text-gray-600 dark:text-gray-400">毫秒</span>
          <span className="w-24 text-sm text-gray-500 dark:text-gray-400">
            ({(thresholds.good / 1000).toFixed(1)} 秒)
          </span>
        </div>

        {/* 一般 */}
        <div className="flex items-center gap-4">
          <div className="w-24 flex-shrink-0">
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-700">
              一般
            </span>
          </div>
          <span className="w-12 text-sm text-gray-600 dark:text-gray-400">&lt;</span>
          <input
            type="number"
            value={thresholds.average}
            onChange={(e) => updateThreshold('average', parseInt(e.target.value) || 0)}
            min="0"
            step="100"
            className="flex-1 rounded-button border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <span className="w-16 text-sm text-gray-600 dark:text-gray-400">毫秒</span>
          <span className="w-24 text-sm text-gray-500 dark:text-gray-400">
            ({(thresholds.average / 1000).toFixed(1)} 秒)
          </span>
        </div>

        {/* 较慢 */}
        <div className="flex items-center gap-4">
          <div className="w-24 flex-shrink-0">
            <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
              较慢
            </span>
          </div>
          <span className="w-12 text-sm text-gray-600 dark:text-gray-400">≥</span>
          <input
            type="number"
            value={thresholds.slow}
            onChange={(e) => updateThreshold('slow', parseInt(e.target.value) || 0)}
            min="0"
            step="100"
            className="flex-1 rounded-button border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <span className="w-16 text-sm text-gray-600 dark:text-gray-400">毫秒</span>
          <span className="w-24 text-sm text-gray-500 dark:text-gray-400">
            ({(thresholds.slow / 1000).toFixed(1)} 秒)
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-button bg-gray-50 p-3 dark:bg-slate-900">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <strong>默认值：</strong>
          优秀 &lt; {defaultThresholds.excellent}ms、 良好 &lt; {defaultThresholds.good}ms、 一般
          &lt; {defaultThresholds.average}ms、 较慢 ≥ {defaultThresholds.slow}ms
        </p>
      </div>
    </div>
  );
});
