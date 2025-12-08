import React, { memo } from 'react';
import { AlgorithmConfig } from '../../../types/models';

/**
 * 掌握程度阈值区块 Props
 */
export interface MasteryThresholdsSectionProps {
  /** 当前掌握程度阈值配置 */
  thresholds: AlgorithmConfig['masteryThresholds'];
  /** 默认掌握程度阈值配置 */
  defaultThresholds: AlgorithmConfig['masteryThresholds'];
  /** 配置变更回调 */
  onChange: (thresholds: AlgorithmConfig['masteryThresholds']) => void;
}

/**
 * 掌握程度阈值区块
 * 配置各级别的晋升条件（1-5级）
 */
export const MasteryThresholdsSection = memo(function MasteryThresholdsSection({
  thresholds,
  defaultThresholds,
  onChange,
}: MasteryThresholdsSectionProps) {
  // 防御性检查：确保 thresholds 是数组
  const safeThresholds = Array.isArray(thresholds)
    ? thresholds
    : Array.isArray(defaultThresholds)
      ? defaultThresholds
      : [];
  const safeDefaultThresholds = Array.isArray(defaultThresholds) ? defaultThresholds : [];

  const isDefault = JSON.stringify(safeThresholds) === JSON.stringify(safeDefaultThresholds);

  const updateThreshold = (
    level: number,
    field: keyof (typeof safeThresholds)[0],
    value: number,
  ) => {
    const newThresholds = safeThresholds.map((t) =>
      t.level === level ? { ...t, [field]: value } : t,
    );
    onChange(newThresholds);
  };

  return (
    <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">掌握程度阈值</h2>
        <p className="mt-1 text-sm text-gray-600">
          配置各级别的晋升条件（1-5级）
          {!isDefault && <span className="ml-2 text-blue-600">（已修改）</span>}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">级别</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                连续答对次数
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                最低正确率
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">最低得分</th>
            </tr>
          </thead>
          <tbody>
            {safeThresholds.map((threshold) => (
              <tr key={threshold.level} className="border-b border-gray-100">
                <td className="px-4 py-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-600">
                    {threshold.level}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    min="1"
                    value={threshold.requiredCorrectStreak}
                    onChange={(e) =>
                      updateThreshold(
                        threshold.level,
                        'requiredCorrectStreak',
                        parseInt(e.target.value) || 1,
                      )
                    }
                    className="w-24 rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-600">次</span>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={threshold.minAccuracy}
                    onChange={(e) =>
                      updateThreshold(
                        threshold.level,
                        'minAccuracy',
                        parseFloat(e.target.value) || 0,
                      )
                    }
                    className="w-24 rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-600">
                    ({(threshold.minAccuracy * 100).toFixed(0)}%)
                  </span>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={threshold.minScore}
                    onChange={(e) =>
                      updateThreshold(threshold.level, 'minScore', parseInt(e.target.value) || 0)
                    }
                    className="w-24 rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-600">分</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-lg bg-gray-50 p-3">
        <p className="text-sm text-gray-600">
          <strong>说明：</strong>单词需要同时满足所有条件才能晋升到对应级别
        </p>
      </div>
    </div>
  );
});
