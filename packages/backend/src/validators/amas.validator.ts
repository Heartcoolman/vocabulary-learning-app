/**
 * AMAS 路由输入验证器
 * 使用 Zod 进行类型安全的输入校验
 */

import { z } from 'zod';

// 兼容测试的简化 schema
export const userStateSchema = z.object({
  A: z.number().min(0).max(1),
  F: z.number().min(0).max(1),
  M: z.number().min(-1).max(1),
  C: z.object({
    mem: z.number().min(0).max(1).optional(),
    speed: z.number().min(0).max(1).optional(),
    stability: z.number().min(0).max(1).optional()
  }).partial()
});

export const actionSchema = z.object({
  interval_scale: z.number(),
  new_ratio: z.number().min(0).max(1),
  difficulty: z.enum(['low', 'mid', 'high']),
  batch_size: z.number().int().positive(),
  hint_level: z.number().int().min(0)
});

/**
 * 处理学习事件请求验证
 * POST /api/amas/process
 * 使用 coerce 兼容字符串数字输入
 */
export const processEventSchema = z.object({
  wordId: z.string().min(1, '单词ID不能为空'),
  isCorrect: z.boolean({ required_error: 'isCorrect 必须是布尔值' }),
  responseTime: z.coerce.number()
    .positive('响应时间必须为正数')
    .max(300000, '响应时间不能超过5分钟'),
  sessionId: z.string().optional(),
  dwellTime: z.coerce.number().min(0).max(600000).optional(),
  pauseCount: z.coerce.number().int().min(0).max(1000).optional(),
  switchCount: z.coerce.number().int().min(0).max(1000).optional(),
  retryCount: z.coerce.number().int().min(0).max(100).optional(),
  focusLossDuration: z.coerce.number().min(0).max(600000).optional(),
  interactionDensity: z.coerce.number().min(0).max(10).optional(),
  // 对话框暂停时间（毫秒），用于疲劳度计算时排除非学习时间
  pausedTimeMs: z.coerce.number().int().min(0).max(3600000).optional(),
});

/**
 * 单个批量事件项验证
 * 使用 refine 动态校验 timestamp 上限，避免模块加载时静态计算的问题
 */
const batchEventItemSchema = z.object({
  wordId: z.string().min(1, '单词ID不能为空'),
  isCorrect: z.boolean({ required_error: 'isCorrect 必须是布尔值' }),
  responseTime: z.coerce.number()
    .positive('响应时间必须为正数')
    .max(300000, '响应时间不能超过5分钟'),
  timestamp: z.coerce.number()
    .positive('时间戳必须为正数')
    .refine(
      (ts) => ts <= Date.now() + 86400000,
      { message: '时间戳不能超过未来24小时' }
    ),
});

/**
 * 批量处理事件请求验证
 * POST /api/amas/batch-process
 * 限制最大 100 条事件防止 DoS
 */
export const batchProcessSchema = z.object({
  events: z.array(batchEventItemSchema)
    .min(1, '事件数组不能为空')
    .max(100, '单次批量处理最多100条事件'),
});

/**
 * 延迟奖励查询验证
 * GET /api/amas/delayed-rewards
 */
export const delayedRewardsQuerySchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'DONE', 'FAILED']).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export type ProcessEventDto = z.infer<typeof processEventSchema>;
export type BatchProcessDto = z.infer<typeof batchProcessSchema>;
export type DelayedRewardsQueryDto = z.infer<typeof delayedRewardsQuerySchema>;
