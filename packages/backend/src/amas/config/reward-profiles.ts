/**
 * Reward Profile Configuration
 *
 * 定义不同学习模式的奖励函数权重配置
 */

export interface RewardProfile {
  profileId: 'standard' | 'cram' | 'relaxed';
  name: string;
  description: string;
  weights: {
    correct: number;      // 正确性权重
    fatigue: number;      // 疲劳惩罚
    speed: number;        // 速度奖励
    frustration: number;  // 挫折惩罚
    engagement: number;   // 参与度奖励
  };
}

/**
 * 预定义的学习模式配置
 */
export const REWARD_PROFILES: Record<string, RewardProfile> = {
  standard: {
    profileId: 'standard',
    name: '标准模式',
    description: '平衡长期记忆和学习体验',
    weights: {
      correct: 1.0,
      fatigue: 0.6,
      speed: 0.4,
      frustration: 0.8,
      engagement: 0.3
    }
  },
  cram: {
    profileId: 'cram',
    name: '突击模式',
    description: '最大化短期记忆，适合考前冲刺',
    weights: {
      correct: 1.5,      // 更重视正确性
      fatigue: 0.3,      // 降低疲劳惩罚
      speed: 0.6,        // 鼓励快速作答
      frustration: 0.5,  // 容忍挫折
      engagement: 0.1    // 参与度次要
    }
  },
  relaxed: {
    profileId: 'relaxed',
    name: '轻松模式',
    description: '降低压力，保持学习动力',
    weights: {
      correct: 0.8,      // 降低正确性压力
      fatigue: 0.9,      // 高度重视疲劳
      speed: 0.2,        // 允许慢速学习
      frustration: 1.0,  // 最大化避免挫折
      engagement: 0.7    // 重视参与体验
    }
  }
};

/**
 * 获取奖励配置
 */
export function getRewardProfile(profileId?: string): RewardProfile {
  if (profileId && profileId in REWARD_PROFILES) {
    return REWARD_PROFILES[profileId];
  }
  return REWARD_PROFILES.standard;
}

/**
 * 验证profileId是否有效
 */
export function isValidProfileId(profileId: string): boolean {
  return profileId in REWARD_PROFILES;
}
