# 监控系统采样与聚合策略

**制定日期**: 2025-12-02
**性能目标**: <100ms总开销/请求，<10ms单指标记录
**负载目标**: 支持1000+ req/sec无降级
**准确性目标**: p95/p99误差 <5%

---

## 1. 采样策略（Sampling Rates）

### 1.1 HTTP请求指标

| 路由类型 | 采样率 | 说明 |
|---------|--------|------|
| **P0/P1核心路由** | 100% | 认证、决策、写操作（/auth, /decisions, /record） |
| **只读/分析路由** | 10-20% | Dashboard、统计查询 |
| **健康检查/静态资源** | 1-5% | /health, /metrics, 静态文件 |

**实现建议**:
```typescript
const samplingRates = {
  '/api/auth': 1.0,
  '/api/learning': 1.0,
  '/api/record': 1.0,
  '/api/about': 0.2,
  '/api/health': 0.01,
  'default': 0.1
};
```

### 1.2 AMAS决策质量指标

| 指标 | 采样率 | 条件 |
|------|--------|------|
| **置信度/漂移/覆盖** | 50-100% | 稳定后可降至25%（加权聚合） |
| **错误/失败推理** | 100% | 始终全量记录 |
| **反事实/解释延迟** | 50% | 成功请求 |
| **失败/超时** | 100% | 反事实/解释失败 |

### 1.3 数据库查询指标

| 类型 | 采样率 | 触发条件 |
|------|--------|----------|
| **慢查询检测器** | 100% | 仅记录 >200ms 的查询 |
| **常规查询** | 20% | 全局基准采样 |
| **错误查询** | 100% | 始终记录 |

### 1.4 缓存指标

| 事件 | 采样率 | 说明 |
|------|--------|------|
| **缓存命中** | 10% | 命中量大，低信息密度 |
| **缓存未命中** | 50-100% | 未命中可能预示问题 |
| **缓存错误** | 100% | 连接失败、超时等 |

### 1.5 错误vs成功采样原则

**通用规则**:
- ✅ **成功**: 按上述路由/类型采样
- ❌ **5xx/4xx错误**: 100%记录（标签限制生效）
- ⚠️ **关注级错误**: 依然受标签基数限制

---

## 2. 队列与缓冲架构

### 2.1 异步队列设计

```
┌─────────────────────────────────────────────────────┐
│              Request Thread (Non-Blocking)          │
│  recordMetric() → lightweight event → enqueue()     │
│  时限: <1-2ms，失败则丢弃+计数                        │
└──────────────────┬──────────────────────────────────┘
                   │
       ┌───────────▼─────────────┐
       │  Per-CPU Sharded Queues │
       │  (减少锁竞争)             │
       │  Depth: 5-10k/shard     │
       │  Drop-oldest on overflow│
       └───────────┬─────────────┘
                   │
       ┌───────────▼──────────────┐
       │   Flush Worker (1-2s)    │
       │  - Drain N events        │
       │  - Aggregate (counters)  │
       │  - Histogram bins/digest │
       │  - Apply label caps      │
       │  - Rotate snapshot       │
       └───────────┬──────────────┘
                   │
       ┌───────────▼──────────────┐
       │  Read-only Snapshot      │
       │  (Prometheus scrape)     │
       │  No locks, fast export   │
       └──────────────────────────┘
```

### 2.2 队列参数

| 参数 | 值 | 说明 |
|------|---|------|
| **队列深度** | 5,000-10,000 entries/shard | CPU核心数分片 |
| **刷新间隔** | 1-2秒 | 平衡延迟vs批处理效率 |
| **入队超时** | 1-2ms | 超时则丢弃，计入drop counter |
| **溢出策略** | Drop-oldest | 优先保留最新数据 |

### 2.3 双缓冲Histogram

**问题**: Prometheus scrape时不能阻塞写入
**方案**: Double-buffer

```typescript
class DoubleBufferHistogram {
  private activeBuffer: Histogram;
  private readOnlySnapshot: Histogram;

  observe(value: number) {
    activeBuffer.observe(value);
  }

  // Flush worker调用
  rotateSnapshot() {
    readOnlySnapshot = activeBuffer.clone();
    activeBuffer.reset();
  }

  // Scrape调用
  getStats() {
    return readOnlySnapshot.getStats();
  }
}
```

---

## 3. 标签管理策略

### 3.1 基数控制

| 控制措施 | 限制值 | 行为 |
|---------|--------|------|
| **每指标最大唯一标签** | 200-500 | LRU驱逐，计入`label_evict_total` |
| **标签值长度** | 64字符 | 截断或hash |
| **高基数值处理** | Hash to token | 错误消息、用户ID等 |

