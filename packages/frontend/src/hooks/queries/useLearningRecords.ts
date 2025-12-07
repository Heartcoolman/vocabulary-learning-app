/**
 * 学习记录查询 Hooks
 *
 * 提供学习记录的查询功能，支持分页
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import apiClient from '../../services/ApiClient';
import { AnswerRecord } from '../../types/models';

/**
 * 学习记录查询选项
 */
export interface LearningRecordsOptions {
  /** 页码（从 1 开始） */
  page?: number;
  /** 每页大小 */
  pageSize?: number;
}

/**
 * 学习记录查询结果
 */
export interface LearningRecordsResult {
  records: AnswerRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * React Query 键工厂
 */
export const learningRecordsKeys = {
  all: ['learningRecords'] as const,
  lists: () => [...learningRecordsKeys.all, 'list'] as const,
  list: (options: LearningRecordsOptions) =>
    [...learningRecordsKeys.lists(), options] as const,
};

/**
 * 获取学习记录（分页）
 *
 * @param options - 查询选项
 * @param queryOptions - React Query 配置
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useLearningRecords({
 *   page: 1,
 *   pageSize: 20
 * });
 *
 * if (isLoading) return <div>加载中...</div>;
 * if (error) return <div>错误: {error.message}</div>;
 *
 * return (
 *   <div>
 *     {data?.records.map(record => (
 *       <div key={record.id}>{record.wordId}</div>
 *     ))}
 *     <Pagination {...data?.pagination} />
 *   </div>
 * );
 * ```
 */
export function useLearningRecords(
  options: LearningRecordsOptions = {},
  queryOptions?: Omit<
    UseQueryOptions<LearningRecordsResult, Error>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery<LearningRecordsResult, Error>({
    queryKey: learningRecordsKeys.list(options),
    queryFn: async () => {
      return await apiClient.getAnswerRecords(options);
    },
    staleTime: 1000 * 60 * 5, // 5分钟
    gcTime: 1000 * 60 * 30, // 30分钟
    ...queryOptions,
  });
}

/**
 * 预取学习记录
 *
 * 用于在需要数据之前预先加载，提升用户体验
 *
 * @example
 * ```tsx
 * import { useQueryClient } from '@tanstack/react-query';
 * import { prefetchLearningRecords } from './useLearningRecords';
 *
 * function MyComponent() {
 *   const queryClient = useQueryClient();
 *
 *   const handleMouseEnter = () => {
 *     // 鼠标悬停时预取数据
 *     prefetchLearningRecords(queryClient, { page: 2 });
 *   };
 *
 *   return <button onMouseEnter={handleMouseEnter}>下一页</button>;
 * }
 * ```
 */
export async function prefetchLearningRecords(
  queryClient: any,
  options: LearningRecordsOptions = {}
) {
  await queryClient.prefetchQuery({
    queryKey: learningRecordsKeys.list(options),
    queryFn: async () => {
      return await apiClient.getAnswerRecords(options);
    },
    staleTime: 1000 * 60 * 5,
  });
}
