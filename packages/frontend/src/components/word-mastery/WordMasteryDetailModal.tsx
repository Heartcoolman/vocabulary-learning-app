import React, { useState, useEffect, useCallback } from 'react';
import { X, Clock, Fire, ChartLine, Warning, CheckCircle, CircleNotch, Lightbulb } from '../Icon';
import { Modal } from '../ui/Modal';
import { MemoryTraceChart } from './MemoryTraceChart';
import apiClient from '../../services/client';
import { learningLogger } from '../../utils/logger';
import type {
  MasteryEvaluation,
  ReviewTraceRecord,
  WordMasteryIntervalResponse,
} from '../../types/word-mastery';

interface WordMasteryDetailModalProps {
  wordId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface WordDetailData {
  spelling: string;
  phonetic: string;
  meanings: string[];
  mastery: MasteryEvaluation | null;
  trace: ReviewTraceRecord[];
  interval: WordMasteryIntervalResponse | null;
}

/**
 * 单词掌握度详情模态框
 * 显示单词的详细学习轨迹、掌握度评估和复习建议
 */
export const WordMasteryDetailModal: React.FC<WordMasteryDetailModalProps> = ({
  wordId,
  isOpen,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<WordDetailData | null>(null);

  const loadDetailData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 并发加载所有数据
      const [wordData, masteryData, traceData, intervalData] = await Promise.all([
        // 通过 getLearnedWords 获取单词基本信息（假设单词在已学习列表中）
        apiClient.getLearnedWords().then((words) => words.find((w) => w.id === wordId)),
        // 获取掌握度评估
        apiClient.getWordMasteryDetail(wordId).catch(() => null),
        // 获取学习轨迹
        apiClient.getWordMasteryTrace(wordId).catch(() => ({ wordId, trace: [], count: 0 })),
        // 获取复习间隔预测
        apiClient.getWordMasteryInterval(wordId).catch(() => null),
      ]);

      if (!wordData) {
        setError('未找到该单词信息');
        return;
      }

      setData({
        spelling: wordData.spelling,
        phonetic: wordData.phonetic ?? '',
        meanings: wordData.meanings,
        mastery: masteryData,
        trace: traceData.trace,
        interval: intervalData,
      });
    } catch (err) {
      setError('加载数据失败，请稍后重试');
      learningLogger.error({ err, wordId }, '加载单词详情失败');
    } finally {
      setLoading(false);
    }
  }, [wordId]);

  useEffect(() => {
    if (isOpen && wordId) {
      loadDetailData();
    }
  }, [isOpen, wordId, loadDetailData]);

  const getMasteryLevel = (
    mastery: MasteryEvaluation | null,
  ): {
    label: string;
    color: string;
    bgColor: string;
    icon: React.ReactNode;
  } => {
    if (!mastery) {
      return {
        label: '未学习',
        color: 'text-gray-500',
        bgColor: 'bg-gray-100',
        icon: <Warning size={20} className="text-gray-500" />,
      };
    }

    if (mastery.isLearned) {
      return {
        label: '已掌握',
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        icon: <CheckCircle size={20} className="text-green-600" weight="fill" />,
      };
    }

    if (mastery.score >= 0.7) {
      return {
        label: '熟练',
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        icon: <Fire size={20} className="text-blue-600" weight="fill" />,
      };
    }

    if (mastery.score >= 0.4) {
      return {
        label: '学习中',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        icon: <ChartLine size={20} className="text-yellow-600" />,
      };
    }

    return {
      label: '需复习',
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
      icon: <Clock size={20} className="text-orange-600" />,
    };
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <CircleNotch size={48} className="mb-4 animate-spin text-purple-500" />
          <p className="text-gray-500">加载中...</p>
        </div>
      );
    }

    if (error || !data) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <Warning size={48} className="mb-4 text-red-400" />
          <p className="mb-4 text-gray-600">{error || '加载失败'}</p>
          <button
            onClick={loadDetailData}
            className="rounded-lg bg-purple-500 px-4 py-2 text-white transition-colors hover:bg-purple-600"
          >
            重试
          </button>
        </div>
      );
    }

    const level = getMasteryLevel(data.mastery);

    return (
      <div className="space-y-6">
        {/* 单词头部信息 */}
        <div className="rounded-xl bg-gradient-to-br from-purple-50 to-blue-50 p-6">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex-1">
              <h2 className="mb-2 text-3xl font-bold text-gray-900">{data.spelling}</h2>
              <p className="mb-3 text-gray-600">{data.phonetic}</p>
              <div className="space-y-2">
                {data.meanings.map((meaning, idx) => (
                  <p key={idx} className="text-gray-700">
                    {idx + 1}. {meaning}
                  </p>
                ))}
              </div>
            </div>
            <div className={`flex items-center gap-2 rounded-full px-4 py-2 ${level.bgColor}`}>
              {level.icon}
              <span className={`font-semibold ${level.color}`}>{level.label}</span>
            </div>
          </div>
        </div>

        {/* 掌握度评估 */}
        {data.mastery && (
          <div className="animate-g3-fade-in rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800">
              <ChartLine size={24} className="text-purple-500" />
              掌握度评估
            </h3>
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              <div>
                <p className="mb-2 text-sm text-gray-500">综合得分</p>
                <div className="space-y-2">
                  <p className="text-2xl font-bold text-purple-600">
                    {Math.round(data.mastery.score * 100)}
                  </p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-400 to-purple-600 transition-all"
                      style={{ width: `${data.mastery.score * 100}%` }}
                    />
                  </div>
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm text-gray-500">置信度</p>
                <p className="text-2xl font-bold text-blue-600">
                  {Math.round(data.mastery.confidence * 100)}%
                </p>
              </div>
              <div>
                <p className="mb-2 text-sm text-gray-500">SRS等级</p>
                <p className="text-2xl font-bold text-green-600">{data.mastery.factors.srsLevel}</p>
              </div>
              <div>
                <p className="mb-2 text-sm text-gray-500">近期准确率</p>
                <p className="text-2xl font-bold text-orange-600">
                  {Math.round(data.mastery.factors.recentAccuracy * 100)}%
                </p>
              </div>
            </div>

            {/* 详细因素 */}
            <div className="mt-6 border-t border-gray-100 pt-6">
              <p className="mb-3 text-sm font-semibold text-gray-700">评估因素</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">ACT-R 提取概率</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-green-500"
                        style={{ width: `${data.mastery.factors.actrRecall * 100}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-sm font-semibold text-gray-700">
                      {Math.round(data.mastery.factors.actrRecall * 100)}%
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">用户疲劳度</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-red-500"
                        style={{ width: `${data.mastery.factors.userFatigue * 100}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-sm font-semibold text-gray-700">
                      {Math.round(data.mastery.factors.userFatigue * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 建议 */}
            {data.mastery.suggestion && (
              <div className="mt-6 flex items-start gap-3 rounded-lg bg-blue-50 p-4">
                <Lightbulb size={20} className="mt-0.5 flex-shrink-0 text-blue-500" weight="fill" />
                <div>
                  <p className="mb-1 text-sm font-semibold text-blue-900">学习建议</p>
                  <p className="text-sm text-blue-700">{data.mastery.suggestion}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 学习轨迹图表 */}
        {data.trace.length > 0 && (
          <div className="animate-g3-fade-in rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800">
              <Fire size={24} className="text-orange-500" weight="fill" />
              学习轨迹
            </h3>
            <div className="mb-4">
              <p className="text-sm text-gray-500">共 {data.trace.length} 次复习记录</p>
            </div>
            <MemoryTraceChart trace={data.trace} />
          </div>
        )}

        {/* 评估结果历史 */}
        {data.trace.length > 0 && (
          <div className="animate-g3-fade-in rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800">
              <Clock size={24} className="text-blue-500" />
              评估历史
            </h3>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {data.trace.slice(0, 10).map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between rounded-lg bg-gray-50 p-3 transition-colors hover:bg-gray-100"
                >
                  <div className="flex items-center gap-3">
                    {record.isCorrect ? (
                      <CheckCircle size={20} className="text-green-500" weight="fill" />
                    ) : (
                      <X size={20} className="text-red-500" weight="bold" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        {record.isCorrect ? '回答正确' : '回答错误'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(record.timestamp).toLocaleString('zh-CN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">
                      {record.responseTime ? `${(record.responseTime / 1000).toFixed(1)}s` : '-'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {data.trace.length > 10 && (
              <p className="mt-3 text-center text-xs text-gray-400">
                显示最近 10 条记录，共 {data.trace.length} 条
              </p>
            )}
          </div>
        )}

        {/* 复习建议 */}
        {data.interval && (
          <div className="animate-g3-fade-in rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-purple-50 p-6">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800">
              <Clock size={24} className="text-blue-500" />
              复习建议
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-white p-4 text-center">
                <p className="mb-2 text-xs text-gray-500">最小间隔</p>
                <p className="text-lg font-bold text-gray-700">{data.interval.humanReadable.min}</p>
              </div>
              <div className="rounded-lg border-2 border-blue-300 bg-white p-4 text-center">
                <p className="mb-2 text-xs font-semibold text-blue-600">最佳间隔</p>
                <p className="text-lg font-bold text-blue-600">
                  {data.interval.humanReadable.optimal}
                </p>
              </div>
              <div className="rounded-lg bg-white p-4 text-center">
                <p className="mb-2 text-xs text-gray-500">最大间隔</p>
                <p className="text-lg font-bold text-gray-700">{data.interval.humanReadable.max}</p>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-white p-3">
              <p className="text-sm text-gray-600">
                目标提取概率：
                <span className="ml-1 font-semibold text-gray-800">
                  {Math.round(data.interval.interval.targetRecall * 100)}%
                </span>
              </p>
            </div>
          </div>
        )}

        {/* 空状态 */}
        {!data.mastery && data.trace.length === 0 && (
          <div className="rounded-xl bg-gray-50 p-12 text-center">
            <Warning size={48} className="mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">该单词暂无学习记录</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="xl">
      <div className="max-h-[80vh] overflow-y-auto">{renderContent()}</div>
    </Modal>
  );
};
