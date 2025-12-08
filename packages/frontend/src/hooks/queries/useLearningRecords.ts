/**
 * 学习记录查询 Hooks
 *
 * 提供学习记录的查询功能，支持分页
 * 包含完整的 CRUD 操作和缓存管理
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { learningClient, wordBookClient } from '../../services/client';
import { queryKeys } from '../../lib/queryKeys';
import type { AnswerRecord } from '../../types/models';
import type { StudyProgress } from '../../services/client/wordbook/WordBookClient';

// ==================== 类型定义 ====================

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
 * 创建学习记录的输入参数
 * 只需提供核心字段，其他字段由后端自动填充
 */
export interface CreateRecordInput {
  /** 单词ID */
  wordId: string;
  /** 时间戳 */
  timestamp: number;
  /** 用户选择的答案 */
  selectedAnswer: string;
  /** 正确答案 */
  correctAnswer: string;
  /** 是否正确 */
  isCorrect: boolean;
  /** 响应时间（毫秒） */
  responseTime?: number;
  /** 停留时间（毫秒） */
  dwellTime?: number;
  /** 会话ID */
  sessionId?: string;
  /** 答题前掌握等级 */
  masteryLevelBefore?: number;
  /** 答题后掌握等级 */
  masteryLevelAfter?: number;
}

/**
 * 学习进度数据（重新导出以方便使用）
 */
export type { StudyProgress };

/**
 * 提交答案参数（简化版，用于 useSubmitAnswerMutation）
 */
export interface SubmitAnswerInput {
  /** 单词ID */
  wordId: string;
  /** 用户选择的答案 */
  selectedAnswer: string;
  /** 正确答案 */
  correctAnswer: string;
  /** 是否正确 */
  isCorrect: boolean;
  /** 响应时间（毫秒） */
  responseTime?: number;
  /** 停留时间（毫秒） */
  dwellTime?: number;
}

// ==================== React Query 键工厂 ====================

/**
 * 学习记录查询键工厂
 */
export const learningRecordsKeys = {
  all: ['learningRecords'] as const,
  lists: () => [...learningRecordsKeys.all, 'list'] as const,
  list: (options: LearningRecordsOptions) => [...learningRecordsKeys.lists(), options] as const,
  progress: () => [...learningRecordsKeys.all, 'progress'] as const,
};

// ==================== Query Hooks ====================

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
  queryOptions?: Omit<UseQueryOptions<LearningRecordsResult, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<LearningRecordsResult, Error>({
    queryKey: learningRecordsKeys.list(options),
    queryFn: async () => {
      return await learningClient.getRecords(options);
    },
    staleTime: 1000 * 60 * 5, // 5分钟
    gcTime: 1000 * 60 * 30, // 30分钟
    ...queryOptions,
  });
}

/**
 * 获取学习进度
 *
 * @example
 * ```tsx
 * const { data: progress, isLoading } = useProgress();
 *
 * if (progress) {
 *   console.log(`今日已学习: ${progress.todayStudied}/${progress.todayTarget}`);
 *   console.log(`正确率: ${progress.correctRate}%`);
 * }
 * ```
 */
export function useProgress(
  queryOptions?: Omit<UseQueryOptions<StudyProgress, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<StudyProgress, Error>({
    queryKey: learningRecordsKeys.progress(),
    queryFn: async () => {
      return await wordBookClient.getStudyProgress();
    },
    staleTime: 1000 * 60, // 1分钟
    refetchInterval: 1000 * 60, // 每分钟自动刷新
    refetchOnWindowFocus: true,
    ...queryOptions,
  });
}

/**
 * 获取学习进度（别名，与 useProgress 相同）
 */
export const useStudyProgressQuery = useProgress;

// ==================== Mutation Hooks ====================

/**
 * 创建学习记录的 Mutation Hook
 *
 * @example
 * ```tsx
 * const { mutate: createRecord, isPending } = useCreateLearningRecord({
 *   onSuccess: () => {
 *     toast.success('记录已保存');
 *   },
 * });
 *
 * const handleAnswer = (answer: string) => {
 *   createRecord({
 *     wordId: currentWord.id,
 *     selectedAnswer: answer,
 *     correctAnswer: currentWord.correctAnswer,
 *     isCorrect: answer === currentWord.correctAnswer,
 *     responseTime: 2500,
 *   });
 * };
 * ```
 */
