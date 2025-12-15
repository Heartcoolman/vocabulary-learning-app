import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '../services/client';
import { ApiError } from '../services/client';
import { wordService } from '../services/word.service';
import { learningLogger } from '../utils/logger';
import type {
  MasteryEvaluation,
  ReviewTraceRecord,
  WordMasteryIntervalResponse,
} from '../types/word-mastery';

export interface WordDetailData {
  spelling: string;
  phonetic: string;
  meanings: string[];
  mastery: MasteryEvaluation | null;
  trace: ReviewTraceRecord[];
  interval: WordMasteryIntervalResponse | null;
}

export const useWordDetailData = (wordId: string, isOpen: boolean) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<WordDetailData | null>(null);

  const loadDetailData = useCallback(async () => {
    if (!wordId) return;

    try {
      setLoading(true);
      setError(null);

      const wordDataPromise = (async () => {
        const learnedWords = await apiClient.getLearnedWords().catch(() => []);
        const found = learnedWords.find((word) => word.id === wordId);
        if (found) return found;

        try {
          const { data } = await wordService.getWordById(wordId);
          return data;
        } catch (err) {
          if (err instanceof ApiError && err.isNotFound) {
            return undefined;
          }
          throw err;
        }
      })();

      // 并发加载所有数据
      const [wordData, masteryData, traceData, intervalData] = await Promise.all([
        // 优先从已学习列表获取，失败则回退到单词详情查询
        wordDataPromise,
        // 获取掌握度评估
        apiClient.getWordMasteryDetail(wordId).catch(() => null),
        // 获取学习轨迹
        apiClient.getWordMasteryTrace(wordId).catch(() => ({ wordId, trace: [], count: 0 })),
        // 获取复习间隔预测
        apiClient.getWordMasteryInterval(wordId).catch(() => null),
      ]);

      if (!wordData) {
        setError('未找到该单词信息');
        return;
      }

      setData({
        spelling: wordData.spelling,
        phonetic: wordData.phonetic ?? '',
        meanings: wordData.meanings,
        mastery: masteryData,
        trace: traceData.trace,
        interval: intervalData,
      });
    } catch (err) {
      setError('加载数据失败，请稍后重试');
      learningLogger.error({ err, wordId }, '加载单词详情失败');
    } finally {
      setLoading(false);
    }
  }, [wordId]);

  useEffect(() => {
    if (isOpen) {
      loadDetailData();
    }
  }, [isOpen, loadDetailData]);

  return { loading, error, data, reload: loadDetailData };
};
