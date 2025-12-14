# AMAS 并发问题修复实施指南

## 快速参考

| 问题                            | 文件                                | 严重程度  | 修复方案              | 预计工作量 |
| ------------------------------- | ----------------------------------- | --------- | --------------------- | ---------- |
| `applyDelayedRewardUpdate` 无锁 | `src/amas/core/engine.ts:2153-2190` | 🔴 高危   | 添加 `withUserLock`   | 2小时      |
| 仓库层非原子操作                | `src/repositories/*.ts`             | 🟠 中高危 | Prisma事务 + 分布式锁 | 1-2天      |

---

## 修复方案1：`applyDelayedRewardUpdate` 添加用户锁

### ✅ 修改文件

**文件路径**：`/home/liji/danci/danci/packages/backend/src/amas/core/engine.ts`

### 📝 修改内容

找到第 **2153-2190** 行的 `applyDelayedRewardUpdate` 方法，完整替换为：

```typescript
async applyDelayedRewardUpdate(
  userId: string,
  featureVector: number[],
  reward: number,
): Promise<{ success: boolean; error?: string }> {
  // ✅ 添加用户锁保护，防止与 processEvent 的竞态条件
  return this.isolation.withUserLock(userId, async () => {
    try {
      const model = await this.modelRepo.loadModel(userId);
      if (!model) {
        return { success: false, error: 'model_not_found' };
      }

      let alignedFeatureVector = featureVector;
      if (featureVector.length !== model.d) {
        this.logger?.info('Feature vector dimension mismatch, applying compatibility fix', {
          userId,
          featureVectorLength: featureVector.length,
          modelDimension: model.d,
        });

        alignedFeatureVector = this.featureVectorBuilder.alignFeatureVectorDimension(
          featureVector,
          model.d
        );
      }

      const tempBandit = new LinUCB({
        alpha: model.alpha,
        lambda: model.lambda,
        dimension: model.d,
      });
      tempBandit.setModel(model);
      tempBandit.updateWithFeatureVector(new Float32Array(alignedFeatureVector), reward);

      await this.modelRepo.saveModel(userId, tempBandit.getModel());

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }); // ← withUserLock 结束
}
```

### 🧪 验证步骤

1. **编译检查**：

```bash
cd /home/liji/danci/danci/packages/backend
npm run build
```

2. **单元测试**（在现有测试基础上添加）：

在 `/home/liji/danci/danci/packages/backend/tests/unit/amas/engine/engine-core.test.ts` 中添加：

```typescript
describe('AMASEngine - Concurrency Safety', () => {
  it('应该安全处理并发的延迟奖励更新', async () => {
    const { engine } = createTestEngine();
    const userId = 'concurrent-test-user';
    const testEvent = createValidEvent();

    // 初始化用户模型
    await engine.processEvent(userId, testEvent, {});

    // 并发执行5个延迟奖励更新
    const updates = Array.from({ length: 5 }, (_, i) => ({
      vector: Array(15)
        .fill(0)
        .map(() => Math.random()),
      reward: 0.5 + i * 0.1,
    }));

    const results = await Promise.all(
      updates.map((u) => engine.applyDelayedRewardUpdate(userId, u.vector, u.reward)),
    );

    // 验证所有更新都成功
    expect(results.every((r) => r.success)).toBe(true);

    // 验证模型确实被更新了
    const model = await engine['modelRepo'].loadModel(userId);
    expect(model).toBeDefined();
    expect(model!.updateCount).toBeGreaterThanOrEqual(5);
  });

  it('应该防止延迟更新和实时决策的竞态', async () => {
    const { engine } = createTestEngine();
    const userId = 'race-test-user';
    const testEvent = createValidEvent();

    // 并发执行：1个实时决策 + 3个延迟更新
    const [processResult, ...updateResults] = await Promise.all([
      engine.processEvent(userId, testEvent, {}),
      engine.applyDelayedRewardUpdate(userId, Array(15).fill(0.5), 0.8),
      engine.applyDelayedRewardUpdate(userId, Array(15).fill(0.6), 0.7),
      engine.applyDelayedRewardUpdate(userId, Array(15).fill(0.4), 0.9),
    ]);

    expect(processResult.success).toBe(true);
    expect(updateResults.every((r) => r.success)).toBe(true);
  });
});
```

