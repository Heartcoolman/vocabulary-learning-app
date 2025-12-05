import { CheckCircle, XCircle, Clock, Hash, BookOpen, ArrowClockwise } from '@phosphor-icons/react';
import { useLearningData } from '../../hooks/useLearningData';

interface LearningRecordsTabProps {
  userId: string;
}

export default function LearningRecordsTab({ userId }: LearningRecordsTabProps) {
  const { data, loading, error, refresh } = useLearningData(userId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">加载学习记录中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-xl p-8 text-center">
        <div className="text-red-500 text-xl font-bold mb-2">加载失败</div>
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={refresh}
          className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
        >
          重试
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6 animate-g3-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 font-medium">总学习记录</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{data.totalRecords}</p>
          </div>
          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
            <Hash size={20} weight="bold" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 font-medium">平均正确率</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{data.averageAccuracy.toFixed(1)}%</p>
          </div>
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              data.averageAccuracy >= 80
                ? 'bg-green-50 text-green-600'
                : data.averageAccuracy >= 60
                ? 'bg-yellow-50 text-yellow-600'
                : 'bg-red-50 text-red-600'
            }`}
          >
            <CheckCircle size={20} weight="bold" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 font-medium">学习单词总数</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{data.totalWordsLearned}</p>
          </div>
          <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center text-purple-600">
            <BookOpen size={20} weight="bold" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <h3 className="font-bold text-gray-900">最近学习记录（最新 50 条）</h3>
          <button
            onClick={refresh}
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="刷新列表"
          >
            <ArrowClockwise size={18} weight="bold" />
          </button>
        </div>

        <div className="divide-y divide-gray-100">
          {data.recentRecords.length === 0 ? (
            <div className="p-8 text-center text-gray-500">暂无学习记录</div>
          ) : (
            data.recentRecords.map((record) => (
              <div
                key={record.id}
                className="p-4 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  <div
                    className={`mt-1 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      record.isCorrect ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
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
                      <span className="font-bold text-gray-900 text-lg">{record.word.spelling}</span>
                      <span className="text-gray-500 text-sm font-mono">{record.word.phonetic}</span>
                    </div>
                    <p className="text-sm text-gray-600 truncate max-w-md">
                      {record.word.meanings.join(', ')}
                    </p>
                  </div>
                </div>

                <div className="flex-1 min-w-0 sm:text-center">
                  {!record.isCorrect && (
                    <div className="text-sm">
                      <div className="text-red-600 line-through opacity-75">{record.selectedAnswer}</div>
                      <div className="text-green-600 font-medium">→ {record.correctAnswer}</div>
                    </div>
                  )}
                  {record.isCorrect && (
                    <div className="text-sm text-green-600 font-medium">{record.selectedAnswer}</div>
                  )}
                </div>

                <div className="flex items-center gap-6 text-sm text-gray-500 sm:justify-end min-w-[200px]">
                  <div className="flex items-center gap-1" title="响应时间">
                    <Clock size={14} />
                    <span
                      className={
                        (record.responseTime || 0) > 5000 ? 'text-orange-500 font-medium' : 'text-gray-600'
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
