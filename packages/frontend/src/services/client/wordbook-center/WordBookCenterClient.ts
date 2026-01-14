import { BaseClient } from '../base/BaseClient';

export interface CenterConfig {
  id: string;
  centerUrl: string;
  updatedAt: string;
  updatedBy?: string | null;
}

interface ApiCenterConfig {
  id: string;
  centerUrl: string;
  updatedAt: string;
  updatedBy?: string | null;
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

export class WordBookCenterClient extends BaseClient {
  async getConfig(): Promise<CenterConfig> {
    return this.request<CenterConfig>('/api/wordbook-center/config');
  }

  async updateConfig(centerUrl: string): Promise<CenterConfig> {
    return this.request<CenterConfig>('/api/wordbook-center/config', {
      method: 'PUT',
      body: JSON.stringify({ centerUrl }),
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
}
