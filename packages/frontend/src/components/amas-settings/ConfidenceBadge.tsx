/**
 * 置信度徽章组件
 *
 * 遵循 C8:
 * - 低: confidence < 0.5 → 红色
 * - 中: 0.5 <= confidence <= 0.8 → 黄色
 * - 高: confidence > 0.8 → 绿色
 * - 缺失: confidence === undefined → 显示 "—" 灰色
 */
import { memo } from 'react';

export interface ConfidenceBadgeProps {
  confidence: number | undefined;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

function getConfidenceCategory(confidence: number | undefined): {
  level: 'low' | 'medium' | 'high' | 'unknown';
  color: string;
  bgColor: string;
  label: string;
} {
  if (confidence === undefined || confidence === null || isNaN(confidence)) {
    return {
      level: 'unknown',
      color: 'text-gray-500 dark:text-gray-400',
      bgColor: 'bg-gray-100 dark:bg-gray-700',
      label: '—',
    };
  }

  if (confidence < 0.5) {
    return {
      level: 'low',
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      label: '低',
    };
  }

  if (confidence <= 0.8) {
    return {
      level: 'medium',
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
      label: '中',
    };
  }

  return {
    level: 'high',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    label: '高',
  };
}

export const ConfidenceBadge = memo(function ConfidenceBadge({
  confidence,
  showLabel = true,
  size = 'sm',
}: ConfidenceBadgeProps) {
  const category = getConfidenceCategory(confidence);
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  const isValidConfidence = confidence !== undefined && confidence !== null && !isNaN(confidence);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses} ${category.bgColor} ${category.color}`}
      title={isValidConfidence ? `置信度: ${Math.round(confidence * 100)}%` : '置信度未知'}
    >
      {isValidConfidence && <span>{Math.round(confidence * 100)}%</span>}
      {showLabel && <span>{category.label}</span>}
      {!isValidConfidence && !showLabel && <span>—</span>}
    </span>
  );
});

/** 导出辅助函数供外部使用 */
export { getConfidenceCategory };
