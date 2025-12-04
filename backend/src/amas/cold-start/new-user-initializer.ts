/**
 * New User Initializer (新用户初始化器)
 *
 * 使用全局统计优化新用户的初始策略
 * 支持回归用户状态继承（根据离线时间决定状态处理策略）
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

/**
 * 回归用户状态快照
 */
export interface UserStateSnapshot {
  /** 注意力水平 [0, 1] */
  attention: number;
  /** 疲劳度 [0, 1] */
  fatigue: number;
  /** 动机水平 [-1, 1] */
  motivation: number;
  /** 认知能力配置 */
  cognitiveProfile: {
    mem: number;
    speed: number;
    stability: number;
  };
  /** 上次活跃时间戳 */
  lastActiveAt: number;
  /** 冷启动阶段 */
  coldStartPhase: ColdStartPhase;
  /** 历史学习总时长（分钟） */
  totalLearningMinutes?: number;
}

/**
 * 回归用户继承配置
 */
export interface ReturningUserConfig {
  /** 是否需要重新冷启动 */
  needsReColdStart: boolean;
  /** 继承的状态（经过衰减处理） */
  inheritedState: Partial<UserStateSnapshot>;
  /** 推荐的恢复策略 */
  recoveryStrategy: StrategyParams;
  /** 离线时长（天） */
  offlineDays: number;
  /** 状态衰减因子 */
  decayFactor: number;
}

/** 离线阈值配置（天） */
const OFFLINE_THRESHOLDS = {
  /** 短期离线：直接继续 */
  SHORT: 1,
  /** 中期离线：应用衰减后继续 */
  MEDIUM: 30,
  /** 长期离线：重新初始化 */
  LONG: 90
};

