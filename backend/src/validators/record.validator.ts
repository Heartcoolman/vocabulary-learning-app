import { z } from 'zod';

export const createRecordSchema = z.object({
  wordId: z.string().min(1),
  // 兼容旧数据：允许 null，会在服务层转为空字符串
  selectedAnswer: z.union([z.string().min(1), z.null()]),
  correctAnswer: z.union([z.string().min(1), z.null()]),
  isCorrect: z.boolean(),
  // 客户端生成的毫秒时间戳，用于幂等去重，必填
  timestamp: z.number().int().nonnegative(),
});

export const batchCreateRecordsSchema = z.object({
  records: z.array(createRecordSchema),
});

