# Spec Delta: Admin Export Features

## ADDED Requirements

### Requirement: Experiment Results Export

管理员 **MUST** 能够导出A/B测试实验结果。

#### Scenario: 导出实验结果为CSV

- **Given** 管理员已登录
- **And** 存在已完成的实验
- **When** 请求 `GET /api/admin/experiments/:id/export?format=csv`
- **Then** 应返回CSV格式的实验数据
- **And** 包含用户组、指标、时间戳

#### Scenario: 导出实验结果为JSON

- **Given** 管理员已登录
- **When** 请求 `GET /api/admin/experiments/:id/export?format=json`
- **Then** 应返回JSON格式的实验数据

#### Scenario: 导出不存在的实验

- **Given** 实验ID不存在
- **When** 请求导出
- **Then** 应返回HTTP 404

---

### Requirement: Audit Log Export

管理员 **MUST** 能够导出审计日志。

#### Scenario: 按时间范围导出日志

- **Given** 管理员已登录
- **When** 请求 `GET /api/admin/audit-logs/export?from=2025-01-01&to=2025-01-31`
- **Then** 应返回该时间范围内的日志
- **And** 使用流式响应避免内存溢出

#### Scenario: 按类型过滤导出

- **Given** 管理员已登录
- **When** 请求带type参数的导出
- **Then** 应只导出指定类型的日志

#### Scenario: 导出数据量限制

- **Given** 请求的时间范围包含超过10万条日志
- **When** 请求导出
- **Then** 应返回HTTP 400
- **And** 提示缩小时间范围

---

### Requirement: Config History Diff View

配置历史 **SHALL** 支持版本对比功能。

#### Scenario: 对比两个配置版本

- **Given** 管理员查看配置历史
- **And** 选择了两个版本
- **When** 点击"对比"按钮
- **Then** 应显示两个版本的差异
- **And** 高亮标记新增、删除、修改项

#### Scenario: 对比相同版本

- **Given** 选择的两个版本相同
- **When** 尝试对比
- **Then** 应提示"请选择不同版本进行对比"

---

## Related Capabilities

- **Admin Dashboard** - 导出功能是管理功能的组成部分
- **A/B Testing** - 实验结果导出依赖实验系统
