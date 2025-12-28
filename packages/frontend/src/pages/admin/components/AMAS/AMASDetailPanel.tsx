import React, { useState, memo, useCallback } from 'react';
import {
  CircleNotch,
  Warning,
  CheckCircle,
  Lightbulb,
  Question,
} from '../../../../components/Icon';
import type { CounterfactualInput, CounterfactualResult } from '../../../../types/explainability';

// ==================== 类型定义 ====================

export interface AMASDetailPanelProps {
  /** 反事实分析结果 */
  result: CounterfactualResult | null;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 错误类型：'error' 显示红色错误样式，'info' 显示蓝色信息样式 */
  errorType?: 'error' | 'info';
  /** 提交回调 */
  onSubmit: (input: CounterfactualInput) => void;
}

// ==================== 子组件 ====================

/**
 * 滑块输入组件
 */
const SliderInput = memo(function SliderInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label} (0-1)
      </label>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>低</span>
        <span className="font-medium text-gray-700 dark:text-gray-300">{value}</span>
        <span>高</span>
      </div>
    </div>
  );
});

/**
 * 预测结果卡片
 */
const PredictionResultCard = memo(function PredictionResultCard({
  prediction,
}: {
  prediction: CounterfactualResult['prediction'];
}) {
  const wouldTrigger = prediction.wouldTriggerAdjustment;

  return (
    <div
      className={`rounded-button border p-4 ${
        wouldTrigger
          ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/30'
          : 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/30'
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        {wouldTrigger ? (
          <Warning size={20} weight="bold" className="text-yellow-600 dark:text-yellow-400" />
        ) : (
          <CheckCircle size={20} weight="bold" className="text-green-600 dark:text-green-400" />
        )}
        <span
          className={`font-medium ${wouldTrigger ? 'text-yellow-700 dark:text-yellow-300' : 'text-green-700 dark:text-green-300'}`}
        >
          {wouldTrigger ? '会触发难度调整' : '不会触发难度调整'}
        </span>
      </div>

      {prediction.suggestedDifficulty && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          建议难度调整:{' '}
          <span className="font-medium">
            {prediction.suggestedDifficulty === 'easier' ? '降低难度' : '提高难度'}
          </span>
        </p>
      )}

      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        预估准确率变化:{' '}
        <span
          className={`font-medium ${
            prediction.estimatedAccuracyChange >= 0 ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {prediction.estimatedAccuracyChange >= 0 ? '+' : ''}
          {(prediction.estimatedAccuracyChange * 100).toFixed(1)}%
        </span>
      </p>
    </div>
  );
});

/**
 * 状态对比卡片
 */
const StateComparisonCard = memo(function StateComparisonCard({
  baseState,
  counterfactualState,
}: {
  baseState: CounterfactualResult['baseState'];
  counterfactualState: CounterfactualResult['counterfactualState'];
}) {
  const formatValue = (value: number | undefined): string => {
    return value !== undefined ? `${(value * 100).toFixed(0)}%` : '-';
  };

  return (
    <div className="rounded-button bg-gray-50 p-4 dark:bg-slate-900">
      <h4 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">状态对比</h4>
      <div className="grid gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">注意力</span>
          <span>
            {formatValue(baseState.attention)} &rarr;{' '}
            <span className="font-medium">{formatValue(counterfactualState.attention)}</span>
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">疲劳度</span>
          <span>
            {formatValue(baseState.fatigue)} &rarr;{' '}
            <span className="font-medium">{formatValue(counterfactualState.fatigue)}</span>
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">动机</span>
          <span>
            {formatValue(baseState.motivation)} &rarr;{' '}
            <span className="font-medium">{formatValue(counterfactualState.motivation)}</span>
          </span>
        </div>
      </div>
    </div>
  );
});

/**
 * 空结果占位组件
 */
const EmptyResultPlaceholder = memo(function EmptyResultPlaceholder() {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center text-gray-400 dark:text-gray-500">
      <div className="text-center">
        <Lightbulb size={48} weight="duotone" className="mx-auto mb-2" />
        <p>调整参数并运行分析</p>
      </div>
    </div>
  );
});

// ==================== 主组件 ====================

/**
 * AMAS 详情面板组件 - 反事实分析
 * 模拟不同学习状态下系统的响应，探索"如果...会怎样"的场景
 */
function AMASDetailPanelComponent({
  result,
  isLoading,
  error,
  errorType = 'error',
  onSubmit,
}: AMASDetailPanelProps) {
  // 表单状态
  const [attention, setAttention] = useState<string>('0.7');
  const [fatigue, setFatigue] = useState<string>('0.3');
  const [motivation, setMotivation] = useState<string>('0.8');
  const [recentAccuracy, setRecentAccuracy] = useState<string>('0.75');

  // 处理表单提交
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      const input: CounterfactualInput = {
        overrides: {
          attention: parseFloat(attention),
          fatigue: parseFloat(fatigue),
          motivation: parseFloat(motivation),
          recentAccuracy: parseFloat(recentAccuracy),
        },
      };

      onSubmit(input);
    },
    [attention, fatigue, motivation, recentAccuracy, onSubmit],
  );

  return (
    <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
      {/* 标题栏 */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Question size={24} weight="duotone" className="text-teal-500" />
          反事实分析
        </h2>
      </div>

      {/* 描述 */}
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
        探索"如果...会怎样"的场景。调整学习状态参数，查看系统预测的结果变化。
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 输入表单 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <SliderInput label="注意力" value={attention} onChange={setAttention} />
          <SliderInput label="疲劳度" value={fatigue} onChange={setFatigue} />
          <SliderInput label="动机" value={motivation} onChange={setMotivation} />
          <SliderInput label="近期准确率" value={recentAccuracy} onChange={setRecentAccuracy} />

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-button bg-teal-500 px-4 py-3 font-medium text-white transition-all duration-g3-fast hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <CircleNotch className="animate-spin" size={18} weight="bold" />
                分析中...
              </>
            ) : (
              <>
                <Lightbulb size={18} weight="bold" />
                运行反事实分析
              </>
            )}
          </button>
        </form>

        {/* 结果展示 */}
        <div className="space-y-4">
          {/* 错误/信息提示 */}
          {error && (
            <div
              className={`rounded-button border p-4 text-sm ${
                errorType === 'info'
                  ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300'
              }`}
            >
              {error}
            </div>
          )}

          {/* 结果内容 */}
          {result && (
            <div className="space-y-4">
              {/* 预测结果 */}
              <PredictionResultCard prediction={result.prediction} />

              {/* 状态对比 */}
              <StateComparisonCard
                baseState={result.baseState}
                counterfactualState={result.counterfactualState}
              />

              {/* 解释说明 */}
              <div className="rounded-button border border-blue-100 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-900/30">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>分析说明：</strong> {result.explanation || ''}
                </p>
              </div>
            </div>
          )}

          {/* 空状态 */}
          {!result && !error && <EmptyResultPlaceholder />}
        </div>
      </div>
    </div>
  );
}

export const AMASDetailPanel = memo(AMASDetailPanelComponent);
export default AMASDetailPanel;
