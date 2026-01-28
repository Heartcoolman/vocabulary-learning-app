# Spec Delta: Admin Analytics Real Implementation

## MODIFIED Requirements

### Requirement: LLM Advisor Analysis

LLM顾问分析 **SHALL** 返回基于实际LLM调用的结果。

#### Constraints

- **缓存TTL**: 1小时 (3600秒)
- **模型选择**: 使用系统配置的默认LLM提供商
- **配置来源**: 从 `system_settings` 表读取 LLM 配置
- **prompt模板**: 预定义分析模板，包含用户行为摘要
- **最大Token**: 输出限制 500 tokens

#### Scenario: 请求LLM分析

- **Given** LLM服务已配置 (`system_settings.llm_enabled = true`)
- **And** 有足够的分析数据
- **When** 管理员请求LLM顾问分析 `GET /api/admin/llm-advisor`
- **Then** 应调用真实LLM API
- **And** 返回生成的分析建议
- **And** 响应结构:
  ```json
  {
    "analysis": "分析文本...",
    "cached": false,
    "generatedAt": "2026-01-26T10:00:00Z",
    "expiresAt": "2026-01-26T11:00:00Z"
  }
  ```

#### Scenario: LLM服务未配置

- **Given** LLM服务未配置 (`system_settings.llm_enabled = false`)
- **When** 请求分析
- **Then** 应返回 `{ "status": "unavailable", "reason": "LLM服务未配置" }`

#### Scenario: 分析结果缓存

- **Given** 已有最近的分析结果 (TTL内)
- **When** 再次请求
- **Then** 应返回缓存结果
- **And** `cached: true` 和缓存生成时间

#### PBT Properties

- [INVARIANT] 未配置LLM时始终返回 `status: "unavailable"`
- [INVARIANT] TTL内重复请求返回相同内容且 `cached: true`
- [INVARIANT] 缓存过期后重新调用LLM

---

### Requirement: AMAS Explainability

AMAS可解释性 **MUST** 返回真实的模型参数。

#### Constraints

- **参数列表**: 记忆强度(strength)、稳定性(stability)、难度(difficulty)、遗忘曲线(forgetting)
- **Top因素数**: 返回 Top 3 影响因素
- **排序规则**: 按贡献度绝对值降序排列
- **贡献度范围**: 归一化到 [-1, 1]，正值促进记忆，负值阻碍记忆

#### Scenario: 获取AMAS解释

- **Given** 用户有AMAS计算历史
- **When** 请求可解释性数据 `GET /api/admin/amas/explainability/:userId`
- **Then** 应返回真实的参数权重
- **And** 解释各因素的影响程度
- **And** 响应结构:
  ```json
  {
    "userId": "xxx",
    "factors": [
      { "name": "strength", "value": 0.72, "contribution": 0.45, "description": "记忆强度" },
      { "name": "stability", "value": 0.65, "contribution": 0.32, "description": "稳定性" },
      { "name": "difficulty", "value": 0.38, "contribution": -0.18, "description": "词汇难度" }
    ],
    "summary": "记忆强度是主要影响因素"
  }
  ```

#### Scenario: 显示主要影响因素

- **Given** AMAS计算出当前状态
- **When** 请求解释
- **Then** 应列出Top 3影响因素
- **And** 显示每个因素的贡献度

#### Scenario: 无历史数据

- **Given** 新用户无计算历史
- **When** 请求解释
- **Then** 应返回默认参数说明
- **And** 提示 `{ "personalized": false, "message": "学习后将生成个性化解释" }`

#### PBT Properties

- [INVARIANT] Top 3 因素按贡献度绝对值降序排列
- [INVARIANT] 贡献度范围 [-1, 1]
- [INVARIANT] 新用户返回 `personalized: false`

---

### Requirement: Cluster Visualization

聚类可视化 **SHALL** 展示真实聚类结果。

#### Constraints

- **最大聚类数**: 50 个聚类 (分页)
- **每聚类最大词数**: 100 个词
- **数据来源**: `word_clusters` 表
- **响应格式**: 列表结构 (非图节点/边)
- **分页参数**: `page` (默认1), `pageSize` (默认20, 最大50)

#### Scenario: 获取聚类数据

- **Given** 词库已完成聚类
- **When** 请求 `GET /api/semantic/clusters?page=1&pageSize=20`
- **Then** 应返回真实的聚类结构
- **And** 包含聚类ID、中心词、成员词列表
- **And** 响应结构:
  ```json
  {
    "clusters": [
      {
        "id": "cluster_001",
        "centroid": "学习",
        "memberCount": 45,
        "members": ["学习", "复习", "预习", ...]
      }
    ],
    "total": 120,
    "page": 1,
    "pageSize": 20,
    "hasMore": true
  }
  ```

#### Scenario: 聚类详情

- **Given** 某聚类包含多个单词
- **When** 请求聚类详情 `GET /api/semantic/clusters/:clusterId`
- **Then** 应返回该聚类的所有成员 (最多100个)
- **And** 显示语义相似度分布

#### Scenario: 未完成聚类

- **Given** 词库未执行聚类
- **When** 请求聚类数据
- **Then** 应返回 `{ "status": "not_clustered", "message": "请先执行聚类任务" }`

#### PBT Properties

- [INVARIANT] 每个词只属于一个聚类 (无重复)
- [INVARIANT] 聚类详情是摘要的超集
- [INVARIANT] 未聚类时返回 `status: "not_clustered"`
- [INVARIANT] 返回聚类数 ≤ 50, 每聚类词数 ≤ 100

---

### Requirement: Optimization Effect Prediction

优化效果预测 **MUST** 标记为计划中功能。

#### Scenario: 请求效果预测

- **Given** 管理员修改了算法参数
- **When** 请求优化效果预测 `GET /api/admin/optimization/predict`
- **Then** 应返回planned状态
- **And** 不返回虚假的预测数字
- **And** 响应同"计划中"标准格式

---

### Requirement: Alert Rules Management

告警规则管理 **MUST** 标记为计划中功能。

#### Scenario: 访问告警规则页面

- **Given** 管理员访问告警规则配置
- **When** 页面加载
- **Then** 应显示PlannedFeature组件
- **And** 不显示hardcoded规则

#### Scenario: 调用告警规则API

- **Given** 调用 `GET /api/admin/alerts/rules`
- **When** 请求处理
- **Then** 应返回planned状态响应

---

### Requirement: Learning Effect Prediction

学习效果预测 **MUST** 标记为计划中功能。

#### Scenario: 请求学习效果预测

- **Given** 用户请求学习效果预测
- **When** 调用 `GET /api/learning/predict`
- **Then** 应返回planned状态
- **And** 使用标准"计划中"响应格式

---

## Related Capabilities

- **Admin Dashboard** - 管理分析功能
- **AMAS Learning Engine** - AMAS解释能力
- **Semantic Search** - 聚类可视化
