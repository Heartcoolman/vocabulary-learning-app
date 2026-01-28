# Spec Delta: Backend Workers

## ADDED Requirements

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

---

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

---

### Requirement: Segment Classifier Service

分群分类服务 **SHALL** 基于用户数据自动分类用户。

#### Scenario: 新用户分类

- **Given** 用户学习天数 < 7
- **When** 计算分群
- **Then** 应分类为 "new"

#### Scenario: 活跃用户分类

- **Given** 用户最近7天有学习记录
- **And** 学习天数 >= 7
- **When** 计算分群
- **Then** 应分类为 "active"

#### Scenario: 流失风险用户分类

- **Given** 用户最近14天无学习记录
- **And** 之前有持续学习历史
- **When** 计算分群
- **Then** 应分类为 "at_risk"

#### Scenario: 回归用户分类

- **Given** 用户曾经流失（>30天无活动）
- **And** 最近7天重新开始学习
- **When** 计算分群
- **Then** 应分类为 "returning"

#### Scenario: 分类确定性

- **Given** 相同的用户数据
- **When** 多次计算分群
- **Then** 应返回相同结果

---

## Related Capabilities

- **AMAS Learning Engine** - Workers支持AMAS数据处理
- **Semantic Search** - Embedding worker为语义搜索提供数据
