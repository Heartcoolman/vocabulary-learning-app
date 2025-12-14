/**
 * LearningState React Hooks
 * 提供React组件中使用学习状态API的Hook
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  WordLearningState,
  WordScore,
  MasteryEvaluation,
  CompleteWordState,
  UserStats,
  UserLearningStats,
  WordStateUpdateData,
  ReviewEventInput,
  WordState,
} from '../types/learning-state';
import type { LearningStateAdapter } from '../adapters/learning-state-adapter';

/**
 * 通用Hook状态
 */
interface HookState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * 获取单词学习状态Hook
 */
export function useWordState(
  adapter: LearningStateAdapter,
  userId: string,
  wordId: string,
  includeMastery: boolean = false,
) {
  const [state, setState] = useState<HookState<CompleteWordState>>({
    data: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const data = await adapter.getWordState(userId, wordId, includeMastery);
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error : new Error('Failed to fetch word state'),
      });
    }
  }, [adapter, userId, wordId, includeMastery]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateState = useCallback(
    async (updateData: WordStateUpdateData) => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        await adapter.updateWordState(userId, wordId, updateData);
        await refresh();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error : new Error('Failed to update word state'),
        }));
      }
    },
    [adapter, userId, wordId, refresh],
  );

  return {
    ...state,
    refresh,
    updateState,
  };
}

/**
 * 批量获取单词学习状态Hook
 */
export function useBatchWordStates(
  adapter: LearningStateAdapter,
  userId: string,
  wordIds: string[],
  includeMastery: boolean = false,
) {
  const [state, setState] = useState<HookState<Record<string, CompleteWordState>>>({
    data: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    if (wordIds.length === 0) {
      setState({ data: {}, loading: false, error: null });
      return;
    }

    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const data = await adapter.batchGetWordStates(userId, wordIds, includeMastery);
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error : new Error('Failed to fetch word states'),
      });
    }
  }, [adapter, userId, wordIds, includeMastery]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
  };
}

/**
 * 获取需要复习的单词Hook
 */
export function useDueWords(adapter: LearningStateAdapter, userId: string) {
  const [state, setState] = useState<HookState<WordLearningState[]>>({
    data: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const data = await adapter.getDueWords(userId);
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error : new Error('Failed to fetch due words'),
      });
    }
  }, [adapter, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
  };
}

/**
 * 获取特定状态的单词Hook
 */
export function useWordsByState(
  adapter: LearningStateAdapter,
  userId: string,
  wordState: WordState,
) {
  const [state, setState] = useState<HookState<WordLearningState[]>>({
    data: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const data = await adapter.getWordsByState(userId, wordState);
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error : new Error('Failed to fetch words by state'),
      });
    }
  }, [adapter, userId, wordState]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
  };
}

/**
 * 获取用户学习统计Hook
 */
export function useUserStats(adapter: LearningStateAdapter, userId: string) {
  const [state, setState] = useState<HookState<UserStats>>({
    data: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const data = await adapter.getUserStats(userId);
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error : new Error('Failed to fetch user stats'),
      });
    }
  }, [adapter, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
  };
}

/**
 * 获取用户综合学习统计Hook
 */
export function useUserLearningStats(adapter: LearningStateAdapter, userId: string) {
  const [state, setState] = useState<HookState<UserLearningStats>>({
    data: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const data = await adapter.getUserLearningStats(userId);
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error : new Error('Failed to fetch learning stats'),
      });
    }
  }, [adapter, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
  };
}

/**
 * 单词得分Hook
 */
export function useWordScore(adapter: LearningStateAdapter, userId: string, wordId: string) {
  const [state, setState] = useState<HookState<WordScore>>({
    data: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const data = await adapter.getWordScore(userId, wordId);
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error : new Error('Failed to fetch word score'),
      });
    }
  }, [adapter, userId, wordId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateScore = useCallback(
    async (result: { isCorrect: boolean; responseTime?: number }) => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        await adapter.updateWordScore(userId, wordId, result);
        await refresh();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error : new Error('Failed to update word score'),
        }));
      }
    },
    [adapter, userId, wordId, refresh],
  );

  return {
    ...state,
    refresh,
    updateScore,
  };
}

/**
 * 单词掌握度评估Hook
 */
export function useWordMastery(
  adapter: LearningStateAdapter,
  userId: string,
  wordId: string,
  userFatigue?: number,
) {
  const [state, setState] = useState<HookState<MasteryEvaluation>>({
    data: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const data = await adapter.evaluateWord(userId, wordId, userFatigue);
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error : new Error('Failed to evaluate word mastery'),
      });
    }
  }, [adapter, userId, wordId, userFatigue]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const recordReview = useCallback(
    async (event: ReviewEventInput) => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        await adapter.recordReview(userId, wordId, event);
        await refresh();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error : new Error('Failed to record review'),
        }));
      }
    },
    [adapter, userId, wordId, refresh],
  );

  return {
    ...state,
    refresh,
    recordReview,
  };
}
