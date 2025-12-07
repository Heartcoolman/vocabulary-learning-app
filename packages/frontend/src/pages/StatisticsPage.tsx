import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  ChartBar,
  Target,
  CheckCircle,
  Clock,
  TrendUp,
  ArrowLeft,
  CircleNotch,
  Warning,
} from '../components/Icon';
import StorageService from '../services/StorageService';
import ApiClient from '../services/ApiClient';
import { learningLogger } from '../utils/logger';

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
        const wordIds = words.map((w) => w.id);
        const wordStates = await StorageService.getWordLearningStates(user.id, wordIds);
        if (!mounted) return;

        // 统计掌握程度分布
        const masteryDistribution = [0, 1, 2, 3, 4, 5].map((level) => ({
          level,
          count: wordStates.filter((state) => state && state.masteryLevel === level).length,
        }));

        // 获取真实的学习统计数据
        const studyStats = await StorageService.getStudyStatistics();
        if (!mounted) return;

        const recordsResult = await ApiClient.getRecords({ pageSize: 100 });
        if (!mounted) return;

        // 计算学习天数和连续学习天数
        // 使用 YYYY-MM-DD 格式归一化日期，避免时区和精度问题
        const normalizeToDateString = (date: Date): string => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };

        const studyDates = new Set(
          recordsResult.records.map((r: any) => normalizeToDateString(new Date(r.timestamp))),
        );
        const studyDays = studyDates.size;

        // 计算连续学习天数
        // 将日期字符串排序（降序，最近的日期在前）
        const sortedDateStrings = Array.from(studyDates).sort((a, b) => b.localeCompare(a));

        let consecutiveDays = 0;
        const now = new Date();
        const todayStr = normalizeToDateString(now);
        const yesterdayDate = new Date(now);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = normalizeToDateString(yesterdayDate);

        // 确定起始日期：如果今天有学习记录从今天开始，否则从昨天开始
        const hasTodayRecord = sortedDateStrings.length > 0 && sortedDateStrings[0] === todayStr;
        const hasYesterdayRecord = sortedDateStrings.includes(yesterdayStr);

        // 如果今天没学习且昨天也没学习，连续天数为0
        if (!hasTodayRecord && !hasYesterdayRecord) {
          consecutiveDays = 0;
        } else {
          // 从起始日期开始检查连续性
          const startDateObj = hasTodayRecord ? now : yesterdayDate;

          for (let i = 0; i < sortedDateStrings.length; i++) {
            const checkDate = new Date(startDateObj);
            checkDate.setDate(checkDate.getDate() - i);
            const expectedDateStr = normalizeToDateString(checkDate);

            if (sortedDateStrings.includes(expectedDateStr)) {
              consecutiveDays++;
            } else {
              break;
            }
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
            consecutiveDays,
          });
          setDailyAccuracy(dailySeries);
          setWeekdayHeat(heat);
          setIsLoading(false);
        }
      } catch (err) {
        learningLogger.error({ err }, '加载统计数据失败');
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
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="text-center">
          <CircleNotch
            className="mx-auto mb-4 animate-spin"
            size={48}
            weight="bold"
            color="#3b82f6"
          />
          <p className="text-gray-600">正在加载统计数据...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="max-w-md px-4 text-center">
          <Warning size={64} weight="duotone" color="#ef4444" className="mx-auto mb-4" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900">加载失败</h2>
          <p className="mb-6 text-gray-600">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="rounded-lg bg-blue-500 px-6 py-3 text-white transition-all duration-200 hover:scale-105 hover:bg-blue-600 active:scale-95"
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
    <div className="min-h-screen animate-g3-fade-in bg-gradient-to-br from-slate-50 via-white to-blue-50/30 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        {/* 页面标题 */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white transition-all duration-200 hover:scale-105 hover:bg-gray-50 active:scale-95"
              aria-label="返回"
            >
              <ArrowLeft size={20} weight="bold" />
            </button>
            <h1 className="text-3xl font-bold text-gray-900">学习统计</h1>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* 总学习单词数 */}
          <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-md">
            <div className="mb-4 flex items-center justify-between">
              <ChartBar size={32} weight="duotone" color="#3b82f6" />
            </div>
            <p className="mb-1 text-sm text-gray-600">总学习单词</p>
            <p className="text-3xl font-bold text-gray-900">{statistics.totalWords}</p>
          </div>

          {/* 整体正确率 */}
          <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-md">
            <div className="mb-4 flex items-center justify-between">
              <Target size={32} weight="duotone" color="#a855f7" />
            </div>
            <p className="mb-1 text-sm text-gray-600">整体正确率</p>
            <p className="text-3xl font-bold text-gray-900">
              {(statistics.overallAccuracy * 100).toFixed(1)}%
            </p>
          </div>

          {/* 学习天数 */}
          <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-md">
            <div className="mb-4 flex items-center justify-between">
              <Clock size={32} weight="duotone" color="#f59e0b" />
            </div>
            <p className="mb-1 text-sm text-gray-600">学习天数</p>
            <p className="text-3xl font-bold text-gray-900">{statistics.studyDays}</p>
          </div>

          {/* 连续学习天数 */}
          <div className="rounded-xl border border-gray-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-md">
            <div className="mb-4 flex items-center justify-between">
              <TrendUp size={32} weight="duotone" color="#16a34a" />
            </div>
            <p className="mb-1 text-sm text-gray-600">连续学习</p>
            <p className="text-3xl font-bold text-gray-900">{statistics.consecutiveDays} 天</p>
          </div>
        </div>

        {/* 掌握程度分布 */}
        <div className="mb-8 rounded-xl border border-gray-200/60 bg-white/80 p-8 shadow-sm backdrop-blur-sm">
          <h2 className="mb-6 flex items-center gap-2 text-xl font-bold text-gray-900">
            <CheckCircle size={24} weight="duotone" color="#3b82f6" />
            掌握程度分布
          </h2>
          <div className="space-y-4">
            {statistics.masteryDistribution.map(({ level, count }) => {
              const percentage =
                statistics.totalWords > 0 ? (count / statistics.totalWords) * 100 : 0;

              return (
                <div key={level} className="flex items-center gap-4">
                  <div className="w-20 text-sm font-medium text-gray-700">{level} 级</div>
                  <div className="h-8 flex-1 overflow-hidden rounded-lg bg-gray-100">
                    <div
                      className="flex h-full items-center justify-end bg-gradient-to-r from-blue-400 to-blue-600 pr-3 transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    >
                      {count > 0 && (
                        <span className="text-xs font-medium text-white">{count} 个</span>
                      )}
                    </div>
                  </div>
                  <div className="w-16 text-right text-sm text-gray-600">
                    {percentage.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 每日正确率趋势（近似遗忘曲线） */}
        <div className="mb-8 rounded-xl border border-gray-200/60 bg-white/80 p-8 shadow-sm backdrop-blur-sm">
          <h2 className="mb-6 text-xl font-bold text-gray-900">每日正确率趋势</h2>
          <div className="flex h-64 items-end gap-2 overflow-x-auto pb-4">
            {dailyAccuracy.length === 0 ? (
              <div className="flex h-full w-full items-center justify-center text-gray-400">
                暂无学习记录
              </div>
            ) : (
              dailyAccuracy.map((point) => (
                <div key={point.date} className="flex min-w-[40px] flex-col items-center gap-2">
                  <div
                    className="w-8 rounded-t bg-gradient-to-t from-blue-500 to-blue-400 transition-all duration-300 hover:from-blue-600 hover:to-blue-500"
                    style={{ height: `${Math.max(8, point.accuracy * 2)}px` }}
                    title={`${point.date}: ${point.accuracy}%`}
                  />
                  <span className="whitespace-nowrap text-xs text-gray-500">
                    {point.date.slice(5)}
                  </span>
                </div>
              ))
            )}
          </div>
          {dailyAccuracy.length > 0 && (
            <p className="mt-2 text-center text-sm text-gray-500">最近14天每日正确率</p>
          )}
        </div>

        {/* 学习热力图（按星期统计） */}
        <div className="rounded-xl border border-gray-200/60 bg-white/80 p-8 shadow-sm backdrop-blur-sm">
          <h2 className="mb-6 text-xl font-bold text-gray-900">每周学习分布</h2>
          <div className="grid grid-cols-7 gap-3">
            {['日', '一', '二', '三', '四', '五', '六'].map((label, idx) => {
              const count = weekdayHeat[idx] ?? 0;
              const maxCount = Math.max(...weekdayHeat, 1);
              const intensity = Math.min(0.9, 0.1 + (count / maxCount) * 0.8);
              return (
                <div
                  key={label}
                  className="flex flex-col items-center gap-2 rounded-xl border border-gray-200/60 p-4 transition-all duration-200 hover:shadow-md"
                  style={{ backgroundColor: `rgba(59, 130, 246, ${intensity})` }}
                  title={`星期${label}：${count} 次练习`}
                >
                  <span
                    className={`text-sm font-medium ${intensity > 0.5 ? 'text-white' : 'text-gray-700'}`}
                  >
                    周{label}
                  </span>
                  <span
                    className={`text-2xl font-bold ${intensity > 0.5 ? 'text-white' : 'text-gray-900'}`}
                  >
                    {count}
                  </span>
                  <span
                    className={`text-xs ${intensity > 0.5 ? 'text-white/80' : 'text-gray-500'}`}
                  >
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
