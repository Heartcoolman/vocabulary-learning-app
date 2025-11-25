/**
 * 时间推荐服务
 * 基于用户学习习惯画像提供智能学习时机推荐
 * Requirements: 1.1, 1.2, 1.3, 1.5
 */

import prisma from '../config/database';

// ============================================
// 类型定义
// ============================================

/**
 * 时间段信息
 */
export interface TimeSlot {
  /** 小时 (0-23) */
  hour: number;
  /** 得分 (0-1) */
  score: number;
  /** 置信度 (0-1) */
  confidence: number;
}

/**
 * 时间偏好分析结果
 */
export interface TimePreferenceResult {
  /** 24小时偏好分布 */
  timePref: number[];
  /** 推荐时间段 (前3个最佳时段) */
  preferredSlots: TimeSlot[];
  /** 整体置信度 */
  confidence: number;
  /** 样本数量 */
  sampleCount: number;
}

/**
 * 黄金学习时间检测结果
 */
export interface GoldenTimeResult {
  /** 当前是否为黄金学习时间 */
  isGolden: boolean;
  /** 当前小时 */
  currentHour: number;
  /** 匹配的时间段 */
  matchedSlot?: TimeSlot;
}

/**
 * 数据不足响应
 */
export interface InsufficientDataResult {
  insufficientData: true;
  minRequired: number;
  currentCount: number;
}

// ============================================
// 常量配置
// ============================================

/** 最小学习会话数量阈值 (Requirements: 1.3) */
const MIN_SESSION_COUNT = 20;

/** 推荐时间段数量 (Requirements: 1.5) */
const RECOMMENDED_SLOTS_COUNT = 3;

/** 黄金时间得分阈值 */
const GOLDEN_TIME_THRESHOLD = 0.6;

/** 默认推荐时间段（数据不足时使用，基于一般学习效率研究） */
const DEFAULT_RECOMMENDED_SLOTS: TimeSlot[] = [
  { hour: 9, score: 0.5, confidence: 0 },   // 上午精力充沛
  { hour: 14, score: 0.4, confidence: 0 },  // 午后小高峰
  { hour: 20, score: 0.3, confidence: 0 }   // 晚间复习时段
];

/** 默认时间偏好（均匀分布） */
const DEFAULT_TIME_PREF = new Array(24).fill(1 / 24);

// ============================================
// 服务实现
// ============================================

class TimeRecommendService {
  /**
   * 获取用户时间偏好分析
   * Requirements: 1.1, 1.3, 1.5
   * 
   * @param userId 用户ID
   * @returns 时间偏好结果或数据不足响应
   */
  async getTimePreferences(
    userId: string
  ): Promise<TimePreferenceResult | InsufficientDataResult> {
    // 获取用户学习会话数量
    const sessionCount = await this.getSessionCount(userId);

    // 检查数据是否充足 (Requirements: 1.3)
    if (sessionCount < MIN_SESSION_COUNT) {
      return {
        insufficientData: true,
        minRequired: MIN_SESSION_COUNT,
        currentCount: sessionCount
      };
    }

    // 获取用户习惯画像
    const habitProfile = await prisma.habitProfile.findUnique({
      where: { userId }
    });

    // 如果没有习惯画像，从答题记录计算
    let timePref: number[];
    if (habitProfile?.timePref) {
      timePref = this.parseTimePref(habitProfile.timePref);
    } else {
      timePref = await this.calculateTimePrefFromRecords(userId);
    }

    // 获取推荐时间段 (Requirements: 1.5)
    const preferredSlots = this.getRecommendedSlots(timePref);

    // 计算整体置信度
    const confidence = this.calculateConfidence(sessionCount, timePref);

    return {
      timePref,
      preferredSlots,
      confidence,
      sampleCount: sessionCount
    };
  }

  /**
   * 检查当前是否为黄金学习时间
   * Requirements: 1.2
   * 
   * @param userId 用户ID
   * @returns 黄金时间检测结果
   */
  async isGoldenTime(userId: string): Promise<GoldenTimeResult> {
    const currentHour = new Date().getHours();

    // 获取时间偏好
    const preferences = await this.getTimePreferences(userId);

    // 如果数据不足，返回非黄金时间
    if ('insufficientData' in preferences) {
      return {
        isGolden: false,
        currentHour
      };
    }

    // 检查当前小时是否在推荐时间段中
    const matchedSlot = preferences.preferredSlots.find(
      slot => slot.hour === currentHour
    );

    // 判断是否为黄金时间 (Requirements: 1.2)
    const isGolden = matchedSlot !== undefined && 
                     matchedSlot.score >= GOLDEN_TIME_THRESHOLD;

    return {
      isGolden,
      currentHour,
      matchedSlot: isGolden ? matchedSlot : undefined
    };
  }

