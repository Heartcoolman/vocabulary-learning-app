# Week 3 Day 15: 集成测试、负载测试与文档交付

## 概览

**日期**: 2025-12-02 (Day 15)
**目标**: 完成Week 3最后5%任务，确保生产就绪
**预估时间**: 5-7小时

---

## 任务清单

### Task 1: 完成decision_insights集成 (P0, 2-3小时)

#### 1.1 写入逻辑集成

**文件**: `backend/src/amas/services/decision-recorder.service.ts`

```typescript
// 在persistDecisionTrace方法中添加
async persistDecisionTrace(trace: DecisionTrace): Promise<void> {
  // ... 现有decision_records upsert ...

  // 新增：写入decision_insights
  if (trace.userId && trace.state && trace.difficultyAnalysis) {
    await prisma.decisionInsight.upsert({
      where: { decisionId: trace.decisionId },
      update: {
        stateSnapshot: trace.state,
        difficultyFactors: trace.difficultyAnalysis,
        triggers: trace.triggers || [],
        featureVectorHash: this.hashFeatureVector(trace.state)
      },
      create: {
        id: createId(),
        decisionId: trace.decisionId,
        userId: trace.userId,
        stateSnapshot: trace.state,
        difficultyFactors: trace.difficultyAnalysis,
        triggers: trace.triggers || [],
        featureVectorHash: this.hashFeatureVector(trace.state)
      }
    });

    // Cache write-through
    await cacheService.set(
      CacheKeys.DECISION_INSIGHT(trace.decisionId),
      { state: trace.state, difficulty: trace.difficultyAnalysis },
      CacheTTL.AMAS_STATE
    );

    // Invalidate user-level explain cache
    await cacheService.del(`explain:${trace.userId}:*`);
  }
}

private hashFeatureVector(state: any): string {
  return crypto.createHash('sha256')
    .update(JSON.stringify(state))
    .digest('hex')
    .substring(0, 16);
}
```

#### 1.2 读取逻辑集成

**文件**: `backend/src/services/explainability.service.ts`

```typescript
async getDecisionExplanation(userId: string, decisionId?: string) {
  // ... 现有decision查找逻辑 ...

  // 优先从cache/DB读取insights
  const cacheKey = CacheKeys.DECISION_INSIGHT(decisionId);
  let insight = await cacheService.get(cacheKey);

  if (!insight) {
    insight = await prisma.decisionInsight.findUnique({
      where: { decisionId },
      select: {
        stateSnapshot: true,
        difficultyFactors: true,
        triggers: true
      }
    });

    if (insight) {
      await cacheService.set(cacheKey, insight, CacheTTL.AMAS_STATE);
    }
  }

  // 使用insight.stateSnapshot和insight.difficultyFactors
  // 如果不存在，fallback到现有计算逻辑
  if (insight) {
    return {
      decisionId,
      state: insight.stateSnapshot,
      difficultyAnalysis: insight.difficultyFactors,
      triggers: insight.triggers || [],
      computedFromCache: true
    };
  }

  // ... 现有计算逻辑 ...
}
```

#### 1.3 验证

```bash
# 1. 生成决策并验证insight写入
curl -X POST http://localhost:3000/api/amas/decide

# 2. 查询决策解释，验证从cache/DB读取
curl http://localhost:3000/api/amas/explain-decision?decisionId=xxx

# 3. 检查数据库
psql -d vocabulary_db -c "SELECT COUNT(*) FROM decision_insights;"
```

---

### Task 2: 编写Alert监控集成测试 (P1, 1.5-2小时)

**文件**: `backend/tests/unit/monitoring/alert-engine.test.ts`

