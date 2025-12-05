import { useState, useCallback } from 'react';

/**
 * 学习页面模态框状态管理 Hook
 */
export interface UseLearningModalsResult {
  /** 状态监控模态框是否打开 */
  isStatusOpen: boolean;
  /** AI 建议模态框是否打开 */
  isSuggestionOpen: boolean;
  /** 决策透视模态框是否打开 */
  isExplainabilityOpen: boolean;
  /** 所有对话框状态数组（用于暂停时间追踪） */
  dialogStates: boolean[];
  /** 打开状态监控模态框 */
  openStatus: () => void;
  /** 关闭状态监控模态框 */
  closeStatus: () => void;
  /** 打开 AI 建议模态框 */
  openSuggestion: () => void;
  /** 关闭 AI 建议模态框 */
  closeSuggestion: () => void;
  /** 打开决策透视模态框 */
  openExplainability: () => void;
  /** 关闭决策透视模态框 */
  closeExplainability: () => void;
}

/**
 * 学习页面模态框状态管理 Hook
 *
 * @example
 * ```tsx
 * const {
 *   isStatusOpen,
 *   isSuggestionOpen,
 *   isExplainabilityOpen,
 *   dialogStates,
 *   openStatus,
 *   closeStatus,
 *   ...
 * } = useLearningModals();
 * ```
 */
export function useLearningModals(): UseLearningModalsResult {
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const [isExplainabilityOpen, setIsExplainabilityOpen] = useState(false);

  const openStatus = useCallback(() => setIsStatusOpen(true), []);
  const closeStatus = useCallback(() => setIsStatusOpen(false), []);
  const openSuggestion = useCallback(() => setIsSuggestionOpen(true), []);
  const closeSuggestion = useCallback(() => setIsSuggestionOpen(false), []);
  const openExplainability = useCallback(() => setIsExplainabilityOpen(true), []);
  const closeExplainability = useCallback(() => setIsExplainabilityOpen(false), []);

  return {
    isStatusOpen,
    isSuggestionOpen,
    isExplainabilityOpen,
    dialogStates: [isStatusOpen, isSuggestionOpen, isExplainabilityOpen],
    openStatus,
    closeStatus,
    openSuggestion,
    closeSuggestion,
    openExplainability,
    closeExplainability,
  };
}

export default useLearningModals;