3. **运行测试**：

```bash
npm run test -- engine-core.test.ts
```

### 📊 预期影响

- **延迟增加**：+5-15ms（锁等待）
- **并发吞吐量**：同一用户串行化（设计预期）
- **数据一致性**：100%（消除竞态）

---

## 修复方案2：仓库层事务保护（可选，推荐在第二阶段实施）

### ✅ 新增文件

**文件路径**：`/home/liji/danci/danci/packages/backend/src/repositories/transactional-repository.ts`

```typescript
/**
 * 事务性持久化管理器
 * 确保 State 和 Model 保存的原子性
 */

import { StateRepository, ModelRepository, PersistenceManager } from '../amas/core/engine';
import { UserState, UserStateWithColdStart, BanditModel } from '../amas/types';
import { amasLogger } from '../logger';
import prisma from '../config/database';
import { DatabaseStateRepository, DatabaseModelRepository } from './database-repository';

export class TransactionalPersistenceManager implements PersistenceManager {
  constructor(
    private stateRepo: DatabaseStateRepository,
    private modelRepo: DatabaseModelRepository,
    private logger?: typeof amasLogger,
  ) {}

  async loadState(userId: string): Promise<UserState | null> {
    return this.stateRepo.loadState(userId);
  }

  async saveState(userId: string, state: UserState): Promise<void> {
    await this.stateRepo.saveState(userId, state);
  }

  async loadModel(userId: string): Promise<BanditModel | null> {
    return this.modelRepo.loadModel(userId);
  }

  async saveModel(userId: string, model: BanditModel): Promise<void> {
    await this.modelRepo.saveModel(userId, model);
  }

  /**
   * ✅ 原子性保存 State 和 Model
   * 使用 Prisma 事务确保两者同时成功或同时失败
   */
  async saveStateAndModel(userId: string, state: UserState, model: BanditModel): Promise<void> {
    const db = prisma;

    try {
      await db.$transaction(async (tx) => {
        // 1. 保存 State（在事务内）
        const safeState = this.sanitizeUserState(state);
        const coldStartState = (state as UserStateWithColdStart).coldStartState;

        const cognitiveJson = safeState.C as unknown as object;
        const habitJson = safeState.H ? (safeState.H as unknown as object) : undefined;
        const coldStartJson = coldStartState ? (coldStartState as unknown as object) : undefined;

        await tx.amasUserState.upsert({
          where: { userId },
          create: {
            userId,
            attention: safeState.A,
            fatigue: safeState.F,
            motivation: safeState.M,
            confidence: safeState.conf,
            cognitiveProfile: cognitiveJson,
            habitProfile: habitJson,
            trendState: safeState.T,
            lastUpdateTs: BigInt(safeState.ts),
            coldStartState: coldStartJson,
          },
          update: {
            attention: safeState.A,
            fatigue: safeState.F,
            motivation: safeState.M,
            confidence: safeState.conf,
            cognitiveProfile: cognitiveJson,
            habitProfile: habitJson,
            trendState: safeState.T,
            lastUpdateTs: BigInt(safeState.ts),
            coldStartState: coldStartJson,
          },
        });

        // 2. 保存 Model（在事务内）
        const serializedModel = this.serializeBanditModel(model);

        await tx.amasUserModel.upsert({
          where: { userId },
          create: {
            userId,
            modelData: serializedModel,
          },
          update: {
            modelData: serializedModel,
          },
        });

        this.logger?.debug('[TransactionalPersistence] State and Model saved atomically', {
          userId,
          stateTs: state.ts,
          modelUpdateCount: model.updateCount,
        });
      });
    } catch (error) {
      this.logger?.error('[TransactionalPersistence] Transaction failed, rollback executed', {
        userId,
        err: error,
      });
      throw error;
    }
  }

  // 辅助方法（从 DatabaseStateRepository 复制）
  private sanitizeUserState(state: UserState): UserState {
    const sanitizeNumber = (v: number, min: number, max: number, defaultVal: number): number => {
      if (!Number.isFinite(v)) return defaultVal;
      return Math.max(min, Math.min(max, v));
    };

    return {
      A: sanitizeNumber(state.A, 0, 1, 0.5),
      F: sanitizeNumber(state.F, 0, 1, 0),
      M: sanitizeNumber(state.M, -1, 1, 0),
      conf: sanitizeNumber(state.conf, 0, 1, 0.5),
      C: {
        mem: sanitizeNumber(state.C?.mem ?? 0.5, 0, 1, 0.5),
        speed: sanitizeNumber(state.C?.speed ?? 0.5, 0, 1, 0.5),
        stability: sanitizeNumber(state.C?.stability ?? 0.5, 0, 1, 0.5),
      },
      H: state.H,
      T: state.T,
      ts: Number.isFinite(state.ts) ? state.ts : Date.now(),
    };
  }

  private serializeBanditModel(model: BanditModel): object {
    return {
      A: Array.from(model.A),
      b: Array.from(model.b),
      L: model.L ? Array.from(model.L) : undefined,
      d: model.d,
      lambda: model.lambda,
      alpha: model.alpha,
      updateCount: model.updateCount,
    };
  }
}
```

