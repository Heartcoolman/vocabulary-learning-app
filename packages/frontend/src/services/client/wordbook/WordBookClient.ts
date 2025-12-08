import { BaseClient } from '../base/BaseClient';
import { WordBook, Word, StudyConfig } from '../../../types/models';

/**
 * API 响应中的 WordBook 类型（日期字段为字符串）
 */
interface ApiWordBook {
  id: string;
  name: string;
  description?: string;
  coverImage?: string;
  type: 'SYSTEM' | 'USER';
  userId?: string;
  isPublic: boolean;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * API 响应中的 StudyConfig 类型（日期字段为字符串）
 */
interface ApiStudyConfig {
  id: string;
  userId: string;
  selectedWordBookIds: string[];
  dailyWordCount: number;
  studyMode?: string;
  createdAt: string;
  updatedAt: string;
}

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
 * 学习进度
 */
export interface StudyProgress {
  todayStudied: number;
  todayTarget: number;
  totalStudied: number;
  correctRate: number;
  weeklyTrend: number[];
}

/**
 * 今日学习单词响应
 */
export interface TodayWordsResponse {
  words: Word[];
  progress: StudyProgress;
}

/**
 * 将 API 返回的 WordBook 转换为前端模型
 */
function convertApiWordBook(apiWordBook: ApiWordBook): WordBook {
  return {
    ...apiWordBook,
    createdAt: new Date(apiWordBook.createdAt).getTime(),
    updatedAt: new Date(apiWordBook.updatedAt).getTime(),
  };
}

/**
 * 将 API 返回的 StudyConfig 转换为前端模型
 */
function convertApiStudyConfig(apiStudyConfig: ApiStudyConfig): StudyConfig {
  return {
    ...apiStudyConfig,
    studyMode: apiStudyConfig.studyMode || '',
    createdAt: new Date(apiStudyConfig.createdAt).getTime(),
    updatedAt: new Date(apiStudyConfig.updatedAt).getTime(),
  };
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
 * WordBookClient - 词书管理相关API
 *
 * 职责：
 * - 词书的CRUD操作
 * - 词书中单词的管理
 * - 学习配置管理
 * - 今日学习单词
 */
export class WordBookClient extends BaseClient {
  /**
   * 获取用户词库列表
   */
  async getUserWordBooks(): Promise<WordBook[]> {
    const apiWordBooks = await this.request<ApiWordBook[]>('/api/wordbooks/user');
    return apiWordBooks.map(convertApiWordBook);
  }

  /**
   * 获取系统词库列表
   */
  async getSystemWordBooks(): Promise<WordBook[]> {
    const apiWordBooks = await this.request<ApiWordBook[]>('/api/wordbooks/system');
    return apiWordBooks.map(convertApiWordBook);
  }

  /**
   * 获取所有可用词库（系统 + 用户）
   */
  async getAllAvailableWordBooks(): Promise<WordBook[]> {
    const apiWordBooks = await this.request<ApiWordBook[]>('/api/wordbooks/available');
    return apiWordBooks.map(convertApiWordBook);
  }

  /**
   * 获取词书详情
   */
  async getWordBookById(id: string): Promise<WordBook> {
    const apiWordBook = await this.request<ApiWordBook>(`/api/wordbooks/${id}`);
    return convertApiWordBook(apiWordBook);
  }

  /**
   * 创建用户词书
   */
  async createWordBook(data: {
    name: string;
    description?: string;
    coverImage?: string;
  }): Promise<WordBook> {
    const apiWordBook = await this.request<ApiWordBook>('/api/wordbooks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return convertApiWordBook(apiWordBook);
  }

  /**
   * 更新词书
   */
  async updateWordBook(
    id: string,
    data: { name?: string; description?: string; coverImage?: string },
  ): Promise<WordBook> {
    const apiWordBook = await this.request<ApiWordBook>(`/api/wordbooks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return convertApiWordBook(apiWordBook);
  }

  /**
   * 删除词书
   */
  async deleteWordBook(id: string): Promise<void> {
    return this.request<void>(`/api/wordbooks/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * 获取词书中的单词列表
   */
  async getWordBookWords(wordBookId: string): Promise<Word[]> {
    const apiWords = await this.request<ApiWord[]>(`/api/wordbooks/${wordBookId}/words`);
    return apiWords.map(convertApiWord);
  }

  /**
   * 向词书添加单词
   */
  async addWordToWordBook(
    wordBookId: string,
    wordData: Omit<Word, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Word> {
    const apiWord = await this.request<ApiWord>(`/api/wordbooks/${wordBookId}/words`, {
      method: 'POST',
      body: JSON.stringify(wordData),
    });
    return convertApiWord(apiWord);
  }

  /**
   * 从词书删除单词
   */
  async removeWordFromWordBook(wordBookId: string, wordId: string): Promise<void> {
    return this.request<void>(`/api/wordbooks/${wordBookId}/words/${wordId}`, {
      method: 'DELETE',
    });
  }

  /**
   * 获取用户学习配置
   */
  async getStudyConfig(): Promise<StudyConfig> {
    const apiStudyConfig = await this.request<ApiStudyConfig>('/api/study-config');
    return convertApiStudyConfig(apiStudyConfig);
  }

  /**
   * 更新学习配置
   */
  async updateStudyConfig(data: {
    selectedWordBookIds: string[];
    dailyWordCount: number;
    studyMode?: string;
  }): Promise<StudyConfig> {
    const apiStudyConfig = await this.request<ApiStudyConfig>('/api/study-config', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return convertApiStudyConfig(apiStudyConfig);
  }

  /**
   * 获取今日学习单词
   */
  async getTodayWords(): Promise<TodayWordsResponse> {
    const response = await this.request<{ words: ApiWord[]; progress: StudyProgress }>(
      '/api/study-config/today-words',
    );
    return {
      words: response.words.map(convertApiWord),
      progress: response.progress,
    };
  }

  /**
   * 获取学习进度
   */
  async getStudyProgress(): Promise<StudyProgress> {
    return this.request<StudyProgress>('/api/study-config/progress');
  }
}
