/**
 * AMAS 即时反馈机制
 * Immediate Reward Evaluator - T5.1
 *
 * 功能:
 * - 在答题瞬间提供即时的奖励/惩罚信号
 * - 结合速度、难度、遗忘曲线等多维度因素计算奖励值
 * - 生成鼓励性文案和解释性文本
 * - 为用户提供实时的学习反馈
 */

import { RawEvent, UserState } from '../types';
import { WordLearningState } from '@prisma/client';
import { IRewardEvaluator, RewardDetails } from '../interfaces';

/**
 * 扩展的原始事件（包含额外的答题信息）
 */
export interface ExtendedRawEvent extends RawEvent {
  /** 单词难度 [0,1] - 可选 */
  wordDifficulty?: number;
}

/**
 * 扩展的用户状态（包含统计信息）
 */
export interface ExtendedUserState extends UserState {
  /** 平均反应时间(ms) - 可选 */
  avgResponseTime?: number;
  /** 连续错误次数 - 可选 */
  consecutiveWrong?: number;
}

/**
 * 即时奖励结果
 */
export interface ImmediateReward {
  /** 奖励值 [-1, 1] */
  value: number;
  /** 鼓励文案 */
  encouragement: string;
  /** 解释性文本 */
  explanation: string;
  /** 奖励因子详情 */
  factors: {
    /** 基础奖励（正确+1，错误-1） */
    base: number;
    /** 速度奖励 [-0.3, 0.3] */
    speedBonus: number;
    /** 难度奖励 [-0.2, 0.2] */
    difficultyBonus: number;
    /** 遗忘曲线调整 [-0.2, 0.2] */
    forgettingDelta: number;
  };
  /** 时间戳 */
  timestamp: number;
}

/**
 * 即时奖励评估器
 *
 * 实现 IRewardEvaluator 接口，符合 AMAS 架构规范
 */
export class ImmediateRewardEvaluator implements IRewardEvaluator {
  /** 当前奖励配置文件ID */
  private rewardProfileId: string = 'standard';

  /**
   * 计算即时奖励（实现接口方法）
   *
   * @param event 原始事件
   * @param state 用户状态
   * @param previousState 先前的用户状态（可选）
   * @returns 奖励详情
   */
  computeImmediate(event: RawEvent, state: UserState, previousState?: UserState): RewardDetails {
    // 转换为扩展类型（保持向后兼容）
    const extendedEvent = event as ExtendedRawEvent;
    const extendedState = state as ExtendedUserState;

    // 获取单词学习状态（如果事件包含）
    const wordState = (event as any).wordState as WordLearningState | undefined;

    // 1. 基础奖励：正确 +1，错误 -1
    const base = event.isCorrect ? 1.0 : -1.0;

    // 2. 速度奖励：相对于用户平均反应时间
    const baseline = extendedState.avgResponseTime ?? 3000; // 默认基线 3秒
    const speedBonus = this.computeSpeedBonus(event.responseTime, baseline);

    // 3. 难度奖励：基于单词难度和用户认知能力
    const difficulty = extendedEvent.wordDifficulty ?? 0.5;
    const theta = state.C.mem; // 使用记忆力作为认知能力指标
    const difficultyBonus = this.computeDifficultyBonus(difficulty, theta);

    // 4. 遗忘曲线调整：基于个性化半衰期
    const halfLife = wordState?.halfLife ?? 1.0;
    const forgettingDelta = this.computeForgettingDelta(event.isCorrect, halfLife);

    // 5. 聚合奖励值（限制在 [-1, 1] 范围）
    const rawValue = base + speedBonus + difficultyBonus + forgettingDelta;
    const value = Math.max(-1.0, Math.min(1.0, rawValue));

    // 6. 生成鼓励文案
    const consecutiveWrong = extendedState.consecutiveWrong ?? 0;
    const encouragement = this.selectEncouragement(value, consecutiveWrong);

    // 7. 生成解释性文本
    const factors = {
      base,
      speedBonus,
      difficultyBonus,
      forgettingDelta,
    };
    const explanation = this.generateExplanation(factors);

    // 8. 返回符合 RewardDetails 接口的结果
    return {
      value,
      reason: encouragement,
      timestamp: Date.now(),
      breakdown: {
        correctness: base,
        speed: speedBonus,
        frustration: difficultyBonus,
        engagement: forgettingDelta,
      },
    };
  }

