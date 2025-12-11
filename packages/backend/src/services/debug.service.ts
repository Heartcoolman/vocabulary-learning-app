/**
 * 系统调试服务
 * 提供统一的调试控制入口，用于测试降级、故障模拟等场景
 */

import {
  getDebugConfig,
  updateDebugConfig,
  updateInfrastructureConfig,
  updateServicesConfig,
  updateAmasDebugConfig,
  resetDebugConfig,
  startSimulation,
  stopSimulation,
  getSimulationRemainingMs,
  isDebugEnabled,
  InfrastructureDebugConfig,
  ServicesDebugConfig,
  AmasDebugConfig,
} from '../config/debug-config';
import {
  getFeatureFlags,
  updateFeatureFlags,
  resetFeatureFlags,
  AMASFeatureFlags,
} from '../amas/config/feature-flags';
import { intelligentFallback, FallbackReason, FallbackResult } from '../amas/decision/fallback';
import { redisCacheService } from './redis-cache.service';
import { getRedisClient } from '../config/redis';
import prisma from '../config/database';
import { logger } from '../logger';

// ==================== 类型定义 ====================

export interface SystemStatus {
  debugEnabled: boolean;
  simulationActive: boolean;
  simulationRemainingMs: number | null;
  infrastructure: {
    redis: { enabled: boolean; connected: boolean };
    database: { connected: boolean; simulateSlowQuery: boolean };
    llm: { enabled: boolean; mockResponse: boolean };
  };
  amas: {
    featureFlags: AMASFeatureFlags;
    circuitForceOpen: boolean;
    simulateFallbackReason: string | null;
  };
  services: ServicesDebugConfig;
}

export interface HealthCheckResult {
  redis: { healthy: boolean; latencyMs: number | null; error?: string };
  database: { healthy: boolean; latencyMs: number | null; error?: string };
  amas: { healthy: boolean };
}

export interface AuditLogEntry {
  timestamp: string;
  action: string;
  details: Record<string, unknown>;
  userId?: string;
}

// ==================== 审计日志 ====================

const auditLog: AuditLogEntry[] = [];
const MAX_AUDIT_LOG_SIZE = 100;

function addAuditLog(action: string, details: Record<string, unknown>, userId?: string): void {
  const entry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    action,
    details,
    userId,
  };
  auditLog.unshift(entry);
  if (auditLog.length > MAX_AUDIT_LOG_SIZE) {
    auditLog.pop();
  }
  logger.info({ action, details, userId }, '[DEBUG] Audit log entry');
}

// ==================== 服务实现 ====================

class DebugService {
  /**
   * 检查调试模式是否可用
   */
  isAvailable(): boolean {
    return isDebugEnabled();
  }

