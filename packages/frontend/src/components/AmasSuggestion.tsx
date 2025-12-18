import { memo } from 'react';
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
 * 使用 React.memo 优化：仅当 result 或 onBreak 变化时重新渲染
 */
function AmasSuggestionComponent({ result, onBreak }: AmasSuggestionProps) {
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
      } animate-g3-fade-in rounded-card border shadow-soft backdrop-blur-sm transition-all duration-g3-fast`}
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
        <p className="mb-3 text-xs leading-relaxed text-gray-700">
          {typeof result.explanation === 'string'
            ? result.explanation
            : result.explanation?.text || ''}
        </p>
      )}

      {/* 具体建议 */}
      {result.suggestion && (
        <div className="mb-3 flex items-start gap-2 rounded-button bg-white/50 p-2 text-xs text-gray-600">
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
          className="w-full rounded-button bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-all duration-g3-fast hover:scale-105 hover:bg-orange-600 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 active:scale-95"
          aria-label="休息一下"
        >
          好的，休息一下
        </button>
      )}
    </div>
  );
}

// 自定义比较函数：深度比较 result 对象
function arePropsEqual(prevProps: AmasSuggestionProps, nextProps: AmasSuggestionProps): boolean {
  // 如果两者都为 null，则相等
  if (prevProps.result === null && nextProps.result === null) {
    return true;
  }
  // 如果一个为 null 另一个不为 null，则不相等
  if (prevProps.result === null || nextProps.result === null) {
    return false;
  }

  const prev = prevProps.result;
  const next = nextProps.result;

  // 比较基本属性
  if (
    prev.explanation !== next.explanation ||
    prev.suggestion !== next.suggestion ||
    prev.shouldBreak !== next.shouldBreak
  ) {
    return false;
  }

  // 比较 strategy 对象
  if (prev.strategy && next.strategy) {
    if (
      prev.strategy.batch_size !== next.strategy.batch_size ||
      prev.strategy.difficulty !== next.strategy.difficulty ||
      prev.strategy.new_ratio !== next.strategy.new_ratio ||
      prev.strategy.hint_level !== next.strategy.hint_level
    ) {
      return false;
    }
  } else if (prev.strategy !== next.strategy) {
    return false;
  }

  return true;
}

const AmasSuggestion = memo(AmasSuggestionComponent, arePropsEqual);

export default AmasSuggestion;
