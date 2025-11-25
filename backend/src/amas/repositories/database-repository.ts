/**
 * AMAS 数据库持久化仓库
 * 实现 StateRepository 和 ModelRepository 接口
 */

import { PrismaClient } from '@prisma/client';
import { StateRepository, ModelRepository } from '../engine';
import { UserState, CognitiveProfile, HabitProfile, TrendState, BanditModel } from '../types';

// 获取 Prisma 实例
let prisma: PrismaClient;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

/**
 * 序列化 BanditModel（将 Float32Array 转换为普通数组）
 */
function serializeBanditModel(model: BanditModel): object {
  return {
    A: Array.from(model.A),
    b: Array.from(model.b),
    L: model.L ? Array.from(model.L) : undefined,
    d: model.d,
    lambda: model.lambda,
    alpha: model.alpha,
    updateCount: model.updateCount
  };
}

/**
 * 反序列化 BanditModel（将普通数组转换回 Float32Array）
 */
function deserializeBanditModel(data: { A: number[]; b: number[]; L?: number[]; d: number; lambda?: number; alpha?: number; updateCount?: number }): BanditModel {
  const lambda = data.lambda ?? 1.0;
  const alpha = data.alpha ?? 1.0;

  // 如果L不存在,创建一个临时的单位矩阵(将在使用时重新计算)
  let L: Float32Array;
  if (data.L) {
    L = new Float32Array(data.L);
  } else {
    // 创建单位矩阵作为占位符
    L = new Float32Array(data.d * data.d);
    for (let i = 0; i < data.d; i++) {
      L[i * data.d + i] = Math.sqrt(lambda);
    }
  }

  return {
    A: new Float32Array(data.A),
    b: new Float32Array(data.b),
    L,
    lambda,
    alpha,
    d: data.d,
    updateCount: data.updateCount ?? 0
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

    await db.amasUserState.upsert({
      where: { userId },
      create: {
        userId,
        attention: state.A,
        fatigue: state.F,
        motivation: state.M,
        confidence: state.conf,
        cognitiveProfile: state.C as unknown as object,
        habitProfile: state.H as unknown as object | undefined,
        trendState: state.T,
        lastUpdateTs: BigInt(state.ts)
      },
      update: {
        attention: state.A,
        fatigue: state.F,
        motivation: state.M,
        confidence: state.conf,
        cognitiveProfile: state.C as unknown as object,
        habitProfile: state.H as unknown as object | undefined,
        trendState: state.T,
        lastUpdateTs: BigInt(state.ts)
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
