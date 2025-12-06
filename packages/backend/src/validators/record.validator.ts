import { z } from 'zod';
import { paginationSchema } from './common.validator';

const baseRecordSchema = z.object({
  wordId: z.string().uuid('无效的单词ID'),
  selectedOption: z.string().min(1).optional(),
  selectedAnswer: z.string().min(1).optional(),
  correctAnswer: z.string().min(1).optional(),
  isCorrect: z.boolean(),
  timestamp: z.number().int().nonnegative().optional(),
  responseTime: z.number().int().nonnegative().optional(),
  dwellTime: z.number().int().nonnegative().optional(),
  sessionId: z.string().max(255).optional(),
  masteryLevelBefore: z.number().int().min(0).max(5).optional(),
  masteryLevelAfter: z.number().int().min(0).max(5).optional(),
});

export const createRecordSchema = baseRecordSchema.transform((data) => ({
  wordId: data.wordId,
  selectedAnswer: data.selectedAnswer ?? data.selectedOption ?? null,
  correctAnswer: data.correctAnswer ?? null,
  isCorrect: data.isCorrect,
  timestamp: data.timestamp,
  responseTime: data.responseTime,
  dwellTime: data.dwellTime,
  sessionId: data.sessionId,
  masteryLevelBefore: data.masteryLevelBefore,
  masteryLevelAfter: data.masteryLevelAfter,
}));

export const batchCreateRecordsSchema = z.object({
  records: z.array(createRecordSchema),
});

export const recordQuerySchema = paginationSchema.extend({
  wordId: z.string().uuid('无效的单词ID格式').optional(),
});
