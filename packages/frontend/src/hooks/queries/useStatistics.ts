import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { CACHE_TIME, GC_TIME, REFETCH_INTERVALS, DATA_CACHE_CONFIG } from '../../lib/cacheConfig';
import { apiClient } from '../../services/client';
import StorageService from '../../services/StorageService';
import { useAuth } from '../../contexts/AuthContext';

/**
 * 统计数据接口
 */
export interface StatisticsData {
  totalWords: number;
  masteryDistribution: { level: number; count: number }[];
  overallAccuracy: number;
  studyDays: number;
  consecutiveDays: number;
}

/**
 * 每日正确率数据点
 */
export interface DailyAccuracyPoint {
  date: string;
  accuracy: number;
}

/**
 * 完整统计数据（包含趋势数据）
 */
export interface FullStatisticsData extends StatisticsData {
  dailyAccuracy: DailyAccuracyPoint[];
  weekdayHeat: number[];
}

/**
 * 获取用户统计数据
 * 配置每分钟自动刷新
 */
export function useStatistics() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.statistics.overview(),
    queryFn: async (): Promise<FullStatisticsData> => {
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
      const sortedDateStrings = Array.from(studyDates).sort((a, b) => b.localeCompare(a));

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
      const dailySeries = Array.from(dailyMap.entries())
        .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
        .slice(-14) // 只显示最近14天
        .map(([date, { correct, total }]) => ({
          date,
          // 返回 0-1 的比率，与 overallAccuracy 保持一致
          // UI 层统一处理百分比显示
          accuracy: total > 0 ? correct / total : 0,
        }));

      // 生成按星期的练习热度
      const heat = Array(7).fill(0) as number[];
      recordsResult.records.forEach((r) => {
        const weekday = new Date(r.timestamp).getDay();
        heat[weekday] += 1;
      });

      return {
        totalWords: words.length,
        masteryDistribution,
        overallAccuracy: studyStats.correctRate,
        studyDays,
        consecutiveDays,
        dailyAccuracy: dailySeries,
        weekdayHeat: heat,
      };
    },
    enabled: user !== undefined,
    staleTime: CACHE_TIME.SHORT, // 1分钟后标记为过期
    refetchInterval: user ? REFETCH_INTERVALS.FREQUENT : REFETCH_INTERVALS.DISABLED, // 每分钟自动刷新
    refetchOnWindowFocus: Boolean(user), // 窗口聚焦时刷新
  });
}

/**
 * 获取学习进度统计
 */
export function useStudyProgress() {
  return useQuery({
    queryKey: queryKeys.studyProgress.current(),
    queryFn: async () => {
      return await apiClient.getStudyProgress();
    },
    staleTime: CACHE_TIME.SHORT, // 1分钟
    refetchInterval: REFETCH_INTERVALS.FREQUENT, // 每分钟自动刷新
  });
}

/**
 * 获取用户基础统计信息
 */
export function useUserStatistics() {
  return useQuery({
    queryKey: queryKeys.user.statistics(),
    queryFn: async () => {
      return await apiClient.getUserStatistics();
    },
    ...DATA_CACHE_CONFIG.userStatistics,
  });
}

/**
 * 获取学习记录（支持分页）
 */
export function useLearningRecords(options?: { page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: queryKeys.learningRecords.list(options || {}),
    queryFn: async () => {
      return await apiClient.getRecords(options);
    },
    staleTime: CACHE_TIME.MEDIUM_SHORT, // 2分钟
  });
}

/**
 * 创建学习记录的 Mutation
 */
export function useCreateRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recordData: Parameters<(typeof apiClient)['createRecord']>[0]) => {
      return await apiClient.createRecord(recordData);
    },
    onSuccess: () => {
      // 创建成功后，使相关查询失效
      queryClient.invalidateQueries({ queryKey: queryKeys.statistics.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.learningRecords.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.user.statistics() });
    },
  });
}

/**
 * 批量创建学习记录的 Mutation
 */
export function useBatchCreateRecords() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (records: Parameters<(typeof apiClient)['batchCreateRecords']>[0]) => {
      return await apiClient.batchCreateRecords(records);
    },
    onSuccess: () => {
      // 批量创建成功后，使相关查询失效
      queryClient.invalidateQueries({ queryKey: queryKeys.statistics.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.learningRecords.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.user.statistics() });
    },
  });
}
