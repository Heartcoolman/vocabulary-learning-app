/**
 * Learning Style Profiler (学习风格分析器)
 *
 * 基于用户交互行为推断学习风格偏好
 *
 * 学习风格分类（VARK模型简化版）：
 * - Visual: 视觉学习者（高dwell time，关注视觉信息）
 * - Auditory: 听觉学习者（频繁使用发音功能）
 * - Kinesthetic: 动觉学习者（高交互密度，频繁尝试）
 * - Mixed: 混合型
 */

import prisma from '../../config/database';

export type LearningStyle = 'visual' | 'auditory' | 'kinesthetic' | 'mixed';

export interface LearningStyleProfile {
  /** 学习风格类型 */
  style: LearningStyle;
  /** 判断信心度 [0, 1] */
  confidence: number;
  /** 总样本数 */
  sampleCount: number;
  /** 各风格得分 */
  scores: {
    visual: number;
    auditory: number;
    kinesthetic: number;
  };
  /** 交互模式统计 */
  interactionPatterns: {
    avgDwellTime: number;
    avgResponseTime: number;
    pauseFrequency: number;
    switchFrequency: number;
  };
}

export class LearningStyleProfiler {
  private readonly minSampleSize = 50; // 最小数据量
  private readonly recentRecordLimit = 200; // 分析最近N条记录

  /**
   * 基于交互行为推断学习风格
   *
   * @param userId 用户ID
   * @returns 学习风格画像
   */
  async detectLearningStyle(userId: string): Promise<LearningStyleProfile> {
    const interactions = await this.getInteractionPatterns(userId);

    // 数据不足
    if (interactions.sampleCount < this.minSampleSize) {
      return {
        style: 'mixed',
        confidence: 0.3,
        sampleCount: interactions.sampleCount,
        scores: { visual: 0.33, auditory: 0.33, kinesthetic: 0.33 },
        interactionPatterns: {
          avgDwellTime: interactions.avgDwellTime,
          avgResponseTime: interactions.avgResponseTime,
          pauseFrequency: 0,
          switchFrequency: 0
        }
      };
    }

    // 计算各风格得分
    const visualScore = this.computeVisualScore(interactions);
    const auditoryScore = this.computeAuditoryScore(interactions);
    const kinestheticScore = this.computeKinestheticScore(interactions);

    const scores = { visual: visualScore, auditory: auditoryScore, kinesthetic: kinestheticScore };

    // 归一化得分
    const totalScore = visualScore + auditoryScore + kinestheticScore;
    if (totalScore > 0) {
      scores.visual /= totalScore;
      scores.auditory /= totalScore;
      scores.kinesthetic /= totalScore;
    }

    // 判断主导风格
    const maxScore = Math.max(visualScore, auditoryScore, kinestheticScore);

    // 如果没有明显主导风格（差异<20%），判定为混合型
    if (maxScore < 0.4) {
      return {
        style: 'mixed',
        confidence: 0.5,
        sampleCount: interactions.sampleCount,
        scores,
        interactionPatterns: {
          avgDwellTime: interactions.avgDwellTime,
          avgResponseTime: interactions.avgResponseTime,
          pauseFrequency: interactions.pauseCount / interactions.sampleCount,
          switchFrequency: interactions.switchCount / interactions.sampleCount
        }
      };
    }

    // 确定主导风格
    let style: LearningStyle;
    if (visualScore === maxScore) {
      style = 'visual';
    } else if (auditoryScore === maxScore) {
      style = 'auditory';
    } else {
      style = 'kinesthetic';
    }

    // 计算置信度
    const confidence = Math.min(maxScore, 0.9);

    return {
      style,
      confidence,
      sampleCount: interactions.sampleCount,
      scores,
      interactionPatterns: {
        avgDwellTime: interactions.avgDwellTime,
        avgResponseTime: interactions.avgResponseTime,
        pauseFrequency: interactions.pauseCount / interactions.sampleCount,
        switchFrequency: interactions.switchCount / interactions.sampleCount
      }
    };
  }

