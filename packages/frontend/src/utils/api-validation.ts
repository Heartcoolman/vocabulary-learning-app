/**
 * API 响应验证工具
 *
 * 使用 @danci/shared 中的 Zod Schema 对核心 API 响应进行运行时验证
 *
 * 核心 API 包括:
 * - 登录/注册响应
 * - 单词列表响应
 * - 学习会话响应
 */

import { z } from 'zod';
import {
  AuthResponseSchema,
  UserStatisticsSchema,
  WordListResponseSchema,
  WordBookListResponseSchema,
  TodayWordsResponseSchema,
  StudyConfigApiSchema,
  RecordsResponseSchema,
  WordApiSchema,
  StudyProgressSchema,
  type AuthResponseType,
  type UserStatisticsType,
  type WordApiType,
  type StudyProgressType,
  type TodayWordsResponseType,
  type StudyConfigApiType,
  type RecordsResponseType,
} from '@danci/shared';
import { apiLogger } from './logger';

/**
 * 验证结果类型
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: z.ZodError;
}

/**
 * 通用验证函数
 * @param schema Zod Schema
 * @param data 待验证数据
 * @param context 上下文信息（用于日志）
 */
export function validateApiResponse<T>(
  schema: z.ZodType<T>,
  data: unknown,
  context: string,
): ValidationResult<T> {
  try {
    const result = schema.safeParse(data);

    if (result.success) {
      return { success: true, data: result.data };
    }

    // 验证失败时记录详细错误
    apiLogger.warn(
      {
        context,
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      },
      `API 响应验证失败: ${context}`,
    );

    return {
      success: false,
      error: result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; '),
      details: result.error,
    };
  } catch (error) {
    apiLogger.error({ err: error, context }, `API 响应验证异常: ${context}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : '验证异常',
    };
  }
}

/**
 * 验证并返回数据，失败时抛出错误
 */
export function validateOrThrow<T>(schema: z.ZodType<T>, data: unknown, context: string): T {
  const result = validateApiResponse(schema, data, context);
  if (!result.success) {
    throw new Error(`API 响应验证失败 (${context}): ${result.error}`);
  }
  return result.data!;
}

/**
 * 验证并返回数据，失败时返回原数据（宽松模式）
 * 用于渐进式迁移，避免因验证失败导致功能中断
 */
export function validateOrPassthrough<T>(schema: z.ZodType<T>, data: T, context: string): T {
  const result = validateApiResponse(schema, data, context);
  if (!result.success) {
    apiLogger.warn({ context }, `API 响应验证失败，使用原始数据: ${context}`);
    return data;
  }
  return result.data!;
}

// ============================================
// 核心 API 验证函数
// ============================================

/**
 * 验证登录/注册响应
 */
export function validateAuthResponse(data: unknown): ValidationResult<AuthResponseType> {
  return validateApiResponse(
    AuthResponseSchema as unknown as z.ZodType<AuthResponseType>,
    data,
    '登录/注册响应',
  );
}

/**
 * 验证用户统计响应
 */
export function validateUserStatistics(data: unknown): ValidationResult<UserStatisticsType> {
  return validateApiResponse(
    UserStatisticsSchema as unknown as z.ZodType<UserStatisticsType>,
    data,
    '用户统计',
  );
}

/**
 * 验证单词列表响应
 */
export function validateWordList(data: unknown): ValidationResult<WordApiType[]> {
  return validateApiResponse(
    WordListResponseSchema as unknown as z.ZodType<WordApiType[]>,
    data,
    '单词列表',
  );
}

/**
 * 验证词书列表响应
 */
export function validateWordBookList(
  data: unknown,
): ValidationResult<z.infer<typeof WordBookListResponseSchema>> {
  return validateApiResponse(
    WordBookListResponseSchema as unknown as z.ZodType<z.infer<typeof WordBookListResponseSchema>>,
    data,
    '词书列表',
  );
}

/**
 * 验证今日学习单词响应
 */
export function validateTodayWordsResponse(
  data: unknown,
): ValidationResult<TodayWordsResponseType> {
  return validateApiResponse(
    TodayWordsResponseSchema as unknown as z.ZodType<TodayWordsResponseType>,
    data,
    '今日学习单词',
  );
}

/**
 * 验证学习配置响应
 */
export function validateStudyConfig(data: unknown): ValidationResult<StudyConfigApiType> {
  return validateApiResponse(
    StudyConfigApiSchema as unknown as z.ZodType<StudyConfigApiType>,
    data,
    '学习配置',
  );
}

/**
 * 验证学习记录响应
 */
export function validateRecordsResponse(data: unknown): ValidationResult<RecordsResponseType> {
  return validateApiResponse(
    RecordsResponseSchema as unknown as z.ZodType<RecordsResponseType>,
    data,
    '学习记录',
  );
}

/**
 * 验证学习进度响应
 */
export function validateStudyProgress(data: unknown): ValidationResult<StudyProgressType> {
  return validateApiResponse(
    StudyProgressSchema as unknown as z.ZodType<StudyProgressType>,
    data,
    '学习进度',
  );
}

/**
 * 验证单个单词响应
 */
export function validateWord(data: unknown): ValidationResult<WordApiType> {
  return validateApiResponse(WordApiSchema as unknown as z.ZodType<WordApiType>, data, '单词');
}

// ============================================
// 导出 Schema 供其他模块使用
// ============================================

export {
  AuthResponseSchema,
  UserStatisticsSchema,
  WordListResponseSchema,
  WordBookListResponseSchema,
  TodayWordsResponseSchema,
  StudyConfigApiSchema,
  RecordsResponseSchema,
  WordApiSchema,
  StudyProgressSchema,
} from '@danci/shared';
