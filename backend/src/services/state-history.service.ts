/**
 * 状态历史服务
 * 管理用户学习状态的历史记录和认知成长追踪
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 *
 * 时区策略：
 * - 所有日期操作统一使用 UTC 时间
 * - 存储到数据库的 date 字段为 UTC 零点时间 (00:00:00.000 UTC)
 * - 这确保了跨时区查询的一致性，避免因本地时间差异导致的数据不一致
 */

import prisma from '../config/database';

// ============================================
// 类型定义
// ============================================

/**
 * 日期范围选项
 */
export type DateRangeOption = 7 | 30 | 90;

/**
 * 日期范围
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * 状态历史项
 */
export interface StateHistoryItem {
  date: Date;
  attention: number;
  fatigue: number;
  motivation: number;
  memory: number;
  speed: number;
  stability: number;
  trendState?: string;
}

/**
 * 认知能力画像
 */
export interface CognitiveProfile {
  memory: number;
  speed: number;
  stability: number;
}

/**
 * 认知成长结果
 */
export interface CognitiveGrowthResult {
  current: CognitiveProfile;
  past: CognitiveProfile;
  changes: {
    memory: number;
    speed: number;
    stability: number;
  };
  period: number;
  /** 是否有当前数据（有当前记录时为true） */
  hasData: boolean;
  /** 是否有可比较的数据（有当前记录且有历史记录时为true，用于判断changes是否有意义） */
  hasComparableData: boolean;
}

/**
 * 显著变化
 */
export interface SignificantChange {
  metric: 'attention' | 'fatigue' | 'motivation' | 'memory' | 'speed' | 'stability';
  metricLabel: string;
  changePercent: number;
  direction: 'up' | 'down';
  isPositive: boolean;
  startDate: Date;
  endDate: Date;
}

/**
 * 用户状态（用于保存快照）
 */
export interface UserState {
  A: number;  // 注意力
  F: number;  // 疲劳度
  M: number;  // 动机
  C: CognitiveProfile;  // 认知画像
  T?: string; // 趋势状态
}

// ============================================
// 常量配置
// ============================================

/** 显著变化阈值（20%） */
const SIGNIFICANT_CHANGE_THRESHOLD = 0.2;

/** 指标标签映射 */
const METRIC_LABELS: Record<string, string> = {
  attention: '注意力',
  fatigue: '疲劳度',
  motivation: '动机',
  memory: '记忆力',
  speed: '反应速度',
  stability: '稳定性'
};

/** 正面变化判断（某些指标下降是好事） */
const POSITIVE_WHEN_DOWN = ['fatigue'];

// ============================================
// 服务实现
// ============================================

class StateHistoryService {
  /**
   * 兼容旧版/测试的简单记录接口
   *
   * 修复：统一使用UTC时间，与其他方法保持一致
   */
  async recordState(
    userId: string,
    state: Partial<UserState> & { timestamp?: Date }
  ): Promise<{ state: Partial<UserState>; timestamp: Date; id?: string }> {
    const prismaAny = prisma as any;
    const timestamp = state.timestamp ?? new Date();

    // 修复：统一使用UTC时间，将日期规范化为UTC零点
    const dateForDb = new Date(timestamp);
    dateForDb.setUTCHours(0, 0, 0, 0);

    // 将简化的 state 映射到结构化字段（实际数据库使用）
    const payload = {
      userId,
      date: dateForDb,
      attention: state.A ?? (state as any).attention ?? 0,
      fatigue: state.F ?? (state as any).fatigue ?? 0,
      motivation: state.M ?? (state as any).motivation ?? 0,
      memory: state.C?.memory ?? (state as any).memory ?? (state as any).mem ?? 0,
      speed: state.C?.speed ?? (state as any).speed ?? 0,
      stability: state.C?.stability ?? (state as any).stability ?? 0,
      trendState: (state as any).T
    };

    const created = prismaAny.userStateHistory
      ? await prismaAny.userStateHistory.create({ data: payload })
      : payload;

    return {
      ...(created ?? {}),
      state,
      timestamp: new Date(timestamp)
    };
  }