### 📝 导出更新

在 `/home/liji/danci/danci/packages/backend/src/repositories/index.ts` 中添加：

```typescript
export {
  DatabaseStateRepository,
  DatabaseModelRepository,
  databaseStateRepository,
  databaseModelRepository,
} from './database-repository';

export {
  CachedStateRepository,
  CachedModelRepository,
  cachedStateRepository,
  cachedModelRepository,
} from './cached-repository';

// ✅ 新增导出
export { TransactionalPersistenceManager } from './transactional-repository';
```

### 🔧 引擎中使用（可选，在需要时启用）

在 `src/amas/core/engine.ts` 中，找到保存 State 和 Model 的地方（推测在 `processEventCore` 方法的末尾），可以选择性地使用：

```typescript
// 原有逻辑（保留为默认）
await this.persistence.saveState(userId, newState);
await this.persistence.saveModel(userId, newModel);

// ✅ 可选：启用事务保护（需要在初始化时注入 TransactionalPersistenceManager）
// if (this.persistence instanceof TransactionalPersistenceManager) {
//   await this.persistence.saveStateAndModel(userId, newState, newModel);
// } else {
//   await this.persistence.saveState(userId, newState);
//   await this.persistence.saveModel(userId, newModel);
// }
```

---

## 部署和灰度策略

### 阶段1：修复1的灰度发布（Week 1）

1. **代码提交**：

```bash
git checkout -b fix/concurrency-delayed-reward
# 修改文件
git add packages/backend/src/amas/core/engine.ts
git add packages/backend/tests/unit/amas/engine/engine-core.test.ts
git commit -m "fix: add user lock protection to applyDelayedRewardUpdate

- Wrap applyDelayedRewardUpdate with isolation.withUserLock
- Prevent race condition between delayed reward and real-time decision
- Add concurrency safety tests

Resolves: AMAS-CONCURRENCY-001"
git push origin fix/concurrency-delayed-reward
```

2. **测试环境验证**：

```bash
# 运行所有测试
npm run test

# 运行集成测试
npm run test:integration

# 性能基准测试（如果有）
npm run test:benchmark
```

3. **灰度发布计划**：

| 阶段    | 流量比例 | 持续时间 | 监控指标               | 回滚条件          |
| ------- | -------- | -------- | ---------------------- | ----------------- |
| Stage 1 | 10%      | 2小时    | P99延迟 < 100ms        | 错误率 > 0.1%     |
| Stage 2 | 30%      | 4小时    | 模型更新成功率 > 99.5% | 锁超时 > 5次/分钟 |
| Stage 3 | 50%      | 12小时   | 数据一致性检查通过     | 用户投诉          |
| Stage 4 | 100%     | -        | 系统稳定运行           | -                 |

4. **监控检查清单**：

