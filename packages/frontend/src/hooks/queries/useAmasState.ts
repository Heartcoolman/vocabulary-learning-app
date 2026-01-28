import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { DATA_CACHE_CONFIG, CACHE_TIME, GC_TIME } from '../../lib/cacheConfig';
import { apiClient } from '../../services/client';

/**
 * 获取AMAS用户状态的Query Hook
 *
 * ⚠️ AMAS状态具有实时性要求，需要合理配置缓存策略：
 * - staleTime: 30秒 - 状态数据在30秒内视为新鲜
 * - gcTime: 5分钟 - 5分钟后缓存数据可被垃圾回收
 * - refetchOnWindowFocus: true - 窗口获得焦点时重新获取
 *
 * 使用场景：
 * - AmasStatus 组件实时显示用户状态
 * - 学习页面根据状态调整策略
 * - 管理员监控用户状态
 */
export function useAmasState() {
  return useQuery({
    queryKey: queryKeys.amas.state(),
    queryFn: async () => {
      return await apiClient.getAmasState();
    },
    // AMAS状态实时性配置 - 使用 DATA_CACHE_CONFIG.amasState 预设
    ...DATA_CACHE_CONFIG.amasState,
  });
}

/**
 * 获取AMAS策略的Query Hook
 *
 * 策略数据相对状态更稳定，可以使用较长的缓存时间
 */
export function useAmasStrategy() {
  return useQuery({
    queryKey: queryKeys.amas.strategy(),
    queryFn: async () => {
      return await apiClient.getAmasStrategy();
    },
    staleTime: CACHE_TIME.SHORT, // 1分钟
    gcTime: GC_TIME.MEDIUM, // 10分钟
    retry: 2,
  });
}

/**
 * 获取AMAS冷启动阶段的Query Hook
 *
 * 冷启动阶段变化较慢，可以使用更长的缓存时间
 */
export function useAmasColdStartPhase() {
  return useQuery({
    queryKey: queryKeys.amas.phase(),
    queryFn: async () => {
      return await apiClient.getAmasColdStartPhase();
    },
    staleTime: CACHE_TIME.MEDIUM_SHORT, // 2分钟
    gcTime: GC_TIME.LONG, // 15分钟
    retry: 2,
  });
}

/**
 * 手动刷新AMAS状态的Hook
 *
 * 用于在学习事件后立即刷新状态显示
 *
 * @example
 * ```tsx
 * const { refreshAmasState } = useRefreshAmasState();
 *
 * // 提交答案后刷新
 * await processLearningEvent(eventData);
 * refreshAmasState();
 * ```
 */
export function useRefreshAmasState() {
  const queryClient = useQueryClient();

  const refreshAmasState = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.amas.state() });
  };

  const refreshAmasStrategy = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.amas.strategy() });
  };

  const refreshAmasPhase = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.amas.phase() });
  };

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.amas.all });
  };

  return {
    refreshAmasState,
    refreshAmasStrategy,
    refreshAmasPhase,
    refreshAll,
  };
}

/**
 * 预加载AMAS状态的Hook
 *
 * 用于在用户可能需要之前预先加载数据
 *
 * @example
 * ```tsx
 * const { prefetchAmasState } = usePrefetchAmasState();
 *
 * // 在鼠标悬停时预加载
 * <button onMouseEnter={() => prefetchAmasState()}>
 *   查看状态
 * </button>
 * ```
 */
export function usePrefetchAmasState() {
  const queryClient = useQueryClient();

  const prefetchAmasState = async () => {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.amas.state(),
      queryFn: async () => {
        return await apiClient.getAmasState();
      },
      staleTime: CACHE_TIME.REALTIME,
    });
  };

  return { prefetchAmasState };
}
