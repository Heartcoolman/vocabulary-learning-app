import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminClient, type OTAUpdateStatus } from '../../services/client';

export const otaUpdateKeys = {
  all: ['admin', 'ota-update'] as const,
  status: () => [...otaUpdateKeys.all, 'status'] as const,
};

export function useOTAUpdate() {
  const queryClient = useQueryClient();
  const [isPolling, setIsPolling] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    data: updateStatus,
    error: statusError,
    isPending: isCheckingStatus,
    refetch: refetchStatus,
  } = useQuery<OTAUpdateStatus>({
    queryKey: otaUpdateKeys.status(),
    queryFn: () => adminClient.getUpdateStatus(),
    enabled: isPolling || isModalOpen,
    refetchInterval: (query) => {
      const status = query.state.data?.stage;
      if (status === 'pulling' || status === 'restarting') {
        return 2000;
      }
      return false;
    },
    gcTime: 0,
    staleTime: 0,
  });

  const triggerUpdateMutation = useMutation({
    mutationFn: () => adminClient.triggerSystemUpdate(),
    onSuccess: () => {
      setIsPolling(true);
      queryClient.invalidateQueries({ queryKey: otaUpdateKeys.status() });
    },
  });

  useEffect(() => {
    if (updateStatus) {
      if (updateStatus.stage === 'pulling' || updateStatus.stage === 'restarting') {
        setIsPolling(true);
      } else if (updateStatus.stage === 'completed' || updateStatus.stage === 'failed') {
        setIsPolling(false);
      }
    }
  }, [updateStatus]);

  const resetUpdate = useCallback(() => {
    setIsPolling(false);
    setIsModalOpen(false);
    triggerUpdateMutation.reset();
    queryClient.removeQueries({ queryKey: otaUpdateKeys.status() });
  }, [queryClient, triggerUpdateMutation]);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const isUpdateInProgress =
    updateStatus?.stage === 'pulling' || updateStatus?.stage === 'restarting';

  return {
    triggerUpdate: triggerUpdateMutation.mutate,
    triggerUpdateAsync: triggerUpdateMutation.mutateAsync,
    isTriggering: triggerUpdateMutation.isPending,
    triggerError: triggerUpdateMutation.error,
    updateStatus,
    statusError,
    isCheckingStatus,
    isPolling,
    isUpdateInProgress,
    resetUpdate,
    openModal,
    closeModal,
    refetchStatus,
  };
}