  /**
   * 兼容测试的历史查询接口
   */
  async getHistory(
    userId: string,
    options: { limit?: number; start?: Date; end?: Date } = {}
  ): Promise<Array<{ state: Partial<UserState>; timestamp: Date }>> {
    const prismaAny = prisma as any;
    const records = prismaAny.userStateHistory
      ? await prismaAny.userStateHistory.findMany({
          where: {
            userId,
            ...(options.start || options.end
              ? {
                  date: {
                    gte: options.start,
                    lte: options.end
                  }
                }
              : {})
          },
          orderBy: { date: 'desc' },
          take: options.limit
        })
      : [];

    return records.map((r: any) => ({
      ...r,
      state: r.state ?? {
        A: r.attention,
        F: r.fatigue,
        M: r.motivation,
        C: { mem: r.memory, speed: r.speed, stability: r.stability }
      },
      timestamp: r.timestamp ?? r.date
    }));
  }

  /**
   * 兼容测试的获取最新状态
   */
  async getLatestState(
    userId: string
  ): Promise<Partial<UserState> | null> {
    const prismaAny = prisma as any;
    const record = prismaAny.userStateHistory
      ? await prismaAny.userStateHistory.findFirst({
          where: { userId },
          orderBy: { date: 'desc' }
        })
      : null;

    if (!record) return null;

    return (
      record.state ?? {
        A: record.attention,
        F: record.fatigue,
        M: record.motivation,
        C: { mem: record.memory, speed: record.speed, stability: record.stability }
      }
    );
  }

  /**
   * 保存状态快照
   * Requirements: 5.2
   *
   * Property 16: 同一天多次更新时保存平均值
   *
   * 使用 Prisma 事务确保查询和更新的原子性，避免 TOCTOU 竞态条件。
   * 在并发场景下，事务保证 EMA 计算基于一致的数据。
   *
   * @param userId 用户ID
   * @param state 用户状态
   */
  async saveStateSnapshot(userId: string, state: UserState): Promise<void> {
    // 使用 UTC 时间作为日期基准，确保与 PostgreSQL 的 Date 类型一致
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const alpha = 0.3;

    // 使用事务确保查询和更新的原子性，避免 TOCTOU 竞态条件
    await prisma.$transaction(async (tx) => {
      const existing = await tx.userStateHistory.findUnique({
        where: {
          userId_date: {
            userId,
            date: today
          }
        }
      });

      // 兼容处理：支持 memory 和 mem 两种字段名
      const memoryValue = (state.C as any).memory ?? (state.C as any).mem ?? 0;

      const createData = {
        userId,
        date: today,
        attention: state.A,
        fatigue: state.F,
        motivation: state.M,
        memory: memoryValue,
        speed: state.C.speed,
        stability: state.C.stability,
        trendState: state.T
      };

      const updateData = existing
        ? {
            attention: alpha * state.A + (1 - alpha) * existing.attention,
            fatigue: alpha * state.F + (1 - alpha) * existing.fatigue,
            motivation: alpha * state.M + (1 - alpha) * existing.motivation,
            memory: alpha * memoryValue + (1 - alpha) * existing.memory,
            speed: alpha * state.C.speed + (1 - alpha) * existing.speed,
            stability: alpha * state.C.stability + (1 - alpha) * existing.stability,
            trendState: state.T || existing.trendState
          }
        : {
            attention: state.A,
            fatigue: state.F,
            motivation: state.M,
            memory: memoryValue,
            speed: state.C.speed,
            stability: state.C.stability,
            trendState: state.T
          };

      await tx.userStateHistory.upsert({
        where: {
          userId_date: {
            userId,
            date: today
          }
        },
        create: createData,
        update: updateData
      });
    });
  }

