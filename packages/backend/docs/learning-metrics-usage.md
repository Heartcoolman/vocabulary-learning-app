# 学习体验指标系统使用文档

## 概述

学习体验指标系统提供了6个核心指标来监控用户学习体验质量：

1. **retention_rate** - 用户留存率（次日/7日/30日）
2. **review_hit_rate** - 复习命中率（实际复习/应复习）
3. **answer_latency_p99** - 答题时延P99
4. **session_dropout_rate** - 会话中断率
5. **forgetting_prediction_accuracy** - 遗忘预测准确率
6. **flow_session_ratio** - 心流会话占比

## 快速开始

### 1. 导入指标模块

```typescript
import {
  updateRetentionRate,
  recordReview,
  recordAnswerLatency,
  recordSessionStart,
  recordSessionComplete,
  recordSessionDropout,
  recordForgettingPrediction,
  recordFlowSession,
  learningMetricsService,
} from '../monitoring/learning-metrics';
```

### 2. 记录实时指标

#### 答题时延

```typescript
// 在答题记录保存时
const responseTime = answerRecord.responseTime; // 毫秒
recordAnswerLatency(responseTime);
```

#### 学习会话

```typescript
// 会话开始
recordSessionStart();

// 会话完成（达到学习目标）
recordSessionComplete();

// 会话中断（用户提前退出）
recordSessionDropout();
```

#### 复习行为

```typescript
// 计算应复习和实际复习的单词数
const expectedReviews = await getExpectedReviewCount();
const actualReviews = await getActualReviewCount();
recordReview(expectedReviews, actualReviews);
```

#### 遗忘预测

```typescript
// 每次答题时评估预测准确性
const predicted = predictWillRemember(learningState);
const actual = answerRecord.isCorrect;
const isCorrect = predicted === actual;
recordForgettingPrediction(isCorrect);
```

#### 心流会话

```typescript
// 会话结束时判断是否为心流会话
if (isFlowSession(session)) {
  recordFlowSession();
}
```

### 3. 定时更新聚合指标

```typescript
import { startScheduler } from '../schedulers/learning-metrics-scheduler';

// 在应用启动时启动调度器
startScheduler();
```

或手动触发更新：

```typescript
import { learningMetricsService } from '../monitoring/learning-metrics';

// 手动更新所有指标
await learningMetricsService.updateMetrics();
```

### 4. 获取指标数据

#### JSON 格式

```typescript
const metrics = learningMetricsService.getMetricsJson();
console.log(metrics);
// {
//   learning_retention_rate_1d: { type: 'gauge', value: 75 },
//   learning_review_hit_rate: { type: 'gauge', value: 0.85 },
//   learning_answer_latency_ms: {
//     type: 'histogram',
//     p50: 2000,
//     p95: 5000,
//     p99: 8000
//   },
//   ...
// }
```

#### Prometheus 格式

```typescript
const prometheus = learningMetricsService.getMetricsPrometheus();
console.log(prometheus);
// # HELP learning_retention_rate_1d 次日留存率（百分比）
// # TYPE learning_retention_rate_1d gauge
// learning_retention_rate_1d 75
// ...
```

## API 端点

### GET /api/about/metrics

获取所有监控指标（JSON格式），包括AMAS指标和学习体验指标。

**响应示例：**

```json
{
  "success": true,
  "data": {
    "amas": { ... },
    "learning": {
      "learning_retention_rate_1d": {
        "type": "gauge",
        "help": "次日留存率（百分比）",
        "value": 75
      },
      "learning_review_hit_rate": {
        "type": "gauge",
        "help": "复习命中率（实际复习数/应复习数）",
        "value": 0.85
      },
      "learning_answer_latency_ms": {
        "type": "histogram",
        "help": "答题时延（毫秒）",
        "count": 1000,
        "sum": 2500000,
        "avg": 2500,
        "p50": 2000,
        "p95": 5000,
        "p99": 8000
      },
      "learning_session_dropout_rate": {
        "type": "gauge",
        "help": "会话中断率（中断会话/总会话）",
        "value": 0.15
      },
      "learning_forgetting_prediction_accuracy": {
        "type": "gauge",
        "help": "遗忘预测准确率（百分比）",
        "value": 82.5
      },
      "learning_flow_session_ratio": {
        "type": "gauge",
        "help": "心流会话占比（心流会话/总会话）",
        "value": 0.35
      }
    }
  }
}
```

