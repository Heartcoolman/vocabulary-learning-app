/**
 * 系统调试配置
 * 用于控制各模块的运行时开关和模拟故障场景
 */

import { env } from './env';

// ==================== 类型定义 ====================

/**
 * 基础设施调试配置
 */
export interface InfrastructureDebugConfig {
  redis: {
    enabled: boolean;
  };
  database: {
    simulateSlowQuery: boolean;
    slowQueryDelayMs: number;
    simulateConnectionFailure: boolean;
  };
  llm: {
    enabled: boolean;
    mockResponse: boolean;
    mockDelay: number;
  };
}

/**
 * 核心服务调试配置
 */
export interface ServicesDebugConfig {
  behaviorFatigue: boolean;
  delayedReward: boolean;
  optimization: boolean;
  stateHistory: boolean;
  tracking: boolean;
}

/**
 * AMAS调试配置（熔断器相关）
 */
export interface AmasDebugConfig {
  forceCircuitOpen: boolean;
  simulateFallbackReason: string | null;
}

/**
 * 完整调试配置
 */
export interface DebugConfig {
  enabled: boolean;
  infrastructure: InfrastructureDebugConfig;
  services: ServicesDebugConfig;
  amas: AmasDebugConfig;
  auditLog: boolean;
  maxSimulationDurationMs: number;
}

// ==================== 默认配置 ====================

const DEFAULT_DEBUG_CONFIG: DebugConfig = {
  enabled: env.NODE_ENV !== 'production' || env.DEBUG_MODE,
  infrastructure: {
    redis: { enabled: true },
    database: {
      simulateSlowQuery: false,
      slowQueryDelayMs: 0,
      simulateConnectionFailure: false,
    },
    llm: {
      enabled: true,
      mockResponse: false,
      mockDelay: 0,
    },
  },
  services: {
    behaviorFatigue: true,
    delayedReward: true,
    optimization: true,
    stateHistory: true,
    tracking: true,
  },
  amas: {
    forceCircuitOpen: false,
    simulateFallbackReason: null,
  },
  auditLog: true,
  maxSimulationDurationMs: 5 * 60 * 1000, // 5分钟最大模拟时长
};

// ==================== 运行时状态 ====================

let currentConfig: DebugConfig = { ...DEFAULT_DEBUG_CONFIG };
let simulationStartTime: number | null = null;
let simulationTimer: NodeJS.Timeout | null = null;

// ==================== 访问接口 ====================

/**
 * 获取当前调试配置
 */
export function getDebugConfig(): Readonly<DebugConfig> {
  return currentConfig;
}

/**
 * 检查调试模式是否启用
 */
export function isDebugEnabled(): boolean {
  return currentConfig.enabled;
}

/**
 * 更新调试配置
 */
export function updateDebugConfig(updates: Partial<DebugConfig>): DebugConfig {
  currentConfig = {
    ...currentConfig,
    ...updates,
    infrastructure: {
      ...currentConfig.infrastructure,
      ...(updates.infrastructure || {}),
      redis: {
        ...currentConfig.infrastructure.redis,
        ...(updates.infrastructure?.redis || {}),
      },
      database: {
        ...currentConfig.infrastructure.database,
        ...(updates.infrastructure?.database || {}),
      },
      llm: {
        ...currentConfig.infrastructure.llm,
        ...(updates.infrastructure?.llm || {}),
      },
    },
    services: {
      ...currentConfig.services,
      ...(updates.services || {}),
    },
    amas: {
      ...currentConfig.amas,
      ...(updates.amas || {}),
    },
  };
  return currentConfig;
}

/**
 * 更新基础设施配置
 */
export function updateInfrastructureConfig(
  updates: Partial<InfrastructureDebugConfig>,
): InfrastructureDebugConfig {
  currentConfig.infrastructure = {
    ...currentConfig.infrastructure,
    ...updates,
    redis: {
      ...currentConfig.infrastructure.redis,
      ...(updates.redis || {}),
    },
    database: {
      ...currentConfig.infrastructure.database,
      ...(updates.database || {}),
    },
    llm: {
      ...currentConfig.infrastructure.llm,
      ...(updates.llm || {}),
    },
  };
  return currentConfig.infrastructure;
}

/**
 * 更新服务配置
 */
export function updateServicesConfig(updates: Partial<ServicesDebugConfig>): ServicesDebugConfig {
  currentConfig.services = {
    ...currentConfig.services,
    ...updates,
  };
  return currentConfig.services;
}

/**
 * 更新AMAS调试配置
 */
export function updateAmasDebugConfig(updates: Partial<AmasDebugConfig>): AmasDebugConfig {
  currentConfig.amas = {
    ...currentConfig.amas,
    ...updates,
  };
  return currentConfig.amas;
}

/**
 * 重置为默认配置
 */
export function resetDebugConfig(): DebugConfig {
  clearSimulationTimer();
  currentConfig = { ...DEFAULT_DEBUG_CONFIG };
  return currentConfig;
}

// ==================== 模拟控制 ====================

/**
 * 开始模拟（设置超时自动恢复）
 */
export function startSimulation(): void {
  if (simulationTimer) {
    clearTimeout(simulationTimer);
  }
  simulationStartTime = Date.now();
  simulationTimer = setTimeout(() => {
    resetDebugConfig();
    simulationStartTime = null;
    simulationTimer = null;
  }, currentConfig.maxSimulationDurationMs);
}

/**
 * 停止模拟
 */
export function stopSimulation(): void {
  clearSimulationTimer();
  resetDebugConfig();
}

/**
 * 清除模拟定时器
 */
function clearSimulationTimer(): void {
  if (simulationTimer) {
    clearTimeout(simulationTimer);
    simulationTimer = null;
  }
  simulationStartTime = null;
}

/**
 * 获取模拟剩余时间
 */
export function getSimulationRemainingMs(): number | null {
  if (!simulationStartTime) return null;
  const elapsed = Date.now() - simulationStartTime;
  const remaining = currentConfig.maxSimulationDurationMs - elapsed;
  return remaining > 0 ? remaining : 0;
}

// ==================== 便捷检查函数 ====================

export function isRedisEnabled(): boolean {
  return currentConfig.infrastructure.redis.enabled;
}

export function shouldSimulateSlowQuery(): boolean {
  return currentConfig.infrastructure.database.simulateSlowQuery;
}

export function getSlowQueryDelay(): number {
  return currentConfig.infrastructure.database.slowQueryDelayMs;
}

export function shouldSimulateDbFailure(): boolean {
  return currentConfig.infrastructure.database.simulateConnectionFailure;
}

export function isLlmEnabled(): boolean {
  return currentConfig.infrastructure.llm.enabled;
}

export function shouldMockLlm(): boolean {
  return currentConfig.infrastructure.llm.mockResponse;
}

export function isServiceEnabled(service: keyof ServicesDebugConfig): boolean {
  return currentConfig.services[service];
}

export function shouldForceCircuitOpen(): boolean {
  return currentConfig.amas.forceCircuitOpen;
}

export function getSimulateFallbackReason(): string | null {
  return currentConfig.amas.simulateFallbackReason;
}
