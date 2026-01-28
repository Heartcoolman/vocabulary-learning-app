import React, { memo } from 'react';
import {
  CircleNotch,
  Warning,
  ArrowClockwise,
  Clock,
  Target,
  Lightning,
} from '../../../../components/Icon';
import type { DecisionTimelineItem } from '../../../../types/explainability';

// ==================== 类型定义 ====================

export interface AMASVisualizationProps {
  /** 决策时间线数据 */
  data: DecisionTimelineItem[];
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 刷新回调 */
  onRefresh: () => void;
  /** 加载更多回调 */
  onLoadMore: () => void;
  /** 是否有更多数据 */
  hasMore: boolean;
}

// ==================== 辅助函数 ====================

/**
 * 根据置信度获取颜色
 */
const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 0.8) return 'bg-green-500';
  if (confidence >= 0.5) return 'bg-yellow-500';
  return 'bg-red-500';
};

/**
 * 获取置信度文字颜色
 */
const getConfidenceTextColor = (confidence: number): string => {
  if (confidence >= 0.8) return 'text-green-600';
  if (confidence >= 0.5) return 'text-yellow-600';
  return 'text-red-600';
};

// ==================== 子组件 ====================

/**
 * 时间线项目卡片
 */
const TimelineItemCard = memo(function TimelineItemCard({ item }: { item: DecisionTimelineItem }) {
  return (
    <div className="relative pl-10">
      {/* 时间线节点 */}
      <div
        className={`absolute left-2 top-3 h-4 w-4 rounded-full border-2 border-white ${getConfidenceColor(item.decision.confidence)}`}
      />

      <div className="rounded-button bg-gray-50 p-4 transition-all hover:bg-gray-100 dark:bg-slate-900 dark:hover:bg-slate-800">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            单词 ID: {item.wordId.slice(0, 8)}...
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {new Date(item.timestamp).toLocaleString('zh-CN')}
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <Target size={14} className="text-blue-500" />
            <span className="text-gray-600 dark:text-gray-400">置信度:</span>
            <span className={`font-medium ${getConfidenceTextColor(item.decision.confidence)}`}>
              {(item.decision.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Lightning size={14} className="text-purple-500" />
            <span className="text-gray-600 dark:text-gray-400">决策 ID:</span>
            <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
              {item.decision.decisionId.slice(0, 8)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

/**
 * 加载更多按钮
 */
const LoadMoreButton = memo(function LoadMoreButton({
  isLoading,
  onClick,
}: {
  isLoading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className="flex w-full items-center justify-center gap-2 rounded-button py-3 text-blue-600 transition-all hover:bg-blue-50 disabled:opacity-50 dark:text-blue-400 dark:hover:bg-blue-900/30"
    >
      {isLoading ? (
        <>
          <CircleNotch className="animate-spin" size={18} weight="bold" />
          加载中...
        </>
      ) : (
        '加载更多'
      )}
    </button>
  );
});

// ==================== 主组件 ====================

/**
 * AMAS 可视化组件 - 决策时间线
 * 按时间顺序展示系统的所有决策记录
 */
function AMASVisualizationComponent({
  data,
  isLoading,
  error,
  onRefresh,
  onLoadMore,
  hasMore,
}: AMASVisualizationProps) {
  return (
    <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
      {/* 标题栏 */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Clock size={24} className="text-orange-500" />
          决策时间线
        </h2>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="rounded-button p-2 transition-all hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-slate-700"
          title="刷新"
        >
          <ArrowClockwise size={20} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 加载状态（仅在首次加载时显示） */}
      {isLoading && data.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <CircleNotch className="animate-spin" size={32} weight="bold" color="#3b82f6" />
        </div>
      ) : error ? (
        /* 错误状态 */
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">
          <Warning size={48} color="#ef4444" className="mx-auto mb-4" />
          <p>{error}</p>
        </div>
      ) : data.length > 0 ? (
        /* 数据展示 */
        <div className="space-y-4">
          <div className="relative">
            {/* 时间线竖线 */}
            <div className="absolute bottom-0 left-4 top-0 w-0.5 bg-gray-200 dark:bg-slate-700" />

            {/* 时间线项目 */}
            <div className="space-y-4">
              {data.map((item) => (
                <TimelineItemCard key={item.answerId} item={item} />
              ))}
            </div>
          </div>

          {/* 加载更多按钮 */}
          {hasMore && <LoadMoreButton isLoading={isLoading} onClick={onLoadMore} />}
        </div>
      ) : (
        /* 空状态 */
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">暂无决策时间线数据</div>
      )}
    </div>
  );
}

export const AMASVisualization = memo(AMASVisualizationComponent);
export default AMASVisualization;
