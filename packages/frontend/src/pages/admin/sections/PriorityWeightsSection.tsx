import React, { memo } from 'react';
import { Warning } from '../../../components/Icon';
import { AlgorithmConfig } from '../../../types/models';

/**
 * 优先级权重区块 Props
 */
export interface PriorityWeightsSectionProps {
  /** 当前优先级权重配置 */
  weights: AlgorithmConfig['priorityWeights'];
  /** 默认优先级权重配置 */
  defaultWeights: AlgorithmConfig['priorityWeights'];
  /** 配置变更回调 */
  onChange: (weights: AlgorithmConfig['priorityWeights']) => void;
}

/**
 * 优先级权重区块
 * 配置学习队列优先级计算的各项权重（总和必须为 100%）
 */
export const PriorityWeightsSection = memo(function PriorityWeightsSection({
  weights,
  defaultWeights,
  onChange,
}: PriorityWeightsSectionProps) {
  const total = weights.newWord + weights.errorRate + weights.overdueTime + weights.wordScore;
  const isValid = Math.abs(total - 100) < 0.01;
  const isDefault = JSON.stringify(weights) === JSON.stringify(defaultWeights);

  const updateWeight = (key: keyof typeof weights, value: number) => {
    onChange({ ...weights, [key]: value });
  };

  return (
    <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">优先级权重</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          配置学习队列优先级计算的各项权重（总和必须为 100%）
          {!isDefault && <span className="ml-2 text-blue-600">（已修改）</span>}
        </p>
      </div>

      <div className="space-y-6">
        {/* 新单词权重 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              新单词权重
            </label>
            <span className="text-lg font-bold text-blue-600">{weights.newWord}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={weights.newWord}
            onChange={(e) => updateWeight('newWord', parseInt(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-button bg-gray-200 accent-blue-500 dark:bg-slate-700"
          />
        </div>

        {/* 错误率权重 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              错误率权重
            </label>
            <span className="text-lg font-bold text-red-600">{weights.errorRate}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={weights.errorRate}
            onChange={(e) => updateWeight('errorRate', parseInt(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-button bg-gray-200 accent-red-500 dark:bg-slate-700"
          />
        </div>

        {/* 逾期时间权重 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              逾期时间权重
            </label>
            <span className="text-lg font-bold text-yellow-600">{weights.overdueTime}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={weights.overdueTime}
            onChange={(e) => updateWeight('overdueTime', parseInt(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-button bg-gray-200 accent-yellow-500 dark:bg-slate-700"
          />
        </div>

        {/* 单词得分权重 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              单词得分权重
            </label>
            <span className="text-lg font-bold text-purple-600">{weights.wordScore}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={weights.wordScore}
            onChange={(e) => updateWeight('wordScore', parseInt(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-button bg-gray-200 accent-purple-500 dark:bg-slate-700"
          />
        </div>
      </div>

      {/* 总和显示 */}
      <div
        className={`mt-4 rounded-button p-3 ${isValid ? 'bg-green-50 dark:bg-green-900/30' : 'bg-red-50 dark:bg-red-900/30'}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">权重总和</span>
          <span className={`text-lg font-bold ${isValid ? 'text-green-600' : 'text-red-600'}`}>
            {total.toFixed(1)}%
          </span>
        </div>
        {!isValid && (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
            <Warning size={12} weight="bold" /> 权重总和必须等于 100%
          </p>
        )}
      </div>

      <div className="mt-4 rounded-button bg-gray-50 p-3 dark:bg-slate-900">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <strong>默认值：</strong>
          新单词 {defaultWeights.newWord}%、 错误率 {defaultWeights.errorRate}%、 逾期时间{' '}
          {defaultWeights.overdueTime}%、 单词得分 {defaultWeights.wordScore}%
        </p>
      </div>
    </div>
  );
});
