import { useQuery } from '@tanstack/react-query';
import { adminClient, type SystemVersionInfo } from '../../services/client';

export const systemVersionKeys = {
  all: ['admin', 'system-version'] as const,
  info: () => [...systemVersionKeys.all, 'info'] as const,
};

export function useSystemVersion() {
  return useQuery<SystemVersionInfo>({
    queryKey: systemVersionKeys.info(),
    queryFn: () => adminClient.getSystemVersion(),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
