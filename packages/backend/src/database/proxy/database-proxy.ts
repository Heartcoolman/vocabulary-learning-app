/**
 * 数据库代理
 *
 * 核心组件：提供与 PrismaClient 兼容的 API
 * 实现 PostgreSQL + SQLite 热备切换
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { AsyncLocalStorage } from 'async_hooks';
import {
  DatabaseAdapter,
  DatabaseState,
  ModelAdapter,
  TransactionClient,
  DatabaseMetrics,
  DatabaseHealthStatus,
  DatabaseProxyConfig,
  SyncStatus,
  SyncResult,
} from '../adapters/types';
import { PostgresAdapter, createPostgresAdapter } from '../adapters/postgres-adapter';
import { SQLiteAdapter, createSQLiteAdapter } from '../adapters/sqlite-adapter';
import { HealthMonitor, createHealthMonitor } from './health-monitor';
import { DatabaseStateMachine, createStateMachine } from './state-machine';
import { FencingManager, createFencingManager, createDisabledFencingManager } from './fencing';
import {
  DualWriteManager,
  createDualWriteManager,
  WriteOperation,
  ChangeLogWriter,
} from './dual-write-manager';
import {
  initializeSchemaRegistry,
  getTableNameForModel,
  schemaRegistry,
} from '../schema/schema-generator';
import { SQLiteChangeLogManager, createChangeLogManager } from '../sync/change-log';
import { SyncManager, createSyncManager } from '../sync/sync-manager';
import { ConflictResolver, createConflictResolver } from '../sync/conflict-resolver';

type TransactionCapturedWrite = {
  model: string;
  action: WriteOperation['type'];
  args: unknown;
};

type TransactionCaptureContext = {
  writes: TransactionCapturedWrite[];
};

function isWriteAction(action: string): action is WriteOperation['type'] {
  return (
    action === 'create' ||
    action === 'createMany' ||
    action === 'update' ||
    action === 'updateMany' ||
    action === 'upsert' ||
    action === 'delete' ||
    action === 'deleteMany'
  );
}

function cloneForCapture<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value)) as T;
    } catch {
      return value;
    }
  }
}

function ensurePrimaryKeyDefaults(
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

function normalizePrismaWriteArgs(
  model: string,
  action: WriteOperation['type'],
  args: unknown,
): unknown {
  if (!args || typeof args !== 'object') {
    return args;
  }

  const raw = args as Record<string, unknown>;

  if (action === 'create') {
    const data = raw.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return args;
    const nextData = ensurePrimaryKeyDefaults(model, data as Record<string, unknown>);
    return nextData === data ? args : { ...raw, data: nextData };
  }

  if (action === 'createMany') {
    const data = raw.data;
    if (!Array.isArray(data)) return args;
    let changed = false;
    const nextData = data.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      const next = ensurePrimaryKeyDefaults(model, item as Record<string, unknown>);
      changed ||= next !== item;
      return next;
    });
    return changed ? { ...raw, data: nextData } : args;
  }

  if (action === 'upsert') {
    const create = raw.create;
    if (!create || typeof create !== 'object' || Array.isArray(create)) return args;
    const nextCreate = ensurePrimaryKeyDefaults(model, create as Record<string, unknown>);
    return nextCreate === create ? args : { ...raw, create: nextCreate };
  }

  return args;
}

// ============================================
// 读写锁：保护状态切换
// ============================================

/**
 * 简单的读写锁实现
 * 用于保护数据库状态切换时的并发安全
 */
class ReadWriteLock {
  private readers = 0;
  private writer = false;
  private writerQueue: Array<() => void> = [];
  private readerQueue: Array<() => void> = [];

  async acquireRead(): Promise<void> {
    if (!this.writer && this.writerQueue.length === 0) {
      this.readers++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.readerQueue.push(() => {
        this.readers++;
        resolve();
      });
    });
  }

  releaseRead(): void {
    this.readers--;
    if (this.readers === 0 && this.writerQueue.length > 0) {
      this.writer = true;
      const next = this.writerQueue.shift();
      next?.();
    }
  }

  async acquireWrite(): Promise<void> {
    if (!this.writer && this.readers === 0) {
      this.writer = true;
      return;
    }

    return new Promise<void>((resolve) => {
      this.writerQueue.push(() => {
        resolve();
      });
    });
  }

  releaseWrite(): void {
    this.writer = false;

    // 唤醒等待的读者
    while (this.readerQueue.length > 0 && this.writerQueue.length === 0) {
      const next = this.readerQueue.shift();
      next?.();
    }

    // 如果没有读者等待，唤醒一个写者
    if (this.readers === 0 && this.writerQueue.length > 0) {
      this.writer = true;
      const next = this.writerQueue.shift();
      next?.();
    }
  }

  async withReadLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireRead();
    try {
      return await fn();
    } finally {
      this.releaseRead();
    }
  }

  async withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireWrite();
    try {
      return await fn();
    } finally {
      this.releaseWrite();
    }
  }
}

// ============================================
// 类型定义
// ============================================

/**
 * 代理事件
 */
export interface DatabaseProxyEvents {
  'state-changed': (state: DatabaseState) => void;
  'failover-started': () => void;
  'failover-completed': (newState: DatabaseState) => void;
  'recovery-started': () => void;
  'recovery-completed': () => void;
  'sync-started': () => void;
  'sync-completed': (result: { success: boolean; syncedCount: number }) => void;
  error: (error: Error) => void;
}

// ============================================
// 代理模型包装器
// ============================================

/**
 * 代理模型适配器
 * 根据当前状态路由到正确的数据库
 */
class ProxyModelAdapter<T = unknown> implements ModelAdapter<T> {
  constructor(
    private proxy: DatabaseProxy,
    private modelName: string,
  ) {}

