/**
 * AMAS Action Space Configuration
 * 动作空间配置和超参数定义
 */

import {
  Action,
  StrategyParams,
  AttentionWeights,
  FatigueParams,
  MotivationParams,
  PerceptionConfig
} from '../types';

// ==================== 安全阈值 ====================

/** 低注意力阈值 */
export const MIN_ATTENTION = 0.3;
/** 中等注意力阈值 */
export const MID_ATTENTION = 0.5;
/** 高疲劳阈值 */
export const HIGH_FATIGUE = 0.6;
/** 极高疲劳阈值(强制休息) */
export const CRITICAL_FATIGUE = 0.8;
/** 低动机阈值 */
export const LOW_MOTIVATION = -0.3;
/** 极低动机阈值 */
export const CRITICAL_MOTIVATION = -0.5;
/** 高动机阈值 */
export const HIGH_MOTIVATION = 0.5;

// ==================== LinUCB超参数 ====================

/** UCB探索系数 */
export const DEFAULT_ALPHA = 1.0;
/** 正则化系数 */
export const DEFAULT_LAMBDA = 1.0;
/** 特征维度 v2: 22 (状态5 + 错误1 + 动作5 + 交互1 + 时间3 + 处理键6 + bias1) */
export const DEFAULT_DIMENSION = 22;
/** Cholesky重分解周期 */
export const CHOLESKY_RECOMPUTE_INTERVAL = 200;

/** 特征版本: v1=MVP(d=12), v2=扩展版(d=22) */
export const FEATURE_VERSION = 2;

// ==================== 冷启动阈值 ====================

/** 分类阶段交互次数（优化后：3个探测即可分类） */
export const CLASSIFY_PHASE_THRESHOLD = 5;
/** 探索阶段交互次数（优化后：3次classify + 5次explore = 8次后进入normal） */
export const EXPLORE_PHASE_THRESHOLD = 8;
/** 分类触发交互次数 */
export const CLASSIFY_TRIGGER = 3;

/** 贝叶斯早停配置 */
export const EARLY_STOP_CONFIG = {
  /** 置信度阈值：后验概率超过此值时提前结束分类 */
  confidenceThreshold: 0.85,
  /** 最少探测次数：至少完成这么多探测才能早停 */
  minProbes: 2,
  /** 强证据倍数：单次探测结果与预期偏差超过此倍数时增加权重 */
  strongEvidenceMultiplier: 1.5
};

// ==================== 模型参数 ====================

/** 注意力模型默认权重 (正值，配合 sigmoid(-weightedSum) 使用) */
export const DEFAULT_ATTENTION_WEIGHTS: AttentionWeights = {
  rt_mean: 0.25,
  rt_cv: 0.35,
  pace_cv: 0.2,
  pause: 0.15,
  switch: 0.2,
  drift: 0.15,
  interaction: -0.3,  // 交互密度高 → 注意力高，所以保持负数
  focus_loss: 0.5     // 最高权重，失焦是最强的注意力下降信号
};

/** 注意力模型平滑系数 */
export const ATTENTION_SMOOTHING = 0.8;

/** 疲劳模型默认参数 */
export const DEFAULT_FATIGUE_PARAMS: FatigueParams = {
  beta: 0.3,
  gamma: 0.25,
  delta: 0.2,
  k: 0.08,
  longBreakThreshold: 30
};

/** 动机模型默认参数 */
export const DEFAULT_MOTIVATION_PARAMS: MotivationParams = {
  rho: 0.85,
  kappa: 0.3,
  lambda: 0.4,
  mu: 0.6
};

/** 认知能力EMA系数 */
export const COGNITIVE_LONG_TERM_BETA = 0.98;
/** 认知能力自适应融合系数k0 */
export const COGNITIVE_FUSION_K0 = 50;

// ==================== 默认策略 ====================

/** 默认策略参数 */
export const DEFAULT_STRATEGY: StrategyParams = {
  interval_scale: 1.0,
  new_ratio: 0.2,
  difficulty: 'mid',
  batch_size: 8,
  hint_level: 1
};

/** 冷启动安全策略 */
export const COLD_START_STRATEGY: StrategyParams = {
  interval_scale: 1.0,
  new_ratio: 0.15,
  difficulty: 'easy',
  batch_size: 8,
  hint_level: 1
};

// ==================== 动作空间 ====================

/**
 * 预定义动作空间 (24个组合)
 * 覆盖不同的探索/难度/批量/提示组合
 */
