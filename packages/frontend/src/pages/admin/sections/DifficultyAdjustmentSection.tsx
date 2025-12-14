import React, { memo } from 'react';
import { AlgorithmConfig } from '../../../types/models';

/**
 * 难度调整参数区块 Props
 */
export interface DifficultyAdjustmentSectionProps {
  /** 连续答对阈值 */
  consecutiveCorrect: number;
  /** 连续答错阈值 */
  consecutiveWrong: number;
  /** 调整间隔 */
  adjustmentInterval: number;
  /** 默认连续答对阈值 */
  defaultConsecutiveCorrect: number;
  /** 默认连续答错阈值 */
  defaultConsecutiveWrong: number;
  /** 默认调整间隔 */
  defaultAdjustmentInterval: number;
  /** 配置变更回调 */
  onChange: (updates: Partial<AlgorithmConfig>) => void;
}

/**
 * 难度调整参数区块
 * 配置自适应难度调整的触发条件
 */
export const DifficultyAdjustmentSection = memo(function DifficultyAdjustmentSection({
  consecutiveCorrect,
  consecutiveWrong,
  adjustmentInterval,
  defaultConsecutiveCorrect,
  defaultConsecutiveWrong,
  defaultAdjustmentInterval,
  onChange,
}: DifficultyAdjustmentSectionProps) {
  const isDefault =
    consecutiveCorrect === defaultConsecutiveCorrect &&
    consecutiveWrong === defaultConsecutiveWrong &&
    adjustmentInterval === defaultAdjustmentInterval;

  return (
    <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">难度调整参数</h2>
        <p className="mt-1 text-sm text-gray-600">
          配置自适应难度调整的触发条件
          {!isDefault && <span className="ml-2 text-blue-600">（已修改）</span>}
        </p>
      </div>

      <div className="space-y-6">
        {/* 连续答对阈值 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">连续答对阈值（增加难度）</label>
            <span className="text-lg font-bold text-blue-600">{consecutiveCorrect} 次</span>
          </div>
          <input
            type="range"
            min="3"
            max="10"
            value={consecutiveCorrect}
            onChange={(e) => onChange({ consecutiveCorrectThreshold: parseInt(e.target.value) })}
            className="h-2 w-full cursor-pointer appearance-none rounded-button bg-gray-200 accent-blue-500"
          />
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>3 次</span>
            <span>10 次</span>
          </div>
          <p className="mt-2 text-xs text-gray-500">默认值：{defaultConsecutiveCorrect} 次</p>
        </div>

        {/* 连续答错阈值 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">连续答错阈值（降低难度）</label>
            <span className="text-lg font-bold text-red-600">{consecutiveWrong} 次</span>
          </div>
          <input
            type="range"
            min="2"
            max="5"
            value={consecutiveWrong}
            onChange={(e) => onChange({ consecutiveWrongThreshold: parseInt(e.target.value) })}
            className="h-2 w-full cursor-pointer appearance-none rounded-button bg-gray-200 accent-red-500"
          />
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>2 次</span>
            <span>5 次</span>
          </div>
          <p className="mt-2 text-xs text-gray-500">默认值：{defaultConsecutiveWrong} 次</p>
        </div>

        {/* 调整间隔 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">最小调整间隔</label>
            <span className="text-lg font-bold text-gray-900">{adjustmentInterval} 个会话</span>
          </div>
          <input
            type="number"
            min="1"
            value={adjustmentInterval}
            onChange={(e) =>
              onChange({ difficultyAdjustmentInterval: parseInt(e.target.value) || 1 })
            }
            className="w-full rounded-button border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-2 text-xs text-gray-500">默认值：{defaultAdjustmentInterval} 个会话</p>
        </div>
      </div>
    </div>
  );
});
