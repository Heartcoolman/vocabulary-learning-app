import { useQuery } from '@tanstack/react-query';
import { semanticClient } from '../../services/client';

export function useWordClusters(enabled: boolean = true) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['word-clusters'],
    queryFn: () => semanticClient.getClusters(),
    enabled,
    staleTime: 1000 * 60 * 30,
  });

  return {
    clusters: data || [],
    isLoading: isPending,
    error,
    refetch,
  };
}

export function useClusterDetail(clusterId: string, enabled: boolean = true) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['cluster-detail', clusterId],
    queryFn: () => semanticClient.getClusterDetail(clusterId),
    enabled: enabled && !!clusterId,
    staleTime: 1000 * 60 * 15,
  });

  return {
    cluster: data,
    isLoading: isPending,
    error,
    refetch,
  };
}
