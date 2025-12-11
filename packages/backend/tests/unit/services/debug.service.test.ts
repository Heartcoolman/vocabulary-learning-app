/**
 * Debug Service Unit Tests
 *
 * Tests for the system debug service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock debug-config module
const mockDebugConfig = vi.hoisted(() => ({
  getDebugConfig: vi.fn(),
  updateDebugConfig: vi.fn(),
  updateInfrastructureConfig: vi.fn(),
  updateServicesConfig: vi.fn(),
  updateAmasDebugConfig: vi.fn(),
  resetDebugConfig: vi.fn(),
  startSimulation: vi.fn(),
  stopSimulation: vi.fn(),
  getSimulationRemainingMs: vi.fn(),
  isDebugEnabled: vi.fn(),
}));

const mockFeatureFlags = vi.hoisted(() => ({
  getFeatureFlags: vi.fn(),
  updateFeatureFlags: vi.fn(),
  resetFeatureFlags: vi.fn(),
}));

const mockFallback = vi.hoisted(() => ({
  intelligentFallback: vi.fn(),
  FallbackReason: {
    CIRCUIT_OPEN: 'CIRCUIT_OPEN',
    TIMEOUT: 'TIMEOUT',
    ERROR: 'ERROR',
  },
}));

const mockRedisCache = vi.hoisted(() => ({
  redisCacheService: {
    enable: vi.fn(),
    disable: vi.fn(),
    getStats: vi.fn(),
  },
}));

const mockRedis = vi.hoisted(() => ({
  getRedisClient: vi.fn(),
}));

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}));

vi.mock('../../../src/config/debug-config', () => mockDebugConfig);
vi.mock('../../../src/amas/config/feature-flags', () => mockFeatureFlags);
vi.mock('../../../src/amas/decision/fallback', () => mockFallback);
vi.mock('../../../src/services/redis-cache.service', () => mockRedisCache);
vi.mock('../../../src/config/redis', () => mockRedis);
vi.mock('../../../src/config/database', () => ({ default: mockPrisma }));
vi.mock('../../../src/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocks
import { debugService } from '../../../src/services/debug.service';

describe('DebugService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock returns
    mockDebugConfig.isDebugEnabled.mockReturnValue(true);
    mockDebugConfig.getDebugConfig.mockReturnValue({
      enabled: true,
      infrastructure: {
        redis: { enabled: true },
        database: { simulateSlowQuery: false, slowQueryDelayMs: 0 },
        llm: { enabled: true, mockResponse: false },
      },
      services: {
        auth: { mockUser: false },
        wordbook: { useCache: true },
      },
      amas: {
        forceCircuitOpen: false,
        simulateFallbackReason: null,
      },
    });
    mockDebugConfig.getSimulationRemainingMs.mockReturnValue(null);
    mockFeatureFlags.getFeatureFlags.mockReturnValue({
      useNativeModules: true,
      enableColdStart: true,
      enableBehavioralFatigue: true,
    });
  });

  describe('isAvailable', () => {
    it('should return true when debug mode is enabled', () => {
      mockDebugConfig.isDebugEnabled.mockReturnValue(true);
      expect(debugService.isAvailable()).toBe(true);
    });

    it('should return false when debug mode is disabled', () => {
      mockDebugConfig.isDebugEnabled.mockReturnValue(false);
      expect(debugService.isAvailable()).toBe(false);
    });
  });

  describe('getSystemStatus', () => {
    it('should return system status when debug is enabled', async () => {
      const mockRedisClient = { ping: vi.fn().mockResolvedValue('PONG') };
      mockRedis.getRedisClient.mockReturnValue(mockRedisClient);

      const status = await debugService.getSystemStatus();

      expect(status).toHaveProperty('debugEnabled');
      expect(status).toHaveProperty('simulationActive');
      expect(status).toHaveProperty('infrastructure');
      expect(status).toHaveProperty('amas');
      expect(status).toHaveProperty('services');
      expect(status.debugEnabled).toBe(true);
      expect(status.simulationActive).toBe(false);
    });

    it('should return redis connected=false when redis ping fails', async () => {
      const mockRedisClient = { ping: vi.fn().mockRejectedValue(new Error('Connection refused')) };
      mockRedis.getRedisClient.mockReturnValue(mockRedisClient);

      const status = await debugService.getSystemStatus();

      expect(status.infrastructure.redis.connected).toBe(false);
    });

    it('should include simulation info when simulation is active', async () => {
      mockDebugConfig.getSimulationRemainingMs.mockReturnValue(30000);
      const mockRedisClient = { ping: vi.fn().mockResolvedValue('PONG') };
      mockRedis.getRedisClient.mockReturnValue(mockRedisClient);

      const status = await debugService.getSystemStatus();

      expect(status.simulationActive).toBe(true);
      expect(status.simulationRemainingMs).toBe(30000);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when all services are up', async () => {
      const mockRedisClient = { ping: vi.fn().mockResolvedValue('PONG') };
      mockRedis.getRedisClient.mockReturnValue(mockRedisClient);
      mockPrisma.$queryRaw.mockResolvedValue([{ '1': 1 }]);

      const result = await debugService.healthCheck();

      expect(result.redis.healthy).toBe(true);
      expect(result.redis.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.database.healthy).toBe(true);
      expect(result.database.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.amas.healthy).toBe(true);
    });

    it('should return unhealthy redis when redis fails', async () => {
      const mockRedisClient = { ping: vi.fn().mockRejectedValue(new Error('Connection refused')) };
      mockRedis.getRedisClient.mockReturnValue(mockRedisClient);
      mockPrisma.$queryRaw.mockResolvedValue([{ '1': 1 }]);

      const result = await debugService.healthCheck();

      expect(result.redis.healthy).toBe(false);
      expect(result.redis.error).toBe('Connection refused');
    });

    it('should return unhealthy database when database fails', async () => {
      const mockRedisClient = { ping: vi.fn().mockResolvedValue('PONG') };
      mockRedis.getRedisClient.mockReturnValue(mockRedisClient);
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Database connection lost'));

      const result = await debugService.healthCheck();

      expect(result.database.healthy).toBe(false);
      expect(result.database.error).toBe('Database connection lost');
    });
  });

  describe('toggleRedis', () => {
    it('should enable redis cache', () => {
      debugService.toggleRedis(true, 'admin-user');

      expect(mockRedisCache.redisCacheService.enable).toHaveBeenCalled();
      expect(mockDebugConfig.updateInfrastructureConfig).toHaveBeenCalledWith({
        redis: { enabled: true },
      });
    });

    it('should disable redis cache', () => {
      debugService.toggleRedis(false, 'admin-user');

      expect(mockRedisCache.redisCacheService.disable).toHaveBeenCalled();
      expect(mockDebugConfig.updateInfrastructureConfig).toHaveBeenCalledWith({
        redis: { enabled: false },
      });
    });
  });

  describe('when debug mode is disabled', () => {
    beforeEach(() => {
      mockDebugConfig.isDebugEnabled.mockReturnValue(false);
    });

    it('isAvailable should return false', () => {
      expect(debugService.isAvailable()).toBe(false);
    });
  });
});
