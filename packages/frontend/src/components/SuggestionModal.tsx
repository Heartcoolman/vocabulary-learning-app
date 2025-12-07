import { X, Lightbulb } from './Icon';
import AmasSuggestion from './AmasSuggestion';
import { AmasProcessResult } from '../types/amas';

interface SuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: AmasProcessResult | null;
  onBreak: () => void;
}

export default function SuggestionModal({
  isOpen,
  onClose,
  result,
  onBreak,
}: SuggestionModalProps) {
  if (!isOpen || !result) return null;

  return (
    <div className="fixed inset-0 z-50 flex animate-g3-fade-in items-center justify-center bg-black/20 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md animate-g3-scale-in overflow-hidden rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2 text-blue-600">
            <Lightbulb size={24} weight="duotone" />
            <h3 className="text-lg font-bold">AI 学习建议</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
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
        <div className="flex justify-end bg-gray-50 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
          >
            明白了
          </button>
        </div>
      </div>
    </div>
  );
}
