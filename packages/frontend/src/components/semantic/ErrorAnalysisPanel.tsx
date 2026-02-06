import React from 'react';
import { useErrorAnalysis } from '../../hooks/queries/useErrorAnalysis';
import { useSemanticStats } from '../../hooks/queries/useSemanticStats';
import { CircleNotch, CheckCircle, Warning } from '@phosphor-icons/react';

export const ErrorAnalysisPanel: React.FC = () => {
  const { stats } = useSemanticStats();
  const { analysis, isLoading } = useErrorAnalysis(stats?.available ?? false);

  if (!stats?.available) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="rounded-card border border-gray-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">错题语义分析</h3>
        <div className="flex items-center justify-center py-8">
          <CircleNotch className="animate-spin text-blue-500" size={32} />
        </div>
      </div>
    );
  }

  if (!analysis || analysis.totalErrors === 0) {
    return null;
  }

  const isDataInsufficient = analysis.totalErrors < 5 || analysis.analyzedWords < 2;
  const clusterStrength =
    !isDataInsufficient && analysis.isClustered
      ? Math.max(0, Math.min(100, (1 - analysis.averageDistance) * 100))
      : 0;

  return (
    <div className="animate-g3-fade-in rounded-button border border-gray-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">错题语义分析</h3>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <div className="rounded-button bg-gray-50 p-4 dark:bg-slate-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">错题总数</div>
          <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {analysis.totalErrors}
          </div>
        </div>
        <div className="rounded-button bg-gray-50 p-4 dark:bg-slate-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">分析单词数</div>
          <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {analysis.analyzedWords}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">聚类程度</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {clusterStrength.toFixed(0)}%
          </span>
        </div>
        <div className="h-3 rounded-full bg-gray-200 dark:bg-slate-700">
          <div
            className={`h-full rounded-full transition-all ${
              analysis.isClustered ? 'bg-orange-500' : 'bg-green-500'
            }`}
            style={{ width: `${clusterStrength}%` }}
          />
        </div>
        {isDataInsufficient && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            错题数量或向量数据不足，暂无法计算聚类程度
          </p>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-button bg-blue-50 p-4 dark:bg-blue-900/20">
        {isDataInsufficient ? (
          <Warning className="mt-0.5 flex-shrink-0 text-orange-500" size={20} />
        ) : analysis.isClustered ? (
          <Warning className="mt-0.5 flex-shrink-0 text-orange-500" size={20} />
        ) : (
          <CheckCircle className="mt-0.5 flex-shrink-0 text-green-500" size={20} />
        )}
        <p className="text-sm text-gray-700 dark:text-gray-300">{analysis.suggestion}</p>
      </div>
    </div>
  );
};
