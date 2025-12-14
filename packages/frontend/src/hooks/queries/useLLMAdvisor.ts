/**
 * useLLMAdvisor - LLM 顾问状态查询 Hooks
 *
 * 封装 LLMAdvisorClient 中的方法，提供 React Query 集成
 */

import { useQuery } from '@tanstack/react-query';
import { llmAdvisorClient } from '../../services/client';

/**
 * 获取 LLM 待审核建议数量
 */
export function useLLMPendingCount() {
  return useQuery({
    queryKey: ['llmAdvisor', 'pendingCount'],
    queryFn: async () => {
      const data = await llmAdvisorClient.getPendingCount();
      return data.count;
    },
    staleTime: 30 * 1000, // 30秒
    refetchInterval: 60 * 1000, // 每分钟自动刷新
  });
}
