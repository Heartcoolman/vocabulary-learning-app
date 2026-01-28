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
import { getConfidenceCategory } from './confidenceBadgeUtils';

export interface ConfidenceBadgeProps {
  confidence: number | undefined;
  showLabel?: boolean;
  size?: 'sm' | 'md';
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
