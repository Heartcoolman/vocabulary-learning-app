/**
 * 用户统计数据查询 Hooks
 *
 * 提供用户统计数据的查询功能
 * 包含用户基础统计、每日统计、趋势数据等
 */

import { useQuery, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { apiClient, authClient, learningClient } from '../../services/client';
import StorageService from '../../services/StorageService';
import { queryKeys } from '../../lib/queryKeys';
import { useAuth } from '../../contexts/AuthContext';

// ==================== 类型定义 ====================

/**
 * 用户基础统计
 */
export interface UserStats {
  /** 总单词数 */
  totalWords: number;
  /** 总学习记录数 */
  totalRecords: number;
  /** 正确率（0-100） */
  correctRate: number;
}

/**
 * 每日统计数据
 */
export interface DailyStats {
  /** 日期（YYYY-MM-DD 格式） */
  date: string;
  /** 学习单词数 */
  wordsStudied: number;
  /** 正确数 */
  correctCount: number;
  /** 错误数 */
  incorrectCount: number;
  /** 正确率 */
  accuracy: number;
  /** 学习时长（分钟） */
  studyDuration?: number;
}

/**
 * 用户学习统计（扩展版）
 */
export interface UserLearningStats extends UserStats {
  /** 学习天数 */
  studyDays: number;
  /** 连续学习天数 */
  consecutiveDays: number;
  /** 掌握程度分布 */
  masteryDistribution: Array<{
    level: number;
    count: number;
  }>;
}

/**
 * 每日正确率数据点
 */
export interface DailyAccuracyPoint {
  date: string;
  accuracy: number;
}

/**
 * 完整用户统计数据
 */
export interface FullUserStats extends UserLearningStats {
  /** 每日正确率序列 */
  dailyAccuracy: DailyAccuracyPoint[];
  /** 按星期的练习热度（周日到周六） */
  weekdayHeat: number[];
}

/**
 * 用户统计查询配置选项
 */
export interface UseUserStatsOptions {
  /** 是否启用查询（默认 true） */
  enabled?: boolean;
  /** 缓存过期时间（毫秒） */
  staleTime?: number;
  /** 是否自动刷新 */
  refetchInterval?: number | false;
}

// ==================== 查询键工厂 ====================

/**
 * 用户统计查询键工厂
 */
export const userStatsKeys = {
  all: ['userStats'] as const,
  base: () => [...userStatsKeys.all, 'base'] as const,
  full: () => [...userStatsKeys.all, 'full'] as const,
  daily: (date: string) => [...userStatsKeys.all, 'daily', date] as const,
  dailyRange: (startDate: string, endDate: string) =>
    [...userStatsKeys.all, 'dailyRange', startDate, endDate] as const,
  weeklyTrend: () => [...userStatsKeys.all, 'weeklyTrend'] as const,
};

// ==================== Query Hooks ====================

/**
 * 获取用户基础统计数据
 *
 * @example
 * ```tsx
 * const { data: stats, isLoading } = useUserStats();
 *
 * if (stats) {
 *   console.log(`总单词: ${stats.totalWords}`);
 *   console.log(`正确率: ${stats.correctRate}%`);
 * }
 * ```
 */
export function useUserStats(options?: UseUserStatsOptions) {
  return useQuery<UserStats, Error>({
    queryKey: userStatsKeys.base(),
    queryFn: async () => {
      return await authClient.getUserStatistics();
    },
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 5 * 60 * 1000, // 5分钟
    refetchInterval: options?.refetchInterval ?? false,
  });
}

/**
 * 获取完整用户统计数据（包含趋势和热力图）
 *
 * @example
 * ```tsx
 * const { data: fullStats, isLoading } = useFullUserStats();
 *
 * if (fullStats) {
 *   // 显示掌握程度分布图
 *   <MasteryChart data={fullStats.masteryDistribution} />
 *   // 显示每日正确率趋势
 *   <AccuracyTrend data={fullStats.dailyAccuracy} />
 * }
 * ```
 */
export function useFullUserStats(options?: UseUserStatsOptions) {
  const { user } = useAuth();

  return useQuery<FullUserStats, Error>({
    queryKey: userStatsKeys.full(),
    queryFn: async (): Promise<FullUserStats> => {
      if (!user) {
        throw new Error('请先登录');
      }

      // 获取所有单词
      const words = await StorageService.getWords();

      // 批量获取所有单词的学习状态
      const wordIds = words.map((w) => w.id);
      const wordStates = await StorageService.getWordLearningStates(user.id, wordIds);

      // 统计掌握程度分布
      const masteryDistribution = [0, 1, 2, 3, 4, 5].map((level) => ({
        level,
        count: wordStates.filter((state) => state && state.masteryLevel === level).length,
      }));

      // 获取真实的学习统计数据
      const studyStats = await StorageService.getStudyStatistics();

      const recordsResult = await apiClient.getRecords({ pageSize: 100 });

      // 计算学习天数和连续学习天数
      const normalizeToDateString = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const studyDates = new Set(
        recordsResult.records.map((r) => normalizeToDateString(new Date(r.timestamp))),
      );
      const studyDays = studyDates.size;

      // 计算连续学习天数
      const sortedDateStrings = Array.from(studyDates).sort((a: string, b: string) =>
        b.localeCompare(a),
      );

      let consecutiveDays = 0;
      const now = new Date();
      const todayStr = normalizeToDateString(now);
      const yesterdayDate = new Date(now);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayStr = normalizeToDateString(yesterdayDate);

      const hasTodayRecord = sortedDateStrings.length > 0 && sortedDateStrings[0] === todayStr;
      const hasYesterdayRecord = sortedDateStrings.includes(yesterdayStr);

      if (!hasTodayRecord && !hasYesterdayRecord) {
        consecutiveDays = 0;
      } else {
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

      // 生成每日正确率序列
      const dailyMap = new Map<string, { correct: number; total: number }>();
      recordsResult.records.forEach((r) => {
        const day = new Date(r.timestamp).toISOString().split('T')[0];
        const entry = dailyMap.get(day) || { correct: 0, total: 0 };
        entry.total += 1;
        if (r.isCorrect) entry.correct += 1;
        dailyMap.set(day, entry);
      });
      const dailyAccuracy = Array.from(dailyMap.entries())
        .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
        .slice(-14) // 只显示最近14天
        .map(([date, { correct, total }]) => ({
          date,
          accuracy: total > 0 ? Math.round((correct / total) * 1000) / 10 : 0,
        }));

      // 生成按星期的练习热度
      const weekdayHeat = Array(7).fill(0) as number[];
      recordsResult.records.forEach((r) => {
        const weekday = new Date(r.timestamp).getDay();
        weekdayHeat[weekday] += 1;
      });

      return {
        totalWords: words.length,
        totalRecords: recordsResult.records.length,
        correctRate: studyStats.correctRate,
        masteryDistribution,
        studyDays,
        consecutiveDays,
        dailyAccuracy,
        weekdayHeat,
      };
    },
    enabled: (options?.enabled ?? true) && !!user,
    staleTime: options?.staleTime ?? 60 * 1000, // 1分钟
    refetchInterval: options?.refetchInterval ?? 60 * 1000, // 每分钟自动刷新
    refetchOnWindowFocus: true,
  });
}

/**
 * 获取指定日期的统计数据
 *
 * @param date - 日期（YYYY-MM-DD 格式）
 *
 * @example
 * ```tsx
 * const { data: dailyStats } = useDailyStats('2024-01-15');
 *
 * if (dailyStats) {
 *   console.log(`今日学习: ${dailyStats.wordsStudied} 个单词`);
 * }
 * ```
 */
export function useDailyStats(date: string, options?: UseUserStatsOptions) {
  return useQuery<DailyStats, Error>({
    queryKey: userStatsKeys.daily(date),
    queryFn: async (): Promise<DailyStats> => {
      // 获取所有学习记录
      const recordsResult = await apiClient.getRecords({ pageSize: 1000 });

      // 过滤指定日期的记录
      const targetDate = new Date(date);
      const dateRecords = recordsResult.records.filter((r) => {
        const recordDate = new Date(r.timestamp);
        return (
          recordDate.getFullYear() === targetDate.getFullYear() &&
          recordDate.getMonth() === targetDate.getMonth() &&
          recordDate.getDate() === targetDate.getDate()
        );
      });

      // 统计数据
      const correctCount = dateRecords.filter((r) => r.isCorrect).length;
      const incorrectCount = dateRecords.length - correctCount;
      const uniqueWords = new Set(dateRecords.map((r) => r.wordId));

      return {
        date,
        wordsStudied: uniqueWords.size,
        correctCount,
        incorrectCount,
        accuracy:
          dateRecords.length > 0 ? Math.round((correctCount / dateRecords.length) * 1000) / 10 : 0,
      };
    },
    enabled: (options?.enabled ?? true) && !!date,
    staleTime: options?.staleTime ?? 5 * 60 * 1000, // 5分钟
  });
}

/**
 * 获取日期范围内的统计数据
 *
 * @param startDate - 开始日期（YYYY-MM-DD 格式）
 * @param endDate - 结束日期（YYYY-MM-DD 格式）
 *
 * @example
 * ```tsx
 * const { data: weeklyStats } = useDailyStatsRange('2024-01-01', '2024-01-07');
 * ```
 */
export function useDailyStatsRange(
  startDate: string,
  endDate: string,
  options?: UseUserStatsOptions,
) {
  return useQuery<DailyStats[], Error>({
    queryKey: userStatsKeys.dailyRange(startDate, endDate),
    queryFn: async (): Promise<DailyStats[]> => {
      // 获取所有学习记录
      const recordsResult = await apiClient.getRecords({ pageSize: 1000 });

      const start = new Date(startDate);
      const end = new Date(endDate);
      const results: DailyStats[] = [];

      // 按日期分组
      const dateMap = new Map<string, typeof recordsResult.records>();

      recordsResult.records.forEach((r) => {
        const recordDate = new Date(r.timestamp);
        if (recordDate >= start && recordDate <= end) {
          const dateKey = recordDate.toISOString().split('T')[0];
          const existing = dateMap.get(dateKey) || [];
          existing.push(r);
          dateMap.set(dateKey, existing);
        }
      });

      // 生成每日统计
      const currentDate = new Date(start);
      while (currentDate <= end) {
        const dateKey = currentDate.toISOString().split('T')[0];
        const records = dateMap.get(dateKey) || [];
        const correctCount = records.filter((r) => r.isCorrect).length;
        const uniqueWords = new Set(records.map((r) => r.wordId));

        results.push({
          date: dateKey,
          wordsStudied: uniqueWords.size,
          correctCount,
          incorrectCount: records.length - correctCount,
          accuracy:
            records.length > 0 ? Math.round((correctCount / records.length) * 1000) / 10 : 0,
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return results;
    },
    enabled: (options?.enabled ?? true) && !!startDate && !!endDate,
    staleTime: options?.staleTime ?? 5 * 60 * 1000, // 5分钟
  });
}

/**
 * 获取最近一周的趋势数据
 *
 * @example
 * ```tsx
 * const { data: trend } = useWeeklyTrend();
 *
 * if (trend) {
 *   <WeeklyChart data={trend} />
 * }
 * ```
 */
export function useWeeklyTrend(options?: UseUserStatsOptions) {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return useDailyStatsRange(startDate, endDate, options);
}

// ==================== 预取函数 ====================

/**
 * 预取用户统计数据
 */
export async function prefetchUserStats(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.prefetchQuery({
    queryKey: userStatsKeys.base(),
    queryFn: async () => {
      return await authClient.getUserStatistics();
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 预取每日统计数据
 */
export async function prefetchDailyStats(
  queryClient: ReturnType<typeof useQueryClient>,
  date: string,
) {
  // 实际预取逻辑在这里简化处理
  // 完整实现应该调用实际的 API
  await queryClient.prefetchQuery({
    queryKey: userStatsKeys.daily(date),
    queryFn: async () => {
      const recordsResult = await apiClient.getRecords({ pageSize: 1000 });
      const targetDate = new Date(date);
      const dateRecords = recordsResult.records.filter((r) => {
        const recordDate = new Date(r.timestamp);
        return (
          recordDate.getFullYear() === targetDate.getFullYear() &&
          recordDate.getMonth() === targetDate.getMonth() &&
          recordDate.getDate() === targetDate.getDate()
        );
      });

      const correctCount = dateRecords.filter((r) => r.isCorrect).length;
      const uniqueWords = new Set(dateRecords.map((r) => r.wordId));

      return {
        date,
        wordsStudied: uniqueWords.size,
        correctCount,
        incorrectCount: dateRecords.length - correctCount,
        accuracy:
          dateRecords.length > 0 ? Math.round((correctCount / dateRecords.length) * 1000) / 10 : 0,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ==================== 缓存失效辅助函数 ====================

/**
 * 使用户统计缓存失效
 */
export function invalidateUserStatsCache(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: userStatsKeys.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.statistics.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.user.statistics() });
}