  /**
   * 获取读取适配器
   * - NORMAL: 读取 PG
   * - SYNCING: 读取 SQLite（保持与降级期数据一致，避免同步中读到未回灌完全的 PG）
   * - DEGRADED: 读取 SQLite
   * - UNAVAILABLE: 抛出错误（两个数据库都不可用）
   * - 未初始化: 读取 SQLite（安全默认）
   */
  private getReadAdapter(): ModelAdapter<T> {
    const state = this.proxy.getState();
    const initialized = this.proxy.isInitialized();

    // UNAVAILABLE 状态：两个数据库都不可用
    if (state === 'UNAVAILABLE') {
      throw new Error('Database unavailable: both primary and fallback databases are down');
    }

    // 未初始化时默认使用 SQLite（安全降级）
    if (!initialized || state === 'DEGRADED' || state === 'SYNCING') {
      // 在DEGRADED状态下，如果备库也不可用，应该触发UNAVAILABLE状态
      if (!this.proxy.getFallbackAdapter().isConnected()) {
        throw new Error('Fallback database (SQLite) is not connected');
      }
      return this.proxy.getFallbackAdapter().getModel<T>(this.modelName);
    }
    // NORMAL 从 PG 读取
    return this.proxy.getPrimaryAdapter().getModel<T>(this.modelName);
  }

  async findUnique(args: Parameters<ModelAdapter<T>['findUnique']>[0]): Promise<T | null> {
    return this.getReadAdapter().findUnique(args);
  }

  async findFirst(args?: Parameters<ModelAdapter<T>['findFirst']>[0]): Promise<T | null> {
    return this.getReadAdapter().findFirst(args);
  }

  async findMany(args?: Parameters<ModelAdapter<T>['findMany']>[0]): Promise<T[]> {
    return this.getReadAdapter().findMany(args);
  }

  async create(args: Parameters<ModelAdapter<T>['create']>[0]): Promise<T> {
    return this.executeWrite('create', args);
  }

  async createMany(args: Parameters<ModelAdapter<T>['createMany']>[0]): Promise<{ count: number }> {
    return this.executeWrite('createMany', args) as Promise<{ count: number }>;
  }

  async update(args: Parameters<ModelAdapter<T>['update']>[0]): Promise<T> {
    return this.executeWrite('update', args);
  }

  async updateMany(args: Parameters<ModelAdapter<T>['updateMany']>[0]): Promise<{ count: number }> {
    return this.executeWrite('updateMany', args) as Promise<{ count: number }>;
  }

  async upsert(args: Parameters<ModelAdapter<T>['upsert']>[0]): Promise<T> {
    return this.executeWrite('upsert', args);
  }

  async delete(args: Parameters<ModelAdapter<T>['delete']>[0]): Promise<T> {
    return this.executeWrite('delete', args);
  }

  async deleteMany(
    args?: Parameters<ModelAdapter<T>['deleteMany']>[0],
  ): Promise<{ count: number }> {
    return this.executeWrite('deleteMany', args) as Promise<{ count: number }>;
  }

  async count(args?: Parameters<ModelAdapter<T>['count']>[0]): Promise<number> {
    return this.getReadAdapter().count(args);
  }

  async aggregate(
    args: Parameters<ModelAdapter<T>['aggregate']>[0],
  ): Promise<Record<string, unknown>> {
    return this.getReadAdapter().aggregate(args);
  }

  async groupBy(
    args: Parameters<ModelAdapter<T>['groupBy']>[0],
  ): Promise<Array<Record<string, unknown>>> {
    return this.getReadAdapter().groupBy(args);
  }

  private async executeWrite<R>(type: WriteOperation['type'], args: unknown): Promise<R> {
    // UNAVAILABLE 状态：两个数据库都不可用
    const state = this.proxy.getState();
    if (state === 'UNAVAILABLE') {
      throw new Error('Database unavailable: both primary and fallback databases are down');
    }

    const dualWriteManager = this.proxy.getDualWriteManager();
    const operation: WriteOperation = {
      type,
      model: this.modelName,
      args,
      operationId: dualWriteManager.generateOperationId(),
      // 认证会话是热备关键数据：主库故障切换时必须能在 SQLite 侧即时验证
      critical: this.modelName === 'Session',
    };

    const result = await dualWriteManager.write<R>(operation);

    if (!result.success) {
      throw new Error(result.error || 'Write operation failed');
    }

    return result.data as R;
  }
}

// ============================================
// 数据库代理
// ============================================

/**
 * 数据库代理
 *
 * 提供与 PrismaClient 兼容的 API
 * 内部管理 PostgreSQL 和 SQLite 适配器
 */
export class DatabaseProxy extends EventEmitter {
  private prismaClient: PrismaClient;
  private primaryAdapter: PostgresAdapter;
  private fallbackAdapter: SQLiteAdapter;
  private healthMonitor: HealthMonitor;
  private stateMachine: DatabaseStateMachine;
  private fencingManager: FencingManager;
  private dualWriteManager: DualWriteManager;
  private config: DatabaseProxyConfig;
  private initialized = false;
  private modelProxies: Map<string, ProxyModelAdapter> = new Map();

  // 主库事务写入捕获：用于在 NORMAL 模式下将 $transaction 内写入回放到 SQLite
  private txCaptureStorage = new AsyncLocalStorage<TransactionCaptureContext>();
  private txCaptureMiddlewareInstalled = false;

  // 状态切换锁：保护并发状态切换
  private stateLock = new ReadWriteLock();
  // 恢复过程标志：防止重入
  private recoveryInProgress = false;
  // 故障切换标志：防止重入
  private failoverInProgress = false;

  // 同步相关组件
  private changeLogManager: SQLiteChangeLogManager | null = null;
  private syncManager: SyncManager | null = null;
  private conflictResolver: ConflictResolver | null = null;
  private lastSyncTime: number | null = null;
  private lastSyncError: string | null = null;

  // 统计指标
  private totalQueries = 0;
  private failedQueries = 0;
  private queryLatencies: number[] = [];
  private startTime = Date.now();

  // 缓存的待同步变更数量（用于同步方法 getHealthStatus）
  private cachedPendingSyncCount = 0;