  /**
   * 获取推荐时间段
   * Requirements: 1.5
   * 
   * Property 1: 返回恰好3个TimeSlot，按得分降序排列，
   * 每个slot的hour在0-23之间，score在0-1之间
   * 
   * @param timePref 24小时偏好分布数组
   * @returns 推荐时间段数组（恰好3个）
   */
  getRecommendedSlots(timePref: number[]): TimeSlot[] {
    // 确保输入是24个元素的数组
    if (!Array.isArray(timePref) || timePref.length !== 24) {
      // 返回默认时间段（使用预定义常量）
      return [...DEFAULT_RECOMMENDED_SLOTS];
    }

    // 创建时间段数组并计算得分
    const slots: TimeSlot[] = timePref.map((score, hour) => ({
      hour,
      score: this.normalizeScore(score),
      confidence: this.calculateSlotConfidence(score, timePref)
    }));

    // 按得分降序排序
    slots.sort((a, b) => b.score - a.score);

    // 返回前3个时间段 (Requirements: 1.5)
    return slots.slice(0, RECOMMENDED_SLOTS_COUNT);
  }

  // ============================================
  // 私有辅助方法
  // ============================================

  /**
   * 获取用户学习会话数量
   */
  private async getSessionCount(userId: string): Promise<number> {
    // 统计不同的sessionId数量
    const sessions = await prisma.answerRecord.groupBy({
      by: ['sessionId'],
      where: {
        userId,
        sessionId: { not: null }
      }
    });

    return sessions.length;
  }

  /**
   * 解析时间偏好JSON
   */
  private parseTimePref(timePrefJson: unknown): number[] {
    if (Array.isArray(timePrefJson) && timePrefJson.length === 24) {
      return timePrefJson.map(v =>
        typeof v === 'number' ? v : 0
      );
    }
    // 返回默认均匀分布（使用预定义常量）
    return [...DEFAULT_TIME_PREF];
  }

  /**
   * 从答题记录计算时间偏好
   */
  private async calculateTimePrefFromRecords(userId: string): Promise<number[]> {
    // 获取用户所有答题记录的时间分布
    const records = await prisma.answerRecord.findMany({
      where: { userId },
      select: {
        timestamp: true,
        isCorrect: true,
        responseTime: true
      }
    });

    // 初始化24小时计数和得分
    const hourCounts = new Array(24).fill(0);
    const hourScores = new Array(24).fill(0);

    // 统计每小时的学习效果
    for (const record of records) {
      const hour = new Date(record.timestamp).getHours();
      hourCounts[hour]++;
      
      // 计算学习效果得分（正确率 + 响应速度）
      const correctScore = record.isCorrect ? 1 : 0;
      const speedScore = record.responseTime 
        ? Math.max(0, 1 - record.responseTime / 10000) 
        : 0.5;
      hourScores[hour] += (correctScore * 0.7 + speedScore * 0.3);
    }

    // 计算每小时的平均得分
    const timePref = hourScores.map((score, hour) => {
      if (hourCounts[hour] === 0) return 0;
      return score / hourCounts[hour];
    });

    // 归一化到0-1范围
    const maxScore = Math.max(...timePref, 0.001);
    return timePref.map(score => score / maxScore);
  }

  /**
   * 归一化得分到0-1范围
   */
  private normalizeScore(score: number): number {
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      return 0;
    }
    return Math.max(0, Math.min(1, score));
  }

  /**
   * 计算单个时间段的置信度
   */
  private calculateSlotConfidence(score: number, allScores: number[]): number {
    // 基于得分与平均值的差异计算置信度
    const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
    const stdDev = Math.sqrt(
      allScores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / allScores.length
    );

    if (stdDev === 0) return 0.5;

    // 得分越高于平均值，置信度越高
    const zScore = (score - avg) / stdDev;
    return Math.max(0, Math.min(1, 0.5 + zScore * 0.2));
  }

  /**
   * 计算整体置信度
   */
  private calculateConfidence(sessionCount: number, timePref: number[]): number {
    // 基于样本数量的置信度
    const sampleConfidence = Math.min(1, sessionCount / 100);

    // 基于时间分布方差的置信度（方差越大，模式越明显）
    const avg = timePref.reduce((a, b) => a + b, 0) / timePref.length;
    const variance = timePref.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / timePref.length;
    const varianceConfidence = Math.min(1, variance * 10);

    // 综合置信度
    return sampleConfidence * 0.6 + varianceConfidence * 0.4;
  }
}

// 导出单例实例
export const timeRecommendService = new TimeRecommendService();
