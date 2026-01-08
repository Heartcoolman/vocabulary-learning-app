/**
 * Realtime API适配器
 * 封装SSE连接和实时事件监听
 */

import type {
  RealtimeEvent,
  SSEConnectionState,
  SSEConnectionConfig,
  SSEConnectionInfo,
  RealtimeStats,
} from '../types/realtime';
import { ApiClient } from './base-client';
import { getAuthToken, logger, safeJsonParse } from '../utils/helpers';

/**
 * 事件监听器类型
 */
export type EventListener<T = RealtimeEvent> = (event: T) => void;

/**
 * Realtime API适配器类
 */
export class RealtimeAdapter {
  private client: ApiClient;
  private eventSource: EventSource | null = null;
  private connectionInfo: SSEConnectionInfo;
  private listeners: Map<string, Set<EventListener>> = new Map();
  private globalListeners: Set<EventListener> = new Set();
  private config: SSEConnectionConfig | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(client: ApiClient) {
    this.client = client;
    this.connectionInfo = {
      state: SSEConnectionState.DISCONNECTED,
      sessionId: '',
      connectedAt: null,
      lastHeartbeat: null,
      reconnectAttempts: 0,
      error: null,
    };
  }

  /**
   * 连接到SSE流
   */
  connect(config: SSEConnectionConfig): void {
    // 如果已经连接，先断开
    if (this.eventSource) {
      this.disconnect();
    }

    this.config = {
      autoReconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 10,
      heartbeatTimeout: 60000,
      ...config,
    };

    this.connectionInfo.sessionId = config.sessionId;
    this.connectionInfo.state = SSEConnectionState.CONNECTING;

    logger.debug('Connecting to SSE stream', config);

    this.createEventSource();
  }

