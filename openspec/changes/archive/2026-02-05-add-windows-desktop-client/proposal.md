## Why

项目当前仅支持服务器部署模式，用户必须拥有 Linux 服务器、配置 PostgreSQL + Redis 才能使用。这对个人用户造成较高门槛。需要增加 Windows 本地客户端支持，让用户可以一键下载安装包、开箱即用地进行单词学习，无需任何服务器配置。

## What Changes

- **新增 Tauri 桌面应用核心**: 补全 `packages/tauri-app/src-tauri/` 缺失的 Rust 源文件 (Cargo.toml, src/main.rs, src/lib.rs)，将后端核心逻辑集成为 Tauri 命令
- **启用 SQLite 作为主存储**: 恢复 `packages/backend-rust/` 中被标记为 deprecated 的 SQLite 支持，实现纯 SQLite 运行模式
- **跨平台兼容适配**: 在 Windows 上禁用 Unix-only 功能 (OTA sockets, /proc 健康检查)，使用条件编译返回合理默认值
- **离线资源打包**: 将 WASM 模块和 MediaPipe 模型打包到 Tauri 应用内，实现完全离线运行
- **Windows 安装包构建**: 配置 NSIS 安装包生成和 GitHub Actions 多平台 CI/CD

## Capabilities

### New Capabilities

- `tauri-desktop-app`: Tauri 桌面应用核心结构，包含 Rust 命令层、前端集成、SQLite 数据库初始化
- `sqlite-primary-storage`: SQLite 作为主存储模式，包含迁移兼容层 (ENUM→TEXT, JSONB→TEXT) 和数据库初始化逻辑
- `offline-resource-bundle`: 离线资源打包策略，WASM 模块和 MediaPipe 模型的本地化集成
- `windows-build-pipeline`: Windows 平台构建流程，包含 NSIS 安装包配置和 GitHub Actions 工作流

### Modified Capabilities

- `backend-workers`: 后台 Worker 在桌面模式下的行为调整 (可选禁用或简化)

## Impact

**代码变更**:

- `packages/tauri-app/src-tauri/`: 新增 Cargo.toml, src/main.rs, src/lib.rs, src/commands/\*.rs
- `packages/backend-rust/src/db/`: 修改 mod.rs, 新增 sqlite_primary.rs
- `packages/backend-rust/src/routes/health.rs`: 条件编译适配 Windows
- `packages/frontend/vite.config.ts`: Tauri 构建配置调整

**依赖变更**:

- 新增: tauri, tauri-plugin-sql, tauri-plugin-store, tauri-plugin-http
- 可选: sysinfo (Windows 健康检查)

**构建产物**:

- Windows: `Danci_x.x.x_x64-setup.exe` (NSIS 安装包)
- 可选未来扩展: macOS .dmg, Linux .AppImage

**兼容性**:

- 服务器部署模式不受影响，继续使用 PostgreSQL + Docker
- 桌面模式为独立运行，数据存储在用户本地 SQLite 文件
