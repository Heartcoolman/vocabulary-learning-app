import { useState, useEffect, useMemo } from 'react';
import StorageService from '../services/StorageService';
import { handleError } from '../utils/errorHandler';
import { 
  ChartBar, 
  Target, 
  CheckCircle, 
  Warning, 
  Clock, 
  TrendUp, 
  Hash,
  BookOpen,
  MagnifyingGlass,
  CircleNotch
} from '../components/Icon';

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
type SortType = 'time' | 'correctRate' | 'attempts';
type FilterType = 'all' | 'mastered' | 'reviewing' | 'struggling';

export default function HistoryPage() {
  const [stats, setStats] = useState<WordStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortType>('time');
  const [filterBy, setFilterBy] = useState<FilterType>('all');

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


  const getMasteryLevel = (rate: number): FilterType => {
    if (rate >= 80) return 'mastered';
    if (rate >= 40) return 'reviewing';
    return 'struggling';
  };

  const getMasteryLabel = (rate: number) => {
    if (rate >= 80) return { 
      label: '已掌握', 
      icon: CheckCircle, 
      color: 'text-green-600', 
      bg: 'bg-green-50', 
      border: 'border-green-300' 
    };
    if (rate >= 40) return { 
      label: '需复习', 
      icon: Warning, 
      color: 'text-yellow-600', 
      bg: 'bg-yellow-50', 
      border: 'border-yellow-300' 
    };
    return { 
      label: '未掌握', 
      icon: Warning, 
      color: 'text-red-600', 
      bg: 'bg-red-50', 
      border: 'border-red-300' 
    };
  };

  // 过滤和排序
  const filteredAndSortedStats = useMemo(() => {
    let filtered = stats;

    // 过滤
    if (filterBy !== 'all') {
      filtered = stats.filter(stat => getMasteryLevel(stat.correctRate) === filterBy);
    }

    // 排序
    const sorted = [...filtered];
    switch (sortBy) {
      case 'correctRate':
        sorted.sort((a, b) => a.correctRate - b.correctRate);
        break;
      case 'attempts':
        sorted.sort((a, b) => b.attempts - a.attempts);
        break;
      case 'time':
      default:
        sorted.sort((a, b) => b.lastStudied - a.lastStudied);
        break;
    }

    return sorted;
  }, [stats, sortBy, filterBy]);

  // 统计数据
  const statistics = useMemo(() => {
    if (stats.length === 0) return { total: 0, avgCorrectRate: 0, mastered: 0, reviewing: 0, struggling: 0 };

    const total = stats.length;
    const avgCorrectRate = stats.reduce((sum, stat) => sum + stat.correctRate, 0) / total;
    const mastered = stats.filter(s => s.correctRate >= 80).length;
    const reviewing = stats.filter(s => s.correctRate >= 40 && s.correctRate < 80).length;
    const struggling = stats.filter(s => s.correctRate < 40).length;

    return { total, avgCorrectRate, mastered, reviewing, struggling };
  }, [stats]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="text-center">
          <CircleNotch className="animate-spin mx-auto mb-4" size={48} weight="bold" color="#3b82f6" />
          <p className="text-gray-600" role="status" aria-live="polite">正在加载...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="text-center max-w-md px-4" role="alert">
          <Warning className="mx-auto mb-4" size={64} weight="fill" color="#ef4444" aria-hidden="true" />
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8 animate-fade-in">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">学习历史</h1>
          <p className="text-gray-600">追踪你的学习进度，掌握每个单词</p>
        </header>

        {stats.length === 0 ? (
          <div className="text-center py-16 animate-slide-up">
            <BookOpen className="mx-auto mb-6 animate-pulse" size={96} weight="thin" color="#9ca3af" />
            <h2 className="text-2xl font-bold text-gray-900 mb-3">还没有学习记录</h2>
            <p className="text-gray-600 mb-8">开始学习单词后，这里会显示你的学习统计</p>
            <button
              onClick={() => window.location.href = '/'}
              className="
                px-8 py-4 bg-blue-500 text-white rounded-lg font-medium
                hover:bg-blue-600 transition-all duration-200 
                hover:scale-105 active:scale-95
                focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                shadow-lg hover:shadow-xl
              "
            >
              开始学习
            </button>
          </div>
        ) : (
          <>
            {/* 统计面板 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <div className="flex items-center gap-3 mb-2">
                  <ChartBar size={32} weight="duotone" color="#3b82f6" />
                  <span className="text-sm text-gray-600 font-medium">总学习单词</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{statistics.total}</p>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <div className="flex items-center gap-3 mb-2">
                  <Target size={32} weight="duotone" color="#a855f7" />
                  <span className="text-sm text-gray-600 font-medium">平均正确率</span>
                </div>
                <p className={`text-3xl font-bold ${getCorrectRateColor(statistics.avgCorrectRate)}`}>
                  {statistics.avgCorrectRate.toFixed(0)}%
                </p>
              </div>

              <div className="bg-green-50 rounded-xl p-6 shadow-sm border border-green-200">
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle size={32} weight="duotone" color="#16a34a" />
                  <span className="text-sm text-green-700 font-medium">已掌握</span>
                </div>
                <p className="text-3xl font-bold text-green-600">{statistics.mastered}</p>
              </div>

              <div className="bg-red-50 rounded-xl p-6 shadow-sm border border-red-200">
                <div className="flex items-center gap-3 mb-2">
                  <Warning size={32} weight="duotone" color="#dc2626" />
                  <span className="text-sm text-red-700 font-medium">需复习</span>
                </div>
                <p className="text-3xl font-bold text-red-600">{statistics.reviewing + statistics.struggling}</p>
              </div>
            </div>

            {/* 筛选和排序 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-8">
              <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">筛选</h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setFilterBy('all')}
                      className={`
                        px-4 py-2 rounded-lg font-medium transition-all duration-200
                        hover:scale-105 active:scale-95 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2
                        ${filterBy === 'all'
                          ? 'bg-blue-500 text-white focus:ring-blue-500 shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500'
                        }
                      `}
                    >
                      全部 ({stats.length})
                    </button>
                    <button
                      onClick={() => setFilterBy('mastered')}
                      className={`
                        px-4 py-2 rounded-lg font-medium transition-all duration-200
                        hover:scale-105 active:scale-95 focus:ring-2 focus:ring-offset-2
                        flex items-center gap-2
                        ${filterBy === 'mastered'
                          ? 'bg-green-500 text-white focus:ring-green-500 shadow-md'
                          : 'bg-green-100 text-green-700 hover:bg-green-200 focus:ring-green-500'
                        }
                      `}
                    >
                      <CheckCircle size={16} weight="bold" />
                      已掌握 ({statistics.mastered})
                    </button>
                    <button
                      onClick={() => setFilterBy('reviewing')}
                      className={`
                        px-4 py-2 rounded-lg font-medium transition-all duration-200
                        hover:scale-105 active:scale-95 focus:ring-2 focus:ring-offset-2
                        flex items-center gap-2
                        ${filterBy === 'reviewing'
                          ? 'bg-yellow-500 text-white focus:ring-yellow-500 shadow-md'
                          : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 focus:ring-yellow-500'
                        }
                      `}
                    >
                      <Warning size={16} weight="bold" />
                      需复习 ({statistics.reviewing})
                    </button>
                    <button
                      onClick={() => setFilterBy('struggling')}
                      className={`
                        px-4 py-2 rounded-lg font-medium transition-all duration-200
                        hover:scale-105 active:scale-95 focus:ring-2 focus:ring-offset-2
                        flex items-center gap-2
                        ${filterBy === 'struggling'
                          ? 'bg-red-500 text-white focus:ring-red-500 shadow-md'
                          : 'bg-red-100 text-red-700 hover:bg-red-200 focus:ring-red-500'
                        }
                      `}
                    >
                      <Warning size={16} weight="bold" />
                      未掌握 ({statistics.struggling})
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">排序</h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setSortBy('time')}
                      className={`
                        px-4 py-2 rounded-lg font-medium transition-all duration-200
                        hover:scale-105 active:scale-95 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2
                        flex items-center gap-2
                        ${sortBy === 'time'
                          ? 'bg-gray-900 text-white shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }
                      `}
                    >
                      <Clock size={16} weight="bold" />
                      最近学习
                    </button>
                    <button
                      onClick={() => setSortBy('correctRate')}
                      className={`
                        px-4 py-2 rounded-lg font-medium transition-all duration-200
                        hover:scale-105 active:scale-95 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2
                        flex items-center gap-2
                        ${sortBy === 'correctRate'
                          ? 'bg-gray-900 text-white shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }
                      `}
                    >
                      <TrendUp size={16} weight="bold" />
                      正确率
                    </button>
                    <button
                      onClick={() => setSortBy('attempts')}
                      className={`
                        px-4 py-2 rounded-lg font-medium transition-all duration-200
                        hover:scale-105 active:scale-95 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2
                        flex items-center gap-2
                        ${sortBy === 'attempts'
                          ? 'bg-gray-900 text-white shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }
                      `}
                    >
                      <Hash size={16} weight="bold" />
                      学习次数
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 单词卡片网格 */}
            {filteredAndSortedStats.length === 0 ? (
              <div className="text-center py-12 animate-fade-in">
                <MagnifyingGlass className="mx-auto mb-4" size={80} weight="thin" color="#9ca3af" />
                <p className="text-gray-600 text-lg">没有找到符合条件的单词</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredAndSortedStats.map((stat, index) => {
                  const mastery = getMasteryLabel(stat.correctRate);
                  return (
                    <div
                      key={stat.wordId}
                      className={`
                        group relative bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-2
                        hover:shadow-xl transition-all duration-200 hover:scale-105
                        animate-fade-in ${mastery.border}
                      `}
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      {/* 掌握程度标签 */}
                      <div className={`absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${mastery.bg} ${mastery.color}`}>
                        <mastery.icon size={12} weight="bold" />
                        {mastery.label}
                      </div>

                      {/* 单词名称 */}
                      <div className="mb-6">
                        <h3 className="text-2xl font-bold text-gray-900 mb-1">
                          {stat.spelling}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {formatDate(stat.lastStudied)}
                        </p>
                      </div>

                      {/* 圆形进度条 */}
                      <div className="flex items-center justify-center mb-6">
                        <div className="relative w-32 h-32">
                          <svg className="transform -rotate-90 w-32 h-32">
                            {/* 背景圆环 */}
                            <circle
                              cx="64"
                              cy="64"
                              r="56"
                              stroke="currentColor"
                              strokeWidth="8"
                              fill="none"
                              className="text-gray-200"
                            />
                            {/* 进度圆环 */}
                            <circle
                              cx="64"
                              cy="64"
                              r="56"
                              stroke="currentColor"
                              strokeWidth="8"
                              fill="none"
                              strokeDasharray={`${2 * Math.PI * 56}`}
                              strokeDashoffset={`${2 * Math.PI * 56 * (1 - stat.correctRate / 100)}`}
                              className={`transition-all duration-500 ${
                                stat.correctRate >= 80 ? 'text-green-500' :
                                stat.correctRate >= 40 ? 'text-yellow-500' :
                                'text-red-500'
                              }`}
                              strokeLinecap="round"
                            />
                          </svg>
                          {/* 中心文字 */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className={`text-3xl font-bold ${getCorrectRateColor(stat.correctRate)}`}>
                              {stat.correctRate.toFixed(0)}%
                            </span>
                            <span className="text-xs text-gray-500 mt-1">正确率</span>
                          </div>
                        </div>
                      </div>

                      {/* 统计信息 */}
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                        <div className="text-center">
                          <p className="text-sm text-gray-600 mb-1">学习次数</p>
                          <p className="text-xl font-bold text-gray-900">{stat.attempts}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-gray-600 mb-1">正确次数</p>
                          <p className="text-xl font-bold text-green-600">{stat.correct}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
