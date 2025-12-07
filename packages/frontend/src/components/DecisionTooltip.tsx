import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, TrendUp, TrendDown, Minus } from '@phosphor-icons/react';
import { EnhancedExplanation } from '../types/explainability';

interface Props {
  explanation?: EnhancedExplanation;
}

export const DecisionTooltip: React.FC<Props> = ({ explanation }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!explanation) {
    return null;
  }

  return (
    <div className="relative">
      {/* 触发按钮 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="inline-flex items-center gap-1 text-sm text-blue-600 transition-colors hover:text-blue-700"
        aria-label="查看决策详情"
      >
        <Info size={16} weight="fill" />
        <span>为什么这样安排？</span>
      </button>

      {/* 展开内容 */}
      <AnimatePresence>
        {isExpanded && (
          <>
            {/* 背景遮罩（点击关闭） */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExpanded(false)}
              className="fixed inset-0 z-40 bg-black/20"
              aria-hidden="true"
            />

            {/* Tooltip内容 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className="absolute left-0 top-full z-50 mt-2 w-96 rounded-lg border border-gray-200 bg-white p-4 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 主要原因 */}
              <div className="mb-3">
                <h4 className="mb-1 text-sm font-semibold text-gray-900">决策原因</h4>
                <p className="text-sm text-gray-700">{explanation.primaryReason}</p>
              </div>

              {/* 因素分解 */}
              {explanation.factorContributions.length > 0 && (
                <div className="mb-3">
                  <h4 className="mb-2 text-sm font-semibold text-gray-900">影响因素</h4>
                  <div className="space-y-2">
                    {explanation.factorContributions.map((factor, i) => (
                      <div key={i} className="flex items-start gap-2">
                        {factor.impact === 'positive' ? (
                          <TrendUp
                            size={16}
                            className="mt-0.5 flex-shrink-0 text-green-600"
                            weight="bold"
                          />
                        ) : factor.impact === 'negative' ? (
                          <TrendDown
                            size={16}
                            className="mt-0.5 flex-shrink-0 text-red-600"
                            weight="bold"
                          />
                        ) : (
                          <Minus size={16} className="mt-0.5 flex-shrink-0 text-gray-400" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="mb-0.5 flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {factor.factor}
                            </span>
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                              {factor.percentage}%
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed text-gray-600">
                            {factor.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 算法信息 */}
              <div className="border-t border-gray-200 pt-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="font-medium">算法:</span>
                    <span className="rounded bg-gray-100 px-2 py-0.5 font-mono uppercase">
                      {explanation.algorithmInfo.algorithm}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="font-medium">信心度:</span>
                    <span
                      className={`font-semibold ${
                        explanation.algorithmInfo.confidence > 0.7
                          ? 'text-green-600'
                          : explanation.algorithmInfo.confidence > 0.4
                            ? 'text-yellow-600'
                            : 'text-red-600'
                      }`}
                    >
                      {(explanation.algorithmInfo.confidence * 100).toFixed(0)}%
                    </span>
                  </span>
                </div>
                {explanation.algorithmInfo.phase && (
                  <div className="mt-1 text-xs text-gray-500">
                    <span className="font-medium">阶段:</span>
                    <span className="ml-1">{explanation.algorithmInfo.phase}</span>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
