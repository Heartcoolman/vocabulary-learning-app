import { PrismaClient } from '@prisma/client';
import { recordDbQuery, DbQueryMetric } from '../monitoring/amas-metrics';
import {
  shouldSimulateSlowQuery,
  getSlowQueryDelay,
  shouldSimulateDbFailure,
} from './debug-config';
import { env } from './env';
import { DatabaseProxy, createDatabaseProxy } from '../database';
import { DatabaseProxyConfig, DatabaseClient } from '../database/adapters/types';
import { AsyncLocalStorage } from 'async_hooks';

const DB_SAMPLE_RATE = 0.2;
const DB_SLOW_THRESHOLD_MS = 200;
const DB_MAX_QUEUE = 5000;
const DB_FLUSH_BATCH = 500;
const DB_FLUSH_INTERVAL_MS = 500;

const dbMetricQueue: DbQueryMetric[] = [];
let dbFlushTimer: NodeJS.Timeout | null = null;

function enqueueDbMetric(metric: DbQueryMetric): void {
  if (dbMetricQueue.length >= DB_MAX_QUEUE) return;
  dbMetricQueue.push(metric);
}

function startDbFlushLoop(): void {
  if (dbFlushTimer) return;
  dbFlushTimer = setInterval(() => {
    if (dbMetricQueue.length === 0) return;
    const batch = dbMetricQueue.splice(0, DB_FLUSH_BATCH);
    for (const metric of batch) {
      recordDbQuery(metric);
    }
  }, DB_FLUSH_INTERVAL_MS);
  if (dbFlushTimer.unref) dbFlushTimer.unref();
}

const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === 'development'
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'stdout', level: 'warn' },
          // 在热备模式下，error 日志会由健康检查频繁触发，改为 event 模式
          { emit: env.SQLITE_FALLBACK_ENABLED ? 'event' : 'stdout', level: 'error' },
        ]
      : [{ emit: 'stdout', level: 'error' }],
  errorFormat: 'minimal',
});