```bash
# 1. 检查延迟奖励更新成功率
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN success = true THEN 1 ELSE 0 END) as success_count,
  (SUM(CASE WHEN success = true THEN 1 ELSE 0 END)::float / COUNT(*)) as success_rate
FROM (
  -- 从日志或监控系统查询
) AS delayed_reward_updates
WHERE timestamp > NOW() - INTERVAL '1 hour';

# 2. 检查模型 updateCount 一致性
SELECT
  user_id,
  model_update_count,
  state_update_count,
  ABS(model_update_count - state_update_count) as drift
FROM (
  SELECT
    u.user_id,
    (m.model_data->>'updateCount')::int as model_update_count,
    COUNT(a.id) as state_update_count
  FROM amas_user_model m
  JOIN amas_user_state s ON m.user_id = s.user_id
  LEFT JOIN answer_record a ON a.user_id = m.user_id
  GROUP BY u.user_id, m.model_data
) AS consistency_check
WHERE drift > 10;

# 3. 检查锁等待时间
# （通过 Prometheus 或应用日志）
histogram_quantile(0.99, amas_lock_wait_time_ms_bucket{operation="delayed_reward"})
```

### 阶段2：修复2的灰度发布（Week 2-3）

**仅在修复1稳定运行后启用**

1. **功能开关**：

在 `src/config/feature-flags.ts` 中添加：

```typescript
export function isTransactionalPersistenceEnabled(): boolean {
  return process.env.ENABLE_TRANSACTIONAL_PERSISTENCE === 'true';
}
```

2. **条件注入**：

在引擎初始化时：

```typescript
// src/amas/core/engine.ts 或初始化文件
import { isTransactionalPersistenceEnabled } from '../config/feature-flags';
import { TransactionalPersistenceManager } from '../../repositories/transactional-repository';

function createPersistenceManager(): PersistenceManager {
  if (isTransactionalPersistenceEnabled()) {
    return new TransactionalPersistenceManager(
      databaseStateRepository,
      databaseModelRepository,
      amasLogger,
    );
  } else {
    return new DefaultPersistenceManager(databaseStateRepository, databaseModelRepository);
  }
}
```

3. **环境变量配置**：

```bash
# .env.development
ENABLE_TRANSACTIONAL_PERSISTENCE=false

# .env.production（灰度）
ENABLE_TRANSACTIONAL_PERSISTENCE=true
```

---

## 回滚计划

### 紧急回滚步骤

如果发现严重问题（错误率飙升、性能严重下降），立即回滚：

```bash
# 1. 关闭功能开关（如果使用了开关）
# 修改环境变量或配置文件
export ENABLE_TRANSACTIONAL_PERSISTENCE=false

# 2. 重启服务
pm2 restart amas-backend

# 3. 或者回滚代码版本
git revert <commit-hash>
git push origin main
# 触发 CI/CD 部署

# 4. 验证回滚成功
curl -X GET https://api.example.com/health/amas
```

### 回滚后的数据一致性检查

```sql
-- 检查是否有不一致的记录（在回滚前后对比）
SELECT
  COUNT(*) as inconsistent_records
FROM amas_user_state s
LEFT JOIN amas_user_model m ON s.user_id = m.user_id
WHERE
  ABS(EXTRACT(EPOCH FROM s.last_update_ts) - EXTRACT(EPOCH FROM m.updated_at)) > 60;
  -- 如果时间差超过60秒，可能存在不一致
```

---

## 常见问题 (FAQ)

### Q1: 添加用户锁后，会不会导致延迟奖励处理变慢？

**A**: 会有小幅延迟增加（+5-15ms），但这是可接受的：

- 延迟奖励是异步处理，不在用户关键路径上
- 用户锁只锁定单个用户，不影响其他用户
- 锁等待时间通常很短（几毫秒），除非有长时间的 `processEvent` 操作

### Q2: 如果两个延迟奖励同时到达，会发生什么？

**A**: 有了用户锁后，它们会串行执行：

```
T0: 延迟奖励A获取锁 → 执行 loadModel → update → saveModel → 释放锁
T1: 延迟奖励B等待锁 → 获取锁 → 执行 loadModel（已包含A的更新）→ ...
```

结果：两个更新都生效，不会互相覆盖。

### Q3: `withUserLock` 的超时时间是多少？会不会导致死锁？

**A**: 默认超时 30 秒（见 `engine.ts:1562`）：

```typescript
async withUserLock<T>(userId: string, fn: () => Promise<T>, timeoutMs: number = 30000)
```

- 超时后会抛出异常，自动释放锁
- 异常会被上层捕获并记录
- 不会导致永久死锁

