import { useState, useEffect, useCallback } from 'react';

import { wordBookClient } from '../services/client';
import { learningLogger } from '../utils/logger';

import type { Word } from '../types/models';

export interface StudyPlan {
  words: Word[];
  todayStudied: number;
  todayTarget: number;
  totalStudied: number;
  correctRate: number;
}

export const useStudyPlan = () => {
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlan = useCallback(async () => {
    try {
      setLoading(true);
      const response = await wordBookClient.getTodayWords();

      setPlan({
        words: response.words,
        todayStudied: response.progress.todayStudied,
        todayTarget: response.progress.todayTarget,
        totalStudied: response.progress.totalStudied,
        correctRate: response.progress.correctRate,
      });

      setError(null);
    } catch (err) {
      learningLogger.error({ err }, '获取今日学习计划失败');
      setError('无法加载今日学习计划，请检查网络连接。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  return { plan, loading, error, refresh: fetchPlan };
};