  constructor(prismaClient: PrismaClient, config: DatabaseProxyConfig) {
    super();
    this.prismaClient = prismaClient;
    this.config = config;

    // 创建适配器
    this.primaryAdapter = createPostgresAdapter(prismaClient);
    this.fallbackAdapter = createSQLiteAdapter(config.sqlite);

    // 立即同步连接 SQLite（确保在 initialize() 调用前 SQLite 可用）
    // 这允许服务在代理完全初始化前使用 SQLite 进行读取操作
    try {
      this.fallbackAdapter.connectSync();
      // 同步初始化基础 schema，确保基本表存在
      this.fallbackAdapter.initializeSchemaSync();
      console.log(
        '[DatabaseProxy] SQLite connected and schema initialized eagerly during construction',
      );
    } catch (error) {
      console.warn(
        '[DatabaseProxy] Failed to connect SQLite eagerly:',
        error instanceof Error ? error.message : String(error),
      );
    }

    // 创建状态机
    this.stateMachine = createStateMachine('NORMAL');

    // 创建健康监控器
    this.healthMonitor = createHealthMonitor(this.primaryAdapter, config.healthCheck);

    // 创建 Fencing 管理器
    if (config.fencing.enabled) {
      const redisUrl = process.env.REDIS_URL;
      this.fencingManager = createFencingManager(config.fencing, redisUrl);
    } else {
      this.fencingManager = createDisabledFencingManager();
    }

    // 创建双写管理器
    this.dualWriteManager = createDualWriteManager(this.primaryAdapter, this.fallbackAdapter);

    this.setupEventHandlers();
    this.ensureTxCaptureMiddlewareInstalled();
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    // 健康监控事件
    this.healthMonitor.on('threshold-reached', async (type) => {
      if (type === 'failure') {
        await this.handleFailure();
      } else if (type === 'recovery') {
        await this.handleRecovery();
      }
    });

    // 状态机事件
    this.stateMachine.on('state-changed', (transition) => {
      this.emit('state-changed', transition.to);
      this.dualWriteManager.setState(transition.to);
    });

    // Fencing 事件
    this.fencingManager.on('lock-lost', async (reason) => {
      console.error('[DatabaseProxy] Lost write lock:', reason);
      // 丢失锁时应该停止写入
      await this.handleFailure();
    });
  }

  /**
   * 安装主库事务写入捕获中间件：
   * - 仅捕获 runInTransaction=true 的写入
   * - 事务提交后由 $transaction 统一回放到 SQLite
   */
  private ensureTxCaptureMiddlewareInstalled(): void {
    if (this.txCaptureMiddlewareInstalled) {
      return;
    }
    this.txCaptureMiddlewareInstalled = true;

    const client = this.prismaClient as unknown as { $use?: (middleware: unknown) => void };
    if (typeof client.$use !== 'function') {
      return;
    }

    client.$use(
      async (
        params: { model?: string; action: string; args: unknown; runInTransaction?: boolean },
        next: (params: {
          model?: string;
          action: string;
          args: unknown;
          runInTransaction?: boolean;
        }) => Promise<unknown>,
      ) => {
        const store = this.txCaptureStorage.getStore();
        if (!store || params.runInTransaction !== true) {
          return next(params);
        }

        const model = params.model;
        if (!model || !isWriteAction(params.action)) {
          return next(params);
        }

        const action = params.action as WriteOperation['type'];
        const nextArgs = normalizePrismaWriteArgs(model, action, params.args);
        if (nextArgs !== params.args) {
          params.args = nextArgs;
        }

        const result = await next(params);

        store.writes.push({
          model,
          action,
          args: cloneForCapture(params.args),
        });

        return result;
      },
    );
  }

  private async replayCapturedWritesToFallback(writes: TransactionCapturedWrite[]): Promise<void> {
    if (writes.length === 0) {
      return;
    }

    for (const write of writes) {
      const normalized = this.normalizeCapturedWriteForFallback(write);
      const operation: WriteOperation = {
        type: normalized.action,
        model: normalized.model,
        args: normalized.args,
        operationId: this.dualWriteManager.generateOperationId(),
        critical: normalized.model === 'Session',
      };

      await this.dualWriteManager.replicateToFallback(operation);
    }
  }

  private normalizeCapturedWriteForFallback(
    write: TransactionCapturedWrite,
  ): TransactionCapturedWrite {
    // delete 在 Prisma 中要求记录存在；备库回放时更适合用 deleteMany 做幂等
    if (write.action === 'delete') {
      const raw = write.args as Record<string, unknown> | null;
      const where = raw && typeof raw === 'object' ? raw.where : undefined;
      return {
        model: write.model,
        action: 'deleteMany',
        args: where ? { where } : {},
      };
    }

    // createMany：回放阶段默认启用 skipDuplicates，提高幂等性
    if (write.action === 'createMany') {
      const raw = write.args as Record<string, unknown> | null;
      if (!raw || typeof raw !== 'object') {
        return write;
      }
      if (raw.skipDuplicates === true) {
        return write;
      }
      return {
        model: write.model,
        action: write.action,
        args: { ...raw, skipDuplicates: true },
      };
    }

    return write;
  }

