# Resolved Constraints: Admin Isolation, Broadcast & Performance

Date: 2026-01-27
Status: CONFIRMED

---

## C1: Admin Migration Strategy

**Decision:** CLI 自动迁移 + email 冲突时覆盖

**Details:**

- 运行 `cargo run -- migrate-admins` 命令将 `users.role='ADMIN'` 的记录迁移到 `admin_users`
- 当 email 已存在于 `admin_users` 时，用源 `users` 记录覆盖
- 迁移完成后，原 `users` 表中的管理员记录保留 7 天兼容期
- 兼容期后将 `users.role` 字段中的 `ADMIN` 值移除

**Constraint:**

```
MUST: migrate-admins CLI overwrites on email collision
MUST: 7-day grace period for legacy admin endpoints
MUST NOT: users.role='ADMIN' allowed after grace period
```

---

## C2: Admin Token Lifecycle

**Decision:** accessToken=15min, refreshToken=7d (与用户 Token 一致)

**Details:**

- Admin access token TTL: 900 seconds (15 minutes)
- Admin refresh token TTL: 604800 seconds (7 days)
- Token payload: `{ type: "admin", adminId, iat, exp }`
- 签名密钥: `ADMIN_JWT_SECRET` 环境变量

**Constraint:**

```
MUST: Admin access token exp - iat = 900s
MUST: Admin refresh token exp - iat = 604800s
MUST: Token payload contains type="admin"
MUST NOT: Admin token use JWT_SECRET (must use ADMIN_JWT_SECRET)
```

---

## C3: Permissions Field Handling

**Decision:** 忽略，所有管理员全权限

**Details:**

- `admin_users.permissions` JSONB 字段保留，默认值为 `[]`
- 本期不实现权限校验逻辑
- 所有已认证管理员拥有全部功能访问权限
- 后续迭代可扩展权限模型

**Constraint:**

```
MUST: permissions field default to empty array []
MUST: Authorization outcome independent of permissions content
MUST NOT: Any feature gated by permissions in this phase
```

---

## C4: Broadcast Group Definition

**Decision:** 基于订阅的词书

**Details:**

- `target: "group"` 时使用 `groupFilter: { wordbook: "CET4" }`
- 解析用户订阅的词书（`user_wordbooks` 表关联）
- 用户可能订阅多本词书，匹配任一即包含

**Constraint:**

```
MUST: Group target resolves to users subscribed to specified wordbook
MUST: Empty subscription list results in empty target set
MUST NOT: Group resolution include unsubscribed users
```

---

## C5: Broadcast Payload Limits

**Decision:** title≤100, content≤10000, userIds≤500

**Details:**

- title: 最大 100 字符（Unicode）
- content: 最大 10000 字符（Unicode）
- userIds (target: "users"): 最大 500 个 ID
- 超出限制返回 400 Bad Request

**Constraint:**

```
MUST: Reject title.len() > 100 with 400
MUST: Reject content.len() > 10000 with 400
MUST: Reject userIds.len() > 500 with 400
MUST: Error message specify which field exceeded
```

---

## C6: Broadcast Delivery Semantics

**Decision:** At-least-once (先持久化，SSE 作为通知，客户端拉取确认)

**Details:**

- 广播创建时先写入 `broadcasts` 表
- 持久化广播同步写入 `notifications` 表（每个目标用户一条）
- SSE 仅发送通知事件，不包含完整内容
- 客户端通过 `GET /api/notifications` 拉取完整内容
- 即使 SSE 失败，用户仍可通过 API 获取广播

**Constraint:**

```
MUST: Persistent broadcast written to DB before SSE attempt
MUST: Every target user can retrieve via GET /api/notifications
MUST: SSE event type = "admin-broadcast"
MUST: SSE payload minimal: { broadcastId, type: "new_broadcast" }
```

---

## C7: Deployment Scope

**Decision:** 单实例部署（不支持多实例）

**Details:**

- `online_users: RwLock<HashSet<String>>` 存储在内存
- 不引入 Redis 或分布式存储
- 多实例部署时在线用户追踪将不准确
- 文档中明确标注此限制

**Constraint:**

```
MUST: Document single-instance limitation
MUST NOT: online_users shared across instances
MUST NOT: Redis dependency introduced this phase
```

---

## C8: Frontend Bundle Strategy

**Decision:** 纯本地 bundle + code splitting（不使用 CDN 外部化）

**Details:**

