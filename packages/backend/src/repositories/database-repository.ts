/**
 * AMAS 数据库持久化仓库
 * 实现 StateRepository 和 ModelRepository 接口
 */

import { StateRepository, ModelRepository } from '../amas/core/engine';
import { UserState, UserStateWithColdStart, BanditModel } from '../amas/types';
import { amasLogger } from '../logger';
import { getActiveDbClient, DatabaseClient } from '../config/database';
import {
  choleskyDecompose,
  createRegularizedIdentity,
  hasInvalidValues,
  sanitizeFloat32Array,
  sanitizeNumberArray,
} from '../amas/common/matrix-utils';
import {
  parseCognitiveProfile,
  parseHabitProfile,
  parseTrendState,
  parseColdStartState,
  validateBanditModelData,
} from '../amas/common/type-validators';

/**
 * 序列化 BanditModel（将 Float32Array 转换为普通数组）
 * 增强: 添加数值安全检查
 */
function serializeBanditModel(model: BanditModel): object {
  // 检查并清理 NaN/Infinity 值
  let A = model.A;
  let b = model.b;
  let L = model.L;

  if (hasInvalidValues(A)) {
    amasLogger.warn('[AMAS] 序列化时发现 A 矩阵包含无效值，已清理');
    A = sanitizeFloat32Array(A);
  }
  if (hasInvalidValues(b)) {
    amasLogger.warn('[AMAS] 序列化时发现 b 向量包含无效值，已清理');
    b = sanitizeFloat32Array(b);
  }
  if (L && hasInvalidValues(L)) {
    amasLogger.warn('[AMAS] 序列化时发现 L 矩阵包含无效值，已清理');
    L = sanitizeFloat32Array(L);
  }

  return {
    A: Array.from(A),
    b: Array.from(b),
    L: L ? Array.from(L) : undefined,
    d: model.d,
    lambda: model.lambda,
    alpha: model.alpha,
    updateCount: model.updateCount,
  };
}

/**
 * 反序列化 BanditModel（将普通数组转换回 Float32Array）
 * 修复: 当L缺失时，对A矩阵进行Cholesky分解以确保L与A同步
 * 增强: 添加数据校验和异常回退，加载时清洗 NaN/Infinity
 */
function deserializeBanditModel(data: {
  A: number[];
  b: number[];
  L?: number[];
  d: number;
  lambda?: number;
  alpha?: number;
  updateCount?: number;
}): BanditModel {
  const lambda = data.lambda ?? 1.0;
  const alpha = data.alpha ?? 1.0;
  const d = data.d;

  // 校验A/b数组长度，长度不匹配时回退到初始状态
  if (data.A.length !== d * d) {
    amasLogger.warn(
      { expected: d * d, got: data.A.length },
      '[AMAS] 模型A矩阵长度不匹配，回退到初始状态',
    );
    return {
      A: createRegularizedIdentity(d, lambda),
      b: new Float32Array(d),
      L: createRegularizedIdentity(d, lambda),
      lambda,
      alpha,
      d,
      updateCount: 0,
    };
  }
  if (data.b.length !== d) {
    amasLogger.warn(
      { expected: d, got: data.b.length },
      '[AMAS] 模型b向量长度不匹配，回退到初始状态',
    );
    return {
      A: createRegularizedIdentity(d, lambda),
      b: new Float32Array(d),
      L: createRegularizedIdentity(d, lambda),
      lambda,
      alpha,
      d,
      updateCount: 0,
    };
  }

  // 加载时清洗历史脏数据 (NaN/Infinity → 0)
  const cleanA = sanitizeNumberArray(data.A);
  const cleanB = sanitizeNumberArray(data.b);

  const A = new Float32Array(cleanA);
  const b = new Float32Array(cleanB);

  // 如果L存在且长度正确，直接使用；否则重新Cholesky分解
  let L: Float32Array;
  if (data.L && data.L.length === d * d) {
    const cleanL = sanitizeNumberArray(data.L);
    L = new Float32Array(cleanL);
  } else {
    // 重新对A进行Cholesky分解，确保L与A同步
    amasLogger.debug('[AMAS] 重新计算Cholesky分解: L缺失或长度不匹配');
    const choleskyResult = choleskyDecompose(A, d);
    if (choleskyResult) {
      L = choleskyResult;
    } else {
      // Cholesky分解失败，回退到正则化单位矩阵
      amasLogger.warn('[AMAS] Cholesky分解失败，使用正则化单位矩阵');
      L = createRegularizedIdentity(d, lambda);
    }
  }

  return {
    A,
    b,
    L,
    lambda,
    alpha,
    d,
    updateCount: data.updateCount ?? 0,
  };
}

/**
 * 验证并清理 UserState 数值
 */
function sanitizeUserState(state: UserState): UserState {
  const sanitizeNumber = (v: number, min: number, max: number, defaultVal: number): number => {
    if (!Number.isFinite(v)) return defaultVal;
    return Math.max(min, Math.min(max, v));
  };

  return {
    A: sanitizeNumber(state.A, 0, 1, 0.5),
    F: sanitizeNumber(state.F, 0, 1, 0),
    M: sanitizeNumber(state.M, -1, 1, 0),
    conf: sanitizeNumber(state.conf, 0, 1, 0.5),
    C: {
      mem: sanitizeNumber(state.C?.mem ?? 0.5, 0, 1, 0.5),
      speed: sanitizeNumber(state.C?.speed ?? 0.5, 0, 1, 0.5),
      stability: sanitizeNumber(state.C?.stability ?? 0.5, 0, 1, 0.5),
    },
    H: state.H,
    T: state.T,
    ts: Number.isFinite(state.ts) ? state.ts : Date.now(),
  };
}

