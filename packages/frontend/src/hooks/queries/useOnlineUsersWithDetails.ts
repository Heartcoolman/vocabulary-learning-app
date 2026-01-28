import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { apiClient, type OnlineUsersResponse } from '../../services/client';

export interface OnlineUsersWithDetailsParams {
  page?: number;
  limit?: number;
}

export function useOnlineUsersWithDetails(params: OnlineUsersWithDetailsParams = {}) {
  const { page = 1, limit = 20 } = params;

  return useQuery<OnlineUsersResponse>({
    queryKey: queryKeys.admin.onlineUsers.list({ page, limit }),
    queryFn: () => apiClient.adminGetOnlineUsersWithDetails({ page, limit }),
    placeholderData: keepPreviousData,
    staleTime: 15 * 1000,
  });
}
