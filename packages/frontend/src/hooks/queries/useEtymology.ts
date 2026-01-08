import { useQuery } from '@tanstack/react-query';
import type { WordEtymology, WordFamily, RootFeatures } from '@danci/shared';
import { etymologyClient } from '../../services/client/etymology/EtymologyClient';

const ETYMOLOGY_STALE_TIME = 30 * 60 * 1000;

export const etymologyKeys = {
  all: ['etymology'] as const,
  word: (wordId: string) => [...etymologyKeys.all, 'word', wordId] as const,
  family: (morphemeId: string) => [...etymologyKeys.all, 'family', morphemeId] as const,
  rootFeatures: (wordId: string) => [...etymologyKeys.all, 'rootFeatures', wordId] as const,
  search: (query: string) => [...etymologyKeys.all, 'search', query] as const,
};

export interface UseWordEtymologyOptions {
  wordId: string;
  enabled?: boolean;
}

export function useWordEtymology({ wordId, enabled = true }: UseWordEtymologyOptions) {
  const shouldFetch = Boolean(wordId && enabled);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: etymologyKeys.word(wordId),
    queryFn: () => etymologyClient.getWordEtymology(wordId),
    enabled: shouldFetch,
    staleTime: ETYMOLOGY_STALE_TIME,
    gcTime: ETYMOLOGY_STALE_TIME * 2,
  });

  return {
    etymology: data,
    isLoading,
    isFetching,
    error: error as Error | null,
    refetch,
    hasEtymology: Boolean(data),
  };
}

export interface UseWordFamilyOptions {
  morphemeId: string;
  limit?: number;
  enabled?: boolean;
}

export function useWordFamily({ morphemeId, limit = 20, enabled = true }: UseWordFamilyOptions) {
  const shouldFetch = Boolean(morphemeId && enabled);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: etymologyKeys.family(morphemeId),
    queryFn: () => etymologyClient.getWordFamily(morphemeId, limit),
    enabled: shouldFetch,
    staleTime: ETYMOLOGY_STALE_TIME,
    gcTime: ETYMOLOGY_STALE_TIME * 2,
  });

  return {
    family: data,
    isLoading,
    isFetching,
    error: error as Error | null,
    refetch,
  };
}

export interface UseRootFeaturesOptions {
  wordId: string;
  enabled?: boolean;
}

export function useRootFeatures({ wordId, enabled = true }: UseRootFeaturesOptions) {
  const shouldFetch = Boolean(wordId && enabled);

  const { data, isLoading, error } = useQuery({
    queryKey: etymologyKeys.rootFeatures(wordId),
    queryFn: () => etymologyClient.getRootFeatures(wordId),
    enabled: shouldFetch,
    staleTime: 5 * 60 * 1000,
  });

  return {
    rootFeatures: data ?? { rootCount: 0, knownRootRatio: 0, avgRootMastery: 0, maxRootMastery: 0 },
    isLoading,
    error: error as Error | null,
    hasRoots: (data?.rootCount ?? 0) > 0,
  };
}