/** 状态衰减参数 */
const DECAY_CONFIG = {
  /** 注意力衰减半衰期（天） */
  attentionHalfLife: 7,
  /** 动机衰减半衰期（天） */
  motivationHalfLife: 14,
  /** 认知能力衰减半衰期（天） */
  cognitiveHalfLife: 30,
  /** 最小保留因子（防止完全遗忘） */
  minRetention: 0.3
};

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

  // ==================== 回归用户处理 ====================

  /**
   * 处理回归用户
   *
   * 根据离线时长决定状态继承策略：
   * - 间隔<1天：直接继续，不做任何处理
   * - 间隔1-30天：应用指数衰减后继续
   * - 间隔30-90天：部分重置，保留认知能力
   * - 间隔>90天：完全重新初始化
   */
  async handleReturningUser(
    userId: string,
    lastState: UserStateSnapshot
  ): Promise<ReturningUserConfig> {
    const now = Date.now();
    const offlineMs = now - lastState.lastActiveAt;
    const offlineDays = offlineMs / (1000 * 60 * 60 * 24);

    // 短期离线：直接继续
    if (offlineDays < OFFLINE_THRESHOLDS.SHORT) {
      return {
        needsReColdStart: false,
        inheritedState: lastState,
        recoveryStrategy: this.buildRecoveryStrategy(lastState, 1.0),
        offlineDays,
        decayFactor: 1.0
      };
    }

    // 长期离线：重新初始化
    if (offlineDays > OFFLINE_THRESHOLDS.LONG) {
      const stats = await globalStatsService.computeGlobalStats();
      return {
        needsReColdStart: true,
        inheritedState: {
          // 只保留认知能力的部分记忆
          cognitiveProfile: this.decayCognitiveProfile(
            lastState.cognitiveProfile,
            offlineDays,
            0.5  // 长期离线只保留50%
          )
        },
        recoveryStrategy: stats.recommendedStartStrategy,
        offlineDays,
        decayFactor: 0
      };
    }

    // 中期离线：应用衰减
    const decayFactor = this.computeOverallDecayFactor(offlineDays);
    const inheritedState = this.applyStateDecay(lastState, offlineDays);

    // 超过中期阈值需要部分重置
    const needsReColdStart = offlineDays > OFFLINE_THRESHOLDS.MEDIUM ||
      lastState.coldStartPhase !== 'normal';

    return {
      needsReColdStart,
      inheritedState,
      recoveryStrategy: this.buildRecoveryStrategy(inheritedState as UserStateSnapshot, decayFactor),
      offlineDays,
      decayFactor
    };
  }

  /**
   * 计算综合衰减因子
   */
  private computeOverallDecayFactor(offlineDays: number): number {
    // 使用指数衰减，半衰期为14天
    const halfLife = 14;
    const decay = Math.exp(-Math.LN2 * offlineDays / halfLife);
    return Math.max(DECAY_CONFIG.minRetention, decay);
  }

  /**
   * 应用状态衰减
   */
  private applyStateDecay(
    state: UserStateSnapshot,
    offlineDays: number
  ): Partial<UserStateSnapshot> {
    // 注意力衰减（向中性值0.5收敛）
    const attentionDecay = this.computeDecayTowards(
      state.attention,
      0.5,
      offlineDays,
      DECAY_CONFIG.attentionHalfLife
    );

    // 动机衰减（向中性值0收敛）
    const motivationDecay = this.computeDecayTowards(
      state.motivation,
      0,
      offlineDays,
      DECAY_CONFIG.motivationHalfLife
    );

    // 疲劳重置（休息后疲劳应该恢复）
    const fatigueRecovery = Math.max(0, state.fatigue * Math.exp(-offlineDays / 2));

    // 认知能力衰减（向中性值0.5收敛，但保留更多）
    const cognitiveProfile = this.decayCognitiveProfile(
      state.cognitiveProfile,
      offlineDays,
      DECAY_CONFIG.minRetention
    );

    return {
      attention: attentionDecay,
      fatigue: fatigueRecovery,
      motivation: motivationDecay,
      cognitiveProfile,
      lastActiveAt: state.lastActiveAt,
      coldStartPhase: state.coldStartPhase,
      totalLearningMinutes: state.totalLearningMinutes
    };
  }

  /**
   * 计算向目标值衰减
   */
  private computeDecayTowards(
    currentValue: number,
    targetValue: number,
    offlineDays: number,
    halfLife: number
  ): number {
    const decay = Math.exp(-Math.LN2 * offlineDays / halfLife);
    const retainedValue = currentValue * decay;
    const targetContribution = targetValue * (1 - decay);
    return retainedValue + targetContribution;
  }

  /**
   * 衰减认知能力配置
   */
  private decayCognitiveProfile(
    profile: { mem: number; speed: number; stability: number },
    offlineDays: number,
    minRetention: number
  ): { mem: number; speed: number; stability: number } {
    const decay = Math.max(
      minRetention,
      Math.exp(-Math.LN2 * offlineDays / DECAY_CONFIG.cognitiveHalfLife)
    );

    // 向中性值0.5衰减
    const neutral = 0.5;
    return {
      mem: profile.mem * decay + neutral * (1 - decay),
      speed: profile.speed * decay + neutral * (1 - decay),
      stability: profile.stability * decay + neutral * (1 - decay)
    };
  }

  /**
   * 构建恢复策略
   *
   * 根据衰减后的状态选择合适的恢复策略
   */
  private buildRecoveryStrategy(
    state: Partial<UserStateSnapshot>,
    decayFactor: number
  ): StrategyParams {
    // 基础策略
    const baseStrategy: StrategyParams = {
      interval_scale: 1.0,
      new_ratio: 0.2,
      difficulty: 'mid',
      batch_size: 8,
      hint_level: 1
    };

    // 根据衰减程度调整
    if (decayFactor < 0.5) {
      // 衰减严重，使用保守策略
      return {
        interval_scale: 0.8,
        new_ratio: 0.15,
        difficulty: 'easy',
        batch_size: 6,
        hint_level: 2
      };
    }

    if (decayFactor < 0.8) {
      // 中等衰减，略微保守
      return {
        interval_scale: 0.9,
        new_ratio: 0.2,
        difficulty: 'easy',
        batch_size: 8,
        hint_level: 1
      };
    }

    // 衰减较小，根据认知能力调整
    const cogProfile = state.cognitiveProfile;
    if (cogProfile && cogProfile.mem > 0.6 && cogProfile.speed > 0.5) {
      // 能力较强，可以稍微激进
      return {
        interval_scale: 1.0,
        new_ratio: 0.25,
        difficulty: 'mid',
        batch_size: 10,
        hint_level: 1
      };
    }

    return baseStrategy;
  }

  /**
   * 检查用户是否需要重新热身
   *
   * 即使不需要完全重新冷启动，长期离线用户也可能需要热身期
   */
  needsWarmup(offlineDays: number, lastColdStartPhase: ColdStartPhase): boolean {
    // 7天以上离线需要热身
    if (offlineDays >= 7) {
      return true;
    }

    // 3天以上且之前没有完成冷启动
    if (offlineDays >= 3 && lastColdStartPhase !== 'normal') {
      return true;
    }

    return false;
  }

  /**
   * 获取热身期配置
   */
  getWarmupConfig(offlineDays: number): {
    warmupQuestions: number;
    startDifficulty: 'easy' | 'mid';
  } {
    if (offlineDays >= 30) {
      return { warmupQuestions: 5, startDifficulty: 'easy' };
    }
    if (offlineDays >= 14) {
      return { warmupQuestions: 3, startDifficulty: 'easy' };
    }
    return { warmupQuestions: 2, startDifficulty: 'mid' };
  }
}

// 单例导出
export const newUserInitializer = new NewUserInitializer();
