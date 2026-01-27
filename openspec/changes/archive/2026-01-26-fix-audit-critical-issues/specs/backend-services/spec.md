# Spec Delta: Backend Services Fixes

**约束引用**: C2（管理员模拟）, C3（单任务模式）, C9（因果推理基础功能）, C10（自动分群）, C12（健康检查缓存）

## MODIFIED Requirements

### Requirement: AMAS History Endpoints

AMAS历史端点 **MUST** 返回真实的学习状态历史数据。

#### Scenario: 获取状态历史

- **Given** 用户有学习历史记录
- **When** GET `/api/amas/history?days=30`
- **Then** 应返回过去30天的AMAS状态变化
- **And** 包含注意力、疲劳、动机等指标

#### Scenario: 获取认知成长数据

- **Given** 用户有足够的学习数据
- **When** GET `/api/amas/growth?days=30`
- **Then** 应返回认知成长趋势数据
- **And** 包含掌握度变化、学习效率等

#### Scenario: 获取重大变化

- **Given** 用户学习状态有显著变化
- **When** GET `/api/amas/changes`
- **Then** 应返回检测到的重大状态变化事件
- **And** 包含变化类型、时间、影响因素

#### Scenario: 用户无历史数据

- **Given** 新用户没有学习历史
- **When** 请求历史数据
- **Then** 应返回空数组
- **And** 状态码为 200

---

### Requirement: StorageService Admin Impersonation（**C2**）

StorageService **MUST** 支持管理员模拟功能查看其他用户数据。

#### Scenario: 管理员获取其他用户学习状态

- **Given** 用户A是管理员
- **And** 用户B有学习记录
- **When** 用户A调用 `GET /api/admin/users/B/word-states`
- **Then** 应返回用户B的数据

#### Scenario: 非管理员尝试获取其他用户数据

- **Given** 用户A不是管理员
- **When** 用户A尝试调用 `GET /api/admin/users/B/word-states`
- **Then** 应返回HTTP 403 Forbidden
- **And** 不应泄露任何用户B的数据

#### Scenario: 普通用户获取自己的数据

- **Given** 用户A已登录（非管理员）
- **When** 用户A请求自己的学习状态
- **Then** 后端通过token作用域返回用户A的数据
- **And** 无需传递userId参数

---

### Requirement: Insight Generation Segment Filtering（**C10**）

洞察生成 **SHALL** 正确按用户分群过滤数据。分群基于学习进度自动分类。

#### Scenario: 用户分群自动分类

- **Given** 用户有不同的学习进度数据
- **When** 系统计算用户分群
- **Then** 应基于学习天数、完成率等指标确定性分类
- **And** 分群包括：新手(new)、活跃(active)、流失风险(at_risk)、回归(returning)
- **And** 每用户恰好属于一个分群

#### Scenario: 按分群获取统计数据

- **Given** 系统有多个用户分群
- **When** 请求特定分群的统计 `GET /api/admin/ops/insights?segment=active`
- **Then** 应只返回该分群的数据
- **And** WHERE条件应包含segment过滤

#### Scenario: 全局统计（无分群过滤）

- **Given** 请求全局统计
- **When** segment参数为空或"all"
- **Then** 应返回所有用户的统计
- **And** 不应用segment过滤

---

### Requirement: LLM Task Single-Task Mode（**C3**）

LLM任务管理 **SHALL** 仅支持单任务操作模式。

#### Scenario: 单任务状态转换

- **Given** 存在一个LLM任务
- **When** 管理员操作该任务
- **Then** 状态转换遵循：pending → processing → (completed|failed)
- **And** 重复相同操作是幂等的

#### Scenario: 无批量操作UI

- **Given** 管理员访问LLM任务页面
- **When** 页面渲染
- **Then** 不应显示多选复选框
- **And** 不应显示批量操作按钮

---

### Requirement: Embedding Service Health Check（**C12**）

嵌入服务健康检查 **MUST** 验证实际连接状态，结果缓存60秒。

#### Scenario: 嵌入服务健康

- **Given** 嵌入服务API可用
- **When** 执行健康检查 `GET /api/semantic/health`
- **Then** 应尝试实际API调用（如获取模型列表）
- **And** 返回 `{ "healthy": true, "latency_ms": X }`
- **And** 结果缓存60秒

#### Scenario: 60秒内重复检查

- **Given** 上次检查在60秒内
- **When** 再次执行健康检查
- **Then** 应返回缓存结果
- **And** 不进行实际API调用

#### Scenario: 缓存过期后检查

- **Given** 上次检查超过60秒
- **When** 执行健康检查
- **Then** 应执行新的实际API调用
- **And** 更新缓存

#### Scenario: 嵌入服务不健康

- **Given** 嵌入服务API不可用
- **When** 执行健康检查
- **Then** 应返回 `{ "healthy": false, "error": "连接失败" }`
- **And** 不应只检查配置是否存在

#### Scenario: 嵌入服务未配置

- **Given** 嵌入服务未配置API密钥
- **When** 执行健康检查
- **Then** 应返回 `{ "healthy": false, "error": "未配置" }`

---

## ADDED Requirements

### Requirement: Causal Inference Basic Functionality（**C9**）

因果推理模块 **SHALL** 实现基础功能（非禁用状态）。

#### Scenario: 基础数据记录

- **Given** 管理员访问因果推理页面
- **When** 提交观察数据
- **Then** 系统应记录该观察
- **And** 返回记录成功确认

#### Scenario: 基础ATE计算（数据充足）

- **Given** 有足够的观察数据（≥30个样本）
- **When** 请求ATE（平均处理效应）计算
- **Then** 应返回非空的ATE估计值
- **And** 包含置信区间

#### Scenario: 数据不足时的确定性返回

- **Given** 观察数据不足（<30个样本）
- **When** 请求ATE计算
- **Then** 应返回空结果 `{ "ate": null, "reason": "insufficient_data" }`
- **And** 不应返回错误或异常

---

## Related Capabilities

- **AMAS Learning Engine** - 历史端点是AMAS系统的组成部分
- **User Data Isolation** - StorageService修复涉及数据安全
- **Admin Monitoring** - 健康检查是监控功能的一部分
- **LLM Integration** - 任务管理是LLM功能的一部分
