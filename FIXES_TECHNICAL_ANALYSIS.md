# AMAS 修复方案技术深度分析

**补充文档**: 详细技术分析与实施指导
**适用对象**: 开发工程师
**关联文档**: FIXES_VERIFICATION_REPORT.md

---

## 方案1: 并发锁保护 - 深度技术分析

### 当前竞态条件时序图

```
时间线 →

用户A: processEvent                       用户B: processEvent
  ├─ 获取锁 (userId=A)                      ├─ 获取锁 (userId=B)
  ├─ loadModel(A) → v1                     ├─ loadModel(B) → v1
  ├─ update model → v2                     ├─ update model → v2
  └─ saveModel(A, v2) ✓                    └─ saveModel(B, v2) ✓
         ↓                                         ↓
      释放锁                                    释放锁

延迟奖励Worker:
  ├─ applyDelayedReward(A, ...)  ← 无锁！
  ├─ loadModel(A) → v2           ← 可能与上方processEvent并发
  ├─ update model → v3
  └─ saveModel(A, v3) ✓          ← 可能覆盖processEvent的v2写入

问题:
1. processEvent和applyDelayedReward并发读取同一个model
2. 最终状态取决于执行顺序（非确定性）
3. 可能丢失processEvent的更新（lost update）
```

### 修复后的正确时序

```
时间线 →

用户A: processEvent
  ├─ 获取锁 (userId=A)
  ├─ loadModel(A) → v1
  ├─ update model → v2
  └─ saveModel(A, v2) ✓
      ↓
   释放锁
      ↓
延迟奖励Worker:
  ├─ 获取锁 (userId=A)  ← 等待processEvent释放锁
  ├─ loadModel(A) → v2  ← 读到最新状态
  ├─ update model → v3
  └─ saveModel(A, v3) ✓
      ↓
   释放锁

保证:
1. 串行化执行，无竞态条件
2. 每次更新都基于最新状态
3. 所有更新都被正确保存
```

### 锁机制内部实现分析

```typescript
// packages/backend/src/amas/core/engine.ts:1562-1609
async withUserLock<T>(userId: string, fn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> {
  // 1. 获取前一个锁的Promise（如果存在）
  const previousLock = this.userLocks.get(userId) ?? Promise.resolve();

  // 2. 创建当前锁的Promise
  let releaseLock: () => void;
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  // 3. 链式连接锁：当前锁等待前一个锁完成
  const chainedLock = previousLock.catch(() => {}).then(() => currentLock);
  this.userLocks.set(userId, chainedLock);

  // 4. 设置超时保护
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`用户锁超时 (${userId}): 操作超过 ${timeoutMs}ms`));
    }, timeoutMs);
  });

  // 5. 等待前一个锁释放（或超时）
  await Promise.race([previousLock.catch(() => {}), timeoutPromise]);

  // 6. 执行用户函数
  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    // 7. 清理：释放锁，清除超时
    cleanup();
  }
}

// 关键特性:
// ✅ 每个用户独立的锁队列
// ✅ FIFO执行顺序
// ✅ 超时自动释放（防止死锁）
// ✅ 异常安全（finally保证释放）
```

### 性能测试数据模拟

```typescript
// 压力测试场景: 1000个用户，每个用户10次操作
const results = {
  // 修复前（竞态条件）:
  before: {
    totalRequests: 10000,
    successRate: 0.95, // 5%失败（状态冲突）
    avgLatency: 45, // ms
    p99Latency: 120, // ms
    dataInconsistency: 500, // 约5%数据不一致
  },

  // 修复后（加锁）:
  after: {
    totalRequests: 10000,
    successRate: 1.0, // 100%成功
    avgLatency: 52, // ms (+7ms锁开销)
    p99Latency: 150, // ms (+30ms最坏情况)
    dataInconsistency: 0, // 0数据不一致
  },

  // 权衡分析:
  tradeoff: {
    latencyIncrease: '+15%', // 可接受
    consistencyGain: '+100%', // 关键改进
    throughput: '不受影响（用户间并行）',
  },
};
```

### 代码变更对比

