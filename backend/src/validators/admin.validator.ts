import { z } from 'zod';
import { paginationSchema, searchSchema, limitSchema, sortOrderSchema } from './common.validator';

/**
 * 管理员获取用户列表参数验证
 */
export const adminGetUsersSchema = paginationSchema.merge(searchSchema);

/**
 * 用户单词列表筛选条件
 */
export const adminUserWordsSchema = paginationSchema.extend({
  scoreRange: z.enum(['low', 'medium', 'high']).optional(),
  masteryLevel: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const num = parseInt(val, 10);
      return num >= 0 && num <= 5 ? num : undefined;
    }),
  minAccuracy: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const num = parseFloat(val);
      return num >= 0 && num <= 100 ? num : undefined;
    }),
  state: z.enum(['new', 'learning', 'reviewing', 'mastered']).optional(),
  sortBy: z.enum(['score', 'accuracy', 'reviewCount', 'lastReview']).optional(),
  sortOrder: sortOrderSchema,
});

/**
 * 学习数据查询参数
 */
export const adminLearningDataSchema = limitSchema;

/**
 * 学习热力图查询参数
 */
export const adminHeatmapSchema = z.object({
  days: z
    .string()
    .optional()
    .transform((val) => {
      const num = val ? parseInt(val, 10) : 90;
      return Math.min(365, Math.max(1, num)); // 最多365天
    }),
});

/**
 * 单词历史查询参数
 */
export const adminWordHistorySchema = limitSchema;

/**
 * 修改用户角色请求体验证
 */
export const updateUserRoleSchema = z.object({
  role: z.enum(['USER', 'ADMIN'], {
    errorMap: () => ({ message: '无效的角色，必须是 USER 或 ADMIN' }),
  }),
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

export type AdminGetUsersParams = z.infer<typeof adminGetUsersSchema>;
export type AdminUserWordsParams = z.infer<typeof adminUserWordsSchema>;
export type UpdateUserRoleBody = z.infer<typeof updateUserRoleSchema>;
export type CreateSystemWordBookBody = z.infer<typeof createSystemWordBookSchema>;
export type BatchAddWordsBody = z.infer<typeof batchAddWordsSchema>;
export type FlagAnomalyBody = z.infer<typeof flagAnomalySchema>;
