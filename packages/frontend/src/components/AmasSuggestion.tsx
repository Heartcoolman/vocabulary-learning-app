import { AmasProcessResult } from '../types/amas';
import { Coffee, Lightbulb, PushPin } from './Icon';

interface AmasSuggestionProps {
  /** AMAS处理结果 */
  result: AmasProcessResult | null;
  /** 点击休息建议的回调 */
  onBreak?: () => void;
}

/**
 * AMAS建议组件 - 显示AI学习建议和休息提示
 * 符合ui-design-system.md设计规范
 */
export default function AmasSuggestion({ result, onBreak }: AmasSuggestionProps) {
  if (!result || (!result.explanation && !result.suggestion && !result.shouldBreak)) {
    return null;
  }

  const isBreakSuggestion = result.shouldBreak;

  const getDifficultyText = (difficulty: string): string => {
    switch (difficulty) {
      case 'easy':
        return '简单';
      case 'mid':
        return '中等';
      case 'hard':
        return '困难';
      default:
        return difficulty;
    }
  };

  const getHintLevelText = (level: number): string => {
    switch (level) {
      case 0:
        return '无';
      case 1:
        return '少';
      case 2:
        return '多';
      default:
        return `${level}`;
    }
  };

  return (
    <div
      className={`p-4 ${
        isBreakSuggestion
          ? 'border-orange-200/60 bg-orange-50/80'
          : 'border-blue-200/60 bg-blue-50/80'
      } animate-g3-fade-in rounded-xl border shadow-sm backdrop-blur-sm transition-all duration-200`}
      role="alert"
      aria-live="polite"
    >
      {/* 标题 */}
      <div className="mb-3 flex items-center gap-2">
        {isBreakSuggestion ? (
          <Coffee size={18} weight="duotone" className="text-orange-600" />
        ) : (
          <Lightbulb size={18} weight="duotone" className="text-blue-600" />
        )}
        <h4
          className={`text-sm font-semibold ${isBreakSuggestion ? 'text-orange-700' : 'text-blue-700'}`}
        >
          {isBreakSuggestion ? '休息建议' : 'AI建议'}
        </h4>
      </div>

      {/* 解释说明 */}
      {result.explanation && (
        <p className="mb-3 text-xs leading-relaxed text-gray-700">{result.explanation}</p>
      )}

      {/* 具体建议 */}
      {result.suggestion && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-white/50 p-2 text-xs text-gray-600">
          <PushPin size={16} weight="duotone" className="mt-0.5 flex-shrink-0 text-gray-500" />
          <p className="flex-1">{result.suggestion}</p>
        </div>
      )}

      {/* 当前策略参数 - 紧凑网格 */}
      {result.strategy && (
        <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between rounded bg-white/50 p-2">
            <span className="text-gray-600">批量:</span>
            <span className="font-medium text-gray-900">{result.strategy.batch_size}</span>
          </div>
          <div className="flex justify-between rounded bg-white/50 p-2">
            <span className="text-gray-600">难度:</span>
            <span className="font-medium text-gray-900">
              {getDifficultyText(result.strategy.difficulty)}
            </span>
          </div>
          <div className="flex justify-between rounded bg-white/50 p-2">
            <span className="text-gray-600">新词:</span>
            <span className="font-medium text-gray-900">
              {Math.round(result.strategy.new_ratio * 100)}%
            </span>
          </div>
          <div className="flex justify-between rounded bg-white/50 p-2">
            <span className="text-gray-600">提示:</span>
            <span className="font-medium text-gray-900">
              {getHintLevelText(result.strategy.hint_level)}
            </span>
          </div>
        </div>
      )}

      {/* 休息按钮 */}
      {isBreakSuggestion && onBreak && (
        <button
          onClick={onBreak}
          className="w-full rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:scale-105 hover:bg-orange-600 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 active:scale-95"
          aria-label="休息一下"
        >
          好的，休息一下
        </button>
      )}
    </div>
  );
}
