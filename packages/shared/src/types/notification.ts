/**
 * 通知相关类型定义
 */

/**
 * 通知类型
 */
export enum NotificationType {
  FORGETTING_ALERT = 'FORGETTING_ALERT',
  ACHIEVEMENT = 'ACHIEVEMENT',
  REMINDER = 'REMINDER',
  SYSTEM = 'SYSTEM',
  MILESTONE = 'MILESTONE',
  STREAK = 'STREAK',
}

/**
 * 通知状态
 */
export enum NotificationStatus {
  UNREAD = 'UNREAD',
  READ = 'READ',
  ARCHIVED = 'ARCHIVED',
  DELETED = 'DELETED',
}

/**
 * 通知优先级
 */
export enum NotificationPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

/**
 * 通知实体
 */
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  status: NotificationStatus;
  priority: NotificationPriority;
  metadata?: Record<string, unknown>;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 创建通知 DTO
 */
export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  priority?: NotificationPriority;
  metadata?: Record<string, unknown>;
}

/**
 * 通知查询参数
 */
export interface NotificationQueryParams {
  status?: NotificationStatus;
  type?: NotificationType;
  priority?: NotificationPriority;
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
}

/**
 * 通知统计
 */
export interface NotificationStats {
  total: number;
  unread: number;
  read: number;
  archived: number;
  byType: Record<NotificationType, number>;
  byPriority: Record<NotificationPriority, number>;
}

/**
 * 批量操作结果
 */
export interface NotificationBatchResult {
  success: boolean;
  affected: number;
  errors?: string[];
}