if (process.env.NODE_ENV !== 'test') {
  prisma.$use(async (params, next) => {
    // ==================== 调试模式：故障模拟 ====================
    // 检查是否需要模拟数据库连接故障
    if (shouldSimulateDbFailure()) {
      throw new Error('Database connection failure (simulated by debug config)');
    }

    // 检查是否需要模拟慢查询
    if (shouldSimulateSlowQuery()) {
      const delay = getSlowQueryDelay();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // ==================== 正常查询执行 ====================
    const start = process.hrtime.bigint();
    const result = await next(params);

    // Record metrics after query completes
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const isSlow = durationMs > DB_SLOW_THRESHOLD_MS;
    const shouldRecord = isSlow || Math.random() < DB_SAMPLE_RATE;

    if (shouldRecord) {
      const model = typeof params.model === 'string' ? params.model : undefined;
      const action = typeof params.action === 'string' ? params.action : undefined;

      startDbFlushLoop();
      setImmediate(() =>
        enqueueDbMetric({
          model,
          action,
          durationMs,
          slow: isSlow,
        }),
      );
    }

    return result;
  });
}

// ============================================
// 数据库代理（热备模式）
// ============================================

/**
 * 创建数据库代理配置
 */
function createProxyConfig(): DatabaseProxyConfig {
  return {
    sqlite: {
      path: env.SQLITE_FALLBACK_PATH,
      journalMode: env.SQLITE_JOURNAL_MODE,
      synchronous: env.SQLITE_SYNCHRONOUS,
      busyTimeout: 5000,
      cacheSize: -64000,
      foreignKeys: true,
    },
    healthCheck: {
      intervalMs: env.DB_HEALTH_CHECK_INTERVAL_MS,
      timeoutMs: env.DB_HEALTH_CHECK_TIMEOUT_MS,
      failureThreshold: env.DB_FAILURE_THRESHOLD,
      recoveryThreshold: env.DB_RECOVERY_THRESHOLD,
      minRecoveryIntervalMs: env.DB_MIN_RECOVERY_INTERVAL_MS,
    },
    sync: {
      batchSize: env.DB_SYNC_BATCH_SIZE,
      retryCount: env.DB_SYNC_RETRY_COUNT,
      conflictStrategy: env.DB_CONFLICT_STRATEGY,
      syncOnStartup: env.SQLITE_SYNC_ON_STARTUP,
    },
    fencing: {
      enabled: env.DB_FENCING_ENABLED,
      lockKey: env.DB_FENCING_LOCK_KEY,
      lockTtlMs: env.DB_FENCING_LOCK_TTL_MS,
      renewIntervalMs: env.DB_FENCING_RENEW_INTERVAL_MS,
      failOnRedisUnavailable: env.DB_FENCING_FAIL_ON_REDIS_UNAVAILABLE,
    },
  };
}

/**
 * 数据库代理实例（仅在热备启用时创建）
 */
let databaseProxy: DatabaseProxy | null = null;

/**
 * 获取数据库代理（懒加载）
 */
export function getDatabaseProxy(): DatabaseProxy | null {
  if (!env.SQLITE_FALLBACK_ENABLED) {
    return null;
  }

  if (!databaseProxy) {
    const config = createProxyConfig();
    databaseProxy = createDatabaseProxy(prisma, config);
  }

  return databaseProxy;
}

/**
 * 初始化数据库代理
 * 应在应用启动时调用
 */
export async function initializeDatabaseProxy(): Promise<void> {
  const proxy = getDatabaseProxy();
  if (proxy) {
    await proxy.initialize();
  }
}

/**
 * 关闭数据库代理
 * 应在应用关闭时调用
 */
export async function closeDatabaseProxy(): Promise<void> {
  if (databaseProxy) {
    await databaseProxy.close();
    databaseProxy = null;
  }
}

// ============================================
// 导出
// ============================================

/**
 * 动态获取当前活跃的数据库客户端
 * 在热备模式下返回代理，否则返回原始 Prisma
 */
export function getActiveDbClient(): DatabaseClient {
  if (!env.SQLITE_FALLBACK_ENABLED) {
    return prisma;
  }
  return (getDatabaseProxy() || prisma) as DatabaseClient;
}

// ============================================
// 并发安全：操作级别状态锁定
// ============================================

/**
 * 操作上下文：存储当前操作锁定的数据库客户端
 * 使用 AsyncLocalStorage 确保同一异步上下文中的所有操作使用相同的客户端
 */
interface OperationContext {
  /** 锁定的数据库客户端 */
  lockedClient: DatabaseClient;
  /** 操作开始时间 */
  startTime: number;
  /** 操作 ID（用于调试） */
  operationId: string;
}

const operationStorage = new AsyncLocalStorage<OperationContext>();

/** 操作 ID 计数器 */
let operationIdCounter = 0;

/**
 * 生成唯一操作 ID
 */
function generateOperationId(): string {
  return `op_${Date.now()}_${++operationIdCounter}`;
}

/**
 * 获取当前操作锁定的客户端
 * 如果在操作上下文中，返回锁定的客户端；否则返回当前活跃客户端
 */
function getLockedOrActiveClient(): DatabaseClient {
  const context = operationStorage.getStore();
  if (context) {
    return context.lockedClient;
  }
  return getActiveDbClient();
}

/**
 * 在操作上下文中执行函数
 * 确保整个操作过程中使用同一个数据库客户端
 *
 * @param fn 要执行的异步函数
 * @returns 函数执行结果
 */
export function withOperationLock<T>(fn: () => Promise<T>): Promise<T> {
  // 检查是否已在操作上下文中（嵌套调用）
  const existingContext = operationStorage.getStore();
  if (existingContext) {
    // 嵌套调用，复用现有上下文
    return fn();
  }

  // 创建新的操作上下文，锁定当前客户端
  const context: OperationContext = {
    lockedClient: getActiveDbClient(),
    startTime: Date.now(),
    operationId: generateOperationId(),
  };

  return operationStorage.run(context, fn);
}

/**
 * 同步版本的操作锁定包装器
 * 用于需要同步获取锁定客户端的场景
 *
 * @param fn 要执行的同步函数
 * @returns 函数执行结果
 */
export function withOperationLockSync<T>(fn: () => T): T {
  const existingContext = operationStorage.getStore();
  if (existingContext) {
    return fn();
  }

  const context: OperationContext = {
    lockedClient: getActiveDbClient(),
    startTime: Date.now(),
    operationId: generateOperationId(),
  };

  return operationStorage.run(context, fn);
}

/**
 * 检查当前是否在操作上下文中
 */
export function isInOperationContext(): boolean {
  return operationStorage.getStore() !== undefined;
}

/**
 * 获取当前操作上下文信息（用于调试）
 */
export function getOperationContext(): OperationContext | undefined {
  return operationStorage.getStore();
}

// ============================================
// 读写锁：保护状态切换
// ============================================

/**
 * 简单的读写锁实现
 * 用于保护数据库状态切换时的并发安全
 */
class ReadWriteLock {
  private readers = 0;
  private writer = false;
  private writerQueue: Array<() => void> = [];
  private readerQueue: Array<() => void> = [];

  /**
   * 获取读锁
   * 多个读操作可以并发执行
   */
  async acquireRead(): Promise<void> {
    if (!this.writer && this.writerQueue.length === 0) {
      this.readers++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.readerQueue.push(() => {
        this.readers++;
        resolve();
      });
    });
  }

  /**
   * 释放读锁
   */
  releaseRead(): void {
    this.readers--;
    if (this.readers === 0 && this.writerQueue.length > 0) {
      this.writer = true;
      const next = this.writerQueue.shift();
      next?.();
    }
  }

  /**
   * 获取写锁
   * 写操作独占，会等待所有读操作完成
   */
  async acquireWrite(): Promise<void> {
    if (!this.writer && this.readers === 0) {
      this.writer = true;
      return;
    }

    return new Promise<void>((resolve) => {
      this.writerQueue.push(() => {
        resolve();
      });
    });
  }

  /**
   * 释放写锁
   */
  releaseWrite(): void {
    this.writer = false;

    // 优先唤醒等待的读者
    while (this.readerQueue.length > 0 && this.writerQueue.length === 0) {
      const next = this.readerQueue.shift();
      next?.();
    }

    // 如果没有读者等待，唤醒一个写者
    if (this.readers === 0 && this.writerQueue.length > 0) {
      this.writer = true;
      const next = this.writerQueue.shift();
      next?.();
    }
  }

  /**
   * 使用读锁执行操作
   */
  async withReadLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireRead();
    try {
      return await fn();
    } finally {
      this.releaseRead();
    }
  }

  /**
   * 使用写锁执行操作
   */
  async withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireWrite();
    try {
      return await fn();
    } finally {
      this.releaseWrite();
    }
  }
}

