/**
 * 认知画像服务
 *
 * 职责：提供时间节律与学习风格画像的计算与缓存
 *
 * 设计原则：
 * - SRP：与 user-profile.service.ts 解耦，便于复用与测试
 * - KISS：仅提供获取/失效缓存的最小 API
 */

import { ChronotypeDetector, type ChronotypeProfile } from '../amas/modeling/chronotype';
import { LearningStyleProfiler, type LearningStyleProfile } from '../amas/modeling/learning-style';

export const MIN_PROFILING_RECORDS = 20;
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h cache

/**
 * 数据不足错误
 */
export class InsufficientDataError extends Error {
  code = 'INSUFFICIENT_DATA';
  required: number;
  actual: number;

  constructor(required: number, actual: number) {
    super(`Insufficient data to build profile (need ${required}, have ${actual})`);
    this.required = required;
    this.actual = actual;
  }
}

/**
 * 分析错误
 */
export class AnalysisError extends Error {
  code = 'ANALYSIS_FAILED';
}

type CacheEntry<T> = { value: T; expiresAt: number };

// 延迟实例化：只在首次使用时创建实例，便于测试 mock
let chronotypeDetector: ChronotypeDetector | null = null;
let learningStyleProfiler: LearningStyleProfiler | null = null;

const getChronotypeDetector = (): ChronotypeDetector => {
  if (!chronotypeDetector) {
    chronotypeDetector = new ChronotypeDetector();
  }
  return chronotypeDetector;
};

const getLearningStyleProfiler = (): LearningStyleProfiler => {
  if (!learningStyleProfiler) {
    learningStyleProfiler = new LearningStyleProfiler();
  }
  return learningStyleProfiler;
};

const chronotypeCache = new Map<string, CacheEntry<ChronotypeProfile>>();
const learningStyleCache = new Map<string, CacheEntry<LearningStyleProfile>>();

function fromCache<T>(cache: Map<string, CacheEntry<T>>, userId: string): T | null {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(userId);
    return null;
  }
  return entry.value;
}

function saveCache<T>(cache: Map<string, CacheEntry<T>>, userId: string, value: T): T {
  cache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

function ensureSufficientData(sampleCount?: number): void {
  if (typeof sampleCount === 'number' && sampleCount < MIN_PROFILING_RECORDS) {
    throw new InsufficientDataError(MIN_PROFILING_RECORDS, sampleCount);
  }
}

export async function getChronotypeProfile(userId: string): Promise<ChronotypeProfile> {
  if (!userId) {
    throw new Error('Missing user id');
  }

  const cached = fromCache(chronotypeCache, userId);
  if (cached) return cached;

  let result: ChronotypeProfile;
  try {
    result = await getChronotypeDetector().analyzeChronotype(userId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Chronotype analysis failed';
    throw new AnalysisError(message);
  }

  if (!result) throw new AnalysisError('Chronotype analysis returned empty result');
  ensureSufficientData(result.sampleCount);
  return saveCache(chronotypeCache, userId, result);
}

export async function getLearningStyleProfile(userId: string): Promise<LearningStyleProfile> {
  if (!userId) {
    throw new Error('Missing user id');
  }

  const cached = fromCache(learningStyleCache, userId);
  if (cached) return cached;

  let result: LearningStyleProfile;
  try {
    result = await getLearningStyleProfiler().detectLearningStyle(userId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Learning style analysis failed';
    throw new AnalysisError(message);
  }

  if (!result) throw new AnalysisError('Learning style analysis returned empty result');
  ensureSufficientData(result.sampleCount);
  return saveCache(learningStyleCache, userId, result);
}

export function invalidateCognitiveCacheForUser(userId: string): void {
  if (!userId) return;
  chronotypeCache.delete(userId);
  learningStyleCache.delete(userId);
}
