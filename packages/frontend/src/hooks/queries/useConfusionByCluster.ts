import { useQuery } from '@tanstack/react-query';
import { semanticClient } from '../../services/client';

interface UseConfusionByClusterOptions {
  threshold?: number;
  enabled?: boolean;
}

export function useConfusionByCluster({
  threshold = 0.15,
  enabled = true,
}: UseConfusionByClusterOptions = {}) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['confusion-by-cluster', threshold],
    queryFn: () => semanticClient.getConfusionByCluster(threshold),
    enabled,
    staleTime: 1000 * 60 * 10,
  });

  return {
    clusters: data || [],
    isLoading: isPending,
    error,
    refetch,
  };
}

export function useConfusionCacheStatus(enabled = true) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['confusion-cache-status'],
    queryFn: () => semanticClient.getConfusionCacheStatus(),
    enabled,
    staleTime: 1000 * 60 * 5,
  });

  return {
    status: data,
    isLoading: isPending,
    error,
    refetch,
  };
}