  /**
   * 设置奖励配置文件（实现接口方法）
   *
   * @param profileId 配置文件ID（如 'standard', 'cram', 'relaxed'）
   */
  setRewardProfile(profileId: string): void {
    this.rewardProfileId = profileId;
    // 未来可以根据不同的配置文件调整奖励计算的权重
  }

  /**
   * 计算即时奖励（保留原有方法签名以兼容现有代码）
   *
   * @param event 答题事件
   * @param state 用户状态
   * @param wordState 单词学习状态（可选）
   * @returns 即时奖励结果
   * @deprecated 使用新的 computeImmediate(event, state, previousState) 方法
   */
  computeImmediateLegacy(
    event: ExtendedRawEvent,
    state: ExtendedUserState,
    wordState?: WordLearningState,
  ): ImmediateReward {
    // 1. 基础奖励：正确 +1，错误 -1
    const base = event.isCorrect ? 1.0 : -1.0;

    // 2. 速度奖励：相对于用户平均反应时间
    const baseline = state.avgResponseTime ?? 3000; // 默认基线 3秒
    const speedBonus = this.computeSpeedBonus(event.responseTime, baseline);

    // 3. 难度奖励：基于单词难度和用户认知能力
    const difficulty = event.wordDifficulty ?? 0.5;
    const theta = state.C.mem; // 使用记忆力作为认知能力指标
    const difficultyBonus = this.computeDifficultyBonus(difficulty, theta);

    // 4. 遗忘曲线调整：基于个性化半衰期
    const halfLife = wordState?.halfLife ?? 1.0;
    const forgettingDelta = this.computeForgettingDelta(event.isCorrect, halfLife);

    // 5. 聚合奖励值（限制在 [-1, 1] 范围）
    const rawValue = base + speedBonus + difficultyBonus + forgettingDelta;
    const value = Math.max(-1.0, Math.min(1.0, rawValue));

    // 6. 生成鼓励文案
    const consecutiveWrong = state.consecutiveWrong ?? 0;
    const encouragement = this.selectEncouragement(value, consecutiveWrong);

    // 7. 生成解释性文本
    const factors = {
      base,
      speedBonus,
      difficultyBonus,
      forgettingDelta,
    };
    const explanation = this.generateExplanation(factors);

    return {
      value,
      encouragement,
      explanation,
      factors,
      timestamp: Date.now(),
    };
  }

  /**
   * 计算速度奖励
   *
   * @param actual 实际反应时间(ms)
   * @param baseline 基线反应时间(ms)
   * @returns 速度奖励 [-0.3, 0.3]
   */
  private computeSpeedBonus(actual: number, baseline: number): number {
    // 速度比例：实际时间 / 基线时间
    const ratio = actual / baseline;

    // 速度奖励计算逻辑：
    // - 非常快 (< 0.5倍): +0.3
    // - 快 (0.5 ~ 0.8倍): +0.2 ~ +0.3
    // - 正常 (0.8 ~ 1.2倍): 0 ~ +0.1
    // - 慢 (1.2 ~ 1.5倍): 0 ~ -0.2
    // - 非常慢 (> 1.5倍): -0.3

    if (ratio < 0.5) {
      return 0.3;
    } else if (ratio < 0.8) {
      return 0.2 + ((0.8 - ratio) / 0.3) * 0.1;
    } else if (ratio < 1.2) {
      return ((1.2 - ratio) / 0.4) * 0.1;
    } else if (ratio < 1.5) {
      return (-(ratio - 1.2) / 0.3) * 0.2;
    } else {
      return -0.3;
    }
  }

  /**
   * 计算难度奖励
   *
   * @param difficulty 单词难度 [0,1]
   * @param theta 用户认知能力 [0,1]
   * @returns 难度奖励 [-0.2, 0.2]
   */
  private computeDifficultyBonus(difficulty: number, theta: number): number {
    // IRT (Item Response Theory) 理论启发：
    // - 当难度 ≈ 能力时，学习效果最佳
    // - 难度远高于能力：挫败感（负奖励）
    // - 难度远低于能力：无聊感（负奖励）

    const match = 1 - Math.abs(difficulty - theta);

    // 匹配度越高，奖励越高
    // match = 1.0 -> bonus = +0.2
    // match = 0.5 -> bonus = 0.0
    // match = 0.0 -> bonus = -0.2
    return (match - 0.5) * 0.4;
  }