  /**
   * 初始化代理
   * 支持启动时主库不可用的情况，自动降级到 SQLite 模式
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    let primaryConnected = false;

    try {
      // 0. 初始化 Schema Registry（不依赖主库连接）
      // 说明：DMMF 信息来自 Prisma Client，本地即可获取；提前初始化可以：
      // - 让 SQLite 写入补齐主键默认值（uuid/now）具备 schema 依据
      // - 让同步模块的表名白名单校验在主库恢复时必定可用
      try {
        await initializeSchemaRegistry(this.prismaClient);
      } catch (schemaError) {
        // Schema Registry 初始化失败不阻止启动，使用硬编码映射/降级逻辑
        console.warn(
          '[DatabaseProxy] Schema registry initialization failed, using hardcoded mappings:',
          schemaError instanceof Error ? schemaError.message : String(schemaError),
        );
      }

      // 1. 先连接备库（SQLite），确保至少有一个可用数据库
      try {
        await this.fallbackAdapter.connect();
        await this.fallbackAdapter.initializeSchema?.();
        console.log('[DatabaseProxy] SQLite fallback connected');
      } catch (fallbackError) {
        console.error('[DatabaseProxy] SQLite fallback connection failed:', fallbackError);
        // 如果备库连接失败，检查主库是否可用
        // 如果主库也不可用，应该进入UNAVAILABLE状态
        throw fallbackError;
      }

      // 2. 初始化变更日志管理器（使用 SQLite 数据库）
      const sqliteDb = this.fallbackAdapter.getDatabase();
      this.changeLogManager = createChangeLogManager(sqliteDb);

      // 3. 创建变更日志写入器适配器
      const changeLogWriterAdapter: ChangeLogWriter = {
        write: async (entry) => {
          const tableName = getTableNameForModel(entry.tableName) || entry.tableName;
          await this.changeLogManager!.logChange({
            ...entry,
            tableName,
          });
        },
      };
      this.dualWriteManager.setChangeLogWriter(changeLogWriterAdapter);

      // 4. 初始化冲突解决器
      this.conflictResolver = createConflictResolver(this.config.sync.conflictStrategy);

      // 5. 尝试连接主库（PostgreSQL）
      try {
        await this.primaryAdapter.connect();
        primaryConnected = true;
        console.log('[DatabaseProxy] PostgreSQL primary connected');
      } catch (primaryError) {
        console.warn(
          '[DatabaseProxy] PostgreSQL unavailable, starting in DEGRADED mode:',
          primaryError instanceof Error ? primaryError.message : String(primaryError),
        );
        // 主库不可用，直接进入降级模式
        this.stateMachine.degraded('PostgreSQL unavailable at startup');
        this.dualWriteManager.setState('DEGRADED');
      }

      // 6. 初始化同步管理器
      this.syncManager = createSyncManager(
        this.primaryAdapter,
        this.fallbackAdapter,
        this.changeLogManager,
        this.conflictResolver,
        this.config.sync,
      );

      // 6.5 初始化 DualWriteManager（恢复未完成的写入）
      await this.dualWriteManager.initialize();
      console.log('[DatabaseProxy] DualWriteManager initialized');

      // 7. 如果主库可用，执行全量同步（如果配置）
      if (primaryConnected && this.config.sync.syncOnStartup) {
        try {
          await this.performFullSync();
        } catch (syncError) {
          console.warn('[DatabaseProxy] Initial sync failed:', syncError);
        }
      }

      // 8. 尝试获取写入锁
      // 注意：即使 Fencing 禁用，也调用 acquireLock()，它会设置 hasLock = true
      let lockAcquired = false;
      if (primaryConnected) {
        try {
          lockAcquired = await this.fencingManager.acquireLock();
          if (lockAcquired) {
            console.log('[DatabaseProxy] Write lock acquired');
          }
        } catch (lockError) {
          console.warn('[DatabaseProxy] Failed to acquire fencing lock:', lockError);
        }
      } else {
        // 主库不可用，但如果 Fencing 禁用，仍然允许写入（到 SQLite）
        if (!this.config.fencing.enabled) {
          lockAcquired = await this.fencingManager.acquireLock();
        }
      }

      // 9. 只有当 Fencing 启用且锁成功获取时，才设置 FencingChecker
      // 如果 Fencing 禁用，不设置 FencingChecker（允许所有写入）
      if (this.config.fencing.enabled && lockAcquired) {
        const fencingCheckerAdapter = {
          hasValidLock: () => this.fencingManager.hasWriteLock(),
        };
        this.dualWriteManager.setFencingChecker(fencingCheckerAdapter);
      }

      // 10. 启动健康检查（即使降级也要启动，用于检测主库恢复）
      this.healthMonitor.start();

      this.initialized = true;
      const mode = primaryConnected ? 'NORMAL' : 'DEGRADED (SQLite only)';
      console.log(`[DatabaseProxy] Initialization completed in ${mode} mode`);
    } catch (error) {
      console.error('[DatabaseProxy] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * 关闭代理
   */
  async close(): Promise<void> {
    this.healthMonitor.stop();
    await this.fencingManager.close();
    await this.primaryAdapter.disconnect();
    await this.fallbackAdapter.disconnect();
    this.initialized = false;
  }

  /**
   * 获取当前状态
   */
  getState(): DatabaseState {
    return this.stateMachine.getState();
  }

  /**
   * 检查代理是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 获取主适配器
   */
  getPrimaryAdapter(): DatabaseAdapter {
    return this.primaryAdapter;
  }

  /**
   * 获取备用适配器
   */
  getFallbackAdapter(): DatabaseAdapter {
    return this.fallbackAdapter;
  }

  /**
   * 获取双写管理器
   */
  getDualWriteManager(): DualWriteManager {
    return this.dualWriteManager;
  }

  /**
   * 处理故障
   * 使用写锁保护状态切换，防止并发问题
   */
  private async handleFailure(): Promise<void> {
    // 防止重入
    if (this.failoverInProgress) {
      return;
    }

    // 使用写锁保护状态切换
    await this.stateLock.withWriteLock(async () => {
      // 再次检查（可能在等待锁期间状态已变化）
      if (!this.stateMachine.canTransitionTo('DEGRADED')) {
        return;
      }

      this.failoverInProgress = true;
      this.emit('failover-started');

      try {
        // 等待 DualWriteManager 刷新待写入操作
        await this.dualWriteManager.flushPendingWrites(5000);

        // 检查备库是否可用，如果不可用则进入UNAVAILABLE状态
        const fallbackHealthy = this.fallbackAdapter.isConnected();

        if (!fallbackHealthy) {
          // 两个数据库都不可用，转换到UNAVAILABLE状态
          if (this.stateMachine.canTransitionTo('UNAVAILABLE')) {
            this.stateMachine.unavailable('Both primary and fallback databases are down');
            this.dualWriteManager.setState('UNAVAILABLE');
            this.emit('failover-completed', 'UNAVAILABLE');
            return;
          }
        }

        // 转换到降级状态
        this.stateMachine.degraded('PostgreSQL health check failed');
        this.healthMonitor.markDegraded();

        this.emit('failover-completed', 'DEGRADED');
      } catch (error) {
        this.emit('error', error as Error);
      } finally {
        this.failoverInProgress = false;
      }
    });
  }