### GET /api/about/metrics/prometheus

获取Prometheus格式的监控指标，可直接被Prometheus抓取。

**响应示例：**

```
# HELP learning_retention_rate_1d 次日留存率（百分比）
# TYPE learning_retention_rate_1d gauge
learning_retention_rate_1d 75

# HELP learning_retention_rate_7d 7日留存率（百分比）
# TYPE learning_retention_rate_7d gauge
learning_retention_rate_7d 60

# HELP learning_retention_rate_30d 30日留存率（百分比）
# TYPE learning_retention_rate_30d gauge
learning_retention_rate_30d 45

# HELP learning_review_hit_rate 复习命中率（实际复习数/应复习数）
# TYPE learning_review_hit_rate gauge
learning_review_hit_rate 0.85

# HELP learning_answer_latency_ms 答题时延（毫秒）
# TYPE learning_answer_latency_ms histogram
learning_answer_latency_ms_bucket{le="100"} 50
learning_answer_latency_ms_bucket{le="200"} 150
learning_answer_latency_ms_bucket{le="500"} 400
learning_answer_latency_ms_bucket{le="1000"} 700
learning_answer_latency_ms_bucket{le="2000"} 900
learning_answer_latency_ms_bucket{le="3000"} 950
learning_answer_latency_ms_bucket{le="5000"} 980
learning_answer_latency_ms_bucket{le="10000"} 995
learning_answer_latency_ms_bucket{le="20000"} 1000
learning_answer_latency_ms_bucket{le="+Inf"} 1000
learning_answer_latency_ms_sum 2500000
learning_answer_latency_ms_count 1000
```

## 集成示例

### 在答题路由中记录指标

```typescript
// src/routes/record.routes.ts
import { recordAnswerLatency, recordForgettingPrediction } from '../monitoring/learning-metrics';

router.post('/submit', async (req, res) => {
  const startTime = Date.now();

  // 处理答题逻辑
  const answerRecord = await createAnswerRecord(req.body);

  // 记录答题时延
  recordAnswerLatency(answerRecord.responseTime);

  // 记录遗忘预测准确率
  const learningState = await getLearningState(answerRecord.userId, answerRecord.wordId);
  const predicted = predictAnswer(learningState);
  const actual = answerRecord.isCorrect;
  recordForgettingPrediction(predicted === actual);

  res.json({ success: true, data: answerRecord });
});
```

### 在学习会话管理中记录指标

```typescript
// src/services/learning-session.service.ts
import {
  recordSessionStart,
  recordSessionComplete,
  recordSessionDropout,
  recordFlowSession,
} from '../monitoring/learning-metrics';

export class LearningSessionService {
  async startSession(userId: string): Promise<LearningSession> {
    const session = await prisma.learningSession.create({
      data: { userId, startedAt: new Date() },
    });

    // 记录会话开始
    recordSessionStart();

    return session;
  }

  async endSession(sessionId: string, completed: boolean): Promise<void> {
    const session = await prisma.learningSession.update({
      where: { id: sessionId },
      data: { endedAt: new Date() },
    });

    if (completed) {
      recordSessionComplete();

      // 判断是否为心流会话
      if (await this.isFlowSession(session)) {
        recordFlowSession();
      }
    } else {
      recordSessionDropout();
    }
  }

  private async isFlowSession(session: LearningSession): Promise<boolean> {
    // 心流判断逻辑：
    // 1. 正确率在60%-85%之间（适度挑战）
    // 2. 答题时间稳定（变异系数 < 0.5）
    // 3. 完成至少10道题
    const records = await prisma.answerRecord.findMany({
      where: { sessionId: session.id },
    });

    if (records.length < 10) return false;

    const correctCount = records.filter((r) => r.isCorrect).length;
    const accuracy = correctCount / records.length;
    if (accuracy < 0.6 || accuracy > 0.85) return false;

    const responseTimes = records.map((r) => r.responseTime).filter((t): t is number => t !== null);
    const mean = responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;
    const variance =
      responseTimes.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / responseTimes.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / mean;

    return cv < 0.5;
  }
}
```

