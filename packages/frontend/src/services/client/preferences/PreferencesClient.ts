import { BaseClient } from '../base/BaseClient';

export interface LearningPreferences {
  preferredStudyTimeStart?: string;
  preferredStudyTimeEnd?: string;
  preferredDifficulty?: string;
  dailyGoalEnabled: boolean;
  dailyGoalWords: number;
}

export interface NotificationPreferences {
  enableForgettingAlerts: boolean;
  enableAchievements: boolean;
  enableReminders: boolean;
  enableSystemNotif: boolean;
  reminderFrequency: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

export interface UiPreferences {
  theme: string;
  language: string;
  soundEnabled: boolean;
  animationEnabled: boolean;
}

export interface UserPreferences {
  learning: LearningPreferences;
  notification: NotificationPreferences;
  ui: UiPreferences;
  updatedAt: string;
}

export interface UpdatePreferencesDto {
  learning?: Partial<LearningPreferences>;
  notification?: Partial<NotificationPreferences>;
  ui?: Partial<UiPreferences>;
}

export class PreferencesClient extends BaseClient {
  async getPreferences(): Promise<UserPreferences> {
    return this.request<UserPreferences>('/api/preferences');
  }

  async updatePreferences(dto: UpdatePreferencesDto): Promise<UserPreferences> {
    return this.request<UserPreferences>('/api/preferences', {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  }

  async getLearningPreferences(): Promise<LearningPreferences> {
    return this.request<LearningPreferences>('/api/preferences/learning');
  }

  async updateLearningPreferences(
    preferences: Partial<LearningPreferences>,
  ): Promise<LearningPreferences> {
    return this.request<LearningPreferences>('/api/preferences/learning', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
  }

  async getNotificationPreferences(): Promise<NotificationPreferences> {
    return this.request<NotificationPreferences>('/api/preferences/notification');
  }

  async updateNotificationPreferences(
    preferences: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    return this.request<NotificationPreferences>('/api/preferences/notification', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
  }

  async getUiPreferences(): Promise<UiPreferences> {
    return this.request<UiPreferences>('/api/preferences/ui');
  }

  async updateUiPreferences(preferences: Partial<UiPreferences>): Promise<UiPreferences> {
    return this.request<UiPreferences>('/api/preferences/ui', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
  }

  async resetPreferences(): Promise<UserPreferences> {
    return this.request<UserPreferences>('/api/preferences/reset', {
      method: 'POST',
    });
  }

  async checkQuietHours(): Promise<{ isQuietTime: boolean }> {
    return this.request<{ isQuietTime: boolean }>('/api/preferences/quiet-hours/check');
  }
}