/**
 * 数据库用户状态仓库
 *
 * 支持热备模式：通过 getActiveDbClient() 动态获取当前活跃的数据库客户端，
 * 在 PostgreSQL 不可用时自动切换到 SQLite 备库。
 */
export class DatabaseStateRepository implements StateRepository {
  private dbClient: DatabaseClient | null = null;

  /**
   * 构造函数
   * @param dbClient 可选的数据库客户端，用于依赖注入。如果不传入，将动态获取活跃客户端。
   */
  constructor(dbClient?: DatabaseClient) {
    this.dbClient = dbClient || null;
  }

  /**
   * 获取数据库客户端
   * 支持依赖注入和动态热备切换
   */
  private getDbClient(): DatabaseClient {
    // 如果通过依赖注入传入了客户端，直接使用
    if (this.dbClient) {
      return this.dbClient;
    }
    // 否则动态获取当前活跃的数据库客户端
    return getActiveDbClient();
  }

  async loadState(userId: string): Promise<UserState | null> {
    try {
      const db = this.getDbClient();

      const record = await db.amasUserState.findUnique({
        where: { userId },
      });

      if (!record) {
        return null;
      }

      // 使用类型验证器安全转换数据库记录
      const cognitiveProfile = parseCognitiveProfile(record.cognitiveProfile);
      const habitProfile = parseHabitProfile(record.habitProfile);
      const trendState = parseTrendState(record.trendState);
      const coldStartState = parseColdStartState(record.coldStartState);

      // 返回带有冷启动状态的用户状态（类型安全）
      const userState: UserStateWithColdStart = {
        A: record.attention,
        F: record.fatigue,
        M: record.motivation,
        conf: record.confidence,
        C: cognitiveProfile,
        H: habitProfile,
        T: trendState,
        ts: Number(record.lastUpdateTs),
        coldStartState,
      };

      return userState;
    } catch (error) {
      amasLogger.error({ userId, err: error }, '[AMAS] 加载用户状态失败');
      throw error;
    }
  }

  async saveState(userId: string, state: UserState): Promise<void> {
    try {
      const db = this.getDbClient();

      // 清理并验证状态值
      const safeState = sanitizeUserState(state);

      // 类型安全地获取冷启动状态
      const coldStartState = (state as UserStateWithColdStart).coldStartState;

      // 将类型转换为 Prisma 可接受的 JSON 格式
      const cognitiveJson = safeState.C as unknown as object;
      const habitJson = safeState.H ? (safeState.H as unknown as object) : undefined;
      const coldStartJson = coldStartState ? (coldStartState as unknown as object) : undefined;

      await db.amasUserState.upsert({
        where: { userId },
        create: {
          userId,
          attention: safeState.A,
          fatigue: safeState.F,
          motivation: safeState.M,
          confidence: safeState.conf,
          cognitiveProfile: cognitiveJson,
          habitProfile: habitJson,
          trendState: safeState.T,
          lastUpdateTs: BigInt(safeState.ts),
          coldStartState: coldStartJson,
        },
        update: {
          attention: safeState.A,
          fatigue: safeState.F,
          motivation: safeState.M,
          confidence: safeState.conf,
          cognitiveProfile: cognitiveJson,
          habitProfile: habitJson,
          trendState: safeState.T,
          lastUpdateTs: BigInt(safeState.ts),
          coldStartState: coldStartJson,
        },
      });
    } catch (error) {
      amasLogger.error({ userId, err: error }, '[AMAS] 保存用户状态失败');
      throw error;
    }
  }
}

/**
 * 数据库模型仓库（LinUCB模型）
 *
 * 支持热备模式：通过 getActiveDbClient() 动态获取当前活跃的数据库客户端，
 * 在 PostgreSQL 不可用时自动切换到 SQLite 备库。
 */
export class DatabaseModelRepository implements ModelRepository {
  private dbClient: DatabaseClient | null = null;

  /**
   * 构造函数
   * @param dbClient 可选的数据库客户端，用于依赖注入。如果不传入，将动态获取活跃客户端。
   */
  constructor(dbClient?: DatabaseClient) {
    this.dbClient = dbClient || null;
  }

  /**
   * 获取数据库客户端
   * 支持依赖注入和动态热备切换
   */
  private getDbClient(): DatabaseClient {
    // 如果通过依赖注入传入了客户端，直接使用
    if (this.dbClient) {
      return this.dbClient;
    }
    // 否则动态获取当前活跃的数据库客户端
    return getActiveDbClient();
  }

  async loadModel(userId: string): Promise<BanditModel | null> {
    try {
      const db = this.getDbClient();

      const record = await db.amasUserModel.findUnique({
        where: { userId },
      });

      if (!record) {
        return null;
      }

      // 使用类型验证器验证数据格式
      const rawData = record.modelData;
      if (!validateBanditModelData(rawData)) {
        amasLogger.warn({ userId }, '[AMAS] 模型数据格式无效，返回null');
        return null;
      }

      return deserializeBanditModel(rawData);
    } catch (error) {
      amasLogger.error({ userId, err: error }, '[AMAS] 加载用户模型失败');
      throw error;
    }
  }

  async saveModel(userId: string, model: BanditModel): Promise<void> {
    try {
      const db = this.getDbClient();

      // 序列化 Float32Array 为普通数组
      const serializedModel = serializeBanditModel(model);

      await db.amasUserModel.upsert({
        where: { userId },
        create: {
          userId,
          modelData: serializedModel,
        },
        update: {
          modelData: serializedModel,
        },
      });
    } catch (error) {
      amasLogger.error({ userId, err: error }, '[AMAS] 保存用户模型失败');
      throw error;
    }
  }
}

// 导出单例实例
export const databaseStateRepository = new DatabaseStateRepository();
export const databaseModelRepository = new DatabaseModelRepository();