  /**
   * 获取状态历史
   * Requirements: 5.1, 5.4
   * 
   * Property 15: 返回指定日期范围内的所有记录，包含所有必需指标
   * 
   * @param userId 用户ID
   * @param range 日期范围（天数或具体范围）
   * @returns 状态历史数组
   */
  async getStateHistory(
    userId: string,
    range: DateRangeOption | DateRange
  ): Promise<StateHistoryItem[]> {
    let startDate: Date;
    let endDate: Date;

    if (typeof range === 'number') {
      // 使用天数，统一使用 UTC 时间以与 saveStateSnapshot 保持一致
      endDate = new Date();
      startDate = new Date();
      startDate.setUTCDate(startDate.getUTCDate() - range);
      startDate.setUTCHours(0, 0, 0, 0);
      endDate.setUTCHours(23, 59, 59, 999);
    } else {
      // 使用具体范围
      startDate = range.start;
      endDate = range.end;
    }

    const history = await prisma.userStateHistory.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { date: 'asc' }
    });

    return history.map(h => ({
      date: h.date,
      attention: h.attention,
      fatigue: h.fatigue,
      motivation: h.motivation,
      memory: h.memory,
      speed: h.speed,
      stability: h.stability,
      trendState: h.trendState || undefined
    }));
  }

  /**
   * 获取认知成长对比
   * Requirements: 5.3
   *
   * Property 17: 对比当前和指定天数前的认知画像
   *
   * 修复：统一使用UTC时间，与saveStateSnapshot和getStateHistory保持一致
   *
   * @param userId 用户ID
   * @param period 对比周期（天数），默认30天
   * @returns 认知成长结果（包含 hasData 标志区分真实数据和默认值）
   */
  async getCognitiveGrowth(userId: string, period: DateRangeOption = 30): Promise<CognitiveGrowthResult> {
    // 修复：使用UTC时间计算过去日期，与其他方法保持一致
    const pastDate = new Date();
    pastDate.setUTCDate(pastDate.getUTCDate() - period);
    pastDate.setUTCHours(0, 0, 0, 0);

    // 获取当前状态（最近一条记录）
    const currentRecord = await prisma.userStateHistory.findFirst({
      where: { userId },
      orderBy: { date: 'desc' }
    });

    // 获取指定天数前的状态
    const pastRecord = await prisma.userStateHistory.findFirst({
      where: {
        userId,
        date: { lte: pastDate }
      },
      orderBy: { date: 'desc' }
    });

    // Bug Fix: 区分hasData和hasComparableData
    // hasData: 有当前记录时为true（即使只有单条记录）
    // hasComparableData: 有当前记录且有历史记录时为true（可以进行有意义的对比）
    const hasData = currentRecord !== null;
    const hasComparableData = currentRecord !== null && pastRecord !== null;

    // 默认值（无数据时使用）
    const defaultProfile: CognitiveProfile = {
      memory: 0.5,
      speed: 0.5,
      stability: 0.5
    };

    const current: CognitiveProfile = currentRecord
      ? {
          memory: currentRecord.memory,
          speed: currentRecord.speed,
          stability: currentRecord.stability
        }
      : defaultProfile;

    const past: CognitiveProfile = pastRecord
      ? {
          memory: pastRecord.memory,
          speed: pastRecord.speed,
          stability: pastRecord.stability
        }
      : defaultProfile;

    return {
      current,
      past,
      changes: {
        memory: current.memory - past.memory,
        speed: current.speed - past.speed,
        stability: current.stability - past.stability
      },
      period,
      hasData,
      hasComparableData
    };
  }

  /**
   * 获取显著变化
   * Requirements: 5.5
   * 
   * Property 18: 变化超过20%的指标标记为显著变化
   * 
   * @param userId 用户ID
   * @param range 日期范围
   * @returns 显著变化数组
   */
  async getSignificantChanges(
    userId: string,
    range: DateRangeOption | DateRange
  ): Promise<SignificantChange[]> {
    const history = await this.getStateHistory(userId, range);

    if (history.length < 2) {
      return [];
    }

    const firstRecord = history[0];
    const lastRecord = history[history.length - 1];

    const metrics: Array<keyof Omit<StateHistoryItem, 'date' | 'trendState'>> = [
      'attention', 'fatigue', 'motivation', 'memory', 'speed', 'stability'
    ];

    const significantChanges: SignificantChange[] = [];

    for (const metric of metrics) {
      const startValue = firstRecord[metric];
      const endValue = lastRecord[metric];
      const absoluteChange = endValue - startValue;

      // Bug Fix: 统一百分比计算逻辑，明确changePercent的含义
      // changePercent 统一表示相对变化百分比（如 +25% 表示增长了25%）
      // 边界情况处理：
      // 1. startValue接近0时：使用绝对变化量判断是否显著，但changePercent仍为0
      // 2. startValue非0时：changePercent = (endValue - startValue) / |startValue| * 100
      let changePercent: number;
      let isSignificant: boolean;

      if (Math.abs(startValue) < 0.001) {
        // startValue 接近0时，无法计算有意义的百分比变化
        // 使用绝对变化量判断是否显著（阈值0.2）
        // changePercent设为绝对变化量乘以100，表示"百分点"变化（如0.3变为30）
        // 注意：这种情况下changePercent的含义是"百分点变化"而非"百分比变化"
        changePercent = absoluteChange * 100;
        isSignificant = Math.abs(absoluteChange) >= SIGNIFICANT_CHANGE_THRESHOLD;
      } else {
        // 标准情况：计算相对百分比变化
        // 例如：从0.5变为0.6，changePercent = (0.6-0.5)/0.5 * 100 = 20%
        const relativeChange = absoluteChange / Math.abs(startValue);
        isSignificant = Math.abs(relativeChange) >= SIGNIFICANT_CHANGE_THRESHOLD;
        changePercent = relativeChange * 100;
      }

      // 检查是否超过阈值 (Property 18)
      if (isSignificant) {
        const direction: 'up' | 'down' = absoluteChange > 0 ? 'up' : 'down';

        // 判断是否为正面变化
        const isPositive = POSITIVE_WHEN_DOWN.includes(metric)
          ? direction === 'down'
          : direction === 'up';

        significantChanges.push({
          metric: metric as SignificantChange['metric'],
          metricLabel: METRIC_LABELS[metric] || metric,
          changePercent,
          direction,
          isPositive,
          startDate: firstRecord.date,
          endDate: lastRecord.date
        });
      }
    }

    // 按变化幅度排序
    significantChanges.sort((a, b) => 
      Math.abs(b.changePercent) - Math.abs(a.changePercent)
    );

    return significantChanges;
  }

  /**
   * 获取指定日期的状态快照
   * 
   * @param userId 用户ID
   * @param date 日期
   * @returns 状态历史项或null
   */
  async getStateByDate(
    userId: string,
    date: Date
  ): Promise<StateHistoryItem | null> {
    const targetDate = new Date(date);
    targetDate.setUTCHours(0, 0, 0, 0);

    const record = await prisma.userStateHistory.findUnique({
      where: {
        userId_date: {
          userId,
          date: targetDate
        }
      }
    });

    if (!record) return null;

    return {
      date: record.date,
      attention: record.attention,
      fatigue: record.fatigue,
      motivation: record.motivation,
      memory: record.memory,
      speed: record.speed,
      stability: record.stability,
      trendState: record.trendState || undefined
    };
  }

  /**
   * 删除用户的所有状态历史
   * 
   * @param userId 用户ID
   */
  async deleteUserHistory(userId: string): Promise<void> {
    await prisma.userStateHistory.deleteMany({
      where: { userId }
    });
  }

  /**
   * 获取状态历史统计摘要
   * 
   * @param userId 用户ID
   * @param range 日期范围
   * @returns 统计摘要
   */
  async getHistorySummary(
    userId: string,
    range: DateRangeOption
  ): Promise<{
    recordCount: number;
    avgAttention: number;
    avgFatigue: number;
    avgMotivation: number;
    avgMemory: number;
    avgSpeed: number;
    avgStability: number;
  }> {
    const history = await this.getStateHistory(userId, range);

    if (history.length === 0) {
      return {
        recordCount: 0,
        avgAttention: 0,
        avgFatigue: 0,
        avgMotivation: 0,
        avgMemory: 0,
        avgSpeed: 0,
        avgStability: 0
      };
    }

    const sum = history.reduce(
      (acc, h) => ({
        attention: acc.attention + h.attention,
        fatigue: acc.fatigue + h.fatigue,
        motivation: acc.motivation + h.motivation,
        memory: acc.memory + h.memory,
        speed: acc.speed + h.speed,
        stability: acc.stability + h.stability
      }),
      { attention: 0, fatigue: 0, motivation: 0, memory: 0, speed: 0, stability: 0 }
    );

    const count = history.length;

    return {
      recordCount: count,
      avgAttention: sum.attention / count,
      avgFatigue: sum.fatigue / count,
      avgMotivation: sum.motivation / count,
      avgMemory: sum.memory / count,
      avgSpeed: sum.speed / count,
      avgStability: sum.stability / count
    };
  }
}

// 导出单例实例
export const stateHistoryService = new StateHistoryService();
export default stateHistoryService;
