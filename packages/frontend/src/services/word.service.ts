/**
 * Word Service - 单词相关API封装
 *
 * 职责：
 * - 封装所有单词相关的API调用
 * - 提供类型安全的接口
 * - 集中管理单词相关的业务逻辑
 */

import apiClient from './ApiClient';
import type { Word } from '../types/models';

export interface CreateWordDto {
  spelling: string;
  phonetic: string;
  meanings: string[];
  examples: string[];
  audioUrl?: string;
  wordBookId?: string;
}

export interface UpdateWordDto {
  spelling?: string;
  phonetic?: string;
  meanings?: string[];
  examples?: string[];
  audioUrl?: string;
}

export interface SearchWordResult extends Word {
  wordBook?: {
    id: string;
    name: string;
    type: string;
  };
}

class WordService {
  /**
   * 获取单词列表
   */
  async getWords(): Promise<{ data: Word[] }> {
    const words = await apiClient.getWords();
    return { data: words };
  }

  /**
   * 根据ID获取单词详情
   */
  async getWordById(id: string): Promise<{ data: Word }> {
    // 注意：当前 ApiClient 没有 getWordById 方法
    // 我们需要从列表中过滤，或者等待后端添加此接口
    const words = await apiClient.getWords();
    const word = words.find(w => w.id === id);
    if (!word) {
      throw new Error(`单词不存在: ${id}`);
    }
    return { data: word };
  }

  /**
   * 搜索单词
   * @param query 搜索关键词
   * @param limit 返回结果数量限制
   */
  async searchWords(query: string, limit: number = 20): Promise<{ data: SearchWordResult[] }> {
    const results = await apiClient.searchWords(query, limit);
    return { data: results };
  }

  /**
   * 创建单词
   */
  async createWord(data: CreateWordDto): Promise<{ data: Word }> {
    const word = await apiClient.createWord(data);
    return { data: word };
  }

  /**
   * 更新单词
   */
  async updateWord(id: string, data: UpdateWordDto): Promise<{ data: Word }> {
    const word = await apiClient.updateWord(id, data);
    return { data: word };
  }

  /**
   * 删除单词
   */
  async deleteWord(id: string): Promise<void> {
    await apiClient.deleteWord(id);
  }

  /**
   * 批量创建单词
   */
  async batchCreateWords(words: CreateWordDto[]): Promise<{ data: Word[] }> {
    const createdWords = await apiClient.batchCreateWords(words);
    return { data: createdWords };
  }

  /**
   * 获取已学习的单词
   */
  async getLearnedWords(): Promise<{ data: Word[] }> {
    const words = await apiClient.getLearnedWords();
    return { data: words };
  }
}

export const wordService = new WordService();
