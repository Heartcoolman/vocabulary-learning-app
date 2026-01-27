import { memo, useMemo } from 'react';
import { AmasProcessResult } from '../types/amas';
import { Coffee, Lightbulb, PushPin, Warning, TrendUp, TrendDown } from './Icon';
import { StateChangeReason } from './amas-settings';
import type { DecisionFactor } from '../types/explainability';

interface AmasSuggestionProps {
  /** AMAS处理结果 */
  result: AmasProcessResult | null;
  /** 点击休息建议的回调 */
  onBreak?: () => void;
  /** 是否显示详细因素分析 */
  showFactors?: boolean;
}

/**
 * 建议优先级类型
 * Phase 4.2: 学习建议优先级排序
 */
type SuggestionPriority = 'high' | 'medium' | 'low';

/**
 * 根据 factors 和状态推断建议优先级
 */
function inferPriority(result: AmasProcessResult): SuggestionPriority {
  // 休息建议始终是高优先级
  if (result.shouldBreak) return 'high';

  // 检查 factors 中的高影响因素
  const factors = result.explanation?.factors;
  if (factors && factors.length > 0) {
    const hasHighImpact = factors.some((f) => f.impact === 'high' || f.percentage > 30);
    if (hasHighImpact) return 'high';

    const hasMediumImpact = factors.some((f) => f.impact === 'medium' || f.percentage > 15);
    if (hasMediumImpact) return 'medium';
  }

  // 检查状态变化
  const state = result.state;
  if (state) {
    // 高疲劳或低注意力
    if (state.fatigue > 0.7 || state.attention < 0.4) return 'high';
    if (state.fatigue > 0.5 || state.attention < 0.6) return 'medium';
  }

  return 'low';
}

/**
 * 将 API factors 转换为 DecisionFactor 格式
 * Phase 4.3: StateChangeReason 集成
 */
function convertToDecisionFactors(
  factors: Array<{ name: string; value: number; impact: string; percentage: number }> | undefined,
): DecisionFactor[] {
  if (!factors || factors.length === 0) return [];

  return factors.map((f) => ({
    name: f.name,
    score: f.value,
    weight: f.percentage / 100, // percentage 转换为 0-1 权重
    explanation: f.impact === 'high' ? '显著影响' : f.impact === 'medium' ? '中等影响' : '轻微影响',
    icon: f.name.toLowerCase(),
  }));
}

/**
 * 获取优先级样式配置
 */
function getPriorityConfig(priority: SuggestionPriority) {
  switch (priority) {
    case 'high':
      return {
        badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        label: '重要',
        icon: Warning,
      };
    case 'medium':
      return {
        badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
        label: '建议',
        icon: TrendUp,
      };
    case 'low':
      return {
        badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        label: '提示',
        icon: TrendDown,
      };
  }
}

/**
 * AMAS建议组件 - 显示AI学习建议和休息提示
 * 符合ui-design-system.md设计规范
 * 使用 React.memo 优化：仅当 result 或 onBreak 变化时重新渲染
 *
 * Phase 4.2: 学习建议优先级排序
 * Phase 4.3: StateChangeReason 集成（显示 factors）
 */
