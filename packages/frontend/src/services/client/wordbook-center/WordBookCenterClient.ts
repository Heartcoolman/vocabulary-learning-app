import { BaseClient } from '../base/BaseClient';

export interface CenterConfig {
  id: string;
  centerUrl: string;
  updatedAt: string;
  updatedBy?: string | null;
}

export interface PersonalCenterConfig {
  centerUrl: string;
  updatedAt: string;
}

export interface CenterConfigResponse {
  global: CenterConfig;
  personal?: PersonalCenterConfig | null;
  effectiveUrl: string;
  source: 'personal' | 'global';
}

export interface CenterWordBook {
  id: string;
  name: string;
  description?: string | null;
  wordCount: number;
  coverImage?: string | null;
  tags: string[];
  version: string;
  author?: string | null;
  downloadCount?: number;
}

export interface CenterWord {
  spelling: string;
  phonetic?: string | null;
  meanings: string[];
  examples: string[];
  audioUrl?: string | null;
}

export interface CenterWordBookDetail extends CenterWordBook {
  words: CenterWord[];
}

export interface BrowseResponse {
  wordbooks: CenterWordBook[];
  total: number;
}

export interface ImportResult {
  wordbookId: string;
  importedCount: number;
  message: string;
}

export interface UpdateInfo {
  id: string;
  name: string;
  currentVersion: string | null;
  newVersion: string;
  hasUpdate: boolean;
}

export interface SyncResult {
  wordbookId: string;
  upsertedCount: number;
  deletedCount: number;
  message: string;
}

export class WordBookCenterClient extends BaseClient {
  async getConfig(): Promise<CenterConfigResponse> {
    return this.request<CenterConfigResponse>('/api/wordbook-center/config');
  }

  async updateConfig(centerUrl: string): Promise<CenterConfig> {
    return this.request<CenterConfig>('/api/wordbook-center/config', {
      method: 'PUT',
      body: JSON.stringify({ centerUrl }),
    });
  }

  async updatePersonalConfig(centerUrl: string): Promise<PersonalCenterConfig> {
    return this.request<PersonalCenterConfig>('/api/wordbook-center/config/personal', {
      method: 'PUT',
      body: JSON.stringify({ centerUrl }),
    });
  }

  async clearPersonalConfig(): Promise<void> {
    await this.request('/api/wordbook-center/config/personal', {
      method: 'DELETE',
    });
  }

  async browse(): Promise<BrowseResponse> {
    return this.request<BrowseResponse>('/api/wordbook-center/browse');
  }

  async getWordBookDetail(id: string): Promise<CenterWordBookDetail> {
    return this.request<CenterWordBookDetail>(`/api/wordbook-center/browse/${id}`);
  }

  async importWordBook(id: string, targetType: 'SYSTEM' | 'USER'): Promise<ImportResult> {
    return this.request<ImportResult>(`/api/wordbook-center/import/${id}`, {
      method: 'POST',
      body: JSON.stringify({ targetType }),
    });
  }

  async getUpdates(): Promise<UpdateInfo[]> {
    return this.request<UpdateInfo[]>('/api/wordbook-center/updates');
  }

  async syncWordBook(id: string): Promise<SyncResult> {
    return this.request<SyncResult>(`/api/wordbook-center/updates/${id}/sync`, {
      method: 'POST',
    });
  }
}