export const ACTION_SPACE: Action[] = [
  // 保守策略 (低注意力/低动机/高疲劳)
  { interval_scale: 0.5, new_ratio: 0.1, difficulty: 'easy', batch_size: 5, hint_level: 2 },
  { interval_scale: 0.5, new_ratio: 0.2, difficulty: 'easy', batch_size: 5, hint_level: 1 },
  { interval_scale: 0.8, new_ratio: 0.1, difficulty: 'easy', batch_size: 5, hint_level: 2 },
  { interval_scale: 0.8, new_ratio: 0.2, difficulty: 'easy', batch_size: 5, hint_level: 1 },

  // 标准策略 (正常状态)
  { interval_scale: 1.0, new_ratio: 0.1, difficulty: 'easy', batch_size: 8, hint_level: 2 },
  { interval_scale: 1.0, new_ratio: 0.2, difficulty: 'easy', batch_size: 8, hint_level: 1 },
  { interval_scale: 1.0, new_ratio: 0.2, difficulty: 'mid', batch_size: 8, hint_level: 1 },
  { interval_scale: 1.0, new_ratio: 0.3, difficulty: 'mid', batch_size: 8, hint_level: 1 },
  { interval_scale: 1.0, new_ratio: 0.3, difficulty: 'mid', batch_size: 12, hint_level: 0 },
  { interval_scale: 1.0, new_ratio: 0.4, difficulty: 'mid', batch_size: 12, hint_level: 0 },

  // 中等挑战策略
  { interval_scale: 1.2, new_ratio: 0.1, difficulty: 'easy', batch_size: 12, hint_level: 2 },
  { interval_scale: 1.2, new_ratio: 0.2, difficulty: 'mid', batch_size: 12, hint_level: 1 },
  { interval_scale: 1.2, new_ratio: 0.3, difficulty: 'mid', batch_size: 12, hint_level: 0 },
  { interval_scale: 1.2, new_ratio: 0.4, difficulty: 'hard', batch_size: 12, hint_level: 0 },

  // 高挑战策略 (高能力/高动机)
  { interval_scale: 1.5, new_ratio: 0.1, difficulty: 'easy', batch_size: 16, hint_level: 2 },
  { interval_scale: 1.5, new_ratio: 0.2, difficulty: 'mid', batch_size: 16, hint_level: 1 },
  { interval_scale: 1.5, new_ratio: 0.3, difficulty: 'mid', batch_size: 16, hint_level: 0 },
  { interval_scale: 1.5, new_ratio: 0.4, difficulty: 'hard', batch_size: 16, hint_level: 0 },

  // 困难模式变体
  { interval_scale: 0.8, new_ratio: 0.2, difficulty: 'hard', batch_size: 5, hint_level: 1 },
  { interval_scale: 1.0, new_ratio: 0.2, difficulty: 'hard', batch_size: 8, hint_level: 0 },
  { interval_scale: 1.0, new_ratio: 0.3, difficulty: 'hard', batch_size: 5, hint_level: 0 },
  { interval_scale: 1.0, new_ratio: 0.3, difficulty: 'hard', batch_size: 12, hint_level: 0 },

  // 特殊组合
  { interval_scale: 0.5, new_ratio: 0.3, difficulty: 'mid', batch_size: 8, hint_level: 1 },
  { interval_scale: 0.5, new_ratio: 0.2, difficulty: 'mid', batch_size: 12, hint_level: 1 }
];

// ==================== 感知层配置 ====================

/** 默认感知层配置 */
export const DEFAULT_PERCEPTION_CONFIG: PerceptionConfig = {
  rt: { mean: 3200, std: 800 },
  pause: { mean: 0.3, std: 0.6 },
  focusLoss: { mean: 3000, std: 2500 },
  switches: { mean: 0.2, std: 0.5 },
  dwell: { mean: 1800, std: 600 },
  interactionDensity: { mean: 2.0, std: 1.2 },
  maxResponseTime: 120000,
  maxPauseCount: 20,
  maxSwitchCount: 20,
  maxFocusLoss: 600000
};

// ==================== 奖励权重 ====================

/** 奖励函数权重 */
export const REWARD_WEIGHTS = {
  /** 正确性权重 */
  correct: 1.0,
  /** 疲劳惩罚权重 */
  fatigue: 0.6,
  /** 速度奖励权重 */
  speed: 0.4,
  /** 挫折惩罚权重 */
  frustration: 0.8,
  /** 参与度奖励权重 */
  engagement: 0.3
};

/** 参考反应时间(ms) */
export const REFERENCE_RESPONSE_TIME = 5000;

// ==================== 策略平滑参数 ====================

/** 策略变化平滑系数 */
export const STRATEGY_SMOOTHING = 0.5;

// ==================== 辅助函数 ====================

/**
 * 获取动作索引
 */
export function getActionIndex(action: Action): number {
  return ACTION_SPACE.findIndex(
    a =>
      a.interval_scale === action.interval_scale &&
      a.new_ratio === action.new_ratio &&
      a.difficulty === action.difficulty &&
      a.batch_size === action.batch_size &&
      a.hint_level === action.hint_level
  );
}

/**
 * 根据用户类型获取先验探索率
 */
export function getPriorAlpha(phase: 'classify' | 'explore' | 'normal', performanceGood: boolean): number {
  switch (phase) {
    case 'classify':
      return 0.5;
    case 'explore':
      return performanceGood ? 2.0 : 1.0;
    case 'normal':
      return 0.7;
    default:
      return DEFAULT_ALPHA;
  }
}