  /**
   * 计算遗忘曲线调整
   *
   * @param isCorrect 是否正确
   * @param halfLife 个性化半衰期（天）
   * @returns 遗忘曲线调整 [-0.2, 0.2]
   */
  private computeForgettingDelta(isCorrect: boolean, halfLife: number): number {
    // 遗忘曲线调整逻辑：
    // - 半衰期短（容易遗忘）：答对奖励更高，答错惩罚稍轻
    // - 半衰期长（不易遗忘）：答对奖励正常，答错惩罚更重

    // 归一化半衰期到 [0,1] 范围
    const MIN_HALF_LIFE = 0.1;
    const MAX_HALF_LIFE = 90.0;
    const normalizedHalfLife =
      Math.log(halfLife / MIN_HALF_LIFE) / Math.log(MAX_HALF_LIFE / MIN_HALF_LIFE);

    if (isCorrect) {
      // 答对：半衰期短 -> 更高奖励
      // normalizedHalfLife = 0.0 -> +0.2
      // normalizedHalfLife = 0.5 -> +0.1
      // normalizedHalfLife = 1.0 -> 0.0
      return (1 - normalizedHalfLife) * 0.2;
    } else {
      // 答错：半衰期长 -> 更重惩罚
      // normalizedHalfLife = 0.0 -> 0.0
      // normalizedHalfLife = 0.5 -> -0.1
      // normalizedHalfLife = 1.0 -> -0.2
      return -normalizedHalfLife * 0.2;
    }
  }

  /**
   * 选择鼓励文案
   *
   * @param reward 奖励值 [-1, 1]
   * @param consecutiveWrong 连续错误次数
   * @returns 鼓励文案
   */
  private selectEncouragement(reward: number, consecutiveWrong: number): string {
    // 对连续答错的用户提供额外鼓励
    if (consecutiveWrong >= 3 && reward > 0) {
      return '太棒了！终于答对了，坚持就是胜利！';
    }

    if (reward > 0.8) {
      return '完美！速度快且准确，继续保持！';
    } else if (reward > 0.5) {
      return '很好！回答正确，再接再厉！';
    } else if (reward > 0.2) {
      return '不错！继续努力，你会越来越熟练！';
    } else if (reward > -0.2) {
      return '答错了，但不要气馁，再试一次！';
    } else if (reward > -0.5) {
      return '这个单词有点难，没关系，多练几次就好了。';
    } else {
      return '慢慢来，学习需要耐心，你一定能掌握的！';
    }
  }

  /**
   * 生成解释性文本
   *
   * @param factors 奖励因子
   * @returns 解释性文本
   */
  private generateExplanation(factors: {
    base: number;
    speedBonus: number;
    difficultyBonus: number;
    forgettingDelta: number;
  }): string {
    const parts: string[] = [];

    // 基础反馈
    if (factors.base > 0) {
      parts.push('回答正确');
    } else {
      parts.push('回答错误');
    }

    // 速度反馈
    if (factors.speedBonus > 0.1) {
      parts.push('反应速度很快');
    } else if (factors.speedBonus < -0.1) {
      parts.push('反应稍慢');
    }

    // 难度反馈
    if (factors.difficultyBonus > 0.1) {
      parts.push('难度匹配你的水平');
    } else if (factors.difficultyBonus < -0.1) {
      parts.push('难度与水平略有偏差');
    }

    // 遗忘曲线反馈
    if (factors.forgettingDelta > 0.1) {
      parts.push('这个单词易遗忘，答对很棒');
    } else if (factors.forgettingDelta < -0.1) {
      parts.push('这个单词记得较牢，需要巩固');
    }

    // 拼接文本
    if (parts.length === 1) {
      return parts[0];
    } else {
      return parts.join('，') + '。';
    }
  }
}

/**
 * 导出单例实例（可选）
 */
export const immediateRewardEvaluator = new ImmediateRewardEvaluator();
