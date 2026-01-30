/**
 * useLLMAdvisor - LLM 顾问状态查询 Hooks
 *
 * 封装 AdminClient 中的 LLM Advisor 方法，提供 React Query 集成
 * 注意：LLM Advisor API 需要管理员权限
 */

import { useQuery } from '@tanstack/react-query';
import { adminClient } from '../../services/client';

/**
 * 获取 LLM 待审核建议数量
 */
export function useLLMPendingCount() {
  return useQuery({
    queryKey: ['llmAdvisor', 'pendingCount'],
    queryFn: async () => {
      const data = await adminClient.getLLMAdvisorPendingCount();
      return data.count;
    },
    staleTime: 30 * 1000, // 30秒
    refetchInterval: 60 * 1000, // 每分钟自动刷新
  });
}
