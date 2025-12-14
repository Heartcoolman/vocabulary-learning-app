/**
 * 情绪感知检测器 (T5.5)
 *
 * 基于用户自我报告和行为信号检测情绪状态
 */

/**
 * 行为信号
 */
export interface BehaviorSignals {
  /** 连续错误次数 */
  consecutiveWrong: number;
  /** 平均反应时间 (ms) */
  avgResponseTime: number;
  /** 反应时间方差 */
  responseTimeVariance: number;
  /** 跳过次数 */
  skipCount: number;
  /** 停留时间比率 (dwellTime / responseTime) */
  dwellTimeRatio: number;
  /** 基线反应时间 (ms) - 用户的正常反应时间 */
  baselineResponseTime: number;
}

/**
 * 情绪状态
 */
export interface EmotionState {
  /** 检测到的情绪 */
  emotion: 'frustrated' | 'anxious' | 'bored' | 'tired' | 'neutral';
  /** 置信度 [0,1] */
  confidence: number;
}

/**
 * 情绪检测器
 *
 * 使用规则+启发式方法融合自我报告和行为信号
 */
export class EmotionDetector {
  /**
   * 检测情绪状态
   *
   * @param selfReport - 用户自我报告的情绪 (可选)
   * @param behaviorSignals - 从用户行为推断的信号
   * @returns 情绪状态和置信度
   */
  detectEmotion(selfReport: string | null, behaviorSignals: BehaviorSignals): EmotionState {
    // 如果有自我报告，使用自我报告并结合行为信号验证
    if (selfReport) {
      return this.mapSelfReport(selfReport, behaviorSignals);
    }

    // 否则完全基于行为推断
    return this.inferFromBehavior(behaviorSignals);
  }

  /**
   * 从自我报告映射情绪，并使用行为信号验证
   *
   * @param selfReport - 用户自我报告的情绪
   * @param signals - 行为信号
   * @returns 情绪状态
   */
  private mapSelfReport(selfReport: string, signals: BehaviorSignals): EmotionState {
    const normalized = selfReport.toLowerCase().trim();

    // 定义情绪关键词映射
    const emotionKeywords: Record<string, EmotionState['emotion']> = {
      沮丧: 'frustrated',
      受挫: 'frustrated',
      烦躁: 'frustrated',
      焦虑: 'anxious',
      紧张: 'anxious',
      不安: 'anxious',
      无聊: 'bored',
      厌倦: 'bored',
      疲惫: 'tired',
      累: 'tired',
      困: 'tired',
    };

    // 查找匹配的情绪关键词
    let detectedEmotion: EmotionState['emotion'] = 'neutral';
    for (const [keyword, emotion] of Object.entries(emotionKeywords)) {
      if (normalized.includes(keyword)) {
        detectedEmotion = emotion;
        break;
      }
    }

    // 使用行为信号验证自我报告的一致性
    const behaviorEmotion = this.inferFromBehavior(signals);

    // 如果自我报告和行为推断一致，置信度高
    if (detectedEmotion === behaviorEmotion.emotion) {
      return {
        emotion: detectedEmotion,
        confidence: Math.min(0.95, behaviorEmotion.confidence + 0.2),
      };
    }

    // 如果不一致但行为信号强烈，降低自我报告的置信度
    if (behaviorEmotion.confidence > 0.7) {
      return {
        emotion: behaviorEmotion.emotion,
        confidence: 0.65, // 中等置信度
      };
    }

    // 否则相信自我报告，但置信度中等
    return {
      emotion: detectedEmotion,
      confidence: 0.6,
    };
  }

  /**
   * 从行为信号推断情绪
   *
   * @param signals - 行为信号
   * @returns 情绪状态
   */
  private inferFromBehavior(signals: BehaviorSignals): EmotionState {
    const {
      consecutiveWrong,
      avgResponseTime,
      responseTimeVariance,
      skipCount,
      dwellTimeRatio,
      baselineResponseTime,
    } = signals;

    // 计算相对于基线的反应时间比率
    const responseTimeRatio =
      baselineResponseTime > 0 ? avgResponseTime / baselineResponseTime : 1.0;

    // 归一化方差 (CV: 变异系数)
    const responseTimeCV =
      avgResponseTime > 0 ? Math.sqrt(responseTimeVariance) / avgResponseTime : 0;

    // 情绪得分计算
    const scores = {
      frustrated: 0,
      anxious: 0,
      bored: 0,
      tired: 0,
      neutral: 0,
    };

    // ===== 受挫 (Frustrated) =====
    // 特征: 连续错误多 + 反应时间变化大 + 跳过多
    if (consecutiveWrong >= 3) {
      scores.frustrated += 0.4 + (consecutiveWrong - 3) * 0.1;
    }
    if (responseTimeCV > 0.5) {
      scores.frustrated += 0.3;
    }
    if (skipCount > 2) {
      scores.frustrated += 0.2 + (skipCount - 2) * 0.05;
    }

    // ===== 焦虑 (Anxious) =====
    // 特征: 反应时间快 + 方差大 + 停留时间短
    if (responseTimeRatio < 0.8) {
      scores.anxious += 0.3;
    }
    if (responseTimeCV > 0.4) {
      scores.anxious += 0.25;
    }
    if (dwellTimeRatio < 0.5) {
      scores.anxious += 0.3;
    }

    // ===== 无聊 (Bored) =====
    // 特征: 反应时间慢但稳定 + 跳过多 + 错误率中等
    if (responseTimeRatio > 1.3) {
      scores.bored += 0.35;
    }
    if (responseTimeCV < 0.3) {
      scores.bored += 0.2;
    }
    if (skipCount > 1) {
      scores.bored += 0.2;
    }
    if (consecutiveWrong >= 1 && consecutiveWrong <= 2) {
      scores.bored += 0.15;
    }

    // ===== 疲劳 (Tired) =====
    // 特征: 反应时间慢 + 方差小 + 停留时间长 + 连续错误中等
    if (responseTimeRatio > 1.4) {
      scores.tired += 0.4;
    }
    if (responseTimeCV < 0.25) {
      scores.tired += 0.2;
    }
    if (dwellTimeRatio > 1.2) {
      scores.tired += 0.25;
    }
    if (consecutiveWrong >= 2) {
      scores.tired += 0.15;
    }

    // ===== 正常 (Neutral) =====
    // 基线分数
    scores.neutral = 0.3;
    // 反应时间接近基线
    if (responseTimeRatio >= 0.9 && responseTimeRatio <= 1.2) {
      scores.neutral += 0.3;
    }
    // 低错误率
    if (consecutiveWrong === 0) {
      scores.neutral += 0.25;
    }
    // 方差适中
    if (responseTimeCV >= 0.2 && responseTimeCV <= 0.4) {
      scores.neutral += 0.15;
    }

    // 找出得分最高的情绪
    let maxEmotion: EmotionState['emotion'] = 'neutral';
    let maxScore = scores.neutral;

    for (const [emotion, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxEmotion = emotion as EmotionState['emotion'];
        maxScore = score;
      }
    }

    // 归一化置信度 [0,1]
    const confidence = Math.min(1.0, Math.max(0.0, maxScore));

    return {
      emotion: maxEmotion,
      confidence,
    };
  }
}

/**
 * 默认导出单例
 */
export const emotionDetector = new EmotionDetector();
