/**
 * AMAS相关Zod Schema
 * 用于运行时验证和类型推断
 */

import { z } from 'zod';

/**
 * 难度等级Schema
 */
export const DifficultyLevelSchema = z.enum(['easy', 'mid', 'hard']);

/**
 * 学习目标模式Schema
 */
export const LearningObjectiveModeSchema = z.enum(['exam', 'daily', 'travel', 'custom']);

/**
 * 冷启动阶段Schema
 */
export const ColdStartPhaseSchema = z.enum(['classify', 'explore', 'normal']);

/**
 * 趋势状态Schema
 */
export const TrendStateSchema = z.enum(['up', 'flat', 'stuck', 'down']);

/**
 * 学习事件输入Schema
 */
export const LearningEventInputSchema = z.object({
  wordId: z.string().min(1),
  isCorrect: z.boolean(),
  responseTime: z.number().nonnegative(),
  sessionId: z.string().uuid().optional(),
  dwellTime: z.number().nonnegative().optional(),
  pauseCount: z.number().int().nonnegative().optional(),
  switchCount: z.number().int().nonnegative().optional(),
  retryCount: z.number().int().nonnegative().optional(),
  focusLossDuration: z.number().nonnegative().optional(),
  interactionDensity: z.number().nonnegative().optional(),
  timestamp: z.number().optional(),
  pausedTimeMs: z.number().nonnegative().optional(),
  isQuit: z.boolean().optional(),
});

/**
 * 学习策略Schema
 */
export const LearningStrategySchema = z.object({
  interval_scale: z.number().min(0.5).max(2.0),
  new_ratio: z.number().min(0).max(1),
  difficulty: DifficultyLevelSchema,
  batch_size: z.number().int().min(5).max(25),
  hint_level: z.number().int().min(0).max(2),
});

/**
 * 用户认知状态Schema
 */
export const UserCognitiveStateSchema = z.object({
  memory: z.number().min(0).max(1),
  speed: z.number().min(0).max(1),
  stability: z.number().min(0).max(1),
});

/**
 * 用户状态Schema（前端格式）
 */
export const UserStateSchema = z.object({
  attention: z.number().min(0).max(1),
  fatigue: z.number().min(0).max(1),
  motivation: z.number().min(-1).max(1),
  memory: z.number().min(0).max(1),
  speed: z.number().min(0).max(1),
  stability: z.number().min(0).max(1),
  cognitive: UserCognitiveStateSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  timestamp: z.number().optional(),
});

/**
 * 学习目标配置Schema
 */
export const LearningObjectivesSchema = z.object({
  userId: z.string().uuid(),
  mode: LearningObjectiveModeSchema,
  primaryObjective: z.enum(['accuracy', 'retention', 'efficiency']),
  minAccuracy: z.number().min(0).max(1).optional(),
  maxDailyTime: z.number().positive().optional(),
  targetRetention: z.number().min(0).max(1).optional(),
  weightShortTerm: z.number().min(0).max(1),
  weightLongTerm: z.number().min(0).max(1),
  weightEfficiency: z.number().min(0).max(1),
});

/**
 * 多目标指标Schema
 */
export const MultiObjectiveMetricsSchema = z.object({
  shortTermScore: z.number(),
  longTermScore: z.number(),
  efficiencyScore: z.number(),
  aggregatedScore: z.number(),
  ts: z.number(),
});
