import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminClient } from '../../services/client';

export const restartBackendKeys = {
  status: () => ['admin', 'restart-status'] as const,
};

export function useRestartBackend() {
  const queryClient = useQueryClient();
  const [isRestarting, setIsRestarting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  // Track dataUpdatedAt to detect fresh responses after restart
  const restartStartedAt = useRef<number>(0);

  const { data: versionInfo, dataUpdatedAt } = useQuery({
    queryKey: restartBackendKeys.status(),
    queryFn: () => adminClient.getSystemVersion(),
    enabled: isRestarting,
    refetchInterval: 2000,
    retry: true,
    retryDelay: 1000,
    gcTime: 0,
  });

  const restartMutation = useMutation({
    mutationFn: () => adminClient.restartBackend(),
    onSuccess: () => {
      // Record when restart started to ignore stale versionInfo
      restartStartedAt.current = Date.now();
      // Clear any cached version info before starting to poll
      queryClient.removeQueries({ queryKey: restartBackendKeys.status() });
      setIsRestarting(true);
      setIsConfirmOpen(false);
    },
  });

  useEffect(() => {
    // Only trigger reload if versionInfo was fetched AFTER restart started
    if (isRestarting && versionInfo && dataUpdatedAt > restartStartedAt.current) {
      const timer = setTimeout(() => {
        setIsRestarting(false);
        restartMutation.reset();
        window.location.reload();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isRestarting, versionInfo, dataUpdatedAt, restartMutation]);

  const openConfirmModal = useCallback(() => setIsConfirmOpen(true), []);
  const closeConfirmModal = useCallback(() => setIsConfirmOpen(false), []);

  return {
    restartBackend: restartMutation.mutate,
    isPending: restartMutation.isPending,
    error: restartMutation.error,
    isRestarting,
    isConfirmOpen,
    openConfirmModal,
    closeConfirmModal,
  };
}
