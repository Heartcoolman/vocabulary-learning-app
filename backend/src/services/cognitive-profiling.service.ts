import { ChronotypeDetector } from '../amas/modeling/chronotype';
import { LearningStyleProfiler } from '../amas/modeling/learning-style';

export const MIN_PROFILING_RECORDS = 20;
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h cache

type CacheEntry<T> = { value: T; expiresAt: number };

const chronotypeDetector = new ChronotypeDetector();
const learningStyleProfiler = new LearningStyleProfiler();

const chronotypeCache = new Map<string, CacheEntry<any>>();
const learningStyleCache = new Map<string, CacheEntry<any>>();

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

export class AnalysisError extends Error {
  code = 'ANALYSIS_FAILED';
}

const assertUserId = (userId: string | undefined) => {
  if (!userId) throw new Error('Missing user id');
  return userId;
};

const fromCache = <T>(cache: Map<string, CacheEntry<T>>, userId: string) => {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(userId);
    return null;
  }
  return entry.value;
};

const saveCache = <T>(cache: Map<string, CacheEntry<T>>, userId: string, value: T) => {
  cache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
};

const ensureSufficientData = (sampleCount?: number) => {
  if (typeof sampleCount === 'number' && sampleCount < MIN_PROFILING_RECORDS) {
    throw new InsufficientDataError(MIN_PROFILING_RECORDS, sampleCount);
  }
};

export const getChronotypeProfile = async (userId: string) => {
  const uid = assertUserId(userId);
  const cached = fromCache(chronotypeCache, uid);
  if (cached) return cached;
  let result: any;
  try {
    result = await chronotypeDetector.analyzeChronotype(uid);
  } catch (err: any) {
    throw new AnalysisError(err?.message ?? 'Chronotype analysis failed');
  }
  if (!result) throw new AnalysisError('Chronotype analysis returned empty result');
  ensureSufficientData(result.sampleCount ?? result.count ?? result.samples);
  const profile = result.profile ?? result;
  return saveCache(chronotypeCache, uid, profile);
};

export const getLearningStyleProfile = async (userId: string) => {
  const uid = assertUserId(userId);
  const cached = fromCache(learningStyleCache, uid);
  if (cached) return cached;
  let result: any;
  try {
    result = await learningStyleProfiler.detectLearningStyle(uid);
  } catch (err: any) {
    throw new AnalysisError(err?.message ?? 'Learning style analysis failed');
  }
  if (!result) throw new AnalysisError('Learning style analysis returned empty result');
  ensureSufficientData(result.sampleCount ?? result.count ?? result.samples);
  const profile = result.profile ?? result;
  return saveCache(learningStyleCache, uid, profile);
};

export const invalidateCognitiveCacheForUser = (userId: string) => {
  chronotypeCache.delete(userId);
  learningStyleCache.delete(userId);
};

export default {
  getChronotypeProfile,
  getLearningStyleProfile,
  invalidateCognitiveCacheForUser,
};
