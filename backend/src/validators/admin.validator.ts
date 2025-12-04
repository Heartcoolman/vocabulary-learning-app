import { z } from 'zod';
import {
  paginationSchema as basePaginationSchema,
  searchSchema,
  limitSchema,
  userIdParamSchema
} from './common.validator';

export const paginationSchema = basePaginationSchema;
export const userIdSchema = userIdParamSchema;

/**
 * 管理员获取用户列表 schema
 */
export const adminGetUsersSchema = basePaginationSchema.merge(searchSchema);

/**
 * 管理员获取用户单词 schema
 */
export const adminUserWordsSchema = basePaginationSchema.extend({
  scoreRange: z.enum(['low', 'medium', 'high']).optional(),
  masteryLevel: z.coerce.number().int().min(0).max(5).optional(),
  minAccuracy: z.coerce.number().min(0).max(100).optional(),
  state: z.enum(['new', 'learning', 'reviewing', 'mastered']).optional(),
  sortBy: z.enum(['score', 'accuracy', 'reviewCount', 'lastReview']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

/**
 * 管理员获取用户学习数据 schema
 */
export const adminLearningDataSchema = limitSchema;

/**
 * 管理员获取用户热力图 schema
 */
export const adminHeatmapSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(90),
});

/**
 * 管理员获取单词历史 schema
 */
export const adminWordHistorySchema = limitSchema;

/**
 * 更新用户角色 schema
 */
export const updateUserRoleSchema = z.object({
  role: z.enum(['USER', 'ADMIN'], {
    errorMap: () => ({ message: '无效的角色，必须是 USER 或 ADMIN' }),
  }),
});

export const updateRoleSchema = updateUserRoleSchema;

/**
 * 管理员获取用户学习记录 schema
 */
export const adminUserRecordsSchema = basePaginationSchema.extend({
  userId: userIdParamSchema.shape.userId,
});

/**
 * 管理员获取用户词书 schema
 */
export const adminUserWordBooksSchema = basePaginationSchema.extend({
  userId: userIdParamSchema.shape.userId,
});

/**
 * 创建系统词库请求体验证
 */
export const createSystemWordBookSchema = z.object({
  name: z.string().min(1, '词库名称不能为空').max(100, '词库名称最多100个字符'),
  description: z.string().max(500, '描述最多500个字符').optional(),
  coverImage: z.string().url('封面图片必须是有效的URL').optional(),
});

/**
 * 更新系统词库请求体验证
 */
export const updateSystemWordBookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  coverImage: z.string().url().optional(),
});

/**
 * 批量添加单词请求体验证
 */
export const batchAddWordsSchema = z.object({
  words: z
    .array(
      z.object({
        spelling: z.string().min(1, '单词拼写不能为空'),
        phonetic: z.string().min(1, '音标不能为空'),
        meanings: z.array(z.string()).min(1, '至少需要一个释义'),
        examples: z.array(z.string()),
        audioUrl: z.string().url().optional(),
      })
    )
    .min(1, '单词列表不能为空')
    .max(1000, '单次最多添加1000个单词'),
});

/**
 * 标记异常请求体验证
 */
export const flagAnomalySchema = z.object({
  recordId: z.string().uuid().optional(),
  reason: z.string().min(1, '标记原因不能为空').max(500, '原因最多500个字符'),
  notes: z.string().max(1000, '备注最多1000个字符').optional(),
});

/**
 * 导出格式验证
 */
export const exportFormatSchema = z.object({
  format: z.enum(['csv', 'excel']).default('csv'),
});
