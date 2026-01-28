import { useState, useEffect } from 'react';
import {
  X,
  CircleNotch,
  Clock,
  CheckCircle,
  XCircle,
  Flag,
  ChartLine,
} from '../../../components/Icon';
import { adminClient, WordLearningHistory, AnomalyFlag } from '../../../services/client';

interface WordDetailModalProps {
  userId: string;
  wordId: string;
  wordSpelling?: string;
  onClose: () => void;
}

export default function WordDetailModal({
  userId,
  wordId,
  wordSpelling,
  onClose,
}: WordDetailModalProps) {
  const [history, setHistory] = useState<WordLearningHistory | null>(null);
  const [flags, setFlags] = useState<AnomalyFlag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'history' | 'flags'>('history');

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, wordId]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [historyData, flagsData] = await Promise.all([
        adminClient.getWordLearningHistory(userId, wordId, 50),
        adminClient.getAnomalyFlags(userId, wordId).catch(() => []),
      ]);
      setHistory(historyData);
      setFlags(flagsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-card bg-white shadow-floating dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <ChartLine size={24} className="text-blue-500" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {wordSpelling || history?.word.spelling || wordId} 学习详情
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b border-gray-200 px-6 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'history'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <Clock size={16} />
              学习历史
            </span>
          </button>
          <button
            onClick={() => setActiveTab('flags')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'flags'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <Flag size={16} />
              异常标记 {flags.length > 0 && `(${flags.length})`}
            </span>
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <CircleNotch className="animate-spin text-blue-500" size={32} />
            </div>
          ) : error ? (
            <div className="py-12 text-center text-red-500">{error}</div>
          ) : activeTab === 'history' ? (
            <HistoryTab history={history} formatDate={formatDate} />
          ) : (
            <FlagsTab flags={flags} formatDate={formatDate} />
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryTab({
  history,
  formatDate,
}: {
  history: WordLearningHistory | null;
  formatDate: (ts: string) => string;
}) {
  if (!history || history.records.length === 0) {
    return <div className="py-12 text-center text-gray-500 dark:text-gray-400">暂无学习记录</div>;
  }

  const totalReviews = history.records.length;
  const correctCount = history.records.filter((r) => r.isCorrect).length;
  const correctRate = totalReviews > 0 ? (correctCount / totalReviews) * 100 : 0;
  const masteryLevel = history.wordState?.masteryLevel ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 rounded-button bg-gray-50 p-4 dark:bg-slate-900">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalReviews}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">总复习次数</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{correctRate.toFixed(0)}%</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">正确率</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{masteryLevel}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">掌握等级</div>
        </div>
      </div>

      <div className="space-y-2">
        {history.records.map((record, index) => (
          <div
            key={record.id || index}
            className="flex items-center justify-between rounded-button border border-gray-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="flex items-center gap-3">
              {record.isCorrect ? (
                <CheckCircle size={20} weight="fill" className="text-green-500" />
              ) : (
                <XCircle size={20} weight="fill" className="text-red-500" />
              )}
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {record.isCorrect ? '正确' : '错误'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDate(record.timestamp)}
                </div>
              </div>
            </div>
            {record.responseTime && (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {(record.responseTime / 1000).toFixed(1)}s
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FlagsTab({
  flags,
  formatDate,
}: {
  flags: AnomalyFlag[];
  formatDate: (ts: string) => string;
}) {
  if (flags.length === 0) {
    return <div className="py-12 text-center text-gray-500 dark:text-gray-400">无异常标记</div>;
  }

  return (
    <div className="space-y-3">
      {flags.map((flag) => (
        <div
          key={flag.id}
          className="rounded-button border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-800 dark:text-yellow-300">
              异常标记
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatDate(flag.flaggedAt)}
            </span>
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-300">{flag.reason}</div>
          {flag.notes && (
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">备注: {flag.notes}</div>
          )}
          {flag.flaggedBy && (
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              标记人: {flag.flaggedBy}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
