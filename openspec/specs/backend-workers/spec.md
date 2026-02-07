## MODIFIED Requirements

### Requirement: Embedding Worker Activation

嵌入服务Worker **MUST** 被激活并正常运行。

#### Scenario: Worker正常启动

- **Given** 系统配置了嵌入服务API
- **When** 应用启动
- **Then** embedding_worker应自动启动
- **And** 记录启动日志

#### Scenario: Worker健康检查

- **Given** Worker正在运行
- **When** 请求 `GET /api/workers/embedding/health`
- **Then** 应返回Worker状态
- **And** 包含处理队列长度、上次处理时间

#### Scenario: Worker配置禁用

- **Given** 环境变量 `EMBEDDING_WORKER_ENABLED=false`
- **When** 应用启动
- **Then** Worker不应启动
- **And** 健康检查返回disabled状态

#### Scenario: Worker错误恢复

- **Given** Worker遇到处理错误
- **When** 错误发生
- **Then** 应记录错误日志
- **And** 继续处理队列中的其他任务

### Requirement: Clustering Worker Activation

聚类服务Worker **MUST** 被激活并按周期运行。

#### Scenario: Worker定时触发

- **Given** 系统配置了聚类周期
- **When** 到达配置的运行时间
- **Then** 应自动执行聚类任务

#### Scenario: 手动触发聚类

- **Given** 管理员已登录
- **When** 调用 `POST /api/admin/clustering/trigger`
- **Then** 应立即启动聚类任务
- **And** 返回任务ID

#### Scenario: 聚类结果存储

- **Given** 聚类任务完成
- **When** 任务成功
- **Then** 应更新word_clusters表
- **And** 记录聚类统计信息

## Property-Based Testing Invariants

### PBT: Status Reflects Reality

- **INVARIANT**: `reported_disabled = all_workers − started_workers`，且 `started_workers` 无重复
- **FALSIFICATION**: 随机时序调用 `start()`，查询状态，断言集合相等且无重复调度

### PBT: Disabled Implies Non-Operational

- **INVARIANT**: 对于任何 worker w，若 `w ∉ started_workers`，则其 health/trigger API 返回 disabled 且无副作用
- **FALSIFICATION**: 生成随机 API 调用序列并切换 flag，断言禁用 worker 的副作用计数器保持零
