import { z } from 'zod';

export const createRecordSchema = z.object({
  wordId: z.string().min(1),
  // 兼容旧数据：允许 null，但会在服务层转为空字符串
  selectedAnswer: z.union([z.string().min(1), z.null()]),
  correctAnswer: z.union([z.string().min(1), z.null()]),
  isCorrect: z.boolean(),
  // 使用客户端生成的时间戳（毫秒），用于跨端一致去重
  timestamp: z.number().int().nonnegative().optional(),
});

export const batchCreateRecordsSchema = z.object({
  records: z.array(createRecordSchema),
});
