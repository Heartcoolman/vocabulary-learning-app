import React, { useState } from 'react';
import { Flask, ArrowRight, CheckCircle, WarningCircle, CircleNotch } from '@phosphor-icons/react';
import { explainabilityApi } from '../../services/explainabilityApi';
import type { CounterfactualResult } from '../../types/explainability';

interface CounterfactualPanelProps {
  currentWordId: string;
  decisionId?: string;
}

const CounterfactualPanel: React.FC<CounterfactualPanelProps> = ({ decisionId }) => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CounterfactualResult | null>(null);

  // 状态覆盖值
  const [overrides, setOverrides] = useState({
    attention: 0.7,
    fatigue: 0.3,
    motivation: 0.8,
    recentAccuracy: 0.75
  });

  const handleSimulate = async () => {
    setIsSimulating(true);
    setError(null);
    try {
      const response = await explainabilityApi.runCounterfactual({
        decisionId,
        overrides
      });
      setResult(response);
    } catch (err) {
      console.error('反事实分析失败:', err);
      setError('分析失败，请稍后重试');
    } finally {
      setIsSimulating(false);
    }
  };

  const renderSlider = (
    label: string,
    value: number,
    key: keyof typeof overrides,
    description: string
  ) => (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
        <span className="text-sm text-indigo-600 font-mono">{(value * 100).toFixed(0)}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value * 100}
        onChange={(e) => setOverrides(prev => ({ ...prev, [key]: parseInt(e.target.value) / 100 }))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
      />
      <p className="text-xs text-gray-500">{description}</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 p-5 rounded-xl border border-indigo-100 dark:border-indigo-800">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
          <Flask className="w-6 h-6 text-purple-500" />
          如果我的状态不同会怎样？
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          调整下面的参数，AMAS 将分析在不同状态下系统会如何调整学习策略。
        </p>

        <div className="space-y-4">
          {renderSlider('注意力', overrides.attention, 'attention', '模拟更高或更低的注意力水平')}
          {renderSlider('疲劳度', overrides.fatigue, 'fatigue', '模拟不同的疲劳程度')}
          {renderSlider('学习动机', overrides.motivation, 'motivation', '模拟学习积极性变化')}
          {renderSlider('近期正确率', overrides.recentAccuracy, 'recentAccuracy', '模拟答题表现变化')}
        </div>

        <button
          onClick={handleSimulate}
          disabled={isSimulating}
          className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-6 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          {isSimulating ? (
            <>
              <CircleNotch className="w-4 h-4 animate-spin" />
              分析中...
            </>
          ) : (
            '模拟分析'
          )}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="text-2xl font-bold text-gray-400">vs</div>
              <div>
                <div className="text-sm text-gray-500">预估正确率变化</div>
                <div className={`text-xl font-bold ${result.prediction.estimatedAccuracyChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {result.prediction.estimatedAccuracyChange >= 0 ? '+' : ''}{(result.prediction.estimatedAccuracyChange * 100).toFixed(1)}%
                </div>
              </div>
            </div>
            <div className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${
              result.prediction.wouldTriggerAdjustment
                ? 'bg-amber-100 text-amber-700'
                : 'bg-green-100 text-green-700'
            }`}>
              {result.prediction.wouldTriggerAdjustment ? <WarningCircle /> : <CheckCircle />}
              {result.prediction.wouldTriggerAdjustment ? '会触发调整' : '保持当前策略'}
            </div>
          </div>

          {result.prediction.suggestedDifficulty && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <span className="text-sm text-blue-700 dark:text-blue-300">
                建议难度调整: <strong>{result.prediction.suggestedDifficulty === 'easier' ? '降低难度' : '提高难度'}</strong>
              </span>
            </div>
          )}

          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 dark:text-white">分析说明：</h4>
            <div className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
              <ArrowRight className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
              <p>{result.explanation}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CounterfactualPanel;
