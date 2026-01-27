import { BaseClient } from '../base/BaseClient';

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  content: string;
  status: string;
  priority: string;
  metadata?: Record<string, unknown>;
  broadcastId?: string;
  readAt?: number;
  createdAt: number;
  updatedAt: number;
}

interface ApiNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  content: string;
  status: string;
  priority: string;
  metadata?: Record<string, unknown>;
  broadcastId?: string;
  readAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationQueryParams {
  status?: string;
  type?: string;
  priority?: string;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}

export interface NotificationStats {
  total: number;
  unread: number;
  read: number;
  archived: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
}

function convertApiNotification(api: ApiNotification): Notification {
  return {
    ...api,
    readAt: api.readAt ? new Date(api.readAt).getTime() : undefined,
    createdAt: new Date(api.createdAt).getTime(),
    updatedAt: new Date(api.updatedAt).getTime(),
  };
}

export class NotificationClient extends BaseClient {
  async getNotifications(params?: NotificationQueryParams): Promise<Notification[]> {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.type) queryParams.append('type', params.type);
    if (params?.priority) queryParams.append('priority', params.priority);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);

    const query = queryParams.toString();
    const url = query ? `/api/notifications?${query}` : '/api/notifications';

    const apiNotifications = await this.request<ApiNotification[]>(url);
    return apiNotifications.map(convertApiNotification);
  }

  async getNotification(id: string): Promise<Notification> {
    const apiNotification = await this.request<ApiNotification>(`/api/notifications/${id}`);
    return convertApiNotification(apiNotification);
  }

  async getStats(): Promise<NotificationStats> {
    return this.request<NotificationStats>('/api/notifications/stats');
  }

  async getUnreadCount(): Promise<number> {
    const stats = await this.getStats();
    return stats.unread;
  }

  async markAsRead(id: string): Promise<void> {
    await this.request(`/api/notifications/${id}/read`, { method: 'PUT' });
  }

  async markAllAsRead(): Promise<void> {
    await this.request('/api/notifications/read-all', { method: 'PUT' });
  }

  async batchMarkAsRead(notificationIds: string[]): Promise<{ affected: number }> {
    return this.request<{ affected: number }>('/api/notifications/batch/read', {
      method: 'PUT',
      body: JSON.stringify({ notificationIds }),
    });
  }

  async archive(id: string): Promise<void> {
    await this.request(`/api/notifications/${id}/archive`, { method: 'PUT' });
  }

  async deleteNotification(id: string): Promise<void> {
    await this.request(`/api/notifications/${id}`, { method: 'DELETE' });
  }

  async batchDelete(notificationIds: string[]): Promise<{ affected: number }> {
    return this.request<{ affected: number }>('/api/notifications/batch', {
      method: 'DELETE',
      body: JSON.stringify({ notificationIds }),
    });
  }
}
