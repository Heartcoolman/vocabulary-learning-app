/**
 * AMAS 数据库持久化仓库
 * 实现 StateRepository 和 ModelRepository 接口
 */

import { PrismaClient } from '@prisma/client';
import { StateRepository, ModelRepository } from '../engine';
import { UserState, CognitiveProfile, HabitProfile, TrendState, BanditModel } from '../types';
import { amasLogger } from '../../logger';

// 获取 Prisma 实例
let prisma: PrismaClient;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

/**
 * 检查数组是否包含 NaN/Infinity 值
 */
function hasInvalidValues(arr: Float32Array | number[]): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) {
      return true;
    }
  }
  return false;
}

/**
 * 清理数组中的 NaN/Infinity 值，用 0 替换
 */
function sanitizeArray(arr: Float32Array): Float32Array {
  const result = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    result[i] = Number.isFinite(arr[i]) ? arr[i] : 0;
  }
  return result;
}

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
    A = sanitizeArray(A);
  }
  if (hasInvalidValues(b)) {
    amasLogger.warn('[AMAS] 序列化时发现 b 向量包含无效值，已清理');
    b = sanitizeArray(b);
  }
  if (L && hasInvalidValues(L)) {
    amasLogger.warn('[AMAS] 序列化时发现 L 矩阵包含无效值，已清理');
    L = sanitizeArray(L);
  }

  return {
    A: Array.from(A),
    b: Array.from(b),
    L: L ? Array.from(L) : undefined,
    d: model.d,
    lambda: model.lambda,
    alpha: model.alpha,
    updateCount: model.updateCount
  };
}

/**
 * Cholesky分解: A = L L^T
 * 用于反序列化时重新计算L矩阵
 *
 * 修复问题#12: 添加对称化处理和增强的数值稳定性检查
 *
 * @param A 输入矩阵（会被复制，不会修改原矩阵）
 * @param d 矩阵维度
 * @param lambda 正则化系数（可选，默认1.0）
 * @returns Cholesky分解结果L矩阵，失败时返回null
 */
function choleskyDecompose(A: Float32Array, d: number, lambda: number = 1.0): Float32Array | null {
  try {
    // 复制矩阵，避免修改原数据
    const matrix = new Float32Array(A);

    // 对称化处理：确保矩阵是对称的
    for (let i = 0; i < d; i++) {
      for (let j = i + 1; j < d; j++) {
        const avg = (matrix[i * d + j] + matrix[j * d + i]) / 2;
        // 检查平均值的有效性
        if (!Number.isFinite(avg)) {
          matrix[i * d + j] = 0;
          matrix[j * d + i] = 0;
        } else {
          matrix[i * d + j] = avg;
          matrix[j * d + i] = avg;
        }
      }
    }

    // 确保对角线元素至少为lambda（正则化）
    for (let i = 0; i < d; i++) {
      const diag = matrix[i * d + i];
      if (!Number.isFinite(diag) || diag < lambda) {
        matrix[i * d + i] = lambda;
      }
    }

    const L = new Float32Array(d * d);
    const epsilon = 1e-9; // 数值稳定性阈值

    for (let i = 0; i < d; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = matrix[i * d + j];
        for (let k = 0; k < j; k++) {
          sum -= L[i * d + k] * L[j * d + k];
        }

        if (i === j) {
          // 对角元素：如果sum过小或为负，使用正则化值
          if (sum <= epsilon || !Number.isFinite(sum)) {
            sum = lambda + epsilon;
          }
          L[i * d + j] = Math.sqrt(sum);
        } else {
          // 非对角元素：确保除数不为零
          const divisor = Math.max(L[j * d + j], epsilon);
          L[i * d + j] = sum / divisor;
          // 限制非对角元素的范围，防止数值溢出
          if (!Number.isFinite(L[i * d + j])) {
            L[i * d + j] = 0;
          }
        }
      }
    }

    // 最终检查：确保所有元素都是有限数
    for (let i = 0; i < L.length; i++) {
      if (!Number.isFinite(L[i])) {
        amasLogger.warn({ position: i }, '[AMAS] Cholesky分解后仍有无效值');
        return null;
      }
    }

    return L;
  } catch (error) {
    amasLogger.warn({ err: error }, '[AMAS] Cholesky分解异常');
    return null;
  }
}

/**
 * 创建正则化单位矩阵 * lambda
 */
function createRegularizedIdentity(d: number, lambda: number): Float32Array {
  const I = new Float32Array(d * d);
  for (let i = 0; i < d; i++) {
    I[i * d + i] = lambda;
  }
  return I;
}

/**
 * 清理 number[] 中的无效值
 */
