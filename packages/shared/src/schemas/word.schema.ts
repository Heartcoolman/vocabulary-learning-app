/**
 * 单词相关Zod Schema
 * 用于运行时验证和类型推断
 */

import { z } from 'zod';

/**
 * 词书类型Schema
 */
export const WordBookTypeSchema = z.enum(['SYSTEM', 'USER']);

/**
 * 创建单词Schema
 */
export const CreateWordDtoSchema = z.object({
  spelling: z.string().min(1, 'Spelling is required').max(100, 'Spelling too long'),
  phonetic: z.string().nullable().optional(),
  meanings: z.array(z.string().min(1)).min(1, 'At least one meaning is required'),
  examples: z.array(z.string()),
  audioUrl: z.string().url('Invalid URL').nullable().optional(),
});

/**
 * 更新单词Schema
 */
export const UpdateWordDtoSchema = z.object({
  spelling: z.string().min(1).max(100).optional(),
  phonetic: z.string().nullable().optional(),
  meanings: z.array(z.string().min(1)).min(1).optional(),
  examples: z.array(z.string()).optional(),
  audioUrl: z.string().url().nullable().optional(),
});

/**
 * 单词Schema
 */
export const WordSchema = z.object({
  id: z.string().uuid(),
  spelling: z.string(),
  phonetic: z.string().nullable().optional(),
  meanings: z.array(z.string()),
  examples: z.array(z.string()),
  audioUrl: z.string().nullable().optional(),
  wordBookId: z.string().uuid().optional(),
  frequency: z.number().optional(),
  difficulty: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

/**
 * 创建词书Schema
 */
export const CreateWordBookDtoSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  coverImage: z.string().url('Invalid URL').optional(),
});

/**
 * 更新词书Schema
 */
export const UpdateWordBookDtoSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  coverImage: z.string().url().optional(),
});

/**
 * 词书Schema
 */
export const WordBookSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  type: WordBookTypeSchema,
  userId: z.string().uuid().nullable().optional(),
  isPublic: z.boolean(),
  wordCount: z.number().int().nonnegative(),
  coverImage: z.string().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
