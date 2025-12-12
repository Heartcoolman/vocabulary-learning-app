import { BaseClient } from '../base/BaseClient';
import { Word } from '../../../types/models';
import { apiLogger } from '../../../utils/logger';

/**
 * API 响应中的 Word 类型（日期字段为字符串）
 */
interface ApiWord {
  id: string;
  wordBookId?: string;
  spelling: string;
  phonetic: string;
  meanings: string[];
  examples: string[];
  audioUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 将 API 返回的 Word 转换为前端模型
 */
function convertApiWord(apiWord: ApiWord): Word {
  return {
    ...apiWord,
    wordBookId: apiWord.wordBookId,
    createdAt: new Date(apiWord.createdAt).getTime(),
    updatedAt: new Date(apiWord.updatedAt).getTime(),
  };
}

/**
 * WordClient - 单词管理相关API
 *
 * 职责：
 * - 单词的CRUD操作
 * - 批量创建单词
 * - 搜索单词
 * - 获取学过的单词
 */
export class WordClient extends BaseClient {
  /**
   * 获取用户的所有单词（基于选择的词书）
   */
  async getWords(): Promise<Word[]> {
    const apiWords = await this.request<ApiWord[]>('/api/words');
    return apiWords.map(convertApiWord);
  }

  /**
   * 获取用户学过的单词（有学习记录的）
   * 用于掌握度分析页面
   */
  async getLearnedWords(): Promise<Word[]> {
    const apiWords = await this.request<ApiWord[]>('/api/words/learned');
    return apiWords.map(convertApiWord);
  }

  /**
   * 添加新单词
   */
  async createWord(wordData: Omit<Word, 'id' | 'createdAt' | 'updatedAt'>): Promise<Word> {
    const apiWord = await this.request<ApiWord>('/api/words', {
      method: 'POST',
      body: JSON.stringify(wordData),
    });
    return convertApiWord(apiWord);
  }

  /**
   * 更新单词
   */
  async updateWord(
    wordId: string,
    wordData: Partial<Omit<Word, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Word> {
    const apiWord = await this.request<ApiWord>(`/api/words/${wordId}`, {
      method: 'PUT',
      body: JSON.stringify(wordData),
    });
    return convertApiWord(apiWord);
  }

  /**
   * 删除单词
   */
  async deleteWord(wordId: string): Promise<void> {
    return this.request<void>(`/api/words/${wordId}`, {
      method: 'DELETE',
    });
  }

  /**
   * 批量删除单词
   */
  async batchDeleteWords(wordIds: string[]): Promise<{ deleted: number }> {
    return this.request<{ deleted: number }>(`/api/words/batch-delete`, {
      method: 'POST',
      body: JSON.stringify({ wordIds }),
    });
  }

  /**
   * 批量创建单词
   */
  async batchCreateWords(words: Omit<Word, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Word[]> {
    const apiWords = await this.request<ApiWord[]>('/api/words/batch', {
      method: 'POST',
      body: JSON.stringify({ words }),
    });
    return apiWords.map(convertApiWord);
  }

  /**
   * 搜索单词
   * @param query 搜索关键词
   * @param limit 返回结果数量限制
   */
  async searchWords(
    query: string,
    limit: number = 20,
  ): Promise<(Word & { wordBook?: { id: string; name: string; type: string } })[]> {
    const apiWords = await this.request<
      (ApiWord & { wordBook?: { id: string; name: string; type: string } })[]
    >(`/api/words/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    return apiWords.map((w) => ({
      ...convertApiWord(w),
      wordBook: w.wordBook,
    }));
  }

  /**
   * 批量导入单词到词书
   */
  async batchImportWords(
    wordBookId: string,
    words: Array<{
      spelling: string;
      phonetic: string;
      meanings: string[];
      examples: string[];
      audioUrl?: string;
    }>,
  ): Promise<{ imported: number; failed: number; errors?: string[] }> {
    if (!wordBookId || typeof wordBookId !== 'string' || wordBookId.trim().length === 0) {
      throw new Error('wordBookId 必须是非空字符串');
    }
    if (!Array.isArray(words) || words.length === 0) {
      throw new Error('words 必须是非空数组');
    }
    if (words.length > 1000) {
      throw new Error('单次导入不能超过1000个单词');
    }

    try {
      return await this.request<{ imported: number; failed: number; errors?: string[] }>(
        `/api/wordbooks/${wordBookId}/words/batch`,
        {
          method: 'POST',
          body: JSON.stringify({ words }),
        },
      );
    } catch (error) {
      apiLogger.error({ err: error }, '批量导入单词失败');
      throw error;
    }
  }

  /**
   * 根据ID获取单个单词
   * @param wordId 单词ID
   */
  async getWordById(wordId: string): Promise<Word> {
    const apiWord = await this.request<ApiWord>(`/api/words/${wordId}`);
    return convertApiWord(apiWord);
  }
}
