# Danci Backend (Rust)

Danci 的后端服务，基于 Rust + Axum 构建。

## 特性

- **高性能**：Rust + Tokio 异步运行时
- **数据库热备**：PostgreSQL 主库 + SQLite 降级回退
- **完整 API**：35+ 路由组，100% 功能覆盖
- **AMAS 引擎**：自适应学习算法（LinUCB/Thompson/ACT-R）
- **后台 Worker**：延迟奖励、遗忘预警、优化周期、LLM 顾问

## 运行

在仓库根目录：

```bash
cargo run --manifest-path "packages/backend-rust/Cargo.toml"
```

默认监听 `0.0.0.0:3000`，可用环境变量覆盖：

### 必需

- `DATABASE_URL`：PostgreSQL 连接串
- `JWT_SECRET`：JWT 签名密钥（HS256）

### 可选

- `HOST`（默认 `0.0.0.0`）
- `PORT`（默认 `3000`）
- `RUST_LOG`（默认 `info`）
- `NODE_ENV`（`production` 时 Cookie 增加 `Secure`）
- `REDIS_URL`：Redis 连接串（缓存、fencing）

### 邮件服务（密码重置）

- `EMAIL_PROVIDER`：邮件服务提供商（`smtp` | `sendgrid` | `mock`）
- `EMAIL_FROM`：发件人地址（默认 `noreply@danci.app`）

**SMTP 配置：**

- `SMTP_HOST`：SMTP 服务器地址
- `SMTP_PORT`：SMTP 端口（默认 `587`）
- `SMTP_USER`：SMTP 用户名
- `SMTP_PASSWORD`：SMTP 密码

**SendGrid 配置：**

- `SENDGRID_API_KEY`：SendGrid API 密钥

### SQLite 热备

- `SQLITE_FALLBACK_ENABLED`（默认 `false`）
- `SQLITE_FALLBACK_PATH`（默认 `./data/fallback.db`）
- `DB_FENCING_ENABLED`（默认 `false`，需 `REDIS_URL`）

### 主题聚类 Worker（可选）

- `WORKER_LEADER`：主实例启用 Worker（默认 `false`）
- `ENABLE_CLUSTERING_WORKER`：启用主题聚类任务（默认 `false`）
- `CLUSTERING_SCHEDULE`：Cron 表达式（默认 `0 0 4 * * 0`）
- `CLUSTERING_MIN_COVERAGE`：最小向量覆盖率（默认 `0.5`）
- `CLUSTERING_KNN_K`：kNN 邻居数（默认 `5`）
- `CLUSTERING_DISTANCE_THRESHOLD`：距离阈值（默认 `0.25`）

## 健康检查

- `/health` - 综合状态
- `/health/live` - 存活探针
- `/health/ready` - 就绪探针
- `/health/database` - 数据库状态

## 管理员管理

### 创建管理员

使用 `seed-admin` 命令创建新管理员：

```bash
cargo run --manifest-path "packages/backend-rust/Cargo.toml" -- seed-admin \
  --username "admin" \
  --email "admin@example.com" \
  --password "your-secure-password"
```

输出：

- `ADMIN_CREATED` - 创建成功
- `ADMIN_EXISTS` - 邮箱已存在

### 迁移旧管理员

如果从旧版本升级，使用 `migrate-admins` 命令将 `users` 表中 `role='ADMIN'` 的用户迁移到独立的 `admin_users` 表：

```bash
cargo run --manifest-path "packages/backend-rust/Cargo.toml" -- migrate-admins
```

该命令会：

1. 查询 `users` 表中所有 `role='ADMIN'` 的用户
2. 将其复制到 `admin_users` 表（邮箱冲突时更新）
3. 输出迁移结果

### 管理员认证

管理员使用独立的认证端点：

- `POST /api/admin/auth/login` - 管理员登录
- `POST /api/admin/auth/logout` - 管理员登出
- `GET /api/admin/auth/me` - 获取当前管理员信息

管理员 Token 与普通用户 Token 完全隔离，使用独立的 JWT Secret（`ADMIN_JWT_SECRET`）。
