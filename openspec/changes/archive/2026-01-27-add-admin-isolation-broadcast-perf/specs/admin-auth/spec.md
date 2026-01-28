# admin-auth Specification

## Purpose

完全独立的管理员认证系统，与普通用户认证在数据存储、认证流程、Token 机制上完全隔离。

## ADDED Requirements

### Requirement: Admin User Database Isolation

管理员账户 **MUST** 存储在独立的 `admin_users` 表中，与 `users` 表完全分离。

#### Scenario: Admin user stored separately

- **GIVEN** 系统初始化完成
- **WHEN** 创建管理员账户
- **THEN** 账户信息 **MUST** 写入 `admin_users` 表
- **AND** `users` 表 **MUST NOT** 包含任何管理员账户记录

#### Scenario: Admin table schema

- **GIVEN** 数据库迁移执行
- **WHEN** `admin_users` 表创建完成
- **THEN** 表结构 **MUST** 包含: id, email, passwordHash, username, permissions, createdAt, updatedAt, lastLoginAt
- **AND** email 字段 **MUST** 有唯一约束

---

### Requirement: Independent Admin Authentication Endpoint

管理员登录 **MUST** 使用独立的认证端点，与用户登录端点完全分离。

#### Scenario: Admin login endpoint

- **GIVEN** 管理员访问登录页面
- **WHEN** 提交登录凭证
- **THEN** 请求 **MUST** 发送到 `POST /api/admin/auth/login`
- **AND** 该端点 **MUST NOT** 接受普通用户凭证

#### Scenario: User cannot login via admin endpoint

- **GIVEN** 普通用户账户存在于 `users` 表
- **WHEN** 使用该账户凭证调用 `/api/admin/auth/login`
- **THEN** 响应 **MUST** 返回 401 Unauthorized
- **AND** 错误信息 **MUST** 为 "管理员账户不存在"

#### Scenario: Admin cannot login via user endpoint

- **GIVEN** 管理员账户存在于 `admin_users` 表
- **WHEN** 使用该账户凭证调用 `/api/auth/login`
- **THEN** 响应 **MUST** 返回 401 Unauthorized
- **AND** 错误信息 **MUST** 为 "该邮箱尚未注册"

---

### Requirement: Separate Admin JWT Token

管理员 Token **MUST** 使用独立的签名密钥和结构，与用户 Token 不可互换。

#### Scenario: Admin token signing

- **GIVEN** 管理员登录成功
- **WHEN** 生成 JWT Token
- **THEN** Token **MUST** 使用 `ADMIN_JWT_SECRET` 环境变量签名
- **AND** Token payload **MUST** 包含 `type: "admin"` 声明
- **AND** Token **MUST** 包含 `adminId` 而非 `userId` 声明

#### Scenario: Admin token TTL

- **GIVEN** 管理员登录成功
- **WHEN** 生成 access token 和 refresh token
- **THEN** access token TTL **MUST** 为 900 秒（15 分钟）
- **AND** refresh token TTL **MUST** 为 604800 秒（7 天）
- **AND** Token 结构与用户 Token 一致，仅 type 和 id 字段不同

#### Scenario: Admin token cannot access user APIs

- **GIVEN** 持有有效的管理员 Token
- **WHEN** 访问用户学习相关 API (如 `/api/learning/*`)
- **THEN** 响应 **MUST** 返回 403 Forbidden
- **AND** 错误信息 **MUST** 为 "管理员账户无法访问用户功能"

#### Scenario: User token cannot access admin APIs

- **GIVEN** 持有有效的用户 Token
- **WHEN** 访问管理员 API `/api/admin/*`
- **THEN** 响应 **MUST** 返回 401 Unauthorized
- **AND** 错误信息 **MUST** 为 "需要管理员认证"

---

### Requirement: Independent Admin Session Management

管理员会话 **MUST** 使用独立的会话表，与用户会话分离。

#### Scenario: Admin session storage

- **GIVEN** 管理员登录成功
- **WHEN** 创建会话
- **THEN** 会话信息 **MUST** 写入 `admin_sessions` 表
- **AND** `sessions` 表 **MUST NOT** 包含管理员会话

#### Scenario: Admin session expiry

- **GIVEN** 管理员会话已创建
- **WHEN** 会话过期时间到达
- **THEN** Token **MUST** 失效
- **AND** 管理员 **MUST** 重新登录

---

### Requirement: Frontend Admin Auth Isolation

前端管理后台 **MUST** 使用完全独立的认证状态管理，与用户端认证隔离。

#### Scenario: Separate auth store

- **GIVEN** AdminApp 初始化
- **WHEN** 加载认证状态
- **THEN** **MUST** 使用 `adminAuthStore` 而非 `authStore`
- **AND** 两个 store 的状态 **MUST NOT** 相互影响

#### Scenario: Admin token storage

- **GIVEN** 管理员登录成功
- **WHEN** 存储 Token
- **THEN** Token **MUST** 存储在 `admin_token` localStorage key
- **AND** **MUST NOT** 覆盖或读取 `auth_token` key

#### Scenario: Independent logout

- **GIVEN** 用户和管理员同时登录（不同浏览器标签）
- **WHEN** 管理员退出登录
- **THEN** 仅管理员会话 **MUST** 失效
- **AND** 用户会话 **MUST NOT** 受影响

---

### Requirement: Admin Account Creation Restriction

管理员账户 **MUST** 只能通过受控方式创建，禁止自助注册。

#### Scenario: No public admin registration

- **GIVEN** 未认证用户
- **WHEN** 尝试访问管理员注册端点
- **THEN** 响应 **MUST** 返回 404 Not Found
- **AND** 不存在公开的管理员注册 API

#### Scenario: CLI admin creation

- **GIVEN** 服务器运行中
- **WHEN** 执行 `cargo run -- create-admin --email admin@example.com --password xxx`
- **THEN** 管理员账户 **MUST** 创建成功
- **AND** 输出 **MUST** 显示 "ADMIN_CREATED"

#### Scenario: Super admin creates admin

- **GIVEN** 超级管理员已登录
- **WHEN** 调用 `POST /api/admin/users` 创建管理员
- **THEN** 新管理员账户 **MUST** 创建成功
- **AND** 响应 **MUST** 包含新管理员的 ID
