import React from 'react';
import { LearningModeSelector } from '../../../components/LearningModeSelector';
import { ChartPie, Lightbulb, Brain } from '../../../components/Icon';
import type { AmasProcessResult } from '../../../types/amas';

/**
 * 学习工具栏组件
 *
 * 包含学习模式选择器和状态按钮（状态监控、AI建议、决策透视）
 */
export interface LearningToolbarProps {
  /** 是否有可用的 AMAS 结果 */
  hasAmasResult: boolean;
  /** 最新的 AMAS 决策结果 */
  latestAmasResult?: AmasProcessResult | null;
  /** 打开状态监控对话框 */
  onOpenStatus: () => void;
  /** 打开 AI 建议对话框 */
  onOpenSuggestion: () => void;
  /** 打开决策透视对话框 */
  onOpenExplainability: () => void;
}

/**
 * 学习工具栏组件
 *
 * 用于 MasteryProgress 的 headerActions 插槽
 *
 * @example
 * ```tsx
 * <MasteryProgress
 *   progress={progress}
 *   isCompleted={isCompleted}
 *   headerActions={
 *     <LearningToolbar
 *       hasAmasResult={!!latestAmasResult}
 *       latestAmasResult={latestAmasResult}
 *       onOpenStatus={() => setIsStatusOpen(true)}
 *       onOpenSuggestion={() => setIsSuggestionOpen(true)}
 *       onOpenExplainability={() => setIsExplainabilityOpen(true)}
 *     />
 *   }
 * />
 * ```
 */
export function LearningToolbar({
  hasAmasResult,
  latestAmasResult,
  onOpenStatus,
  onOpenSuggestion,
  onOpenExplainability,
}: LearningToolbarProps): React.ReactElement {
  return (
    <>
      <div className="h-4 w-px bg-gray-200 mx-1" />
      <LearningModeSelector minimal />
      <button
        onClick={onOpenStatus}
        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        title="状态监控"
      >
        <ChartPie size={20} />
      </button>
      <button
        onClick={onOpenSuggestion}
        disabled={!hasAmasResult}
        className="p-2 text-gray-500 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-30"
        title={!hasAmasResult ? '暂无建议' : 'AI 建议'}
      >
        <Lightbulb size={20} weight={latestAmasResult ? 'fill' : 'regular'} />
      </button>
      <button
        onClick={onOpenExplainability}
        disabled={!hasAmasResult}
        className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-30"
        title="决策透视"
      >
        <Brain size={20} />
      </button>
    </>
  );
}

export default LearningToolbar;
