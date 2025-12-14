import { QueryClient } from '@tanstack/react-query';

/**
 * 创建并配置 React Query 客户端
 *
 * 配置说明：
 * - staleTime: 数据被认为是新鲜的时间（毫秒）
 * - cacheTime: 未使用的缓存数据保留时间（毫秒）
 * - retry: 失败请求的重试次数
 * - refetchOnWindowFocus: 窗口重新获得焦点时是否重新请求
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 数据在 5 分钟内被认为是新鲜的
      staleTime: 5 * 60 * 1000,

      // 缓存保留 10 分钟
      gcTime: 10 * 60 * 1000,

      // 失败时重试 1 次
      retry: 1,

      // 窗口重新获得焦点时不自动重新请求
      refetchOnWindowFocus: false,

      // 重新连接时自动重新请求
      refetchOnReconnect: true,

      // 挂载时不自动重新请求（除非数据过期）
      refetchOnMount: true,
    },
    mutations: {
      // 失败时重试 0 次
      retry: 0,
    },
  },
});

/**
 * 清除所有查询缓存
 */
export const clearAllQueries = () => {
  queryClient.clear();
};

/**
 * 使指定查询失效并重新请求
 */
export const invalidateQueries = (queryKey: unknown[]) => {
  return queryClient.invalidateQueries({ queryKey });
};

/**
 * 预取数据
 */
export const prefetchQuery = <T>(queryKey: unknown[], queryFn: () => Promise<T>) => {
  return queryClient.prefetchQuery({ queryKey, queryFn });
};
