import { getRedisClient } from '../config/redis';
import { serviceLogger } from '../logger';

const TTL_SECONDS = 60 * 60;
const KEY_PREFIX = 'word_difficulty';

function buildKey(userId: string, wordId: string): string {
  return `${KEY_PREFIX}:${userId}:${wordId}`;
}

class DifficultyCacheService {
  async getCached(wordId: string, userId: string): Promise<number | null> {
    try {
      const client = getRedisClient();
      await client.connect();
      const value = await client.get(buildKey(userId, wordId));
      return value !== null ? Number(value) : null;
    } catch (error) {
      serviceLogger.warn({ err: error }, 'getCached failed');
      return null;
    }
  }

  async getCachedBatch(userId: string, wordIds: string[]): Promise<Record<string, number>> {
    if (wordIds.length === 0) return {};
    try {
      const client = getRedisClient();
      await client.connect();
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
      serviceLogger.warn({ err: error }, 'getCachedBatch failed');
      return {};
    }
  }

  async setCached(wordId: string, userId: string, difficulty: number): Promise<void> {
    try {
      const client = getRedisClient();
      await client.connect();
      await client.setex(buildKey(userId, wordId), TTL_SECONDS, difficulty.toFixed(6));
    } catch (error) {
      serviceLogger.warn({ err: error }, 'setCached failed');
    }
  }

  async invalidate(wordId: string): Promise<void> {
    try {
      const client = getRedisClient();
      await client.connect();
      const keys = await client.keys(`${KEY_PREFIX}:*:${wordId}`);
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } catch (error) {
      serviceLogger.warn({ err: error }, 'invalidate failed');
    }
  }
}

export const difficultyCacheService = new DifficultyCacheService();
export default difficultyCacheService;