function AmasSuggestionComponent({ result, onBreak, showFactors = true }: AmasSuggestionProps) {
  if (!result || (!result.explanation?.text && !result.suggestion && !result.shouldBreak)) {
    return null;
  }

  const isBreakSuggestion = result.shouldBreak;

  // Phase 4.2: 计算建议优先级
  const priority = useMemo(() => inferPriority(result), [result]);
  const priorityConfig = getPriorityConfig(priority);
  const PriorityIcon = priorityConfig.icon;

  // Phase 4.3: 转换 factors 为 DecisionFactor 格式
  const decisionFactors = useMemo(
    () => convertToDecisionFactors(result.explanation?.factors),
    [result.explanation?.factors],
  );

  // 判断是否显示 factors（仅在有显著因素且非休息建议时显示）
  const shouldShowFactors = showFactors && decisionFactors.length > 0 && !isBreakSuggestion;

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
          ? 'border-orange-200/60 bg-orange-50/80 dark:border-orange-800/60 dark:bg-orange-900/30'
          : 'border-blue-200/60 bg-blue-50/80 dark:border-blue-800/60 dark:bg-blue-900/30'
      } animate-g3-fade-in rounded-card border shadow-soft backdrop-blur-sm transition-all duration-g3-fast`}
      role="alert"
      aria-live="polite"
    >
      {/* 标题 + 优先级徽章 (Phase 4.2) */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isBreakSuggestion ? (
            <Coffee size={18} className="text-orange-600" />
          ) : (
            <Lightbulb size={18} className="text-blue-600" />
          )}
          <h4
            className={`text-sm font-semibold ${isBreakSuggestion ? 'text-orange-700 dark:text-orange-300' : 'text-blue-700 dark:text-blue-300'}`}
          >
            {isBreakSuggestion ? '休息建议' : 'AI建议'}
          </h4>
        </div>
        {/* 优先级徽章 */}
        {!isBreakSuggestion && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${priorityConfig.badge}`}
          >
            <PriorityIcon size={12} />
            {priorityConfig.label}
          </span>
        )}
      </div>

      {/* 解释说明 */}
      {result.explanation?.text && (
        <p className="mb-3 text-xs leading-relaxed text-gray-700 dark:text-gray-300">
          {result.explanation.text}
        </p>
      )}

      {/* 具体建议 */}
      {result.suggestion && (
        <div className="mb-3 flex items-start gap-2 rounded-button bg-white/50 p-2 text-xs text-gray-600 dark:bg-slate-800/50 dark:text-gray-300">
          <PushPin size={16} className="mt-0.5 flex-shrink-0 text-gray-500 dark:text-gray-400" />
          <p className="flex-1">{result.suggestion}</p>
        </div>
      )}

      {/* 当前策略参数 - 紧凑网格 */}
      {result.strategy && (
        <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between rounded bg-white/50 p-2 dark:bg-slate-800/50">
            <span className="text-gray-600 dark:text-gray-400">批量:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {result.strategy.batch_size ?? 10}
            </span>
          </div>
          <div className="flex justify-between rounded bg-white/50 p-2 dark:bg-slate-800/50">
            <span className="text-gray-600 dark:text-gray-400">难度:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {getDifficultyText(result.strategy.difficulty ?? 'mid')}
            </span>
          </div>
          <div className="flex justify-between rounded bg-white/50 p-2 dark:bg-slate-800/50">
            <span className="text-gray-600 dark:text-gray-400">新词:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {Math.round((result.strategy.new_ratio ?? 0) * 100)}%
            </span>
          </div>
          <div className="flex justify-between rounded bg-white/50 p-2 dark:bg-slate-800/50">
            <span className="text-gray-600 dark:text-gray-400">提示:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {getHintLevelText(result.strategy.hint_level ?? 0)}
            </span>
          </div>
        </div>
      )}

      {/* Phase 4.3: 影响因素分析 */}
      {shouldShowFactors && (
        <div className="mb-3 rounded bg-white/30 p-3 dark:bg-slate-800/30">
          <StateChangeReason factors={decisionFactors} title="决策因素" showExplanation={false} />
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
  // 比较 showFactors
  if (prevProps.showFactors !== nextProps.showFactors) {
    return false;
  }

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
    prev.explanation?.text !== next.explanation?.text ||
    prev.suggestion !== next.suggestion ||
    prev.shouldBreak !== next.shouldBreak
  ) {
    return false;
  }

  // 比较 factors 长度（简单比较）
  const prevFactors = prev.explanation?.factors;
  const nextFactors = next.explanation?.factors;
  if ((prevFactors?.length ?? 0) !== (nextFactors?.length ?? 0)) {
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