function sanitizeNumberArray(arr: number[]): number[] {
  return arr.map(v => Number.isFinite(v) ? v : 0);
}

/**
 * 反序列化 BanditModel（将普通数组转换回 Float32Array）
 * 修复: 当L缺失时，对A矩阵进行Cholesky分解以确保L与A同步
 * 增强: 添加数据校验和异常回退，加载时清洗 NaN/Infinity
 */
function deserializeBanditModel(data: { A: number[]; b: number[]; L?: number[]; d: number; lambda?: number; alpha?: number; updateCount?: number }): BanditModel {
  const lambda = data.lambda ?? 1.0;
  const alpha = data.alpha ?? 1.0;
  const d = data.d;

  // 校验A/b数组长度，长度不匹配时回退到初始状态
  if (data.A.length !== d * d) {
    amasLogger.warn({ expected: d * d, got: data.A.length }, '[AMAS] 模型A矩阵长度不匹配，回退到初始状态');
    return {
      A: createRegularizedIdentity(d, lambda),
      b: new Float32Array(d),
      L: createRegularizedIdentity(d, lambda),
      lambda,
      alpha,
      d,
      updateCount: 0
    };
  }
  if (data.b.length !== d) {
    amasLogger.warn({ expected: d, got: data.b.length }, '[AMAS] 模型b向量长度不匹配，回退到初始状态');
    return {
      A: createRegularizedIdentity(d, lambda),
      b: new Float32Array(d),
      L: createRegularizedIdentity(d, lambda),
      lambda,
      alpha,
      d,
      updateCount: 0
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
    updateCount: data.updateCount ?? 0
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
      stability: sanitizeNumber(state.C?.stability ?? 0.5, 0, 1, 0.5)
    },
    H: state.H,
    T: state.T,
    ts: Number.isFinite(state.ts) ? state.ts : Date.now()
  };
}

/**
 * 数据库用户状态仓库
 */
export class DatabaseStateRepository implements StateRepository {
  async loadState(userId: string): Promise<UserState | null> {
    const db = getPrisma();

    const record = await db.amasUserState.findUnique({
      where: { userId }
    });

    if (!record) {
      return null;
    }

    // 转换数据库记录为 UserState
    const cognitiveProfile = record.cognitiveProfile as unknown as CognitiveProfile;
    const habitProfile = record.habitProfile as unknown as HabitProfile | undefined;
    const trendState = record.trendState as TrendState | undefined;

    return {
      A: record.attention,
      F: record.fatigue,
      M: record.motivation,
      conf: record.confidence,
      C: cognitiveProfile || { mem: 0.5, speed: 0.5, stability: 0.5 },
      H: habitProfile,
      T: trendState,
      ts: Number(record.lastUpdateTs)
    };
  }

  async saveState(userId: string, state: UserState): Promise<void> {
    const db = getPrisma();

    // 清理并验证状态值
    const safeState = sanitizeUserState(state);

    await db.amasUserState.upsert({
      where: { userId },
      create: {
        userId,
        attention: safeState.A,
        fatigue: safeState.F,
        motivation: safeState.M,
        confidence: safeState.conf,
        cognitiveProfile: safeState.C as unknown as object,
        habitProfile: safeState.H as unknown as object | undefined,
        trendState: safeState.T,
        lastUpdateTs: BigInt(safeState.ts)
      },
      update: {
        attention: safeState.A,
        fatigue: safeState.F,
        motivation: safeState.M,
        confidence: safeState.conf,
        cognitiveProfile: safeState.C as unknown as object,
        habitProfile: safeState.H as unknown as object | undefined,
        trendState: safeState.T,
        lastUpdateTs: BigInt(safeState.ts)
      }
    });
  }
}

/**
 * 数据库模型仓库（LinUCB模型）
 */
export class DatabaseModelRepository implements ModelRepository {
  async loadModel(userId: string): Promise<BanditModel | null> {
    const db = getPrisma();

    const record = await db.amasUserModel.findUnique({
      where: { userId }
    });

    if (!record) {
      return null;
    }

    // 反序列化 Float32Array
    const rawData = record.modelData as { A: number[]; b: number[]; L?: number[]; d: number };
    return deserializeBanditModel(rawData);
  }

  async saveModel(userId: string, model: BanditModel): Promise<void> {
    const db = getPrisma();

    // 序列化 Float32Array 为普通数组
    const serializedModel = serializeBanditModel(model);

    await db.amasUserModel.upsert({
      where: { userId },
      create: {
        userId,
        modelData: serializedModel
      },
      update: {
        modelData: serializedModel
      }
    });
  }
}

// 导出单例实例
export const databaseStateRepository = new DatabaseStateRepository();
export const databaseModelRepository = new DatabaseModelRepository();
