# backend-rust（Strangler + 热备）

目标：用 Rust（Axum）替换现有 `packages/backend`（TS+Express），并保持 API 行为完全兼容。

当前阶段：

- Rust 端已具备热备链路（PostgreSQL + SQLite fallback + 变更日志 + 回灌同步 + 冲突处理 + fencing + 请求级 DB 状态固定）。
- 支持 Strangler：Rust 可作为入口服务，未迁移端点自动回退到 TS（需要配置 `LEGACY_BACKEND_URL`）。
- 已迁移端点（默认启用）：
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/users/me`
  - `GET /api/users/me/statistics`
  - `PUT /api/users/me/password`
  - `GET /api/words`
  - `POST /api/words`
  - `GET /api/words/search`
  - `GET /api/words/learned`
  - `POST /api/words/batch`
  - `POST /api/words/batch-delete`
  - `GET /api/words/:id`
  - `PUT /api/words/:id`
  - `DELETE /api/words/:id`
  - `GET /api/wordbooks/user`
  - `GET /api/wordbooks/system`
  - `GET /api/wordbooks/available`
  - `POST /api/wordbooks`
  - `GET /api/wordbooks/:id`
  - `PUT /api/wordbooks/:id`
  - `DELETE /api/wordbooks/:id`
  - `GET /api/wordbooks/:id/words`
  - `POST /api/wordbooks/:id/words`
  - `DELETE /api/wordbooks/:wordBookId/words/:wordId`
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`
  - `GET /api/v1/auth/verify`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/users/me`
  - `GET /api/v1/users/me/statistics`
  - `PUT /api/v1/users/me/password`

为保证“现有功能 0 丢失”，当配置了 `LEGACY_BACKEND_URL` 且 Rust 侧缺少关键依赖（如 `DATABASE_URL`/`JWT_SECRET`）或数据库不可用时，上述已迁移端点也会自动回退到 TS。

已实现但当配置 `LEGACY_BACKEND_URL` 时默认仍回退到 TS（可通过环境变量显式开启）：

- 学习配置：`RUST_ENABLE_STUDY_CONFIG=true`
- 记录：`RUST_ENABLE_RECORDS=true`
- 学习/学习状态/得分：`RUST_ENABLE_LEARNING=true`

## 运行

在仓库根目录：

```bash
cargo run --manifest-path "packages/backend-rust/Cargo.toml"
```

默认监听 `0.0.0.0:3000`，可用环境变量覆盖：

- `HOST`（默认 `0.0.0.0`）
- `PORT`（默认 `3000`）
- `RUST_LOG`（默认 `info`）
- `LEGACY_BACKEND_URL`（可选，设置后启用 TS 回退）
- `DATABASE_URL`（可选；启用 Rust 本地 DB/热备能力时需要，PostgreSQL 连接串）
- `JWT_SECRET`（可选；启用 Rust 本地认证端点时需要，HS256）
- `NODE_ENV`（可选；`production` 时 Cookie 增加 `Secure`）

SQLite 热备相关（可选）：

- `SQLITE_FALLBACK_ENABLED`（默认 `false`）
- `SQLITE_FALLBACK_PATH`（默认 `./data/fallback.db`，相对 `packages/backend-rust`）
- `DB_FENCING_ENABLED`（默认 `false`，开启后需 `REDIS_URL`）
- `REDIS_URL`（可选；fencing 使用）

## Strangler（Rust 入口回退 TS）

Rust 端配置 `LEGACY_BACKEND_URL` 后，所有未在 Rust 实现的路由会被反向代理到 TS 后端。

推荐本地验证方式：

- 启动 TS 后端：监听 `127.0.0.1:3000`
- 启动 Rust 后端：监听 `127.0.0.1:3001`，并配置 `LEGACY_BACKEND_URL="http://127.0.0.1:3000"`

注意：当 TS 位于 Rust 反代后面时，为了让限流/日志中的 `req.ip` 正常工作，需要在 TS 侧设置 `TRUST_PROXY=1`（Rust 会追加 `X-Forwarded-For`）。

Rust 当前对 `/health/*` 的策略：

- `/health/database`：由 Rust 直接响应（用于热备观测）
- 其它 `/health/*`：在配置 `LEGACY_BACKEND_URL` 时回退到 TS（避免语义漂移）

## 契约覆盖检查

以 `packages/backend/contract/api-contract.json`（344 endpoints）为基线，静态扫描 Rust 路由定义，输出覆盖率与缺失清单：

```bash
python3 "packages/backend-rust/scripts/contract_coverage.py" --show-missing
```
