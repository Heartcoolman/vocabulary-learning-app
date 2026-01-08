import React from 'react';
import { Brain, ArrowUp, ArrowDown } from '../Icon';
import { CognitiveGrowthResult } from '../../types/amas-enhanced';

interface CognitiveGrowthPanelProps {
  cognitiveGrowth: CognitiveGrowthResult;
}

/**
 * CognitiveGrowthPanel - 认知成长对比面板
 */
const CognitiveGrowthPanel: React.FC<CognitiveGrowthPanelProps> = React.memo(
  ({ cognitiveGrowth }) => {
    return (
      <div className="mb-6 rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Brain size={24} weight="duotone" color="#a855f7" />
          认知成长对比（{cognitiveGrowth.period} 天）
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* 记忆力 */}
          <div className="rounded-card bg-purple-50 p-4 dark:bg-purple-900/20">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                记忆力
              </span>
              <div
                className={`flex items-center gap-1 ${
                  cognitiveGrowth.changes.memory.direction === 'up'
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {cognitiveGrowth.changes.memory.direction === 'up' ? (
                  <ArrowUp size={16} weight="bold" />
                ) : (
                  <ArrowDown size={16} weight="bold" />
                )}
                <span className="text-sm font-bold">
                  {cognitiveGrowth.changes.memory.percent.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-slate-400">
                {(cognitiveGrowth.past.memory * 100).toFixed(0)}%
              </span>
              <span className="text-gray-400 dark:text-slate-500">→</span>
              <span className="font-bold text-purple-700 dark:text-purple-300">
                {(cognitiveGrowth.current.memory * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* 速度 */}
          <div className="rounded-card bg-blue-50 p-4 dark:bg-blue-900/20">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">速度</span>
              <div
                className={`flex items-center gap-1 ${
                  cognitiveGrowth.changes.speed.direction === 'up'
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {cognitiveGrowth.changes.speed.direction === 'up' ? (
                  <ArrowUp size={16} weight="bold" />
                ) : (
                  <ArrowDown size={16} weight="bold" />
                )}
                <span className="text-sm font-bold">
                  {cognitiveGrowth.changes.speed.percent.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-slate-400">
                {(cognitiveGrowth.past.speed * 100).toFixed(0)}%
              </span>
              <span className="text-gray-400 dark:text-slate-500">→</span>
              <span className="font-bold text-blue-700 dark:text-blue-300">
                {(cognitiveGrowth.current.speed * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* 稳定性 */}
          <div className="rounded-card bg-green-50 p-4 dark:bg-green-900/20">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-green-700 dark:text-green-300">稳定性</span>
              <div
                className={`flex items-center gap-1 ${
                  cognitiveGrowth.changes.stability.direction === 'up'
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {cognitiveGrowth.changes.stability.direction === 'up' ? (
                  <ArrowUp size={16} weight="bold" />
                ) : (
                  <ArrowDown size={16} weight="bold" />
                )}
                <span className="text-sm font-bold">
                  {cognitiveGrowth.changes.stability.percent.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-slate-400">
                {(cognitiveGrowth.past.stability * 100).toFixed(0)}%
              </span>
              <span className="text-gray-400 dark:text-slate-500">→</span>
              <span className="font-bold text-green-700 dark:text-green-300">
                {(cognitiveGrowth.current.stability * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

CognitiveGrowthPanel.displayName = 'CognitiveGrowthPanel';

export default CognitiveGrowthPanel;