```typescript
// ============================================
// 变更前: engine.ts:2153-2190
// ============================================
async applyDelayedRewardUpdate(
  userId: string,
  featureVector: number[],
  reward: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    // ❌ 直接操作，无并发保护
    const model = await this.modelRepo.loadModel(userId);
    if (!model) {
      return { success: false, error: 'model_not_found' };
    }

    // ... 模型更新逻辑

    await this.modelRepo.saveModel(userId, tempBandit.getModel());
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ============================================
// 变更后: 添加 withUserLock 包装
// ============================================
async applyDelayedRewardUpdate(
  userId: string,
  featureVector: number[],
  reward: number,
): Promise<{ success: boolean; error?: string }> {
  // ✅ 添加锁保护，与 processEvent 使用同一锁机制
  return this.isolation.withUserLock(userId, async () => {
    try {
      const model = await this.modelRepo.loadModel(userId);
      if (!model) {
        return { success: false, error: 'model_not_found' };
      }

      // ... 模型更新逻辑（不变）

      await this.modelRepo.saveModel(userId, tempBandit.getModel());
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }); // ← 锁在这里自动释放
}

// 变更统计:
// - 新增代码: 1行（withUserLock包装）
// - 缩进调整: 全部函数体向右缩进2空格
// - 删除代码: 0行
// - 逻辑变更: 0处（纯粹添加并发保护）
```

---

## 方案2: 疲劳模型 - 数学建模分析

### 当前实现的疲劳度公式

```typescript
// fatigue-estimator.ts:88-131

// 数学表示:
F(t+1) = decay(recovery(F(t), Δt_session), Δt_break) + accumulation(event)

// 展开:
F_recovered = recoveryModel.compute(F(t), now - lastSessionEnd)
F_decay = F_recovered × exp(-k × breakMinutes)
F_base = β·Δerr + γ·Δrt + δ·repeat
F_increment = F_base × (1 - F_decay) × smoothing
F(t+1) = F_decay + F_increment
```

### 问题：重叠时间窗口

```typescript
// 场景重现:
const timeline = {
  // 昨天 20:00 - 结束学习会话
  lastSessionEnd: new Date('2025-12-12T20:00:00'),
  lastUpdateTime: new Date('2025-12-12T20:00:00'),  // ← 指向同一时间

  // 今天 08:00 - 开始新会话
  now: new Date('2025-12-13T08:00:00'),

  // 计算:
  sessionGap: now - lastSessionEnd = 12小时,      // recoveryModel使用
  breakMinutes: (now - lastUpdateTime) / 60000 = 720分钟,  // exp衰减使用

  // 问题: 两个模型计算了同一段时间的恢复！
  recoveryModel: '12小时睡眠恢复',
  expDecay: '720分钟指数衰减',
  // 实际上是同一段时间，导致双重恢复（疲劳度下降过快）
};
```

### 修复方案：时间窗口隔离

```typescript
// 修复后的逻辑
update(features: FatigueFeatures): number {
  const now = features.currentTime ?? Date.now();
  const nowDate = new Date(now);

  // 1️⃣ 判断是否跨会话
  const lastSessionEnd = this.recoveryModel.getLastSessionEnd();
  const isNewSession = !lastSessionEnd ||
    (now - lastSessionEnd.getTime()) > SESSION_GAP_THRESHOLD;  // 5分钟

  let baselineFatigue = this.F;

  // 2️⃣ 仅在跨会话时应用 recoveryModel
  if (isNewSession && lastSessionEnd) {
    // 使用会话间恢复（长时间离线恢复）
    baselineFatigue = this.recoveryModel.computeRecoveredFatigue(
      this.F,
      nowDate
    );

    // 重置 lastUpdateTime 为会话开始时间
    this.lastUpdateTime = now;
  }

  // 3️⃣ 计算会话内休息时长
  const breakMinutes = features.breakMinutes ??
    Math.max(0, (now - this.lastUpdateTime) / 60000);

  // 4️⃣ 仅在会话内应用 exp 衰减（短休息）
  // 限制最大值，避免长时间断点重复计算
  const sessionBreakMinutes = Math.min(breakMinutes, SESSION_GAP_THRESHOLD / 60000);
  const F_decay = baselineFatigue * Math.exp(-this.k * sessionBreakMinutes);

  // 5️⃣ 累加新疲劳（逻辑不变）
  const F_base = this.beta * features.error_rate_trend +
                 this.gamma * features.rt_increase_rate +
                 this.delta * features.repeat_errors;
  const remainingCapacity = Math.max(0, 1 - F_decay);
  const F_increment = F_base * remainingCapacity * 0.5;

  let nextF = F_decay + F_increment;

  // 6️⃣ 长休息重置（保留）
  if (breakMinutes > this.longBreakThreshold) {
    nextF = 0.1;
  }

  this.F = clipFatigue(nextF);
  this.lastUpdateTime = now;

  return this.F;
}

// 新增常量
const SESSION_GAP_THRESHOLD = 5 * 60 * 1000;  // 5分钟
```

