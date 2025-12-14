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
      <span className="w-20 text-sm font-medium text-gray-700">{name}</span>
      <div className="h-2 flex-1 rounded-full bg-gray-200">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${colorClass}`}
          style={{ width: `${weight * 100}%` }}
        />
      </div>
      <span className="w-12 text-right text-sm font-semibold text-gray-600">
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
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="mb-6 flex items-center gap-3 text-xl font-bold text-gray-900">
        <Gear size={24} weight="duotone" className="text-blue-500" />
        当前配置
      </h2>

      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 p-4">
          <p className="text-sm text-gray-600">学习模式</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{modeLabel}</p>
        </div>

        <div className="rounded-lg bg-gray-50 p-4">
          <p className="text-sm text-gray-600">主要目标</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {objectives.primaryObjective === 'accuracy' && '准确率'}
            {objectives.primaryObjective === 'retention' && '记忆保持'}
            {objectives.primaryObjective === 'efficiency' && '学习效率'}
          </p>
        </div>

        <div className="rounded-lg bg-gray-50 p-4">
          <p className="mb-3 text-sm text-gray-600">权重分布</p>
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
