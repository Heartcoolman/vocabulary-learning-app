/**
 * Realtime SSE React Hooks
 * 提供React组件中使用SSE实时事件的Hook
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  RealtimeEvent,
  SSEConnectionConfig,
  SSEConnectionInfo,
  SSEConnectionState,
} from '../types/realtime';
import type { RealtimeAdapter, EventListener } from '../adapters/realtime-adapter';

/**
 * useRealtimeConnection Hook选项
 */
export interface UseRealtimeConnectionOptions extends SSEConnectionConfig {
  /** 是否自动连接 */
  autoConnect?: boolean;
  /** 组件卸载时是否自动断开 */
  autoDisconnect?: boolean;
}

/**
 * useRealtimeConnection Hook返回值
 */
export interface UseRealtimeConnectionReturn {
  /** 连接信息 */
  connectionInfo: SSEConnectionInfo;
  /** 是否已连接 */
  isConnected: boolean;
  /** 是否正在连接 */
  isConnecting: boolean;
  /** 连接错误 */
  error: Error | null;
  /** 连接函数 */
  connect: () => void;
  /** 断开连接函数 */
  disconnect: () => void;
  /** 重新连接函数 */
  reconnect: () => void;
}

/**
 * 使用实时连接Hook
 *
 * @example
 * ```tsx
 * const { isConnected, connect, disconnect } = useRealtimeConnection(adapter, {
 *   sessionId: 'session_123',
 *   eventTypes: ['feedback', 'alert'],
 *   autoConnect: true,
 * });
 * ```
 */
export function useRealtimeConnection(
  adapter: RealtimeAdapter,
  options: UseRealtimeConnectionOptions,
): UseRealtimeConnectionReturn {
  const {
    sessionId,
    eventTypes,
    autoConnect = false,
    autoDisconnect = true,
    autoReconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
    heartbeatTimeout = 60000,
  } = options;

  const [connectionInfo, setConnectionInfo] = useState<SSEConnectionInfo>(
    adapter.getConnectionInfo(),
  );
  const isInitialMount = useRef(true);

  // 更新连接信息
  const updateConnectionInfo = useCallback(() => {
    setConnectionInfo(adapter.getConnectionInfo());
  }, [adapter]);

  // 连接函数
  const connect = useCallback(() => {
    adapter.connect({
      sessionId,
      eventTypes,
      autoReconnect,
      reconnectInterval,
      maxReconnectAttempts,
      heartbeatTimeout,
    });
    updateConnectionInfo();
  }, [
    adapter,
    sessionId,
    eventTypes,
    autoReconnect,
    reconnectInterval,
    maxReconnectAttempts,
    heartbeatTimeout,
    updateConnectionInfo,
  ]);

  // 断开连接函数
  const disconnect = useCallback(() => {
    adapter.disconnect();
    updateConnectionInfo();
  }, [adapter, updateConnectionInfo]);

  // 重新连接函数
  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(() => connect(), 100);
  }, [connect, disconnect]);

  // 监听连接状态变化
  useEffect(() => {
    // 监听所有事件以更新连接信息
    const unsubscribe = adapter.onAll(() => {
      updateConnectionInfo();
    });

    return () => {
      unsubscribe();
    };
  }, [adapter, updateConnectionInfo]);

  // 自动连接
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (autoConnect) {
        connect();
      }
    }
  }, [autoConnect, connect]);

  // 自动断开连接
  useEffect(() => {
    return () => {
      if (autoDisconnect) {
        adapter.disconnect();
      }
    };
  }, [adapter, autoDisconnect]);

  return {
    connectionInfo,
    isConnected: connectionInfo.state === SSEConnectionState.CONNECTED,
    isConnecting:
      connectionInfo.state === SSEConnectionState.CONNECTING ||
      connectionInfo.state === SSEConnectionState.RECONNECTING,
    error: connectionInfo.error,
    connect,
    disconnect,
    reconnect,
  };
}

/**
 * useRealtimeEvent Hook返回值
 */
export interface UseRealtimeEventReturn<T extends RealtimeEvent> {
  /** 最新事件 */
  latestEvent: T | null;
  /** 事件历史 */
  events: T[];
  /** 清除事件历史 */
  clearEvents: () => void;
}