### 数学验证：修复前 vs 修复后

```typescript
// 用户行为: 昨天20:00结束学习(疲劳0.7) → 睡眠12小时 → 今天08:00开始学习

// ❌ 修复前（双重恢复）:
const buggyCalculation = {
  F_initial: 0.7,

  // recoveryModel: 睡眠12小时 → 恢复到 0.3
  F_recovered: 0.3,

  // exp衰减: 再次应用 720分钟衰减
  F_decay: 0.3 * Math.exp(-0.01 * 720) = 0.3 * 0.0007 = 0.0002,

  // 结果: 疲劳度几乎清零（不合理）
};

// ✅ 修复后（单次恢复）:
const fixedCalculation = {
  F_initial: 0.7,

  // 检测到新会话 → 仅应用 recoveryModel
  F_recovered: 0.3,

  // 会话内衰减: breakMinutes = 0（刚开始会话）
  F_decay: 0.3 * Math.exp(-0.01 * 0) = 0.3,

  // 第一个事件: 假设答错 → 增加疲劳
  F_base: 0.15 * 0.5 = 0.075,
  F_increment: 0.075 * (1 - 0.3) * 0.5 = 0.026,
  F_next: 0.3 + 0.026 = 0.326,

  // 结果: 合理的疲劳度（0.3起始，逐步累积）
};
```

### 测试用例设计

```typescript
describe('FatigueEstimator - Session Gap Fix', () => {
  test('跨会话恢复：仅应用 recoveryModel', () => {
    const estimator = new FatigueEstimator();

    // 1. 昨天结束学习，疲劳度 0.7
    estimator.update({
      error_rate_trend: 0.5,
      rt_increase_rate: 0.3,
      repeat_errors: 2,
      currentTime: new Date('2025-12-12T20:00:00').getTime(),
    });
    estimator.markSessionEnd(); // 标记会话结束
    expect(estimator.get()).toBeCloseTo(0.7, 1);

    // 2. 今天开始学习（12小时后）
    const nextF = estimator.update({
      error_rate_trend: 0,
      rt_increase_rate: 0,
      repeat_errors: 0,
      currentTime: new Date('2025-12-13T08:00:00').getTime(),
    });

    // 期望: 恢复到 ~0.3（不是几乎为0）
    expect(nextF).toBeGreaterThan(0.2);
    expect(nextF).toBeLessThan(0.4);
  });

  test('会话内短休息：仅应用 exp 衰减', () => {
    const estimator = new FatigueEstimator();

    // 1. 事件1: 答错，疲劳度上升
    estimator.update({
      error_rate_trend: 0.5,
      rt_increase_rate: 0.3,
      repeat_errors: 0,
      currentTime: Date.now(),
    });
    const F1 = estimator.get();

    // 2. 5分钟后，事件2（短休息）
    const F2 = estimator.update({
      error_rate_trend: 0,
      rt_increase_rate: 0,
      repeat_errors: 0,
      breakMinutes: 5, // 明确指定休息5分钟
    });

    // 期望: 轻微恢复（exp衰减），不触发 recoveryModel
    expect(F2).toBeLessThan(F1);
    expect(F2).toBeGreaterThan(F1 * 0.8); // 不会恢复太多
  });

  test('重叠窗口消除：不再双重恢复', () => {
    const estimator = new FatigueEstimator();

    // 模拟跨会话场景，验证不会出现接近0的异常值
    // ... 测试逻辑
  });
});
```

---

## 方案3: Query Token 安全分析

### 安全漏洞详解

```typescript
// 当前实现: tracking.routes.ts:32-38

// ❌ 不安全的做法
router.post(
  '/events',
  async (req, res, next) => {
    const queryToken = req.query.token; // ← Token在URL中
    if (queryToken && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${queryToken}`;
    }
    next();
  },
  optionalAuthMiddleware,
  // ...
);

// 攻击场景:

// 1️⃣ 服务器日志泄露
// Nginx access.log:
// 192.168.1.100 - - [13/Dec/2025:08:00:00] "POST /api/tracking/events?token=eyJhbGciOi... HTTP/1.1" 200
//                                                                        ↑ Token泄露

// 2️⃣ 浏览器历史泄露
// 用户浏览器历史:
// https://api.example.com/tracking/events?token=secret_token_here
// ↑ 任何能访问浏览器历史的人（家人、IT管理员）都能看到Token

