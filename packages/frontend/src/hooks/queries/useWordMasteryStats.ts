import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import ApiClient from '../../services/ApiClient';
import type { UserMasteryStats, MasteryEvaluation, WordMasteryTrace } from '../../types/word-mastery';

/**
 * 单词掌握度查询键
 */
const masteryQueryKeys = {
  all: ['wordMastery'] as const,
  stats: () => [...masteryQueryKeys.all, 'stats'] as const,
  evaluations: () => [...masteryQueryKeys.all, 'evaluations'] as const,
  evaluation: (wordId: string) => [...masteryQueryKeys.evaluations(), wordId] as const,
  trace: (wordId: string) => [...masteryQueryKeys.all, 'trace', wordId] as const,
  interval: (wordId: string) => [...masteryQueryKeys.all, 'interval', wordId] as const,
};

/**
 * 获取用户整体掌握度统计
 * 每分钟自动刷新
 */
export function useWordMasteryStats() {
  return useQuery({
    queryKey: masteryQueryKeys.stats(),
    queryFn: async (): Promise<UserMasteryStats> => {
      return await ApiClient.getWordMasteryStats();
    },
    staleTime: 60 * 1000, // 1分钟
    refetchInterval: 60 * 1000, // 每分钟自动刷新
    refetchOnWindowFocus: true,
  });
}

/**
 * 批量获取单词掌握度评估
 * @param wordIds 单词ID数组（最多100个）
 * @param userFatigue 用户疲劳度 0-1（可选）
 */
export function useBatchWordMastery(wordIds: string[], userFatigue?: number) {
  return useQuery({
    queryKey: [...masteryQueryKeys.evaluations(), { wordIds, userFatigue }],
    queryFn: async (): Promise<MasteryEvaluation[]> => {
      if (!wordIds || wordIds.length === 0) {
        return [];
      }
      return await ApiClient.batchProcessWordMastery(wordIds, userFatigue);
    },
    enabled: wordIds.length > 0,
    staleTime: 2 * 60 * 1000, // 2分钟
  });
}

/**
 * 获取单个单词的掌握度评估
 * @param wordId 单词ID
 * @param userFatigue 用户疲劳度 0-1（可选）
 */
export function useWordMasteryDetail(wordId: string, userFatigue?: number) {
  return useQuery({
    queryKey: masteryQueryKeys.evaluation(wordId),
    queryFn: async (): Promise<MasteryEvaluation> => {
      return await ApiClient.getWordMasteryDetail(wordId, userFatigue);
    },
    enabled: !!wordId,
    staleTime: 2 * 60 * 1000, // 2分钟
  });
}

/**
 * 获取单词学习轨迹
 * @param wordId 单词ID
 * @param limit 返回记录数限制（默认50，范围1-100）
 */
export function useWordMasteryTrace(wordId: string, limit?: number) {
  return useQuery({
    queryKey: masteryQueryKeys.trace(wordId),
    queryFn: async (): Promise<WordMasteryTrace> => {
      return await ApiClient.getWordMasteryTrace(wordId, limit);
    },
    enabled: !!wordId,
    staleTime: 5 * 60 * 1000, // 5分钟
  });
}

/**
 * 预测最佳复习间隔
 * @param wordId 单词ID
 * @param targetRecall 目标提取概率（默认0.9，范围0-1）
 */
export function useWordMasteryInterval(wordId: string, targetRecall?: number) {
  return useQuery({
    queryKey: masteryQueryKeys.interval(wordId),
    queryFn: async () => {
      return await ApiClient.getWordMasteryInterval(wordId, targetRecall);
    },
    enabled: !!wordId,
    staleTime: 5 * 60 * 1000, // 5分钟
  });
}

/**
 * 获取已学习的单词列表（有学习记录的）
 * 用于掌握度分析页面
 */
export function useLearnedWords() {
  return useQuery({
    queryKey: [...queryKeys.words.all, 'learned'],
    queryFn: async () => {
      return await ApiClient.getLearnedWords();
    },
    staleTime: 2 * 60 * 1000, // 2分钟
  });
}

/**
 * 预加载单词掌握度数据的 Mutation
 * 用于在用户进入详情页前预加载数据
 */
export function usePrefetchWordMastery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ wordId, userFatigue }: { wordId: string; userFatigue?: number }) => {
      // 预加载掌握度详情和学习轨迹
      await Promise.all([
        queryClient.prefetchQuery({
          queryKey: masteryQueryKeys.evaluation(wordId),
          queryFn: () => ApiClient.getWordMasteryDetail(wordId, userFatigue),
        }),
        queryClient.prefetchQuery({
          queryKey: masteryQueryKeys.trace(wordId),
          queryFn: () => ApiClient.getWordMasteryTrace(wordId),
        }),
      ]);
    },
  });
}

/**
 * 刷新掌握度统计数据的辅助函数
 */
export function useRefreshMasteryStats() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: masteryQueryKeys.stats() });
    queryClient.invalidateQueries({ queryKey: masteryQueryKeys.evaluations() });
  };
}

// 导出查询键供外部使用
export { masteryQueryKeys };
