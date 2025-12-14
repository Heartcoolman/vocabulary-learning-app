/**
 * Realtime API类型定义
 * 从 @danci/shared/types/realtime 重新导出并扩展
 */

export * from '../../types/realtime';

/**
 * SSE连接状态
 */
export enum SSEConnectionState {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  ERROR = 'ERROR',
  RECONNECTING = 'RECONNECTING',
}

/**
 * SSE连接配置
 */
export interface SSEConnectionConfig {
  /** 会话ID */
  sessionId: string;
  /** 事件类型过滤 */
  eventTypes?: string[];
  /** 自动重连 */
  autoReconnect?: boolean;
  /** 重连间隔（毫秒） */
  reconnectInterval?: number;
  /** 最大重连次数 */
  maxReconnectAttempts?: number;
  /** 心跳超时（毫秒） */
  heartbeatTimeout?: number;
}

/**
 * SSE连接信息
 */
export interface SSEConnectionInfo {
  state: SSEConnectionState;
  sessionId: string;
  connectedAt: Date | null;
  lastHeartbeat: Date | null;
  reconnectAttempts: number;
  error: Error | null;
}

/**
 * 实时统计信息
 */
export interface RealtimeStats {
  totalSubscriptions: number;
  activeUsers: number;
  activeSessions: number;
}
