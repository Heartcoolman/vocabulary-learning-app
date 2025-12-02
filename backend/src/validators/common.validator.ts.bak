import { z } from 'zod';

/**
 * 分页参数限制常量
 */
export const PAGINATION_LIMITS = {
  MIN_PAGE: 1,
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE_SIZE: 20,
} as const;

/**
 * 通用分页参数验证 Schema
 * - page: 最小值 1
 * - pageSize: 最小值 1，最大值 100
 */
export const paginationSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => {
      const num = val ? parseInt(val, 10) : PAGINATION_LIMITS.MIN_PAGE;
      return Math.max(PAGINATION_LIMITS.MIN_PAGE, num);
    }),
  pageSize: z
    .string()
    .optional()
    .transform((val) => {
      const num = val ? parseInt(val, 10) : PAGINATION_LIMITS.DEFAULT_PAGE_SIZE;
      return Math.min(
        PAGINATION_LIMITS.MAX_PAGE_SIZE,
        Math.max(1, num)
      );
    }),
});

/**
 * 搜索参数验证 Schema
 */
export const searchSchema = z.object({
  search: z
    .string()
    .optional()
    .transform((val) => val?.trim() || undefined),
});

/**
 * 排序方向验证
 */
export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

/**
 * 通用 ID 参数验证（UUID 格式）
 */
export const idParamSchema = z.object({
  id: z.string().uuid('无效的ID格式'),
});

/**
 * 用户ID参数验证
 */
export const userIdParamSchema = z.object({
  userId: z.string().uuid('无效的用户ID格式'),
});

/**
 * 单词ID参数验证
 */
export const wordIdParamSchema = z.object({
  wordId: z.string().uuid('无效的单词ID格式'),
});

/**
 * 组合用户ID和单词ID参数验证
 */
export const userWordParamsSchema = z.object({
  userId: z.string().uuid('无效的用户ID格式'),
  wordId: z.string().uuid('无效的单词ID格式'),
});

/**
 * 通用 limit 参数验证
 */
export const limitSchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => {
      const num = val ? parseInt(val, 10) : 50;
      return Math.min(PAGINATION_LIMITS.MAX_PAGE_SIZE, Math.max(1, num));
    }),
});

/**
 * 日期范围验证 Schema
 */
export const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * 组合分页和搜索的 Schema
 */
export const paginatedSearchSchema = paginationSchema.merge(searchSchema);

export type PaginationParams = z.infer<typeof paginationSchema>;
export type SearchParams = z.infer<typeof searchSchema>;
export type PaginatedSearchParams = z.infer<typeof paginatedSearchSchema>;
