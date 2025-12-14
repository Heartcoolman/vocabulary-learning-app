/**
 * AMAS 缓存仓库装饰器
 * 在数据库仓库基础上添加 Redis 缓存层
 *
 * 实现 Cache-Aside Pattern：
 * - 读取: 先查缓存 -> 缓存未命中时查数据库 -> 将数据库结果写入缓存
 * - 写入: 先删除缓存 -> 写数据库 -> 异步更新缓存（带版本号防止竞态）
 */

import { StateRepository, ModelRepository } from '../amas/core/engine';
import { UserState, BanditModel } from '../amas/types';
import { redisCacheService, REDIS_CACHE_KEYS } from '../services/redis-cache.service';
import { DatabaseStateRepository, DatabaseModelRepository } from './database-repository';
import { choleskyDecompose, createRegularizedIdentity } from '../amas/common/matrix-utils';
import { amasLogger } from '../logger';
import { getRedisClient } from '../config/redis';

/**
 * 带版本号的缓存数据结构
 * 用于解决缓存读写竞态条件
 */
interface VersionedCacheData<T> {
  /** 实际数据 */
  data: T;
  /** 版本号（时间戳） */
  version: number;
}

/**
 * 带缓存的用户状态仓库
 *
 * 使用 Cache-Aside Pattern 和版本号机制确保数据一致性
 */
export class CachedStateRepository implements StateRepository {
  private dbRepo: DatabaseStateRepository;
  private cacheEnabled: boolean;
  private readonly STATE_TTL = 60; // 60秒TTL

  constructor(dbRepo: DatabaseStateRepository, cacheEnabled = true) {
    this.dbRepo = dbRepo;
    this.cacheEnabled = cacheEnabled;
  }

  async loadState(userId: string): Promise<UserState | null> {
    try {
      // 1. 先查缓存
      if (this.cacheEnabled) {
        const cached = await redisCacheService.getUserState<VersionedCacheData<UserState>>(userId);
        if (cached?.data) {
          return cached.data;
        }
      }

      // 2. 缓存未命中，查数据库
      const state = await this.dbRepo.loadState(userId);

      // 3. 写入缓存（带版本号）
      if (state && this.cacheEnabled) {
        const versionedData: VersionedCacheData<UserState> = {
          data: state,
          version: Date.now(),
        };
        await redisCacheService.setUserState(userId, versionedData, this.STATE_TTL);
      }

      return state;
    } catch (error) {
      amasLogger.warn(
        { userId, err: error },
        '[CachedStateRepo] loadState 缓存操作失败，降级为直接查数据库',
      );
      // 缓存失败时降级为直接查数据库
      return this.dbRepo.loadState(userId);
    }
  }

  async saveState(userId: string, state: UserState): Promise<void> {
    const version = Date.now();

    // Cache-Aside Pattern: 先删除缓存，防止脏读
    if (this.cacheEnabled) {
      try {
        await redisCacheService.delUserState(userId);
      } catch (error) {
        amasLogger.warn(
          { userId, err: error },
          '[CachedStateRepo] 删除缓存失败，降级继续执行数据库写入',
        );
        // 继续执行数据库写入
      }
    }

    // 写数据库（必须成功）
    await this.dbRepo.saveState(userId, state);

    // 异步更新缓存（带版本号检查，防止竞态）
    if (this.cacheEnabled) {
      // 使用 setImmediate 异步执行，不阻塞主流程
      setImmediate(async () => {
        try {
          await this.setStateWithVersionCheck(userId, state, version);
        } catch (error) {
          amasLogger.warn(
            { userId, err: error },
            '[CachedStateRepo] 异步更新缓存失败，降级为无缓存模式',
          );
        }
      });
    }
  }