### 3.2 规范化标签集

**推荐标签**（低基数）:
```typescript
{
  service: 'amas',
  route: '/api/learning',
  status_class: '2xx' | '4xx' | '5xx',
  tenant: 'default',
  model_version: 'v1.2.0',
  feature_flag: 'explainability_enabled'
}
```

**禁止标签**（高基数风险）:
- ❌ 请求ID (traceId)
- ❌ 完整错误消息
- ❌ 用户ID (可hash后采样)
- ❌ 完整SQL查询

### 3.3 标签vs独立指标

**使用独立指标的场景**:
```typescript
// ✅ 好：独立指标
decision_timeout_total
decision_validation_error_total
decision_model_fallback_total

// ❌ 差：自由文本标签
decision_error_total{error_message="Connection timeout to model service X"}
decision_error_total{error_message="Validation failed: missing field Y"}
```

**标签适用场景**: 枚举值、有限集合（状态码、路由、错误类型码）

---

## 4. Histogram优化方案

### 4.1 当前问题

**现状**: 存储最近1000个原始值
**内存**: ~8KB/histogram × 多个指标 = 100KB+
**性能**: 每次scrape需排序计算

### 4.2 推荐方案

#### **方案A: Prometheus风格固定桶** (推荐)

```typescript
class BucketHistogram {
  private buckets: Map<number, number>; // {le: count}
  private sum: number;
  private count: number;

  constructor() {
    // 预定义桶：10ms, 50ms, 100ms, 200ms, 500ms, 1s, 2s, 5s
    this.buckets = new Map([
      [10, 0], [50, 0], [100, 0], [200, 0],
      [500, 0], [1000, 0], [2000, 0], [5000, 0], [Infinity, 0]
    ]);
  }

  observe(value: number) {
    this.sum += value;
    this.count++;
    for (const [le, count] of this.buckets) {
      if (value <= le) {
        this.buckets.set(le, count + 1);
      }
    }
  }

  getStats() {
    // 近似p95/p99通过桶插值
    return { ...buckets, sum, count };
  }
}
```

**优点**:
- ✅ 内存固定（~200 bytes/histogram）
- ✅ O(1)写入，O(1)读取
- ✅ 可合并（多实例聚合）
- ✅ Prometheus原生支持

**缺点**:
- ⚠️ 精度取决于桶边界（通常可接受）

#### **方案B: T-Digest** (高精度需求)

**使用场景**: 需要精确p95/p99且内存预算充足

```typescript
import TDigest from 't-digest';

class TDigestHistogram {
  private digest: TDigest;

  constructor() {
    this.digest = new TDigest(100); // compression factor
  }

  observe(value: number) {
    this.digest.push(value);
  }

  getStats() {
    return {
      p50: this.digest.percentile(0.5),
      p95: this.digest.percentile(0.95),
      p99: this.digest.percentile(0.99)
    };
  }
}
```

**特性**:
- ✅ 压缩存储（~1-2KB）
- ✅ 精度高（误差<1%）
- ✅ 可合并
- ⚠️ 需引入依赖

### 4.3 内存预算分配

| 组件 | 单位内存 | 数量估算 | 总预算 |
|------|---------|---------|--------|
| **Counter** | ~100B | 50个 | 5KB |
| **Gauge** | ~100B | 20个 | 2KB |
| **Histogram (Bucket)** | ~200B | 30个 | 6KB |
| **Histogram (T-Digest)** | ~2KB | 0-10个 | 20KB |
| **标签存储** | ~50B/label | 5000个 | 250KB |
| **队列** | ~100B/event | 50k (5 shards) | 5MB |
| **总计** | | | **~5.3MB** |

**目标**: <10MB总内存（含队列）

---

## 5. 背压与降级策略

### 5.1 背压处理流程

```
┌─────────────────────────────────────┐
│  Enqueue Failed (queue full)       │
└───────────┬─────────────────────────┘
            │
     ┌──────▼──────┐
     │ Drop metric │
     └──────┬──────┘
            │
     ┌──────▼──────────────────────────┐
     │ metrics_drop_total{             │
     │   reason="queue_full"           │
     │ }++                             │
     └──────┬──────────────────────────┘
            │
     ┌──────▼──────────────────────────┐
     │ Log WARN (once per interval)    │
     └─────────────────────────────────┘
```

### 5.2 熔断器规则

