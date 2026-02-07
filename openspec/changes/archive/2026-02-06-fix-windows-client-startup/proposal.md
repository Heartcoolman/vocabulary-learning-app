## Why

Windows 桌面客户端安装后双击无法启动——无窗口、无报错、任务管理器中无进程残留。根因是两个构建/配置缺陷叠加导致应用启动即崩溃：

1. **Tauri 2 ACL Capabilities 配置缺失**：`packages/tauri-app/src-tauri/capabilities/` 目录不存在，`tauri.conf.json` 中 `security.capabilities` 为空数组。Tauri 2 的权限系统要求窗口必须通过 capability 文件声明可访问的 IPC 命令和插件权限，否则窗口对 IPC 层零访问，导致进程初始化失败后静默退出。
2. **CI 前端构建缺少 `TAURI_ENV_PLATFORM` 环境变量**：`.github/workflows/build-desktop.yml` 中单独执行 `pnpm --filter @danci/frontend build` 时未设置该变量，导致 `vite.config.ts` 中 `isTauri` 为 `false`，`base` 被设为绝对路径 `'/'` 而非相对路径 `'./'`。Tauri 通过 `tauri://localhost/` 协议加载前端资源，绝对路径导致所有 JS/CSS 资源 404。

## What Changes

- 新增 `packages/tauri-app/src-tauri/capabilities/default.json`，声明 `main` 窗口对 core 及所有已注册插件（store、sql、http、window-state、single-instance）的访问权限
- 修改 `.github/workflows/build-desktop.yml`，在 "Build frontend" 步骤设置 `TAURI_ENV_PLATFORM=windows` 环境变量，使 Vite 使用相对路径构建
- 修改 `packages/frontend/index.html`，将外部 Google Fonts 请求在 Tauri 构建时移除或改为条件加载，避免离线环境下的网络请求

## Capabilities

### New Capabilities

（无新增能力）

### Modified Capabilities

- `tauri-desktop-app`: 补充 Tauri 2 ACL capabilities 配置要求，确保 main 窗口具备完整的 IPC 访问权限
- `windows-build-pipeline`: 修正 CI 构建流程，确保前端构建时正确识别 Tauri 环境

## Impact

**代码变更**:

- `packages/tauri-app/src-tauri/capabilities/default.json`（新增文件）
- `.github/workflows/build-desktop.yml`（修改 Build frontend 步骤）
- `packages/frontend/index.html`（条件化外部字体加载）

**影响范围**: 仅影响 Windows 桌面客户端构建和启动流程，不影响 Web 端功能。
