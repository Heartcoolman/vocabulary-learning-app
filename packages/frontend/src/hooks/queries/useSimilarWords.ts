import { useQuery } from '@tanstack/react-query';
import { semanticClient } from '../../services/client';

interface UseSimilarWordsOptions {
  wordId: string;
  enabled?: boolean;
  limit?: number;
}

export function useSimilarWords({ wordId, enabled = true, limit = 10 }: UseSimilarWordsOptions) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['similar-words', wordId, limit],
    queryFn: () => semanticClient.getSimilarWords(wordId, limit),
    enabled: !!wordId && enabled,
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  return {
    words: data || [],
    isLoading: isPending,
    error,
    refetch,
  };
}
