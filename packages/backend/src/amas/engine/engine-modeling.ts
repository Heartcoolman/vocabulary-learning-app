/**
 * AMAS Engine - 建模层编排模块
 *
 * 负责用户多维度状态的更新和特征提取
 */

import { AttentionFeatures } from '../modeling/attention-monitor';
import { isTrendAnalyzerEnabled } from '../config/feature-flags';
import { FeatureVector, RawEvent, UserState } from '../types';
import { UserModels, clamp } from './engine-types';

/**
 * 建模层管理器
 *
 * 负责：
 * - 更新用户多维度状态（A/F/C/M/T）
 * - 特征提取和转换
 * - 协调五个建模器的工作
 */
export class ModelingManager {
  /**
   * 更新用户状态
   *
   * 协调 Attention/Fatigue/Cognitive/Motivation/Trend 五个建模器
   */
  updateUserState(
    prevState: UserState,
    featureVec: FeatureVector,
    event: RawEvent,
    recentErrorRate: number,
    models: UserModels
  ): UserState {
    // 转换特征为注意力输入
    const attentionFeatures = this.extractAttentionFeatures(featureVec);
    const A = models.attention.update(attentionFeatures);

    // 疲劳度更新
    // 将对话框暂停时间转换为休息分钟数，用于疲劳度衰减计算
    const breakMinutes = event.pausedTimeMs ? event.pausedTimeMs / 60000 : undefined;
    const F = models.fatigue.update({
      error_rate_trend: event.isCorrect ? -0.05 : 0.1,
      rt_increase_rate: featureVec.values[0],
      repeat_errors: event.retryCount,
      breakMinutes // 对话框暂停时间视为休息时间
    });

    // 认知能力更新 (使用二项分布方差公式: p * (1-p))
    const errorVariance = recentErrorRate * (1 - recentErrorRate);
    const C = models.cognitive.update({
      accuracy: event.isCorrect ? 1 : 0,
      avgResponseTime: event.responseTime,
      errorVariance
    });

    // 动机更新
    const M = models.motivation.update({
      successes: event.isCorrect ? 1 : 0,
      failures: event.isCorrect ? 0 : 1,
      quits: 0
    });

    // 趋势分析更新 (如果启用)
    let trendState = prevState.T ?? 'flat';
    if (models.trendAnalyzer && isTrendAnalyzerEnabled()) {
      // 综合能力指标: 70%记忆 + 30%稳定性
      const ability = clamp(0.7 * C.mem + 0.3 * C.stability, 0, 1);
      trendState = models.trendAnalyzer.update(ability, event.timestamp);
    }

    return {
      ...prevState,
      A,
      F,
      C,
      M,
      T: trendState,
      ts: event.timestamp,
      conf: Math.min(1, prevState.conf + 0.01)
    };
  }

  /**
   * 从特征向量提取注意力特征
   */
  extractAttentionFeatures(featureVec: FeatureVector): AttentionFeatures {
    const v = featureVec.values;
    const safeGet = (index: number, defaultVal: number = 0) =>
      index < v.length && Number.isFinite(v[index]) ? v[index] : defaultVal;

    return {
      z_rt_mean: safeGet(0),
      z_rt_cv: safeGet(1),
      z_pace_cv: safeGet(2),
      z_pause: safeGet(3),
      z_switch: safeGet(4),
      z_drift: safeGet(5),
      interaction_density: safeGet(6),
      focus_loss_duration: safeGet(7)
    };
  }

  /**
   * 创建默认用户状态
   */
  createDefaultState(): UserState {
    return {
      A: 0.7,
      F: 0.1,
      C: { mem: 0.5, speed: 0.5, stability: 0.5 },
      M: 0,
      T: 'flat',
      conf: 0.5,
      ts: Date.now()
    };
  }

  /**
   * 获取时间分桶
   * 简单分桶: 早(0)/午(1)/晚(2)
   */
  getTimeBucket(timestamp: number): number {
    const hour = new Date(timestamp).getHours();
    if (hour < 12) return 0;
    if (hour < 18) return 1;
    return 2;
  }
}