```typescript
describe('AlertEngine', () => {
  describe('Threshold Rules', () => {
    it('fires when value exceeds threshold for consecutive periods', () => {
      const engine = new AlertEngine([
        {
          id: 'test_rule',
          metric: 'http.request.duration.p95',
          type: 'threshold',
          comparison: '>',
          threshold: 1.0,
          consecutivePeriods: 2,
          cooldownSeconds: 300,
          severity: 'P0',
          description: 'Test rule'
        }
      ]);

      // First violation: pending
      let events = engine.evaluate({
        timestamp: Date.now(),
        metrics: { 'http.request.duration.p95': 1.5 }
      });
      expect(events).toHaveLength(0);

      // Second consecutive violation: firing
      events = engine.evaluate({
        timestamp: Date.now() + 30000,
        metrics: { 'http.request.duration.p95': 1.5 }
      });
      expect(events).toHaveLength(1);
      expect(events[0].status).toBe('firing');

      // Resolution
      events = engine.evaluate({
        timestamp: Date.now() + 60000,
        metrics: { 'http.request.duration.p95': 0.5 }
      });
      expect(events).toHaveLength(1);
      expect(events[0].status).toBe('resolved');
    });

    it('respects cooldown period', () => {
      // ... test cooldown ...
    });
  });

  describe('Trend Rules', () => {
    it('fires when slope exceeds threshold', () => {
      // ... test trend detection ...
    });
  });

  describe('Counter Reset Detection', () => {
    it('handles counter reset without negative rates', () => {
      // ... test reset detection ...
    });
  });
});
```

**文件**: `backend/tests/unit/monitoring/webhook-notifier.test.ts`

```typescript
describe('WebhookNotifier', () => {
  it('rate limits to maxPerMinute', async () => {
    const notifier = new WebhookNotifier({
      genericUrl: 'http://test.com',
      maxPerMinute: 3
    });

    // Send 5 alerts rapidly
    for (let i = 0; i < 5; i++) {
      await notifier.notify(mockAlert);
    }

    // Only 3 should have been sent
    expect(axiosMock.post).toHaveBeenCalledTimes(3);
  });

  it('retries on failure', async () => {
    // ... test retry logic ...
  });
});
```

**运行测试**:
```bash
cd backend && npm run test:unit -- tests/unit/monitoring/
```

---

### Task 3: 负载测试验证性能开销 (P1, 1-1.5小时)

**目标**:
- 验证1000 req/sec吞吐量
- 验证metrics overhead <100ms per request
- 验证queue不overflow

**工具**: Apache Bench (ab) 或 k6

#### 3.1 创建负载测试脚本

**文件**: `backend/tests/load/monitoring-load.test.ts`

```typescript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },   // Ramp up to 100 rps
    { duration: '1m', target: 500 },    // Ramp to 500 rps
    { duration: '1m', target: 1000 },   // Ramp to 1000 rps
    { duration: '2m', target: 1000 },   // Hold at 1000 rps
    { duration: '30s', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],  // 95% of requests <200ms
    http_req_failed: ['rate<0.01'],    // <1% error rate
  },
};

export default function () {
  const response = http.get('http://localhost:3000/api/learning/session');
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time <200ms': (r) => r.timings.duration < 200,
  });

  sleep(0.001); // 1ms think time
}
```

#### 3.2 运行负载测试

```bash
# 启动服务器
cd backend && npm run dev

# 在另一个终端运行k6
k6 run tests/load/monitoring-load.test.ts

# 或使用ab
ab -n 10000 -c 100 http://localhost:3000/api/learning/session
```

#### 3.3 监控指标

```bash
# 1. 查询queue depth
curl http://localhost:3000/metrics | grep queue_size

# 2. 查询drop rate
curl http://localhost:3000/metrics | grep http_request_dropped_total

# 3. 查询alert状态
curl http://localhost:3000/api/alerts/active
```

#### 3.4 性能基线

| 指标 | 目标 | 实测 |
|------|------|------|
| Throughput | 1000 req/sec | ? |
| p95 latency | <200ms | ? |
| Queue depth (steady) | <50% capacity | ? |
| Drop rate | <0.1% | ? |
| Alert evaluation | <10ms | ? |

---

### Task 4: 编写Week 3完整文档和Runbook (P1, 1.5-2小时)

#### 4.1 Week 3 Complete Summary

**文件**: `docs/week3-complete-summary.md`

**内容**:
- 总体架构图（metrics collection → aggregation → alert evaluation → notification）
- 所有完成功能清单
- 代码改动统计
- 性能指标
- 部署配置
- 已知限制

#### 4.2 Operations Runbook

**文件**: `docs/week3-operations-runbook.md`

