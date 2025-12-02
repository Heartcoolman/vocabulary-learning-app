/**
 * New User Initializer (新用户初始化器)
 *
 * 使用全局统计优化新用户的初始策略
 */

import { globalStatsService } from './global-stats';
import { StrategyParams, ColdStartPhase } from '../types';
import { CLASSIFY_PHASE_THRESHOLD, EXPLORE_PHASE_THRESHOLD } from '../config/action-space';

export interface NewUserConfig {
  /** 初始策略 */
  initialStrategy: StrategyParams;
  /** 各阶段交互次数阈值 */
  phaseThresholds: {
    classify: number;
    explore: number;
  };
  /** 基线性能（用于对比） */
  baselinePerformance: number;
}

export class NewUserInitializer {
  /**
   * 为新用户生成优化的初始配置
   */
  async initializeNewUser(userId: string): Promise<NewUserConfig> {
    // 获取全局统计
    const stats = await globalStatsService.computeGlobalStats();

    // 使用全局统计推荐的起始策略
    const initialStrategy = stats.recommendedStartStrategy;

    // 激进的Phase阈值（加快适应）
    const phaseThresholds = {
      classify: 5,   // 从15降至5（原CLASSIFY_PHASE_THRESHOLD=15）
      explore: 10    // 从20降至10（原EXPLORE_PHASE_THRESHOLD=20）
    };

    return {
      initialStrategy,
      phaseThresholds,
      baselinePerformance: stats.initialAccuracy
    };
  }

  /**
   * 判断是否应该提前转换Phase
   *
   * 如果用户表现优于基线，可以加速Phase转换
   */
  shouldAccelerateTransition(
    currentPhase: ColdStartPhase,
    interactionCount: number,
    recentAccuracy: number,
    baselineAccuracy: number
  ): boolean {
    if (currentPhase === 'classify') {
      // classify阶段：至少5次交互，且准确率>70%或显著优于基线
      return interactionCount >= 5 && (recentAccuracy > 0.7 || recentAccuracy > baselineAccuracy + 0.15);
    }

    if (currentPhase === 'explore') {
      // explore阶段：至少10次交互，且准确率>80%或显著优于基线
      return interactionCount >= 10 && (recentAccuracy > 0.8 || recentAccuracy > baselineAccuracy + 0.2);
    }

    return false;
  }

  /**
   * 获取推荐的Phase时长
   */
  getRecommendedPhaseDuration(userAccuracy: number, globalAccuracy: number): {
    classify: number;
    explore: number;
  } {
    // 如果用户表现优于全局，缩短Phase时长
    if (userAccuracy > globalAccuracy + 0.1) {
      return {
        classify: 5,
        explore: 8
      };
    } else if (userAccuracy > globalAccuracy) {
      return {
        classify: 5,
        explore: 10
      };
    } else {
      // 表现低于全局，使用更长的观察期
      return {
        classify: 8,
        explore: 12
      };
    }
  }
}

// 单例导出
export const newUserInitializer = new NewUserInitializer();
