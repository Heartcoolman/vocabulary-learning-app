/**
 * useBroadcastSSE hook
 *
 * Subscribes to SSE stream for admin-broadcast events.
 * Requires authenticated user.
 */
import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { authClient } from '../services/client';
import { queryKeys } from '../lib/queryKeys';

export interface BroadcastEvent {
  broadcastId: string;
  title: string;
  content: string;
  priority: string;
}

interface UseBroadcastSSEOptions {
  onBroadcast?: (event: BroadcastEvent) => void;
}

export function useBroadcastSSE(options?: UseBroadcastSSEOptions) {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (!isAuthenticated || !user?.id) return;

    const token = authClient.getToken();
    if (!token) return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
    const url = `${baseUrl}/api/realtime/users/${user.id}/stream?event_types=admin-broadcast&token=${encodeURIComponent(token)}`;

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('admin-broadcast', (event) => {
      try {
        const data = JSON.parse(event.data);
        const payload = data.payload as BroadcastEvent;

        // Invalidate notifications to refresh the list
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });

        // Invoke callback
        options?.onBroadcast?.(payload);
      } catch {
        // Ignore parse errors
      }
    });

    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;

      // Reconnect after 5 seconds
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 5000);
    };
  }, [isAuthenticated, user?.id, queryClient, options]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connect]);
}
