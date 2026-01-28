# admin-broadcast Specification

## Purpose

管理员广播通知系统，支持向在线用户发送实时广播，支持多种推送模式和目标分组。

## ADDED Requirements

### Requirement: Broadcast Message Creation

管理员 **MUST** 能够创建并发送广播消息给目标用户群体。

#### Scenario: Create broadcast to all online users

- **GIVEN** 管理员已登录后台
- **WHEN** 调用 `POST /api/admin/broadcasts` 并指定 `target: "online"`
- **THEN** 广播消息 **MUST** 创建成功
- **AND** 响应 **MUST** 包含 `{ id, targetCount, deliveredCount }`

#### Scenario: Create broadcast to all users (persistent)

- **GIVEN** 管理员已登录后台
- **WHEN** 调用 `POST /api/admin/broadcasts` 并指定 `target: "all", persistent: true`
- **THEN** 广播消息 **MUST** 写入所有用户的通知记录
- **AND** 离线用户下次登录时 **MUST** 能看到该通知

#### Scenario: Create broadcast with expiry

- **GIVEN** 管理员已登录后台
- **WHEN** 调用 `POST /api/admin/broadcasts` 并指定 `expiresAt: "2026-02-01T00:00:00Z"`
- **THEN** 广播消息 **MUST** 在过期前对用户可见
- **AND** 过期后 **MUST** 自动从用户通知列表中移除

#### Scenario: Broadcast payload validation

- **GIVEN** 管理员调用广播 API
- **WHEN** 请求体缺少 `title` 或 `content` 字段
- **THEN** 响应 **MUST** 返回 400 Bad Request
- **AND** 错误信息 **MUST** 指明缺失字段

#### Scenario: Broadcast payload limits

- **GIVEN** 管理员调用广播 API
- **WHEN** title 长度超过 100 字符
- **THEN** 响应 **MUST** 返回 400 Bad Request
- **AND** 错误信息 **MUST** 为 "title exceeds 100 characters"

- **WHEN** content 长度超过 10000 字符
- **THEN** 响应 **MUST** 返回 400 Bad Request
- **AND** 错误信息 **MUST** 为 "content exceeds 10000 characters"

- **WHEN** target="users" 且 userIds 长度超过 500
- **THEN** 响应 **MUST** 返回 400 Bad Request
- **AND** 错误信息 **MUST** 为 "userIds exceeds 500 entries"

---

### Requirement: Multi-Level Broadcast Targeting

广播系统 **MUST** 支持多层级目标选择：全员、分组、单用户。

#### Scenario: Broadcast to all users

- **GIVEN** 管理员创建广播
- **WHEN** 指定 `target: "all"`
- **THEN** 所有注册用户 **MUST** 收到广播（在线立即推送，离线按持久化策略处理）

#### Scenario: Broadcast to user group

- **GIVEN** 用户有不同的词书订阅
- **WHEN** 管理员指定 `target: "group", groupFilter: { wordbook: "CET4" }`
- **THEN** 仅订阅 CET4 词书的用户 **MUST** 收到广播

#### Scenario: Broadcast to single user

- **GIVEN** 管理员指定目标用户
- **WHEN** 指定 `target: "user", userId: "xxx"`
- **THEN** 仅该用户 **MUST** 收到广播
- **AND** 其他用户 **MUST NOT** 收到

#### Scenario: Broadcast to multiple users

- **GIVEN** 管理员指定多个目标用户
- **WHEN** 指定 `target: "users", userIds: ["id1", "id2", "id3"]`
- **THEN** 仅指定用户 **MUST** 收到广播

---

### Requirement: Online User Tracking

系统 **MUST** 追踪当前在线用户以支持实时广播投递。

#### Scenario: User comes online

- **GIVEN** 用户建立 SSE 连接
- **WHEN** 连接成功订阅
- **THEN** 用户 **MUST** 被标记为在线
- **AND** RealtimeHub 的 `online_users` 集合 **MUST** 包含该用户 ID

#### Scenario: User goes offline

- **GIVEN** 用户已建立 SSE 连接
- **WHEN** 连接断开（主动关闭或超时）
- **THEN** 用户 **MUST** 从 `online_users` 集合移除
- **AND** SubscriptionGuard::drop **MUST** 触发清理

