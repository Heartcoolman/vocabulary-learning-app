import React from 'react';
import { LearningObjectives, LearningObjectiveMode } from '../../types/learning-objectives';
import { Gear } from '../Icon';

interface ConfigDisplayProps {
  objectives: LearningObjectives;
  modeLabel: string;
}

interface WeightBarProps {
  name: string;
  weight: number;
  colorClass: string;
}

function WeightBar({ name, weight, colorClass }: WeightBarProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-sm font-medium text-gray-700 dark:text-slate-300">{name}</span>
      <div className="h-2 flex-1 rounded-full bg-gray-200 dark:bg-slate-700">
        <div
          className={`h-2 rounded-full transition-all duration-g3-slow ${colorClass}`}
          style={{ width: `${weight * 100}%` }}
        />
      </div>
      <span className="w-12 text-right text-sm font-semibold text-gray-600 dark:text-slate-400">
        {(weight * 100).toFixed(0)}%
      </span>
    </div>
  );
}

/**
 * ConfigDisplay - 当前配置展示组件
 */
export function ConfigDisplay({ objectives, modeLabel }: ConfigDisplayProps) {
  const weights = [
    { name: '短期记忆', weight: objectives.weightShortTerm, colorClass: 'bg-blue-500' },
    { name: '长期记忆', weight: objectives.weightLongTerm, colorClass: 'bg-purple-500' },
    { name: '学习效率', weight: objectives.weightEfficiency, colorClass: 'bg-green-500' },
  ];

  return (
    <section className="rounded-card border border-gray-100 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-6 flex items-center gap-3 text-xl font-bold text-gray-900 dark:text-white">
        <Gear size={24} className="text-blue-500" />
        当前配置
      </h2>

      <div className="space-y-4">
        <div className="rounded-button bg-gray-50 p-4 dark:bg-slate-700">
          <p className="text-sm text-gray-600 dark:text-slate-400">学习模式</p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{modeLabel}</p>
        </div>

        <div className="rounded-button bg-gray-50 p-4 dark:bg-slate-700">
          <p className="text-sm text-gray-600 dark:text-slate-400">主要目标</p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
            {objectives.primaryObjective === 'accuracy' && '准确率'}
            {objectives.primaryObjective === 'retention' && '记忆保持'}
            {objectives.primaryObjective === 'efficiency' && '学习效率'}
          </p>
        </div>

        <div className="rounded-button bg-gray-50 p-4 dark:bg-slate-700">
          <p className="mb-3 text-sm text-gray-600 dark:text-slate-400">权重分布</p>
          <div className="space-y-3">
            {weights.map((item) => (
              <WeightBar key={item.name} {...item} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default ConfigDisplay;
