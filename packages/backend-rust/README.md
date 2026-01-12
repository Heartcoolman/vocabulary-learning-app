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

### SQLite 热备

- `SQLITE_FALLBACK_ENABLED`（默认 `false`）
- `SQLITE_FALLBACK_PATH`（默认 `./data/fallback.db`）
- `DB_FENCING_ENABLED`（默认 `false`，需 `REDIS_URL`）

## 健康检查

- `/health` - 综合状态
- `/health/live` - 存活探针
- `/health/ready` - 就绪探针
- `/health/database` - 数据库状态
