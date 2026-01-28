import { useQuery } from '@tanstack/react-query';
import { semanticClient } from '../../services/client';

export function useSemanticStats(enabled: boolean = true) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['semantic-stats'],
    queryFn: () => semanticClient.getStats(),
    enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    stats: data,
    isLoading: isPending,
    error,
    refetch,
  };
}
