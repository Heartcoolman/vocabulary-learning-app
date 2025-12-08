import React, { useState } from 'react';
import { CaretDown, CaretUp, Clock, Fire } from '@phosphor-icons/react';
import {
  MasteryEvaluation,
  ReviewTraceRecord,
  WordMasteryIntervalResponse,
} from '../../types/word-mastery';
import { MemoryTraceChart } from './MemoryTraceChart';
import apiClient from '../../services/client';
import { learningLogger } from '../../utils/logger';

interface MasteryWordItemProps {
  wordId: string;
  spelling: string;
  meanings: string;
  mastery: MasteryEvaluation | null;
}

const MasteryWordItemComponent: React.FC<MasteryWordItemProps> = ({
  wordId,
  spelling,
  meanings,
  mastery,
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
          apiClient.getWordMasteryInterval(wordId),
        ]);
        setTrace(traceData.trace); // Extract trace array from WordMasteryTrace response
        setNextReview(intervalData);
      } catch (err) {
        learningLogger.error({ err, wordId }, '加载单词详情失败');
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
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md">
      <button
        onClick={handleToggle}
        className="flex w-full items-center justify-between px-6 py-4 transition-colors hover:bg-gray-50"
      >
        <div className="flex flex-1 items-center gap-4">
          <div className="flex-1 text-left">
            <div className="mb-1 flex items-center gap-3">
              <h3 className="text-lg font-bold text-gray-800">{spelling}</h3>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${level.color} ${level.bgColor}`}
              >
                {level.label}
              </span>
            </div>
            <p className="line-clamp-1 text-sm text-gray-500">{meanings}</p>
          </div>

          {mastery && (
            <div className="flex items-center gap-6 text-sm">
              <div className="text-center">
                <p className="mb-1 text-xs text-gray-400">掌握度评分</p>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-20 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-400 to-purple-600 transition-all"
                      style={{ width: `${mastery.score * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs text-gray-600">
                    {Math.round(mastery.score * 100)}%
                  </span>
                </div>
              </div>

              <div className="text-center">
                <p className="mb-1 text-xs text-gray-400">置信度</p>
                <p className="text-sm font-semibold text-gray-700">
                  {Math.round(mastery.confidence * 100)}%
                </p>
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

      {isExpanded && (
        <div className="animate-expand border-t border-gray-100">
          <div className="space-y-6 bg-gray-50 px-6 py-6">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-purple-500"></div>
              </div>
            ) : (
              <>
                {/* Memory Trace Chart */}
                {trace && trace.length > 0 && (
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                    <h4 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-700">
                      <Fire size={18} className="text-purple-500" />
                      记忆强度轨迹
                    </h4>
                    <MemoryTraceChart trace={trace} />
                  </div>
                )}

                {/* Next Review Info */}
                {nextReview && (
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                    <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-700">
                      <Clock size={18} className="text-blue-500" />
                      复习预测
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="mb-1 text-xs text-gray-400">最佳间隔</p>
                        <p className="text-sm font-semibold text-gray-700">
                          {nextReview.humanReadable.optimal}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-gray-400">最小间隔</p>
                        <p className="text-sm font-semibold text-gray-700">
                          {nextReview.humanReadable.min}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-gray-400">最大间隔</p>
                        <p className="text-sm font-semibold text-gray-700">
                          {nextReview.humanReadable.max}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Mastery Details */}
                {mastery && (
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                    <h4 className="mb-3 text-sm font-bold text-gray-700">详细统计</h4>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="mb-1 text-xs text-gray-400">SRS等级</p>
                        <p className="text-lg font-semibold text-blue-600">
                          {mastery.factors.srsLevel}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-gray-400">ACT-R提取概率</p>
                        <p className="text-lg font-semibold text-green-600">
                          {Math.round(mastery.factors.actrRecall * 100)}%
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-gray-400">近期准确率</p>
                        <p className="text-lg font-semibold text-purple-600">
                          {Math.round(mastery.factors.recentAccuracy * 100)}%
                        </p>
                      </div>
                    </div>
                    {mastery.suggestion && (
                      <div className="mt-4 rounded-lg bg-blue-50 p-3">
                        <p className="text-sm text-blue-700">{mastery.suggestion}</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Deep comparison for MasteryEvaluation object
 */
const compareMasteryEvaluation = (
  prev: MasteryEvaluation | null,
  next: MasteryEvaluation | null,
): boolean => {
  if (prev === null && next === null) return true;
  if (prev === null || next === null) return false;

  return (
    prev.score === next.score &&
    prev.confidence === next.confidence &&
    prev.isLearned === next.isLearned &&
    prev.factors.srsLevel === next.factors.srsLevel &&
    prev.factors.actrRecall === next.factors.actrRecall &&
    prev.factors.recentAccuracy === next.factors.recentAccuracy &&
    prev.suggestion === next.suggestion
  );
};

/**
 * Memoized MasteryWordItem component
 * Optimizes re-renders by deep comparing mastery evaluation
 * Note: Component has internal state for expansion, so memo only prevents
 * unnecessary re-renders from parent prop changes
 */
export const MasteryWordItem = React.memo(MasteryWordItemComponent, (prevProps, nextProps) => {
  return (
    prevProps.wordId === nextProps.wordId &&
    prevProps.spelling === nextProps.spelling &&
    prevProps.meanings === nextProps.meanings &&
    compareMasteryEvaluation(prevProps.mastery, nextProps.mastery)
  );
});
