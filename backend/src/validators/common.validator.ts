import { z } from 'zod';

// 分页限制常量
export const PAGINATION_LIMITS = {
  MIN_PAGE: 1,
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE_SIZE: 20,
} as const;

/**
 * 通用 UUID 验证
 */
export const uuidSchema = z.string().uuid('无效的UUID格式');

/**
 * 分页查询 schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(PAGINATION_LIMITS.MIN_PAGE).default(PAGINATION_LIMITS.MIN_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION_LIMITS.MAX_PAGE_SIZE).default(PAGINATION_LIMITS.DEFAULT_PAGE_SIZE),
  pageSize: z.coerce.number().int().min(1).max(PAGINATION_LIMITS.MAX_PAGE_SIZE).optional(),
});

/**
 * 限制数量 schema
 */
export const limitSchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => {
      const num = val ? parseInt(val, 10) : PAGINATION_LIMITS.DEFAULT_PAGE_SIZE;
      return Math.min(PAGINATION_LIMITS.MAX_PAGE_SIZE, Math.max(1, num));
    }),
});

/**
 * 搜索关键词 schema
 */
export const searchSchema = z.object({
  search: z.string().optional(),
});

/**
 * 日期范围 schema
 */
export const dateRangeSchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/**
 * 排序顺序 schema
 */
export const sortOrderSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

/**
 * 用户ID参数 schema
 */
export const userIdParamSchema = z.object({
  userId: uuidSchema,
});

/**
 * 通用 ID 参数 schema
 */
export const idParamSchema = z.object({
  id: uuidSchema,
});

/**
 * 用户-单词组合参数 schema
 */
export const userWordParamsSchema = z.object({
  userId: uuidSchema,
  wordId: uuidSchema,
});
