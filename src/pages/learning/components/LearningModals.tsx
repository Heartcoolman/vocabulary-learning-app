import React from 'react';
import { StatusModal, SuggestionModal } from '../../../components';
import ExplainabilityModal from '../../../components/explainability/ExplainabilityModal';
import type { AmasProcessResult } from '../../../types/amas';

/**
 * 学习模态框组 Props
 */
export interface LearningModalsProps {
  /** 状态监控模态框是否打开 */
  isStatusOpen: boolean;
  /** 关闭状态监控模态框 */
  onCloseStatus: () => void;
  /** 刷新触发器（用于状态监控） */
  refreshTrigger: number;
  /** AI 建议模态框是否打开 */
  isSuggestionOpen: boolean;
  /** 关闭 AI 建议模态框 */
  onCloseSuggestion: () => void;
  /** 决策透视模态框是否打开 */
  isExplainabilityOpen: boolean;
  /** 关闭决策透视模态框 */
  onCloseExplainability: () => void;
  /** 最新的 AMAS 决策结果 */
  latestAmasResult?: AmasProcessResult | null;
}

/**
 * 学习模态框组
 *
 * 包含状态监控、AI 建议和决策透视三个模态框
 */
export function LearningModals({
  isStatusOpen,
  onCloseStatus,
  refreshTrigger,
  isSuggestionOpen,
  onCloseSuggestion,
  isExplainabilityOpen,
  onCloseExplainability,
  latestAmasResult,
}: LearningModalsProps): React.ReactElement {
  return (
    <>
      <StatusModal
        isOpen={isStatusOpen}
        onClose={onCloseStatus}
        refreshTrigger={refreshTrigger}
      />
      <SuggestionModal
        isOpen={isSuggestionOpen}
        onClose={onCloseSuggestion}
        result={latestAmasResult ?? null}
        onBreak={onCloseSuggestion}
      />
      <ExplainabilityModal
        isOpen={isExplainabilityOpen}
        onClose={onCloseExplainability}
        latestDecision={latestAmasResult}
      />
    </>
  );
}

export default LearningModals;
