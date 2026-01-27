import { useQuery } from '@tanstack/react-query';
import { semanticClient } from '../../services/client';

interface UseConfusionPairsOptions {
  wordBookId?: string;
  clusterId?: string;
  threshold?: number;
  limit?: number;
  page?: number;
  pageSize?: number;
  enabled?: boolean;
}

export function useConfusionPairs({
  wordBookId,
  clusterId,
  threshold = 0.15,
  limit,
  page = 1,
  pageSize = 20,
  enabled = true,
}: UseConfusionPairsOptions = {}) {
  const effectivePageSize = limit ?? pageSize;
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['confusion-pairs', wordBookId, clusterId, threshold, page, effectivePageSize],
    queryFn: () =>
      semanticClient.getConfusionPairs({
        wordBookId,
        clusterId,
        threshold,
        pageSize: effectivePageSize,
        page,
      }),
    enabled,
    staleTime: 1000 * 60 * 10,
  });

  return {
    pairs: data || [],
    isLoading: isPending,
    error,
    refetch,
  };
}
