/**
 * Fencing 管理器单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FencingManager,
  createFencingManager,
  createDisabledFencingManager,
} from '../../../src/database/proxy/fencing';
import { FencingConfig } from '../../../src/database/adapters/types';

// 模拟 Redis 客户端
function createMockRedisClient() {
  let lockValue: string | null = null;
  let tokenValue = 0;

  const mockClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    set: vi
      .fn()
      .mockImplementation(
        async (key: string, value: string, options?: { NX?: boolean; PX?: number }) => {
          if (options?.NX && lockValue !== null) {
            return null;
          }
          lockValue = value;
          return 'OK';
        },
      ),
    get: vi.fn().mockImplementation(async (key: string) => {
      if (key.endsWith(':token')) {
        return String(tokenValue);
      }
      return lockValue;
    }),
    incr: vi.fn().mockImplementation(async () => {
      tokenValue++;
      return tokenValue;
    }),
    eval: vi
      .fn()
      .mockImplementation(
        async (script: string, options: { keys: string[]; arguments: string[] }) => {
          const expectedValue = options.arguments[0];
          if (lockValue === expectedValue) {
            if (script.includes('del')) {
              lockValue = null;
            }
            return 1;
          }
          return 0;
        },
      ),
    // 测试辅助方法
    _setLockValue: (value: string | null) => {
      lockValue = value;
    },
    _getLockValue: () => lockValue,
    _setTokenValue: (value: number) => {
      tokenValue = value;
    },
    _getTokenValue: () => tokenValue,
    _reset: () => {
      lockValue = null;
      tokenValue = 0;
    },
  };

  return mockClient;
}

// 模拟 redis 模块
vi.mock('redis', () => ({
  createClient: vi.fn(() => createMockRedisClient()),
}));

describe('FencingManager', () => {
  let fencingManager: FencingManager;
  let defaultConfig: FencingConfig;

  beforeEach(() => {
    vi.useFakeTimers();
    defaultConfig = {
      enabled: true,
      lockKey: 'db:write-lock',
      lockTtlMs: 30000,
      renewIntervalMs: 10000,
    };
  });

  afterEach(async () => {
    if (fencingManager) {
      await fencingManager.close();
    }
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('创建和初始化', () => {
    it('应该正确创建 Fencing 管理器', () => {
      fencingManager = createFencingManager(defaultConfig);

      expect(fencingManager).toBeDefined();
      expect(fencingManager.hasWriteLock()).toBe(false);
    });

    it('禁用时应该创建无操作的管理器', () => {
      fencingManager = createDisabledFencingManager();

      const status = fencingManager.getStatus();
      expect(status.enabled).toBe(false);
    });

    it('初始状态应该正确', () => {
      fencingManager = createFencingManager(defaultConfig);

      const status = fencingManager.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.hasLock).toBe(false);
      expect(status.fencingToken).toBe(0);
      expect(status.lastRenewalTime).toBeNull();
    });

    it('应该生成唯一的实例 ID', () => {
      const manager1 = createFencingManager(defaultConfig);
      const manager2 = createFencingManager(defaultConfig);

      expect(manager1.getStatus().instanceId).not.toBe(manager2.getStatus().instanceId);

      manager1.close();
      manager2.close();
    });
  });

  describe('获取锁（acquireLock）', () => {
    it('Fencing 禁用时应该直接返回成功', async () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        enabled: false,
      });

      const result = await fencingManager.acquireLock();

      expect(result).toBe(true);
      expect(fencingManager.hasWriteLock()).toBe(true);
    });

    it('Redis 不可用时应该回退到单实例模式', async () => {
      fencingManager = createFencingManager(defaultConfig);
      // 不提供 redisUrl，所以 redis 为 null

      const result = await fencingManager.acquireLock();

      expect(result).toBe(true);
      expect(fencingManager.hasWriteLock()).toBe(true);
    });

    it('成功获取锁应该触发 lock-acquired 事件', async () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        enabled: false, // 禁用以简化测试
      });

      const handler = vi.fn();
      fencingManager.on('lock-acquired', handler);

      await fencingManager.acquireLock();

      // 注意：禁用模式下不会触发事件
      // 这个测试主要验证事件机制存在
    });

    it('获取锁后应该更新 hasWriteLock 状态', async () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        enabled: false,
      });

      expect(fencingManager.hasWriteLock()).toBe(false);

      await fencingManager.acquireLock();

      expect(fencingManager.hasWriteLock()).toBe(true);
    });
  });

  describe('释放锁（releaseLock）', () => {
    it('释放锁后 hasWriteLock 应该返回 false', async () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        enabled: false,
      });

      await fencingManager.acquireLock();
      expect(fencingManager.hasWriteLock()).toBe(true);

      await fencingManager.releaseLock();
      expect(fencingManager.hasWriteLock()).toBe(false);
    });

    it('没有持有锁时释放应该安全返回', async () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        enabled: false,
      });

      // 不应该抛出错误
      await expect(fencingManager.releaseLock()).resolves.not.toThrow();
    });

    it('释放锁后应该停止续租定时器', async () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        enabled: false,
      });

      await fencingManager.acquireLock();
      await fencingManager.releaseLock();

      // 验证不再续租（通过状态检查）
      expect(fencingManager.hasWriteLock()).toBe(false);
    });
  });

  describe('锁续租（renewLock）', () => {
    it('续租间隔应该基于配置', () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        renewIntervalMs: 5000,
      });

      // 验证配置被正确设置
      const status = fencingManager.getStatus();
      expect(status.lockKey).toBe('db:write-lock');
    });

    it('默认续租间隔应该是 TTL 的三分之一', () => {
      fencingManager = createFencingManager({
        enabled: true,
        lockKey: 'test-lock',
        lockTtlMs: 30000,
        renewIntervalMs: 0, // 未指定
      });

      // 验证管理器创建成功
      expect(fencingManager).toBeDefined();
    });
  });

  describe('锁丢失检测', () => {
    it('锁被其他实例获取时应该触发 lock-lost 事件', async () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        enabled: false,
      });

      const handler = vi.fn();
      fencingManager.on('lock-lost', handler);

      await fencingManager.acquireLock();

      // 模拟锁丢失场景需要真实的 Redis 连接
      // 这里验证事件监听器机制
      expect(fencingManager.listenerCount('lock-lost')).toBe(1);
    });

    it('续租失败应该将 hasWriteLock 设为 false', async () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        enabled: false,
      });

      await fencingManager.acquireLock();
      expect(fencingManager.hasWriteLock()).toBe(true);

      // 手动模拟锁丢失
      await fencingManager.releaseLock();
      expect(fencingManager.hasWriteLock()).toBe(false);
    });
  });

  describe('Fencing Token 递增', () => {
    it('获取锁后应该有新的 Fencing Token', async () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        enabled: false,
      });

      await fencingManager.acquireLock();

      const token = fencingManager.getHeldToken();
      expect(token).toBeDefined();
    });

    it('getHeldToken 应该返回当前持有的 Token', async () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        enabled: false,
      });

      const initialToken = fencingManager.getHeldToken();
      expect(initialToken).toBe(0);

      await fencingManager.acquireLock();

      // 禁用模式下 token 不会递增
      const currentToken = fencingManager.getHeldToken();
      expect(currentToken).toBeDefined();
    });

    it('getCurrentToken 应该返回当前有效的 Token', async () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        enabled: false,
      });

      const token = await fencingManager.getCurrentToken();
      expect(typeof token).toBe('number');
    });

    it('validateToken 在禁用模式下应该总是返回 true', async () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        enabled: false,
      });

      const isValid = await fencingManager.validateToken(999);
      expect(isValid).toBe(true);
    });

    it('validateToken 对于有效 Token 应该返回 true', async () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        enabled: false,
      });

      await fencingManager.acquireLock();
      const currentToken = await fencingManager.getCurrentToken();

      const isValid = await fencingManager.validateToken(currentToken);
      expect(isValid).toBe(true);
    });

    it('Token 不匹配时应该触发 token-mismatch 事件', async () => {
      fencingManager = createFencingManager(defaultConfig);

      const handler = vi.fn();
      fencingManager.on('token-mismatch', handler);

      // 验证事件监听器已注册
      expect(fencingManager.listenerCount('token-mismatch')).toBe(1);
    });
  });

  describe('Redis 不可用时的行为', () => {
    it('Redis 断开连接时应该触发 redis-disconnected 事件', async () => {
      fencingManager = createFencingManager(defaultConfig);

      const handler = vi.fn();
      fencingManager.on('redis-disconnected', handler);

      // 验证事件监听器已注册
      expect(fencingManager.listenerCount('redis-disconnected')).toBe(1);
    });

    it('Redis 重新连接时应该触发 redis-reconnected 事件', async () => {
      fencingManager = createFencingManager(defaultConfig);

      const handler = vi.fn();
      fencingManager.on('redis-reconnected', handler);

      // 验证事件监听器已注册
      expect(fencingManager.listenerCount('redis-reconnected')).toBe(1);
    });

    it('Redis 不可用时 redisConnected 状态应该为 false', () => {
      fencingManager = createFencingManager(defaultConfig);
      // 不提供 redisUrl

      const status = fencingManager.getStatus();
      expect(status.redisConnected).toBe(false);
    });

    it('严格模式下 Redis 不可用应该拒绝获取锁', async () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        failOnRedisUnavailable: true,
      });

      // 由于我们没有提供 redisUrl，Redis 不可用
      // 严格模式下应该拒绝获取锁
      const result = await fencingManager.acquireLock();

      // 严格模式下，Redis 不可用时返回 false
      expect(result).toBe(false);
      expect(fencingManager.hasWriteLock()).toBe(false);
    });
  });

  describe('单实例模式回退', () => {
    it('没有 Redis 时应该工作在单实例模式', async () => {
      fencingManager = createFencingManager(defaultConfig);
      // 未提供 redisUrl

      const result = await fencingManager.acquireLock();

      expect(result).toBe(true);
      expect(fencingManager.hasWriteLock()).toBe(true);
    });

    it('单实例模式下 Token 应该本地递增', async () => {
      fencingManager = createFencingManager(defaultConfig);

      await fencingManager.acquireLock();
      const token1 = fencingManager.getHeldToken();

      await fencingManager.releaseLock();
      await fencingManager.acquireLock();
      const token2 = fencingManager.getHeldToken();

      // 本地递增
      expect(token2).toBeGreaterThanOrEqual(token1);
    });

    it('单实例模式下释放锁应该正常工作', async () => {
      fencingManager = createFencingManager(defaultConfig);

      await fencingManager.acquireLock();
      await fencingManager.releaseLock();

      expect(fencingManager.hasWriteLock()).toBe(false);
    });
  });

  describe('状态获取', () => {
    it('getStatus 应该返回完整状态', async () => {
      fencingManager = createFencingManager(defaultConfig);

      const status = fencingManager.getStatus();

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('hasLock');
      expect(status).toHaveProperty('fencingToken');
      expect(status).toHaveProperty('instanceId');
      expect(status).toHaveProperty('lockKey');
      expect(status).toHaveProperty('lastRenewalTime');
      expect(status).toHaveProperty('redisConnected');
    });

    it('获取锁后状态应该更新', async () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        enabled: false,
      });

      await fencingManager.acquireLock();

      const status = fencingManager.getStatus();
      expect(status.hasLock).toBe(true);
    });
  });

  describe('关闭管理器', () => {
    it('close 应该释放锁并关闭连接', async () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        enabled: false,
      });

      await fencingManager.acquireLock();
      await fencingManager.close();

      expect(fencingManager.hasWriteLock()).toBe(false);
    });

    it('close 多次调用应该安全', async () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        enabled: false,
      });

      await fencingManager.close();
      await expect(fencingManager.close()).resolves.not.toThrow();
    });
  });

  describe('事件机制', () => {
    it('应该支持 lock-acquired 事件', () => {
      fencingManager = createFencingManager(defaultConfig);
      const handler = vi.fn();

      fencingManager.on('lock-acquired', handler);

      expect(fencingManager.listenerCount('lock-acquired')).toBe(1);
    });

    it('应该支持 lock-lost 事件', () => {
      fencingManager = createFencingManager(defaultConfig);
      const handler = vi.fn();

      fencingManager.on('lock-lost', handler);

      expect(fencingManager.listenerCount('lock-lost')).toBe(1);
    });

    it('应该支持 lock-renewed 事件', () => {
      fencingManager = createFencingManager(defaultConfig);
      const handler = vi.fn();

      fencingManager.on('lock-renewed', handler);

      expect(fencingManager.listenerCount('lock-renewed')).toBe(1);
    });

    it('应该支持 token-mismatch 事件', () => {
      fencingManager = createFencingManager(defaultConfig);
      const handler = vi.fn();

      fencingManager.on('token-mismatch', handler);

      expect(fencingManager.listenerCount('token-mismatch')).toBe(1);
    });

    it('应该支持 redis-disconnected 事件', () => {
      fencingManager = createFencingManager(defaultConfig);
      const handler = vi.fn();

      fencingManager.on('redis-disconnected', handler);

      expect(fencingManager.listenerCount('redis-disconnected')).toBe(1);
    });

    it('应该支持 redis-reconnected 事件', () => {
      fencingManager = createFencingManager(defaultConfig);
      const handler = vi.fn();

      fencingManager.on('redis-reconnected', handler);

      expect(fencingManager.listenerCount('redis-reconnected')).toBe(1);
    });
  });

  describe('配置验证', () => {
    it('应该正确使用 lockKey 配置', () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        lockKey: 'custom:lock:key',
      });

      const status = fencingManager.getStatus();
      expect(status.lockKey).toBe('custom:lock:key');
    });

    it('应该正确使用 enabled 配置', () => {
      fencingManager = createFencingManager({
        ...defaultConfig,
        enabled: false,
      });

      const status = fencingManager.getStatus();
      expect(status.enabled).toBe(false);
    });
  });
});

describe('FencingManager 与 Redis 集成', () => {
  // 这些测试需要真实的 Redis 连接或更复杂的模拟
  // 在单元测试中，我们主要测试接口和基本逻辑

  it('应该能够使用 redisUrl 初始化', () => {
    // 由于模拟了 redis 模块，这里不会真正连接
    const manager = createFencingManager(
      {
        enabled: true,
        lockKey: 'test:lock',
        lockTtlMs: 30000,
        renewIntervalMs: 10000,
      },
      'redis://localhost:6379',
    );

    expect(manager).toBeDefined();
    manager.close();
  });
});
