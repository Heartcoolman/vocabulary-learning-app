import { z } from 'zod';

export const createRecordSchema = z.object({
  wordId: z.string().min(1),
  // 兼容旧数据：允许 null，会在服务层转为空字符串
  selectedAnswer: z.union([z.string().min(1), z.null()]),
  correctAnswer: z.union([z.string().min(1), z.null()]),
  isCorrect: z.boolean(),
  // 客户端生成的毫秒时间戳，用于幂等去重，必填
  timestamp: z.number().int().nonnegative(),
  // 扩展字段：用于智能算法和统计分析
  responseTime: z.number().int().nonnegative().optional(),
  dwellTime: z.number().int().nonnegative().optional(),
  sessionId: z.string().max(255).optional(),
  masteryLevelBefore: z.number().int().min(0).max(5).optional(),
  masteryLevelAfter: z.number().int().min(0).max(5).optional(),
});

export const batchCreateRecordsSchema = z.object({
  records: z.array(createRecordSchema),
});

