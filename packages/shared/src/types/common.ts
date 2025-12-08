/**
 * 通用类型定义
 * 包含整个应用通用的基础类型
 */

/**
 * API响应包装类型
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * 分页参数
 */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

/**
 * 分页响应
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 时间戳类型 - 使用number（毫秒）
 */
export type Timestamp = number;

/**
 * ID类型 - 使用string
 */
export type ID = string;

/**
 * 基础实体类型 - 包含通用字段
 */
export interface BaseEntity {
  id: ID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
