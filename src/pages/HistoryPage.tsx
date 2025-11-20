import { useState, useEffect } from 'react';
import StorageService from '../services/StorageService';
import { handleError } from '../utils/errorHandler';

interface WordStats {
  wordId: string;
  spelling: string;
  attempts: number;
  correct: number;
  correctRate: number;
  lastStudied: number;
}

/**
 * HistoryPage - 学习历史页面
 * 显示学习统计和单词学习详情
 */
export default function HistoryPage() {
  const [stats, setStats] = useState<WordStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    try {
      setIsLoading(true);
      const statistics = await StorageService.getStudyStatistics();
      const words = await StorageService.getWords();

      // 转换统计数据为数组
      const statsArray: WordStats[] = [];
      statistics.wordStats.forEach((stat, wordId) => {
        const word = words.find(w => w.id === wordId);
        if (word) {
          statsArray.push({
            wordId,
            spelling: word.spelling,
            attempts: stat.attempts,
            correct: stat.correct,
            correctRate: stat.attempts > 0 ? (stat.correct / stat.attempts) * 100 : 0,
            lastStudied: stat.lastStudied,
          });
        }
      });

      // 按最后学习时间排序
      statsArray.sort((a, b) => b.lastStudied - a.lastStudied);

      setStats(statsArray);
      setError(null);
    } catch (err) {
      setError(handleError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    
    return date.toLocaleDateString('zh-CN');
  };

  const getCorrectRateColor = (rate: number) => {
    if (rate >= 80) return 'text-green-600';
    if (rate >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getCorrectRateBg = (rate: number) => {
    if (rate >= 80) return 'bg-green-100';
    if (rate >= 60) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600" role="status" aria-live="polite">正在加载...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="text-center max-w-md px-4" role="alert">
          <div className="text-red-500 text-5xl mb-4" aria-hidden="true">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">出错了</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={loadStatistics}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 animate-fade-in">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">学习历史</h1>

      {stats.length === 0 ? (
        <div className="text-center py-12 animate-fade-in">
          <p className="text-gray-500 text-lg mb-4">还没有学习记录</p>
          <p className="text-gray-400 mb-6">开始学习单词后，这里会显示你的学习统计</p>
          <button
            onClick={() => window.location.href = '/'}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            开始学习
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {stats.map((stat, index) => (
            <div
              key={stat.wordId}
              className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    {stat.spelling}
                  </h3>
                  <p className="text-sm text-gray-500">
                    最后学习: {formatDate(stat.lastStudied)}
                  </p>
                </div>

                <div className="flex gap-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">学习次数</p>
                    <p className="text-2xl font-bold text-gray-900">{stat.attempts}</p>
                  </div>

                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">正确次数</p>
                    <p className="text-2xl font-bold text-green-600">{stat.correct}</p>
                  </div>

                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">正确率</p>
                    <div className={`px-3 py-1 rounded-lg ${getCorrectRateBg(stat.correctRate)}`}>
                      <p className={`text-2xl font-bold ${getCorrectRateColor(stat.correctRate)}`}>
                        {stat.correctRate.toFixed(0)}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 进度条 */}
              <div className="mt-4">
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      stat.correctRate >= 80 ? 'bg-green-500' :
                      stat.correctRate >= 60 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${stat.correctRate}%` }}
                    role="progressbar"
                    aria-valuenow={stat.correctRate}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${stat.spelling} 的正确率: ${stat.correctRate.toFixed(0)}%`}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
