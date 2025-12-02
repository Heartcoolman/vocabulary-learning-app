/**
 * AMAS 缓存仓库装饰器
 * 在数据库仓库基础上添加 Redis 缓存层
 */

import { StateRepository, ModelRepository } from '../engine';
import { UserState, BanditModel } from '../types';
import { redisCacheService } from '../../services/redis-cache.service';
import { DatabaseStateRepository, DatabaseModelRepository } from './database-repository';

/**
 * 带缓存的用户状态仓库
 */
export class CachedStateRepository implements StateRepository {
  private dbRepo: DatabaseStateRepository;
  private cacheEnabled: boolean;

  constructor(dbRepo: DatabaseStateRepository, cacheEnabled = true) {
    this.dbRepo = dbRepo;
    this.cacheEnabled = cacheEnabled;
  }

  async loadState(userId: string): Promise<UserState | null> {
    // 1. 先查缓存
    if (this.cacheEnabled) {
      const cached = await redisCacheService.getUserState<UserState>(userId);
      if (cached) {
        return cached;
      }
    }

    // 2. 缓存未命中，查数据库
    const state = await this.dbRepo.loadState(userId);

    // 3. 写入缓存
    if (state && this.cacheEnabled) {
      await redisCacheService.setUserState(userId, state, 60); // 60秒TTL
    }

    return state;
  }

  async saveState(userId: string, state: UserState): Promise<void> {
    // 1. 写数据库
    await this.dbRepo.saveState(userId, state);

    // 2. 更新缓存
    if (this.cacheEnabled) {
      await redisCacheService.setUserState(userId, state, 60);
    }
  }

  /**
   * 失效缓存
   */
  async invalidateCache(userId: string): Promise<void> {
    await redisCacheService.delUserState(userId);
  }
}

/**
 * 带缓存的模型仓库（LinUCB）
 */
export class CachedModelRepository implements ModelRepository {
  private dbRepo: DatabaseModelRepository;
  private cacheEnabled: boolean;

  constructor(dbRepo: DatabaseModelRepository, cacheEnabled = true) {
    this.dbRepo = dbRepo;
    this.cacheEnabled = cacheEnabled;
  }

  async loadModel(userId: string): Promise<BanditModel | null> {
    // 1. 先查缓存
    if (this.cacheEnabled) {
      const cached = await redisCacheService.getUserModel<SerializedBanditModel>(userId);
      if (cached) {
        return this.deserialize(cached);
      }
    }

    // 2. 缓存未命中，查数据库
    const model = await this.dbRepo.loadModel(userId);

    // 3. 写入缓存（序列化后存储）
    if (model && this.cacheEnabled) {
      await redisCacheService.setUserModel(userId, this.serialize(model), 300); // 5分钟TTL
    }

    return model;
  }

  async saveModel(userId: string, model: BanditModel): Promise<void> {
    // 1. 写数据库
    await this.dbRepo.saveModel(userId, model);

    // 2. 更新缓存
    if (this.cacheEnabled) {
      await redisCacheService.setUserModel(userId, this.serialize(model), 300);
    }
  }

  /**
   * 失效缓存
   */
  async invalidateCache(userId: string): Promise<void> {
    await redisCacheService.delUserModel(userId);
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
   */
  private deserialize(data: SerializedBanditModel): BanditModel {
    const d = data.d;
    const lambda = data.lambda ?? 1.0;
    
    // 如果没有 L，创建正则化单位矩阵
    let L: Float32Array;
    if (data.L) {
      L = new Float32Array(data.L);
    } else {
      L = new Float32Array(d * d);
      for (let i = 0; i < d; i++) {
        L[i * d + i] = lambda;
      }
    }
    
    return {
      A: new Float32Array(data.A),
      b: new Float32Array(data.b),
      L,
      d,
      lambda,
      alpha: data.alpha ?? 1.0,
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
