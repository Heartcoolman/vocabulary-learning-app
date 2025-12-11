/**
 * API 响应相关 Zod Schema
 * 用于核心 API 响应的运行时验证
 *
 * 核心 API 包括:
 * - 登录/注册响应
 * - 单词列表响应
 * - 学习会话响应
 */

import { z } from 'zod';
import { UserRoleSchema, UserInfoSchema } from './user.schema';
import { WordSchema, WordBookSchema } from './word.schema';
import { StudyConfigSchema, LearningSessionSchema, AnswerRecordSchema } from './study.schema';

// ============================================
// 通用响应 Schema
// ============================================

/**
 * API 统一响应包装 Schema
 */
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    code: z.string().optional(),
  });

/**
 * 分页信息 Schema
 */
export const PaginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

// ============================================
// 认证相关响应 Schema
// ============================================

/**
 * 用户 Schema (API 响应格式，日期为字符串)
 */
export const UserApiSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  username: z.string(),
  role: UserRoleSchema,
  createdAt: z.string(), // API 返回 ISO 字符串
});

/**
 * 登录/注册响应 Schema
 */
export const AuthResponseSchema = z.object({
  user: UserApiSchema,
  token: z.string(),
});

/**
 * 用户统计 Schema
 */
export const UserStatisticsSchema = z.object({
  totalWords: z.number().int().nonnegative(),
  totalRecords: z.number().int().nonnegative(),
  correctRate: z.number().min(0).max(1),
});

// ============================================
// 单词相关响应 Schema
// ============================================

/**
 * 单词 API 响应 Schema (日期为字符串)
 */
export const WordApiSchema = z.object({
  id: z.string().uuid(),
  spelling: z.string(),
  phonetic: z.string().nullable().optional(),
  meanings: z.array(z.string()),
  examples: z.array(z.string()),
  audioUrl: z.string().nullable().optional(),
  wordBookId: z.string().uuid().optional(),
  frequency: z.number().optional(),
  difficulty: z.number().optional(),
  createdAt: z.string(), // API 返回 ISO 字符串
  updatedAt: z.string(),
});

/**
 * 单词列表响应 Schema
 */
export const WordListResponseSchema = z.array(WordApiSchema);

/**
 * 词书 API 响应 Schema (日期为字符串)
 */
export const WordBookApiSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  type: z.enum(['SYSTEM', 'USER']),
  userId: z.string().uuid().nullable().optional(),
  isPublic: z.boolean(),
  wordCount: z.number().int().nonnegative(),
  coverImage: z.string().nullable().optional(),
  createdAt: z.string(), // API 返回 ISO 字符串
  updatedAt: z.string(),
});

/**
 * 词书列表响应 Schema
 */
export const WordBookListResponseSchema = z.array(WordBookApiSchema);

// ============================================
// 学习相关响应 Schema
// ============================================

/**
 * 学习进度 Schema
 * 注意：correctRate 可能是 0-1（小数）或 0-100（百分比），取决于 API
 * weeklyTrend 在 getTodayWords 中不返回，仅在 getStudyProgress 中返回
 */
export const StudyProgressSchema = z.object({
  todayStudied: z.number().int().nonnegative(),
  todayTarget: z.number().int().nonnegative(),
  totalStudied: z.number().int().nonnegative(),
  correctRate: z.number().min(0).max(100), // 支持 0-100 百分比格式
  weeklyTrend: z.array(z.number()).optional(), // getTodayWords 不返回此字段
});

/**
 * 今日学习策略 Schema（AMAS 返回的选词策略）
 */
export const TodayWordsStrategySchema = z.object({
  difficulty: z.enum(['easy', 'mid', 'hard']),
  newRatio: z.number().min(0).max(1),
});

/**
 * 今日学习单词响应 Schema
 */
export const TodayWordsResponseSchema = z.object({
  words: z.array(WordApiSchema),
  progress: StudyProgressSchema,
  strategy: TodayWordsStrategySchema.optional(), // AMAS 策略信息
});

/**
 * 学习配置 API 响应 Schema (日期为字符串)
 */
export const StudyConfigApiSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  selectedWordBookIds: z.array(z.string().uuid()),
  dailyWordCount: z.number().int(),
  studyMode: z.string().optional(),
  createdAt: z.string(), // API 返回 ISO 字符串
  updatedAt: z.string(),
});

/**
 * 答题记录 API 响应 Schema (日期为字符串或数字)
 */
export const AnswerRecordApiSchema = z.object({
  id: z.string().uuid(),
  wordId: z.string().uuid(),
  selectedAnswer: z.string(),
  correctAnswer: z.string(),
  isCorrect: z.boolean(),
  timestamp: z.union([z.string(), z.number()]), // 支持字符串或数字
  responseTime: z.number().optional(),
  dwellTime: z.number().optional(),
  sessionId: z.string().uuid().optional(),
  masteryLevelBefore: z.number().optional(),
  masteryLevelAfter: z.number().optional(),
});

/**
 * 学习记录分页响应 Schema
 */
export const RecordsResponseSchema = z.object({
  data: z.array(AnswerRecordApiSchema).optional(),
  pagination: PaginationSchema.optional(),
});

/**
 * 学习会话 API 响应 Schema
 */
export const LearningSessionApiSchema = z.object({
  id: z.string().uuid(),
  wordIds: z.array(z.string().uuid()),
  currentIndex: z.number().int().nonnegative(),
  startTime: z.number(),
  endTime: z.number().nullable().optional(),
});

// ============================================
// 类型推断导出
// ============================================

export type ApiResponseType<T> = z.infer<ReturnType<typeof ApiResponseSchema<z.ZodType<T>>>>;
export type AuthResponseType = z.infer<typeof AuthResponseSchema>;
export type UserStatisticsType = z.infer<typeof UserStatisticsSchema>;
export type WordApiType = z.infer<typeof WordApiSchema>;
export type WordBookApiType = z.infer<typeof WordBookApiSchema>;
export type StudyProgressType = z.infer<typeof StudyProgressSchema>;
export type TodayWordsStrategyType = z.infer<typeof TodayWordsStrategySchema>;
export type TodayWordsResponseType = z.infer<typeof TodayWordsResponseSchema>;
export type StudyConfigApiType = z.infer<typeof StudyConfigApiSchema>;
export type AnswerRecordApiType = z.infer<typeof AnswerRecordApiSchema>;
export type RecordsResponseType = z.infer<typeof RecordsResponseSchema>;
export type LearningSessionApiType = z.infer<typeof LearningSessionApiSchema>;
