## Context

Tauri 桌面应用 (`packages/tauri-app/`) 当前通过 Tauri commands 层桥接后端功能，但 `commands/learning.rs`、`commands/statistics.rs`、`commands/wordbooks.rs` 均为返回 `"Not implemented"` 的 stub。后端 (`packages/backend-rust/`) 是完整的 Axum HTTP 服务，包含 35+ 路由组、AMAS 引擎、后台 Worker 等。

本设计将 backend-rust 编译为独立二进制，由 Tauri 以 sidecar 进程管理，前端通过 `http://127.0.0.1:<port>` 与之通信，消除代码重复。

**现有关键结构：**

- `backend-rust/src/main.rs`: `Config::from_env()` 读取 HOST/PORT，`TcpListener::bind(addr)` 绑定端口，目前不输出端口信息
- `backend-rust/src/config.rs`: `Config { host, port, log_level }`，PORT 默认 3000
- `backend-rust/src/middleware/auth.rs`: `require_auth` / `optional_auth` 读取 JWT token 并验证
- `backend-rust/src/routes/admin/auth.rs`: `require_admin_auth` 读取 Bearer token 验证管理员会话
- `backend-rust/src/auth.rs`: JWT HS256 验证依赖 `JWT_SECRET` 环境变量
- `tauri-app/src-tauri/src/lib.rs`: 注册 `tauri-plugin-sql`, `tauri-plugin-store`, `tauri-plugin-http`, `tauri-plugin-window-state`, `tauri-plugin-single-instance`
- `frontend/src/config/env.ts`: `resolveApiUrl()` 从 `VITE_API_URL` 解析 baseUrl，空值走同源
- `frontend/src/utils/tauri-bridge.ts`: `isTauriEnvironment()` 检测 `__TAURI__`，`apiCall()` 尝试 Tauri invoke 失败后回退 HTTP

## Goals / Non-Goals

**Goals:**

- backend-rust 作为 sidecar 在 Tauri 启动时自动拉起、退出时终止
- 动态端口分配 + stdout 协议通信端口号
- 桌面模式下认证绕过（无 JWT_SECRET → 跳过所有 auth 中间件）
- 桌面模式下禁用后台 Worker 和 Redis
- 前端桌面模式使用 sidecar HTTP 地址，统一走 HTTP 客户端
- 移除 Tauri stub commands，保留 settings/window 相关命令
- CI 构建流程新增 sidecar 编译与打包步骤

**Non-Goals:**

- 不实现 Tauri 与 sidecar 的 IPC 通信（纯 HTTP）
- 不做跨平台 sidecar 构建（当前仅 Windows x86_64）
- 不实现 sidecar 自动更新机制
- 不调整后端 API 接口本身

## Decisions

### D1: Sidecar 端口分配 — OS 随机端口 + stdout 协议

传递 `PORT=0` 让 OS 分配可用端口。`TcpListener::bind` 后通过 `listener.local_addr()` 获取实际端口，向 stdout 输出 `LISTENING_PORT=<port>`。Tauri 主进程逐行解析 stdout 匹配该行。

**为何不用固定端口**: 固定端口可能被占用，造成启动失败。
**为何不用 IPC/Unix socket**: Windows 兼容性差，HTTP 方案零改动复用所有路由。
**为何不用 named pipe**: Axum/hyper 不原生支持 Windows named pipe，引入额外复杂度。

### D2: 桌面模式检测 — `JWT_SECRET` 环境变量缺失

`Config::from_env()` 新增 `desktop_mode: bool` 字段，当 `JWT_SECRET` 未设置时为 `true`。此字段通过 `AppState` 传播到中间件。

**为何不用独立 flag（如 `DESKTOP_MODE=1`）**: 减少配置面。`JWT_SECRET` 缺失本身就意味着无法做 JWT 验证，是天然的模式切换信号。且 Tauri 不传递该变量即可触发，无需额外配置。

### D3: 认证绕过实现 — 中间件顶部短路

在 `require_auth`、`optional_auth`、`require_admin_auth` 三个中间件函数顶部检查 `state.config().desktop_mode`。若为 `true`，直接注入固定用户 `AuthUser { id: 1, username: "local_user" }` 到请求扩展中并放行，不执行任何 token 检查。

