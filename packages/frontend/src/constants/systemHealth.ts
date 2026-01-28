/**
 * 系统健康度配置常量
 * 统一管理系统健康度计算的阈值和扣分规则
 */

/**
 * 健康度阈值配置
 */
export const HEALTH_THRESHOLDS = {
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

/**
 * 系统运行健康度阈值配置
 */
export const RUNTIME_HEALTH_THRESHOLDS = {
  /** 数据库延迟阈值 (ms) */
  DB_LATENCY_WARNING: 200,
  DB_LATENCY_ERROR: 500,

  /** 内存使用阈值 (MB) */
  MEMORY_WARNING: 512,
  MEMORY_ERROR: 1024,

  /** API 响应延迟阈值 (ms) */
  API_LATENCY_WARNING: 200,
  API_LATENCY_ERROR: 500,

  /** 5xx 错误率阈值 (%) */
  ERROR_RATE_WARNING: 1,
  ERROR_RATE_ERROR: 5,
} as const;

/**
 * 系统运行健康度扣分规则
 */
export const RUNTIME_HEALTH_PENALTIES = {
  /** 数据库断开 */
  DB_DISCONNECTED: 40,
  /** 数据库超时 */
  DB_TIMEOUT: 20,
  /** 数据库延迟高 */
  DB_LATENCY_HIGH: 15,
  DB_LATENCY_MEDIUM: 10,

  /** 内存使用率高 */
  MEMORY_HIGH: 20,
  MEMORY_MEDIUM: 10,

  /** API 延迟高 */
  API_LATENCY_HIGH: 15,
  API_LATENCY_MEDIUM: 10,

  /** 错误率高 */
  ERROR_RATE_HIGH: 20,
  ERROR_RATE_MEDIUM: 10,
} as const;

/**
 * 合并健康度权重配置
 */
export const COMBINED_HEALTH_WEIGHTS = {
  /** 业务数据健康度权重 */
  BUSINESS: 0.5,
  /** 系统运行健康度权重 */
  RUNTIME: 0.5,
} as const;
