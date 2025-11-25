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
          ? 'bg-orange-50/80 border-orange-200/60'
          : 'bg-blue-50/80 border-blue-200/60'
      } backdrop-blur-sm border rounded-xl shadow-sm transition-all duration-200 animate-fade-in`}
      role="alert"
      aria-live="polite"
    >
      {/* 标题 */}
      <div className="flex items-center gap-2 mb-3">
        {isBreakSuggestion ? (
          <Coffee size={18} weight="duotone" className="text-orange-600" />
        ) : (
          <Lightbulb size={18} weight="duotone" className="text-blue-600" />
        )}
        <h4 className={`text-sm font-semibold ${isBreakSuggestion ? 'text-orange-700' : 'text-blue-700'}`}>
          {isBreakSuggestion ? '休息建议' : 'AI建议'}
        </h4>
      </div>

      {/* 解释说明 */}
      {result.explanation && (
        <p className="text-xs text-gray-700 leading-relaxed mb-3">
          {result.explanation}
        </p>
      )}

      {/* 具体建议 */}
      {result.suggestion && (
        <div className="flex items-start gap-2 text-xs text-gray-600 mb-3 p-2 bg-white/50 rounded-lg">
          <PushPin size={16} weight="duotone" className="flex-shrink-0 text-gray-500 mt-0.5" />
          <p className="flex-1">{result.suggestion}</p>
        </div>
      )}

      {/* 当前策略参数 - 紧凑网格 */}
      {result.strategy && (
        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div className="flex justify-between p-2 bg-white/50 rounded">
            <span className="text-gray-600">批量:</span>
            <span className="font-medium text-gray-900">{result.strategy.batch_size}</span>
          </div>
          <div className="flex justify-between p-2 bg-white/50 rounded">
            <span className="text-gray-600">难度:</span>
            <span className="font-medium text-gray-900">{getDifficultyText(result.strategy.difficulty)}</span>
          </div>
          <div className="flex justify-between p-2 bg-white/50 rounded">
            <span className="text-gray-600">新词:</span>
            <span className="font-medium text-gray-900">{Math.round(result.strategy.new_ratio * 100)}%</span>
          </div>
          <div className="flex justify-between p-2 bg-white/50 rounded">
            <span className="text-gray-600">提示:</span>
            <span className="font-medium text-gray-900">{getHintLevelText(result.strategy.hint_level)}</span>
          </div>
        </div>
      )}

      {/* 休息按钮 */}
      {isBreakSuggestion && onBreak && (
        <button
          onClick={onBreak}
          className="w-full px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
          aria-label="休息一下"
        >
          好的，休息一下
        </button>
      )}
    </div>
  );
}
