import React, { memo } from 'react';
import { Warning } from '../../../components/Icon';
import { AlgorithmConfig } from '../../../types/models';

/**
 * 单词得分权重区块 Props
 */
export interface ScoreWeightsSectionProps {
  /** 当前单词得分权重配置 */
  weights: AlgorithmConfig['scoreWeights'];
  /** 默认单词得分权重配置 */
  defaultWeights: AlgorithmConfig['scoreWeights'];
  /** 配置变更回调 */
  onChange: (weights: AlgorithmConfig['scoreWeights']) => void;
}

/**
 * 单词得分权重区块
 * 配置单词综合得分计算的各维度权重（总和必须为 100%）
 */
export const ScoreWeightsSection = memo(function ScoreWeightsSection({
  weights,
  defaultWeights,
  onChange,
}: ScoreWeightsSectionProps) {
  const total = weights.accuracy + weights.speed + weights.stability + weights.proficiency;
  const isValid = Math.abs(total - 100) < 0.01;
  const isDefault = JSON.stringify(weights) === JSON.stringify(defaultWeights);

  const updateWeight = (key: keyof typeof weights, value: number) => {
    onChange({ ...weights, [key]: value });
  };

  return (
    <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">单词得分权重</h2>
        <p className="mt-1 text-sm text-gray-600">
          配置单词综合得分计算的各维度权重（总和必须为 100%）
          {!isDefault && <span className="ml-2 text-blue-600">（已修改）</span>}
        </p>
      </div>

      <div className="space-y-6">
        {/* 正确率权重 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">正确率权重</label>
            <span className="text-lg font-bold text-green-600">{weights.accuracy}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={weights.accuracy}
            onChange={(e) => updateWeight('accuracy', parseInt(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-green-500"
          />
        </div>

        {/* 答题速度权重 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">答题速度权重</label>
            <span className="text-lg font-bold text-blue-600">{weights.speed}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={weights.speed}
            onChange={(e) => updateWeight('speed', parseInt(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-blue-500"
          />
        </div>

        {/* 稳定性权重 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">稳定性权重</label>
            <span className="text-lg font-bold text-purple-600">{weights.stability}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={weights.stability}
            onChange={(e) => updateWeight('stability', parseInt(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-purple-500"
          />
        </div>

        {/* 熟练度权重 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">熟练度权重</label>
            <span className="text-lg font-bold text-yellow-600">{weights.proficiency}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={weights.proficiency}
            onChange={(e) => updateWeight('proficiency', parseInt(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-yellow-500"
          />
        </div>
      </div>

      {/* 总和显示 */}
      <div className={`mt-4 rounded-lg p-3 ${isValid ? 'bg-green-50' : 'bg-red-50'}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">权重总和</span>
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

      <div className="mt-4 rounded-lg bg-gray-50 p-3">
        <p className="text-sm text-gray-600">
          <strong>默认值：</strong>
          正确率 {defaultWeights.accuracy}%、 速度 {defaultWeights.speed}%、 稳定性{' '}
          {defaultWeights.stability}%、 熟练度 {defaultWeights.proficiency}%
        </p>
      </div>
    </div>
  );
});
