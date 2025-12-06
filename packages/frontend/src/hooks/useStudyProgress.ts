import { useState, useEffect, useCallback } from 'react';
import apiClient from '../services/ApiClient';
import { learningLogger } from '../utils/logger';

export interface StudyProgressData {
  todayStudied: number;
  todayTarget: number;
  totalStudied: number;
  correctRate: number;
  weeklyTrend: number[];
}

interface UseStudyProgressReturn {
  progress: StudyProgressData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const useStudyProgress = (): UseStudyProgressReturn => {
  const [progress, setProgress] = useState<StudyProgressData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.getStudyProgress();
      setProgress(response);
    } catch (err) {
      learningLogger.error({ err }, '获取学习进度失败');
      setError('无法加载学习进度，请检查网络连接。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  return { progress, loading, error, refresh: fetchProgress };
};