**内容**:
```markdown
# Week 3 Monitoring System Operations Runbook

## Quick Reference

### Health Checks
- `/health` - System health
- `/metrics` - Prometheus metrics
- `/api/alerts/active` - Active alerts

### Common Issues

#### Issue: Queue Full Alerts
**Symptoms**: `http_request_dropped_total` increasing
**Cause**: Metrics queue overflow
**Solution**:
1. Check current queue depth: `curl /metrics | grep queue_size`
2. If >90%, consider:
   - Increase FLUSH_BATCH_SIZE (env var)
   - Reduce sampling rates temporarily
   - Scale horizontally (add instances)

#### Issue: Alert Storm
**Symptoms**: Webhook rate limit warnings
**Cause**: Multiple alerts firing rapidly
**Solution**:
1. Check active alerts: `curl /api/alerts/active`
2. Identify root cause (5xx spike, latency, etc.)
3. Address underlying issue
4. Alerts will auto-resolve when metrics recover

#### Issue: Missing Metrics
**Symptoms**: Alert not firing despite issue
**Cause**: Sampling might have dropped the samples
**Solution**:
1. Check sampling config in metrics.middleware.ts
2. Verify route pattern matches SAMPLE_RULES
3. For P0 routes, ensure sampling rate = 1.0

### Configuration

#### Environment Variables
```bash
WORKER_LEADER=true              # Enable monitoring (leader only)
ALERT_WEBHOOK_URL=...           # Generic webhook
SLACK_WEBHOOK_URL=...           # Slack webhook
```

#### Tuning Parameters
```typescript
// metrics.middleware.ts
MAX_QUEUE_DEPTH = 10000         # Max queue size
FLUSH_BATCH_SIZE = 500          # Events per flush
FLUSH_INTERVAL_MS = 500         # Flush frequency

// alert-rules.ts
DEFAULT_EVALUATION_INTERVAL_MS = 30000  # Alert eval frequency
```

### Monitoring the Monitor

#### Key Metrics to Watch
- `http_request_dropped_total` - Should be ~0
- `amas_queue_size` - Should be <50% of max
- `amas_db_slow_query_total` - Baseline depends on load
- `http_request_duration_seconds` - p95 should be <200ms

#### Alert Testing
```bash
# Manually trigger high latency
curl -X POST http://localhost:3000/api/test/slow?delay=2000

# Verify alert fires
curl http://localhost:3000/api/alerts/active
```
```

#### 4.3 Performance Tuning Guide

**文件**: `docs/week3-performance-tuning.md`

---

## 成功标准

### Day 15完成标志
- ✅ decision_insights写入/读取verified
- ✅ Alert engine测试通过（覆盖率>80%）
- ✅ 负载测试达标（1000 req/sec, <200ms p95）
- ✅ 完整文档交付（summary + runbook + tuning guide）

### Week 3完成标志
- ✅ 所有P0/P1任务完成
- ✅ 代码质量评分>9/10
- ✅ 生产就绪（有测试、有文档、有监控）
- ✅ 性能目标达成（<100ms overhead, 1000 req/sec）

---

## 时间分配

| 任务 | 预估时间 | 优先级 |
|------|---------|-------|
| decision_insights集成 | 2-3h | P0 |
| Alert集成测试 | 1.5-2h | P1 |
| 负载测试 | 1-1.5h | P1 |
| 文档编写 | 1.5-2h | P1 |
| **总计** | **6-8.5h** | - |

**建议顺序**:
1. 上午：decision_insights集成 + Alert测试
2. 下午：负载测试 + 文档编写

---

## Rollout Plan

### 测试环境 (Day 15下午)
```bash
# 1. 运行所有测试
npm run test

# 2. 运行负载测试
k6 run tests/load/monitoring-load.test.ts

# 3. 验证metrics
curl http://localhost:3000/metrics
```

### Staging环境 (Day 16)
```bash
# 1. 部署到staging
git push origin dev
deploy-staging.sh

# 2. Smoke tests
curl https://staging.example.com/health
curl https://staging.example.com/api/alerts/active

# 3. 观察24小时
```

### 生产环境 (Day 17+)
```bash
# 1. 创建PR到main
gh pr create --title "Week 3: Complete Monitoring System"

# 2. Code review
# 3. Merge and deploy
# 4. Monitor for 1 week
```

---

**Day 15 Ready to Start!** 🚀

*计划创建时间: 2025-12-02*
