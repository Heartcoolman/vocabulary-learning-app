/**
 * 分页配置常量
 * 统一管理所有分页大小配置
 */
export const PAGINATION_CONFIG = {
  /** 默认分页大小 */
  DEFAULT: 20,

  /** 管理后台列表 */
  ADMIN_LIST: 20,

  /** 预取数据 */
  PREFETCH: 50,

  /** 统计计算 */
  STATISTICS: 100,

  /** 扩展进度查询 */
  EXTENDED_PROGRESS: 1000,

  /** 数据导出（大批量） */
  EXPORT: 10000,
} as const;

export type PaginationSize = (typeof PAGINATION_CONFIG)[keyof typeof PAGINATION_CONFIG];
