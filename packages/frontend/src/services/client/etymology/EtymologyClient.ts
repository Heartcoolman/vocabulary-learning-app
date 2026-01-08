import { BaseClient, ApiError } from '../base/BaseClient';
import type { WordEtymology, WordFamily, RootFeatures } from '@danci/shared';

export class EtymologyClient extends BaseClient {
  async getWordEtymology(wordId: string): Promise<WordEtymology | null> {
    try {
      return await this.request<WordEtymology>(`/api/etymology/words/${wordId}/etymology`);
    } catch (error) {
      if (error instanceof ApiError && error.isNotFound) {
        return null;
      }
      throw error;
    }
  }

  async getWordFamily(morphemeId: string, limit = 20): Promise<WordFamily | null> {
    try {
      return await this.request<WordFamily>(
        `/api/etymology/morphemes/${morphemeId}/family?limit=${limit}`,
      );
    } catch (error) {
      if (error instanceof ApiError && error.isNotFound) {
        return null;
      }
      throw error;
    }
  }

  async getRootFeatures(wordId: string): Promise<RootFeatures> {
    try {
      return await this.request<RootFeatures>(`/api/etymology/words/${wordId}/root-features`);
    } catch {
      return { rootCount: 0, knownRootRatio: 0, avgRootMastery: 0, maxRootMastery: 0 };
    }
  }
}

export const etymologyClient = new EtymologyClient();
