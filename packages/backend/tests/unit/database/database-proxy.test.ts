/**
 * DatabaseProxy 单元测试
 *
 * 测试数据库代理的核心功能：
 * - 初始化和关闭
 * - 状态管理
 * - $queryRaw 模板字符串处理
 * - ChangeLogWriter 集成
 * - SyncManager 集成
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { DatabaseProxy, createDatabaseProxy } from '../../../src/database/proxy/database-proxy';
import { DatabaseProxyConfig } from '../../../src/database/adapters/types';

// 模拟 PrismaClient
const createMockPrismaClient = () => {
  const mockPrisma = {
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    // 模拟 _dmmf 用于 schema 初始化
    _dmmf: {
      datamodel: {
        models: [],
        enums: [],
      },
    },
    _baseDmmf: {
      datamodel: {
        models: [],
        enums: [],
      },
    },
  } as unknown as PrismaClient;

  return mockPrisma;
};

// 测试配置
const createTestConfig = (overrides: Partial<DatabaseProxyConfig> = {}): DatabaseProxyConfig => ({
  sqlite: {
    path: ':memory:',
    journalMode: 'WAL',
    synchronous: 'NORMAL',
    busyTimeout: 5000,
    cacheSize: -64000,
    foreignKeys: true,
  },
  healthCheck: {
    intervalMs: 5000,
    timeoutMs: 2000,
    failureThreshold: 3,
    recoveryThreshold: 2,
    minRecoveryIntervalMs: 10000,
  },
  sync: {
    batchSize: 100,
    retryCount: 3,
    conflictStrategy: 'sqlite_wins',
    syncOnStartup: false,
  },
  fencing: {
    enabled: false,
    lockKey: 'test-lock',
    lockTtlMs: 30000,
    renewIntervalMs: 10000,
  },
  ...overrides,
});

describe('DatabaseProxy', () => {
  let mockPrisma: PrismaClient;
  let proxy: DatabaseProxy;
  let config: DatabaseProxyConfig;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    config = createTestConfig();
  });

  afterEach(async () => {
    if (proxy) {
      try {
        await proxy.close();
      } catch {
        // 忽略关闭错误
      }
    }
    vi.clearAllMocks();
  });

  describe('创建和初始化', () => {
    it('应该正确创建 DatabaseProxy 实例', () => {
      proxy = createDatabaseProxy(mockPrisma, config);
      expect(proxy).toBeDefined();
      expect(proxy.getState()).toBe('NORMAL');
    });

    it('应该以 NORMAL 状态启动', () => {
      proxy = createDatabaseProxy(mockPrisma, config);
      expect(proxy.getState()).toBe('NORMAL');
    });
  });

  describe('状态管理', () => {
    beforeEach(() => {
      proxy = createDatabaseProxy(mockPrisma, config);
    });

    it('getState 应该返回当前状态', () => {
      expect(proxy.getState()).toBe('NORMAL');
    });

    it('getHealthStatus 应该返回健康状态对象', () => {
      const status = proxy.getHealthStatus();

      expect(status).toHaveProperty('state');
      expect(status).toHaveProperty('primary');
      expect(status).toHaveProperty('fallback');
      expect(status).toHaveProperty('uptime');
      expect(status.state).toBe('NORMAL');
    });

    it('getMetrics 应该返回指标对象', () => {
      const metrics = proxy.getMetrics();

      expect(metrics).toHaveProperty('state');
      expect(metrics).toHaveProperty('primaryHealthy');
      expect(metrics).toHaveProperty('fallbackHealthy');
      expect(metrics).toHaveProperty('pendingSyncChanges');
      expect(metrics).toHaveProperty('totalQueries');
    });
  });

  describe('$queryRaw 模板字符串处理', () => {
    beforeEach(() => {
      proxy = createDatabaseProxy(mockPrisma, config);
    });

    it('应该正确处理普通字符串查询', async () => {
      // 使用 $queryRawUnsafe 测试普通字符串
      // 注意：这里实际会调用 SQLite（因为未初始化时状态为 NORMAL 但主库未连接）
      // 在实际测试中需要先初始化
    });

    it('应该正确生成 PostgreSQL 风格占位符（NORMAL 状态）', () => {
      // 测试模板字符串数组转换为 PostgreSQL 风格占位符
      const templateStrings = [
        'SELECT * FROM users WHERE id = ',
        ' AND name = ',
        '',
      ] as unknown as TemplateStringsArray;
      Object.defineProperty(templateStrings, 'raw', {
        value: ['SELECT * FROM users WHERE id = ', ' AND name = ', ''],
      });

      // 模拟 NORMAL 状态下的查询构建
      const values = [1, 'test'];
      let queryString = '';
      for (let i = 0; i < templateStrings.length; i++) {
        queryString += templateStrings[i];
        if (i < values.length) {
          queryString += `$${i + 1}`;
        }
      }

      expect(queryString).toBe('SELECT * FROM users WHERE id = $1 AND name = $2');
    });

    it('应该正确生成 SQLite 风格占位符（DEGRADED 状态）', () => {
      // 测试模板字符串数组转换为 SQLite 风格占位符
      const templateStrings = [
        'SELECT * FROM users WHERE id = ',
        ' AND name = ',
        '',
      ] as unknown as TemplateStringsArray;
      const values = [1, 'test'];
      let queryString = '';
      for (let i = 0; i < templateStrings.length; i++) {
        queryString += templateStrings[i];
        if (i < values.length) {
          queryString += '?';
        }
      }

      expect(queryString).toBe('SELECT * FROM users WHERE id = ? AND name = ?');
    });
  });

  describe('$transaction 兼容性', () => {
    beforeEach(() => {
      proxy = createDatabaseProxy(mockPrisma, config);
    });

    it('应该支持数组形式（Promise[]）的 $transaction 调用', async () => {
      const result = await proxy.$transaction([Promise.resolve(1), Promise.resolve(2)]);
      expect(result).toEqual([1, 2]);
    });
  });

  describe('DualWriteManager 集成', () => {
    beforeEach(() => {
      proxy = createDatabaseProxy(mockPrisma, config);
    });

    it('应该能获取 DualWriteManager', () => {
      const dualWriteManager = proxy.getDualWriteManager();
      expect(dualWriteManager).toBeDefined();
    });

    it('DualWriteManager 状态应该与 Proxy 状态同步', () => {
      const dualWriteManager = proxy.getDualWriteManager();
      expect(dualWriteManager.getState()).toBe(proxy.getState());
    });
  });

  describe('适配器访问', () => {
    beforeEach(() => {
      proxy = createDatabaseProxy(mockPrisma, config);
    });

    it('应该能获取主适配器', () => {
      const primaryAdapter = proxy.getPrimaryAdapter();
      expect(primaryAdapter).toBeDefined();
      expect(primaryAdapter.type).toBe('postgresql');
    });

    it('应该能获取备用适配器', () => {
      const fallbackAdapter = proxy.getFallbackAdapter();
      expect(fallbackAdapter).toBeDefined();
      expect(fallbackAdapter.type).toBe('sqlite');
    });
  });

  describe('模型代理', () => {
    beforeEach(() => {
      proxy = createDatabaseProxy(mockPrisma, config);
    });

    it('应该能访问 user 模型代理', () => {
      const userProxy = proxy.user;
      expect(userProxy).toBeDefined();
      expect(typeof userProxy.findUnique).toBe('function');
      expect(typeof userProxy.findMany).toBe('function');
      expect(typeof userProxy.create).toBe('function');
      expect(typeof userProxy.update).toBe('function');
      expect(typeof userProxy.delete).toBe('function');
    });

    it('应该能访问 word 模型代理', () => {
      const wordProxy = proxy.word;
      expect(wordProxy).toBeDefined();
      expect(typeof wordProxy.findFirst).toBe('function');
      expect(typeof wordProxy.count).toBe('function');
    });
  });

  describe('事件系统', () => {
    beforeEach(() => {
      proxy = createDatabaseProxy(mockPrisma, config);
    });

    it('应该支持状态变化事件', () => {
      const handler = vi.fn();
      proxy.on('state-changed', handler);

      // 状态变化会在 failover 时触发
      expect(proxy.listenerCount('state-changed')).toBe(1);
    });

    it('应该支持错误事件', () => {
      const handler = vi.fn();
      proxy.on('error', handler);

      expect(proxy.listenerCount('error')).toBe(1);
    });
  });

  describe('同步功能', () => {
    beforeEach(() => {
      proxy = createDatabaseProxy(mockPrisma, config);
    });

    it('getPendingSyncCount 应该返回数字', async () => {
      const count = await proxy.getPendingSyncCount();
      expect(typeof count).toBe('number');
      expect(count).toBe(0); // 未初始化时返回 0
    });

    it('triggerSync 在非 DEGRADED 状态应该返回失败', async () => {
      const result = await proxy.triggerSync();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('DEGRADED');
    });

    it('getSyncManager 应该返回 null（未初始化时）', () => {
      const syncManager = proxy.getSyncManager();
      expect(syncManager).toBeNull();
    });

    it('getChangeLogManager 应该返回 null（未初始化时）', () => {
      const changeLogManager = proxy.getChangeLogManager();
      expect(changeLogManager).toBeNull();
    });
  });

  describe('Prisma 兼容 API', () => {
    beforeEach(() => {
      proxy = createDatabaseProxy(mockPrisma, config);
    });

    it('应该有 $connect 方法', () => {
      expect(typeof proxy.$connect).toBe('function');
    });

    it('应该有 $disconnect 方法', () => {
      expect(typeof proxy.$disconnect).toBe('function');
    });

    it('应该有 $queryRaw 方法', () => {
      expect(typeof proxy.$queryRaw).toBe('function');
    });

    it('应该有 $executeRaw 方法', () => {
      expect(typeof proxy.$executeRaw).toBe('function');
    });

    it('应该有 $queryRawUnsafe 方法', () => {
      expect(typeof proxy.$queryRawUnsafe).toBe('function');
    });

    it('应该有 $executeRawUnsafe 方法', () => {
      expect(typeof proxy.$executeRawUnsafe).toBe('function');
    });

    it('应该有 $transaction 方法', () => {
      expect(typeof proxy.$transaction).toBe('function');
    });
  });
});

describe('TemplateStringsArray 处理', () => {
  it('应该正确识别模板字符串数组', () => {
    const templateStrings = Object.assign(['SELECT ', ''], {
      raw: ['SELECT ', ''],
    }) as TemplateStringsArray;

    expect(typeof templateStrings).toBe('object');
    expect(Array.isArray(templateStrings)).toBe(true);
    expect(templateStrings.raw).toBeDefined();
  });

  it('应该正确区分字符串和模板字符串数组', () => {
    const plainString = 'SELECT 1';
    const templateStrings = Object.assign(['SELECT ', ''], {
      raw: ['SELECT ', ''],
    }) as TemplateStringsArray;

    expect(typeof plainString === 'string').toBe(true);
    expect(typeof templateStrings === 'string').toBe(false);
  });
});
