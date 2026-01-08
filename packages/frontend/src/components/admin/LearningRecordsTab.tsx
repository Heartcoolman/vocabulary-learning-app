import { CheckCircle, XCircle, Clock, Hash, BookOpen, ArrowClockwise } from '@phosphor-icons/react';
import { useLearningData } from '../../hooks/useLearningData';
import { DISPLAY_CONFIG } from '../../constants/systemHealth';

interface LearningRecordsTabProps {
  userId: string;
}

export default function LearningRecordsTab({ userId }: LearningRecordsTabProps) {
  const { data, loading, error, refresh } = useLearningData(userId);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500" />
          <p className="text-gray-600 dark:text-slate-300">加载学习记录中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-card border border-red-100 bg-red-50 p-8 text-center dark:border-red-900/50 dark:bg-red-900/20">
        <div className="mb-2 text-xl font-bold text-red-500">加载失败</div>
        <p className="mb-4 text-red-600">{error}</p>
        <button
          onClick={refresh}
          className="rounded-button border border-red-200 bg-white px-4 py-2 text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-900/30"
        >
          重试
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="animate-g3-fade-in space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="flex items-center justify-between rounded-card border border-gray-200 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-slate-400">总学习记录</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {data.totalRecords}
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            <Hash size={20} weight="bold" />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-card border border-gray-200 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-slate-400">平均正确率</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {data.averageAccuracy.toFixed(1)}%
            </p>
          </div>
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full ${
              data.averageAccuracy >= 80
                ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                : data.averageAccuracy >= 60
                  ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
                  : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
            }`}
          >
            <CheckCircle size={20} weight="bold" />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-card border border-gray-200 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-slate-400">学习单词总数</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {data.totalWordsLearned}
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
            <BookOpen size={20} weight="bold" />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-gray-200 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="font-bold text-gray-900 dark:text-white">
            最近学习记录（最新 {DISPLAY_CONFIG.LEARNING_RECORDS_LIMIT} 条）
          </h3>
          <button
            onClick={refresh}
            className="rounded-button p-2 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
            title="刷新列表"
          >
            <ArrowClockwise size={18} weight="bold" />
          </button>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-slate-700">
          {data.recentRecords.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-slate-400">暂无学习记录</div>
          ) : (
            data.recentRecords.map((record) => (
              <div
                key={record.id}
                className="flex flex-col justify-between gap-4 p-4 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700/50 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <div
                    className={`mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                      record.isCorrect
                        ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                    }`}
                  >
                    {record.isCorrect ? (
                      <CheckCircle size={18} weight="fill" />
                    ) : (
                      <XCircle size={18} weight="fill" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold text-gray-900 dark:text-white">
                        {record.word.spelling}
                      </span>
                      <span className="font-mono text-sm text-gray-500 dark:text-slate-400">
                        {record.word.phonetic}
                      </span>
                    </div>
                    <p className="max-w-md truncate text-sm text-gray-600 dark:text-slate-300">
                      {record.word.meanings.join(', ')}
                    </p>
                  </div>
                </div>

                <div className="min-w-0 flex-1 sm:text-center">
                  {!record.isCorrect && (
                    <div className="text-sm">
                      <div className="text-red-600 line-through opacity-75">
                        {record.selectedAnswer}
                      </div>
                      <div className="font-medium text-green-600">→ {record.correctAnswer}</div>
                    </div>
                  )}
                  {record.isCorrect && (
                    <div className="text-sm font-medium text-green-600">
                      {record.selectedAnswer}
                    </div>
                  )}
                </div>

                <div className="flex min-w-[200px] items-center gap-6 text-sm text-gray-500 dark:text-slate-400 sm:justify-end">
                  <div className="flex items-center gap-1" title="响应时间">
                    <Clock size={14} />
                    <span
                      className={
                        (record.responseTime || 0) > 5000
                          ? 'font-medium text-orange-500'
                          : 'text-gray-600 dark:text-slate-300'
                      }
                    >
                      {record.responseTime ? `${(record.responseTime / 1000).toFixed(1)}s` : '-'}
                    </span>
                  </div>
                  <div className="font-mono text-xs">
                    {new Date(record.timestamp).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
