## Why

当前 Tauri 桌面应用的命令层 (`packages/tauri-app/src-tauri/src/commands/`) 是一组未实现的 stub，全部返回 `"Not implemented"`。后端 (`packages/backend-rust/`) 是一个完整的 Axum HTTP 服务，包含 35+ 路由组、AMAS 自适应学习算法、后台 Worker 等核心功能。逐一将这些能力重新实现为 Tauri commands 工作量巨大且产生大量重复代码。将 backend-rust 编译为独立可执行文件并作为 Tauri sidecar 进程管理，前端通过 localhost HTTP 通信，可以零重复代码实现桌面端全功能覆盖。

## What Changes

- Tauri 应用启动时自动拉起 backend-rust sidecar 进程，应用退出时终止
- Sidecar 绑定 `127.0.0.1` 动态端口，Tauri 将端口信息传递给前端 WebView
- 后端新增桌面模式检测：无 `JWT_SECRET` 环境变量时跳过所有认证中间件，所有请求视为固定本地用户 (id=1, username=local_user)
- 前端桌面模式下使用 sidecar URL 作为 API baseUrl，复用现有 HTTP 客户端层
- 移除当前 Tauri stub commands（learning、statistics、wordbooks），保留 Tauri Store 相关 commands（settings、window layout）
- 构建流程将 sidecar 二进制文件打包进安装包

## Capabilities

### New Capabilities

- `sidecar-lifecycle`: Tauri 管理 backend-rust sidecar 进程的完整生命周期（启动、健康检查、端口分配、关闭）
- `desktop-auth-bypass`: 后端桌面模式认证绕过，检测无 JWT_SECRET 时注入固定本地用户

### Modified Capabilities

- `tauri-desktop-app`: 移除 stub commands，新增 sidecar 配置与端口传递命令
- `windows-build-pipeline`: 构建流程新增 sidecar 二进制编译与打包步骤

## Impact

- **后端** (`packages/backend-rust/`): 认证中间件增加桌面模式分支；`Config` 增加桌面模式字段
- **Tauri 应用** (`packages/tauri-app/`): `lib.rs` 重构为 sidecar 管理器；移除 `commands/learning.rs`、`commands/statistics.rs`、`commands/wordbooks.rs`；`tauri.conf.json` 增加 sidecar 声明
- **前端** (`packages/frontend/`): `env.ts` / `tauri-bridge.ts` 适配 sidecar URL 注入；移除桌面模式下对 Tauri invoke 的依赖（API 调用统一走 HTTP）
- **构建流程** (`.github/workflows/`): CI 增加 sidecar 交叉编译步骤；安装包体积预估增加 ~5-8MB（Rust 静态链接二进制）
- **依赖**: Tauri sidecar API (`tauri::process::Command`)；无新增外部 crate
