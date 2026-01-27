# Spec Delta: Admin Quality Check

**约束引用**: C1（使用/api/admin/quality）, C5（LLM未配置阻止创建）, C11（1000词上限）

## ADDED Requirements

### Requirement: Quality Check Task Management

管理员 **MUST** 能够创建和管理内容质量检查任务。

#### Scenario: 启动质量检查任务

- **Given** 管理员已登录
- **And** 选择了目标词书（词数 ≤ 1000）（**C11**）
- **And** LLM服务已配置（**C5**）
- **When** 管理员调用 `POST /api/admin/quality/tasks`（**C1**）
- **Then** 系统应创建新的质量检查任务
- **And** 任务状态为 "pending"
- **And** 返回任务ID

#### Scenario: 词书词数超过限制

- **Given** 管理员已登录
- **And** 选择了目标词书（词数 > 1000）
- **When** 管理员尝试启动检查
- **Then** 系统应返回HTTP 400错误
- **And** 错误消息为 "词书词数超过1000上限，请分批检查"（**C11**）

#### Scenario: LLM服务未配置

- **Given** 管理员已登录
- **And** LLM服务未配置
- **When** 管理员尝试启动检查
- **Then** 系统应返回HTTP 503错误
- **And** 错误消息为 "LLM服务未配置，无法进行质量检查"（**C5**）

#### Scenario: 查看质量检查任务列表

- **Given** 管理员已登录
- **When** 管理员访问质量检查页面
- **Then** 应显示该词书的所有检查任务
- **And** 包含任务状态、创建时间、问题数量

#### Scenario: 查看检查任务详情

- **Given** 存在一个已完成的检查任务
- **When** 管理员点击任务详情
- **Then** 应显示发现的所有问题
- **And** 包含问题类型、严重程度、受影响单词

#### Scenario: 查看发现的问题列表

- **Given** 检查任务发现了质量问题
- **When** 管理员查看问题列表
- **Then** 应显示问题详情
- **And** 支持按类型、严重程度筛选

---

### Requirement: Quality Check Task Execution

质量检查任务 **SHALL** 后台执行并更新状态。

#### Scenario: 任务开始执行

- **Given** 存在一个 "pending" 状态的任务
- **When** 后台工作器处理该任务
- **Then** 任务状态应更新为 "running"

#### Scenario: 任务执行完成

- **Given** 任务正在执行
- **When** 所有单词检查完成
- **Then** 任务状态应更新为 "completed"
- **And** 记录发现的问题数量

#### Scenario: 任务执行失败

- **Given** 任务正在执行
- **When** 发生不可恢复的错误
- **Then** 任务状态应更新为 "failed"
- **And** 记录失败原因

---

## MODIFIED Requirements

### Requirement: Content Enhancement Endpoints

将存根端点 **SHALL** 修改为返回明确的"计划中"状态。

#### Scenario: 调用未实现的修复功能

- **Given** 管理员已登录
- **When** POST `/api/admin/quality/issues/:id/fix`
- **Then** 响应状态码应为 200
- **And** 响应体应为:
  ```json
  {
    "success": true,
    "data": {
      "status": "planned",
      "message": "此功能正在开发中，预计后续版本支持"
    }
  }
  ```

#### Scenario: 调用未实现的忽略功能

- **Given** 管理员已登录
- **When** POST `/api/admin/quality/issues/:id/ignore`
- **Then** 响应与"修复功能"相同

#### Scenario: 调用未实现的批量操作

- **Given** 管理员已登录
- **When** POST `/api/admin/quality/issues/batch`
- **Then** 响应与"修复功能"相同

#### Scenario: 调用未实现的增强预览

- **Given** 管理员已登录
- **When** POST `/api/admin/content/preview`
- **Then** 响应与"修复功能"相同

---

## REMOVED Requirements

### Requirement: NOT_IMPLEMENTED Error Response

系统 **MUST** 移除返回 500/501 错误的行为。

#### Scenario: 不再返回服务器错误

- **Given** 任何内容质量相关端点
- **When** 调用该端点
- **Then** 不应返回 500 或 501 状态码
- **And** 应返回有意义的响应

---

## Related Capabilities

- **Word Book Management** - 质量检查针对词书内容
- **Admin Dashboard** - 质量检查是管理功能的一部分
