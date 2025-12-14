# SLO/SLI 监控体系与可靠性工程方案

> **文档版本**: v1.0
> **创建日期**: 2025-12-13
> **适用系统**: 词汇学习应用 AMAS 智能学习引擎
> **架构**: Node.js + Express + PostgreSQL + Redis

---

## 目录

1. [执行摘要](#执行摘要)
2. [SLI 服务级别指标定义](#sli-服务级别指标定义)
3. [SLO 服务级别目标](#slo-服务级别目标)
4. [错误预算计算与管理](#错误预算计算与管理)
5. [告警规则设计](#告警规则设计)
6. [服务依赖分析](#服务依赖分析)
7. [容量规划](#容量规划)
8. [可靠性工程实践](#可靠性工程实践)
9. [监控仪表盘设计](#监控仪表盘设计)
10. [改进建议与路线图](#改进建议与路线图)

---

## 执行摘要

### 当前系统概况

| 项目         | 描述                                       |
| ------------ | ------------------------------------------ |
| **服务类型** | 智能词汇学习平台（在线教育 SaaS）          |
| **核心技术** | Node.js 20 + Express + PostgreSQL + Redis  |
| **用户规模** | 中小型（预计 1k-100k DAU）                 |
| **核心功能** | AMAS 自适应学习算法、实时反馈、遗忘预警    |
| **监控现状** | 已实现 Prometheus 指标、健康检查、告警引擎 |

### 监控成熟度评估

| 维度         | 当前状态                | 目标状态             |
| ------------ | ----------------------- | -------------------- |
| **指标覆盖** | 🟢 完整（HTTP/DB/AMAS） | 🟢 完整              |
| **SLO 定义** | 🔴 缺失                 | 🟢 已定义            |
| **告警策略** | 🟡 基础（4条规则）      | 🟢 完善（12条规则）  |
| **错误预算** | 🔴 未实施               | 🟢 已定义            |
| **可视化**   | 🟡 原始指标             | 🟢 业务仪表盘        |
| **自动化**   | 🟡 部分（Worker）       | 🟢 全面（CI/CD集成） |

---

## SLI 服务级别指标定义

### 1. 可用性指标 (Availability)

#### 1.1 服务可用性

```yaml
指标名称: service_availability
定义: 成功响应请求的时间占总运行时间的比例
计算公式: (总运行时间 - 停机时间) / 总运行时间 × 100%
数据源: Kubernetes liveness probe + 健康检查日志
采集频率: 每30秒
```

**Prometheus 查询**:

```promql
# 可用性 = 1 - (失败时间 / 总时间)
1 - (
  sum(rate(http_request_5xx_total[5m])) /
  sum(rate(http_request_total[5m]))
)
```

#### 1.2 API 可用性

```yaml
指标名称: api_success_rate
定义: 非5xx响应占所有请求的比例
计算公式: (总请求数 - 5xx响应数) / 总请求数 × 100%
数据源: amasMetrics.httpRequest5xxTotal / httpRequestTotal
采集频率: 实时
```

**Prometheus 查询**:

```promql
# 成功率（排除5xx错误）
(
  sum(rate(http_request_total[5m])) -
  sum(rate(http_request_5xx_total[5m]))
) / sum(rate(http_request_total[5m])) * 100
```

### 2. 延迟指标 (Latency)

#### 2.1 HTTP 请求延迟

```yaml
指标族: http_request_duration_seconds
P50: 第50百分位延迟（用户体验基线）
P95: 第95百分位延迟（核心SLO指标）
P99: 第99百分位延迟（极端情况）
数据源: amasMetrics.httpRequestDuration (BucketHistogram)
单位: 秒
```

**Prometheus 查询**:

```promql
# P95延迟
histogram_quantile(0.95,
  rate(http_request_duration_seconds_bucket[5m])
)

# P99延迟
histogram_quantile(0.99,
  rate(http_request_duration_seconds_bucket[5m])
)
```

#### 2.2 数据库查询延迟

```yaml
指标族: amas_db_query_duration_ms
P50/P95/P99: 查询延迟百分位
慢查询阈值: > 200ms
数据源: amasMetrics.dbQueryDuration
单位: 毫秒
```

**Prometheus 查询**:

```promql
# 慢查询率
rate(amas_db_slow_query_total[5m])
```

#### 2.3 AMAS 决策延迟

```yaml
指标族: amas_inference_latency_ms
描述: AMAS学习算法决策推理时间
目标: P95 < 200ms（用户无感知）
数据源: amasMetrics.inferenceLatency
```

### 3. 吞吐量指标 (Throughput)

#### 3.1 请求速率 (RPS)

```yaml
指标名称: http_requests_per_second
定义: 每秒处理的HTTP请求数
计算公式: rate(http_request_total[1m])
预期范围: 10-1000 RPS（根据用户规模）
```

**Prometheus 查询**:

```promql
# 总体RPS
sum(rate(http_request_total[1m]))

# 按路由分组RPS
sum by (route) (rate(http_request_total[1m]))
```

#### 3.2 学习会话吞吐量 (TPS)

```yaml
指标名称: learning_session_per_minute
定义: 每分钟开始的学习会话数
数据源: learning_session_started_total
业务意义: 核心业务活跃度指标
```

**Prometheus 查询**:

```promql
# 会话启动速率
rate(learning_session_started_total[5m]) * 60
```

### 4. 错误率指标 (Error Rate)

#### 4.1 HTTP 4xx 错误率

```yaml
指标名称: http_4xx_error_rate
定义: 客户端错误（认证/参数错误等）占比
计算公式: 4xx响应数 / 总请求数 × 100%
阈值: < 5%（业务正常范围）
```

#### 4.2 HTTP 5xx 错误率

```yaml
指标名称: http_5xx_error_rate
定义: 服务端错误占比
计算公式: 5xx响应数 / 总请求数 × 100%
SLO目标: < 0.1%（可用性保障）
数据源: http_request_5xx_total / http_request_total
```

**Prometheus 查询**:

```promql
# 5xx错误率
sum(rate(http_request_5xx_total[5m])) /
sum(rate(http_request_total[5m])) * 100
```

#### 4.3 数据库连接失败率

```yaml
指标名称: db_connection_failure_rate
定义: 数据库连接失败次数占比
监控方式: Prisma 连接池状态 + 健康检查
```

### 5. 饱和度指标 (Saturation)

#### 5.1 CPU 使用率

```yaml
指标名称: process_cpu_usage_percent
定义: 进程CPU使用百分比
数据源: process.cpuUsage() / os.cpus().length
告警阈值: > 80%（持续5分钟）
```

**Prometheus 查询**:

```promql
# CPU使用率
rate(process_cpu_user_seconds_total[5m]) * 100
```

#### 5.2 内存使用率

```yaml
指标名称: process_memory_usage_percent
定义: 堆内存使用占比
数据源: process.memoryUsage().heapUsed / heapTotal
告警阈值: > 90%（OOM风险）
```

**Prometheus 查询**:

```promql
# 内存使用率
process_heap_bytes / 1.4e9 * 100  # 假设1.4GB堆限制
```

#### 5.3 数据库连接池饱和度

```yaml
指标名称: db_connection_pool_saturation
定义: 活跃连接数 / 最大连接数
数据源: Prisma 连接池监控（需扩展）
告警阈值: > 85%
```

#### 5.4 磁盘使用率

```yaml
指标名称: disk_usage_percent
定义: 数据库和日志磁盘占用
监控方式: 节点监控 + PG数据目录
告警阈值: > 80%
```

### 6. 学习体验指标（业务SLI）

#### 6.1 用户留存率

```yaml
指标族: learning_retention_rate_{1d,7d,30d}
定义: T日后仍活跃的用户占T日前活跃用户的比例
数据源: learningMetricsService.calculateRetentionRate()
目标: 次日留存 > 40%, 7日留存 > 20%, 30日留存 > 10%
```

#### 6.2 复习命中率

```yaml
指标名称: learning_review_hit_rate
定义: 实际复习单词数 / 应复习单词数
数据源: recordReview() 实时更新
目标: > 60%（用户粘性指标）
```

#### 6.3 会话中断率

```yaml
指标名称: learning_session_dropout_rate
定义: 中断会话数 / 总开始会话数
数据源: calculateSessionDropoutRate()
目标: < 30%（用户体验关键指标）
```

#### 6.4 遗忘预测准确率

```yaml
指标名称: learning_forgetting_prediction_accuracy
定义: 预测正确次数 / 预测总次数 × 100%
数据源: calculateForgettingPredictionAccuracy()
目标: > 70%（算法有效性）
```

#### 6.5 心流会话占比

```yaml
指标名称: learning_flow_session_ratio
定义: 心流会话数 / 总会话数
心流条件:
  - 正确率 60%-85%（适度挑战）
  - 答题时间稳定（CV < 0.5）
  - 至少10道题
目标: > 20%（最佳学习体验）
```

---

## SLO 服务级别目标

### SLO 分级策略

| 级别       | 适用场景     | 可用性 | 延迟 P95 | 错误率 |
| ---------- | ------------ | ------ | -------- | ------ |
| **Tier-1** | 核心学习流程 | 99.9%  | < 200ms  | < 0.1% |
| **Tier-2** | 统计分析API  | 99.5%  | < 500ms  | < 0.5% |
| **Tier-3** | 管理后台     | 99.0%  | < 1000ms | < 1.0% |

### 核心 SLO 定义

#### SLO-1: 学习会话可用性

```yaml
SLO编号: SLO-001
名称: 学习会话API可用性
范围: /api/learning/*, /api/amas/*
目标: 99.9% (三个9)
测量窗口: 30天滚动
错误预算: 43.2分钟/月
监控指标:
  - api_success_rate{tier="tier-1"} >= 99.9%
  - http_5xx_error_rate{tier="tier-1"} < 0.1%
```

**错误预算消耗计算**:

```
可用性 = 99.9% = 0.999
允许停机时间/月 = 30天 × 24小时 × 60分钟 × (1 - 0.999) = 43.2分钟
```

#### SLO-2: 学习API响应延迟

```yaml
SLO编号: SLO-002
名称: 学习API P95延迟
范围: /api/learning/*, /api/amas/decide
目标: P95 < 200ms
测量窗口: 7天滚动
错误预算: 5% 请求可超出目标
监控指标:
  - http_request_duration_p95{tier="tier-1"} < 0.2
```

**业务影响**:

- < 200ms: 用户无感知，流畅体验
- 200-500ms: 可接受，轻微延迟
- 500-1000ms: 明显卡顿，影响学习节奏
- \> 1000ms: 严重卡顿，用户流失风险

#### SLO-3: 数据持久性

```yaml
SLO编号: SLO-003
名称: 学习记录数据持久性
范围: AnswerRecord, WordLearningState, LearningSession
目标: 99.999% (五个9)
错误预算: 1次数据丢失 / 100,000次操作
监控指标:
  - db_write_failure_rate < 0.001%
  - db_transaction_rollback_rate < 0.01%
保障措施:
  - PostgreSQL ACID事务
  - WAL日志持久化
  - 每日自动备份 + 7天保留
  - 主从复制（生产环境）
```

#### SLO-4: 遗忘预警及时性

```yaml
SLO编号: SLO-004
名称: 遗忘预警推送延迟
范围: ForgettingAlert 生成与推送
目标: 90% 预警在检测后10分钟内送达
测量窗口: 24小时
监控指标:
  - forgetting_alert_delivery_p90 < 600秒
  - forgetting_alert_worker_success_rate > 99%
```

#### SLO-5: AMAS决策质量

```yaml
SLO编号: SLO-005
名称: AMAS决策置信度
范围: LinUCB + Thompson Sampling
目标: P50 置信度 > 0.5
测量窗口: 7天滚动
监控指标:
  - decision_confidence_p50 > 0.5
  - model_drift_events < 10次/天
```

### 恢复时间目标 (RTO/RPO)

| 故障类型           | RTO（恢复时间） | RPO（数据丢失） | 恢复策略           |
| ------------------ | --------------- | --------------- | ------------------ |
| **应用崩溃**       | < 2分钟         | 0               | Kubernetes自动重启 |
| **数据库主库故障** | < 5分钟         | < 1分钟         | 自动Failover到从库 |
| **区域故障**       | < 30分钟        | < 5分钟         | 跨区域灾备切换     |
| **数据损坏**       | < 4小时         | < 24小时        | 从备份恢复         |

---

## 错误预算计算与管理

### 错误预算公式

```
错误预算 = (1 - SLO目标) × 测量窗口

例如：
SLO = 99.9%, 窗口 = 30天
错误预算 = (1 - 0.999) × 30天 × 24小时 × 60分钟 = 43.2分钟/月
```

### 月度错误预算表

| SLO目标             | 可用性  | 月度停机预算 | 周度停机预算 | 日停机预算 |
| ------------------- | ------- | ------------ | ------------ | ---------- |
| **99.9%** (三个9)   | 0.999   | 43.2分钟     | 10.1分钟     | 1.44分钟   |
| **99.95%**          | 0.9995  | 21.6分钟     | 5.04分钟     | 43.2秒     |
| **99.99%** (四个9)  | 0.9999  | 4.32分钟     | 1.01分钟     | 8.64秒     |
| **99.999%** (五个9) | 0.99999 | 26秒         | 6.05秒       | 0.86秒     |

### 错误预算消耗速率

#### 实时消耗率计算

```promql
# 当前消耗速率（基于最近1小时）
(1 - (
  sum(rate(http_request_total[1h])) -
  sum(rate(http_request_5xx_total[1h]))
) / sum(rate(http_request_total[1h]))
) / 0.001 * 100  # 以SLO=99.9%为基准，输出百分比
```

#### 预算耗尽预测

```python
# 伪代码
当前消耗率 = (最近1小时错误数 / 最近1小时总请求数)
月预测消耗 = 当前消耗率 × 30天 × 24小时
剩余预算 = 月度总预算 - 本月已消耗

if 月预测消耗 > 剩余预算:
    触发P1告警("错误预算预计在X天内耗尽")
```

### 预算耗尽响应策略

#### Level 1: 预算剩余 < 50%

**响应措施**:

- ⚠️ 发送Slack通知给SRE团队
- 🛑 冻结非关键功能发布
- 🔍 启动根因分析（RCA）
- 📊 增加监控采样率

#### Level 2: 预算剩余 < 25%

**响应措施**:

- 🚨 升级为P1事件，呼叫On-Call工程师
- ⛔ 全面冻结代码发布（仅允许回滚和Hotfix）
- 🔥 启动战争室（War Room）
- 📈 切换到高频监控（10秒采样）
- 🛡️ 启用降级策略（Circuit Breaker）

#### Level 3: 预算耗尽

**响应措施**:

- 🔴 升级为P0事件
- 📞 通知高管和产品团队
- 🚦 启用限流和熔断
- 🔧 强制回滚最近变更
- 📋 启动事后总结（Postmortem）

### 错误预算策略（Error Budget Policy）

```yaml
错误预算政策版本: v1.0
最后更新: 2025-12-13

预算刷新周期: 30天滚动窗口

发布门控规则:
  - 预算剩余 > 80%: ✅ 正常发布节奏
  - 预算剩余 50%-80%: ⚠️ 增加代码审查要求
  - 预算剩余 25%-50%: 🛑 冻结非关键功能
  - 预算剩余 < 25%: ⛔ 冻结所有发布
  - 预算耗尽: 🚨 仅允许回滚和紧急修复

责任划分:
  - SRE团队: 负责监控预算消耗，触发门控
  - 开发团队: 负责提升系统稳定性，减少错误
  - 产品团队: 平衡功能速度与稳定性

例外情况:
  - 安全漏洞修复: 无论预算状态，立即发布
  - 数据丢失风险: 紧急发布，跳过门控
  - 合规性要求: 优先级高于预算
```

---

## 告警规则设计

### 告警分级体系

| 级别   | 名称     | 响应时间        | 通知方式            | 值班要求     |
| ------ | -------- | --------------- | ------------------- | ------------ |
| **P0** | Critical | 立即（5分钟内） | 电话 + 短信 + Slack | 必须立即响应 |
| **P1** | High     | 15分钟内        | Slack + Email       | 工作时间响应 |
| **P2** | Medium   | 1小时内         | Slack               | 当天响应     |
| **P3** | Low      | 24小时内        | Email               | 下周处理     |

### 当前告警规则清单

#### P0 告警（4条）

##### 1. P0-HTTP-001: HTTP P95延迟超限

```yaml
规则ID: http_latency_p95_p0
严重性: P0
描述: HTTP P95 延迟超过 1秒（可用性风险）
条件: http_request_duration_p95 > 1.0秒
连续周期: 2次（反抖动）
冷却时间: 5分钟
标签: { component: edge, signal: latency, priority: P0 }
影响范围: 所有用户学习体验
应急措施: 1. 检查数据库慢查询（/health/metrics）
  2. 检查CPU/内存饱和度
  3. 启用限流保护（rate-limiter调整）
  4. 考虑水平扩容
```

**Prometheus告警规则**:

```yaml
groups:
  - name: http_latency_alerts
    interval: 30s
    rules:
      - alert: HttpP95LatencyHigh
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1.0
        for: 1m # 连续1分钟超限
        labels:
          severity: P0
          component: edge
        annotations:
          summary: 'HTTP P95延迟超过1秒'
          description: '当前P95延迟: {{ $value }}秒'
          runbook: 'https://docs.example.com/runbook/http-latency-high'
```

##### 2. P0-DB-001: 数据库慢查询激增

```yaml
规则ID: db_slow_queries_rate_p0
严重性: P0
描述: 慢查询速率超过 10次/分钟（后端过载）
条件: db_slow_queries_per_min > 10
连续周期: 1次
冷却时间: 5分钟
影响: 数据库连接池耗尽风险
应急措施: 1. 检查 Prisma 连接池状态
  2. 分析慢查询日志（pg_stat_statements）
  3. 添加缺失索引
  4. 考虑增加数据库资源
```

##### 3. P0-APP-001: 服务不可用

```yaml
规则ID: service_down_p0
严重性: P0
描述: 健康检查失败，服务不可达
条件: up{job="danci-backend"} == 0
连续周期: 2次（避免网络抖动）
冷却时间: 1分钟
影响: 全站不可用
应急措施: 1. 检查 Kubernetes Pod 状态
  2. 查看应用日志（崩溃原因）
  3. 检查数据库连接
  4. 必要时手动重启
```

##### 4. P0-DATA-001: 数据库主库故障

```yaml
规则ID: database_primary_down_p0
严重性: P0
描述: PostgreSQL主库不可达
条件: pg_up{role="primary"} == 0
连续周期: 1次
冷却时间: 3分钟
影响: 写入操作不可用，数据丢失风险
应急措施: 1. 确认主库状态（pg_ctl status）
  2. 检查从库是否健康
  3. 执行Failover到从库
  4. 通知数据库管理员
```

#### P1 告警（8条）

##### 5. P1-HTTP-001: HTTP 5xx错误率超限

```yaml
规则ID: http_5xx_rate_p1
严重性: P1
描述: HTTP 5xx 错误率超过 1%
条件: http_5xx_error_rate > 0.01
连续周期: 2次
冷却时间: 3分钟
错误预算影响: 高（消耗预算）
应急措施: 1. 检查应用错误日志
  2. 检查下游依赖健康
  3. 查看Sentry错误聚合
  4. 考虑回滚最近部署
```

**Prometheus告警规则**:

```yaml
- alert: Http5xxRateHigh
  expr: |
    sum(rate(http_request_5xx_total[5m])) /
    sum(rate(http_request_total[5m])) > 0.01
  for: 2m
  labels:
    severity: P1
    component: edge
  annotations:
    summary: '5xx错误率超过1%'
    description: '当前5xx错误率: {{ $value | humanizePercentage }}'
```

##### 6. P1-HTTP-002: HTTP 5xx错误率快速上升

```yaml
规则ID: http_5xx_rate_trend_p1
严重性: P1
描述: HTTP 5xx错误率快速上升（趋势检测）
条件:
  - 趋势方向: 递增
  - 窗口大小: 3次采样
  - 最小斜率: +0.002/分钟（+0.2%/分钟）
  - 基线阈值: 错误率 > 0.25%
连续周期: 1次
冷却时间: 5分钟
业务意义: 新部署可能引入Bug
应急措施: 1. 立即检查最近5分钟的部署
  2. 对比错误趋势与发布时间线
  3. 准备回滚流程
```

##### 7. P1-AMAS-001: 决策置信度低

```yaml
规则ID: decision_confidence_low_p1
严重性: P1
描述: AMAS决策置信度P50 < 0.5（学习质量下降）
条件: decision_confidence_p50 < 0.5
连续周期: 2次
冷却时间: 3分钟
业务影响: 用户体验下降，学习效果打折
应急措施: 1. 检查模型参数是否漂移
  2. 验证特征向量计算正确性
  3. 检查冷启动逻辑是否异常
  4. 考虑切换到后备策略（Heuristic）
```

##### 8. P1-AMAS-002: Native模块调用失败率高

```yaml
规则ID: native_failure_rate_p1
严重性: P1
描述: Native模块（LinUCB）调用失败率 > 5%
条件: |
  sum(rate(amas_native_calls_total{status="fallback"}[5m])) /
  sum(rate(amas_native_calls_total[5m])) > 0.05
连续周期: 2次
冷却时间: 5分钟
影响: 降级到JS实现，性能下降
应急措施: 1. 检查Native模块版本兼容性
  2. 查看熔断器状态
  3. 验证Native绑定完整性
```

##### 9. P1-MEMORY-001: 内存使用率高

```yaml
规则ID: memory_usage_high_p1
严重性: P1
描述: 堆内存使用率 > 85%（OOM风险）
条件: process_heap_bytes / (1.4 * 1e9) > 0.85
连续周期: 3次（5分钟）
冷却时间: 10分钟
影响: 可能导致GC暂停增加，性能下降
应急措施: 1. 触发手动GC（process.memoryUsage()）
  2. 检查内存泄漏（heapdump）
  3. 重启受影响实例
  4. 调整 --max-old-space-size
```

##### 10. P1-CPU-001: CPU使用率持续高位

```yaml
规则ID: cpu_usage_high_p1
严重性: P1
描述: CPU使用率 > 80% 持续5分钟
条件: rate(process_cpu_user_seconds_total[5m]) > 0.8
连续周期: 5次
冷却时间: 10分钟
影响: 响应变慢，队列积压
应急措施: 1. 检查是否有CPU密集任务
  2. 分析火焰图（perf profiling）
  3. 启用限流保护
  4. 水平扩容
```

##### 11. P1-DB-002: 数据库连接池饱和

```yaml
规则ID: db_connection_pool_saturation_p1
严重性: P1
描述: 数据库连接池使用率 > 90%
条件: db_active_connections / db_max_connections > 0.9
连续周期: 2次
冷却时间: 5分钟
影响: 新请求等待连接，延迟飙升
应急措施: 1. 检查是否有长事务未提交
  2. 分析慢查询
  3. 增加连接池大小（临时）
  4. 检查连接泄漏
```

##### 12. P1-WORKER-001: Worker任务失败率高

```yaml
规则ID: worker_failure_rate_p1
严重性: P1
描述: 后台Worker任务失败率 > 10%
条件: |
  (worker_task_failed_total / worker_task_total) > 0.1
连续周期: 2次
冷却时间: 10分钟
影响: 遗忘预警、延迟奖励等异步任务不可用
应急措施: 1. 检查Worker日志
  2. 验证数据库连接
  3. 检查Redis可用性（如使用）
  4. 手动重试失败任务
```

#### P2/P3 告警（建议扩展）

##### P2-BUSINESS-001: 用户留存率下降

```yaml
规则ID: retention_rate_drop_p2
严重性: P2
描述: 次日留存率 < 35%（业务健康度）
条件: learning_retention_rate_1d < 0.35
连续周期: 3次（3天）
冷却时间: 24小时
响应: 产品团队分析用户反馈
```

##### P2-BUSINESS-002: 会话中断率高

```yaml
规则ID: session_dropout_rate_high_p2
严重性: P2
描述: 会话中断率 > 40%
条件: learning_session_dropout_rate > 0.4
连续周期: 5次（5小时）
冷却时间: 6小时
影响: 用户体验问题，需优化流程
```

##### P3-MAINTENANCE-001: 磁盘使用率高

```yaml
规则ID: disk_usage_high_p3
严重性: P3
描述: 磁盘使用率 > 75%
条件: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.25
连续周期: 1次
冷却时间: 24小时
响应: 清理日志，扩容磁盘
```

### 告警路由与升级策略

#### 告警路由矩阵

```yaml
告警路由规则:
  P0:
    - 目标: on-call-sre, on-call-backend
    - 通道: PagerDuty电话 + SMS + Slack
    - 升级: 5分钟无响应 → 升级到Team Lead
    - 工作时间: 24/7

  P1:
    - 目标: sre-team, backend-team
    - 通道: Slack + Email
    - 升级: 30分钟无响应 → 升级到Engineering Manager
    - 工作时间: 09:00-18:00（工作日）

  P2:
    - 目标: backend-team
    - 通道: Slack
    - 升级: 无自动升级
    - 工作时间: 09:00-18:00（工作日）

  P3:
    - 目标: platform-team
    - 通道: Email
    - 升级: 无
    - 工作时间: 工作时间处理
```

#### Webhook通知配置

```typescript
// 环境变量配置
ALERT_WEBHOOK_URL=https://hooks.example.com/alerts
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx

// Slack消息格式
{
  "text": ":rotating_light: [P0] http_latency_p95_p0",
  "attachments": [{
    "color": "danger",
    "fields": [
      {"title": "状态", "value": "FIRING", "short": true},
      {"title": "指标", "value": "http.request.duration.p95", "short": true},
      {"title": "当前值", "value": "1.25秒", "short": true},
      {"title": "阈值", "value": "> 1.0秒", "short": true},
      {"title": "描述", "value": "HTTP P95延迟超过1秒（可用性风险）"}
    ],
    "actions": [
      {"type": "button", "text": "查看监控", "url": "https://grafana.example.com/dashboard/..."},
      {"type": "button", "text": "Runbook", "url": "https://docs.example.com/runbook/..."}
    ]
  }]
}
```

### 值班轮换

#### 值班表

```yaml
值班周期: 1周/人
值班团队: SRE + Backend
值班人数: 2人（主+备）

轮换时间:
  - 切换日期: 每周一 09:00
  - 交接会议: 15分钟
  - 交接内容: 上周事件回顾 + 当前系统状态

值班职责:
  - 响应P0/P1告警
  - 处理升级事件
  - 每日健康检查（09:00）
  - 每周总结报告

补偿政策:
  - 工作时间值班: 无额外补偿
  - 非工作时间响应: 每次+0.5天调休
  - 周末/节假日值班: 2倍调休
```

---

## 服务依赖分析

### 依赖关系拓扑

```
                          ┌──────────────┐
                          │   用户设备    │
                          │ (Browser/App) │
                          └───────┬──────┘
                                  │
                          ┌───────▼──────┐
                          │   CDN/LB     │
                          │ (Cloudflare) │
                          └───────┬──────┘
                                  │
                 ┌────────────────┼────────────────┐
                 │                │                │
         ┌───────▼────────┐ ┌────▼─────────┐ ┌───▼──────────┐
         │   Frontend      │ │   Backend    │ │   Admin      │
         │  (React SPA)    │ │  (Node.js)   │ │  (Dashboard) │
         └─────────────────┘ └────┬─────────┘ └──────────────┘
                                   │
                 ┌─────────────────┼─────────────────┐
                 │                 │                 │
         ┌───────▼────────┐ ┌──────▼──────┐ ┌───────▼────────┐
         │  PostgreSQL    │ │   Redis     │ │  Native Module │
         │   (Primary)    │ │   (Cache)   │ │   (LinUCB)     │
         └────┬───────────┘ └─────────────┘ └────────────────┘
              │
         ┌────▼───────────┐
         │  PostgreSQL    │
         │   (Replica)    │
         └────────────────┘
```

### 上游依赖 SLA

| 依赖服务     | 提供商               | SLA    | 故障影响         | 降级策略                    |
| ------------ | -------------------- | ------ | ---------------- | --------------------------- |
| **CDN**      | Cloudflare           | 99.99% | 静态资源不可用   | 回源到Origin                |
| **DNS**      | Cloudflare           | 100%   | 全站不可达       | 多DNS提供商                 |
| **负载均衡** | Kubernetes Ingress   | 99.95% | 流量分发失败     | 直连Pod IP                  |
| **对象存储** | AWS S3 / 阿里云OSS   | 99.99% | 音频文件不可访问 | 本地缓存 + 降级到无音频模式 |
| **监控服务** | Prometheus + Grafana | 99.9%  | 监控盲区         | 本地日志 + 健康检查         |

### 下游影响范围

| 服务模块           | 依赖深度       | 故障影响范围     | 用户影响     |
| ------------------ | -------------- | ---------------- | ------------ |
| **学习会话API**    | 核心（Tier-1） | 100%用户无法学习 | 全站不可用   |
| **AMAS决策引擎**   | 核心（Tier-1） | 降级到固定策略   | 学习效果下降 |
| **遗忘预警Worker** | 辅助（Tier-2） | 预警延迟/丢失    | 用户粘性下降 |
| **统计分析API**    | 辅助（Tier-2） | 数据展示不可用   | 不影响学习   |
| **管理后台**       | 辅助（Tier-3） | 运营功能受限     | 不影响用户   |

### 关键路径识别

#### 1. 学习流程关键路径

```
用户请求 → API网关 → 认证中间件 → AMAS决策引擎 → 数据库查询 → 返回结果
                              ↓
                        Native模块调用
                        (LinUCB推理)
```

**性能预算分配**:

- API网关: 10ms
- 认证: 5ms
- AMAS决策: 100ms
  - 数据库查询: 30ms
  - Native推理: 50ms
  - 业务逻辑: 20ms
- 响应序列化: 5ms
- **总计: 120ms（P50目标）**

#### 2. 数据写入关键路径

```
答题提交 → 参数验证 → 事务开始 → 更新记录 + 更新状态 + 延迟奖励入队 → 事务提交 → 返回确认
```

**可靠性要求**:

- ACID事务保证: ✅ PostgreSQL
- 幂等性: ✅ 唯一约束（userId+wordId+timestamp）
- 异步处理: ✅ RewardQueue解耦

### 降级策略

#### Level 1: 功能降级

```yaml
触发条件: 5xx错误率 > 5% OR P95延迟 > 1秒
降级措施:
  - 禁用实时推荐（固定队列）
  - 禁用复杂统计查询
  - 禁用音频播放
  - 简化UI动画
预期效果: 延迟降低30%, 吞吐量提升50%
```

#### Level 2: 算法降级

```yaml
触发条件: AMAS Native模块失败率 > 10%
降级措施:
  - 切换到JS版LinUCB（性能下降）
  - 或切换到Heuristic策略（简单规则）
预期效果: 决策质量下降，但保证可用性
```

#### Level 3: 熔断保护

```yaml
触发条件: 数据库延迟 > 2秒
降级措施:
  - 开启Redis读缓存
  - 返回缓存数据（可能过期）
  - 限制写入操作（只读模式）
预期效果: 防止雪崩，保护数据库
```

#### Level 4: 限流保护

```yaml
触发条件: RPS > 容量上限 OR CPU > 90%
降级措施:
  - 按用户ID限流（令牌桶）
  - 返回429 Too Many Requests
  - 队列排队（等待）
预期效果: 保护系统，牺牲部分用户体验
```

---

## 容量规划

### 当前资源配置

#### 应用服务器

```yaml
实例类型: 通用型（如AWS t3.medium）
规格:
  vCPU: 2核
  内存: 4GB
  磁盘: 30GB SSD
  网络: 最高5Gbps
实例数: 2-4（弹性伸缩）
Node.js配置:
  --max-old-space-size: 3072 # 3GB堆内存
  --max-semi-space-size: 512 # 512MB新生代
```

#### 数据库服务器

```yaml
实例类型: 内存优化型（如AWS r6g.large）
规格:
  vCPU: 2核
  内存: 16GB
  磁盘: 100GB SSD（IOPS 3000）
PostgreSQL版本: 14+
连接池配置:
  max_connections: 100
  shared_buffers: 4GB
  effective_cache_size: 12GB
  work_mem: 16MB
```

#### Redis缓存（可选）

```yaml
实例类型: 缓存优化型（如AWS r6g.medium）
规格:
  内存: 6GB
  持久化: AOF + RDB
使用场景:
  - 会话缓存
  - 热点数据缓存
  - 分布式锁
```

### 负载预测模型

#### 用户规模假设

```yaml
阶段1（启动期）:
  DAU: 100-1,000
  并发用户: 20-50
  峰值QPS: 10-20

阶段2（成长期）:
  DAU: 1,000-10,000
  并发用户: 100-500
  峰值QPS: 50-200

阶段3（成熟期）:
  DAU: 10,000-100,000
  并发用户: 1,000-5,000
  峰值QPS: 500-2,000
```

#### 流量模式

```yaml
日内分布:
  - 峰值时段: 19:00-22:00（晚间学习）
  - 峰谷比: 5:1
  - 周末流量: 工作日的1.5倍

会话特征:
  - 平均会话时长: 15分钟
  - 每会话请求数: 20-50次（答题+查询）
  - 平均答题间隔: 10-30秒
```

### 资源水位线

#### CPU水位线

```yaml
安全水位: < 60%
告警水位: > 80%（持续5分钟）
危险水位: > 95%（触发紧急扩容）

扩容策略:
  - 目标利用率: 70%
  - 扩容阈值: CPU > 80% 持续3分钟
  - 缩容阈值: CPU < 40% 持续10分钟
  - 最小实例数: 2
  - 最大实例数: 10
```

#### 内存水位线

```yaml
安全水位: < 70%
告警水位: > 85%
危险水位: > 95%（OOM风险）

应对措施:
  - > 85%: 增加GC频率
  - > 90%: 触发内存泄漏检测
  - > 95%: 滚动重启
```

#### 数据库连接池水位线

```yaml
安全水位: < 60 连接（60%）
告警水位: > 80 连接（80%）
危险水位: > 95 连接（95%）

优化措施:
  - 开启慢查询日志（> 200ms）
  - 添加缺失索引
  - 开启查询缓存
  - 考虑读写分离
```

#### 磁盘水位线

```yaml
安全水位: < 60%
告警水位: > 75%
危险水位: > 90%

清理策略:
  - 日志轮转: 保留7天
  - 旧数据归档: 90天以上
  - 定期VACUUM（PostgreSQL）
```

### 扩容策略

#### 水平扩容（Scale Out）

```yaml
触发条件:
  - CPU平均利用率 > 75% 持续5分钟
  - OR 内存利用率 > 80%
  - OR RPS > 单实例处理能力的80%

扩容流程: 1. HPA（Horizontal Pod Autoscaler）自动触发
  2. 新Pod启动（30-60秒）
  3. 健康检查通过后加入负载均衡
  4. 流量逐步迁移（5分钟预热）

扩容限制:
  - 单次扩容: 不超过当前实例数的50%
  - 冷却时间: 5分钟（防止震荡）
  - 最大实例数: 10（成本控制）
```

#### 垂直扩容（Scale Up）

```yaml
触发条件:
  - 水平扩容已达上限
  - 单实例瓶颈（如内存不足）

升级路径:
  当前: 2核4GB → 升级: 4核8GB → 再升级: 8核16GB

注意事项:
  - 需要滚动重启
  - RTO: 5-10分钟
  - 提前规划（非紧急）
```

#### 数据库扩容

```yaml
读扩展:
  - 添加只读副本（Read Replica）
  - 应用层读写分离
  - 缓存层（Redis）

写扩展:
  - 分库分表（Sharding）
  - 按用户ID哈希分片
  - 跨片查询优化
```

### 成本优化

#### 资源利用率目标

```yaml
目标利用率:
  - CPU: 60%-80%（避免过度预留）
  - 内存: 70%-85%
  - 磁盘: < 75%

预留策略:
  - 生产环境: 预留20%容量应对突发
  - 测试环境: 无预留，按需分配
  - 开发环境: 最小化配置
```

#### 成本优化措施

```yaml
1. 按需实例:
  - 非工作时间缩容（夜间2:00-7:00）
  - 开发/测试环境自动休眠

2. Spot实例:
  - 非关键Worker使用Spot实例
  - 节省70%成本

3. 存储分层:
  - 热数据: SSD（高性能）
  - 温数据: HDD（归档）
  - 冷数据: 对象存储（S3）

4. CDN缓存:
  - 静态资源CDN缓存
  - 减少源站流量
  - 节省带宽成本

5. 数据库优化:
  - 定期清理过期数据
  - 归档历史数据
  - 压缩存储
```

#### 成本预估（月度）

```yaml
阶段1（1000 DAU）:
  - 计算: 2实例 × $50 = $100
  - 数据库: 1实例 × $150 = $150
  - 存储: 100GB × $0.1 = $10
  - 流量: 1TB × $0.09 = $90
  - 总计: ~$350/月

阶段2（10000 DAU）:
  - 计算: 4实例 × $50 = $200
  - 数据库: 1主+1从 × $150 = $300
  - Redis: 1实例 × $80 = $80
  - 存储: 500GB × $0.1 = $50
  - 流量: 5TB × $0.09 = $450
  - 总计: ~$1,080/月

阶段3（100000 DAU）:
  - 计算: 10实例 × $100 = $1,000
  - 数据库: 1主+2从 × $300 = $900
  - Redis: 2实例 × $150 = $300
  - 存储: 2TB × $0.1 = $200
  - 流量: 20TB × $0.09 = $1,800
  - CDN: $500
  - 总计: ~$4,700/月
```

---

## 可靠性工程实践

### FMEA 故障模式与影响分析

#### 高风险故障模式

##### FM-1: 数据库主库故障

```yaml
故障模式: PostgreSQL主库崩溃/不可达
发生概率: 中（0.1%/月）
检测方式: 健康检查失败
影响范围:
  - 严重性: P0
  - 影响用户: 100%
  - RTO: 5分钟
  - RPO: 1分钟（WAL复制延迟）

根因分析:
  - 硬件故障（磁盘、内存）
  - 软件Bug（PostgreSQL崩溃）
  - 资源耗尽（连接数、磁盘满）
  - 人为误操作（DROP TABLE）

预防措施: ✅ 主从复制（Streaming Replication）
  ✅ 自动Failover（pg_auto_failover）
  ✅ 定期备份（每日全量+连续WAL）
  ✅ 资源监控告警
  ✅ 操作审计日志

应急预案: 1. 自动检测（30秒内）
  2. 自动Failover到从库（2分钟）
  3. 更新DNS/连接池配置
  4. 通知DBA分析根因
  5. 修复原主库，重新加入集群
```

##### FM-2: 应用OOM崩溃

```yaml
故障模式: Node.js进程内存耗尽崩溃
发生概率: 高（2次/月）
检测方式: 进程退出，健康检查失败
影响范围:
  - 严重性: P1
  - 影响用户: 50%（单实例崩溃）
  - RTO: 2分钟（自动重启）
  - RPO: 0（无状态服务）

根因分析:
  - 内存泄漏（闭包、事件监听器）
  - 大对象缓存（未限制大小）
  - 第三方库Bug
  - 流量突增（对象积压）

预防措施: ✅ 定期heapdump分析
  ✅ 限制缓存大小（LRU）
  ✅ 内存告警（> 85%）
  ✅ 负载测试
  ⚠️ 增加单元测试覆盖率

应急预案: 1. Kubernetes自动重启Pod
  2. 健康检查通过后恢复流量
  3. 分析heapdump找泄漏点
  4. 发布Hotfix
```

##### FM-3: AMAS算法决策错误

```yaml
故障模式: LinUCB推荐错误单词（过难/过易）
发生概率: 中（持续发生）
检测方式: 决策置信度监控、用户反馈
影响范围:
  - 严重性: P2
  - 影响用户: 部分用户
  - 业务影响: 学习效果下降，用户流失

根因分析:
  - 冷启动数据不足
  - 模型漂移（用户行为变化）
  - 特征向量计算错误
  - 超参数不合理

预防措施: ✅ A/B测试验证策略
  ✅ 决策置信度监控
  ✅ 用户反馈收集
  ✅ 定期模型重训练
  ⚠️ 因果推断评估

应急预案: 1. 监控置信度下降告警
  2. 人工审查决策样本
  3. 切换到后备策略（Heuristic）
  4. 分析模型参数
  5. 调整超参数或重新训练
```

##### FM-4: 慢查询导致服务降级

```yaml
故障模式: 数据库慢查询导致请求积压
发生概率: 中（1次/周）
检测方式: P95延迟飙升，慢查询告警
影响范围:
  - 严重性: P1
  - 影响用户: 全部用户体验下降
  - 业务影响: 响应变慢，可能触发超时

根因分析:
  - 缺失索引
  - 全表扫描
  - 锁竞争
  - 数据量增长

预防措施: ✅ 慢查询日志分析（> 200ms）
  ✅ EXPLAIN ANALYZE优化
  ✅ 定期索引维护
  ✅ 查询超时设置
  ⚠️ 读写分离

应急预案: 1. 识别慢查询SQL
  2. 添加临时索引
  3. 限流保护
  4. 长期优化方案
```

### 混沌工程实践

#### 混沌实验清单

##### 实验1: 数据库故障注入

```yaml
实验名称: postgres-primary-failure
目标: 验证数据库Failover机制
方法:
  - 工具: chaos-mesh / kubectl delete pod
  - 操作: 终止主库Pod
  - 观察: Failover时间、数据一致性、应用重连
期望结果:
  - RTO < 5分钟
  - RPO < 1分钟
  - 无数据丢失
实施频率: 每季度1次
```

##### 实验2: 网络延迟注入

```yaml
实验名称: network-latency-injection
目标: 验证超时和重试机制
方法:
  - 工具: chaos-mesh / tc (traffic control)
  - 操作: 注入200ms网络延迟
  - 观察: 请求超时、降级策略触发
期望结果:
  - 超时正确触发
  - 降级策略生效
  - 用户体验可接受
实施频率: 每月1次
```

##### 实验3: CPU资源限制

```yaml
实验名称: cpu-throttling
目标: 验证资源饱和下的系统行为
方法:
  - 工具: stress-ng / Kubernetes资源限制
  - 操作: 将CPU限制到50%
  - 观察: 限流触发、队列积压、自动扩容
期望结果:
  - 限流保护生效
  - HPA自动扩容
  - 无级联故障
实施频率: 每月1次
```

##### 实验4: 内存泄漏模拟

```yaml
实验名称: memory-leak-simulation
目标: 验证OOM检测和恢复
方法:
  - 工具: 注入内存泄漏代码
  - 操作: 逐步消耗内存至90%
  - 观察: 告警触发、自动重启、流量迁移
期望结果:
  - 85%内存告警触发
  - Kubernetes自动重启
  - 流量平滑迁移
实施频率: 每季度1次
```

### 灰度发布策略

#### 发布阶段

##### 阶段1: 金丝雀发布（Canary）

```yaml
流量比例: 5%
持续时间: 30分钟
监控指标:
  - 5xx错误率 < 基线 + 0.5%
  - P95延迟 < 基线 + 100ms
  - AMAS决策置信度 > 0.5
回滚条件:
  - 任一指标超限
  - 出现P0告警
  - 用户投诉激增
```

##### 阶段2: 小批量发布

```yaml
流量比例: 25%
持续时间: 1小时
监控指标: 同上
A/B测试:
  - 对照组: 旧版本（75%）
  - 实验组: 新版本（25%）
  - 评估指标: 留存率、会话时长、中断率
```

##### 阶段3: 全量发布

```yaml
流量比例: 100%
监控周期: 24小时
观察期:
  - 前4小时: 重点监控
  - 后20小时: 常规监控
最终确认:
  - 无P0/P1告警
  - 业务指标无异常
  - 用户反馈正常
```

#### 发布门控规则

```yaml
发布前检查: ✅ 单元测试通过率 = 100%
  ✅ 集成测试通过率 > 95%
  ✅ 代码覆盖率 > 80%
  ✅ 安全扫描无高危漏洞
  ✅ 错误预算剩余 > 50%
  ✅ 至少1名SRE审批

自动回滚条件:
  - 5xx错误率 > 基线 + 1%（持续5分钟）
  - P95延迟 > 基线 + 200ms（持续5分钟）
  - 决策置信度 < 0.4（持续10分钟）

手动回滚流程: 1. 执行回滚命令（kubectl rollout undo）
  2. 验证旧版本健康
  3. 通知团队
  4. 启动RCA（Root Cause Analysis）
```

### 限流和熔断

#### API限流策略

##### 全局限流

```yaml
算法: 令牌桶（Token Bucket）
限制:
  - 总QPS: 1000 req/s
  - 突发容量: 1500 req/s
  - 窗口: 1秒
响应:
  - 状态码: 429 Too Many Requests
  - 响应头: Retry-After: 1
  - 响应体: {"error": "Rate limit exceeded"}
```

##### 用户限流

```yaml
算法: 滑动窗口计数
限制:
  - 每用户: 100 req/min
  - 答题API: 60 req/min
  - 查询API: 200 req/min
存储: Redis (incr + expire)
```

##### IP限流

```yaml
限制:
  - 匿名访问: 20 req/min
  - 注册用户: 无IP限制
目的: 防止DDoS、爬虫
```

#### 熔断器模式

##### Native模块熔断

```yaml
熔断器: amas_native_circuit_breaker
监控指标: amas_native_circuit_breaker_state

状态机:
  Closed（关闭）:
    - 正常调用Native模块
    - 统计失败率
    - 失败率 > 10% → 进入Open

  Open（开启）:
    - 所有调用降级到JS实现
    - 定时器（60秒）→ 进入Half-Open

  Half-Open（半开）:
    - 放行少量请求（10%）测试
    - 成功率 > 90% → 返回Closed
    - 失败率 > 10% → 返回Open

配置:
  失败阈值: 10%
  统计窗口: 1分钟
  恢复时间: 60秒
  测试比例: 10%
```

**Prometheus查询**:

```promql
# 熔断器状态（0=Closed, 1=Open, 2=Half-Open）
amas_native_circuit_breaker_state

# Native失败率
sum(rate(amas_native_calls_total{status="fallback"}[5m])) /
sum(rate(amas_native_calls_total[5m]))
```

##### 数据库熔断

```yaml
熔断器: db_circuit_breaker
触发条件:
  - 连接池耗尽（> 95%）
  - 慢查询激增（> 20/min）
  - 超时率 > 5%

降级策略:
  - 只读模式（禁止写入）
  - 返回缓存数据
  - 拒绝非关键查询

恢复条件:
  - 连接池恢复（< 70%）
  - 慢查询正常（< 5/min）
  - 持续1分钟无异常
```

---

## 监控仪表盘设计

### Grafana仪表盘结构

#### 1. 总览仪表盘（Overview Dashboard）

```yaml
名称: "Danci-Backend-Overview"
刷新间隔: 30秒
时间范围: 最近1小时

面板布局:
  Row 1: 核心SLI（红色=超限）
    - 可用性（大字体）: 99.95%
    - P95延迟（图表）: 180ms
    - 5xx错误率（图表）: 0.08%
    - 活跃用户数: 2,350

  Row 2: 系统资源
    - CPU使用率（仪表盘）: 65%
    - 内存使用率（仪表盘）: 72%
    - 数据库连接（条形图）: 45/100
    - 磁盘使用率（饼图）: 58%

  Row 3: 业务指标
    - 学习会话数（时间序列）
    - 答题成功率（百分比）
    - AMAS决策置信度（箱线图）
    - 遗忘预警推送数（柱状图）

  Row 4: 告警状态
    - 活跃告警列表（表格）
    - 告警趋势（时间序列）
    - 错误预算剩余（进度条）
```

**Grafana JSON示例（部分）**:

```json
{
  "dashboard": {
    "title": "Danci-Backend-Overview",
    "panels": [
      {
        "id": 1,
        "type": "stat",
        "title": "可用性",
        "targets": [
          {
            "expr": "1 - (sum(rate(http_request_5xx_total[1h])) / sum(rate(http_request_total[1h])))"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percentunit",
            "thresholds": {
              "steps": [
                { "value": 0, "color": "red" },
                { "value": 0.999, "color": "green" }
              ]
            }
          }
        }
      },
      {
        "id": 2,
        "type": "timeseries",
        "title": "P95延迟",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) * 1000"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "ms",
            "thresholds": {
              "steps": [
                { "value": 0, "color": "green" },
                { "value": 200, "color": "yellow" },
                { "value": 500, "color": "red" }
              ]
            }
          }
        }
      }
    ]
  }
}
```

#### 2. AMAS算法仪表盘

```yaml
名称: 'AMAS-Learning-Engine'
专注: 学习算法性能和质量

面板:
  - 决策延迟分布（P50/P95/P99）
  - 决策置信度箱线图
  - Native模块调用成功率
  - 熔断器状态时间线
  - 动作分布（难度/批次/提示）
  - 模型漂移事件计数
  - 冷启动用户比例
  - 策略切换频率
```

#### 3. 用户体验仪表盘

```yaml
名称: 'User-Experience-Metrics'
专注: 业务SLI和用户行为

面板:
  - 用户留存率趋势（1d/7d/30d）
  - 复习命中率（目标线）
  - 会话中断率（漏斗图）
  - 心流会话占比
  - 平均会话时长
  - 遗忘预测准确率
  - 用户反馈情绪分析（如有）
```

#### 4. 基础设施仪表盘

```yaml
名称: 'Infrastructure-Health'
专注: 系统资源和依赖

面板:
  - Pod状态（Running/Pending/Failed）
  - 节点资源（CPU/Memory/Disk）
  - 数据库主从延迟
  - 数据库锁等待
  - Redis缓存命中率
  - 网络流量（Ingress/Egress）
  - 日志错误率
```

### 关键面板PromQL查询

#### 可用性

```promql
# 近1小时可用性
1 - (
  sum(increase(http_request_5xx_total[1h])) /
  sum(increase(http_request_total[1h]))
)

# 月度可用性（30天）
1 - (
  sum(increase(http_request_5xx_total[30d])) /
  sum(increase(http_request_total[30d]))
)
```

#### P95延迟

```promql
# 总体P95延迟（毫秒）
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
) * 1000

# 按路由分组P95延迟
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket{route=~"/api/learning/.*"}[5m])) by (le, route)
) * 1000
```

#### RPS（每秒请求数）

```promql
# 总体RPS
sum(rate(http_request_total[1m]))

# 按状态码分组
sum by (status) (rate(http_request_total[1m]))
```

#### 错误预算剩余

```promql
# 月度预算剩余（百分比）
100 * (
  1 - (
    sum(increase(http_request_5xx_total[30d])) /
    sum(increase(http_request_total[30d]))
  )
) / (1 - 0.999)  # SLO=99.9%

# 剩余 > 100% 表示超额完成
# 剩余 < 0% 表示预算耗尽
```

#### AMAS决策置信度

```promql
# P50置信度
histogram_quantile(0.5,
  rate(amas_decision_confidence_bucket[5m])
)

# P95置信度
histogram_quantile(0.95,
  rate(amas_decision_confidence_bucket[5m])
)
```

#### Native模块健康度

```promql
# Native调用成功率
sum(rate(amas_native_calls_total{status="success"}[5m])) /
sum(rate(amas_native_calls_total[5m])) * 100

# Native调用延迟P95（毫秒）
histogram_quantile(0.95,
  sum(rate(amas_native_duration_seconds_bucket[5m])) by (le, method)
) * 1000
```

### 告警面板

```promql
# 活跃告警数量
ALERTS{alertstate="firing"}

# P0告警数量
ALERTS{alertstate="firing", severity="P0"}

# 告警触发频率（最近24小时）
count_over_time(ALERTS{alertstate="firing"}[24h])
```

---

## 改进建议与路线图

### 短期改进（1-3个月）

#### 1. 完善SLO监控

```yaml
优先级: P0
工作量: 2周
任务: ✅ 定义核心SLO目标（已完成）
  - 实现SLO仪表盘（Grafana）
  - 配置错误预算告警
  - 建立发布门控流程
输出:
  - SLO仪表盘URL
  - 错误预算策略文档
  - 发布Checklist
```

#### 2. 扩展告警规则

```yaml
优先级: P1
工作量: 1周
任务:
  - 添加P2/P3业务告警
  - 配置Webhook通知
  - 设置告警路由规则
  - 建立值班轮换表
输出:
  - 完整告警规则清单（12条）
  - Slack/Email通知配置
  - On-Call排班表
```

#### 3. 实施数据库监控增强

```yaml
优先级: P1
工作量: 1周
任务:
  - 启用pg_stat_statements
  - 配置慢查询日志
  - 监控连接池状态
  - 设置复制延迟告警
输出:
  - 数据库性能仪表盘
  - 慢查询分析报告
  - 索引优化建议
```

#### 4. 建立错误预算跟踪

```yaml
优先级: P1
工作量: 3天
任务:
  - 实现错误预算计算脚本
  - 创建预算剩余面板
  - 配置预算耗尽告警
  - 编写预算管理规范
输出:
  - 预算跟踪仪表盘
  - 预算告警规则
  - 错误预算政策文档
```

### 中期改进（3-6个月）

#### 5. 混沌工程实施

```yaml
优先级: P2
工作量: 4周
任务:
  - 部署Chaos Mesh
  - 编写混沌实验脚本
  - 执行首次实验（数据库Failover）
  - 建立定期演练机制
输出:
  - 混沌实验库
  - 实验报告模板
  - 季度演练计划
```

#### 6. 灰度发布自动化

```yaml
优先级: P1
工作量: 2周
任务:
  - 集成Argo Rollouts / Flagger
  - 配置金丝雀发布策略
  - 实现自动回滚
  - 建立A/B测试框架
输出:
  - 自动化发布流水线
  - 发布策略配置文件
  - 回滚Playbook
```

#### 7. 容量规划自动化

```yaml
优先级: P2
工作量: 2周
任务:
  - 配置HPA（Horizontal Pod Autoscaler）
  - 实现VPA（Vertical Pod Autoscaler）
  - 建立容量预测模型
  - 设置资源配额
输出:
  - 自动扩缩容配置
  - 容量预测报告
  - 资源优化建议
```

#### 8. 分布式追踪集成

```yaml
优先级: P2
工作量: 1周
任务:
  - 集成Jaeger / Zipkin
  - 添加trace ID传播
  - 配置采样策略
  - 建立trace分析流程
输出:
  - 分布式追踪系统
  - 慢请求追踪报告
  - 性能瓶颈分析
```

### 长期规划（6-12个月）

#### 9. 多区域灾备

```yaml
优先级: P1
工作量: 8周
任务:
  - 规划跨区域架构
  - 实施数据库跨区域复制
  - 配置全局负载均衡
  - 演练灾难恢复流程
输出:
  - 跨区域部署架构
  - 灾备切换预案
  - RTO/RPO达标证明
```

#### 10. AI辅助运维（AIOps）

```yaml
优先级: P3
工作量: 12周
任务:
  - 构建异常检测模型
  - 实现根因分析自动化
  - 建立故障预测系统
  - 智能告警聚合
输出:
  - AIOps平台原型
  - 异常检测模型
  - 自动诊断报告
```

#### 11. 成本优化项目

```yaml
优先级: P2
工作量: 4周
任务:
  - 实施资源右调（Rightsizing）
  - 采用Spot实例（非关键）
  - 优化存储分层
  - 建立FinOps流程
输出:
  - 成本优化报告（目标降低30%）
  - 资源利用率提升方案
  - FinOps工具集成
```

#### 12. 可观测性平台统一

```yaml
优先级: P2
工作量: 6周
任务:
  - 统一日志、指标、追踪
  - 集成Grafana Loki / ELK
  - 建立统一查询界面
  - 实现关联分析
输出:
  - 统一可观测性平台
  - 三柱（Logs/Metrics/Traces）关联
  - 运维效率提升50%
```

### 度量与目标

#### KPI追踪

```yaml
可用性目标:
  - Q1: 99.5% → Q2: 99.7% → Q3: 99.9%

延迟目标:
  - P95延迟: 250ms → 200ms → 150ms

错误率目标:
  - 5xx错误率: < 0.5% → < 0.2% → < 0.1%

MTTR（平均恢复时间）:
  - 当前: 30分钟 → 目标: 15分钟 → 10分钟

MTTD（平均检测时间）:
  - 当前: 5分钟 → 目标: 2分钟 → 1分钟

成本效率:
  - 单用户成本: 当前 → 降低20% → 降低30%
```

---

## 附录

### A. 监控工具栈

| 组件         | 工具              | 用途               |
| ------------ | ----------------- | ------------------ |
| **指标收集** | Prometheus        | 时序指标存储和查询 |
| **可视化**   | Grafana           | 仪表盘和图表       |
| **告警**     | AlertManager      | 告警聚合和路由     |
| **日志**     | Loki / ELK        | 日志聚合和搜索     |
| **追踪**     | Jaeger            | 分布式请求追踪     |
| **错误追踪** | Sentry            | 应用错误监控       |
| **混沌工程** | Chaos Mesh        | 故障注入           |
| **合成监控** | Blackbox Exporter | 外部探测           |

### B. 关键指标速查表

| 指标       | 查询                                  | 阈值    |
| ---------- | ------------------------------------- | ------- |
| 可用性     | `1 - (5xx / total)`                   | > 99.9% |
| P95延迟    | `histogram_quantile(0.95, ...)`       | < 200ms |
| 5xx错误率  | `5xx / total * 100`                   | < 0.1%  |
| CPU使用率  | `rate(cpu_usage[5m])`                 | < 80%   |
| 内存使用率 | `heap_used / heap_total`              | < 85%   |
| 数据库连接 | `active_conn / max_conn`              | < 90%   |
| 决策置信度 | `histogram_quantile(0.5, confidence)` | > 0.5   |

### C. Runbook链接

| 告警           | Runbook URL                     |
| -------------- | ------------------------------- |
| HTTP延迟高     | `/runbook/http-latency-high.md` |
| 数据库慢查询   | `/runbook/db-slow-query.md`     |
| 5xx错误激增    | `/runbook/http-5xx-spike.md`    |
| OOM崩溃        | `/runbook/oom-crash.md`         |
| 数据库Failover | `/runbook/db-failover.md`       |

### D. 联系人

| 角色              | 责任          | 联系方式               |
| ----------------- | ------------- | ---------------------- |
| **SRE On-Call**   | P0/P1告警响应 | PagerDuty              |
| **Backend Lead**  | 技术决策      | Slack: @backend-lead   |
| **DBA**           | 数据库管理    | Email: dba@example.com |
| **Platform Team** | 基础设施      | Slack: #platform       |

---

**文档维护**:

- 负责人: SRE团队
- 更新频率: 每季度或重大变更后
- 审批流程: SRE Lead → Engineering Manager → CTO

**变更记录**:

- v1.0 (2025-12-13): 初始版本，完整SLO/SLI体系定义