/** 全局数据库状态读写锁 */
const dbStateLock = new ReadWriteLock();

/**
 * 导出读写锁，供状态切换时使用
 */
export { dbStateLock };

/**
 * 创建动态数据库客户端代理
 *
 * 解决模块加载时机问题：
 * - 服务模块在应用启动早期加载时，DatabaseProxy 尚未初始化
 * - 如果使用静态导出，服务会一直持有原始 PrismaClient 引用
 * - 导致热备切换失效：主库故障时仍尝试连接 PostgreSQL
 *
 * 并发安全改进：
 * - 使用 AsyncLocalStorage 实现操作级别的状态锁定
 * - 在操作开始时捕获当前活跃客户端，整个操作使用同一个客户端
 * - 支持嵌套调用，复用外层上下文
 *
 * 此代理确保每次数据库操作都动态获取当前活跃的客户端
 */
function createDynamicDbClient(): DatabaseClient {
  if (!env.SQLITE_FALLBACK_ENABLED) {
    return prisma;
  }

  // 使用 Proxy 实现并发安全的动态客户端获取
  return new Proxy({} as DatabaseClient, {
    get(_target, prop) {
      // 获取锁定的或当前活跃的客户端
      const activeClient = getLockedOrActiveClient();
      const value = (activeClient as unknown as Record<string | symbol, unknown>)[prop];

      if (typeof value === 'function') {
        // 对于函数属性，返回一个包装函数
        // 确保函数执行时在操作上下文中
        const originalFn = value as Function;
        const boundFn = originalFn.bind(activeClient);

        return function (this: unknown, ...args: unknown[]) {
          // 检查是否已在操作上下文中
          const existingContext = operationStorage.getStore();
          if (existingContext) {
            // 已在上下文中，直接执行（使用上下文中锁定的客户端）
            const lockedClient = existingContext.lockedClient;
            const lockedValue = (lockedClient as unknown as Record<string | symbol, unknown>)[prop];
            if (typeof lockedValue === 'function') {
              return (lockedValue as Function).apply(lockedClient, args);
            }
            return lockedValue;
          }

          // 创建新的操作上下文
          const context: OperationContext = {
            lockedClient: activeClient,
            startTime: Date.now(),
            operationId: generateOperationId(),
          };

          // 在操作上下文中执行原始函数
          return operationStorage.run(context, () => {
            const result = boundFn.apply(this, args);

            // 如果返回 Promise，确保整个异步链都在上下文中
            if (
              result &&
              typeof result === 'object' &&
              typeof (result as Promise<unknown>).then === 'function'
            ) {
              return (result as Promise<unknown>).then(
                (value) => value,
                (error) => {
                  throw error;
                },
              );
            }

            return result;
          });
        };
      }

      return value;
    },
    // 支持 'in' 操作符
    has(_target, prop) {
      const activeClient = getLockedOrActiveClient();
      return prop in (activeClient as object);
    },
  });
}

const db: DatabaseClient = createDynamicDbClient();

/**
 * 获取底层 PrismaClient
 * 用于需要原始 Prisma 功能的场景（如 $transaction 的数组形式）
 * 注意：在热备模式下，此函数返回的是主库（PostgreSQL）连接
 */
export function getPrismaClient(): PrismaClient {
  return prisma;
}

/**
 * 判断当前是否使用热备模式
 */
export function isHotStandbyEnabled(): boolean {
  return env.SQLITE_FALLBACK_ENABLED;
}

export default db;
export { prisma, databaseProxy };
export type { DatabaseClient };