### Q4: 事务保护会不会显著增加数据库负载？

**A**: 影响可控：

- Prisma 事务是轻量级的（基于 PostgreSQL 的 MVCC）
- 事务内的操作很快（通常 < 50ms）
- 只在必要时使用（关键路径的 State+Model 保存）
- 可以通过功能开关逐步启用

### Q5: 如果 Redis 宕机，分布式锁会影响系统吗？

**A**: 有降级策略（见 `cached-repository.ts:78-84`）：

```typescript
if (this.cacheEnabled) {
  try {
    await redisCacheService.delUserState(userId);
  } catch (error) {
    amasLogger.warn('删除缓存失败，降级继续执行数据库写入');
    // 继续执行，不阻断主流程
  }
}
```

- Redis 故障时，降级为直接操作数据库
- 不影响核心业务逻辑
- 只是缓存性能下降

---

## 后续优化建议

### 1. 监控增强

添加自定义监控指标：

```typescript
// src/monitoring/amas-concurrency-metrics.ts

import { Counter, Histogram } from 'prom-client';

export const amasConcurrencyMetrics = {
  lockWaitTime: new Histogram({
    name: 'amas_lock_wait_time_ms',
    help: 'User lock wait time in milliseconds',
    labelNames: ['operation'],
    buckets: [1, 5, 10, 25, 50, 100, 250, 500],
  }),

  lockTimeouts: new Counter({
    name: 'amas_lock_timeouts_total',
    help: 'Total number of lock timeouts',
    labelNames: ['operation'],
  }),

  concurrentUpdates: new Counter({
    name: 'amas_concurrent_updates_total',
    help: 'Total number of concurrent update attempts',
    labelNames: ['user_id'],
  }),
};

// 在 withUserLock 中记录指标
export class IsolationManager {
  async withUserLock<T>(
    userId: string,
    fn: () => Promise<T>,
    timeoutMs: number = 30000,
  ): Promise<T> {
    const startWait = Date.now();

    // ... 原有逻辑 ...

    // ✅ 记录锁等待时间
    const waitTime = Date.now() - startWait;
    amasConcurrencyMetrics.lockWaitTime.labels('delayed_reward').observe(waitTime);

    return result;
  }
}
```

### 2. 性能优化（未来迭代）

如果锁等待成为瓶颈，考虑：

- **批量处理延迟奖励**：累积多个奖励，一次性更新
- **异步队列**：使用消息队列（RabbitMQ/Redis Stream）串行处理
- **读写分离**：延迟奖励使用从库读取，减少主库压力

### 3. 数据一致性验证工具

创建定期检查脚本：

```typescript
// scripts/verify-data-consistency.ts

import prisma from '../src/config/database';

async function verifyConsistency() {
  const inconsistencies = await prisma.$queryRaw`
    SELECT
      s.user_id,
      s.last_update_ts as state_ts,
      m.updated_at as model_ts,
      ABS(EXTRACT(EPOCH FROM s.last_update_ts) - EXTRACT(EPOCH FROM m.updated_at)) as drift_seconds
    FROM "AmasUserState" s
    JOIN "AmasUserModel" m ON s.user_id = m.user_id
    WHERE ABS(EXTRACT(EPOCH FROM s.last_update_ts) - EXTRACT(EPOCH FROM m.updated_at)) > 60
    LIMIT 100;
  `;

  if (inconsistencies.length > 0) {
    console.error('发现数据不一致:', inconsistencies);
    // 发送告警
  } else {
    console.log('数据一致性检查通过');
  }
}

// 定时运行（cron job）
setInterval(verifyConsistency, 300000); // 每5分钟
```

---

## 参考资料

- **用户隔离锁实现**：`packages/backend/src/amas/core/engine.ts:1562-1609`
- **仓库层实现**：`packages/backend/src/repositories/`
- **现有测试**：`packages/backend/tests/unit/amas/engine/engine-core.test.ts`
- **Prisma 事务文档**：https://www.prisma.io/docs/concepts/components/prisma-client/transactions
- **Redis 分布式锁**：https://redis.io/docs/manual/patterns/distributed-locks/

---

**文档版本**：v1.0
**最后更新**：2025-12-13
**负责人**：Backend Team
**审核状态**：待评审
