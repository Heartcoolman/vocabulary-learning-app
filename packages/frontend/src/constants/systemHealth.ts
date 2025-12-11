/**
 * 系统健康度配置常量
 * 统一管理系统健康度计算的阈值和扣分规则
 */

/**
 * 健康度阈值配置
 */
export const HEALTH_THRESHOLDS = {
  /** 用户活跃率阈值 */
  ACTIVE_RATE: {
    /** 低活跃率阈值（低于此值扣分较多） */
    LOW: 30,
    /** 中等活跃率阈值（低于此值扣分较少） */
    MEDIUM: 50,
  },

  /** 系统词库数量最低要求 */
  MIN_SYSTEM_WORDBOOKS: 3,

  /** 平均每词库单词数最低要求 */
  MIN_AVG_WORDS_PER_BOOK: 50,

  /** 平均每用户学习记录数最低要求 */
  MIN_AVG_RECORDS_PER_USER: 10,

  /** 最低用户数量要求 */
  MIN_USERS: 1,
} as const;

/**
 * 健康度扣分规则
 */
export const HEALTH_PENALTIES = {
  /** 低活跃率扣分 */
  LOW_ACTIVE_RATE: 20,

  /** 中等活跃率扣分 */
  MEDIUM_ACTIVE_RATE: 10,

  /** 词库数量不足扣分 */
  LOW_WORDBOOKS: 15,

  /** 单词数量不足扣分 */
  LOW_WORDS: 15,

  /** 学习记录不足扣分 */
  LOW_RECORDS: 10,

  /** 无用户扣分 */
  NO_USERS: 30,
} as const;

/**
 * 健康度状态判定阈值
 */
export const HEALTH_STATUS_THRESHOLDS = {
  /** 低于此分数为 error 状态 */
  ERROR: 60,

  /** 低于此分数为 warning 状态 */
  WARNING: 75,

  /** 低于此分数为 good 状态，高于等于为 excellent */
  GOOD: 90,
} as const;

/**
 * 数据显示配置
 */
export const DISPLAY_CONFIG = {
  /** 学习记录列表默认显示数量 */
  LEARNING_RECORDS_LIMIT: 50,
} as const;
