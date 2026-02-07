## REMOVED Requirements

### Requirement: Tauri 命令层桥接

**Reason**: Sidecar 架构下前端直接通过 HTTP 与 backend-rust 通信，不再需要 Tauri 命令层作为中间桥接
**Migration**: 前端 API 调用统一走 HTTP 客户端，目标为 `http://127.0.0.1:<sidecar_port>`

## MODIFIED Requirements

### Requirement: Tauri 应用核心结构

系统 SHALL 提供完整的 Tauri 2.x 应用结构，位于 `packages/tauri-app/src-tauri/`。

#### Scenario: 核心文件存在

- **WHEN** 检查 `packages/tauri-app/src-tauri/` 目录
- **THEN** 存在 `Cargo.toml`, `src/main.rs`, `src/lib.rs`, `tauri.conf.json`

#### Scenario: Cargo 依赖正确

- **WHEN** 查看 `Cargo.toml` 依赖
- **THEN** 包含 `tauri`, `tauri-plugin-store`, `tauri-plugin-http`, `tauri-plugin-shell`
- **AND** 不再包含 `tauri-plugin-sql` 和 `sqlx`（数据库由 sidecar 管理）

#### Scenario: ACL Capabilities 配置存在

- **WHEN** 检查 `packages/tauri-app/src-tauri/capabilities/` 目录
- **THEN** 存在 `default.json` 文件
- **AND** 文件声明 `main` 窗口的 capability
- **AND** 包含 `core:default` 权限
- **AND** 包含所有已注册插件的 default 权限：`store:default`, `http:default`, `window-state:default`, `single-instance:default`, `shell:default`
- **AND** 包含 `shell:allow-spawn` 权限，allow 列表包含 `{ "name": "binaries/danci-backend", "sidecar": true }`

### Requirement: 前端集成

系统 SHALL 将前端构建产物集成到 Tauri 应用中。

#### Scenario: 前端资源正确加载

- **WHEN** Tauri 应用启动
- **THEN** WebView 加载 `packages/frontend/dist/index.html`
- **AND** 所有静态资源使用相对路径（`./assets/...`）正确解析

#### Scenario: API 请求路由到 Sidecar

- **WHEN** 前端发起 API 请求
- **THEN** 请求通过 HTTP 发送到 `http://127.0.0.1:<sidecar_port>/api/*`
- **AND** 使用 `tauri-plugin-http` 发送跨域请求
- **AND** 不使用 Tauri invoke 进行 API 调用

#### Scenario: 离线环境无外部网络请求

- **WHEN** Tauri 构建的 index.html 在无网络环境加载
- **THEN** 不发起任何外部网络请求（含 Google Fonts）
- **AND** 页面正常渲染，使用系统字体回退
- **AND** 字体剥离由独立 Vite 插件 `strip-external-fonts` 实现（检测 `TAURI_ENV_PLATFORM` 环境变量）
- **AND** Web 模式构建保留 Google Fonts 标签不受影响

## ADDED Requirements

### Requirement: Sidecar 配置声明

系统 SHALL 在 `tauri.conf.json` 中声明 sidecar 二进制文件。

#### Scenario: externalBin 配置

- **WHEN** 检查 `tauri.conf.json` 的 `bundle` 字段
- **THEN** `externalBin` 数组包含 `"binaries/danci-backend"`

#### Scenario: 开发模式 sidecar

- **WHEN** 执行 `tauri dev`
- **THEN** 自动拉起 sidecar 进程（与生产模式一致）
- **AND** 开发体验与生产环境行为一致

### Requirement: 前端 API 基地址适配

系统 SHALL 在桌面模式下动态设置 API baseUrl 为 sidecar 地址。

#### Scenario: 桌面模式 baseUrl 设置

- **WHEN** 前端检测到 Tauri 环境 (`isTauriEnvironment() === true`)
- **THEN** 通过 `invoke('get_sidecar_port')` 获取端口号
- **AND** 设置 API baseUrl 为 `http://127.0.0.1:<port>`
- **AND** 后续所有 API 请求使用此 baseUrl

#### Scenario: Web 模式不受影响

- **WHEN** 前端运行在浏览器环境 (`isTauriEnvironment() === false`)
- **THEN** 使用 `VITE_API_URL` 环境变量或同源模式作为 baseUrl
- **AND** 行为与当前完全一致

### Requirement: 桌面模式认证跳过

系统 SHALL 在前端桌面模式下跳过登录流程。

#### Scenario: 桌面模式无需登录

- **WHEN** 前端检测到 Tauri 环境
- **THEN** 不显示登录页面
- **AND** 直接使用固定本地用户 (id=1, username="local_user")
- **AND** 不在 HTTP 请求中附加 Authorization header

### Requirement: Stub Commands 清理

系统 SHALL 移除已废弃的 Tauri stub commands，仅保留本地设置类命令。

#### Scenario: 移除学习相关 commands

- **WHEN** 检查 `src-tauri/src/commands/` 目录
- **THEN** 不存在 `learning.rs`, `statistics.rs`, `wordbooks.rs`

#### Scenario: 保留设置类 commands

- **WHEN** 检查 `src-tauri/src/commands/` 目录
- **THEN** 保留 `settings.rs`（基于 Tauri Store 的本地设置管理）
- **AND** `invoke_handler` 仅注册 `get_settings`, `update_settings`, `reset_window_layout`, `get_sidecar_port`
