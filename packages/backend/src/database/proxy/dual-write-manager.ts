/**
 * 双写管理器
 *
 * 实现尽力双写模式：
 * - 正常模式：PG 优先写入，SQLite 异步/同步跟随（可配置）
 * - 降级模式：只写 SQLite + 变更日志
 * - 同步模式：排队新写入，等待同步完成
 *
 * 特性：
 * - 支持同步写入到备库（关键业务场景）
 * - 待写入操作持久化到 SQLite（防止进程重启丢失）
 * - 初始化时自动恢复未完成的写入
 * - 写入确认机制
 * - SYNCING 状态下写入排队
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import {
  DatabaseAdapter,
  DatabaseState,
  ChangeLogEntry,
  ChangeOperation,
  TransactionClient,
} from '../adapters/types';
import { schemaRegistry, getTableNameForModel } from '../schema/schema-generator';

// ============================================
// 类型定义
// ============================================

/**
 * 写入操作
 */
export interface WriteOperation {
  type: 'create' | 'update' | 'upsert' | 'delete' | 'createMany' | 'updateMany' | 'deleteMany';
  model: string;
  args: unknown;
  operationId: string;
  /** 写入时间戳 */
  timestamp?: number;
  /** 是否为关键操作（需要同步写入） */
  critical?: boolean;
}

/**
 * 双写管理器配置
 */
export interface DualWriteManagerConfig {
  /**
   * 是否同步写入到备库（默认 false，使用异步写入）
   * 设置为 true 时，NORMAL 模式下会等待 SQLite 写入完成
   */
  syncWriteToFallback?: boolean;
  /**
   * 对于关键操作是否强制同步写入（默认 true）
   * 即使 syncWriteToFallback 为 false，关键操作也会同步写入
   */
  syncCriticalWrites?: boolean;
  /**
   * 异步写入的最大重试次数（默认 3）
   */
  maxAsyncRetries?: number;
  /**
   * 异步写入重试间隔（毫秒，默认 1000）
   */
  asyncRetryDelayMs?: number;
  /**
   * 是否在初始化时恢复未完成的写入（默认 true）
   */
  recoverPendingWritesOnInit?: boolean;
}

/**
 * 待写入操作存储接口
 */
export interface PendingWriteStore {
  /**
   * 保存待写入操作
   */
  save(operation: WriteOperation): Promise<void>;
  /**
   * 移除已完成的写入操作
   */
  remove(operationId: string): Promise<void>;
  /**
   * 获取所有待写入操作
   */
  getAll(): Promise<WriteOperation[]>;
  /**
   * 获取待写入操作数量
   */
  count(): Promise<number>;
  /**
   * 清空所有待写入操作
   */
  clear(): Promise<void>;
}

/**
 * 写入结果
 */
export interface WriteResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  writtenTo: 'primary' | 'fallback' | 'both';
  asyncFallbackPending?: boolean;
}

/**
 * 双写事件
 */
export interface DualWriteEvents {
  'primary-write-success': (operation: WriteOperation) => void;
  'primary-write-failed': (operation: WriteOperation, error: Error) => void;
  'fallback-write-success': (operation: WriteOperation) => void;
  'fallback-write-failed': (operation: WriteOperation, error: Error) => void;
  'changelog-recorded': (entry: ChangeLogEntry) => void;
  'sync-required': (operationId: string) => void;
  'fencing-blocked': (operation: WriteOperation, reason: string) => void;
}

/**
 * 变更日志写入器接口
 */
export interface ChangeLogWriter {
  write(entry: Omit<ChangeLogEntry, 'id' | 'synced'>): Promise<void>;
  writeBatch?(entries: Array<Omit<ChangeLogEntry, 'id' | 'synced'>>): Promise<void>;
}

/**
 * Fencing 检查器接口
 */
export interface FencingChecker {
  hasValidLock(): boolean;
}

// ============================================
// SQLite 待写入操作存储实现
// ============================================

/**
 * SQLite 待写入操作存储
 * 将待写入操作持久化到 SQLite 的 _pending_writes 表
 */
export class SQLitePendingWriteStore implements PendingWriteStore {
  private fallbackAdapter: DatabaseAdapter;

  constructor(fallbackAdapter: DatabaseAdapter) {
    this.fallbackAdapter = fallbackAdapter;
  }

  /**
   * 保存待写入操作
   */
  async save(operation: WriteOperation): Promise<void> {
    const data = {
      operation_id: operation.operationId,
      operation_data: JSON.stringify(operation),
      created_at: new Date().toISOString(),
    };

    try {
      await this.fallbackAdapter.$executeRaw(
        `INSERT OR REPLACE INTO "_pending_writes" ("operation_id", "operation_data", "created_at") VALUES (?, ?, ?)`,
        data.operation_id,
        data.operation_data,
        data.created_at,
      );
    } catch (error) {
      console.error('[SQLitePendingWriteStore] Failed to save pending write:', error);
      throw error;
    }
  }

  /**
   * 移除已完成的写入操作
   */
  async remove(operationId: string): Promise<void> {
    try {
      await this.fallbackAdapter.$executeRaw(
        `DELETE FROM "_pending_writes" WHERE "operation_id" = ?`,
        operationId,
      );
    } catch (error) {
      console.error('[SQLitePendingWriteStore] Failed to remove pending write:', error);
      // 移除失败不抛出错误，避免影响主流程
    }
  }