  /**
   * 获取系统状态概览
   */
  async getSystemStatus(): Promise<SystemStatus> {
    const config = getDebugConfig();
    const featureFlags = getFeatureFlags();

    let redisConnected = false;
    try {
      const redis = getRedisClient();
      await redis.ping();
      redisConnected = true;
    } catch {
      redisConnected = false;
    }

    return {
      debugEnabled: config.enabled,
      simulationActive: getSimulationRemainingMs() !== null,
      simulationRemainingMs: getSimulationRemainingMs(),
      infrastructure: {
        redis: {
          enabled: config.infrastructure.redis.enabled,
          connected: redisConnected,
        },
        database: {
          connected: true, // Prisma handles connection pooling
          simulateSlowQuery: config.infrastructure.database.simulateSlowQuery,
        },
        llm: {
          enabled: config.infrastructure.llm.enabled,
          mockResponse: config.infrastructure.llm.mockResponse,
        },
      },
      amas: {
        featureFlags,
        circuitForceOpen: config.amas.forceCircuitOpen,
        simulateFallbackReason: config.amas.simulateFallbackReason,
      },
      services: config.services,
    };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const result: HealthCheckResult = {
      redis: { healthy: false, latencyMs: null },
      database: { healthy: false, latencyMs: null },
      amas: { healthy: true },
    };

    // Redis健康检查
    try {
      const redis = getRedisClient();
      const start = Date.now();
      await redis.ping();
      result.redis.latencyMs = Date.now() - start;
      result.redis.healthy = true;
    } catch (error) {
      result.redis.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // 数据库健康检查
    try {
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      result.database.latencyMs = Date.now() - start;
      result.database.healthy = true;
    } catch (error) {
      result.database.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return result;
  }

  // ==================== 基础设施控制 ====================

  /**
   * 切换Redis缓存开关
   */
  toggleRedis(enabled: boolean, userId?: string): void {
    if (enabled) {
      redisCacheService.enable();
    } else {
      redisCacheService.disable();
    }
    updateInfrastructureConfig({ redis: { enabled } });
    addAuditLog('redis.toggle', { enabled }, userId);
  }

  /**
   * 配置数据库模拟
   */
  configureDbSimulation(
    options: {
      simulateSlowQuery?: boolean;
      slowQueryDelayMs?: number;
      simulateConnectionFailure?: boolean;
    },
    userId?: string,
  ): void {
    updateInfrastructureConfig({
      database: {
        ...getDebugConfig().infrastructure.database,
        ...options,
      },
    });
    if (options.simulateSlowQuery || options.simulateConnectionFailure) {
      startSimulation();
    }
    addAuditLog('database.simulation', options, userId);
  }

  /**
   * 切换LLM服务开关
   */
  toggleLlm(options: { enabled?: boolean; mockResponse?: boolean }, userId?: string): void {
    updateInfrastructureConfig({
      llm: {
        ...getDebugConfig().infrastructure.llm,
        ...options,
      },
    });
    addAuditLog('llm.toggle', options, userId);
  }

  // ==================== AMAS控制 ====================

  /**
   * 获取AMAS功能开关
   */
  getAmasFeatureFlags(): AMASFeatureFlags {
    return getFeatureFlags();
  }

  /**
   * 更新AMAS功能开关
   */
  async updateAmasFeatureFlags(
    updates: Partial<AMASFeatureFlags>,
    userId?: string,
  ): Promise<AMASFeatureFlags> {
    const result = await updateFeatureFlags(updates);
    addAuditLog('amas.featureFlags.update', { updates }, userId);
    return result;
  }

  /**
   * 重置AMAS功能开关
   */
  async resetAmasFeatureFlags(userId?: string): Promise<AMASFeatureFlags> {
    const result = await resetFeatureFlags();
    addAuditLog('amas.featureFlags.reset', {}, userId);
    return result;
  }

  /**
   * 强制打开熔断器
   */
  forceCircuitOpen(userId?: string): void {
    updateAmasDebugConfig({ forceCircuitOpen: true });
    startSimulation();
    addAuditLog('amas.circuit.forceOpen', {}, userId);
  }

  /**
   * 重置熔断器
   */
  resetCircuit(userId?: string): void {
    updateAmasDebugConfig({ forceCircuitOpen: false });
    addAuditLog('amas.circuit.reset', {}, userId);
  }

  /**
   * 测试降级策略
   */
  async testFallback(reason: FallbackReason, userId?: string): Promise<FallbackResult> {
    const result = intelligentFallback(null, reason, {
      hour: new Date().getHours(),
    });
    addAuditLog('amas.fallback.test', { reason, result }, userId);
    return result;
  }

  /**
   * 设置模拟降级原因
   */
  setSimulateFallbackReason(reason: FallbackReason | null, userId?: string): void {
    updateAmasDebugConfig({ simulateFallbackReason: reason });
    if (reason) {
      startSimulation();
    }
    addAuditLog('amas.fallback.simulate', { reason }, userId);
  }

  // ==================== 服务控制 ====================

  /**
   * 切换服务开关
   */
  toggleServices(updates: Partial<ServicesDebugConfig>, userId?: string): ServicesDebugConfig {
    const result = updateServicesConfig(updates);
    addAuditLog('services.toggle', { updates }, userId);
    return result;
  }

  /**
   * 获取服务状态
   */
  getServicesStatus(): ServicesDebugConfig {
    return getDebugConfig().services;
  }

  // ==================== 全局控制 ====================

  /**
   * 重置所有调试配置
   */
  resetAll(userId?: string): void {
    resetDebugConfig();
    resetFeatureFlags();
    redisCacheService.enable();
    addAuditLog('debug.resetAll', {}, userId);
  }

  /**
   * 停止所有模拟
   */
  stopAllSimulations(userId?: string): void {
    stopSimulation();
    addAuditLog('debug.stopSimulations', {}, userId);
  }

  /**
   * 获取审计日志
   */
  getAuditLog(limit = 50): AuditLogEntry[] {
    return auditLog.slice(0, limit);
  }

  /**
   * 清除审计日志
   */
  clearAuditLog(userId?: string): void {
    auditLog.length = 0;
    addAuditLog('audit.clear', {}, userId);
  }
}

export const debugService = new DebugService();
export default debugService;
