import { BaseClient } from '../base/BaseClient';

export interface SettingItem {
  key: string;
  value: string;
  description: string | null;
  category: string;
  isSecret: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export interface UpdateSettingItem {
  key: string;
  value: string;
}

export class AdminSettingsClient extends BaseClient {
  async getSettings(): Promise<SettingItem[]> {
    return this.request<SettingItem[]>('/api/admin/settings');
  }

  async getEmbeddingSettings(): Promise<SettingItem[]> {
    return this.request<SettingItem[]>('/api/admin/settings/embedding');
  }

  async updateSettings(settings: UpdateSettingItem[]): Promise<string> {
    return this.request<string>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    });
  }

  async updateEmbeddingSettings(settings: UpdateSettingItem[]): Promise<string> {
    return this.request<string>('/api/admin/settings/embedding', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    });
  }
}

export const adminSettingsClient = new AdminSettingsClient();
