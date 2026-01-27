import { useState, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { semanticClient } from '../../services/client';

interface UseSemanticSearchOptions {
  query: string;
  enabled?: boolean;
  debounceMs?: number;
  limit?: number;
  wordBookId?: string;
}

export function useSemanticSearch({
  query,
  enabled = true,
  debounceMs = 500,
  limit = 20,
  wordBookId,
}: UseSemanticSearchOptions) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  const shouldFetch = enabled && debouncedQuery.trim().length > 0;

  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['semantic-search', debouncedQuery, limit, wordBookId],
    queryFn: () => semanticClient.search(debouncedQuery, limit, wordBookId),
    enabled: shouldFetch,
    staleTime: 1000 * 60 * 5, // 5 minutes
    placeholderData: keepPreviousData,
  });

  return {
    results: data?.words || [],
    query: data?.query || '',
    isLoading: isPending,
    isFetching,
    error,
    debouncedQuery,
    refetch,
  };
}
