import { getRedisClient } from '../config/redis';
import { cacheLogger } from '../logger';

const TTL_SECONDS = 60 * 60;
const KEY_PREFIX = 'word_difficulty';

function buildKey(userId: string, wordId: string): string {
  return `${KEY_PREFIX}:${userId}:${wordId}`;
}

class DifficultyCacheService {
  async getCached(wordId: string, userId: string): Promise<number | null> {
    try {
      const client = getRedisClient();
      const value = await client.get(buildKey(userId, wordId));
      return value !== null ? Number(value) : null;
    } catch (error) {
      cacheLogger.warn({ wordId, userId, error: (error as Error).message }, 'Redis getCached 操作失败，降级为无缓存模式');
      return null;
    }
  }

  async getCachedBatch(userId: string, wordIds: string[]): Promise<Record<string, number>> {
    if (wordIds.length === 0) return {};
    try {
      const client = getRedisClient();
      const keys = wordIds.map(id => buildKey(userId, id));
      const values = await client.mget(keys);
      const result: Record<string, number> = {};
      values?.forEach((value, idx) => {
        if (value !== null) {
          result[wordIds[idx]] = Number(value);
        }
      });
      return result;
    } catch (error) {
      cacheLogger.warn({ userId, wordCount: wordIds.length, error: (error as Error).message }, 'Redis getCachedBatch 操作失败，降级为无缓存模式');
      return {};
    }
  }

  async setCached(wordId: string, userId: string, difficulty: number): Promise<void> {
    try {
      const client = getRedisClient();
      await client.setex(buildKey(userId, wordId), TTL_SECONDS, difficulty.toFixed(6));
    } catch (error) {
      cacheLogger.warn({ wordId, userId, error: (error as Error).message }, 'Redis setCached 操作失败，降级为无缓存模式');
    }
  }

  async invalidate(wordId: string): Promise<void> {
    try {
      const client = getRedisClient();
      const keys = await client.keys(`${KEY_PREFIX}:*:${wordId}`);
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } catch (error) {
      cacheLogger.warn({ wordId, error: (error as Error).message }, 'Redis invalidate 操作失败，降级为无缓存模式');
    }
  }
}

export const difficultyCacheService = new DifficultyCacheService();
export default difficultyCacheService;
