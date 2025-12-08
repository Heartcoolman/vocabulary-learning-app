/**
 * 学习相关Zod Schema
 * 用于运行时验证和类型推断
 */

import { z } from 'zod';

/**
 * 学习配置DTO Schema
 */
export const StudyConfigDtoSchema = z.object({
  selectedWordBookIds: z.array(z.string().uuid()).min(1, 'At least one word book must be selected'),
  dailyWordCount: z
    .number()
    .int()
    .min(1, 'Daily word count must be at least 1')
    .max(1000, 'Daily word count too high'),
  studyMode: z.string().optional(),
});

/**
 * 学习配置Schema
 */
export const StudyConfigSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  selectedWordBookIds: z.array(z.string().uuid()),
  dailyWordCount: z.number().int(),
  studyMode: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

/**
 * 创建答题记录DTO Schema
 */
export const CreateRecordDtoSchema = z.object({
  wordId: z.string().uuid(),
  selectedAnswer: z.string().nullable(),
  correctAnswer: z.string().nullable(),
  isCorrect: z.boolean(),
  timestamp: z.number().optional(),
  responseTime: z.number().nonnegative().optional(),
  dwellTime: z.number().nonnegative().optional(),
  sessionId: z.string().uuid().optional(),
  masteryLevelBefore: z.number().min(0).max(5).optional(),
  masteryLevelAfter: z.number().min(0).max(5).optional(),
});

/**
 * 答题记录Schema
 */
export const AnswerRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  wordId: z.string().uuid(),
  selectedAnswer: z.string(),
  correctAnswer: z.string(),
  isCorrect: z.boolean(),
  timestamp: z.number(),
  responseTime: z.number().optional(),
  dwellTime: z.number().optional(),
  sessionId: z.string().uuid().optional(),
  masteryLevelBefore: z.number().optional(),
  masteryLevelAfter: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

/**
 * 学习会话Schema
 */
export const LearningSessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  wordIds: z.array(z.string().uuid()),
  currentIndex: z.number().int().nonnegative(),
  startTime: z.number(),
  endTime: z.number().nullable().optional(),
  wordsStudied: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  totalTime: z.number().nonnegative(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
