import React, { useState } from 'react';
import { CaretDown, CaretUp, Clock, Fire } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import { MasteryEvaluation, ReviewTraceRecord, WordMasteryIntervalResponse } from '../../types/word-mastery';
import { MemoryTraceChart } from './MemoryTraceChart';
import apiClient from '../../services/ApiClient';

interface MasteryWordItemProps {
  wordId: string;
  spelling: string;
  meanings: string;
  mastery: MasteryEvaluation | null;
}

export const MasteryWordItem: React.FC<MasteryWordItemProps> = ({
  wordId,
  spelling,
  meanings,
  mastery
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [trace, setTrace] = useState<ReviewTraceRecord[] | null>(null);
  const [nextReview, setNextReview] = useState<WordMasteryIntervalResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    if (!isExpanded && !trace) {
      setLoading(true);
      try {
        const [traceData, intervalData] = await Promise.all([
          apiClient.getWordMasteryTrace(wordId),
          apiClient.getWordMasteryInterval(wordId)
        ]);
        setTrace(traceData.trace); // Extract trace array from WordMasteryTrace response
        setNextReview(intervalData);
      } catch (err) {
        console.error('Failed to load word details:', err);
      } finally {
        setLoading(false);
      }
    }
    setIsExpanded(!isExpanded);
  };

  const getMasteryLevel = (): { label: string; color: string; bgColor: string } => {
    if (!mastery) {
      return { label: '未学习', color: 'text-gray-500', bgColor: 'bg-gray-100' };
    }

    if (mastery.isLearned) {
      return { label: '已掌握', color: 'text-green-600', bgColor: 'bg-green-100' };
    }

    if (mastery.score >= 0.7) {
      return { label: '熟练', color: 'text-blue-600', bgColor: 'bg-blue-100' };
    }

    if (mastery.score >= 0.4) {
      return { label: '学习中', color: 'text-yellow-600', bgColor: 'bg-yellow-100' };
    }

    return { label: '需复习', color: 'text-orange-600', bgColor: 'bg-orange-100' };
  };

  const level = getMasteryLevel();

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white hover:shadow-md transition-shadow">
      <button
        onClick={handleToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-4 flex-1">
          <div className="flex-1 text-left">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-lg font-bold text-gray-800">{spelling}</h3>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${level.color} ${level.bgColor}`}>
                {level.label}
              </span>
            </div>
            <p className="text-sm text-gray-500 line-clamp-1">{meanings}</p>
          </div>

          {mastery && (
            <div className="flex items-center gap-6 text-sm">
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">掌握度评分</p>
                <div className="flex items-center gap-1">
                  <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-400 to-purple-600 rounded-full transition-all"
                      style={{ width: `${mastery.score * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-gray-600">{Math.round(mastery.score * 100)}%</span>
                </div>
              </div>

              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">置信度</p>
                <p className="text-sm font-semibold text-gray-700">{Math.round(mastery.confidence * 100)}%</p>
              </div>
            </div>
          )}
        </div>

        <div className="ml-4">
          {isExpanded ? (
            <CaretUp size={20} className="text-gray-400" />
          ) : (
            <CaretDown size={20} className="text-gray-400" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t border-gray-100"
          >
            <div className="px-6 py-6 bg-gray-50 space-y-6">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
                </div>
              ) : (
                <>
                  {/* Memory Trace Chart */}
                  {trace && trace.length > 0 && (
                    <div className="bg-white rounded-xl p-4 shadow-sm">
                      <h4 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                        <Fire size={18} className="text-purple-500" />
                        记忆强度轨迹
                      </h4>
                      <MemoryTraceChart trace={trace} />
                    </div>
                  )}

                  {/* Next Review Info */}
                  {nextReview && (
                    <div className="bg-white rounded-xl p-4 shadow-sm">
                      <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                        <Clock size={18} className="text-blue-500" />
                        复习预测
                      </h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-gray-400 mb-1">最佳间隔</p>
                          <p className="text-sm font-semibold text-gray-700">{nextReview.humanReadable.optimal}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-1">最小间隔</p>
                          <p className="text-sm font-semibold text-gray-700">{nextReview.humanReadable.min}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-1">最大间隔</p>
                          <p className="text-sm font-semibold text-gray-700">{nextReview.humanReadable.max}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Mastery Details */}
                  {mastery && (
                    <div className="bg-white rounded-xl p-4 shadow-sm">
                      <h4 className="text-sm font-bold text-gray-700 mb-3">详细统计</h4>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-xs text-gray-400 mb-1">SRS等级</p>
                          <p className="text-lg font-semibold text-blue-600">
                            {mastery.factors.srsLevel}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-1">ACT-R提取概率</p>
                          <p className="text-lg font-semibold text-green-600">
                            {Math.round(mastery.factors.actrRecall * 100)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-1">近期准确率</p>
                          <p className="text-lg font-semibold text-purple-600">
                            {Math.round(mastery.factors.recentAccuracy * 100)}%
                          </p>
                        </div>
                      </div>
                      {mastery.suggestion && (
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                          <p className="text-sm text-blue-700">{mastery.suggestion}</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
