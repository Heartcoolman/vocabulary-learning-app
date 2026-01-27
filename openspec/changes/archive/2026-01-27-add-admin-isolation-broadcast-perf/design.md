# Design: Admin Isolation, Broadcast & Performance

## Context

当前系统存在以下技术问题：

1. 管理员与普通用户共用 `users` 表和认证端点，通过 `role` 字段区分，存在安全隐患
2. 缺乏广播通知能力，管理员无法向用户群发消息
3. 前端 React vendor chunk 超过 500KB，首屏加载性能不佳

用户决策：

- 采用**同进程独立模块**方案，在现有 backend-rust 中实现独立的管理员认证模块
- 前端保持**共享前端**结构，仅隔离认证逻辑
- 广播支持**多层级**目标（全员、分组、单用户）和**多种持久化策略**

## Goals / Non-Goals

**Goals:**

- 管理员认证与用户认证完全隔离（数据、端点、Token）
- 支持灵活的广播通知系统（实时推送 + 可选持久化）
- 首屏 LCP 优化至 1.5s 以内

**Non-Goals:**

- 不将管理员服务拆分为独立微服务（保持同进程）
- 不重新设计整个通知系统架构
- 不引入新的前端框架或大规模重构

## Decisions

### D1: Admin Database Schema

**Decision:** 创建独立的 `admin_users` 和 `admin_sessions` 表

**Rationale:**

- 完全隔离管理员和用户数据，避免误操作
- 独立的会话表便于管理员会话审计
- 便于未来管理员权限精细化控制（permissions 字段）

**Schema:**

```sql
CREATE TABLE "admin_users" (
    "id" TEXT PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "passwordHash" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "permissions" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "lastLoginAt" TIMESTAMP
);

CREATE TABLE "admin_sessions" (
    "id" TEXT PRIMARY KEY,
    "adminId" TEXT NOT NULL REFERENCES "admin_users"("id") ON DELETE CASCADE,
    "token" TEXT NOT NULL UNIQUE,
    "expiresAt" TIMESTAMP NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### D2: Separate JWT Secret

**Decision:** 管理员 Token 使用独立的 `ADMIN_JWT_SECRET` 环境变量

**Rationale:**

- 即使用户 Token 泄露，也无法伪造管理员 Token
- Token payload 包含 `type: "admin"` 便于中间件快速识别
- 便于独立轮换管理员密钥而不影响用户

**Token Structure:**

```json
{
  "type": "admin",
  "adminId": "uuid",
  "iat": 1234567890,
  "exp": 1234567890
}
```

### D3: Broadcast Database Model

**Decision:** 创建 `broadcasts` 和 `broadcast_audit_logs` 表，复用现有 `notifications` 表存储持久化广播

**Rationale:**

- `broadcasts` 表存储广播元数据（不重复存储每个用户的副本）
- 持久化广播插入 `notifications` 表时设置 `broadcastId` 关联
- 审计日志单独存储便于合规查询

**Schema:**

```sql
CREATE TYPE "BroadcastTarget" AS ENUM ('all', 'online', 'group', 'user', 'users');
CREATE TYPE "BroadcastStatus" AS ENUM ('draft', 'sent', 'expired');