#### Scenario: Get online user count

- **GIVEN** 管理员访问后台
- **WHEN** 调用 `GET /api/admin/broadcasts/online-stats`
- **THEN** 响应 **MUST** 包含 `{ onlineCount, totalUsers }`

---

### Requirement: Real-time Broadcast Delivery

广播消息 **MUST** 通过现有 SSE 基础设施实时推送给在线用户，采用 At-least-once 投递语义。

#### Scenario: At-least-once delivery guarantee

- **GIVEN** 管理员创建持久化广播
- **WHEN** 广播处理开始
- **THEN** 广播 **MUST** 先写入 `broadcasts` 表
- **AND** 每个目标用户的通知 **MUST** 写入 `notifications` 表
- **AND** SSE 事件仅作为通知信号，不包含完整内容
- **AND** 即使 SSE 推送失败，用户仍 **MUST** 能通过 `GET /api/notifications` 获取广播

#### Scenario: SSE event payload (minimal)

- **GIVEN** 广播已持久化
- **WHEN** 发送 SSE 事件
- **THEN** 事件类型 **MUST** 为 `admin-broadcast`
- **AND** payload **MUST** 仅包含 `{ broadcastId, type: "new_broadcast" }`
- **AND** 客户端 **MUST** 通过 API 拉取完整内容

#### Scenario: Offline user receives on reconnect

- **GIVEN** 广播设置为持久化模式
- **WHEN** 离线用户重新连接
- **THEN** 用户 **MUST** 能通过 `GET /api/notifications` 获取未读广播

---

### Requirement: Broadcast Audit Logging

所有广播操作 **MUST** 记录审计日志以满足合规要求。

#### Scenario: Log broadcast creation

- **GIVEN** 管理员创建广播
- **WHEN** 广播发送成功
- **THEN** `broadcast_audit_logs` 表 **MUST** 记录: adminId, broadcastId, action="created", targetType, targetCount, timestamp

#### Scenario: Log broadcast delivery

- **GIVEN** 广播推送给在线用户
- **WHEN** 推送完成
- **THEN** 审计日志 **MUST** 更新 `deliveredCount` 和 `deliveredAt`

#### Scenario: Query audit logs

- **GIVEN** 超级管理员访问审计页面
- **WHEN** 调用 `GET /api/admin/broadcasts/audit`
- **THEN** 响应 **MUST** 返回广播审计日志列表
- **AND** 支持按时间范围和管理员 ID 筛选

---

### Requirement: Frontend Broadcast Display

前端 **MUST** 正确显示和处理广播通知。

#### Scenario: Display broadcast in notification dropdown

- **GIVEN** 用户收到广播
- **WHEN** 打开通知下拉面板
- **THEN** 广播 **MUST** 显示在通知列表顶部
- **AND** **MUST** 有视觉标识区分于普通通知（如 "系统广播" 标签）

#### Scenario: Real-time broadcast toast

- **GIVEN** 用户在前台使用应用
- **WHEN** 收到 SSE 广播事件
- **THEN** **MUST** 显示 Toast 提示
- **AND** Toast **MUST** 显示广播标题
- **AND** 点击 Toast **MUST** 导航到通知中心

#### Scenario: Mark broadcast as read

- **GIVEN** 用户查看广播详情
- **WHEN** 广播被展示
- **THEN** 广播状态 **MUST** 标记为已读
- **AND** 未读计数 **MUST** 相应减少

---

### Requirement: Broadcast Management UI

管理后台 **MUST** 提供广播管理界面。

#### Scenario: Broadcast creation form

- **GIVEN** 管理员访问广播管理页面
- **WHEN** 点击 "新建广播"
- **THEN** **MUST** 显示表单包含: 标题、内容、目标类型、优先级、过期时间（可选）

#### Scenario: Broadcast history list

- **GIVEN** 管理员访问广播管理页面
- **WHEN** 页面加载
- **THEN** **MUST** 显示历史广播列表
- **AND** 每条记录 **MUST** 显示: 标题、发送时间、目标数、送达数、状态

#### Scenario: Broadcast detail view

- **GIVEN** 管理员点击某条广播记录
- **WHEN** 详情面板打开
- **THEN** **MUST** 显示完整广播内容和送达统计