  /**
   * 处理恢复
   * 使用写锁保护状态切换，防止并发问题
   */
  private async handleRecovery(): Promise<void> {
    // 防止重入
    if (this.recoveryInProgress) {
      return;
    }

    // 使用写锁保护状态切换
    await this.stateLock.withWriteLock(async () => {
      // 再次检查（可能在等待锁期间状态已变化）
      if (!this.stateMachine.canTransitionTo('SYNCING')) {
        return;
      }

      this.recoveryInProgress = true;
      this.emit('recovery-started');
      console.log('[DatabaseProxy] Starting recovery process...');

      try {
        // 1. 重新连接主数据库（确保连接状态正确）
        if (!this.primaryAdapter.isConnected()) {
          console.log('[DatabaseProxy] Reconnecting to PostgreSQL...');
          try {
            await this.primaryAdapter.connect();
            console.log('[DatabaseProxy] PostgreSQL reconnected successfully');
          } catch (connectError) {
            console.error('[DatabaseProxy] Failed to reconnect to PostgreSQL:', connectError);
            // 连接失败，保持降级状态
            return;
          }
        }

        // 2. 重新初始化 Schema Registry（如果启动时跳过了）
        try {
          await initializeSchemaRegistry(this.prismaClient);
          console.log('[DatabaseProxy] Schema registry re-initialized');
        } catch (schemaError) {
          console.warn(
            '[DatabaseProxy] Schema registry re-initialization failed, using hardcoded mappings:',
            schemaError instanceof Error ? schemaError.message : String(schemaError),
          );
        }

        // 3. 重新获取写入锁（如果启用了 Fencing）
        if (this.config.fencing.enabled) {
          try {
            await this.fencingManager.acquireLock();
            console.log('[DatabaseProxy] Write lock re-acquired');
          } catch (lockError) {
            console.warn('[DatabaseProxy] Failed to re-acquire fencing lock:', lockError);
            // 继续恢复流程，锁失败不阻止同步
          }
        }

        // 4. 转换到同步状态
        this.stateMachine.startSync('PostgreSQL recovered, starting sync');
        this.dualWriteManager.setState('SYNCING');
        this.emit('sync-started');

        // 5. 执行同步（将 SQLite 的变更同步到 PostgreSQL）
        const syncResult = await this.performSync();

        if (syncResult.success) {
          // 同步成功，恢复正常
          this.stateMachine.recover('Sync completed successfully');
          this.healthMonitor.markRecovered();
          this.dualWriteManager.setState('NORMAL');
          console.log('[DatabaseProxy] Recovery completed successfully, now in NORMAL mode');
          this.emit('recovery-completed');
        } else {
          // 同步失败，回到降级状态
          this.stateMachine.syncFailed('Sync failed');
          this.dualWriteManager.setState('DEGRADED');
          console.error('[DatabaseProxy] Sync failed, staying in DEGRADED mode');
        }

        this.emit('sync-completed', syncResult);
      } catch (error) {
        console.error('[DatabaseProxy] Recovery failed with error:', error);
        this.emit('error', error as Error);
        this.stateMachine.syncFailed('Sync failed with error');
        this.dualWriteManager.setState('DEGRADED');
      } finally {
        this.recoveryInProgress = false;
      }
    });
  }

  /**
   * 执行增量同步（从变更日志）
   */
  private async performSync(): Promise<SyncResult> {
    if (!this.syncManager) {
      console.warn('[DatabaseProxy] SyncManager not initialized, skipping sync');
      return { success: true, syncedCount: 0, conflictCount: 0, errors: [], duration: 0 };
    }

    try {
      // 更新缓存的待同步数量
      if (this.changeLogManager) {
        this.cachedPendingSyncCount = await this.changeLogManager.getUnsyncedCount();
      }

      console.log('[DatabaseProxy] Starting incremental sync from changelog...');
      const result = await this.syncManager.sync();

      // 同步后再次更新缓存
      if (this.changeLogManager) {
        this.cachedPendingSyncCount = await this.changeLogManager.getUnsyncedCount();
      }

      this.lastSyncTime = Date.now();
      if (result.success) {
        this.lastSyncError = null;
        console.log(
          `[DatabaseProxy] Sync completed: ${result.syncedCount} changes synced, ${result.conflictCount} conflicts`,
        );
      } else {
        this.lastSyncError =
          result.errors.length > 0 ? result.errors[0].error : 'Unknown sync error';
        console.error('[DatabaseProxy] Sync completed with errors:', result.errors);
      }

      return result;
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : String(error);
      console.error('[DatabaseProxy] Sync failed:', error);
      return {
        success: false,
        syncedCount: 0,
        conflictCount: 0,
        errors: [{ changeId: 0, error: this.lastSyncError }],
        duration: 0,
      };
    }
  }

