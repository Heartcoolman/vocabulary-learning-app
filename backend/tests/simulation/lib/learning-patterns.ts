/**
 * 学习模式定义
 * 模拟不同类型的用户学习行为
 */

/** 响应时间范围配置 */
export interface TimeRange {
  min: number;
  max: number;
}

/** 基础学习模式配置 */
export interface BaseLearningPattern {
  /** 模式名称 */
  name: string;
  /** 模式描述 */
  description: string;
  /** 单次会话学习数量 */
  sessionLength: number;
}

/** 高效学习模式 - 高正确率、快速响应 */
export interface EfficientPattern extends BaseLearningPattern {
  type: 'efficient';
  /** 正确率 (0-1) */
  correctRate: number;
  /** 响应时间范围 (ms) */
  responseTime: TimeRange;
  /** 停留时间范围 (ms) */
  dwellTime: TimeRange;
}

/** 普通学习模式 - 中等表现 */
export interface NormalPattern extends BaseLearningPattern {
  type: 'normal';
  /** 正确率 (0-1) */
  correctRate: number;
  /** 响应时间范围 (ms) */
  responseTime: TimeRange;
  /** 停留时间范围 (ms) */
  dwellTime: TimeRange;
}

/** 疲劳学习模式 - 表现逐渐变差 */
export interface FatiguingPattern extends BaseLearningPattern {
  type: 'fatiguing';
  /** 初始正确率 (0-1) */
  initialCorrectRate: number;
  /** 最终正确率 (0-1) */
  finalCorrectRate: number;
  /** 初始响应时间范围 (ms) */
  initialResponseTime: TimeRange;
  /** 响应时间增长因子 (每次答题后乘以此值) */
  responseTimeGrowth: number;
  /** 初始停留时间范围 (ms) */
  initialDwellTime: TimeRange;
}

/** 间歇学习模式 - 有休息间隔 */
export interface IntermittentPattern extends BaseLearningPattern {
  type: 'intermittent';
  /** 正确率 (0-1) */
  correctRate: number;
  /** 响应时间范围 (ms) */
  responseTime: TimeRange;
  /** 停留时间范围 (ms) */
  dwellTime: TimeRange;
  /** 休息间隔（每N题休息一次） */
  breakInterval: number;
  /** 休息时长 (ms) */
  breakDuration: number;
}

/** 所有学习模式的联合类型 */
export type LearningPattern =
  | EfficientPattern
  | NormalPattern
  | FatiguingPattern
  | IntermittentPattern;

/** 学习模式类型标识 */
export type PatternType = LearningPattern['type'];

/**
 * 预定义学习模式配置
 */
export const LearningPatterns: Record<PatternType, LearningPattern> = {
  /** 高效学习者：高正确率、快速响应 */
  efficient: {
    type: 'efficient',
    name: '高效学习',
    description: '模拟专注度高、记忆力强的学习者',
    correctRate: 0.85,
    responseTime: { min: 1500, max: 3000 },
    dwellTime: { min: 2000, max: 4000 },
    sessionLength: 30,
  },

  /** 普通学习者：中等表现 */
  normal: {
    type: 'normal',
    name: '普通学习',
    description: '模拟一般用户的学习行为',
    correctRate: 0.65,
    responseTime: { min: 2500, max: 5000 },
    dwellTime: { min: 3000, max: 6000 },
    sessionLength: 20,
  },

  /** 疲劳学习者：逐渐变差的表现 */
  fatiguing: {
    type: 'fatiguing',
    name: '疲劳学习',
    description: '模拟长时间学习后疲劳状态',
    initialCorrectRate: 0.8,
    finalCorrectRate: 0.3,
    initialResponseTime: { min: 2000, max: 3500 },
    responseTimeGrowth: 1.08,
    initialDwellTime: { min: 2500, max: 4500 },
    sessionLength: 50,
  },

  /** 间歇学习者：有休息间隔 */
  intermittent: {
    type: 'intermittent',
    name: '间歇学习',
    description: '模拟有规律休息的学习者',
    correctRate: 0.75,
    responseTime: { min: 2000, max: 4000 },
    dwellTime: { min: 2500, max: 5000 },
    breakInterval: 15,
    breakDuration: 5000,
    sessionLength: 25,
  },
};

/**
 * 根据模式类型获取配置
 */
export function getPattern(type: PatternType): LearningPattern {
  return LearningPatterns[type];
}

/**
 * 获取所有可用的模式类型
 */
export function getPatternTypes(): PatternType[] {
  return Object.keys(LearningPatterns) as PatternType[];
}