export function useCreateLearningRecord(options?: {
  onSuccess?: (record: AnswerRecord) => void;
  onError?: (error: Error) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateRecordInput): Promise<AnswerRecord> => {
      // 构建完整的记录数据，后端会自动填充 userId, createdAt, updatedAt
      const recordData = {
        wordId: input.wordId,
        selectedAnswer: input.selectedAnswer,
        correctAnswer: input.correctAnswer,
        isCorrect: input.isCorrect,
        timestamp: input.timestamp,
        responseTime: input.responseTime,
        dwellTime: input.dwellTime,
        sessionId: input.sessionId,
        masteryLevelBefore: input.masteryLevelBefore,
        masteryLevelAfter: input.masteryLevelAfter,
      } as Omit<AnswerRecord, 'id'>;

      return await learningClient.createRecord(recordData);
    },
    onSuccess: (record) => {
      // 使学习记录列表缓存失效
      queryClient.invalidateQueries({ queryKey: learningRecordsKeys.lists() });
      // 使学习进度缓存失效
      queryClient.invalidateQueries({ queryKey: learningRecordsKeys.progress() });
      // 使统计数据缓存失效
      queryClient.invalidateQueries({ queryKey: queryKeys.statistics.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.user.statistics() });

      options?.onSuccess?.(record);
    },
    onError: (error: Error) => {
      options?.onError?.(error);
    },
  });
}

/**
 * 批量创建学习记录的 Mutation Hook
 *
 * @example
 * ```tsx
 * const { mutate: batchCreate, isPending } = useBatchCreateRecords();
 *
 * const handleSessionEnd = (records: CreateRecordInput[]) => {
 *   batchCreate(records);
 * };
 * ```
 */
export function useBatchCreateRecords(options?: {
  onSuccess?: (records: AnswerRecord[]) => void;
  onError?: (error: Error) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inputs: CreateRecordInput[]): Promise<AnswerRecord[]> => {
      // 转换输入为 API 期望的格式
      const records = inputs.map((input) => ({
        wordId: input.wordId,
        selectedAnswer: input.selectedAnswer,
        correctAnswer: input.correctAnswer,
        isCorrect: input.isCorrect,
        timestamp: input.timestamp,
        responseTime: input.responseTime,
        dwellTime: input.dwellTime,
        sessionId: input.sessionId,
        masteryLevelBefore: input.masteryLevelBefore,
        masteryLevelAfter: input.masteryLevelAfter,
      })) as Omit<AnswerRecord, 'id'>[];

      return await learningClient.batchCreateRecords(records);
    },
    onSuccess: (records) => {
      // 使所有相关缓存失效
      queryClient.invalidateQueries({ queryKey: learningRecordsKeys.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.statistics.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.user.statistics() });

      options?.onSuccess?.(records);
    },
    onError: (error: Error) => {
      options?.onError?.(error);
    },
  });
}

/**
 * 提交答案的 Mutation Hook（简化版）
 *
 * 这是一个方便使用的 Hook，会自动添加时间戳
 *
 * @example
 * ```tsx
 * const { mutate: submitAnswer, isPending } = useSubmitAnswerMutation();
 *
 * const handleAnswer = (answer: string) => {
 *   submitAnswer({
 *     wordId: word.id,
 *     selectedAnswer: answer,
 *     correctAnswer: word.meanings[0],
 *     isCorrect: answer === word.meanings[0],
 *   });
 * };
 * ```
 */
export function useSubmitAnswerMutation(options?: {
  onSuccess?: (record: AnswerRecord) => void;
  onError?: (error: Error) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitAnswerInput): Promise<AnswerRecord> => {
      const recordData = {
        wordId: input.wordId,
        selectedAnswer: input.selectedAnswer,
        correctAnswer: input.correctAnswer,
        isCorrect: input.isCorrect,
        timestamp: Date.now(),
        responseTime: input.responseTime,
        dwellTime: input.dwellTime,
      } as Omit<AnswerRecord, 'id'>;

      return await learningClient.createRecord(recordData);
    },
    onSuccess: (record) => {
      // 使相关缓存失效
      queryClient.invalidateQueries({ queryKey: learningRecordsKeys.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.statistics.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.studyProgress.all });

      options?.onSuccess?.(record);
    },
    onError: (error: Error) => {
      options?.onError?.(error);
    },
  });
}

// ==================== 预取函数 ====================

/**
 * 预取学习记录
 *
 * 用于在需要数据之前预先加载，提升用户体验
 *
 * @example
 * ```tsx
 * import { useQueryClient } from '@tanstack/react-query';
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
  queryClient: ReturnType<typeof useQueryClient>,
  options: LearningRecordsOptions = {},
) {
  await queryClient.prefetchQuery({
    queryKey: learningRecordsKeys.list(options),
    queryFn: async () => {
      return await learningClient.getRecords(options);
    },
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * 预取学习进度
 */
export async function prefetchProgress(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.prefetchQuery({
    queryKey: learningRecordsKeys.progress(),
    queryFn: async () => {
      return await wordBookClient.getStudyProgress();
    },
    staleTime: 1000 * 60,
  });
}

// ==================== 缓存失效辅助函数 ====================

/**
 * 使学习记录相关缓存失效
 */
export function invalidateLearningRecordsCache(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: learningRecordsKeys.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.statistics.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.user.statistics() });
}
