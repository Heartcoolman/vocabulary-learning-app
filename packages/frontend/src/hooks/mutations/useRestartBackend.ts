import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminClient } from '../../services/client';

export const restartBackendKeys = {
  status: () => ['admin', 'restart-status'] as const,
};

export function useRestartBackend() {
  const queryClient = useQueryClient();
  const [isRestarting, setIsRestarting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const { data: versionInfo } = useQuery({
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
      setIsRestarting(true);
      setIsConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: restartBackendKeys.status() });
    },
  });

  useEffect(() => {
    if (isRestarting && versionInfo) {
      const timer = setTimeout(() => {
        setIsRestarting(false);
        restartMutation.reset();
        window.location.reload();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isRestarting, versionInfo, restartMutation]);

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
