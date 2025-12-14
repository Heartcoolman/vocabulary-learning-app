/**
 * UserProfile React Hooks
 * 提供React组件中使用用户画像API的Hook
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  User,
  UserProfile,
  HabitProfile,
  CognitiveProfile,
  UserLearningProfile,
  UserStatistics,
  UpdateHabitProfileParams,
  UpdateLearningProfileParams,
} from '../types/user-profile';
import type { UserProfileAdapter } from '../adapters/user-profile-adapter';

/**
 * 通用Hook状态
 */
interface HookState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * 获取用户信息Hook
 */
export function useUser(adapter: UserProfileAdapter, userId: string) {
  const [state, setState] = useState<HookState<User>>({
    data: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const data = await adapter.getUserById(userId);
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error : new Error('Failed to fetch user'),
      });
    }
  }, [adapter, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateUser = useCallback(
    async (updateData: Partial<{ username: string; email: string }>) => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        await adapter.updateUser(userId, updateData);
        await refresh();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error : new Error('Failed to update user'),
        }));
      }
    },
    [adapter, userId, refresh],
  );

  return {
    ...state,
    refresh,
    updateUser,
  };
}

/**
 * 获取当前用户Hook
 */
export function useCurrentUser(adapter: UserProfileAdapter) {
  const [state, setState] = useState<HookState<User>>({
    data: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const data = await adapter.getCurrentUser();
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error : new Error('Failed to fetch current user'),
      });
    }
  }, [adapter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
  };
}

/**
 * 获取完整用户画像Hook
 */
export function useUserProfile(
  adapter: UserProfileAdapter,
  userId: string,
  options?: {
    includeHabit?: boolean;
    includeCognitive?: boolean;
    includeLearning?: boolean;
  },
) {
  const [state, setState] = useState<HookState<UserProfile>>({
    data: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const data = await adapter.getUserProfile(userId, options);
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error : new Error('Failed to fetch user profile'),
      });
    }
  }, [adapter, userId, options]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
  };
}

/**
 * 习惯画像Hook
 */
export function useHabitProfile(adapter: UserProfileAdapter, userId: string) {
  const [state, setState] = useState<HookState<HabitProfile>>({
    data: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const profile = await adapter.getUserProfile(userId, {
        includeHabit: true,
        includeCognitive: false,
        includeLearning: false,
      });
      setState({ data: profile.habitProfile, loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error : new Error('Failed to fetch habit profile'),
      });
    }
  }, [adapter, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateProfile = useCallback(
    async (params?: UpdateHabitProfileParams) => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        await adapter.updateHabitProfile(userId, params);
        await refresh();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error : new Error('Failed to update habit profile'),
        }));
      }
    },
    [adapter, userId, refresh],
  );

  const recordTimeEvent = useCallback(
    async (timestamp?: number) => {
      try {
        await adapter.recordTimeEvent(userId, timestamp);
      } catch (error) {
        console.error('Failed to record time event:', error);
      }
    },
    [adapter, userId],
  );

  const recordSessionEnd = useCallback(
    async (sessionDurationMinutes: number, wordCount: number) => {
      try {
        await adapter.recordSessionEnd(userId, sessionDurationMinutes, wordCount);
        await refresh();
      } catch (error) {
        console.error('Failed to record session end:', error);
      }
    },
    [adapter, userId, refresh],
  );

  return {
    ...state,
    refresh,
    updateProfile,
    recordTimeEvent,
    recordSessionEnd,
  };
}

/**
 * 认知画像Hook
 */
export function useCognitiveProfile(adapter: UserProfileAdapter, userId: string) {
  const [state, setState] = useState<HookState<CognitiveProfile>>({
    data: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const data = await adapter.getCognitiveProfile(userId);
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error : new Error('Failed to fetch cognitive profile'),
      });
    }
  }, [adapter, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const invalidateCache = useCallback(async () => {
    try {
      await adapter.invalidateCognitiveCache(userId);
      await refresh();
    } catch (error) {
      console.error('Failed to invalidate cognitive cache:', error);
    }
  }, [adapter, userId, refresh]);

  return {
    ...state,
    refresh,
    invalidateCache,
  };
}

/**
 * 学习档案Hook
 */
export function useLearningProfile(adapter: UserProfileAdapter, userId: string) {
  const [state, setState] = useState<HookState<UserLearningProfile>>({
    data: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const data = await adapter.getUserLearningProfile(userId);
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error : new Error('Failed to fetch learning profile'),
      });
    }
  }, [adapter, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateProfile = useCallback(
    async (params: UpdateLearningProfileParams) => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        await adapter.updateUserLearningProfile(userId, params);
        await refresh();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error : new Error('Failed to update learning profile'),
        }));
      }
    },
    [adapter, userId, refresh],
  );

  return {
    ...state,
    refresh,
    updateProfile,
  };
}

/**
 * 用户统计信息Hook
 */
export function useUserStatistics(adapter: UserProfileAdapter, userId: string) {
  const [state, setState] = useState<HookState<UserStatistics>>({
    data: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const data = await adapter.getUserStatistics(userId);
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error : new Error('Failed to fetch user statistics'),
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