- 不将 React 等库外部化到 CDN
- 通过 Vite manualChunks 拆分代码
- 实施路由级懒加载
- 重型组件（图表、编辑器）按需加载

**Constraint:**

```
MUST: All bundles served locally
MUST: App boots without external CDN access
MUST NOT: vite.config.ts external configuration for React
```

---

## C9: Broadcast Expiry Handling

**Decision:** 可见但标记过期

**Details:**

- `expiresAt` 到期后广播仍在 `notifications` 表中
- API 返回时包含 `expired: true` 标记
- 前端可选择是否显示/隐藏过期广播
- 不自动删除过期记录

**Constraint:**

```
MUST: Expired broadcasts remain in database
MUST: API response include expired=true for past expiry
MUST NOT: Auto-delete expired broadcast notifications
```

---

## C10: Admin Token Storage

**Decision:** localStorage key "admin_token"

**Details:**

- 前端使用 `localStorage.setItem("admin_token", token)`
- 与用户 token (`auth_token`) 完全独立
- 不使用 HttpOnly Cookie（与用户端保持一致）

**Constraint:**

```
MUST: Admin token stored under key "admin_token"
MUST: Admin auth reads only "admin_token"
MUST NOT: Admin token stored in "auth_token" key
MUST NOT: Admin auth reads from "auth_token"
```

---

## C11: Frontend Performance Targets

**Decision:** 使用 spec 文件目标

**Details:**

- react-vendor chunk: < 50KB gzipped
- 首屏 JavaScript: < 150KB gzipped
- LCP: < 1.5s (4G 网络)
- FCP: < 1.0s
- 无 >500KB chunk 警告

**Constraint:**

```
MUST: react-vendor gzipped < 50KB
MUST: Initial JS gzipped < 150KB
MUST: LCP < 1500ms on 4G
MUST NOT: Any chunk > chunkSizeWarningLimit
```

---

## C12: Legacy Admin Role Cleanup

**Decision:** 兼容期后移除 role='ADMIN' 支持

**Details:**

- 迁移后保留 7 天兼容期
- 兼容期内旧端点仍接受 `role='ADMIN'` 用户登录
- 兼容期后：
  - 旧认证端点拒绝 ADMIN 角色
  - 可选择清理 `users.role` 字段数据

**Constraint:**

```
MUST: 7-day grace period for legacy endpoints
MUST: After grace period, reject users.role='ADMIN' on all admin paths
MAY: Clean up role field data after migration confirmed
```

---

## PBT Properties Reference

### Admin Auth Invariants

| Property                      | Definition                        | Falsification                               |
| ----------------------------- | --------------------------------- | ------------------------------------------- |
| MigrationOverwriteDeterminism | 迁移两次产生相同 admin_users 集合 | 生成相同 email 不同数据的记录，验证迁移幂等 |
| AdminTokenTTLBounds           | access=15min, refresh=7d          | 生成非标准 TTL token，验证被拒绝            |
| AdminTokenTypeRoundTrip       | 编解码保留 type="admin"           | 修改 type 字段验证失败                      |
| TokenStorageKeyIsolation      | 仅读写 admin_token key            | 设置两个 key，验证仅读 admin_token          |
| AdminSessionSeparation        | 仅写 admin_sessions 表            | 登录登出序列验证无 sessions 表写入          |
| AdminAccessUserAPIRejection   | admin token 被用户 API 拒绝       | 用 admin token 调用用户 API 验证失败        |

### Broadcast Invariants

| Property                | Definition                        | Falsification                 |
| ----------------------- | --------------------------------- | ----------------------------- |
| BroadcastPayloadBounds  | title≤100, content≤10K, users≤500 | 超出限制验证 400              |
| GroupTargetResolution   | group 解析为订阅用户集合          | 随机订阅验证解析正确          |
| AtLeastOnceDelivery     | 持久化先于 SSE                    | 注入 SSE 失败验证 DB 仍有记录 |
| ExpiryVisibleButMarked  | 过期广播可见但标记                | 查询过期广播验证 expired=true |
| BroadcastAuditMonotonic | deliveredCount 单调递增           | 重放验证不递减                |

### Frontend Perf Invariants

| Property                   | Definition                    | Falsification    |
| -------------------------- | ----------------------------- | ---------------- |
| BundleSizeBounds           | vendor<50KB, initial<150KB gz | 构建验证大小     |
| CDNExternalizationDisabled | 无外部 CDN 依赖               | 离线启动验证成功 |
| ChunkWarningBound          | 无超限 chunk                  | 构建验证无警告   |