  /**
   * 获取所有待写入操作
   */
  async getAll(): Promise<WriteOperation[]> {
    try {
      const rows = await this.fallbackAdapter.$queryRaw<
        Array<{
          operation_id: string;
          operation_data: string;
          created_at: string;
        }>
      >(`SELECT * FROM "_pending_writes" ORDER BY "created_at" ASC`);

      return rows
        .map((row) => {
          try {
            return JSON.parse(row.operation_data) as WriteOperation;
          } catch {
            console.warn(
              '[SQLitePendingWriteStore] Failed to parse operation data:',
              row.operation_id,
            );
            return null;
          }
        })
        .filter((op): op is WriteOperation => op !== null);
    } catch (error) {
      console.error('[SQLitePendingWriteStore] Failed to get pending writes:', error);
      return [];
    }
  }

  /**
   * 获取待写入操作数量
   */
  async count(): Promise<number> {
    try {
      const result = await this.fallbackAdapter.$queryRaw<[{ count: number }]>(
        `SELECT COUNT(*) as count FROM "_pending_writes"`,
      );
      return result[0]?.count || 0;
    } catch (error) {
      console.error('[SQLitePendingWriteStore] Failed to count pending writes:', error);
      return 0;
    }
  }

  /**
   * 清空所有待写入操作
   */
  async clear(): Promise<void> {
    try {
      await this.fallbackAdapter.$executeRaw(`DELETE FROM "_pending_writes"`);
    } catch (error) {
      console.error('[SQLitePendingWriteStore] Failed to clear pending writes:', error);
    }
  }
}

// ============================================
// 双写管理器
// ============================================

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<DualWriteManagerConfig> = {
  syncWriteToFallback: false,
  syncCriticalWrites: true,
  maxAsyncRetries: 3,
  asyncRetryDelayMs: 1000,
  recoverPendingWritesOnInit: true,
};

/**
 * 双写管理器
 *
 * 职责：
 * 1. 正常模式下同步写入 PG，异步/同步写入 SQLite（可配置）
 * 2. 降级模式下只写 SQLite，记录变更日志
 * 3. 生成幂等键和操作 ID
 * 4. 支持批量操作的详细 changelog 记录
 * 5. 持久化待写入操作，支持故障恢复
 */
export class DualWriteManager extends EventEmitter {
  private primaryAdapter: DatabaseAdapter;
  private fallbackAdapter: DatabaseAdapter;
  private changeLogWriter: ChangeLogWriter | null = null;
  private fencingChecker: FencingChecker | null = null;
  private currentState: DatabaseState = 'NORMAL';
  private pendingFallbackWrites: Map<string, WriteOperation> = new Map();
  private operationCounter = 0;
  private config: Required<DualWriteManagerConfig>;
  private pendingWriteStore: PendingWriteStore | null = null;
  private initialized = false;

  // SYNCING 状态下的写入队列
  private syncingWriteQueue: Array<{
    operation: WriteOperation;
    resolve: (result: WriteResult) => void;
    reject: (error: Error) => void;
  }> = [];
  // 队列处理标志
  private processingQueue = false;

  constructor(
    primaryAdapter: DatabaseAdapter,
    fallbackAdapter: DatabaseAdapter,
    changeLogWriter?: ChangeLogWriter,
    config?: DualWriteManagerConfig,
  ) {
    super();
    this.primaryAdapter = primaryAdapter;
    this.fallbackAdapter = fallbackAdapter;
    this.changeLogWriter = changeLogWriter || null;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 创建持久化存储
    this.pendingWriteStore = new SQLitePendingWriteStore(fallbackAdapter);
  }

  /**
   * 初始化双写管理器
   * 恢复未完成的写入操作
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.config.recoverPendingWritesOnInit && this.pendingWriteStore) {
      try {
        const pendingOps = await this.pendingWriteStore.getAll();
        if (pendingOps.length > 0) {
          console.log(`[DualWriteManager] Recovering ${pendingOps.length} pending writes...`);

          for (const op of pendingOps) {
            this.pendingFallbackWrites.set(op.operationId, op);
          }

          // 在后台重试这些写入
          this.retryPendingWritesInBackground();
        }
      } catch (error) {
        console.error('[DualWriteManager] Failed to recover pending writes:', error);
      }
    }

    this.initialized = true;
  }

  /**
   * 在后台重试未完成的写入
   */
  private retryPendingWritesInBackground(): void {
    // 延迟执行，避免阻塞初始化
    setTimeout(async () => {
      const result = await this.retryPendingWrites();
      if (result.succeeded > 0 || result.failed > 0) {
        console.log(
          `[DualWriteManager] Background retry completed: ${result.succeeded} succeeded, ${result.failed} failed`,
        );
      }
    }, 1000);
  }

