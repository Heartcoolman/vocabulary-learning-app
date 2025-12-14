import React, { memo } from 'react';
import {
  CircleNotch,
  Warning,
  Brain,
  ArrowClockwise,
  Clock,
  Info,
} from '../../../../components/Icon';
import type { DecisionExplanation } from '../../../../types/explainability';

// ==================== 类型定义 ====================

export interface AMASOverviewProps {
  /** 决策解释数据 */
  explanation: DecisionExplanation | null;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 刷新回调 */
  onRefresh: () => void;
}

// ==================== 辅助函数 ====================

/**
 * 根据数值获取状态颜色
 */
const getStateColor = (value: number | undefined): string => {
  if (value === undefined) return 'text-gray-500';
  if (value >= 0.7) return 'text-green-600';
  if (value >= 0.4) return 'text-yellow-600';
  return 'text-red-600';
};

/**
 * 根据数值获取状态标签
 */
const getStateLabel = (value: number | undefined): string => {
  if (value === undefined) return '未知';
  if (value >= 0.7) return '良好';
  if (value >= 0.4) return '一般';
  return '较低';
};

/**
 * 获取疲劳度状态标签
 */
const getFatigueLabel = (fatigue: number | undefined): string => {
  if (fatigue === undefined) return '未知';
  if (fatigue <= 0.3) return '良好';
  if (fatigue <= 0.6) return '一般';
  return '较高';
};

/**
 * 格式化难度因素名称
 */
const formatDifficultyFactorName = (key: string): string => {
  const nameMap: Record<string, string> = {
    length: '长度',
    accuracy: '准确率',
    frequency: '频率',
    forgetting: '遗忘率',
  };
  return nameMap[key] || key;
};

// ==================== 子组件 ====================

/**
 * 学习状态指标卡片
 */
const StateMetricCard = memo(function StateMetricCard({
  label,
  value,
  stateColor,
  stateLabel,
}: {
  label: string;
  value: number | undefined;
  stateColor: string;
  stateLabel: string;
}) {
  return (
    <div className="rounded-button bg-gray-50 p-3">
      <p className="mb-1 text-xs text-gray-600">{label}</p>
      <div className="flex items-center justify-between">
        <p className={`text-xl font-bold ${stateColor}`}>
          {value !== undefined ? `${(value * 100).toFixed(0)}%` : '-'}
        </p>
        <span className={`rounded px-2 py-1 text-xs ${stateColor} bg-opacity-10`}>
          {stateLabel}
        </span>
      </div>
    </div>
  );
});

/**
 * 难度因素进度条
 */
const DifficultyFactorBar = memo(function DifficultyFactorBar({
  name,
  value,
}: {
  name: string;
  value: number;
}) {
  return (
    <div className="rounded-button bg-purple-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs capitalize text-gray-600">{formatDifficultyFactorName(name)}</p>
        <p className="text-sm font-bold text-gray-900">{value.toFixed(2)}</p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full bg-purple-500 transition-all duration-g3-normal"
          style={{ width: `${Math.min(100, value * 100)}%` }}
        />
      </div>
    </div>
  );
});

/**
 * 决策因素卡片
 */
const DecisionFactorCard = memo(function DecisionFactorCard({
  factor,
}: {
  factor: { name: string; weight: number; explanation: string; score: number };
}) {
  return (
    <div className="rounded-button bg-gray-50 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-gray-800">{factor.name}</span>
        <span className="text-sm text-gray-600">权重: {(factor.weight * 100).toFixed(1)}%</span>
      </div>
      <p className="mb-2 text-xs text-gray-500">{factor.explanation}</p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full bg-green-500 transition-all duration-g3-normal"
          style={{ width: `${factor.score * 100}%` }}
        />
      </div>
    </div>
  );
});

// ==================== 主组件 ====================

/**
 * AMAS 概览组件 - 决策解释卡片
 * 展示系统最新的决策过程，包括学习状态、难度因素和算法权重
 */
function AMASOverviewComponent({ explanation, isLoading, error, onRefresh }: AMASOverviewProps) {
  return (
    <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm">
      {/* 标题栏 */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <Brain size={24} weight="duotone" className="text-purple-500" />
          决策解释
        </h2>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="rounded-button p-2 transition-all hover:bg-gray-100 disabled:opacity-50"
          title="刷新"
        >
          <ArrowClockwise size={20} weight="bold" className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 加载状态 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <CircleNotch className="animate-spin" size={32} weight="bold" color="#3b82f6" />
        </div>
      ) : error ? (
        /* 错误状态 */
        <div className="py-8 text-center text-gray-500">
          <Warning size={48} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
          <p>{error}</p>
        </div>
      ) : explanation ? (
        /* 数据展示 */
        <div className="space-y-6">
          {/* 决策 ID 和时间 */}
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Info size={16} />
              ID: {explanation.decisionId.slice(0, 8)}...
            </span>
            <span className="flex items-center gap-1">
              <Clock size={16} />
              {new Date(explanation.timestamp).toLocaleString('zh-CN')}
            </span>
          </div>

          {/* 推理说明 */}
          {explanation.reasoning && (
            <div className="rounded-button border border-blue-100 bg-blue-50 p-4">
              <p className="text-sm text-blue-800">
                <strong>推理说明：</strong> {explanation.reasoning}
              </p>
            </div>
          )}

          {/* 学习状态 */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">学习状态</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <StateMetricCard
                label="注意力"
                value={explanation.state.attention}
                stateColor={getStateColor(explanation.state.attention)}
                stateLabel={getStateLabel(explanation.state.attention)}
              />
              <StateMetricCard
                label="疲劳度"
                value={explanation.state.fatigue}
                stateColor={getStateColor(
                  explanation.state.fatigue !== undefined
                    ? 1 - explanation.state.fatigue
                    : undefined,
                )}
                stateLabel={getFatigueLabel(explanation.state.fatigue)}
              />
              <StateMetricCard
                label="动机"
                value={explanation.state.motivation}
                stateColor={getStateColor(explanation.state.motivation)}
                stateLabel={getStateLabel(explanation.state.motivation)}
              />
            </div>
          </div>

          {/* 难度因素 */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">难度因素</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {Object.entries(explanation.difficultyFactors).map(([key, value]) => (
                <DifficultyFactorBar key={key} name={key} value={value} />
              ))}
            </div>
          </div>

          {/* 算法权重 */}
          {explanation.weights && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">算法权重</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(explanation.weights).map(([algo, weight]) => (
                  <div
                    key={algo}
                    className="flex items-center gap-2 rounded-button bg-indigo-50 px-3 py-2"
                  >
                    <span className="text-sm font-medium capitalize text-indigo-700">{algo}</span>
                    <span className="text-sm font-bold text-indigo-900">
                      {((weight as number) * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 决策因素详情 */}
          {explanation.factors && explanation.factors.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">决策因素</h3>
              <div className="space-y-2">
                {explanation.factors.map((factor, idx) => (
                  <DecisionFactorCard key={idx} factor={factor} />
                ))}
              </div>
            </div>
          )}

          {/* 触发器 */}
          {explanation.triggers && explanation.triggers.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">触发器</h3>
              <div className="flex flex-wrap gap-2">
                {explanation.triggers.map((trigger, idx) => (
                  <span
                    key={idx}
                    className="rounded-full bg-yellow-100 px-3 py-1 text-sm text-yellow-800"
                  >
                    {trigger}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* 空状态 */
        <div className="py-8 text-center text-gray-500">暂无决策解释数据</div>
      )}
    </div>
  );
}

export const AMASOverview = memo(AMASOverviewComponent);
export default AMASOverview;