  /**
   * 创建EventSource连接
   */
  private createEventSource(): void {
    if (!this.config) return;

    const { sessionId, eventTypes } = this.config;
    const token = getAuthToken();

    // 构建URL
    const params = new URLSearchParams();
    if (eventTypes && eventTypes.length > 0) {
      params.set('eventTypes', eventTypes.join(','));
    }

    const url = `/api/v1/realtime/sessions/${sessionId}/stream?${params}`;

    // 注意：EventSource不支持自定义headers，需要通过URL传递token或使用cookie
    // 这里假设后端支持通过查询参数传递token（需要后端配合）
    const fullUrl = token ? `${url}&token=${encodeURIComponent(token)}` : url;

    try {
      this.eventSource = new EventSource(fullUrl);

      // 监听连接打开
      this.eventSource.onopen = () => {
        this.handleOpen();
      };

      // 监听错误
      this.eventSource.onerror = (error) => {
        this.handleError(error);
      };

      // 监听所有事件类型
      this.setupEventListeners();
    } catch (error) {
      logger.error('Failed to create EventSource', error);
      this.handleError(error);
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    if (!this.eventSource) return;

    // 监听所有可能的事件类型
    const eventTypes = [
      'feedback',
      'alert',
      'flow-update',
      'next-suggestion',
      'forgetting-alert',
      'quality-task-progress',
      'ping',
      'error',
    ];

    for (const eventType of eventTypes) {
      this.eventSource.addEventListener(eventType, (event: MessageEvent) => {
        this.handleMessage(event);
      });
    }
  }

  /**
   * 处理连接打开
   */
  private handleOpen(): void {
    logger.info('SSE connection opened');

    this.connectionInfo.state = SSEConnectionState.CONNECTED;
    this.connectionInfo.connectedAt = new Date();
    this.connectionInfo.reconnectAttempts = 0;
    this.connectionInfo.error = null;

    // 启动心跳检测
    this.startHeartbeatCheck();

    // 触发连接状态变化事件
    this.emitConnectionStateChange();
  }

  /**
   * 处理消息
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data = safeJsonParse<RealtimeEvent>(event.data);

      if (!data) {
        logger.warn('Failed to parse SSE message', event.data);
        return;
      }

      logger.debug('Received SSE event', data);

      // 如果是心跳事件，更新心跳时间
      if (data.type === 'ping') {
        this.connectionInfo.lastHeartbeat = new Date();
      }

      // 触发事件监听器
      this.emitEvent(data);
    } catch (error) {
      logger.error('Error handling SSE message', error);
    }
  }

  /**
   * 处理错误
   */
  private handleError(error: any): void {
    logger.error('SSE connection error', error);

    this.connectionInfo.state = SSEConnectionState.ERROR;
    this.connectionInfo.error = error instanceof Error ? error : new Error('SSE connection error');

    // 停止心跳检测
    this.stopHeartbeatCheck();

    // 触发连接状态变化事件
    this.emitConnectionStateChange();

    // 尝试重连
    if (this.config?.autoReconnect) {
      this.attemptReconnect();
    }
  }

  /**
   * 尝试重连
   */
  private attemptReconnect(): void {
    if (!this.config) return;

    const { maxReconnectAttempts, reconnectInterval } = this.config;

    if (this.connectionInfo.reconnectAttempts >= maxReconnectAttempts!) {
      logger.error('Max reconnection attempts reached');
      this.connectionInfo.state = SSEConnectionState.DISCONNECTED;
      this.emitConnectionStateChange();
      return;
    }

    this.connectionInfo.state = SSEConnectionState.RECONNECTING;
    this.connectionInfo.reconnectAttempts++;

    logger.info(
      `Attempting to reconnect (${this.connectionInfo.reconnectAttempts}/${maxReconnectAttempts})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.createEventSource();
    }, reconnectInterval);
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    logger.info('Disconnecting SSE connection');

    // 关闭EventSource
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    // 清除定时器
    this.stopHeartbeatCheck();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // 更新连接状态
    this.connectionInfo.state = SSEConnectionState.DISCONNECTED;
    this.connectionInfo.connectedAt = null;
    this.connectionInfo.lastHeartbeat = null;

    // 触发连接状态变化事件
    this.emitConnectionStateChange();
  }

  /**
   * 启动心跳检测
   */
  private startHeartbeatCheck(): void {
    this.stopHeartbeatCheck();

    if (!this.config?.heartbeatTimeout) return;

    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const lastHeartbeat = this.connectionInfo.lastHeartbeat?.getTime() || 0;
      const timeSinceLastHeartbeat = now - lastHeartbeat;

      if (timeSinceLastHeartbeat > this.config!.heartbeatTimeout!) {
        logger.warn('Heartbeat timeout detected');
        this.handleError(new Error('Heartbeat timeout'));
      }
    }, 10000); // 每10秒检查一次
  }

  /**
   * 停止心跳检测
   */
  private stopHeartbeatCheck(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 触发事件
   */
  private emitEvent(event: RealtimeEvent): void {
    // 触发类型特定的监听器
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        try {
          listener(event);
        } catch (error) {
          logger.error('Error in event listener', error);
        }
      }
    }

    // 触发全局监听器
    for (const listener of this.globalListeners) {
      try {
        listener(event);
      } catch (error) {
        logger.error('Error in global event listener', error);
      }
    }
  }

  /**
   * 触发连接状态变化事件
   */
  private emitConnectionStateChange(): void {
    const stateChangeEvent: RealtimeEvent = {
      type: 'alert',
      payload: {
        alertId: `conn_state_${Date.now()}`,
        alertType: 'info',
        title: 'Connection State Changed',
        content: `Connection state: ${this.connectionInfo.state}`,
        timestamp: new Date().toISOString(),
      },
    };

    this.emitEvent(stateChangeEvent);
  }

  /**
   * 监听特定类型的事件
   */
  on<T extends RealtimeEvent['type']>(
    eventType: T,
    listener: EventListener<Extract<RealtimeEvent, { type: T }>>,
  ): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }

    this.listeners.get(eventType)!.add(listener as EventListener);

    // 返回取消监听函数
    return () => this.off(eventType, listener);
  }

  /**
   * 监听所有事件
   */
  onAll(listener: EventListener): () => void {
    this.globalListeners.add(listener);

    // 返回取消监听函数
    return () => this.offAll(listener);
  }

  /**
   * 取消监听特定类型的事件
   */
  off<T extends RealtimeEvent['type']>(
    eventType: T,
    listener: EventListener<Extract<RealtimeEvent, { type: T }>>,
  ): void {
    const typeListeners = this.listeners.get(eventType);
    if (typeListeners) {
      typeListeners.delete(listener as EventListener);
    }
  }

  /**
   * 取消监听所有事件
   */
  offAll(listener: EventListener): void {
    this.globalListeners.delete(listener);
  }

  /**
   * 获取连接信息
   */
  getConnectionInfo(): SSEConnectionInfo {
    return { ...this.connectionInfo };
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<RealtimeStats> {
    const response = await this.client.get<RealtimeStats>('/v1/realtime/stats');
    return response.data!;
  }

  /**
   * 发送测试事件（仅开发环境）
   */
  async sendTestEvent(sessionId: string, eventType: string, payload: any): Promise<void> {
    await this.client.post('/v1/realtime/test', {
      sessionId,
      eventType,
      payload,
    });
  }
}

/**
 * 创建Realtime适配器
 */
export function createRealtimeAdapter(client: ApiClient): RealtimeAdapter {
  return new RealtimeAdapter(client);
}
