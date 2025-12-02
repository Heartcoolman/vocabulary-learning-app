/**
 * Global Statistics Service (全局统计服务)
 *
 * 用于计算全局用户统计数据，为新用户提供更好的初始化策略
 */

import prisma from '../../config/database';
import { StrategyParams } from '../types';

export interface GlobalUserStats {
  /** 新用户平均初始准确率 */
  initialAccuracy: number;
  /** 新用户平均反应时间（ms） */
  initialResponseTime: number;
  /** 新用户平均停留时间（ms） */
  initialDwellTime: number;
  /** 推荐的起始策略 */
  recommendedStartStrategy: StrategyParams;
  /** 统计样本数 */
  sampleSize: number;
}

export class GlobalStatsService {
  private readonly initialPhaseLimit = 10; // 前N次交互算作初始阶段
  private cachedStats: GlobalUserStats | null = null;
  private cacheTimestamp: number = 0;
  private readonly cacheLifetime = 3600 * 1000; // 缓存1小时

  /**
   * 计算全局用户统计，用于新用户初始化
   */
  async computeGlobalStats(): Promise<GlobalUserStats> {
    // 检查缓存
    if (this.cachedStats && Date.now() - this.cacheTimestamp < this.cacheLifetime) {
      return this.cachedStats;
    }

    // 查询所有用户的前10次交互统计
    const stats = await prisma.$queryRaw<Array<{
      avgaccuracy: number;
      avgresponsetime: number;
      avgdwelltime: number;
      samplesize: bigint;
    }>>`
      WITH user_initial_interactions AS (
        SELECT
          "userId",
          ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY timestamp) as seq_num,
          "isCorrect",
          "responseTime",
          "dwellTime"
        FROM "answer_records"
      )
      SELECT
        AVG(CASE WHEN "isCorrect" THEN 1.0 ELSE 0.0 END) as avgAccuracy,
        AVG("responseTime") as avgResponseTime,
        AVG("dwellTime") as avgDwellTime,
        COUNT(*) as sampleSize
      FROM user_initial_interactions
      WHERE seq_num <= ${this.initialPhaseLimit}
    `;

    const result = stats[0] || {
      avgaccuracy: 0.6,
      avgresponsetime: 5000,
      avgdwelltime: 3000,
      samplesize: BigInt(0)
    };

    const globalStats: GlobalUserStats = {
      initialAccuracy: Number(result.avgaccuracy),
      initialResponseTime: Number(result.avgresponsetime),
      initialDwellTime: Number(result.avgdwelltime),
      recommendedStartStrategy: this.deriveStartStrategy(Number(result.avgaccuracy)),
      sampleSize: Number(result.samplesize)
    };

    // 更新缓存
    this.cachedStats = globalStats;
    this.cacheTimestamp = Date.now();

    return globalStats;
  }

  /**
   * 基于全局统计推导起始策略
   *
   * 使用保守策略帮助新用户建立信心
   */
  private deriveStartStrategy(globalAccuracy: number): StrategyParams {
    // 如果全局新用户准确率较低，使用更保守的策略
    if (globalAccuracy < 0.5) {
      return {
        interval_scale: 0.5,  // 更短间隔
        new_ratio: 0.1,       // 更少新词
        difficulty: 'easy',
        batch_size: 4,        // 更小批量
        hint_level: 2         // 最高提示
      };
    } else if (globalAccuracy < 0.7) {
      return {
        interval_scale: 0.8,
        new_ratio: 0.15,
        difficulty: 'easy',
        batch_size: 6,
        hint_level: 2
      };
    } else {
      // 全局表现较好，可以稍微激进
      return {
        interval_scale: 1.0,
        new_ratio: 0.2,
        difficulty: 'mid',
        batch_size: 8,
        hint_level: 1
      };
    }
  }

  /**
   * 清除缓存（用于手动刷新）
   */
  clearCache(): void {
    this.cachedStats = null;
    this.cacheTimestamp = 0;
  }

  /**
   * 获取缓存的统计数据（如果有）
   */
  getCachedStats(): GlobalUserStats | null {
    if (this.cachedStats && Date.now() - this.cacheTimestamp < this.cacheLifetime) {
      return this.cachedStats;
    }
    return null;
  }
}

// 单例导出
export const globalStatsService = new GlobalStatsService();
