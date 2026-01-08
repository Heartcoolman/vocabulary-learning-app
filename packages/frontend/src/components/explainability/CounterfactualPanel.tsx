import React, { useState, useRef, useEffect } from 'react';
import { Flask, ArrowRight, CheckCircle, WarningCircle, CircleNotch } from '@phosphor-icons/react';
import { explainabilityApi } from '../../services/explainabilityApi';
import type { CounterfactualResult } from '../../types/explainability';
import { amasLogger } from '../../utils/logger';

interface CounterfactualPanelProps {
  decisionId?: string;
}

const CounterfactualPanel: React.FC<CounterfactualPanelProps> = React.memo(({ decisionId }) => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CounterfactualResult | null>(null);

  // 用于请求取消的 AbortController 引用
  const abortControllerRef = useRef<AbortController | null>(null);

  // 状态覆盖值
  const [overrides, setOverrides] = useState({
    attention: 0.7,
    fatigue: 0.3,
    motivation: 0.8,
    recentAccuracy: 0.75,
  });

  // 组件卸载时取消正在进行的请求
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleSimulate = async () => {
    // 取消之前的请求（如果存在）
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();

    setIsSimulating(true);
    setError(null);
    try {
      const response = await explainabilityApi.runCounterfactual({
        decisionId,
        overrides,
      });

      // 检查请求是否已被取消
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      setResult(response);
    } catch (err) {
      // 如果是取消错误，不显示错误信息
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      amasLogger.error({ err, decisionId, overrides }, '反事实分析失败');
      setError('分析失败，请稍后重试');
    } finally {
      // 只有在请求未被取消时才更新 loading 状态
      if (!abortControllerRef.current?.signal.aborted) {
        setIsSimulating(false);
      }
    }
  };

  const renderSlider = (
    label: string,
    value: number,
    key: keyof typeof overrides,
    description: string,
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
        <span className="font-mono text-sm text-indigo-600">{(value * 100).toFixed(0)}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value * 100}
        onChange={(e) => setOverrides((prev) => ({ ...prev, [key]: Number(e.target.value) / 100 }))}
        className="h-2 w-full cursor-pointer appearance-none rounded-button bg-gray-200 accent-indigo-500 dark:bg-slate-700"
      />
      <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );

  return (
    <div className="animate-fade-in space-y-6">
      <div className="rounded-card border border-indigo-100 bg-gradient-to-br from-purple-50 to-indigo-50 p-5 dark:border-indigo-800 dark:from-purple-900/20 dark:to-indigo-900/20">
        <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white">
          <Flask className="h-6 w-6 text-purple-500" />
          如果我的状态不同会怎样？
        </h3>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          调整下面的参数，AMAS 将分析在不同状态下系统会如何调整学习策略。
        </p>

        <div className="space-y-4">
          {renderSlider('注意力', overrides.attention, 'attention', '模拟更高或更低的注意力水平')}
          {renderSlider('疲劳度', overrides.fatigue, 'fatigue', '模拟不同的疲劳程度')}
          {renderSlider('学习动机', overrides.motivation, 'motivation', '模拟学习积极性变化')}
          {renderSlider(
            '近期正确率',
            overrides.recentAccuracy,
            'recentAccuracy',
            '模拟答题表现变化',
          )}
        </div>

        <button
          onClick={handleSimulate}
          disabled={isSimulating}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-button bg-indigo-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-indigo-700 disabled:bg-indigo-400"
        >
          {isSimulating ? (
            <>
              <CircleNotch className="h-4 w-4 animate-spin" />
              分析中...
            </>
          ) : (
            '模拟分析'
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-button border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="border-t border-gray-200 pt-6 dark:border-slate-700">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-2xl font-bold text-gray-400 dark:text-gray-500">vs</div>
              <div>
                <div className="text-sm text-gray-500 dark:text-gray-400">预估正确率变化</div>
                <div
                  className={`text-xl font-bold ${result.prediction.estimatedAccuracyChange >= 0 ? 'text-green-500' : 'text-red-500'}`}
                >
                  {result.prediction.estimatedAccuracyChange >= 0 ? '+' : ''}
                  {(result.prediction.estimatedAccuracyChange * 100).toFixed(1)}%
                </div>
              </div>
            </div>
            <div
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${
                result.prediction.wouldTriggerAdjustment
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              }`}
            >
              {result.prediction.wouldTriggerAdjustment ? <WarningCircle /> : <CheckCircle />}
              {result.prediction.wouldTriggerAdjustment ? '会触发调整' : '保持当前策略'}
            </div>
          </div>

          {result.prediction.suggestedDifficulty && (
            <div className="mb-4 rounded-button bg-blue-50 p-3 dark:bg-blue-900/20">
              <span className="text-sm text-blue-700 dark:text-blue-300">
                建议难度调整:{' '}
                <strong>
                  {result.prediction.suggestedDifficulty === 'easier' ? '降低难度' : '提高难度'}
                </strong>
              </span>
            </div>
          )}

          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 dark:text-white">分析说明：</h4>
            <div className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
              <ArrowRight className="mt-1 h-4 w-4 flex-shrink-0 text-gray-400" />
              <p>{result.explanation}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

CounterfactualPanel.displayName = 'CounterfactualPanel';

export default CounterfactualPanel;