### 在应用启动时初始化

```typescript
// src/app.ts
import { startScheduler } from './schedulers/learning-metrics-scheduler';

// ... 其他初始化代码

// 启动学习体验指标调度器
startScheduler();

// ... 启动服务器
```

## 环境变量配置

```env
# 学习体验指标自动更新间隔（毫秒），默认1小时
LEARNING_METRICS_UPDATE_INTERVAL=3600000

# 是否启用自动更新，默认true
LEARNING_METRICS_AUTO_UPDATE=true
```

## Prometheus 配置

在 `prometheus.yml` 中添加抓取配置：

```yaml
scrape_configs:
  - job_name: 'danci-backend'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/api/about/metrics/prometheus'
    scrape_interval: 30s
```

## Grafana 面板

可以基于这些指标创建 Grafana 面板：

### 留存率趋势

```promql
learning_retention_rate_1d
learning_retention_rate_7d
learning_retention_rate_30d
```

### 答题时延分布

```promql
histogram_quantile(0.50, learning_answer_latency_ms)
histogram_quantile(0.95, learning_answer_latency_ms)
histogram_quantile(0.99, learning_answer_latency_ms)
```

### 学习体验质量

```promql
learning_review_hit_rate * 100
learning_forgetting_prediction_accuracy
learning_flow_session_ratio * 100
```

### 会话质量

```promql
(1 - learning_session_dropout_rate) * 100  # 会话完成率
learning_flow_session_ratio * 100           # 心流会话占比
```

## 告警规则

基于学习体验指标可以配置告警：

```yaml
# prometheus/alerts.yml
groups:
  - name: learning_experience
    rules:
      - alert: LowRetentionRate
        expr: learning_retention_rate_1d < 50
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: '次日留存率过低'
          description: '次日留存率为 {{ $value }}%，低于50%阈值'

      - alert: HighDropoutRate
        expr: learning_session_dropout_rate > 0.3
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: '会话中断率过高'
          description: '会话中断率为 {{ $value | humanizePercentage }}，超过30%阈值'

      - alert: LowReviewHitRate
        expr: learning_review_hit_rate < 0.6
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: '复习命中率过低'
          description: '复习命中率为 {{ $value | humanizePercentage }}，低于60%阈值'

      - alert: HighAnswerLatency
        expr: histogram_quantile(0.99, learning_answer_latency_ms) > 10000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: '答题时延P99过高'
          description: '答题时延P99为 {{ $value }}ms，超过10秒阈值'
```

## 最佳实践

1. **实时记录 vs 定时聚合**
   - 高频事件（如答题）使用实时记录：`recordAnswerLatency()`
   - 低频聚合（如留存率）使用定时更新：`updateAllLearningMetrics()`

2. **性能考虑**
   - Histogram使用bucket而非滑动窗口，内存占用固定
   - 定时更新任务避开高峰时段
   - 复杂计算（如心流判断）在会话结束时异步执行

3. **数据准确性**
   - 留存率计算基于真实会话数据
   - 遗忘预测基于半衰期模型
   - 心流会话使用多维度判断（正确率、时间稳定性）

4. **监控告警**
   - 设置合理的阈值，避免误报
   - 关注趋势而非单点异常
   - 结合业务场景调整告警规则

## 故障排查

### 指标未更新

检查调度器状态：

```typescript
import { getSchedulerStatus } from '../schedulers/learning-metrics-scheduler';

const status = getSchedulerStatus();
console.log(status);
// { enabled: true, running: true, updating: false, intervalMs: 3600000 }
```

手动触发更新：

```typescript
import { updateMetricsOnce } from '../schedulers/learning-metrics-scheduler';

await updateMetricsOnce();
```

### 数据异常

重置所有指标：

```typescript
import { resetAllLearningMetrics } from '../monitoring/learning-metrics';

resetAllLearningMetrics();
```

检查数据库连接：

```typescript
import prisma from '../config/database';

await prisma.$queryRaw`SELECT 1`;
```

## 相关文档

- [AMAS监控指标](./amas-metrics.md)
- [Prometheus配置](./prometheus-setup.md)
- [Grafana面板](./grafana-dashboards.md)