管理员认证绕过同理，`require_admin_auth` 在桌面模式下注入管理员用户信息。

**为何不用条件路由/独立中间件栈**: 改动范围大，容易遗漏路由。在现有中间件顶部加一个 `if` 分支是最小化改动。

### D4: Worker / Redis 禁用 — 条件初始化

`main.rs` 中 `WorkerManager::new()` 和 `RedisCache::connect()` 的初始化逻辑已有容错（`Option` 类型）。桌面模式下直接跳过 `WorkerManager` 初始化。Redis 方面，不传 `REDIS_URL` 环境变量即自动跳过（现有逻辑已处理）。

### D5: CSRF 中间件 — 桌面模式跳过

`csrf_validation_middleware` 在桌面模式下跳过验证。原因：sidecar 仅绑定 `127.0.0.1`，无跨站攻击面；前端通过 `tauri-plugin-http` 发请求不携带浏览器 cookie/CSRF token。

### D6: 前端 API 基地址 — Tauri invoke 获取端口

新增 Tauri command `get_sidecar_port` 返回 sidecar 端口号。前端 `env.ts` 在 Tauri 环境下调用此命令，构造 `http://127.0.0.1:<port>` 作为 apiUrl。`tauri-bridge.ts` 中的 `apiCall` 简化：桌面模式下所有 API 调用统一走 HTTP，不再尝试 Tauri invoke（废弃 stub commands 后无需回退逻辑）。

### D7: Sidecar 生命周期管理 — tauri-plugin-shell

使用 `tauri-plugin-shell` 的 `Command::sidecar("binaries/danci-backend")` 拉起进程。通过 `.envs()` 传递 `HOST=127.0.0.1` 和 `PORT=0`（不传 `DATABASE_URL`、`JWT_SECRET`、`REDIS_URL`）。

启动流程：spawn → 监听 stdout 解析 `LISTENING_PORT=(\d+)` → 健康检查 `GET /api/health` → 标记就绪。

崩溃恢复：监听 `CommandEvent::Terminated`，异常退出时等待 2 秒后重启，最多 3 次。

优雅关闭：`on_window_event(CloseRequested)` 时 kill sidecar 进程。

### D8: Tauri 插件调整 — 移除 sql，新增 shell

移除 `tauri-plugin-sql` 和 `sqlx` 依赖（数据库由 sidecar 管理）。新增 `tauri-plugin-shell` 依赖。`capabilities/default.json` 中移除 `sql:default`，新增 `shell:default` 和 `shell:allow-spawn`（带 sidecar 白名单）。

### D9: CI 构建流程 — sidecar 先编译再打包

在 `build-desktop.yml` 的 `tauri build` 步骤之前，新增步骤：

1. `cargo build --release --manifest-path packages/backend-rust/Cargo.toml --target x86_64-pc-windows-msvc`
2. 将产物复制到 `packages/tauri-app/src-tauri/binaries/danci-backend-x86_64-pc-windows-msvc.exe`

Tauri 的 `externalBin` 配置会自动将该文件打包进 NSIS 安装包。

## Risks / Trade-offs

**[安装包体积增加 ~5-8MB]** → 可接受范围。sidecar 是 Rust 静态链接二进制，体积相对小。

**[双进程内存占用]** → Tauri 主进程轻量（~30MB），sidecar 内存取决于数据库连接和缓存。桌面模式无 Redis、无 Worker，内存占用有限。

**[sidecar 启动延迟]** → 通过健康检查轮询（200ms 间隔）确认就绪后才通知前端。前端可显示 loading 状态。

**[端口被防火墙拦截]** → 仅绑定 `127.0.0.1`，不涉及外部网络。Windows 防火墙不拦截 loopback 流量。

**[sidecar 崩溃导致功能不可用]** → 自动重启机制（3 次），超限后弹窗提示用户重启应用。

**[桌面模式认证绕过的安全性]** → 桌面模式下 sidecar 仅监听 `127.0.0.1`，同机其他进程理论上可访问。但这是单用户桌面应用场景，风险可接受。
