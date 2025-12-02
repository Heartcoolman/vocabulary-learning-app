import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          console.warn('[Redis] 连接重试次数超限，停止重试');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redisClient.on('connect', () => {
      console.log('[Redis] 连接成功');
    });

    redisClient.on('error', (err) => {
      console.error('[Redis] 连接错误:', err.message);
    });

    redisClient.on('close', () => {
      console.log('[Redis] 连接关闭');
    });
  }
  return redisClient;
}

export async function connectRedis(): Promise<boolean> {
  try {
    const client = getRedisClient();
    await client.connect();
    await client.ping();
    return true;
  } catch (error) {
    console.warn('[Redis] 连接失败，将使用数据库直接查询:', (error as Error).message);
    return false;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    try {
      redisClient.disconnect(false); // 同步断开，避免异步问题
    } catch {
      // 忽略断开时的错误
    }
    redisClient = null;
  }
}

export default getRedisClient;
