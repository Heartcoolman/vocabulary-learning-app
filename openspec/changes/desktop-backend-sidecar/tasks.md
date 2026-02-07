## 1. 后端桌面模式基础

- [x] 1.1 `Config` 新增 `desktop_mode: bool` 字段，`JWT_SECRET` 未设置时为 `true`；通过 `AppState` 暴露该字段
- [x] 1.2 `main.rs` 桌面模式下跳过 `WorkerManager` 初始化
- [x] 1.3 `main.rs` 在 `TcpListener::bind` 后通过 `listener.local_addr()` 获取实际端口，向 stdout 输出 `LISTENING_PORT=<port>`

## 2. 后端认证绕过

- [x] 2.1 `middleware/auth.rs` 的 `require_auth` 顶部检查 `desktop_mode`，为 `true` 时注入固定 `AuthUser { id: 1, username: "local_user" }` 并放行
- [x] 2.2 `middleware/auth.rs` 的 `optional_auth` 同理添加桌面模式短路
- [x] 2.3 `routes/admin/auth.rs` 的 `require_admin_auth` 添加桌面模式短路，注入管理员用户
- [x] 2.4 `middleware/csrf.rs` 的 `csrf_validation_middleware` 桌面模式下跳过验证
- [x] 2.5 桌面模式首次启动时自动创建固定本地用户记录（id=1, username=local_user），确保数据库一致性

## 3. Tauri 应用重构

- [x] 3.1 `Cargo.toml` 移除 `tauri-plugin-sql` 和 `sqlx` 依赖，新增 `tauri-plugin-shell` 和 `reqwest`（健康检查用）
- [x] 3.2 删除 `commands/learning.rs`、`commands/statistics.rs`、`commands/wordbooks.rs`，更新 `commands/mod.rs`
- [x] 3.3 新增 `commands/sidecar.rs`，实现 `get_sidecar_port` 命令（从应用状态读取端口，未就绪时返回错误）
- [x] 3.4 `lib.rs` 重构：移除 `tauri-plugin-sql`，新增 `tauri-plugin-shell`；`invoke_handler` 仅注册 `get_settings`、`update_settings`、`reset_window_layout`、`get_sidecar_port`
- [x] 3.5 `lib.rs` 在 `setup` 中实现 sidecar 启动逻辑：`Command::sidecar("binaries/danci-backend")` + envs(HOST, PORT=0) + stdout 端口解析 + 健康检查轮询 + 状态存储
- [x] 3.6 `lib.rs` 实现崩溃恢复：监听 `CommandEvent::Terminated`，异常退出时延迟 2 秒重启，最多 3 次，超限弹窗提示
- [x] 3.7 `lib.rs` 实现优雅关闭：窗口关闭事件中终止 sidecar 进程

## 4. Tauri 配置更新

- [x] 4.1 `tauri.conf.json` 的 `bundle` 字段新增 `"externalBin": ["binaries/danci-backend"]`
- [x] 4.2 `capabilities/default.json` 移除 `sql:default`，新增 `shell:default` 和 `shell:allow-spawn`（含 sidecar 白名单 `{ "name": "binaries/danci-backend", "sidecar": true }`）

## 5. 前端适配

- [x] 5.1 `tauri-bridge.ts` 新增 `getSidecarPort()` 函数，调用 `invoke('get_sidecar_port')` 返回端口号
- [x] 5.2 `env.ts` 的 `resolveApiUrl` 适配桌面模式：Tauri 环境下调用 `getSidecarPort()` 构造 `http://127.0.0.1:<port>` 作为 apiUrl
- [x] 5.3 `tauri-bridge.ts` 简化 `apiCall`：移除 Tauri invoke 回退逻辑（桌面模式下所有 API 统一走 HTTP）
- [x] 5.4 前端桌面模式下跳过登录流程，直接使用固定本地用户

## 6. CI 构建流程

- [x] 6.1 `build-desktop.yml` 在 `tauri build` 步骤之前新增 sidecar 编译步骤：`cargo build --release --manifest-path packages/backend-rust/Cargo.toml --target x86_64-pc-windows-msvc`
- [x] 6.2 新增步骤将编译产物复制到 `packages/tauri-app/src-tauri/binaries/danci-backend-x86_64-pc-windows-msvc.exe`
