/**
 * Chronotype Detection (昼夜节律类型检测)
 *
 * 基于用户历史学习记录，推断其最佳学习时段
 */

import prisma from '../../config/database';

export type ChronotypeCategory = 'morning' | 'evening' | 'intermediate';

export interface ChronotypeProfile {
  /** 节律类型 */
  category: ChronotypeCategory;
  /** 最佳学习时段（小时，24小时制） */
  peakHours: number[];
  /** 判断信心度 [0, 1] */
  confidence: number;
  /** 总样本数 */
  sampleCount: number;
  /** 历史学习记录（各时段表现） */
  learningHistory: Array<{
    hour: number;
    performance: number;
    sampleCount: number;
  }>;
}

export class ChronotypeDetector {
  private readonly minSampleSize = 20; // 最小数据量要求
  private readonly recentRecordLimit = 500; // 分析最近N条记录

  /**
   * 基于历史学习记录推断chronotype
   *
   * @param userId 用户ID
   * @returns Chronotype画像
   */
  async analyzeChronotype(userId: string): Promise<ChronotypeProfile> {
    // 获取历史答题记录，按小时分组
    const hourlyPerformance = await this.getHourlyPerformance(userId);

    // 计算总样本数（所有小时的样本数之和）
    const totalSamples = hourlyPerformance.reduce((sum, h) => sum + h.sampleCount, 0);

    if (totalSamples < this.minSampleSize) {
      // 数据不足，返回中间型（默认）
      return {
        category: 'intermediate',
        peakHours: [9, 10, 14, 15, 16],
        confidence: 0.3,
        sampleCount: totalSamples,
        learningHistory: hourlyPerformance
      };
    }

    // 计算各时段平均表现
    const morningPerf = this.getAveragePerformance(hourlyPerformance, [6, 7, 8, 9, 10]);
    const afternoonPerf = this.getAveragePerformance(hourlyPerformance, [14, 15, 16, 17, 18]);
    const eveningPerf = this.getAveragePerformance(hourlyPerformance, [19, 20, 21, 22]);

    // 计算置信度（基于样本量和差异）
    const maxPerf = Math.max(morningPerf.avg, afternoonPerf.avg, eveningPerf.avg);
    const perfVariance = this.computeVariance([
      morningPerf.avg,
      afternoonPerf.avg,
      eveningPerf.avg
    ]);

    // 置信度：样本量越大、差异越明显，置信度越高
    const sampleConfidence = Math.min(totalSamples / 100, 1.0);
    const differenceConfidence = perfVariance > 0.01 ? 0.8 : 0.5;
    const confidence = (sampleConfidence + differenceConfidence) / 2;

    // 判断类型
    if (morningPerf.avg > afternoonPerf.avg && morningPerf.avg > eveningPerf.avg) {
      // 早晨型
      return {
        category: 'morning',
        peakHours: this.identifyPeakHours(hourlyPerformance, [6, 7, 8, 9, 10, 11]),
        confidence,
        sampleCount: totalSamples,
        learningHistory: hourlyPerformance
      };
    } else if (eveningPerf.avg > morningPerf.avg && eveningPerf.avg > afternoonPerf.avg) {
      // 夜晚型
      return {
        category: 'evening',
        peakHours: this.identifyPeakHours(hourlyPerformance, [18, 19, 20, 21, 22, 23]),
        confidence,
        sampleCount: totalSamples,
        learningHistory: hourlyPerformance
      };
    } else {
      // 中间型（下午型）
      return {
        category: 'intermediate',
        peakHours: this.identifyPeakHours(hourlyPerformance, [10, 11, 14, 15, 16, 17]),
        confidence: confidence * 0.8, // 中间型置信度稍低
        sampleCount: totalSamples,
        learningHistory: hourlyPerformance
      };
    }
  }

  /**
   * 获取各小时的学习表现
   */
  private async getHourlyPerformance(userId: string): Promise<Array<{
    hour: number;
    performance: number;
    sampleCount: number;
  }>> {
    // 从AnswerRecord提取hour和accuracy
    const records = await prisma.answerRecord.findMany({
      where: { userId },
      select: {
        timestamp: true,
        isCorrect: true
      },
      orderBy: { timestamp: 'desc' },
      take: this.recentRecordLimit
    });

    if (records.length === 0) {
      return [];
    }

    // 按小时分组统计
    const hourlyData: Map<number, { correct: number; total: number }> = new Map();

    records.forEach(r => {
      const hour = r.timestamp.getHours();
      const data = hourlyData.get(hour) || { correct: 0, total: 0 };
      data.total++;
      if (r.isCorrect) data.correct++;
      hourlyData.set(hour, data);
    });

    // 转换为数组并计算performance
    return Array.from(hourlyData.entries())
      .map(([hour, data]) => ({
        hour,
        performance: data.correct / data.total,
        sampleCount: data.total
      }))
      .sort((a, b) => a.hour - b.hour);
  }

  /**
   * 计算指定时段的平均表现
   */
  private getAveragePerformance(
    hourlyPerf: Array<{ hour: number; performance: number; sampleCount: number }>,
    hours: number[]
  ): { avg: number; count: number } {
    const relevant = hourlyPerf.filter(h => hours.includes(h.hour));

    if (relevant.length === 0) {
      return { avg: 0, count: 0 };
    }

    // 加权平均（按样本量）
    const totalSamples = relevant.reduce((sum, h) => sum + h.sampleCount, 0);
    const weightedSum = relevant.reduce((sum, h) => sum + h.performance * h.sampleCount, 0);

    return {
      avg: weightedSum / totalSamples,
      count: relevant.length
    };
  }

  /**
   * 识别峰值时段（表现最好的连续时段）
   */
  private identifyPeakHours(
    hourlyPerf: Array<{ hour: number; performance: number; sampleCount: number }>,
    candidateHours: number[]
  ): number[] {
    const candidates = hourlyPerf.filter(h => candidateHours.includes(h.hour));

    if (candidates.length === 0) {
      return candidateHours.slice(0, 4);
    }

    // 按表现排序，取top 4
    return candidates
      .sort((a, b) => b.performance - a.performance)
      .slice(0, 4)
      .map(h => h.hour)
      .sort((a, b) => a - b);
  }

  /**
   * 计算方差
   */
  private computeVariance(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

    return variance;
  }

  /**
   * 判断当前时间是否在用户峰值时段
   */
  isCurrentlyPeakTime(profile: ChronotypeProfile, now: Date = new Date()): boolean {
    const currentHour = now.getHours();
    return profile.peakHours.includes(currentHour);
  }

  /**
   * 获取下一个峰值时段
   */
  getNextPeakTime(profile: ChronotypeProfile, now: Date = new Date()): number {
    const currentHour = now.getHours();
    const nextPeak = profile.peakHours.find(h => h > currentHour);

    // 如果今天没有更晚的峰值，返回明天第一个峰值
    return nextPeak || profile.peakHours[0];
  }
}
