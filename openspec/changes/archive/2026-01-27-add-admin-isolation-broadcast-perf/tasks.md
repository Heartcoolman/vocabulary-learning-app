# Tasks: Admin Isolation, Broadcast & Performance

## Implementation Constraints Reference

所有实现必须严格遵循 `proposal.md` 中的约束和 `design.md` 中的技术决策。

---

## Phase 1: Database Schema Migration

### 1.1 Admin Authentication Tables

- [x] 1.1.1 创建迁移文件 `037_add_admin_users.sql`
- [x] 1.1.2 创建 `admin_users` 表（id, email, passwordHash, username, permissions, createdAt, updatedAt, lastLoginAt）
- [x] 1.1.3 创建 `admin_sessions` 表（id, adminId, token, expiresAt, createdAt）
- [x] 1.1.4 添加索引：admin_users(email), admin_sessions(token), admin_sessions(adminId)

### 1.2 Broadcast Tables

- [x] 1.2.1 创建迁移文件 `038_add_broadcasts.sql`
- [x] 1.2.2 创建 `BroadcastTarget` 和 `BroadcastStatus` 枚举类型
- [x] 1.2.3 创建 `broadcasts` 表
- [x] 1.2.4 创建 `broadcast_audit_logs` 表
- [x] 1.2.5 在 `notifications` 表添加 `broadcastId` 可空字段

---

## Phase 2: Backend - Admin Authentication Module

### 2.1 Database Operations

- [x] 2.1.1 创建 `src/db/operations/admin.rs` 模块
- [x] 2.1.2 实现 `create_admin_user` 函数
- [x] 2.1.3 实现 `find_admin_by_email` 函数
- [x] 2.1.4 实现 `create_admin_session` / `delete_admin_session` 函数
- [x] 2.1.5 实现 `verify_admin_session` 函数

### 2.2 Admin Auth Service

- [x] 2.2.1 创建 `src/services/admin_auth.rs` 模块
- [x] 2.2.2 实现 `sign_admin_jwt` 函数（使用 ADMIN_JWT_SECRET）
- [x] 2.2.3 实现 `verify_admin_jwt` 函数
- [x] 2.2.4 实现 `admin_login` 服务函数
- [x] 2.2.5 实现 `admin_logout` 服务函数

### 2.3 Admin Auth Routes

- [x] 2.3.1 创建 `src/routes/admin/auth.rs` 模块
- [x] 2.3.2 实现 `POST /api/admin/auth/login` 端点
- [x] 2.3.3 实现 `POST /api/admin/auth/logout` 端点
- [x] 2.3.4 实现 `GET /api/admin/auth/me` 端点
- [x] 2.3.5 创建 `require_admin_auth` 中间件（独立于 `require_admin`）

### 2.4 Admin Management

- [x] 2.4.1 实现 `POST /api/admin/auth/users` 创建管理员端点（超级管理员专用）
- [x] 2.4.2 更新 CLI `create-admin` 命令使用新表
- [x] 2.4.3 创建管理员迁移 CLI 命令 `migrate-admins`

---

## Phase 3: Backend - Broadcast System

### 3.1 Database Operations

- [x] 3.1.1 创建 `src/db/operations/broadcast.rs` 模块
- [x] 3.1.2 实现 `create_broadcast` 函数
- [x] 3.1.3 实现 `list_broadcasts` 函数（分页、筛选）
- [x] 3.1.4 实现 `get_broadcast_by_id` 函数
- [x] 3.1.5 实现 `create_audit_log` 函数

### 3.2 Online User Tracking

- [x] 3.2.1 扩展 `RealtimeHub` 添加 `online_users: RwLock<HashSet<String>>`
- [x] 3.2.2 在 `subscribe` 时添加用户到 `online_users`
- [x] 3.2.3 在 `SubscriptionGuard::drop` 时从 `online_users` 移除
- [x] 3.2.4 实现 `get_online_user_ids` 函数
- [x] 3.2.5 实现 `get_online_count` 函数

### 3.3 Broadcast Service

- [x] 3.3.1 创建 `src/services/broadcast.rs` 模块
- [x] 3.3.2 实现广播目标解析（all/online/group/user/users）
- [x] 3.3.3 实现实时推送逻辑（调用 realtime::send_event）
- [x] 3.3.4 实现持久化逻辑（批量插入 notifications）
- [x] 3.3.5 实现审计日志记录

### 3.4 Broadcast Routes