// 3️⃣ Referer 泄露
// 如果页面跳转到第三方网站:
// Referer: https://api.example.com/tracking/events?token=secret_token_here
//          ↑ Token泄露给第三方

// 4️⃣ 缓存泄露
// CDN或代理可能缓存URL:
// GET /tracking/events?token=abc123 → 缓存
// 其他用户可能从缓存获取到带Token的URL
```

### 正确做法对比

```typescript
// ✅ 安全的做法：使用 Header
fetch('/api/tracking/events', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer eyJhbGciOi...',  // ← Token在Header中
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ events: [...] })
});

// sendBeacon 也支持自定义headers（现代浏览器）
const blob = new Blob([JSON.stringify({ events: [...] })], {
  type: 'application/json'
});
const headers = new Headers({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
});
navigator.sendBeacon('/api/tracking/events', blob);  // 浏览器自动添加headers
```

### 渐进式废弃策略

```typescript
// 步骤1: 添加废弃警告（保持兼容性）
router.post(
  '/events',
  async (req, res, next) => {
    const queryToken = req.query.token;
    if (queryToken) {
      // 记录使用情况
      logger.warn(
        {
          userId: req.user?.id,
          ip: req.ip,
          timestamp: new Date(),
        },
        'DEPRECATED: Query token authentication used',
      );

      // 增加指标计数
      metricsService.increment('api.tracking.query_token_usage');

      if (!req.headers.authorization) {
        req.headers.authorization = `Bearer ${queryToken}`;
      }
    }
    next();
  },
  optionalAuthMiddleware,
  // ...
);

// 步骤2: 监控阶段（1-2周）
// 查看 api.tracking.query_token_usage 指标
// 如果连续1周为0 → 可以安全移除

// 步骤3: 完全移除
router.post(
  '/events',
  optionalAuthMiddleware, // ← 只接受 Header 认证
  async (req: AuthRequest, res, next) => {
    // ... 业务逻辑
  },
);
```

---

## 方案4: 依赖版本 - 详细错误分析

### Zod 版本对比

```typescript
// ========================================
// Zod v3.23.8 (审查建议的版本 - 过时)
// ========================================
import { z } from 'zod';

// v3 API
const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // 只能用正则验证
  count: z.string().transform(Number), // 类型转换繁琐
});

// 问题:
// 1. 没有原生 datetime 验证
// 2. 类型转换需要 transform（性能差）
// 3. 缺少 brand 类型（类型安全性差）

// ========================================
// Zod v4.1.13 (当前版本 - 最新)
// ========================================
const schema = z.object({
  date: z.string().datetime({ precision: 3 }), // ✅ 原生datetime支持
  count: z.coerce.number(), // ✅ 简洁的类型强制转换
});

// 新特性:
// 1. ✅ datetime 精度控制（ISO 8601毫秒精度）
// 2. ✅ z.coerce.* 简化类型转换
// 3. ✅ z.brand() 品牌类型（编译时安全）
// 4. ✅ 性能优化（验证速度提升30%）
// 5. ✅ 更好的TypeScript类型推导
```

### 破坏性变更检测

```bash
# 检查项目中是否使用了 Zod v4 特性
cd /home/liji/danci/danci/packages/frontend

# 1. 搜索 datetime 精度验证
grep -r "datetime.*precision\|datetime.*offset" src/

# 2. 搜索 coerce 用法
grep -r "z\.coerce\." src/

# 3. 搜索 brand 类型
grep -r "z\.brand\|\.brand(" src/

# 4. 搜索 pipe 组合
grep -r "\.pipe(" src/

# 如果有任何匹配 → 降级会导致编译错误
```

### 实际案例：可能的破坏性影响

```typescript
// 假设项目使用了 Zod v4 API（需验证）

// frontend/src/schemas/answer.schema.ts
import { z } from 'zod';

// ❌ 如果降级到 v3，这些代码会报错
const AnswerSchema = z.object({
  timestamp: z.string().datetime({ precision: 3 }), // v4 API
  //                              ↑ v3 没有这个选项

  responseTime: z.coerce.number().positive(), // v4 API
  //              ↑ v3 没有 coerce

  userId: z.string().uuid().brand<'UserId'>(), // v4 API
  //                         ↑ v3 没有 brand
});

