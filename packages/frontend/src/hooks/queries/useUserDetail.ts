import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import apiClient, { UserWordDetail } from '../../services/client';

/**
 * 用户单词列表查询参数
 */
export interface UserWordsParams {
  userId: string;
  page?: number;
  pageSize?: number;
  scoreRange?: 'low' | 'medium' | 'high';
  masteryLevel?: number;
  minAccuracy?: number;
  state?: 'new' | 'learning' | 'reviewing' | 'mastered';
  sortBy?: 'score' | 'accuracy' | 'reviewCount' | 'lastReview';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 获取用户单词列表的 Query Hook
 * 支持分页、筛选和排序
 */
export function useUserWords(params: UserWordsParams) {
  const {
    userId,
    page = 1,
    pageSize = 20,
    scoreRange,
    masteryLevel,
    minAccuracy,
    state,
    sortBy = 'lastReview',
    sortOrder = 'desc',
  } = params;

  return useQuery({
    queryKey: queryKeys.admin.userWords.list({
      userId,
      page,
      pageSize,
      scoreRange,
      masteryLevel,
      minAccuracy,
      state,
      sortBy,
      sortOrder,
    }),
    queryFn: async () => {
      const response = await apiClient.adminGetUserWords(userId, {
        page,
        pageSize,
        scoreRange,
        masteryLevel,
        minAccuracy,
        state,
        sortBy,
        sortOrder,
      });
      return response;
    },
    enabled: !!userId, // 只有userId存在时才执行查询
    // 配置 placeholderData 避免分页切换时的闪烁
    placeholderData: keepPreviousData,
    // 缓存时间2分钟
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * 获取单个用户单词详情的 Query Hook
 */
export function useUserWordDetail(userId: string, wordId: string) {
  return useQuery({
    queryKey: queryKeys.admin.userWords.detail(userId, wordId),
    queryFn: async () => {
      // 尝试直接获取指定单词详情，失败后回退到分页查找
      try {
        const response = await fetch(`/api/admin/users/${userId}/words/${wordId}`, {
          credentials: 'include',
        });
        if (response.ok) {
          const result = await response.json();
          if (result?.data) {
            return result.data as UserWordDetail;
          }
        }
      } catch {
        // ignore and fallback
      }

      // 分页查找指定单词，避免一次性拉取超大列表
      let page = 1;
      const pageSize = 100;

      while (true) {
        const response = await apiClient.adminGetUserWords(userId, {
          page,
          pageSize,
        });

        const found = response.words.find((w) => w.word.id === wordId);
        if (found) {
          return found;
        }

        if (page >= response.pagination.totalPages) {
          break;
        }
        page += 1;
      }

      throw new Error('Word not found');
    },
    enabled: !!userId && !!wordId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * 导出用户单词数据
 */
export async function exportUserWords(userId: string, format: 'csv' | 'excel') {
  return apiClient.adminExportUserWords(userId, format);
}
