# Change: Admin System Isolation, Broadcast Notifications & Frontend Performance

## Why

当前系统存在三个关键改进需求：

1. **管理员安全隔离**：管理员与普通用户共用同一认证系统和数据表，存在安全风险，需要完全独立的管理员认证体系
2. **广播通知能力**：管理员无法向在线用户发送实时广播通知，缺乏有效的运营沟通手段
3. **前端性能瓶颈**：当前 React vendor chunk 超过 500KB，首屏加载性能需要优化

## What Changes

### 1. Admin Authentication Isolation (admin-auth)

- **BREAKING**: 管理员认证完全独立，现有 ADMIN 角色用户需要迁移
- 新增 `admin_users` 数据库表存储管理员账户
- 新增独立的管理员认证端点 `/api/admin/auth/*`
- 管理员使用独立的 JWT Secret 和 Token 结构
- 前端 AdminApp 使用独立的 AuthContext/Provider
- 普通用户 Token 无法访问 `/api/admin/*` 端点
- 管理员 Token 无法访问用户学习相关 API

### 2. Broadcast Notification System (admin-broadcast)

- 新增管理员广播通知功能
- 支持三种广播模式：仅在线推送、全员持久化、限时持久化
- 支持多层级目标：全员、分组、单用户
- 基于现有 SSE 基础设施实现实时推送
- 新增在线用户追踪机制
- 新增广播审计日志

### 3. Frontend Performance Optimization (frontend-perf)

- 优化首屏加载速度（LCP < 1.5s 目标）
- React vendor chunk 优化（目标 < 300KB gzipped）
- 实施 CDN 策略或动态导入优化
- 关键资源预加载优化

## Impact

### Affected Specs

- `admin-auth` (NEW) - 管理员认证系统
- `admin-broadcast` (NEW) - 广播通知系统
- `frontend-perf` (NEW) - 前端性能规范

### Affected Code

**Backend (packages/backend-rust):**

- `src/db/operations/` - 新增 admin_users 相关操作
- `src/routes/admin/` - 重构认证中间件，新增广播端点
- `src/auth.rs` - 新增管理员认证逻辑
- `src/routes/realtime.rs` - 扩展在线用户追踪
- `sql/` - 新增迁移脚本

**Frontend (packages/frontend):**

- `src/AdminApp.tsx` - 使用独立 AuthProvider
- `src/services/client/admin/` - 新增独立认证客户端
- `src/stores/` - 新增 adminAuthStore
- `src/components/notification/` - 扩展广播通知组件
- `vite.config.ts` - 优化打包配置

### Breaking Changes

1. 现有 `role='ADMIN'` 用户需要迁移到新的 admin_users 表
2. 管理员登录端点变更为 `/api/admin/auth/login`
3. 前端管理员认证状态与用户认证状态完全独立

### Migration Plan

1. 创建 admin_users 表和迁移脚本
2. 提供 CLI 命令迁移现有管理员账户
3. 部署新端点，保持旧端点兼容期（7天）
4. 完成迁移后移除旧端点兼容逻辑
