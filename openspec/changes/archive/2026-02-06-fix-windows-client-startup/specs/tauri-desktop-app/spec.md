## MODIFIED Requirements

### Requirement: Tauri 应用核心结构

系统 SHALL 提供完整的 Tauri 2.x 应用结构，位于 `packages/tauri-app/src-tauri/`。

#### Scenario: 核心文件存在

- **WHEN** 检查 `packages/tauri-app/src-tauri/` 目录
- **THEN** 存在 `Cargo.toml`, `src/main.rs`, `src/lib.rs`, `tauri.conf.json`

#### Scenario: Cargo 依赖正确

- **WHEN** 查看 `Cargo.toml` 依赖
- **THEN** 包含 `tauri`, `tauri-plugin-sql`, `tauri-plugin-store`, `tauri-plugin-http`, `sqlx`

#### Scenario: ACL Capabilities 配置存在

- **WHEN** 检查 `packages/tauri-app/src-tauri/capabilities/` 目录
- **THEN** 存在 `default.json` 文件
- **AND** 文件声明 `main` 窗口的 capability
- **AND** 包含 `core:default` 权限
- **AND** 包含所有已注册插件的 default 权限：`store:default`, `sql:default`, `http:default`, `window-state:default`, `single-instance:default`

### Requirement: 前端集成

系统 SHALL 将前端构建产物集成到 Tauri 应用中。

#### Scenario: 前端资源正确加载

- **WHEN** Tauri 应用启动
- **THEN** WebView 加载 `packages/frontend/dist/index.html`
- **AND** 所有静态资源使用相对路径（`./assets/...`）正确解析

#### Scenario: API 请求路由到命令层

- **WHEN** 前端发起 `/api/*` 请求
- **THEN** 请求被 Tauri 命令层拦截并处理
- **AND** 不发送实际 HTTP 请求

#### Scenario: 离线环境无外部网络请求

- **WHEN** Tauri 构建的 index.html 在无网络环境加载
- **THEN** 不发起任何外部网络请求（含 Google Fonts）
- **AND** 页面正常渲染，使用系统字体回退
- **AND** 字体剥离由独立 Vite 插件 `strip-external-fonts` 实现（检测 `TAURI_ENV_PLATFORM` 环境变量）
- **AND** Web 模式构建保留 Google Fonts 标签不受影响