| 触发条件 | 响应措施 | 恢复条件 |
|---------|---------|---------|
| **丢弃率 >10% (1分钟)** | 降低成功请求采样率50% | 丢弃率 <5% (2分钟) |
| **丢弃率 >30% (1分钟)** | 禁用非P0指标采集 | 手动恢复或重启 |
| **刷新延迟 >5秒** | 触发告警，增大队列 | 延迟 <2秒 |
| **Scrape超时 (>10s)** | 告警，考虑分页导出 | 手动调查 |

### 5.3 降级优先级

**P0 (始终保留)**:
- HTTP 5xx错误计数
- 决策失败率
- 数据库连接错误

**P1 (10%丢弃时保留)**:
- 核心路由延迟
- 缓存未命中
- 队列深度

**P2 (30%丢弃时停止)**:
- 成功请求采样
- 分析类指标
- Debug指标

### 5.4 监控监控系统（Meta-Monitoring）

**必需暴露指标**:
```prometheus
# 队列健康
metrics_queue_depth{shard="0"}
metrics_queue_capacity{shard="0"}

# 丢弃统计
metrics_drop_total{reason="queue_full"}
metrics_drop_total{reason="label_limit"}
metrics_drop_total{reason="timeout"}

# 刷新性能
metrics_flush_duration_seconds
metrics_flush_events_processed_total

# Scrape性能
metrics_scrape_duration_seconds
metrics_scrape_series_count

# 熔断状态
metrics_circuit_breaker_state{level="p0"|"p1"|"p2"}
```

---

## 6. 实现伪代码

### 6.1 请求路径（异步记录）

```typescript
class MetricsCollector {
  private queues: MetricQueue[];  // Per-CPU shards
  private dropCounter: Counter;

  recordMetric(event: MetricEvent): void {
    const start = Date.now();

    // 采样决策
    if (!this.shouldSample(event)) {
      return;
    }

    // 选择shard（减少锁竞争）
    const shardId = event.hash % this.queues.length;
    const queue = this.queues[shardId];

    // 非阻塞入队（1-2ms超时）
    const success = queue.tryEnqueue(event, timeout: 2);

    if (!success) {
      this.dropCounter.inc('queue_full');
      // 每分钟仅log一次
      this.rateLimitedLog('Metrics queue full, dropping event');
    }

    // 确保<10ms
    const elapsed = Date.now() - start;
    if (elapsed > 10) {
      console.warn(`Slow metric record: ${elapsed}ms`);
    }
  }

  private shouldSample(event: MetricEvent): boolean {
    const rate = getSamplingRate(event.type, event.route);
    return Math.random() < rate;
  }
}
```

### 6.2 Flush Worker

```typescript
class FlushWorker {
  private interval: NodeJS.Timeout;

  start() {
    this.interval = setInterval(() => {
      this.flush();
    }, 1500); // 1.5秒
  }

  private flush() {
    const start = Date.now();

    // 从所有shard排空事件
    const events = this.drainQueues(maxEvents: 10000);

    // 批量聚合
    for (const event of events) {
      switch (event.type) {
        case 'counter':
          this.counters[event.name].inc(event.labels, event.value);
          break;
        case 'histogram':
          this.histograms[event.name].observe(event.value);
          break;
        case 'gauge':
          this.gauges[event.name].set(event.value);
          break;
      }

      // 强制标签限制
      this.enforceLabel Caps(event.name);
    }

    // 轮换快照（双缓冲）
    for (const histogram of this.histograms.values()) {
      histogram.rotateSnapshot();
    }

    const duration = Date.now() - start;
    this.metricsFlushDuration.observe(duration);
    this.metricsFlushEventsProcessed.inc(events.length);

    if (duration > 1000) {
      console.warn(`Slow flush: ${duration}ms for ${events.length} events`);
    }
  }
}
```

### 6.3 Prometheus Scrape

