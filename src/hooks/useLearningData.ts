import { useState, useEffect, useCallback } from 'react';
import apiClient, { UserLearningData } from '../services/ApiClient';

interface UseLearningDataReturn {
  data: UserLearningData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const useLearningData = (userId: string, limit: number = 50): UseLearningDataReturn => {
  const [data, setData] = useState<UserLearningData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setError('用户ID为空');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.adminGetUserLearningData(userId, limit);
      setData(response);
    } catch (err) {
      console.error('Failed to fetch user learning data:', err);
      setError(err instanceof Error ? err.message : '获取学习记录失败');
    } finally {
      setLoading(false);
    }
  }, [userId, limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh: fetchData };
};
