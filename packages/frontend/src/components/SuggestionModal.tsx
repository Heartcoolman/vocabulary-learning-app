import React, { useEffect } from 'react';
import { X, Lightbulb } from './Icon';
import AmasSuggestion from './AmasSuggestion';
import { AmasProcessResult } from '../types/amas';

interface SuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: AmasProcessResult | null;
  onBreak: () => void;
}

const SuggestionModalComponent = ({ isOpen, onClose, result, onBreak }: SuggestionModalProps) => {
  useEffect(() => {
    if (isOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [isOpen]);

  if (!isOpen || !result) return null;

  return (
    <div className="fixed inset-0 z-50 flex animate-g3-fade-in items-center justify-center bg-black/20 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md animate-g3-scale-in overflow-hidden rounded-card bg-white shadow-floating dark:bg-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <Lightbulb size={24} weight="duotone" />
            <h3 className="text-lg font-bold">AI 学习建议</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-700 dark:hover:text-gray-300"
            aria-label="关闭"
          >
            <X size={20} weight="bold" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <AmasSuggestion result={result} onBreak={onBreak} />
        </div>

        {/* Footer */}
        <div className="flex justify-end bg-gray-50 px-6 py-4 dark:bg-slate-900">
          <button
            onClick={onClose}
            className="rounded-button bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
          >
            明白了
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Deep comparison for AmasProcessResult
 */
const compareAmasResult = (
  prev: AmasProcessResult | null,
  next: AmasProcessResult | null,
): boolean => {
  if (prev === null && next === null) return true;
  if (prev === null || next === null) return false;

  return (
    prev.suggestion === next.suggestion &&
    prev.shouldBreak === next.shouldBreak &&
    prev.explanation?.text === next.explanation?.text &&
    prev.state?.fatigue === next.state?.fatigue &&
    prev.objectiveEvaluation?.metrics?.aggregatedScore ===
      next.objectiveEvaluation?.metrics?.aggregatedScore
  );
};

/**
 * Memoized SuggestionModal component
 */
const SuggestionModal = React.memo(SuggestionModalComponent, (prevProps, nextProps) => {
  return (
    prevProps.isOpen === nextProps.isOpen &&
    prevProps.onClose === nextProps.onClose &&
    prevProps.onBreak === nextProps.onBreak &&
    compareAmasResult(prevProps.result, nextProps.result)
  );
});

export default SuggestionModal;