CREATE TABLE "broadcasts" (
    "id" TEXT PRIMARY KEY,
    "adminId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "target" "BroadcastTarget" NOT NULL,
    "targetFilter" JSONB,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "persistent" BOOLEAN NOT NULL DEFAULT FALSE,
    "expiresAt" TIMESTAMP,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'sent',
    "targetCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "broadcast_audit_logs" (
    "id" TEXT PRIMARY KEY,
    "broadcastId" TEXT NOT NULL REFERENCES "broadcasts"("id"),
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### D4: Online User Tracking

**Decision:** 扩展现有 `RealtimeHub` 添加 `online_users: HashSet<String>` 字段

**Rationale:**

- 复用现有 SSE 基础设施，无需引入新技术
- 利用 `SubscriptionGuard::drop` 自动清理离线用户
- 内存存储足够（单服务器部署场景）

**Implementation:**

```rust
pub struct RealtimeHub {
    sender: broadcast::Sender<RoutedEvent>,
    counter: AtomicU64,
    subscriptions: RwLock<HashMap<String, Subscription>>,
    user_index: RwLock<HashMap<String, HashSet<String>>>,
    session_index: RwLock<HashMap<String, HashSet<String>>>,
    online_users: RwLock<HashSet<String>>,  // NEW
}
```

### D5: Frontend Bundle Optimization Strategy

**Decision:** 采用渐进式优化策略，优先级如下

**Phase 1 (Quick Wins):**

1. React 外部化到 CDN（esm.sh 或 unpkg）
2. 修复空 Sentry vendor chunk
3. 添加关键资源 preload 标签

**Phase 2 (Code Splitting):**

1. 大型管理员组件（UserDetailPage 48KB）进一步拆分
2. 图表库按需加载

**Phase 3 (Advanced):**

1. 引入 @loadable/component 或 React.lazy with preload
2. 实施 Service Worker 缓存策略

**Trade-off:** CDN 外部化增加外部依赖风险，但显著减少 bundle 大小

## Risks / Trade-offs

| Risk                               | Mitigation                                      |
| ---------------------------------- | ----------------------------------------------- |
| 管理员迁移复杂性                   | 提供 CLI 迁移命令，保持旧端点 7 天兼容期        |
| CDN 可用性风险                     | 配置多个 CDN fallback，保留本地 bundle 作为后备 |
| 广播性能（大量用户）               | 使用 tokio::spawn 异步批量推送，避免阻塞主线程  |
| 在线用户追踪不精确（SSE 断开延迟） | 30s ping 心跳 + 60s 超时清理，可接受误差        |

## Migration Plan

### Phase 1: Schema Migration

1. 创建 `admin_users`, `admin_sessions`, `broadcasts`, `broadcast_audit_logs` 表
2. 添加 `notifications` 表的 `broadcastId` 字段

### Phase 2: Backend Implementation

1. 实现独立的管理员认证模块
2. 实现广播 API 和 SSE 推送
3. 迁移 CLI 命令支持

### Phase 3: Frontend Integration

1. 创建 `adminAuthStore` 和独立 AuthClient
2. AdminApp 使用独立认证状态
3. 实现广播通知 UI

### Phase 4: Performance Optimization

1. 配置 CDN 外部化
2. 添加 preload/prefetch 策略
3. 验证性能指标

### Phase 5: Migration & Cleanup

1. 运行管理员账户迁移命令
2. 监控 7 天兼容期
3. 移除旧代码路径

## Open Questions - RESOLVED

All open questions have been resolved. See `constraints.md` for full constraint specifications.

1. **管理员权限精细化** → **RESOLVED (C3)**
   - 决策：本期忽略 permissions 字段，所有管理员全权限
   - 字段保留为空数组 `[]`，后续迭代可扩展

2. **多服务器广播同步** → **RESOLVED (C7)**
   - 决策：本期仅支持单实例部署
   - 文档明确标注此限制，后续可引入 Redis

3. **广播撤回功能** → **RESOLVED (Not Implemented)**
   - 决策：本期不实现撤回
   - 通过 `expiresAt` 过期机制间接支持（C9: 过期后标记但不删除）

4. **迁移策略** → **RESOLVED (C1)**
   - 决策：CLI 自动迁移 + email 冲突时覆盖
   - 7 天兼容期后移除旧 ADMIN 角色支持

5. **Token 生命周期** → **RESOLVED (C2)**
   - 决策：accessToken=15min, refreshToken=7d
   - 与用户 Token 策略保持一致

6. **广播投递语义** → **RESOLVED (C6)**
   - 决策：At-least-once（先持久化，SSE 作为通知）
   - 客户端通过 API 拉取确认完整内容

7. **CDN 策略** → **RESOLVED (C8)**
   - 决策：纯本地 bundle + code splitting
   - 不使用 CDN 外部化，通过代码拆分优化

8. **性能指标** → **RESOLVED (C11)**
   - 决策：使用 spec 目标（vendor<50KB, initial<150KB gz）
   - 修正 proposal 中 300KB 的错误目标