  /**
   * 执行全量同步
   */
  private async performFullSync(): Promise<void> {
    console.log('[DatabaseProxy] Starting full sync from PostgreSQL to SQLite...');
    const tables = await this.primaryAdapter.getAllTableNames();
    let totalSynced = 0;

    for (const tableName of tables) {
      // 跳过系统表
      if (tableName.startsWith('_')) continue;

      try {
        // 获取 SQLite 表的列名
        const sqliteColumns = await this.getSQLiteTableColumns(tableName);
        if (sqliteColumns.length === 0) {
          // 表在 SQLite 中不存在，跳过
          continue;
        }

        let offset = 0;
        const batchSize = this.config.sync.batchSize;
        let tableCount = 0;

        while (true) {
          const rows = await this.primaryAdapter.getTableData(tableName, { batchSize, offset });
          if (rows.length === 0) break;

          // 只保留 SQLite 中存在的列
          const filteredRows = rows.map((row) => {
            const filtered: Record<string, unknown> = {};
            for (const col of sqliteColumns) {
              if (col in row) {
                filtered[col] = row[col];
              }
            }
            return filtered;
          });

          const inserted = await this.fallbackAdapter.bulkInsert(tableName, filteredRows);
          tableCount += inserted;
          offset += batchSize;

          if (rows.length < batchSize) break;
        }

        if (tableCount > 0) {
          console.log(`[DatabaseProxy] Synced ${tableCount} rows to ${tableName}`);
          totalSynced += tableCount;
        }
      } catch (error) {
        console.warn(
          `[DatabaseProxy] Failed to sync table ${tableName}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    console.log(`[DatabaseProxy] Full sync completed: ${totalSynced} total rows synced`);
  }

  /**
   * 获取 SQLite 表的列名
   */
  private async getSQLiteTableColumns(tableName: string): Promise<string[]> {
    try {
      const result = await this.fallbackAdapter.$queryRaw<Array<{ name: string }>>(
        `PRAGMA table_info("${tableName}")`,
      );
      return result.map((r) => r.name);
    } catch {
      return [];
    }
  }

  // ============================================
  // Prisma 兼容 API
  // ============================================

  /**
   * 获取模型代理
   */
  private getModelProxy<T = unknown>(modelName: string): ProxyModelAdapter<T> {
    if (!this.modelProxies.has(modelName)) {
      this.modelProxies.set(modelName, new ProxyModelAdapter<T>(this, modelName));
    }
    return this.modelProxies.get(modelName) as ProxyModelAdapter<T>;
  }

  // Prisma 模型访问器
  get user() {
    return this.getModelProxy('User');
  }
  get wordBook() {
    return this.getModelProxy('WordBook');
  }
  get word() {
    return this.getModelProxy('Word');
  }
  get answerRecord() {
    return this.getModelProxy('AnswerRecord');
  }
  get session() {
    return this.getModelProxy('Session');
  }
  get userStudyConfig() {
    return this.getModelProxy('UserStudyConfig');
  }
  get wordLearningState() {
    return this.getModelProxy('WordLearningState');
  }
  get wordScore() {
    return this.getModelProxy('WordScore');
  }
  get algorithmConfig() {
    return this.getModelProxy('AlgorithmConfig');
  }
  get configHistory() {
    return this.getModelProxy('ConfigHistory');
  }
  get anomalyFlag() {
    return this.getModelProxy('AnomalyFlag');
  }
  get amasUserState() {
    return this.getModelProxy('AmasUserState');
  }
  get amasUserModel() {
    return this.getModelProxy('AmasUserModel');
  }
  get learningSession() {
    return this.getModelProxy('LearningSession');
  }
  get featureVector() {
    return this.getModelProxy('FeatureVector');
  }
  get habitProfile() {
    return this.getModelProxy('HabitProfile');
  }
  get rewardQueue() {
    return this.getModelProxy('RewardQueue');
  }
  get userStateHistory() {
    return this.getModelProxy('UserStateHistory');
  }
  get badgeDefinition() {
    return this.getModelProxy('BadgeDefinition');
  }
  get userBadge() {
    return this.getModelProxy('UserBadge');
  }
  get learningPlan() {
    return this.getModelProxy('LearningPlan');
  }
  get aBExperiment() {
    return this.getModelProxy('ABExperiment');
  }
  get aBVariant() {
    return this.getModelProxy('ABVariant');
  }
  get aBUserAssignment() {
    return this.getModelProxy('ABUserAssignment');
  }
  get aBExperimentMetrics() {
    return this.getModelProxy('ABExperimentMetrics');
  }
  get bayesianOptimizerState() {
    return this.getModelProxy('BayesianOptimizerState');
  }
  get causalObservation() {
    return this.getModelProxy('CausalObservation');
  }
  get wordReviewTrace() {
    return this.getModelProxy('WordReviewTrace');
  }
  get decisionRecord() {
    return this.getModelProxy('DecisionRecord');
  }
  get decisionInsight() {
    return this.getModelProxy('DecisionInsight');
  }
  get pipelineStage() {
    return this.getModelProxy('PipelineStage');
  }
  get word_frequency() {
    return this.getModelProxy('word_frequency');
  }
  get systemLog() {
    return this.getModelProxy('SystemLog');
  }
  get logAlertRule() {
    return this.getModelProxy('LogAlertRule');
  }
  get lLMAdvisorSuggestion() {
    return this.getModelProxy('LLMAdvisorSuggestion');
  }
  get suggestionEffectTracking() {
    return this.getModelProxy('SuggestionEffectTracking');
  }
  get userLearningObjectives() {
    return this.getModelProxy('UserLearningObjectives');
  }
  get objectiveHistory() {
    return this.getModelProxy('ObjectiveHistory');
  }
  get userLearningProfile() {
    return this.getModelProxy('UserLearningProfile');
  }
  get forgettingAlert() {
    return this.getModelProxy('ForgettingAlert');
  }
  get wordContext() {
    return this.getModelProxy('WordContext');
  }
  get notification() {
    return this.getModelProxy('Notification');
  }
  get userPreference() {
    return this.getModelProxy('UserPreference');
  }
  get visualFatigueRecord() {
    return this.getModelProxy('VisualFatigueRecord');
  }
  get userVisualFatigueConfig() {
    return this.getModelProxy('UserVisualFatigueConfig');
  }
  get userInteractionStats() {
    return this.getModelProxy('UserInteractionStats');
  }
  get userTrackingEvent() {
    return this.getModelProxy('UserTrackingEvent');
  }
  get wordQualityCheck() {
    return this.getModelProxy('WordQualityCheck');
  }
  get wordContentIssue() {
    return this.getModelProxy('WordContentIssue');
  }
  get wordContentVariant() {
    return this.getModelProxy('WordContentVariant');
  }
  get lLMAnalysisTask() {
    return this.getModelProxy('LLMAnalysisTask');
  }
  get systemWeeklyReport() {
    return this.getModelProxy('SystemWeeklyReport');
  }
  get userBehaviorInsight() {
    return this.getModelProxy('UserBehaviorInsight');
  }
  get alertRootCauseAnalysis() {
    return this.getModelProxy('AlertRootCauseAnalysis');
  }

  /**
   * 执行事务
   */
  async $transaction<T>(
    fn: (tx: TransactionClient) => Promise<T>,
    options?: { timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T>;
  async $transaction<T>(
    promises: Promise<T>[],
    options?: { timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T[]>;
  async $transaction<T>(
    fnOrPromises: ((tx: TransactionClient) => Promise<T>) | Promise<T>[],
    options?: { timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T | T[]> {
    // batch $transaction：兼容 PrismaPromise/Promise，按顺序执行以保持行为可预测
    if (Array.isArray(fnOrPromises)) {
      const results: T[] = [];
      for (const item of fnOrPromises) {
        results.push(await item);
      }
      return results;
    }

    // interactive $transaction
    const fn = fnOrPromises;
    const state = this.getState();
    const initialized = this.isInitialized();

    // 非 NORMAL（或未初始化）时，不使用主库事务：
    // - DEGRADED：写入必须走 DualWriteManager.writeDegraded 以记录 changelog
    // - SYNCING：写入应排队；读应保持一致性（由 ProxyModelAdapter 控制）
    if (!initialized || state !== 'NORMAL') {
      return fn(this as unknown as TransactionClient);
    }

    const captured: TransactionCapturedWrite[] = [];
    const result = await this.txCaptureStorage.run({ writes: captured }, async () => {
      return this.primaryAdapter.$transaction(fn, options);
    });

    await this.replayCapturedWritesToFallback(captured);
    return result;
  }

  /**
   * 执行原始查询
   * 正确处理模板字符串数组和普通字符串
   */
  async $queryRaw<T = unknown>(
    query: TemplateStringsArray | string,
    ...values: unknown[]
  ): Promise<T> {
    const state = this.getState();

    // 处理模板字符串数组
    let queryString: string;
    let queryValues: unknown[];

    if (typeof query === 'string') {
      // 普通字符串
      queryString = query;
      queryValues = values;
    } else {
      // TemplateStringsArray - 将模板字符串部分和值组合
      // 对于 SQLite，使用 ? 占位符
      // 对于 PostgreSQL，使用 $1, $2... 占位符
      if (state === 'NORMAL') {
        // PostgreSQL 风格占位符
        queryString = query.reduce((acc, part, i) => {
          return acc + part + (i < values.length ? `$${i + 1}` : '');
        }, '');
      } else {
        // SQLite 风格占位符
        queryString = query.reduce((acc, part, i) => {
          return acc + part + (i < values.length ? '?' : '');
        }, '');
      }
      queryValues = values;
    }

    if (state === 'NORMAL') {
      return this.primaryAdapter.$queryRaw<T>(queryString, ...queryValues);
    }

    return this.fallbackAdapter.$queryRaw<T>(queryString, ...queryValues);
  }

  /**
   * 执行原始查询（不安全）
   */
  async $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T> {
    const state = this.getState();

    if (state === 'NORMAL') {
      return this.primaryAdapter.$queryRaw<T>(query, ...values);
    }

    return this.fallbackAdapter.$queryRaw<T>(query, ...values);
  }

  /**
   * 执行原始命令
   * 正确处理模板字符串数组和普通字符串
   */
  async $executeRaw(query: TemplateStringsArray | string, ...values: unknown[]): Promise<number> {
    const state = this.getState();

    // 处理模板字符串数组
    let queryString: string;
    let queryValues: unknown[];

    if (typeof query === 'string') {
      queryString = query;
      queryValues = values;
    } else {
      if (state === 'NORMAL') {
        queryString = query.reduce((acc, part, i) => {
          return acc + part + (i < values.length ? `$${i + 1}` : '');
        }, '');
      } else {
        queryString = query.reduce((acc, part, i) => {
          return acc + part + (i < values.length ? '?' : '');
        }, '');
      }
      queryValues = values;
    }

    if (state === 'NORMAL') {
      return this.primaryAdapter.$executeRaw(queryString, ...queryValues);
    }

    return this.fallbackAdapter.$executeRaw(queryString, ...queryValues);
  }

  /**
   * 执行原始命令（不安全）
   */
  async $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number> {
    const state = this.getState();

    if (state === 'NORMAL') {
      return this.primaryAdapter.$executeRaw(query, ...values);
    }

    return this.fallbackAdapter.$executeRaw(query, ...values);
  }

  /**
   * 连接数据库
   */
  async $connect(): Promise<void> {
    await this.initialize();
  }

  /**
   * 断开连接
   */
  async $disconnect(): Promise<void> {
    await this.close();
  }

  /**
   * 注册事件处理器（Prisma 兼容存根）
   * 在代理模式下不支持 Prisma 事件，但保留接口兼容性
   */
  $on(eventType: string, callback: (event: unknown) => void): void {
    // 在代理模式下不支持 Prisma 原生事件
    // 使用 EventEmitter 的 on 方法代替
    console.warn(
      `[DatabaseProxy] $on is not fully supported in proxy mode. Use proxy.on() for state events.`,
    );
  }

  /**
   * 注册中间件（Prisma 兼容存根）
   * 在代理模式下不支持 Prisma 中间件
   */
  $use(middleware: unknown): void {
    console.warn(`[DatabaseProxy] $use middleware is not supported in proxy mode.`);
  }

  /**
   * 扩展客户端（Prisma 兼容存根）
   * 在代理模式下不支持 Prisma 扩展
   */
  $extends(extension: unknown): this {
    console.warn(`[DatabaseProxy] $extends is not supported in proxy mode.`);
    return this;
  }

  // ============================================
  // 状态和指标
  // ============================================

  /**
   * 获取健康状态
   */
  getHealthStatus(): DatabaseHealthStatus {
    const primaryHealth = this.healthMonitor.getLastResult();
    const syncStatus: SyncStatus = {
      lastSyncTime: this.lastSyncTime,
      pendingChanges: this.cachedPendingSyncCount,
      syncInProgress: this.stateMachine.isSyncing(),
      lastError: this.lastSyncError,
    };

    return {
      state: this.getState(),
      primary: {
        type: 'postgresql',
        healthy: primaryHealth?.healthy ?? false,
        latency: primaryHealth?.latency,
        consecutiveFailures: this.healthMonitor.getConsecutiveFailures(),
      },
      fallback: {
        type: 'sqlite',
        healthy: this.fallbackAdapter.isConnected(),
        syncStatus,
      },
      lastStateChange: this.stateMachine.getStats().lastStateChangeTime || 0,
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * 获取待同步的变更数量
   */
  async getPendingSyncCount(): Promise<number> {
    if (!this.changeLogManager) {
      return 0;
    }
    return this.changeLogManager.getUnsyncedCount();
  }

  /**
   * 手动触发同步
   */
  async triggerSync(): Promise<SyncResult> {
    if (this.getState() !== 'DEGRADED') {
      return {
        success: false,
        syncedCount: 0,
        conflictCount: 0,
        errors: [{ changeId: 0, error: 'Sync can only be triggered in DEGRADED state' }],
        duration: 0,
      };
    }

    // 先尝试重连主库
    await this.tryReconnectPrimary();

    // 如果重连失败，仍然返回错误
    if (!this.primaryAdapter.isConnected()) {
      return {
        success: false,
        syncedCount: 0,
        conflictCount: 0,
        errors: [{ changeId: 0, error: 'PostgreSQL is still unavailable' }],
        duration: 0,
      };
    }

    // 触发同步
    this.stateMachine.startSync('Manual sync triggered');
    const result = await this.performSync();

    if (result.success) {
      this.stateMachine.recover('Manual sync completed successfully');
      this.healthMonitor.markRecovered();
      this.dualWriteManager.setState('NORMAL');
    } else {
      this.stateMachine.syncFailed('Manual sync failed');
    }

    return result;
  }

  /**
   * 手动尝试重连主数据库
   * 用于在降级模式下主动检测主库是否已恢复
   */
  async tryReconnectPrimary(): Promise<{ success: boolean; error?: string }> {
    console.log('[DatabaseProxy] Attempting to reconnect to PostgreSQL...');

    try {
      // 1. 尝试连接
      await this.primaryAdapter.connect();
      console.log('[DatabaseProxy] PostgreSQL connection established');

      // 2. 执行健康检查确认连接有效
      const healthResult = await this.primaryAdapter.healthCheck(this.config.healthCheck.timeoutMs);

      if (!healthResult.healthy) {
        console.warn(
          '[DatabaseProxy] PostgreSQL connected but health check failed:',
          healthResult.error,
        );
        return { success: false, error: healthResult.error };
      }

      // 3. 重新初始化 Schema Registry
      try {
        await initializeSchemaRegistry(this.prismaClient);
        console.log('[DatabaseProxy] Schema registry initialized');
      } catch (schemaError) {
        console.warn(
          '[DatabaseProxy] Schema registry initialization failed:',
          schemaError instanceof Error ? schemaError.message : String(schemaError),
        );
      }

      console.log('[DatabaseProxy] PostgreSQL reconnection successful');
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('[DatabaseProxy] PostgreSQL reconnection failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 手动触发恢复流程
   * 检测主库是否可用，如果可用则触发完整恢复流程（重连 + 同步）
   */
  async forceRecoveryCheck(): Promise<{
    recovered: boolean;
    syncResult?: SyncResult;
    error?: string;
  }> {
    const currentState = this.getState();

    if (currentState === 'NORMAL') {
      return { recovered: true };
    }

    if (currentState === 'SYNCING') {
      return { recovered: false, error: 'Sync already in progress' };
    }

    console.log('[DatabaseProxy] Force recovery check initiated...');

    // 尝试重连主库
    const reconnectResult = await this.tryReconnectPrimary();

    if (!reconnectResult.success) {
      return { recovered: false, error: reconnectResult.error };
    }

    // 主库可用，触发恢复流程
    await this.handleRecovery();

    const newState = this.getState();
    return {
      recovered: newState === 'NORMAL',
      error: newState !== 'NORMAL' ? 'Recovery completed but sync may have failed' : undefined,
    };
  }

  /**
   * 获取同步管理器（用于高级操作）
   */
  getSyncManager(): SyncManager | null {
    return this.syncManager;
  }

  /**
   * 获取变更日志管理器（用于高级操作）
   */
  getChangeLogManager(): SQLiteChangeLogManager | null {
    return this.changeLogManager;
  }

  /**
   * 获取指标
   */
  getMetrics(): DatabaseMetrics {
    const stats = this.stateMachine.getStats();

    return {
      state: this.getState(),
      primaryHealthy: this.healthMonitor.getLastResult()?.healthy ?? false,
      fallbackHealthy: this.fallbackAdapter.isConnected(),
      pendingSyncChanges: this.dualWriteManager.getPendingCount(),
      totalQueries: this.totalQueries,
      failedQueries: this.failedQueries,
      averageLatency:
        this.queryLatencies.length > 0
          ? this.queryLatencies.reduce((a, b) => a + b, 0) / this.queryLatencies.length
          : 0,
      stateChanges: stats.stateChangeCount,
      lastStateChangeTime: stats.lastStateChangeTime,
    };
  }
}

/**
 * 创建数据库代理
 */
export function createDatabaseProxy(
  prismaClient: PrismaClient,
  config: DatabaseProxyConfig,
): DatabaseProxy {
  return new DatabaseProxy(prismaClient, config);
}
