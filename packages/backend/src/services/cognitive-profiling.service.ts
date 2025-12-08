import { ChronotypeDetector, ChronotypeProfile } from '../amas/modeling/chronotype';
import { LearningStyleProfiler, LearningStyleProfile } from '../amas/modeling/learning-style';

export const MIN_PROFILING_RECORDS = 20;
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h cache

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

export const getChronotypeProfile = async (userId: string): Promise<ChronotypeProfile> => {
  const uid = assertUserId(userId);
  const cached = fromCache(chronotypeCache, uid);
  if (cached) return cached;
  let result: ChronotypeProfile;
  try {
    result = await getChronotypeDetector().analyzeChronotype(uid);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Chronotype analysis failed';
    throw new AnalysisError(message);
  }
  if (!result) throw new AnalysisError('Chronotype analysis returned empty result');
  ensureSufficientData(result.sampleCount);
  return saveCache(chronotypeCache, uid, result);
};

export const getLearningStyleProfile = async (userId: string): Promise<LearningStyleProfile> => {
  const uid = assertUserId(userId);
  const cached = fromCache(learningStyleCache, uid);
  if (cached) return cached;
  let result: LearningStyleProfile;
  try {
    result = await getLearningStyleProfiler().detectLearningStyle(uid);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Learning style analysis failed';
    throw new AnalysisError(message);
  }
  if (!result) throw new AnalysisError('Learning style analysis returned empty result');
  ensureSufficientData(result.sampleCount);
  return saveCache(learningStyleCache, uid, result);
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