  /**
   * 带版本号检查的缓存更新
   * 只有当新版本号大于现有版本号时才更新
   */
  private async setStateWithVersionCheck(
    userId: string,
    state: UserState,
    version: number,
  ): Promise<boolean> {
    try {
      const redis = getRedisClient();
      const key = `${REDIS_CACHE_KEYS.USER_STATE}${userId}`;

      // 使用 Lua 脚本实现原子性版本检查和更新
      const luaScript = `
        local current = redis.call('GET', KEYS[1])
        if current then
          local parsed = cjson.decode(current)
          if parsed.version and parsed.version >= tonumber(ARGV[2]) then
            return 0
          end
        end
        redis.call('SETEX', KEYS[1], ARGV[3], ARGV[1])
        return 1
      `;

      const versionedData: VersionedCacheData<UserState> = {
        data: state,
        version,
      };

      const result = await redis.eval(
        luaScript,
        1,
        key,
        JSON.stringify(versionedData),
        version.toString(),
        this.STATE_TTL.toString(),
      );

      return result === 1;
    } catch (error) {
      // Lua 脚本执行失败时回退到普通 SET
      amasLogger.debug({ userId, err: error }, '[CachedStateRepo] Lua脚本执行失败，回退到普通SET');
      const versionedData: VersionedCacheData<UserState> = {
        data: state,
        version,
      };
      return redisCacheService.setUserState(userId, versionedData, this.STATE_TTL);
    }
  }

  /**
   * 失效缓存
   */
  async invalidateCache(userId: string): Promise<void> {
    try {
      await redisCacheService.delUserState(userId);
    } catch (error) {
      amasLogger.warn({ userId, err: error }, '[CachedStateRepo] 失效缓存失败，降级为无缓存模式');
    }
  }
}

/**
 * 带缓存的模型仓库（LinUCB）
 *
 * 使用 Cache-Aside Pattern 和版本号机制确保数据一致性
 */
export class CachedModelRepository implements ModelRepository {
  private dbRepo: DatabaseModelRepository;
  private cacheEnabled: boolean;
  private readonly MODEL_TTL = 300; // 5分钟TTL

  constructor(dbRepo: DatabaseModelRepository, cacheEnabled = true) {
    this.dbRepo = dbRepo;
    this.cacheEnabled = cacheEnabled;
  }

  async loadModel(userId: string): Promise<BanditModel | null> {
    try {
      // 1. 先查缓存
      if (this.cacheEnabled) {
        const cached =
          await redisCacheService.getUserModel<VersionedCacheData<SerializedBanditModel>>(userId);
        if (cached?.data) {
          return this.deserialize(cached.data);
        }
      }

      // 2. 缓存未命中，查数据库
      const model = await this.dbRepo.loadModel(userId);

      // 3. 写入缓存（序列化后存储，带版本号）
      if (model && this.cacheEnabled) {
        const versionedData: VersionedCacheData<SerializedBanditModel> = {
          data: this.serialize(model),
          version: Date.now(),
        };
        await redisCacheService.setUserModel(userId, versionedData, this.MODEL_TTL);
      }

      return model;
    } catch (error) {
      amasLogger.warn(
        { userId, err: error },
        '[CachedModelRepo] loadModel 缓存操作失败，降级为直接查数据库',
      );
      // 缓存失败时降级为直接查数据库
      return this.dbRepo.loadModel(userId);
    }
  }

  async saveModel(userId: string, model: BanditModel): Promise<void> {
    const version = Date.now();

    // Cache-Aside Pattern: 先删除缓存，防止脏读
    if (this.cacheEnabled) {
      try {
        await redisCacheService.delUserModel(userId);
      } catch (error) {
        amasLogger.warn(
          { userId, err: error },
          '[CachedModelRepo] 删除缓存失败，降级继续执行数据库写入',
        );
        // 继续执行数据库写入
      }
    }

    // 写数据库（必须成功）
    await this.dbRepo.saveModel(userId, model);

    // 异步更新缓存（带版本号检查，防止竞态）
    if (this.cacheEnabled) {
      setImmediate(async () => {
        try {
          await this.setModelWithVersionCheck(userId, model, version);
        } catch (error) {
          amasLogger.warn(
            { userId, err: error },
            '[CachedModelRepo] 异步更新缓存失败，降级为无缓存模式',
          );
        }
      });
    }
  }

