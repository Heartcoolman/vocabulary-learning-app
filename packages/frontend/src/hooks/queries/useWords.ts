import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { wordService } from '../../services/word.service';
import type { Word, CreateWordDto } from '@danci/shared';

/**
 * 获取单词列表的 Query Hook
 */
export function useWords(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.words.list(filters || {}),
    queryFn: async () => {
      const response = await wordService.getWords();
      return response.data;
    },
  });
}

/**
 * 获取单个单词详情的 Query Hook
 */
export function useWord(id: string) {
  return useQuery({
    queryKey: queryKeys.words.detail(id),
    queryFn: async () => {
      const response = await wordService.getWordById(id);
      return response.data;
    },
    enabled: !!id, // 只有 id 存在时才执行查询
  });
}

/**
 * 搜索单词的 Query Hook
 */
export function useSearchWords(query: string) {
  return useQuery({
    queryKey: queryKeys.words.search(query),
    queryFn: async () => {
      const response = await wordService.searchWords(query);
      return response.data;
    },
    enabled: query.length > 0, // 只有搜索词不为空时才执行查询
  });
}

/**
 * 创建单词的 Mutation Hook
 */
export function useCreateWord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateWordDto) => {
      const response = await wordService.createWord(data);
      return response.data;
    },
    onSuccess: () => {
      // 创建成功后，使单词列表查询失效，触发重新获取
      queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
    },
  });
}

/**
 * 更新单词的 Mutation Hook
 */
export function useUpdateWord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Word> }) => {
      const response = await wordService.updateWord(id, data);
      return response.data;
    },
    onSuccess: (updatedWord) => {
      // 更新成功后，使相关查询失效
      queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.words.detail(updatedWord.id),
      });
    },
  });
}

/**
 * 删除单词的 Mutation Hook
 */
export function useDeleteWord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await wordService.deleteWord(id);
      return id;
    },
    onSuccess: (deletedId) => {
      // 删除成功后，使相关查询失效
      queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.words.detail(deletedId),
      });
    },
  });
}