  /**
   * 设置配置
   */
  setConfig(config: Partial<DualWriteManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取配置
   */
  getConfig(): Required<DualWriteManagerConfig> {
    return { ...this.config };
  }

  /**
   * 设置变更日志写入器
   */
  setChangeLogWriter(writer: ChangeLogWriter): void {
    this.changeLogWriter = writer;
  }

  /**
   * 设置 Fencing 检查器
   */
  setFencingChecker(checker: FencingChecker): void {
    this.fencingChecker = checker;
  }

  /**
   * 更新状态
   * 当状态变为 NORMAL 时，处理 SYNCING 期间排队的写入
   */
  setState(state: DatabaseState): void {
    const previousState = this.currentState;
    this.currentState = state;

    // 状态从 SYNCING 变为 NORMAL 时，处理排队的写入
    if (previousState === 'SYNCING' && state === 'NORMAL') {
      this.processQueuedWrites();
    }
  }

  /**
   * 处理 SYNCING 期间排队的写入
   */
  private async processQueuedWrites(): Promise<void> {
    if (this.processingQueue || this.syncingWriteQueue.length === 0) {
      return;
    }

    this.processingQueue = true;
    console.log(`[DualWriteManager] Processing ${this.syncingWriteQueue.length} queued writes...`);

    while (this.syncingWriteQueue.length > 0) {
      const item = this.syncingWriteQueue.shift()!;
      try {
        // 使用当前状态重新执行写入
        const result = await this.writeInternal(item.operation);
        item.resolve(result);
      } catch (error) {
        item.reject(error as Error);
      }
    }

    this.processingQueue = false;
    console.log('[DualWriteManager] Queued writes processed');
  }

  /**
   * 获取当前状态
   */
  getState(): DatabaseState {
    return this.currentState;
  }

  /**
   * 生成操作 ID
   */
  generateOperationId(): string {
    const timestamp = Date.now();
    const counter = ++this.operationCounter;
    return `${timestamp}-${counter}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * 生成幂等键
   */
  generateIdempotencyKey(operation: WriteOperation, index?: number): string {
    const base = `${operation.model}:${operation.type}:${operation.operationId}`;
    return index !== undefined ? `${base}:${index}` : base;
  }

  /**
   * 执行写入操作
   */
  async write<T>(operation: WriteOperation): Promise<WriteResult<T>> {
    // UNAVAILABLE 状态下拒绝写入
    if (this.currentState === 'UNAVAILABLE') {
      return {
        success: false,
        error: 'Database unavailable: both primary and fallback databases are down',
        writtenTo: 'primary',
      };
    }

    // 规范化写入：补齐主键默认值，确保主备库写入一致
    // 必须在 SYNCING 排队前执行，否则排队期间会生成不同的默认值（例如 timestamp）
    const normalized = this.normalizeWriteOperation(operation);

    // SYNCING 状态下排队写入，等待同步完成
    if (this.currentState === 'SYNCING') {
      return this.queueWriteDuringSyncing<T>(normalized);
    }

    return this.writeInternal<T>(normalized);
  }

  /**
   * 仅将写入复制到 SQLite 备库（不触发主库写入）。
   *
   * 用途：
   * - NORMAL 状态下，处理主库事务（$transaction）内的写入：事务提交后将变更回放到 SQLite
   *
   * 说明：
   * - 复制失败会写入 pending store，后台重试；不抛出错误（主库已成功提交，无法回滚）
   */
  async replicateToFallback(operation: WriteOperation): Promise<void> {
    const normalized = this.normalizeWriteOperation(operation);
    normalized.timestamp ||= Date.now();

    try {
      await this.syncWriteToFallback(normalized);
    } catch (error) {
      this.emit('fallback-write-failed', normalized, error as Error);

      await this.addToPendingWrites(normalized);
      this.emit('sync-required', normalized.operationId);

      this.asyncWriteToFallbackWithRetry(normalized)
        .then(() => this.removeFromPendingWrites(normalized.operationId))
        .catch((retryError) => {
          this.emit('fallback-write-failed', normalized, retryError as Error);
          this.emit('sync-required', normalized.operationId);
        });
    }
  }

  /**
   * 规范化写入操作：
   * - 对 create/createMany/upsert 的 create 部分补齐主键默认值（uuid / now）
   * - 目的：确保 PG 与 SQLite 的主键一致，避免降级写入失败或回切同步产生重复数据
   */
  private normalizeWriteOperation(operation: WriteOperation): WriteOperation {
    if (operation.type === 'create') {
      const args = operation.args as Record<string, unknown> | null;
      const data = args?.data as Record<string, unknown> | undefined;
      if (!data || typeof data !== 'object') return operation;

      const nextData = this.ensurePrimaryKeyDefaults(operation.model, data);
      if (nextData === data) return operation;

      return { ...operation, args: { ...args, data: nextData } };
    }

    if (operation.type === 'createMany') {
      const args = operation.args as Record<string, unknown> | null;
      const dataList = args?.data as unknown;
      if (!Array.isArray(dataList)) return operation;

      let changed = false;
      const nextList = dataList.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const next = this.ensurePrimaryKeyDefaults(
          operation.model,
          item as Record<string, unknown>,
        );
        changed ||= next !== item;
        return next;
      });

      if (!changed) return operation;
      return { ...operation, args: { ...args, data: nextList } };
    }

    if (operation.type === 'upsert') {
      const args = operation.args as Record<string, unknown> | null;
      const create = args?.create as Record<string, unknown> | undefined;
      if (!create || typeof create !== 'object') return operation;

      const nextCreate = this.ensurePrimaryKeyDefaults(operation.model, create);
      if (nextCreate === create) return operation;

      return { ...operation, args: { ...args, create: nextCreate } };
    }

    return operation;
  }

  /**
   * 为主键字段补齐默认值（仅在 schema 明确声明 hasDefault 时生效）
   *
   * 目前只补齐两类默认值：
   * - String 主键：uuid（randomUUID）
   * - DateTime 主键：now（new Date）
   */
  private ensurePrimaryKeyDefaults(
    modelName: string,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const schema =
      schemaRegistry.getByModelName(modelName) ||
      schemaRegistry.getByTableName(getTableNameForModel(modelName));
    if (!schema || schema.primaryKey.length === 0) {
      return data;
    }

    let changed = false;
    const next: Record<string, unknown> = { ...data };

    for (const pkField of schema.primaryKey) {
      if (next[pkField] !== undefined && next[pkField] !== null) {
        continue;
      }

      const field = schema.fields.find((f) => f.name === pkField);
      if (!field?.hasDefault) {
        continue;
      }

      if (field.prismaType === 'String') {
        next[pkField] = randomUUID();
        changed = true;
        continue;
      }

      if (field.prismaType === 'DateTime') {
        next[pkField] = new Date();
        changed = true;
      }
    }

    return changed ? next : data;
  }

  /**
   * SYNCING 状态下排队写入
   */
  private queueWriteDuringSyncing<T>(operation: WriteOperation): Promise<WriteResult<T>> {
    return new Promise((resolve, reject) => {
      this.syncingWriteQueue.push({
        operation,
        resolve: resolve as (result: WriteResult) => void,
        reject,
      });
      console.log(
        `[DualWriteManager] Write queued during SYNCING: ${operation.model}.${operation.type}`,
      );
    });
  }

  /**
   * 内部写入实现
   */
  private async writeInternal<T>(operation: WriteOperation): Promise<WriteResult<T>> {
    // DEGRADED 模式下跳过 fencing 检查（只使用 SQLite，不需要分布式锁）
    if (this.currentState === 'DEGRADED') {
      return this.writeDegraded<T>(operation);
    }

    // NORMAL/SYNCING 模式：Fencing 检查，如果配置了 fencing 且锁已丢失，拒绝写入
    if (this.fencingChecker && !this.fencingChecker.hasValidLock()) {
      const error = 'Write rejected: fencing lock lost';
      this.emit('fencing-blocked', operation, error);
      throw new Error(error);
    }

    return this.writeNormal<T>(operation);
  }

  /**
   * 正常模式写入
   * PG 同步写入，SQLite 同步/异步跟随（根据配置）
   */
  private async writeNormal<T>(operation: WriteOperation): Promise<WriteResult<T>> {
    // 添加时间戳
    operation.timestamp = Date.now();

    try {
      // 1. 同步写入 PG
      const model = this.primaryAdapter.getModel<T>(operation.model);
      const result = await this.executeModelOperation<T>(model, operation);

      this.emit('primary-write-success', operation);

      // 2. 决定是否同步写入 SQLite
      const shouldSyncWrite = this.shouldSyncWriteToFallback(operation);

      if (shouldSyncWrite) {
        // 同步写入 SQLite（阻塞主流程）
        try {
          await this.syncWriteToFallback(operation);
          return {
            success: true,
            data: result,
            writtenTo: 'both',
            asyncFallbackPending: false,
          };
        } catch (fallbackError) {
          // 同步写入失败，记录并继续（主库已成功）
          console.warn('[DualWriteManager] Sync write to fallback failed:', fallbackError);
          this.emit('fallback-write-failed', operation, fallbackError as Error);

          // 将操作添加到待重试队列（内存+持久化）
          await this.addToPendingWrites(operation);
          this.emit('sync-required', operation.operationId);

          return {
            success: true,
            data: result,
            writtenTo: 'primary',
            asyncFallbackPending: true,
          };
        }
      } else {
        // 异步写入 SQLite（不阻塞主流程）
        // 先将操作持久化到 SQLite，再执行异步写入
        await this.addToPendingWrites(operation);

        this.asyncWriteToFallbackWithRetry(operation)
          .then(() => {
            // 写入成功，从持久化存储移除
            this.removeFromPendingWrites(operation.operationId);
          })
          .catch((error) => {
            this.emit('fallback-write-failed', operation, error);
            this.emit('sync-required', operation.operationId);
          });

        return {
          success: true,
          data: result,
          writtenTo: 'primary',
          asyncFallbackPending: true,
        };
      }
    } catch (error) {
      this.emit('primary-write-failed', operation, error as Error);
      throw error; // 主库写入失败应该抛出错误
    }
  }

  /**
   * 判断是否应该同步写入到备库
   */
  private shouldSyncWriteToFallback(operation: WriteOperation): boolean {
    // 如果配置了全局同步写入
    if (this.config.syncWriteToFallback) {
      return true;
    }

    // 如果是关键操作且配置了关键操作同步写入
    if (this.config.syncCriticalWrites && operation.critical) {
      return true;
    }

    return false;
  }

  /**
   * 同步写入到备库
   */
  private async syncWriteToFallback<T>(operation: WriteOperation): Promise<void> {
    const model = this.fallbackAdapter.getModel<T>(operation.model);
    await this.executeModelOperation<T>(model, operation);
    this.emit('fallback-write-success', operation);
  }

  /**
   * 添加到待写入队列（内存+持久化）
   */
  private async addToPendingWrites(operation: WriteOperation): Promise<void> {
    // 添加到内存缓存
    this.pendingFallbackWrites.set(operation.operationId, operation);

    // 持久化到 SQLite
    if (this.pendingWriteStore) {
      try {
        await this.pendingWriteStore.save(operation);
      } catch (error) {
        console.error('[DualWriteManager] Failed to persist pending write:', error);
        // 持久化失败不影响主流程，操作仍在内存中
      }
    }
  }

  /**
   * 从待写入队列移除（内存+持久化）
   */
  private async removeFromPendingWrites(operationId: string): Promise<void> {
    // 从内存缓存移除
    this.pendingFallbackWrites.delete(operationId);

    // 从持久化存储移除
    if (this.pendingWriteStore) {
      try {
        await this.pendingWriteStore.remove(operationId);
      } catch (error) {
        console.error('[DualWriteManager] Failed to remove persisted pending write:', error);
      }
    }
  }

  /**
   * 异步写入到备库（带重试）
   */
  private async asyncWriteToFallbackWithRetry<T>(operation: WriteOperation): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxAsyncRetries; attempt++) {
      try {
        const model = this.fallbackAdapter.getModel<T>(operation.model);
        await this.executeModelOperation<T>(model, operation);
        this.emit('fallback-write-success', operation);
        return; // 成功，直接返回
      } catch (error) {
        lastError = error as Error;
        console.warn(`[DualWriteManager] Async write attempt ${attempt + 1} failed:`, error);

        // 如果不是最后一次尝试，等待后重试
        if (attempt < this.config.maxAsyncRetries - 1) {
          await this.delay(this.config.asyncRetryDelayMs);
        }
      }
    }

    // 所有重试都失败
    throw lastError || new Error('Async write failed after all retries');
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 降级模式写入
   * 只写 SQLite，记录变更日志
   *
   * 使用事务保证数据写入和变更日志的原子性：
   * - 如果变更日志写入失败，数据写入也会回滚
   * - 确保数据一致性，避免丢失变更记录
   */
  private async writeDegraded<T>(operation: WriteOperation): Promise<WriteResult<T>> {
    try {
      // 检查备库连接状态
      if (!this.fallbackAdapter.isConnected()) {
        throw new Error('Fallback database (SQLite) is not connected');
      }

      // 对于批量操作，先收集受影响的记录信息（在事务外进行）
      const affectedRecords = await this.collectAffectedRecords(operation);

      // 使用事务包装数据写入和变更日志记录
      // 确保原子性：如果 changelog 写入失败，数据写入也会回滚
      const result = await this.fallbackAdapter.$transaction<T>(async (txClient) => {
        // 1. 在事务中写入数据
        const model = txClient.getModel<T>(operation.model);
        const writeResult = await this.executeModelOperation<T>(model, operation);

        // 2. 在事务中记录变更日志
        // 如果 changelog 写入失败，整个事务会回滚
        await this.recordChangeLogInTransaction(operation, writeResult, affectedRecords);

        return writeResult;
      });

      this.emit('fallback-write-success', operation);

      return {
        success: true,
        data: result,
        writtenTo: 'fallback',
      };
    } catch (error) {
      this.emit('fallback-write-failed', operation, error as Error);
      throw error;
    }
  }

  /**
   * 在事务中记录变更日志
   * 通过 ChangeLogWriter 写入（调用发生在 fallbackAdapter.$transaction 内），确保与数据写入在同一 SQLite 事务中
   */
  private async recordChangeLogInTransaction<T>(
    operation: WriteOperation,
    result: T,
    affectedRecords?: Record<string, unknown>[] | null,
  ): Promise<void> {
    // 如果没有配置 changelog writer，跳过
    if (!this.changeLogWriter) {
      return;
    }

    const isBatchOperation = ['createMany', 'updateMany', 'deleteMany'].includes(operation.type);
    const changeOperation = this.mapOperationType(operation.type);
    const timestamp = Date.now();

    if (isBatchOperation) {
      // 批量操作：构建所有 changelog 条目
      const entries = this.buildBatchChangeLogEntries(
        operation,
        result,
        affectedRecords,
        timestamp,
      );
      if (this.changeLogWriter.writeBatch) {
        await this.changeLogWriter.writeBatch(entries);
      } else {
        for (const entry of entries) {
          await this.changeLogWriter.write(entry);
        }
      }
      for (const entry of entries) {
        this.emit('changelog-recorded', { ...entry, id: 0, synced: false } as ChangeLogEntry);
      }
    } else {
      // 单条操作
      const rowId = this.extractRowId(operation, result);
      const entry = {
        operation: changeOperation,
        tableName: operation.model,
        rowId: JSON.stringify(rowId),
        oldData: null as string | null,
        newData: changeOperation !== 'DELETE' ? JSON.stringify(result) : null,
        timestamp,
        idempotencyKey: this.generateIdempotencyKey(operation),
      };
      await this.changeLogWriter.write(entry);
      this.emit('changelog-recorded', { ...entry, id: 0, synced: false } as ChangeLogEntry);
    }
  }

  /**
   * 构建批量 changelog 条目
   */
  private buildBatchChangeLogEntries<T>(
    operation: WriteOperation,
    result: T,
    affectedRecords: Record<string, unknown>[] | null | undefined,
    timestamp: number,
  ): Array<{
    operation: ChangeOperation;
    tableName: string;
    rowId: string;
    oldData: string | null;
    newData: string | null;
    timestamp: number;
    idempotencyKey: string;
  }> {
    const args = operation.args as Record<string, unknown>;
    const entries: Array<{
      operation: ChangeOperation;
      tableName: string;
      rowId: string;
      oldData: string | null;
      newData: string | null;
      timestamp: number;
      idempotencyKey: string;
    }> = [];

    if (operation.type === 'createMany') {
      const dataArray = args.data as Record<string, unknown>[];
      if (Array.isArray(dataArray)) {
        for (let i = 0; i < dataArray.length; i++) {
          const item = dataArray[i];
          entries.push({
            operation: 'INSERT',
            tableName: operation.model,
            rowId: JSON.stringify(this.extractRowIdFromData(item, operation.model, i)),
            oldData: null,
            newData: JSON.stringify(item),
            timestamp,
            idempotencyKey: this.generateIdempotencyKey(operation, i),
          });
        }
      }
    } else if (operation.type === 'updateMany') {
      if (affectedRecords && affectedRecords.length > 0) {
        const updateData = args.data as Record<string, unknown>;
        for (let i = 0; i < affectedRecords.length; i++) {
          const oldRecord = affectedRecords[i];
          const newRecord = { ...oldRecord, ...updateData };
          entries.push({
            operation: 'UPDATE',
            tableName: operation.model,
            rowId: JSON.stringify(this.extractRowIdFromData(oldRecord, operation.model, i)),
            oldData: JSON.stringify(oldRecord),
            newData: JSON.stringify(newRecord),
            timestamp,
            idempotencyKey: this.generateIdempotencyKey(operation, i),
          });
        }
      } else {
        entries.push({
          operation: 'UPDATE',
          tableName: operation.model,
          rowId: JSON.stringify({ _batch: true, where: args.where }),
          oldData: null,
          newData: JSON.stringify({
            _batch: true,
            where: args.where,
            data: args.data,
            count: (result as { count: number }).count,
          }),
          timestamp,
          idempotencyKey: this.generateIdempotencyKey(operation),
        });
      }
    } else if (operation.type === 'deleteMany') {
      if (affectedRecords && affectedRecords.length > 0) {
        for (let i = 0; i < affectedRecords.length; i++) {
          const deletedRecord = affectedRecords[i];
          entries.push({
            operation: 'DELETE',
            tableName: operation.model,
            rowId: JSON.stringify(this.extractRowIdFromData(deletedRecord, operation.model, i)),
            oldData: JSON.stringify(deletedRecord),
            newData: null,
            timestamp,
            idempotencyKey: this.generateIdempotencyKey(operation, i),
          });
        }
      } else {
        entries.push({
          operation: 'DELETE',
          tableName: operation.model,
          rowId: JSON.stringify({ _batch: true, where: args.where }),
          oldData: JSON.stringify({
            _batch: true,
            where: args.where,
            count: (result as { count: number }).count,
          }),
          newData: null,
          timestamp,
          idempotencyKey: this.generateIdempotencyKey(operation),
        });
      }
    }

    return entries;
  }

  /**
   * 收集批量操作受影响的记录
   * 用于在执行操作前获取受影响的数据
   */
  private async collectAffectedRecords(
    operation: WriteOperation,
  ): Promise<Record<string, unknown>[] | null> {
    const args = operation.args as Record<string, unknown>;

    // 对于 updateMany/deleteMany，查询受影响的记录
    if ((operation.type === 'updateMany' || operation.type === 'deleteMany') && args.where) {
      try {
        const model = this.fallbackAdapter.getModel(operation.model);
        const records = await (
          model as { findMany: (args: unknown) => Promise<unknown[]> }
        ).findMany({
          where: args.where,
        });
        return records as Record<string, unknown>[];
      } catch {
        // 如果查询失败，返回 null，后续会使用回退逻辑
        return null;
      }
    }

    return null;
  }

  /**
   * 执行模型操作
   */
  private async executeModelOperation<T>(model: unknown, operation: WriteOperation): Promise<T> {
    const modelWithMethods = model as { [key: string]: (args: unknown) => Promise<unknown> };
    const method = modelWithMethods[operation.type];

    if (typeof method !== 'function') {
      throw new Error(`Unknown operation type: ${operation.type}`);
    }

    return method.call(modelWithMethods, operation.args) as Promise<T>;
  }

  /**
   * 记录变更日志
   * 支持单条和批量操作
   */
  private async recordChangeLog<T>(
    operation: WriteOperation,
    result: T,
    affectedRecords?: Record<string, unknown>[] | null,
  ): Promise<void> {
    if (!this.changeLogWriter) {
      return;
    }

    const isBatchOperation = ['createMany', 'updateMany', 'deleteMany'].includes(operation.type);

    if (isBatchOperation) {
      await this.recordBatchChangeLog(operation, result, affectedRecords);
    } else {
      await this.recordSingleChangeLog(operation, result);
    }
  }

  /**
   * 记录单条变更日志
   */
  private async recordSingleChangeLog<T>(operation: WriteOperation, result: T): Promise<void> {
    const changeOperation = this.mapOperationType(operation.type);
    const rowId = this.extractRowId(operation, result);

    const entry: Omit<ChangeLogEntry, 'id' | 'synced'> = {
      operation: changeOperation,
      tableName: operation.model,
      rowId: JSON.stringify(rowId),
      oldData: null,
      newData: changeOperation !== 'DELETE' ? JSON.stringify(result) : null,
      timestamp: Date.now(),
      idempotencyKey: this.generateIdempotencyKey(operation),
    };

    await this.changeLogWriter!.write(entry);
    this.emit('changelog-recorded', entry as ChangeLogEntry);
  }

  /**
   * 记录批量变更日志
   * 为每条受影响的记录创建独立的 changelog 条目
   */
  private async recordBatchChangeLog<T>(
    operation: WriteOperation,
    result: T,
    affectedRecords?: Record<string, unknown>[] | null,
  ): Promise<void> {
    const args = operation.args as Record<string, unknown>;
    const changeOperation = this.mapOperationType(operation.type);
    const timestamp = Date.now();
    const entries: Array<Omit<ChangeLogEntry, 'id' | 'synced'>> = [];

    if (operation.type === 'createMany') {
      // createMany: 从 args.data 获取所有新数据
      const dataArray = args.data as Record<string, unknown>[];
      if (Array.isArray(dataArray)) {
        for (let i = 0; i < dataArray.length; i++) {
          const item = dataArray[i];
          entries.push({
            operation: 'INSERT',
            tableName: operation.model,
            rowId: JSON.stringify(this.extractRowIdFromData(item, operation.model, i)),
            oldData: null,
            newData: JSON.stringify(item),
            timestamp,
            idempotencyKey: this.generateIdempotencyKey(operation, i),
          });
        }
      }
    } else if (operation.type === 'updateMany') {
      // updateMany: 使用预查询的受影响记录
      if (affectedRecords && affectedRecords.length > 0) {
        const updateData = args.data as Record<string, unknown>;
        for (let i = 0; i < affectedRecords.length; i++) {
          const oldRecord = affectedRecords[i];
          const newRecord = { ...oldRecord, ...updateData };
          entries.push({
            operation: 'UPDATE',
            tableName: operation.model,
            rowId: JSON.stringify(this.extractRowIdFromData(oldRecord, operation.model, i)),
            oldData: JSON.stringify(oldRecord),
            newData: JSON.stringify(newRecord),
            timestamp,
            idempotencyKey: this.generateIdempotencyKey(operation, i),
          });
        }
      } else {
        // 回退：记录一条汇总条目（包含 where 条件和更新数据）
        entries.push({
          operation: 'UPDATE',
          tableName: operation.model,
          rowId: JSON.stringify({ _batch: true, where: args.where }),
          oldData: null,
          newData: JSON.stringify({
            _batch: true,
            where: args.where,
            data: args.data,
            count: (result as { count: number }).count,
          }),
          timestamp,
          idempotencyKey: this.generateIdempotencyKey(operation),
        });
      }
    } else if (operation.type === 'deleteMany') {
      // deleteMany: 使用预查询的受影响记录
      if (affectedRecords && affectedRecords.length > 0) {
        for (let i = 0; i < affectedRecords.length; i++) {
          const deletedRecord = affectedRecords[i];
          entries.push({
            operation: 'DELETE',
            tableName: operation.model,
            rowId: JSON.stringify(this.extractRowIdFromData(deletedRecord, operation.model, i)),
            oldData: JSON.stringify(deletedRecord),
            newData: null,
            timestamp,
            idempotencyKey: this.generateIdempotencyKey(operation, i),
          });
        }
      } else {
        // 回退：记录一条汇总条目
        entries.push({
          operation: 'DELETE',
          tableName: operation.model,
          rowId: JSON.stringify({ _batch: true, where: args.where }),
          oldData: JSON.stringify({
            _batch: true,
            where: args.where,
            count: (result as { count: number }).count,
          }),
          newData: null,
          timestamp,
          idempotencyKey: this.generateIdempotencyKey(operation),
        });
      }
    }

    // 批量写入 changelog
    if (entries.length > 0) {
      if (this.changeLogWriter!.writeBatch) {
        await this.changeLogWriter!.writeBatch(entries);
      } else {
        // 回退到逐条写入
        for (const entry of entries) {
          await this.changeLogWriter!.write(entry);
        }
      }

      for (const entry of entries) {
        this.emit('changelog-recorded', entry as ChangeLogEntry);
      }
    }
  }

  /**
   * 从数据中提取行 ID（基于 schema 主键）
   */
  private extractRowIdFromData(
    data: Record<string, unknown>,
    modelName: string,
    index: number,
  ): Record<string, unknown> {
    // 尝试获取表的 schema 信息
    const tableName = getTableNameForModel(modelName) || modelName;
    const schema = schemaRegistry.getByTableName(tableName);

    if (schema && schema.primaryKey.length > 0) {
      // 使用 schema 定义的主键字段
      const rowId: Record<string, unknown> = {};
      let hasPrimaryKey = true;

      for (const pkField of schema.primaryKey) {
        if (data[pkField] !== undefined) {
          rowId[pkField] = data[pkField];
        } else {
          hasPrimaryKey = false;
          break;
        }
      }

      if (hasPrimaryKey && Object.keys(rowId).length > 0) {
        return rowId;
      }
    }

    // 回退：尝试常见的主键字段名
    const commonPkFields = ['id', 'uuid', '_id', 'ID'];
    for (const field of commonPkFields) {
      if (data[field] !== undefined) {
        return { [field]: data[field] };
      }
    }

    // 最后回退：使用所有数据字段作为标识（用于无主键的情况）
    // 这样同步时会匹配所有字段
    const dataKeys = Object.keys(data).filter((k) => !k.startsWith('_'));
    if (dataKeys.length > 0) {
      const rowId: Record<string, unknown> = {};
      for (const key of dataKeys.slice(0, 5)) {
        // 最多使用前 5 个字段
        rowId[key] = data[key];
      }
      return rowId;
    }

    // 绝对回退：使用索引（应该极少发生）
    console.warn(`[DualWriteManager] Could not extract primary key for ${modelName}, using index`);
    return { _index: index };
  }

  /**
   * 映射操作类型到变更操作
   */
  private mapOperationType(type: WriteOperation['type']): ChangeOperation {
    switch (type) {
      case 'create':
      case 'createMany':
        return 'INSERT';
      case 'update':
      case 'updateMany':
      case 'upsert':
        return 'UPDATE';
      case 'delete':
      case 'deleteMany':
        return 'DELETE';
      default:
        return 'UPDATE';
    }
  }

  /**
   * 提取行 ID（基于 schema 主键）
   */
  private extractRowId<T>(operation: WriteOperation, result: T): Record<string, unknown> {
    const args = operation.args as Record<string, unknown>;

    // 1. 尝试从 where 条件获取（update/delete/upsert 操作）
    if (args.where && typeof args.where === 'object') {
      return args.where as Record<string, unknown>;
    }

    // 2. 尝试从结果中使用 schema 主键提取
    if (result && typeof result === 'object') {
      const tableName = getTableNameForModel(operation.model) || operation.model;
      const schema = schemaRegistry.getByTableName(tableName);

      if (schema && schema.primaryKey.length > 0) {
        const rowId: Record<string, unknown> = {};
        let hasPrimaryKey = true;

        for (const pkField of schema.primaryKey) {
          const value = (result as Record<string, unknown>)[pkField];
          if (value !== undefined) {
            rowId[pkField] = value;
          } else {
            hasPrimaryKey = false;
            break;
          }
        }

        if (hasPrimaryKey && Object.keys(rowId).length > 0) {
          return rowId;
        }
      }

      // 3. 回退：尝试常见的主键字段名
      const resultObj = result as Record<string, unknown>;
      const commonPkFields = ['id', 'uuid', '_id', 'ID'];
      for (const field of commonPkFields) {
        if (resultObj[field] !== undefined) {
          return { [field]: resultObj[field] };
        }
      }
    }

    // 4. 最后回退：使用操作 ID（应该极少发生）
    console.warn(
      `[DualWriteManager] Could not extract primary key for ${operation.model}, using operationId`,
    );
    return { _operationId: operation.operationId };
  }

  /**
   * 获取待同步的写入操作
   */
  getPendingWrites(): WriteOperation[] {
    return Array.from(this.pendingFallbackWrites.values());
  }

  /**
   * 获取待同步写入数量
   */
  getPendingCount(): number {
    return this.pendingFallbackWrites.size;
  }

  /**
   * 获取持久化存储中的待同步写入数量
   */
  async getPersistentPendingCount(): Promise<number> {
    if (this.pendingWriteStore) {
      return await this.pendingWriteStore.count();
    }
    return 0;
  }

  /**
   * 清除待同步写入（内存+持久化）
   */
  async clearPendingWrites(): Promise<void> {
    this.pendingFallbackWrites.clear();
    if (this.pendingWriteStore) {
      await this.pendingWriteStore.clear();
    }
  }

  /**
   * 重试待同步写入
   */
  async retryPendingWrites(): Promise<{
    succeeded: number;
    failed: number;
    errors: Array<{ operationId: string; error: string }>;
  }> {
    const results = {
      succeeded: 0,
      failed: 0,
      errors: [] as Array<{ operationId: string; error: string }>,
    };

    // 复制当前队列，避免在迭代过程中修改
    const pendingOps = Array.from(this.pendingFallbackWrites.entries());

    for (const [operationId, operation] of pendingOps) {
      try {
        const model = this.fallbackAdapter.getModel(operation.model);
        await this.executeModelOperation(model, operation);

        // 成功：从内存和持久化存储中移除
        await this.removeFromPendingWrites(operationId);
        this.emit('fallback-write-success', operation);
        results.succeeded++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          operationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * 强制同步所有待写入操作
   * 用于故障切换前确保数据一致性
   */
  async flushPendingWrites(timeoutMs: number = 30000): Promise<{
    flushed: number;
    timedOut: boolean;
    errors: Array<{ operationId: string; error: string }>;
  }> {
    const startTime = Date.now();
    const results = {
      flushed: 0,
      timedOut: false,
      errors: [] as Array<{ operationId: string; error: string }>,
    };

    // 等待所有异步写入完成，带超时
    while (this.pendingFallbackWrites.size > 0) {
      if (Date.now() - startTime > timeoutMs) {
        results.timedOut = true;
        console.warn(
          `[DualWriteManager] Flush timed out with ${this.pendingFallbackWrites.size} pending writes`,
        );
        break;
      }

      // 尝试重试一次
      const retryResult = await this.retryPendingWrites();
      results.flushed += retryResult.succeeded;
      results.errors.push(...retryResult.errors);

      // 如果没有进展，等待一段时间再重试
      if (retryResult.succeeded === 0 && this.pendingFallbackWrites.size > 0) {
        await this.delay(100);
      }
    }

    return results;
  }
}

/**
 * 创建双写管理器
 */
export function createDualWriteManager(
  primaryAdapter: DatabaseAdapter,
  fallbackAdapter: DatabaseAdapter,
  changeLogWriter?: ChangeLogWriter,
  config?: DualWriteManagerConfig,
): DualWriteManager {
  return new DualWriteManager(primaryAdapter, fallbackAdapter, changeLogWriter, config);
}