/**
 * 监听特定类型的实时事件Hook
 *
 * @example
 * ```tsx
 * const { latestEvent, events } = useRealtimeEvent(adapter, 'feedback', {
 *   maxHistory: 50,
 * });
 * ```
 */
export function useRealtimeEvent<T extends RealtimeEvent['type']>(
  adapter: RealtimeAdapter,
  eventType: T,
  options?: {
    /** 最大历史记录数 */
    maxHistory?: number;
    /** 事件回调 */
    onEvent?: (event: Extract<RealtimeEvent, { type: T }>) => void;
  },
): UseRealtimeEventReturn<Extract<RealtimeEvent, { type: T }>> {
  const { maxHistory = 100, onEvent } = options || {};

  const [latestEvent, setLatestEvent] = useState<Extract<RealtimeEvent, { type: T }> | null>(null);
  const [events, setEvents] = useState<Extract<RealtimeEvent, { type: T }>[]>([]);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setLatestEvent(null);
  }, []);

  useEffect(() => {
    const listener: EventListener<Extract<RealtimeEvent, { type: T }>> = (event) => {
      setLatestEvent(event);
      setEvents((prev) => {
        const newEvents = [...prev, event];
        // 限制历史记录数量
        return newEvents.slice(-maxHistory);
      });

      // 调用自定义回调
      if (onEvent) {
        onEvent(event);
      }
    };

    const unsubscribe = adapter.on(eventType, listener);

    return () => {
      unsubscribe();
    };
  }, [adapter, eventType, maxHistory, onEvent]);

  return {
    latestEvent,
    events,
    clearEvents,
  };
}

/**
 * 监听所有实时事件Hook
 *
 * @example
 * ```tsx
 * const { latestEvent, events, eventsByType } = useRealtimeEvents(adapter, {
 *   maxHistory: 50,
 * });
 * ```
 */
export function useRealtimeEvents(
  adapter: RealtimeAdapter,
  options?: {
    /** 最大历史记录数 */
    maxHistory?: number;
    /** 事件回调 */
    onEvent?: (event: RealtimeEvent) => void;
  },
): {
  latestEvent: RealtimeEvent | null;
  events: RealtimeEvent[];
  eventsByType: Record<string, RealtimeEvent[]>;
  clearEvents: () => void;
} {
  const { maxHistory = 100, onEvent } = options || {};

  const [latestEvent, setLatestEvent] = useState<RealtimeEvent | null>(null);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [eventsByType, setEventsByType] = useState<Record<string, RealtimeEvent[]>>({});

  const clearEvents = useCallback(() => {
    setEvents([]);
    setEventsByType({});
    setLatestEvent(null);
  }, []);

  useEffect(() => {
    const listener: EventListener = (event) => {
      setLatestEvent(event);

      setEvents((prev) => {
        const newEvents = [...prev, event];
        return newEvents.slice(-maxHistory);
      });

      setEventsByType((prev) => {
        const typeEvents = prev[event.type] || [];
        return {
          ...prev,
          [event.type]: [...typeEvents, event].slice(-maxHistory),
        };
      });

      if (onEvent) {
        onEvent(event);
      }
    };

    const unsubscribe = adapter.onAll(listener);

    return () => {
      unsubscribe();
    };
  }, [adapter, maxHistory, onEvent]);

  return {
    latestEvent,
    events,
    eventsByType,
    clearEvents,
  };
}

/**
 * 获取实时统计信息Hook
 *
 * @example
 * ```tsx
 * const { stats, loading, refresh } = useRealtimeStats(adapter, {
 *   autoRefresh: true,
 *   refreshInterval: 5000,
 * });
 * ```
 */
export function useRealtimeStats(
  adapter: RealtimeAdapter,
  options?: {
    /** 是否自动刷新 */
    autoRefresh?: boolean;
    /** 刷新间隔（毫秒） */
    refreshInterval?: number;
  },
) {
  const { autoRefresh = false, refreshInterval = 10000 } = options || {};

  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adapter.getStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch stats'));
    } finally {
      setLoading(false);
    }
  }, [adapter]);

  // 自动刷新
  useEffect(() => {
    if (autoRefresh) {
      refresh();
      const timer = setInterval(refresh, refreshInterval);
      return () => clearInterval(timer);
    }
  }, [autoRefresh, refreshInterval, refresh]);

  return {
    stats,
    loading,
    error,
    refresh,
  };
}