- [x] 3.4.1 创建 `src/routes/admin/broadcast.rs` 模块
- [x] 3.4.2 实现 `POST /api/admin/broadcasts` 创建广播端点
- [x] 3.4.3 实现 `GET /api/admin/broadcasts` 列表端点
- [x] 3.4.4 实现 `GET /api/admin/broadcasts/:id` 详情端点
- [x] 3.4.5 实现 `GET /api/admin/broadcasts/online-stats` 端点
- [x] 3.4.6 实现 `GET /api/admin/broadcasts/audit` 审计日志端点

---

## Phase 4: Frontend - Admin Auth Isolation

### 4.1 Admin Auth Store

- [x] 4.1.1 创建 `src/stores/adminAuthStore.ts`
- [x] 4.1.2 实现 adminToken 存储逻辑（localStorage key: `admin_token`）
- [x] 4.1.3 实现 adminUser 状态管理
- [x] 4.1.4 实现 adminLogin / adminLogout actions

### 4.2 Admin Auth Client

- [x] 4.2.1 创建 `src/services/client/admin/AdminAuthClient.ts`
- [x] 4.2.2 实现 `login(email, password)` 方法（调用 `/api/admin/auth/login`）
- [x] 4.2.3 实现 `logout()` 方法
- [x] 4.2.4 实现 `getMe()` 方法
- [x] 4.2.5 配置独立的请求拦截器（使用 admin_token）

### 4.3 AdminApp Integration

- [x] 4.3.1 修改 `AdminApp.tsx` 使用 `adminAuthStore`
- [x] 4.3.2 创建 `AdminAuthProvider` 组件
- [x] 4.3.3 修改 `AdminLoginPage.tsx` 使用新的认证流程
- [x] 4.3.4 修改 `AdminProtectedRoute` 使用 adminAuthStore
- [x] 4.3.5 确保 AdminApp 与 App 认证状态完全独立

---

## Phase 5: Frontend - Broadcast UI

### 5.1 Broadcast Components

- [x] 5.1.1 创建 `src/components/admin/broadcast/BroadcastForm.tsx`
- [x] 5.1.2 创建 `src/components/admin/broadcast/BroadcastList.tsx`
- [x] 5.1.3 创建 `src/components/admin/broadcast/BroadcastDetail.tsx`
- [x] 5.1.4 创建 `src/components/admin/broadcast/OnlineStats.tsx`

### 5.2 Broadcast Page

- [x] 5.2.1 创建 `src/pages/admin/BroadcastPage.tsx`
- [x] 5.2.2 添加到 admin.routes.tsx
- [x] 5.2.3 添加到管理后台侧边栏导航

### 5.3 User-side Broadcast Display

- [x] 5.3.1 扩展 `useRealtimeEvent` 订阅 `admin-broadcast` 事件
- [x] 5.3.2 创建 `BroadcastToast` 组件（收到广播时显示）
- [x] 5.3.3 修改 `NotificationItem` 支持广播类型样式区分
- [x] 5.3.4 修改 `NotificationDropdown` 显示广播标签

---

## Phase 6: Frontend Performance Optimization

### 6.1 Bundle Optimization

- [x] 6.1.1 配置 React CDN 外部化（vite.config.ts external + importmap）
- [x] 6.1.2 修复空 Sentry vendor chunk
- [x] 6.1.3 验证构建后无 >500KB chunk 警告

### 6.2 Resource Preloading

- [x] 6.2.1 添加关键字体 preload 标签
- [x] 6.2.2 验证 API preconnect 正常工作
- [x] 6.2.3 优化 prefetch 调度逻辑

### 6.3 Lazy Loading Enhancement

- [x] 6.3.1 审查 LearningPage 依赖，确保最小化
- [x] 6.3.2 拆分 UserDetailPage 为子组件懒加载
- [x] 6.3.3 图表组件按需加载

### 6.4 Performance Validation

- [x] 6.4.1 运行 Lighthouse 测试验证 LCP < 1.5s
- [x] 6.4.2 更新 bundle-analysis-summary.txt
- [x] 6.4.3 验证 gzipped JS < 150KB（首屏）

---

## Phase 7: Migration & Testing

### 7.1 Admin Migration

- [x] 7.1.1 测试 `migrate-admins` CLI 命令
- [x] 7.1.2 编写迁移文档说明
- [x] 7.1.3 验证旧端点兼容期正常工作

### 7.2 Integration Testing

- [x] 7.2.1 测试管理员登录/登出流程
- [x] 7.2.2 测试用户无法登录管理端
- [x] 7.2.3 测试管理员无法使用用户 API
- [x] 7.2.4 测试广播创建和实时推送
- [x] 7.2.5 测试广播持久化和离线用户接收

### 7.3 Cleanup

- [x] 7.3.1 移除 users 表的 ADMIN 角色使用（兼容期后）
- [x] 7.3.2 更新 API 文档
- [x] 7.3.3 更新 README 说明管理员创建方式
