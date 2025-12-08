/**
 * React Query 缓存策略配置
 *
 * 统一管理所有查询的缓存时间配置，便于维护和调整
 *
 * 配置原则：
 * - 频繁变化的数据（如学习状态、进度）使用较短的 staleTime
 * - 相对稳定的数据（如用户信息、配置）使用较长的 staleTime
 * - 管理后台数据可以使用中等的缓存时间
 */

/**
 * 缓存时间常量（毫秒）
 */
export const CACHE_TIME = {
  /** 30秒 - 实时性要求高的数据 */
  REALTIME: 30 * 1000,

  /** 1分钟 - 频繁变化的数据 */
  SHORT: 60 * 1000,

  /** 2分钟 - 较频繁变化的数据 */
  MEDIUM_SHORT: 2 * 60 * 1000,

  /** 5分钟 - 一般数据 */
  MEDIUM: 5 * 60 * 1000,

  /** 10分钟 - 相对稳定的数据 */
  LONG: 10 * 60 * 1000,

  /** 30分钟 - 很少变化的数据 */
  VERY_LONG: 30 * 60 * 1000,

  /** 1小时 - 几乎不变的数据 */
  STATIC: 60 * 60 * 1000,
} as const;

/**
 * 垃圾回收时间常量（毫秒）
 * 通常比 staleTime 长，防止频繁重新请求
 */
export const GC_TIME = {
  /** 5分钟 */
  SHORT: 5 * 60 * 1000,

  /** 10分钟 */
  MEDIUM: 10 * 60 * 1000,

  /** 15分钟 */
  LONG: 15 * 60 * 1000,

  /** 30分钟 */
  VERY_LONG: 30 * 60 * 1000,

  /** 1小时 */
  STATIC: 60 * 60 * 1000,
} as const;

/**
 * 查询配置预设
 * 根据不同场景提供预配置的查询选项
 */
export const QUERY_PRESETS = {
  /**
   * 实时数据 - AMAS状态、学习进度等
   */
  realtime: {
    staleTime: CACHE_TIME.REALTIME,
    gcTime: GC_TIME.SHORT,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    retry: 2,
  },

  /**
   * 频繁更新 - 单词列表、学习记录等
   */
  frequent: {
    staleTime: CACHE_TIME.SHORT,
    gcTime: GC_TIME.MEDIUM,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    retry: 1,
  },

  /**
   * 一般数据 - 统计数据、已学单词等
   */
  standard: {
    staleTime: CACHE_TIME.MEDIUM,
    gcTime: GC_TIME.LONG,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: 1,
  },

  /**
   * 稳定数据 - 用户信息、词书列表等
   */
  stable: {
    staleTime: CACHE_TIME.LONG,
    gcTime: GC_TIME.VERY_LONG,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  },

  /**
   * 静态数据 - 配置、系统数据等
   */
  static: {
    staleTime: CACHE_TIME.VERY_LONG,
    gcTime: GC_TIME.STATIC,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  },

  /**
   * 管理后台数据 - 可以容忍较旧的数据
   */
  admin: {
    staleTime: CACHE_TIME.MEDIUM,
    gcTime: GC_TIME.LONG,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    retry: 2,
  },
} as const;

/**
 * 特定数据类型的缓存配置
 */
export const DATA_CACHE_CONFIG = {
  /** 用户信息 - 相对稳定 */
  user: QUERY_PRESETS.stable,

  /** 用户统计 - 需要定期刷新 */
  userStatistics: QUERY_PRESETS.standard,

  /** 单词列表 - 频繁访问 */
  words: QUERY_PRESETS.standard,

  /** 已学单词 - 频繁更新 */
  learnedWords: QUERY_PRESETS.frequent,

  /** 词书列表 - 相对稳定 */
  wordBooks: QUERY_PRESETS.stable,

  /** 学习配置 - 稳定 */
  studyConfig: QUERY_PRESETS.static,

  /** 学习进度 - 实时 */
  studyProgress: QUERY_PRESETS.realtime,

  /** AMAS状态 - 实时 */
  amasState: QUERY_PRESETS.realtime,

  /** 徽章 - 稳定 */
  badges: QUERY_PRESETS.stable,

  /** 管理后台 - 管理模式 */
  admin: QUERY_PRESETS.admin,
} as const;

/**
 * 自动刷新间隔配置
 */
export const REFETCH_INTERVALS = {
  /** 不自动刷新 */
  DISABLED: false,

  /** 30秒 - 实时数据 */
  REALTIME: 30 * 1000,

  /** 1分钟 - 频繁更新 */
  FREQUENT: 60 * 1000,

  /** 5分钟 - 一般数据 */
  STANDARD: 5 * 60 * 1000,
} as const;