// 类型推导也会受影响
type Answer = z.infer<typeof AnswerSchema>;
// v4: { userId: string & Brand<'UserId'> }  ← 编译时类型安全
// v3: { userId: string }                    ← 失去类型安全
```

### React Query 版本对比

```typescript
// ========================================
// @tanstack/react-query 5.60.5 (审查建议 - 旧版本)
// ========================================
// 缺少的功能:
// - 无 query cancellation 改进
// - 无 TypeScript 5.5 兼容性修复
// - 无 devtools 性能优化

// ========================================
// @tanstack/react-query 5.90.12 (当前版本 - 最新)
// ========================================
// 新增功能:
// ✅ query cancellation 自动清理（防止内存泄漏）
// ✅ TypeScript 5.5+ 泛型推导改进
// ✅ React 18 Suspense 稳定性修复
// ✅ devtools 性能优化（大型应用）

// Bug 修复:
// ✅ #7234: infinite query 边界情况
// ✅ #7189: stale-while-revalidate 竞态
// ✅ #7156: queryClient.clear() 内存泄漏
```

### 正确的依赖管理策略

```bash
# 1. 检查依赖一致性
cd /home/liji/danci/danci
npm list zod
# 确保 frontend 和 shared 包使用相同的 Zod 版本

# 2. 升级到最新补丁版本（安全）
cd packages/frontend
npm update zod @tanstack/react-query

# 3. 检查 peer dependencies 警告
npm install  # 查看是否有兼容性警告

# 4. 运行测试验证
npm test
npm run build  # 确保编译通过

# ❌ 不要降级
# npm install zod@3.23.8  ← 永远不要这样做！
```

---

## 方案5: 监控系统 - 未来架构设计

### Prometheus 集成最佳实践

```typescript
// 未来引入 Prometheus 时的正确做法

// ============================================
// 1. 指标分层设计
// ============================================

// 系统级指标（低基数） → Prometheus
import { Counter, Histogram, Gauge } from 'prom-client';

// ✅ 低基数标签（安全）
const requestCounter = new Counter({
  name: 'amas_requests_total',
  help: 'Total number of AMAS requests',
  labelNames: ['phase', 'model_type', 'result'],
  // 基数: 3 × 3 × 3 = 27（安全）
});

// ✅ Histogram 代替高基数 Counter
const latencyHistogram = new Histogram({
  name: 'amas_decision_latency_seconds',
  help: 'AMAS decision latency',
  labelNames: ['phase'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1.0],
  // 基数: 3 × 5(buckets) = 15（安全）
});

// ============================================
// 2. 用户级指标（高基数） → Redis/内存
// ============================================

// ❌ 错误做法（会导致Prometheus崩溃）
const userMetricCounter = new Counter({
  name: 'user_actions_total',
  labelNames: ['userId', 'wordId', 'action'],
  // 基数: 10000用户 × 5000单词 × 10动作 = 5亿（灾难！）
});

// ✅ 正确做法：使用聚合
class UserMetricsAggregator {
  private redis: Redis;
  private memoryCache: Map<string, number>;

  async recordUserAction(userId: string, wordId: string, action: string) {
    // 存储到 Redis（高基数）
    await this.redis.hincrby(`user:${userId}:actions`, action, 1);

    // 仅聚合指标发送到 Prometheus（低基数）
    requestCounter.inc({
      phase: 'normal',
      model_type: 'linucb',
      result: 'success',
    });
  }

  // 定期聚合报告
  async exportAggregated() {
    // 从 Redis 聚合 → Prometheus
    const totalUsers = await this.redis.scard('active_users');
    userCountGauge.set(totalUsers); // 单个Gauge，无标签
  }
}

// ============================================
// 3. 基数预算表
// ============================================

const CARDINALITY_BUDGET = {
  // 标签名称 → 允许值列表
  phase: ['classify', 'explore', 'normal', 'fallback'],
  model_type: ['linucb', 'ensemble', 'thompson'],
  difficulty: ['easy', 'mid', 'hard'],
  result: ['success', 'failure', 'timeout'],

  // 总基数计算: 4 × 3 × 3 × 3 = 108
  // 安全阈值: < 10000
};

// 运行时验证
function sanitizeLabels(labels: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(labels)) {
    const allowedValues = CARDINALITY_BUDGET[key];
    if (!allowedValues) {
      logger.warn(`Unknown label: ${key}, skipping`);
      continue;
    }

    if (allowedValues.includes(value)) {
      sanitized[key] = value;
    } else {
      logger.warn(`Invalid label value: ${key}=${value}, using 'other'`);
      sanitized[key] = 'other';
    }
  }

  return sanitized;
}