  /**
   * 获取用户交互模式
   */
  private async getInteractionPatterns(userId: string) {
    const records = await prisma.answerRecord.findMany({
      where: { userId },
      select: {
        dwellTime: true,
        responseTime: true,
        timestamp: true
      },
      orderBy: { timestamp: 'desc' },
      take: this.recentRecordLimit
    });

    if (records.length === 0) {
      return {
        avgDwellTime: 0,
        avgResponseTime: 0,
        pauseCount: 0,
        switchCount: 0,
        dwellTimeVariance: 0,
        responseTimeVariance: 0,
        sampleCount: 0
      };
    }

    const avgDwellTime = records.reduce((sum, r) => sum + (r.dwellTime || 0), 0) / records.length;
    const avgResponseTime = records.reduce((sum, r) => sum + (r.responseTime || 0), 0) / records.length;

    const dwellTimeVariance = records.reduce((sum, r) => {
      const diff = (r.dwellTime || 0) - avgDwellTime;
      return sum + diff * diff;
    }, 0) / records.length;

    const responseTimeVariance = records.reduce((sum, r) => {
      const diff = (r.responseTime || 0) - avgResponseTime;
      return sum + diff * diff;
    }, 0) / records.length;

    let pauseCount = 0;
    for (let i = 1; i < records.length; i++) {
      const gap = records[i - 1].timestamp.getTime() - records[i].timestamp.getTime();
      if (gap > 30000) pauseCount++;
    }

    let switchCount = 0;
    for (let i = 1; i < records.length; i++) {
      const prev = records[i - 1].responseTime || avgResponseTime;
      const curr = records[i].responseTime || avgResponseTime;
      if (prev > 0 && curr > 0 && (curr / prev > 2 || prev / curr > 2)) {
        switchCount++;
      }
    }

    return {
      avgDwellTime,
      avgResponseTime,
      pauseCount,
      switchCount,
      dwellTimeVariance,
      responseTimeVariance,
      sampleCount: records.length
    };
  }

  /**
   * 计算视觉学习风格得分
   *
   * 特征：高停留时间（仔细阅读）、低急迫性
   */
  private computeVisualScore(interactions: any): number {
    const optimalDwellTime = 5000; // 5秒
    const dwellTimeScore = Math.min(interactions.avgDwellTime / optimalDwellTime, 1.0);

    // 停留时间较长且响应时间适中的用户更倾向视觉学习
    const deliberateScore = interactions.avgDwellTime > 3000 ? 0.3 : 0;

    return Math.min(dwellTimeScore + deliberateScore, 1.0);
  }

  /**
   * 计算听觉学习风格得分
   *
   * 特征：基于停留时间方差推断（听觉学习者通常停留时间更稳定）
   */
  private computeAuditoryScore(interactions: any): number {
    const dwellTimeStdDev = Math.sqrt(interactions.dwellTimeVariance || 0);
    const coefficientOfVariation = interactions.avgDwellTime > 0
      ? dwellTimeStdDev / interactions.avgDwellTime
      : 1;

    const stabilityScore = coefficientOfVariation < 0.3 ? 0.4 : coefficientOfVariation < 0.5 ? 0.25 : 0.1;
    const dwellScore = interactions.avgDwellTime >= 3000 && interactions.avgDwellTime <= 6000 ? 0.3 : 0.1;
    const pauseRate = interactions.sampleCount > 0 ? interactions.pauseCount / interactions.sampleCount : 0;
    const pauseScore = pauseRate > 0.1 ? 0.2 : 0.1;

    return Math.min(stabilityScore + dwellScore + pauseScore, 1.0);
  }

  /**
   * 计算动觉学习风格得分
   *
   * 特征：高交互密度、频繁切换、快速尝试
   */
  private computeKinestheticScore(interactions: any): number {
    const speedScore = interactions.avgResponseTime < 2000 ? 0.4
      : interactions.avgResponseTime < 3000 ? 0.3 : 0.15;

    const switchRate = interactions.sampleCount > 0 ? interactions.switchCount / interactions.sampleCount : 0;
    const switchScore = switchRate > 0.2 ? 0.3 : switchRate > 0.1 ? 0.2 : 0.1;

    const responseTimeStdDev = Math.sqrt(interactions.responseTimeVariance || 0);
    const responseCV = interactions.avgResponseTime > 0
      ? responseTimeStdDev / interactions.avgResponseTime
      : 0;
    const variabilityScore = responseCV > 0.5 ? 0.2 : 0.1;

    return Math.min(speedScore + switchScore + variabilityScore, 1.0);
  }

  /**
   * 根据学习风格给出内容呈现建议
   */
  getContentRecommendation(style: LearningStyle): {
    emphasize: string[];
    avoid: string[];
  } {
    const recommendations: Record<LearningStyle, { emphasize: string[]; avoid: string[] }> = {
      visual: {
        emphasize: ['图片', '图表', '视觉化例句', '颜色标记'],
        avoid: ['纯文字', '长段落']
      },
      auditory: {
        emphasize: ['发音音频', '韵律记忆', '口语例句'],
        avoid: ['无声阅读', '纯视觉内容']
      },
      kinesthetic: {
        emphasize: ['互动练习', '打字输入', '拖拽排序', '游戏化'],
        avoid: ['被动阅读', '长时等待']
      },
      mixed: {
        emphasize: ['多样化内容', '组合呈现'],
        avoid: []
      }
    };

    return recommendations[style];
  }
}
