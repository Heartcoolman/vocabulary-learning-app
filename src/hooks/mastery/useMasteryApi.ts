import apiClient from '../../services/ApiClient';
import { WordItem } from '../../services/learning/WordQueueManager';
import { AmasProcessResult, AdjustReason, AdjustWordsParams, AdjustWordsResponse } from '../../types/amas';
import { learningLogger } from '../../utils/logger';

/**
 * 同步进度请求参数
 */
export interface SyncProgressParams {
  sessionId: string;
  actualMasteryCount: number;
  totalQuestions: number;
}

/**
 * 获取更多单词请求参数
 */
export interface FetchMoreWordsParams {
  sessionId: string;
  currentWordIds: string[];
  masteredWordIds: string[];
  count?: number;
}

/**
 * 获取更多单词响应
 */
export interface FetchMoreWordsResult {
  words: WordItem[];
  reason?: string;
}

/**
 * 处理学习事件请求参数
 */
export interface ProcessLearningEventParams {
  wordId: string;
  isCorrect: boolean;
  responseTime: number;
  sessionId: string;
  timestamp: number;
  pausedTimeMs?: number;
}

/**
 * 调整学习单词请求参数（使用 amas.ts 中的标准类型）
 */
export type AdjustLearningWordsParams = AdjustWordsParams;

/**
 * 调整学习单词响应（使用 amas.ts 中的标准类型）
 */
export type AdjustLearningWordsResult = AdjustWordsResponse;

/**
 * 创建会话响应
 */
export interface CreateSessionResult {
  sessionId: string;
}

/**
 * 获取学习单词响应
 */
export interface GetStudyWordsResult {
  words: WordItem[];
  meta: {
    targetCount: number;
    masteryThreshold: number;
    maxQuestions: number;
  };
}

/**
 * 同步进度到服务器
 *
 * @param params 同步参数
 * @returns Promise<void>
 */
export async function syncMasteryProgress(params: SyncProgressParams): Promise<void> {
  try {
    await apiClient.syncMasteryProgress(params);
    learningLogger.debug({ sessionId: params.sessionId, masteryCount: params.actualMasteryCount }, '进度同步成功');
  } catch (error) {
    learningLogger.error({ err: error, sessionId: params.sessionId }, '同步进度失败');
    throw error;
  }
}

/**
 * 获取更多单词
 *
 * @param params 请求参数
 * @returns Promise<FetchMoreWordsResult>
 */
export async function fetchMoreWords(params: FetchMoreWordsParams): Promise<FetchMoreWordsResult> {
  try {
    const result = await apiClient.getNextWords({
      currentWordIds: params.currentWordIds,
      masteredWordIds: params.masteredWordIds,
      sessionId: params.sessionId,
      count: params.count ?? 3
    });

    learningLogger.debug({ count: result.words.length, reason: result.reason }, '获取更多单词成功');

    return {
      words: result.words.map(w => ({
        ...w,
        audioUrl: w.audioUrl || undefined
      })),
      reason: result.reason
    };
  } catch (error) {
    learningLogger.error({ err: error, sessionId: params.sessionId }, '获取更多单词失败');
    throw error;
  }
}

/**
 * 处理学习事件（AMAS）
 *
 * @param params 学习事件参数
 * @returns Promise<AmasProcessResult>
 */
export async function processLearningEvent(params: ProcessLearningEventParams): Promise<AmasProcessResult> {
  try {
    const result = await apiClient.processLearningEvent(params);
    learningLogger.debug({ wordId: params.wordId, isCorrect: params.isCorrect }, '学习事件处理成功');
    return result;
  } catch (error) {
    learningLogger.error({ err: error, wordId: params.wordId }, '学习事件处理失败');
    throw error;
  }
}

/**
 * 调整学习单词队列
 *
 * @param params 调整参数
 * @returns Promise<AdjustLearningWordsResult>
 */
export async function adjustLearningWords(params: AdjustLearningWordsParams): Promise<AdjustLearningWordsResult> {
  try {
    const result = await apiClient.adjustLearningWords(params);
    learningLogger.debug({ reason: params.adjustReason, responseReason: result.reason }, '队列调整成功');
    return result;
  } catch (error) {
    learningLogger.error({ err: error, sessionId: params.sessionId, reason: params.adjustReason }, '队列调整失败');
    throw error;
  }
}

/**
 * 获取学习单词
 *
 * @param targetCount 目标掌握数量
 * @returns Promise<GetStudyWordsResult>
 */
export async function getMasteryStudyWords(targetCount: number): Promise<GetStudyWordsResult> {
  try {
    const result = await apiClient.getMasteryStudyWords(targetCount);
    learningLogger.debug({ targetCount, wordCount: result.words.length }, '获取学习单词成功');
    return result;
  } catch (error) {
    learningLogger.error({ err: error, targetCount }, '获取学习单词失败');
    throw error;
  }
}

/**
 * 创建掌握学习会话
 *
 * @param targetCount 目标掌握数量
 * @returns Promise<CreateSessionResult>
 */
export async function createMasterySession(targetCount: number): Promise<CreateSessionResult> {
  try {
    const result = await apiClient.createMasterySession(targetCount);
    learningLogger.debug({ targetCount, sessionId: result?.sessionId }, '创建学习会话成功');
    return result;
  } catch (error) {
    learningLogger.error({ err: error, targetCount }, '创建学习会话失败');
    throw error;
  }
}

/**
 * 结束习惯追踪会话
 *
 * @param sessionId 会话 ID
 * @returns Promise<void>
 */
export async function endHabitSession(sessionId: string): Promise<void> {
  try {
    await apiClient.endHabitSession(sessionId);
    learningLogger.info({ sessionId }, '习惯追踪会话已结束');
  } catch (error) {
    learningLogger.warn({ err: error, sessionId }, '结束习惯追踪失败');
    throw error;
  }
}

// 导出 API 客户端类型别名，方便使用
export type { AmasProcessResult, AdjustReason };
