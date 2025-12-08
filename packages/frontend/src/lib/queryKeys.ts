/**
 * React Query 查询键工厂函数
 *
 * 统一管理所有查询的 key，便于类型安全和维护
 * 使用工厂函数模式组织查询键，支持层级结构
 */

export const queryKeys = {
  /**
   * 认证相关查询
   */
  auth: {
    all: ['auth'] as const,
    currentUser: () => [...queryKeys.auth.all, 'currentUser'] as const,
    session: () => [...queryKeys.auth.all, 'session'] as const,
  },

  /**
   * 单词相关查询
   */
  words: {
    all: ['words'] as const,
    lists: () => [...queryKeys.words.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => [...queryKeys.words.lists(), filters] as const,
    details: () => [...queryKeys.words.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.words.details(), id] as const,
    search: (query: string) => [...queryKeys.words.all, 'search', query] as const,
    learned: () => [...queryKeys.words.all, 'learned'] as const,
  },

  /**
   * 单词本相关查询
   */
  wordbooks: {
    all: ['wordbooks'] as const,
    lists: () => [...queryKeys.wordbooks.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => [...queryKeys.wordbooks.lists(), filters] as const,
    details: () => [...queryKeys.wordbooks.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.wordbooks.details(), id] as const,
  },

  /**
   * 学习记录相关查询
   */
  learningRecords: {
    all: ['learningRecords'] as const,
    lists: () => [...queryKeys.learningRecords.all, 'list'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.learningRecords.lists(), filters] as const,
    statistics: () => [...queryKeys.learningRecords.all, 'statistics'] as const,
  },

  /**
   * 用户相关查询
   */
  user: {
    all: ['user'] as const,
    profile: () => [...queryKeys.user.all, 'profile'] as const,
    settings: () => [...queryKeys.user.all, 'settings'] as const,
    statistics: () => [...queryKeys.user.all, 'statistics'] as const,
  },

  /**
   * 统计数据相关查询
   */
  statistics: {
    all: ['statistics'] as const,
    overview: () => [...queryKeys.statistics.all, 'overview'] as const,
    daily: (date: string) => [...queryKeys.statistics.all, 'daily', date] as const,
    weekly: () => [...queryKeys.statistics.all, 'weekly'] as const,
    monthly: () => [...queryKeys.statistics.all, 'monthly'] as const,
  },

  /**
   * 同步相关查询
   */
  sync: {
    all: ['sync'] as const,
    status: () => [...queryKeys.sync.all, 'status'] as const,
    conflicts: () => [...queryKeys.sync.all, 'conflicts'] as const,
  },

  /**
   * 徽章相关查询
   */
  badges: {
    all: ['badges'] as const,
    lists: () => [...queryKeys.badges.all, 'list'] as const,
    userBadges: () => [...queryKeys.badges.all, 'user'] as const,
    allWithStatus: () => [...queryKeys.badges.all, 'allWithStatus'] as const,
    details: () => [...queryKeys.badges.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.badges.details(), id] as const,
    progress: (id: string) => [...queryKeys.badges.all, 'progress', id] as const,
  },

  /**
   * 成就相关查询
   */
  achievements: {
    all: ['achievements'] as const,
    check: () => [...queryKeys.achievements.all, 'check'] as const,
  },

  /**
   * AMAS相关查询
   */
  amas: {
    all: ['amas'] as const,
    state: () => [...queryKeys.amas.all, 'state'] as const,
    strategy: () => [...queryKeys.amas.all, 'strategy'] as const,
    phase: () => [...queryKeys.amas.all, 'phase'] as const,
    explanation: (decisionId?: string) =>
      decisionId
        ? ([...queryKeys.amas.all, 'explanation', decisionId] as const)
        : ([...queryKeys.amas.all, 'explanation', 'latest'] as const),
    learningCurve: (days: number) => [...queryKeys.amas.all, 'learningCurve', days] as const,
    decisionTimeline: (limit: number, cursor?: string) =>
      cursor
        ? ([...queryKeys.amas.all, 'decisionTimeline', limit, cursor] as const)
        : ([...queryKeys.amas.all, 'decisionTimeline', limit] as const),
  },

  /**
   * 学习进度相关查询
   */
  studyProgress: {
    all: ['studyProgress'] as const,
    current: () => [...queryKeys.studyProgress.all, 'current'] as const,
    todayWords: () => [...queryKeys.studyProgress.all, 'todayWords'] as const,
    masteryStats: () => [...queryKeys.studyProgress.all, 'masteryStats'] as const,
    masteryBatch: (wordIds: string[], userFatigue?: number) =>
      userFatigue !== undefined
        ? ([...queryKeys.studyProgress.all, 'masteryBatch', wordIds, userFatigue] as const)
        : ([...queryKeys.studyProgress.all, 'masteryBatch', wordIds] as const),
    masteryDetail: (wordId: string, userFatigue?: number) =>
      userFatigue !== undefined
        ? ([...queryKeys.studyProgress.all, 'masteryDetail', wordId, userFatigue] as const)
        : ([...queryKeys.studyProgress.all, 'masteryDetail', wordId] as const),
  },

  /**
   * 算法配置相关查询
   */
  algorithmConfig: {
    all: ['algorithmConfig'] as const,
    active: () => [...queryKeys.algorithmConfig.all, 'active'] as const,
    histories: () => [...queryKeys.algorithmConfig.all, 'history'] as const,
    history: (limit?: number) => [...queryKeys.algorithmConfig.histories(), { limit }] as const,
    presets: () => [...queryKeys.algorithmConfig.all, 'presets'] as const,
  },

  /**
   * 学习配置相关查询
   */
  studyConfig: {
    all: ['studyConfig'] as const,
    config: () => [...queryKeys.studyConfig.all, 'config'] as const,
    todayWords: () => [...queryKeys.studyConfig.all, 'todayWords'] as const,
    progress: () => [...queryKeys.studyConfig.all, 'progress'] as const,
  },

  /**
   * 管理后台相关查询
   */
  admin: {
    all: ['admin'] as const,

    // 用户管理
    users: {
      all: ['admin', 'users'] as const,
      lists: () => [...queryKeys.admin.users.all, 'list'] as const,
      list: (filters: Record<string, unknown>) =>
        [...queryKeys.admin.users.lists(), filters] as const,
      details: () => [...queryKeys.admin.users.all, 'detail'] as const,
      detail: (id: string) => [...queryKeys.admin.users.details(), id] as const,
    },

    // 用户统计数据
    userStatistics: {
      all: ['admin', 'statistics'] as const,
      details: () => [...queryKeys.admin.userStatistics.all, 'detail'] as const,
      detail: (userId: string) => [...queryKeys.admin.userStatistics.details(), userId] as const,
      batch: (userIds: string[]) =>
        [...queryKeys.admin.userStatistics.all, 'batch', userIds] as const,
    },

    // 用户单词数据
    userWords: {
      all: ['admin', 'userWords'] as const,
      lists: () => [...queryKeys.admin.userWords.all, 'list'] as const,
      list: (params: { userId: string; [key: string]: unknown }) =>
        [...queryKeys.admin.userWords.lists(), params] as const,
      details: () => [...queryKeys.admin.userWords.all, 'detail'] as const,
      detail: (userId: string, wordId: string) =>
        [...queryKeys.admin.userWords.details(), userId, wordId] as const,
    },

    // 用户学习数据
    userLearning: {
      all: ['admin', 'learning'] as const,
      data: (userId: string, limit: number) =>
        [...queryKeys.admin.userLearning.all, 'data', userId, limit] as const,
      heatmap: (userId: string, startDate: string, endDate: string) =>
        [...queryKeys.admin.userLearning.all, 'heatmap', userId, startDate, endDate] as const,
      records: (userId: string, params: Record<string, unknown>) =>
        [...queryKeys.admin.userLearning.all, 'records', userId, params] as const,
      trend: (userId: string, days: number) =>
        [...queryKeys.admin.userLearning.all, 'trend', userId, days] as const,
    },

    // 系统统计
    statistics: {
      all: ['admin', 'statistics'] as const,
      overview: () => [...queryKeys.admin.statistics.all, 'overview'] as const,
    },

    // 系统状态
    system: {
      all: ['admin', 'system'] as const,
      status: () => [...queryKeys.admin.system.all, 'status'] as const,
      performance: () => [...queryKeys.admin.system.all, 'performance'] as const,
      alerts: (limit: number) => [...queryKeys.admin.system.all, 'alerts', limit] as const,
    },

    // 配置历史
    configHistory: {
      all: ['admin', 'configHistory'] as const,
      lists: () => [...queryKeys.admin.configHistory.all, 'list'] as const,
      list: (limit?: number) => [...queryKeys.admin.configHistory.lists(), { limit }] as const,
      details: () => [...queryKeys.admin.configHistory.all, 'detail'] as const,
      detail: (id: string) => [...queryKeys.admin.configHistory.details(), id] as const,
    },
  },

  /**
   * 导出相关查询
   */
  export: {
    all: ['export'] as const,
    history: (filters?: Record<string, unknown>) =>
      filters
        ? ([...queryKeys.export.all, 'history', filters] as const)
        : ([...queryKeys.export.all, 'history'] as const),
    statistics: () => [...queryKeys.export.all, 'statistics'] as const,
  },

  /**
   * 批量操作相关查询
   */
  batch: {
    all: ['batch'] as const,
    operations: () => [...queryKeys.batch.all, 'operations'] as const,
    progress: (operationId: string) => [...queryKeys.batch.all, 'progress', operationId] as const,
  },
} as const;

/**
 * 类型辅助：从查询键工厂中提取查询键类型
 */
type ExtractQueryKeys<T> = T extends (...args: unknown[]) => infer R
  ? R
  : T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in keyof T]: ExtractQueryKeys<T[K]> }[keyof T]
      : never;

export type QueryKey = ExtractQueryKeys<typeof queryKeys>;
