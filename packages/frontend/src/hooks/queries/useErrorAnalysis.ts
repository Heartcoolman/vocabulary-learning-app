import { useQuery } from '@tanstack/react-query';
import { semanticClient } from '../../services/client';

export function useErrorAnalysis(enabled: boolean = true) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['error-analysis'],
    queryFn: () => semanticClient.getErrorAnalysis(),
    enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    analysis: data,
    isLoading: isPending,
    error,
    refetch,
  };
}