```typescript
router.get('/metrics/prometheus', (req, res) => {
  const start = Date.now();

  // 仅读取快照，无锁
  const lines: string[] = [];

  for (const [name, counter] of counters) {
    lines.push(`# TYPE ${name} counter`);
    for (const [labels, value] of counter.getSnapshot()) {
      lines.push(`${name}{${formatLabels(labels)}} ${value}`);
    }
  }

  for (const [name, histogram] of histograms) {
    const stats = histogram.getReadOnlyStats();
    lines.push(`# TYPE ${name} histogram`);
    // Bucket format...
  }

  const duration = Date.now() - start;
  metricsScrape Duration.observe(duration);
  metricsScrapeSeries Count.set(lines.length);

  res.type('text/plain').send(lines.join('\n'));
});
```

---

## 7. 风险缓解措施

### 7.1 高基数爆发

**风险**: 错误消息、动态路由等导致标签爆炸
**缓解**:
- ✅ Hash+bucket长文本标签
- ✅ 每指标强制上限（200-500标签）
- ✅ 专用指标 `label_evicted_total{metric="X"}`
- ✅ 告警：标签数 >80% cap

### 7.2 长时间Scrape

**风险**: 百万级时间序列导致scrape超时
**缓解**:
- ✅ 限制暴露的series数量（如10k）
- ✅ 分页/批量导出（如果Prometheus支持）
- ✅ 预渲染字符串缓存（避免每次格式化）
- ✅ 告警：scrape >10s

### 7.3 统计精度验证

**风险**: 桶/T-Digest误差超出预期
**缓解**:
- ✅ 集成测试：合成已知分布，验证p95/p99
- ✅ 对比实际查询日志vs监控值
- ✅ 调整bucket边界或digest压缩因子
- ✅ 文档化精度保证（±5%）

### 7.4 启动/关闭异常

**风险**: 监控启动失败阻塞服务器，关闭丢失数据
**缓解**:
- ✅ 启动失败不crash服务器（try-catch）
- ✅ 关闭时flush队列（10秒超时）
- ✅ 禁用监控时所有record()变no-op
- ✅ 告警：监控服务未运行

### 7.5 配置灵活性

**环境变量**:
```bash
# 功能开关
MONITORING_ENABLED=true

# 采样率覆盖
MONITORING_HTTP_SAMPLE_RATE=0.1
MONITORING_DECISION_SAMPLE_RATE=0.5

# 队列参数
MONITORING_QUEUE_DEPTH=10000
MONITORING_FLUSH_INTERVAL_MS=1500

# 性能限制
MONITORING_MAX_LABELS_PER_METRIC=300
MONITORING_ENQUEUE_TIMEOUT_MS=2
```

**默认策略**: 生产环境保守（降低采样），开发环境激进（全采样）

---

## 8. 实施计划

### Phase 1: 队列化（Day 12）
- ✅ 实现Per-CPU分片队列
- ✅ 异步入队+超时
- ✅ Drop counter
- ✅ Flush worker (1-2s间隔)

### Phase 2: Histogram优化（Day 12-13）
- ✅ 双缓冲实现
- ✅ 切换至固定桶或T-Digest
- ✅ 快照轮换机制

### Phase 3: 采样控制（Day 13）
- ✅ 每路由采样率配置
- ✅ 错误100%记录
- ✅ 采样决策逻辑

### Phase 4: 标签管理（Day 13-14）
- ✅ LRU标签缓存
- ✅ 基数上限强制
- ✅ 标签eviction counter

### Phase 5: 背压与熔断（Day 14）
- ✅ 丢弃率告警
- ✅ 动态降采样
- ✅ 熔断器状态机
- ✅ Meta-monitoring指标

### Phase 6: 验证（Day 15）
- ✅ 负载测试：1000 req/sec
- ✅ 验证<100ms开销
- ✅ 精度测试：p95/p99误差<5%
- ✅ 熔断器功能测试

---

## 9. 性能验证清单

### 负载测试场景

| 场景 | RPS | Duration | 成功标准 |
|------|-----|----------|---------|
| **轻负载** | 100 | 5分钟 | 0 drops, <5ms/record |
| **常规负载** | 1000 | 10分钟 | <1% drops, <10ms/record |
| **峰值负载** | 2000 | 5分钟 | <5% drops, <20ms/record |
| **过载压力** | 5000 | 2分钟 | 熔断触发，服务存活 |

### 精度验证

```typescript
// 测试：已知分布验证percentiles
const testData = generateNormalDistribution(mean: 100, std: 20, n: 10000);
for (const value of testData) {
  histogram.observe(value);
}

const actual_p95 = histogram.getStats().p95;
const expected_p95 = 132.9; // 理论值

assert(Math.abs(actual_p95 - expected_p95) / expected_p95 < 0.05); // <5%误差
```

### 内存泄漏检查

```bash
# 运行24小时，监控heap
node --expose-gc backend/src/index.ts
# 定期触发GC，检查heap不增长
```

---

## 10. 参考资料

- [Prometheus Best Practices - Histograms](https://prometheus.io/docs/practices/histograms/)
- [T-Digest Paper](https://arxiv.org/abs/1902.04023)
- [HdrHistogram](http://hdrhistogram.org/)
- [Google SRE - Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- Codex策略会话: `019adea7-3cb9-7f23-bb60-d2d62f7a22f0`

---

**文档版本**: v1.0
**下次审查**: Day 15 负载测试后