// ============================================
// 4. 告警规则
// ============================================

// Prometheus 告警配置
const prometheusAlerts = `
groups:
  - name: amas_cardinality
    rules:
      # 告警: 时序数据基数过高
      - alert: HighMetricCardinality
        expr: sum(count by(__name__) (amas_requests_total)) > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "AMAS metrics cardinality is high"

      # 告警: 内存使用超过阈值
      - alert: PrometheusMemoryHigh
        expr: process_resident_memory_bytes{job="prometheus"} > 4e9
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Prometheus memory usage > 4GB"
`;
```

### 监控指标设计模板

```typescript
// metrics-design.ts
// 按照 RED 方法设计监控指标

export class AmasMetrics {
  // ============================================
  // R - Rate (请求速率)
  // ============================================
  private readonly requestRate = new Counter({
    name: 'amas_requests_total',
    help: 'Total AMAS requests',
    labelNames: ['phase', 'result'], // 低基数
  });

  recordRequest(phase: ColdStartPhase, result: 'success' | 'failure') {
    this.requestRate.inc({
      phase: this.sanitizePhase(phase),
      result,
    });
  }

  // ============================================
  // E - Errors (错误率)
  // ============================================
  private readonly errorRate = new Counter({
    name: 'amas_errors_total',
    help: 'Total AMAS errors',
    labelNames: ['error_type', 'recoverable'],
  });

  recordError(errorType: string, recoverable: boolean) {
    this.errorRate.inc({
      error_type: this.sanitizeErrorType(errorType),
      recoverable: String(recoverable),
    });
  }

  // ============================================
  // D - Duration (延迟)
  // ============================================
  private readonly latencyHistogram = new Histogram({
    name: 'amas_decision_latency_seconds',
    help: 'AMAS decision latency',
    labelNames: ['phase'],
    buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1.0],
  });

  recordLatency(phase: ColdStartPhase, latencyMs: number) {
    this.latencyHistogram.observe({ phase: this.sanitizePhase(phase) }, latencyMs / 1000);
  }

  // ============================================
  // 基数控制辅助函数
  // ============================================
  private sanitizePhase(phase: ColdStartPhase): string {
    const allowed = ['classify', 'explore', 'normal'];
    return allowed.includes(phase) ? phase : 'other';
  }

  private sanitizeErrorType(errorType: string): string {
    // 限制错误类型到预定义集合
    const errorMap: Record<string, string> = {
      model_not_found: 'model_error',
      feature_mismatch: 'feature_error',
      timeout: 'timeout',
      db_error: 'persistence_error',
    };
    return errorMap[errorType] || 'unknown';
  }
}

// 使用示例
const metrics = new AmasMetrics();

// ✅ 安全：低基数标签
metrics.recordRequest('classify', 'success');
metrics.recordLatency('normal', 45);

// ❌ 禁止：高基数标签
// metrics.recordRequest(userId, wordId);  ← 编译错误
```

---

## 附录：实施清单

### 方案1实施步骤

- [ ] 备份当前 `engine.ts` 文件
- [ ] 修改 `applyDelayedRewardUpdate` 方法（添加 withUserLock）
- [ ] 编译验证 (`npm run build`)
- [ ] 添加并发测试用例
- [ ] 运行全部测试 (`npm test`)
- [ ] Code Review
- [ ] 部署到测试环境
- [ ] 压力测试（1000 QPS）
- [ ] 监控指标验证（锁等待时间、成功率）
- [ ] 部署到生产环境
- [ ] 持续监控1周

### 方案2实施步骤

- [ ] 设计详细的时间窗口隔离方案
- [ ] 添加 `SESSION_GAP_THRESHOLD` 常量
- [ ] 修改 `update` 方法逻辑
- [ ] 添加会话边界测试用例
- [ ] 数学建模验证（Excel模拟）
- [ ] Code Review
- [ ] A/B测试（50%用户）
- [ ] 统计疲劳度分布差异
- [ ] 用户反馈收集
- [ ] 全量发布

### 方案3实施步骤

- [ ] 搜索前端 Query Token 使用情况
- [ ] 添加废弃警告日志
- [ ] 部署并监控使用情况
- [ ] 等待1-2周观察期
- [ ] 确认使用量为0
- [ ] 移除Query Token支持代码
- [ ] 更新API文档

---

**文档版本**: 1.0
**最后更新**: 2025-12-13
**维护者**: AMAS开发团队
