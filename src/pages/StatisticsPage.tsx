import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ChartBar, Target, CheckCircle, Clock, TrendUp, ArrowLeft } from '../components/Icon';
import StorageService from '../services/StorageService';
import ApiClient from '../services/ApiClient';

interface StatisticsData {
  totalWords: number;
  masteryDistribution: { level: number; count: number }[];
  overallAccuracy: number;
  studyDays: number;
  consecutiveDays: number;
}

/**
 * 学习统计页面
 * 显示用户的学习统计数据、掌握程度分布、遗忘曲线和学习热力图
 */
export default function StatisticsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [statistics, setStatistics] = useState<StatisticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStatistics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadStatistics = async () => {
    if (!user) {
      setError('请先登录');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // 获取所有单词
      const words = await StorageService.getWords();

      // 批量获取所有单词的学习状态（避免 N+1 查询）
      const wordIds = words.map(w => w.id);
      const wordStates = await StorageService.getWordLearningStates(user.id, wordIds);

      // 统计掌握程度分布
      const masteryDistribution = [0, 1, 2, 3, 4, 5].map(level => ({
        level,
        count: wordStates.filter(state => state && state.masteryLevel === level).length
      }));

      // 获取真实的学习统计数据
      const studyStats = await StorageService.getStudyStatistics();
      const recordsResult = await ApiClient.getRecords({ pageSize: 100 });

      // 计算学习天数和连续学习天数
      const studyDates = new Set(
        recordsResult.records.map((r: any) => new Date(r.timestamp).toDateString())
      );
      const studyDays = studyDates.size;

      // 计算连续学习天数
      const sortedDates = Array.from(studyDates)
        .map(d => new Date(d).getTime())
        .sort((a, b) => b - a);

      let consecutiveDays = 0;
      const today = new Date().setHours(0, 0, 0, 0);

      for (let i = 0; i < sortedDates.length; i++) {
        const expectedDate = today - i * 24 * 60 * 60 * 1000;
        if (sortedDates[i] === expectedDate) {
          consecutiveDays++;
        } else {
          break;
        }
      }

      setStatistics({
        totalWords: words.length,
        masteryDistribution,
        overallAccuracy: studyStats.correctRate,
        studyDays,
        consecutiveDays
      });

      setIsLoading(false);
    } catch (err) {
      console.error('加载统计数据失败:', err);
      setError('加载统计数据失败');
      setIsLoading(false);
    }
  };



  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">正在加载统计数据...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-fade-in">
        <div className="text-center max-w-md px-4">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">加载失败</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/learning')}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95"
          >
            返回学习
          </button>
        </div>
      </div>
    );
  }

  if (!statistics) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 animate-fade-in">
      <div className="max-w-6xl mx-auto">
        {/* 页面标题 */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
              aria-label="返回"
            >
              <ArrowLeft size={20} weight="bold" />
            </button>
            <h1 className="text-3xl font-bold text-gray-900">学习统计</h1>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* 总学习单词数 */}
          <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between mb-4">
              <ChartBar size={32} weight="duotone" color="#3b82f6" />
            </div>
            <p className="text-sm text-gray-600 mb-1">总学习单词</p>
            <p className="text-3xl font-bold text-gray-900">{statistics.totalWords}</p>
          </div>

          {/* 整体正确率 */}
          <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between mb-4">
              <Target size={32} weight="duotone" color="#a855f7" />
            </div>
            <p className="text-sm text-gray-600 mb-1">整体正确率</p>
            <p className="text-3xl font-bold text-gray-900">
              {(statistics.overallAccuracy * 100).toFixed(1)}%
            </p>
          </div>

          {/* 学习天数 */}
          <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between mb-4">
              <Clock size={32} weight="duotone" color="#f59e0b" />
            </div>
            <p className="text-sm text-gray-600 mb-1">学习天数</p>
            <p className="text-3xl font-bold text-gray-900">{statistics.studyDays}</p>
          </div>

          {/* 连续学习天数 */}
          <div className="p-6 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between mb-4">
              <TrendUp size={32} weight="duotone" color="#16a34a" />
            </div>
            <p className="text-sm text-gray-600 mb-1">连续学习</p>
            <p className="text-3xl font-bold text-gray-900">{statistics.consecutiveDays} 天</p>
          </div>
        </div>

        {/* 掌握程度分布 */}
        <div className="p-8 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <CheckCircle size={24} weight="duotone" color="#3b82f6" />
            掌握程度分布
          </h2>
          <div className="space-y-4">
            {statistics.masteryDistribution.map(({ level, count }) => {
              const percentage = statistics.totalWords > 0 
                ? (count / statistics.totalWords) * 100 
                : 0;
              
              return (
                <div key={level} className="flex items-center gap-4">
                  <div className="w-20 text-sm font-medium text-gray-700">
                    {level} 级
                  </div>
                  <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-500 flex items-center justify-end pr-3"
                      style={{ width: `${percentage}%` }}
                    >
                      {count > 0 && (
                        <span className="text-xs font-medium text-white">
                          {count} 个
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-16 text-sm text-gray-600 text-right">
                    {percentage.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 遗忘曲线图表占位符 */}
        <div className="p-8 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">遗忘曲线</h2>
          <div className="h-64 flex items-center justify-center text-gray-400">
            <p>图表功能开发中...</p>
          </div>
        </div>

        {/* 学习热力图占位符 */}
        <div className="p-8 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-6">学习热力图</h2>
          <div className="h-64 flex items-center justify-center text-gray-400">
            <p>热力图功能开发中...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
