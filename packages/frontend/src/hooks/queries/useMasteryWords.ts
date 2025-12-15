import { useMemo, useCallback } from 'react';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { apiClient } from '../../services/client';
import type { Word } from '../../types/models';
import type { UserMasteryStats, MasteryEvaluation } from '../../types/word-mastery';

/**
 * 获取已学习单词列表的 Query Hook
 *
 * 配置说明:
 * - staleTime: 5分钟 - 已学习单词列表变化较慢，可以容忍5分钟的过期时间
 * - refetchOnWindowFocus: false - 窗口焦点改变时不自动刷新（数据变化不频繁）
 */
export function useLearnedWords(): UseQueryResult<Word[], Error> {
  return useQuery({
    queryKey: queryKeys.words.learned(),
    queryFn: async () => {
      const data = await apiClient.getLearnedWords();
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5分钟
    refetchOnWindowFocus: false,
  });
}

/**
 * 获取单词掌握度统计的 Query Hook
 *
 * 配置说明:
 * - staleTime: 2分钟 - 统计数据可以容忍2分钟的过期时间
 */
export function useMasteryStats(): UseQueryResult<UserMasteryStats, Error> {
  return useQuery({
    queryKey: queryKeys.studyProgress.masteryStats(),
    queryFn: async () => {
      const data = await apiClient.getWordMasteryStats();
      return data;
    },
    staleTime: 2 * 60 * 1000, // 2分钟
    refetchOnWindowFocus: false,
  });
}

/**
 * 批量获取单词掌握度评估的 Query Hook
 *
 * @param wordIds - 单词ID数组
 * @param userFatigue - 用户疲劳度（可选）
 *
 * 配置说明:
 * - staleTime: 1分钟 - 掌握度评估结果变化较快，容忍时间较短
 * - enabled: 只有当wordIds非空时才执行查询
 */
export function useBatchMasteryEvaluation(
  wordIds: string[],
  userFatigue?: number,
): UseQueryResult<MasteryEvaluation[], Error> {
  return useQuery({
    queryKey: queryKeys.studyProgress.masteryBatch(wordIds, userFatigue),
    queryFn: async () => {
      if (wordIds.length === 0) return [];
      const data = await apiClient.batchProcessWordMastery(wordIds, userFatigue);
      return data;
    },
    staleTime: 60 * 1000, // 1分钟
    enabled: wordIds.length > 0,
  });
}

/**
 * 获取单词掌握度详情的 Query Hook
 *
 * @param wordId - 单词ID
 * @param userFatigue - 用户疲劳度（可选）
 */
export function useMasteryDetail(
  wordId: string,
  userFatigue?: number,
): UseQueryResult<MasteryEvaluation, Error> {
  return useQuery({
    queryKey: queryKeys.studyProgress.masteryDetail(wordId, userFatigue),
    queryFn: async () => {
      const data = await apiClient.getWordMasteryDetail(wordId, userFatigue);
      return data;
    },
    staleTime: 60 * 1000, // 1分钟
    enabled: !!wordId,
  });
}

/**
 * 组合Hook: 获取已学习单词及其掌握度数据
 * 用于WordMasteryPage等需要完整数据的场景
 *
 * 返回格式兼容旧版API
 */
export interface WordWithMastery {
  id: string;
  spelling: string;
  meanings: string;
  mastery: MasteryEvaluation | null;
}

export function useMasteryWords() {
  const wordsQuery = useLearnedWords();
  const statsQuery = useMasteryStats();

  // 提取所有单词ID - 使用 useMemo 稳定引用
  const wordIds = useMemo(() => {
    return wordsQuery.data?.map((w) => w.id) ?? [];
  }, [wordsQuery.data]);

  // 批量获取掌握度数据
  const masteryQuery = useBatchMasteryEvaluation(wordIds);

  // 创建 masteryMap 用于 O(1) 查找，避免 O(n²) 的 find() 查找
  const masteryMap = useMemo(() => {
    const map = new Map<string, MasteryEvaluation>();
    if (masteryQuery.data) {
      for (const m of masteryQuery.data) {
        map.set(m.wordId, m);
      }
    }
    return map;
  }, [masteryQuery.data]);

  // 合并数据 - 使用 useMemo 避免每次渲染都创建新数组
  const wordsWithMastery: WordWithMastery[] = useMemo(() => {
    return (
      wordsQuery.data?.map((word) => {
        const mastery = masteryMap.get(word.id) ?? null;
        return {
          id: word.id,
          spelling: word.spelling,
          meanings: word.meanings.join('; '),
          mastery,
        };
      }) ?? []
    );
  }, [wordsQuery.data, masteryMap]);

  // 使用 useCallback 稳定 refetch 函数引用
  const refetch = useCallback(async () => {
    await Promise.all([wordsQuery.refetch(), statsQuery.refetch(), masteryQuery.refetch()]);
  }, [wordsQuery, statsQuery, masteryQuery]);

  return {
    words: wordsWithMastery,
    stats: statsQuery.data ?? null,
    loading: wordsQuery.isLoading || statsQuery.isLoading || masteryQuery.isLoading,
    error:
      wordsQuery.error?.message || statsQuery.error?.message || masteryQuery.error?.message || null,
    refetch,
  };
}