  /**
   * 带版本号检查的缓存更新
   */
  private async setModelWithVersionCheck(
    userId: string,
    model: BanditModel,
    version: number,
  ): Promise<boolean> {
    try {
      const redis = getRedisClient();
      const key = `${REDIS_CACHE_KEYS.USER_MODEL}${userId}`;

      const luaScript = `
        local current = redis.call('GET', KEYS[1])
        if current then
          local parsed = cjson.decode(current)
          if parsed.version and parsed.version >= tonumber(ARGV[2]) then
            return 0
          end
        end
        redis.call('SETEX', KEYS[1], ARGV[3], ARGV[1])
        return 1
      `;

      const versionedData: VersionedCacheData<SerializedBanditModel> = {
        data: this.serialize(model),
        version,
      };

      const result = await redis.eval(
        luaScript,
        1,
        key,
        JSON.stringify(versionedData),
        version.toString(),
        this.MODEL_TTL.toString(),
      );

      return result === 1;
    } catch (error) {
      amasLogger.debug({ userId, err: error }, '[CachedModelRepo] Lua脚本执行失败，回退到普通SET');
      const versionedData: VersionedCacheData<SerializedBanditModel> = {
        data: this.serialize(model),
        version,
      };
      return redisCacheService.setUserModel(userId, versionedData, this.MODEL_TTL);
    }
  }

  /**
   * 失效缓存
   */
  async invalidateCache(userId: string): Promise<void> {
    try {
      await redisCacheService.delUserModel(userId);
    } catch (error) {
      amasLogger.warn({ userId, err: error }, '[CachedModelRepo] 失效缓存失败，降级为无缓存模式');
    }
  }

  /**
   * 序列化 BanditModel（Float32Array -> number[]）
   */
  private serialize(model: BanditModel): SerializedBanditModel {
    return {
      A: Array.from(model.A),
      b: Array.from(model.b),
      L: model.L ? Array.from(model.L) : undefined,
      d: model.d,
      lambda: model.lambda,
      alpha: model.alpha,
      updateCount: model.updateCount,
    };
  }

  /**
   * 反序列化 BanditModel（number[] -> Float32Array）
   *
   * 当 L 缺失时，使用共享模块的 Cholesky 分解
   */
  private deserialize(data: SerializedBanditModel): BanditModel {
    const d = data.d;
    const lambda = data.lambda ?? 1.0;
    const alpha = data.alpha ?? 1.0;

    const A = new Float32Array(data.A);
    const b = new Float32Array(data.b);

    // 如果没有 L，对 A 进行 Cholesky 分解（使用共享模块）
    let L: Float32Array;
    if (data.L && data.L.length === d * d) {
      L = new Float32Array(data.L);
    } else {
      // 使用共享模块的 Cholesky 分解
      const choleskyResult = choleskyDecompose(A, d, lambda);
      if (choleskyResult) {
        L = choleskyResult;
      } else {
        // Cholesky 分解失败，回退到正则化单位矩阵
        L = createRegularizedIdentity(d, lambda);
      }
    }

    return {
      A,
      b,
      L,
      d,
      lambda,
      alpha,
      updateCount: data.updateCount ?? 0,
    };
  }
}

/**
 * 序列化后的 BanditModel 类型
 */
interface SerializedBanditModel {
  A: number[];
  b: number[];
  L?: number[];
  d: number;
  lambda?: number;
  alpha?: number;
  updateCount?: number;
}

// 创建带缓存的仓库实例
import { databaseStateRepository, databaseModelRepository } from './database-repository';

export const cachedStateRepository = new CachedStateRepository(databaseStateRepository);
export const cachedModelRepository = new CachedModelRepository(databaseModelRepository);
