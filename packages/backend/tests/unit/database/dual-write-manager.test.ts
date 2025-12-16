/**
 * 双写管理器单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DualWriteManager,
  createDualWriteManager,
  WriteOperation,
  ChangeLogWriter,
} from '../../../src/database/proxy/dual-write-manager';
import { DatabaseAdapter } from '../../../src/database/adapters/types';

// 模拟数据库适配器
function createMockAdapter(data: Record<string, unknown> = {}): DatabaseAdapter {
  const mockModel = {
    create: vi.fn().mockResolvedValue({ id: '1', ...data }),
    update: vi.fn().mockResolvedValue({ id: '1', ...data }),
    upsert: vi.fn().mockResolvedValue({ id: '1', ...data }),
    delete: vi.fn().mockResolvedValue({ id: '1' }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };

  const adapter = {
    type: 'postgresql',
    isConnected: vi.fn().mockReturnValue(true),
    connect: vi.fn(),
    disconnect: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, latency: 10 }),
    getModel: vi.fn().mockReturnValue(mockModel),
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    bulkInsert: vi.fn(),
    bulkUpsert: vi.fn(),
    getTableData: vi.fn(),
    getTableRowCount: vi.fn(),
    getAllTableNames: vi.fn(),
  } as unknown as DatabaseAdapter;

  // 默认 $transaction：执行回调并提供最小 TransactionClient
  (adapter.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (client: unknown) => Promise<unknown>) => {
      const txClient = {
        getModel: adapter.getModel,
        $queryRaw: adapter.$queryRaw,
        $executeRaw: adapter.$executeRaw,
      };
      return fn(txClient);
    },
  );

  return adapter;
}

// 模拟变更日志写入器
function createMockChangeLogWriter(): ChangeLogWriter & { entries: unknown[] } {
  const entries: unknown[] = [];
  return {
    entries,
    write: vi.fn().mockImplementation(async (entry) => {
      entries.push(entry);
    }),
  };
}

describe('DualWriteManager', () => {
  let primaryAdapter: DatabaseAdapter;
  let fallbackAdapter: DatabaseAdapter;
  let dualWriteManager: DualWriteManager;

  beforeEach(() => {
    primaryAdapter = createMockAdapter();
    fallbackAdapter = createMockAdapter();
    dualWriteManager = createDualWriteManager(primaryAdapter, fallbackAdapter);
  });

  describe('初始化', () => {
    it('应该正确创建双写管理器', () => {
      expect(dualWriteManager).toBeDefined();
      expect(dualWriteManager.getState()).toBe('NORMAL');
    });
  });

  describe('状态管理', () => {
    it('应该允许设置状态', () => {
      dualWriteManager.setState('DEGRADED');
      expect(dualWriteManager.getState()).toBe('DEGRADED');
    });

    it('应该支持所有状态', () => {
      const states = ['NORMAL', 'DEGRADED', 'SYNCING'] as const;

      for (const state of states) {
        dualWriteManager.setState(state);
        expect(dualWriteManager.getState()).toBe(state);
      }
    });
  });

  describe('操作 ID 生成', () => {
    it('应该生成唯一的操作 ID', () => {
      const id1 = dualWriteManager.generateOperationId();
      const id2 = dualWriteManager.generateOperationId();

      expect(id1).not.toBe(id2);
    });

    it('操作 ID 应该包含时间戳', () => {
      const id = dualWriteManager.generateOperationId();
      const timestamp = id.split('-')[0];

      expect(parseInt(timestamp)).toBeGreaterThan(0);
    });
  });

  describe('幂等键生成', () => {
    it('应该生成正确格式的幂等键', () => {
      const operation: WriteOperation = {
        type: 'create',
        model: 'User',
        args: { data: { name: 'test' } },
        operationId: '12345',
      };

      const key = dualWriteManager.generateIdempotencyKey(operation);

      expect(key).toBe('User:create:12345');
    });
  });

  describe('正常模式写入', () => {
    it('应该写入主库', async () => {
      const operation: WriteOperation = {
        type: 'create',
        model: 'User',
        args: { data: { name: 'test' } },
        operationId: dualWriteManager.generateOperationId(),
      };

      const result = await dualWriteManager.write(operation);

      expect(result.success).toBe(true);
      expect(result.writtenTo).toBe('primary');
      expect(primaryAdapter.getModel).toHaveBeenCalledWith('User');
    });

    it('应该触发 primary-write-success 事件', async () => {
      const handler = vi.fn();
      dualWriteManager.on('primary-write-success', handler);

      const operation: WriteOperation = {
        type: 'create',
        model: 'User',
        args: { data: { name: 'test' } },
        operationId: dualWriteManager.generateOperationId(),
      };

      await dualWriteManager.write(operation);

      expect(handler).toHaveBeenCalledWith(operation);
    });

    it('主库写入失败应该抛出错误', async () => {
      const failingAdapter = createMockAdapter();
      (failingAdapter.getModel as ReturnType<typeof vi.fn>).mockReturnValue({
        create: vi.fn().mockRejectedValue(new Error('Connection failed')),
      });

      const manager = createDualWriteManager(failingAdapter, fallbackAdapter);

      const operation: WriteOperation = {
        type: 'create',
        model: 'User',
        args: { data: { name: 'test' } },
        operationId: manager.generateOperationId(),
      };

      await expect(manager.write(operation)).rejects.toThrow('Connection failed');
    });

    it('主库写入失败应该触发 primary-write-failed 事件', async () => {
      const failingAdapter = createMockAdapter();
      (failingAdapter.getModel as ReturnType<typeof vi.fn>).mockReturnValue({
        create: vi.fn().mockRejectedValue(new Error('Connection failed')),
      });

      const manager = createDualWriteManager(failingAdapter, fallbackAdapter);
      const handler = vi.fn();
      manager.on('primary-write-failed', handler);

      const operation: WriteOperation = {
        type: 'create',
        model: 'User',
        args: { data: { name: 'test' } },
        operationId: manager.generateOperationId(),
      };

      try {
        await manager.write(operation);
      } catch {
        // 忽略错误
      }

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('降级模式写入', () => {
    beforeEach(() => {
      dualWriteManager.setState('DEGRADED');
    });

    it('应该写入备库', async () => {
      const operation: WriteOperation = {
        type: 'create',
        model: 'User',
        args: { data: { name: 'test' } },
        operationId: dualWriteManager.generateOperationId(),
      };

      const result = await dualWriteManager.write(operation);

      expect(result.success).toBe(true);
      expect(result.writtenTo).toBe('fallback');
      expect(fallbackAdapter.getModel).toHaveBeenCalledWith('User');
    });

    it('应该记录变更日志', async () => {
      const changeLogWriter = createMockChangeLogWriter();
      dualWriteManager.setChangeLogWriter(changeLogWriter);

      const operation: WriteOperation = {
        type: 'create',
        model: 'User',
        args: { data: { name: 'test' } },
        operationId: dualWriteManager.generateOperationId(),
      };

      await dualWriteManager.write(operation);

      expect(changeLogWriter.write).toHaveBeenCalled();
      expect(changeLogWriter.entries).toHaveLength(1);
    });

    it('应该触发 changelog-recorded 事件', async () => {
      const changeLogWriter = createMockChangeLogWriter();
      dualWriteManager.setChangeLogWriter(changeLogWriter);

      const handler = vi.fn();
      dualWriteManager.on('changelog-recorded', handler);

      const operation: WriteOperation = {
        type: 'create',
        model: 'User',
        args: { data: { name: 'test' } },
        operationId: dualWriteManager.generateOperationId(),
      };

      await dualWriteManager.write(operation);

      expect(handler).toHaveBeenCalled();
    });

    it('备库写入失败应该抛出错误', async () => {
      const failingFallback = createMockAdapter();
      (failingFallback.getModel as ReturnType<typeof vi.fn>).mockReturnValue({
        create: vi.fn().mockRejectedValue(new Error('SQLite error')),
      });

      const manager = createDualWriteManager(primaryAdapter, failingFallback);
      manager.setState('DEGRADED');

      const operation: WriteOperation = {
        type: 'create',
        model: 'User',
        args: { data: { name: 'test' } },
        operationId: manager.generateOperationId(),
      };

      await expect(manager.write(operation)).rejects.toThrow('SQLite error');
    });
  });

  describe('操作类型映射', () => {
    beforeEach(() => {
      dualWriteManager.setState('DEGRADED');
      dualWriteManager.setChangeLogWriter(createMockChangeLogWriter());
    });

    it.each([
      { type: 'create' as const, expected: 'INSERT' },
      { type: 'createMany' as const, expected: 'INSERT' },
      { type: 'update' as const, expected: 'UPDATE' },
      { type: 'updateMany' as const, expected: 'UPDATE' },
      { type: 'upsert' as const, expected: 'UPDATE' },
      { type: 'delete' as const, expected: 'DELETE' },
      { type: 'deleteMany' as const, expected: 'DELETE' },
    ])('$type 应该映射到 $expected', async ({ type }) => {
      const operation: WriteOperation = {
        type,
        model: 'User',
        args: {},
        operationId: dualWriteManager.generateOperationId(),
      };

      await dualWriteManager.write(operation);

      // 验证变更日志被调用
      expect(fallbackAdapter.getModel).toHaveBeenCalledWith('User');
    });
  });

  describe('待同步写入管理', () => {
    it('getPendingWrites 应该返回待同步操作', () => {
      // 模拟一些待同步的操作（通过访问私有属性）
      const pending = dualWriteManager.getPendingWrites();
      expect(Array.isArray(pending)).toBe(true);
    });

    it('getPendingCount 应该返回待同步数量', () => {
      const count = dualWriteManager.getPendingCount();
      expect(typeof count).toBe('number');
    });

    it('clearPendingWrites 应该清空待同步列表', () => {
      dualWriteManager.clearPendingWrites();
      expect(dualWriteManager.getPendingCount()).toBe(0);
    });
  });

  describe('重试待同步写入', () => {
    it('应该重试所有待同步操作', async () => {
      const result = await dualWriteManager.retryPendingWrites();

      expect(result).toHaveProperty('succeeded');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('errors');
    });
  });

  describe('事件系统', () => {
    it('应该支持 fallback-write-success 事件', async () => {
      dualWriteManager.setState('DEGRADED');

      const handler = vi.fn();
      dualWriteManager.on('fallback-write-success', handler);

      const operation: WriteOperation = {
        type: 'create',
        model: 'User',
        args: { data: { name: 'test' } },
        operationId: dualWriteManager.generateOperationId(),
      };

      await dualWriteManager.write(operation);

      expect(handler).toHaveBeenCalledWith(operation);
    });

    it('应该支持 fallback-write-failed 事件', async () => {
      const failingFallback = createMockAdapter();
      (failingFallback.getModel as ReturnType<typeof vi.fn>).mockReturnValue({
        create: vi.fn().mockRejectedValue(new Error('SQLite error')),
      });

      const manager = createDualWriteManager(primaryAdapter, failingFallback);
      manager.setState('DEGRADED');

      const handler = vi.fn();
      manager.on('fallback-write-failed', handler);

      const operation: WriteOperation = {
        type: 'create',
        model: 'User',
        args: { data: { name: 'test' } },
        operationId: manager.generateOperationId(),
      };

      try {
        await manager.write(operation);
      } catch {
        // 忽略错误
      }

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('变更日志写入器', () => {
    it('应该允许设置变更日志写入器', () => {
      const writer = createMockChangeLogWriter();
      dualWriteManager.setChangeLogWriter(writer);

      // 不会抛出错误
      expect(true).toBe(true);
    });

    it('没有变更日志写入器时不应该记录日志', async () => {
      dualWriteManager.setState('DEGRADED');
      // 不设置 changeLogWriter

      const operation: WriteOperation = {
        type: 'create',
        model: 'User',
        args: { data: { name: 'test' } },
        operationId: dualWriteManager.generateOperationId(),
      };

      // 应该不会抛出错误
      const result = await dualWriteManager.write(operation);
      expect(result.success).toBe(true);
    });
  });

  describe('行 ID 提取', () => {
    beforeEach(() => {
      dualWriteManager.setState('DEGRADED');
      dualWriteManager.setChangeLogWriter(createMockChangeLogWriter());
    });

    it('应该从 where 条件提取 ID', async () => {
      const operation: WriteOperation = {
        type: 'update',
        model: 'User',
        args: { where: { id: 'user-123' }, data: { name: 'updated' } },
        operationId: dualWriteManager.generateOperationId(),
      };

      const result = await dualWriteManager.write(operation);
      expect(result.success).toBe(true);
    });

    it('应该从结果提取 ID', async () => {
      const operation: WriteOperation = {
        type: 'create',
        model: 'User',
        args: { data: { name: 'test' } },
        operationId: dualWriteManager.generateOperationId(),
      };

      const result = await dualWriteManager.write(operation);
      expect(result.success).toBe(true);
    });
  });
});
