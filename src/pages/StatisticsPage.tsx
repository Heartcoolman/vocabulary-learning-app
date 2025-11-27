import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ChartBar, Target, CheckCircle, Clock, TrendUp, ArrowLeft, CircleNotch } from '../components/Icon';
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
  // 每日正确率数据（用于遗忘曲线近似展示）
  const [dailyAccuracy, setDailyAccuracy] = useState<{ date: string; accuracy: number }[]>([]);
  // 每周练习热度数据（0-6 对应周日-周六）
  const [weekdayHeat, setWeekdayHeat] = useState<number[]>(Array(7).fill(0));

  useEffect(() => {
    // 使用 mounted 标志防止组件卸载后更新状态
    let mounted = true;

    const loadStatistics = async () => {
      if (!user) {
        if (mounted) {
          setError('请先登录');
          setIsLoading(false);
        }
        return;
      }

      try {
        if (mounted) {
          setIsLoading(true);
          setError(null);
        }

        // 获取所有单词
        const words = await StorageService.getWords();
        if (!mounted) return;

        // 批量获取所有单词的学习状态（避免 N+1 查询）
        const wordIds = words.map(w => w.id);
        const wordStates = await StorageService.getWordLearningStates(user.id, wordIds);
        if (!mounted) return;

        // 统计掌握程度分布
        const masteryDistribution = [0, 1, 2, 3, 4, 5].map(level => ({
          level,
          count: wordStates.filter(state => state && state.masteryLevel === level).length
        }));

        // 获取真实的学习统计数据
        const studyStats = await StorageService.getStudyStatistics();
        if (!mounted) return;

        const recordsResult = await ApiClient.getRecords({ pageSize: 100 });
        if (!mounted) return;

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
        const yesterday = today - 24 * 60 * 60 * 1000;

        // 确定起始日期：如果今天有学习记录从今天开始，否则从昨天开始
        const hasTodayRecord = sortedDates.length > 0 && sortedDates[0] === today;
        const startDate = hasTodayRecord ? today : yesterday;

        for (let i = 0; i < sortedDates.length; i++) {
          const expectedDate = startDate - i * 24 * 60 * 60 * 1000;
          if (sortedDates[i] === expectedDate) {
            consecutiveDays++;
          } else {
            break;
          }
        }

        // 生成每日正确率序列（用于简易柱状图展示）
        const dailyMap = new Map<string, { correct: number; total: number }>();
        recordsResult.records.forEach((r: any) => {
          const day = new Date(r.timestamp).toISOString().split('T')[0];
          const entry = dailyMap.get(day) || { correct: 0, total: 0 };
          entry.total += 1;
          if (r.isCorrect) entry.correct += 1;
          dailyMap.set(day, entry);
        });
        const dailySeries = Array.from(dailyMap.entries())
          .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
          .slice(-14) // 只显示最近14天
          .map(([date, { correct, total }]) => ({
            date,
            accuracy: total > 0 ? Math.round((correct / total) * 1000) / 10 : 0,
          }));

        // 生成按星期的练习热度（0-6 对应周日-周六）
        const heat = Array(7).fill(0);
        recordsResult.records.forEach((r: any) => {
          const weekday = new Date(r.timestamp).getDay();
          heat[weekday] += 1;
        });

        // 只有在组件仍然挂载时才更新状态
        if (mounted) {
          setStatistics({
            totalWords: words.length,
            masteryDistribution,
            overallAccuracy: studyStats.correctRate,
            studyDays,
            consecutiveDays
          });
          setDailyAccuracy(dailySeries);
          setWeekdayHeat(heat);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('加载统计数据失败:', err);
        if (mounted) {
          setError('加载统计数据失败');
          setIsLoading(false);
        }
      }
    };

    loadStatistics();

    // 清理函数：组件卸载时设置 mounted 为 false
    return () => {
      mounted = false;
    };
  }, [user]);



  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-g3-fade-in">
        <div className="text-center">
          <CircleNotch className="animate-spin mx-auto mb-4" size={48} weight="bold" color="#3b82f6" />
          <p className="text-gray-600">正在加载统计数据...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-g3-fade-in">
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
    <div className="min-h-screen bg-gray-50 py-8 px-4 animate-g3-fade-in">
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

        {/* 每日正确率趋势（近似遗忘曲线） */}
        <div className="p-8 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">每日正确率趋势</h2>
          <div className="h-64 flex items-end gap-2 overflow-x-auto pb-4">
            {dailyAccuracy.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                暂无学习记录
              </div>
            ) : (
              dailyAccuracy.map((point) => (
                <div key={point.date} className="flex flex-col items-center gap-2 min-w-[40px]">
                  <div
                    className="w-8 bg-gradient-to-t from-blue-500 to-blue-400 rounded-t transition-all duration-300 hover:from-blue-600 hover:to-blue-500"
                    style={{ height: `${Math.max(8, point.accuracy * 2)}px` }}
                    title={`${point.date}: ${point.accuracy}%`}
                  />
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {point.date.slice(5)}
                  </span>
                </div>
              ))
            )}
          </div>
          {dailyAccuracy.length > 0 && (
            <p className="text-sm text-gray-500 mt-2 text-center">
              最近14天每日正确率
            </p>
          )}
        </div>

        {/* 学习热力图（按星期统计） */}
        <div className="p-8 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-6">每周学习分布</h2>
          <div className="grid grid-cols-7 gap-3">
            {['日', '一', '二', '三', '四', '五', '六'].map((label, idx) => {
              const count = weekdayHeat[idx] ?? 0;
              const maxCount = Math.max(...weekdayHeat, 1);
              const intensity = Math.min(0.9, 0.1 + (count / maxCount) * 0.8);
              return (
                <div
                  key={label}
                  className="rounded-xl border border-gray-200/60 p-4 flex flex-col items-center gap-2 transition-all duration-200 hover:shadow-md"
                  style={{ backgroundColor: `rgba(59, 130, 246, ${intensity})` }}
                  title={`星期${label}：${count} 次练习`}
                >
                  <span className={`text-sm font-medium ${intensity > 0.5 ? 'text-white' : 'text-gray-700'}`}>
                    周{label}
                  </span>
                  <span className={`text-2xl font-bold ${intensity > 0.5 ? 'text-white' : 'text-gray-900'}`}>
                    {count}
                  </span>
                  <span className={`text-xs ${intensity > 0.5 ? 'text-white/80' : 'text-gray-500'}`}>
                    次
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
