/**
 * 状态变化原因组件
 *
 * 遵循 C12:
 * - 显示触发: 仅重要状态变化时（疲劳突变、难度调整）
 * - 因素数量: 显示全部 factors
 * - 可视化: 横向条形图，宽度按 percentage 比例
 */
import { memo } from 'react';
import type { DecisionFactor } from '../../types/explainability';

export interface StateChangeReasonProps {
  factors: DecisionFactor[];
  title?: string;
  showExplanation?: boolean;
}

const factorColors: Record<string, string> = {
  attention: 'bg-blue-500',
  fatigue: 'bg-orange-500',
  motivation: 'bg-purple-500',
  memory: 'bg-green-500',
  speed: 'bg-cyan-500',
  accuracy: 'bg-emerald-500',
  frequency: 'bg-blue-500',
  difficulty: 'bg-pink-500',
  default: 'bg-gray-500',
};

function getFactorColor(name: string): string {
  const lowerName = name.toLowerCase();
  for (const [key, color] of Object.entries(factorColors)) {
    if (lowerName.includes(key)) {
      return color;
    }
  }
  return factorColors.default;
}

export const StateChangeReason = memo(function StateChangeReason({
  factors,
  title = '影响因素',
  showExplanation = true,
}: StateChangeReasonProps) {
  if (!factors || factors.length === 0) {
    return null;
  }

  // 按权重排序
  const sortedFactors = [...factors].sort((a, b) => b.weight - a.weight);
  const maxWeight = Math.max(...sortedFactors.map((f) => f.weight), 0.01);

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400">{title}</h4>

      <div className="space-y-2">
        {sortedFactors.map((factor, index) => {
          const widthPercent = (factor.weight / maxWeight) * 100;
          const color = getFactorColor(factor.name);

          return (
            <div key={index} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-700 dark:text-gray-300">{factor.name}</span>
                <span className="text-gray-500 dark:text-gray-400">
                  {Math.round(factor.weight * 100)}%
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${color}`}
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
              {showExplanation && factor.explanation && (
                <p className="pl-1 text-xs text-gray-500 dark:text-gray-400">
                  {factor.explanation}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
