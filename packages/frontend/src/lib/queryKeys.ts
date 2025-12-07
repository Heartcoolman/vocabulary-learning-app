/**
 * React Query 查询键工厂函数
 *
 * 统一管理所有查询的 key，便于类型安全和维护
 * 使用工厂函数模式组织查询键，支持层级结构
 */

export const queryKeys = {
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
} as const;

/**
 * 类型辅助：从查询键工厂中提取查询键类型
 */
export type QueryKey = ReturnType<
  (typeof queryKeys)[keyof typeof queryKeys][keyof (typeof queryKeys)[keyof typeof queryKeys]]
>;
