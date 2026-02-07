## Context

当前 Windows 桌面客户端（Tauri 2.x）安装后无法启动。进程双击后无窗口、无报错、任务管理器中无进程残留。

现状：

- `packages/tauri-app/src-tauri/capabilities/` 目录不存在
- `tauri.conf.json` 中 `security.capabilities: []` 为空
- CI 构建前端时未设置 `TAURI_ENV_PLATFORM`，导致 Vite 以 Web 模式构建（`base: '/'`）
- `main.rs` 使用 `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`，生产模式下所有 panic 静默消失

## Goals / Non-Goals

**Goals:**

- 应用双击后正常显示主窗口并进入学习界面
- 所有 Tauri 插件（store、sql、http、window-state、single-instance）的 IPC 调用正常工作
- CI 构建产物的前端资源路径正确（相对路径）

**Non-Goals:**

- 不修改前端业务逻辑
- 不改变插件选型或 Tauri 版本
- 不添加新功能

## Decisions

### Decision 1: 创建独立 capability 文件而非内联到 tauri.conf.json

Tauri 2 支持两种方式声明 capabilities：在 `src-tauri/capabilities/` 目录下创建 JSON 文件（自动启用），或在 `tauri.conf.json` 的 `security.capabilities` 数组中内联。

选择文件方式：

- 可读性好，capability 配置独立于主配置
- 便于后续按平台拆分（desktop/mobile）
- 符合 Tauri 官方推荐实践

### Decision 2: CI 中通过环境变量标记 Tauri 构建

在 `.github/workflows/build-desktop.yml` 的 "Build frontend" 步骤设置 `TAURI_ENV_PLATFORM=windows`，使 `vite.config.ts` 中 `isTauri` 为 `true`，从而 `base` 设为 `'./'`。

备选方案：将前端构建移入 `tauri.conf.json` 的 `beforeBuildCommand`，让 tauri-action 自动处理。不采用此方案，因为当前架构有意将前端构建与 Tauri 构建解耦，保持灵活性。

### Decision 3: 移除 index.html 中的外部 Google Fonts 请求

桌面客户端定位为离线优先，外部字体请求在无网络环境下毫无意义且可能拖慢启动。改为仅依赖系统字体回退（Inter 已通过 Tailwind 的 `font-sans` 栈覆盖）。此变更仅影响 Tauri 构建的 index.html。

考虑到 index.html 是 Web 和 Tauri 共用的，改为条件化处理：在 Vite 构建中新增独立插件 `strip-external-fonts`，检测 `TAURI_ENV_PLATFORM`，Tauri 模式下通过 `transformIndexHtml` 从 HTML 中剥离外部字体标签。

## Risks / Trade-offs

- **[风险] capability 权限过宽** → 当前使用各插件的 `default` 权限集，属于最小合理权限。后续如需收紧，可精确列举允许的命令。
- **[风险] 环境变量 `TAURI_ENV_PLATFORM` 需与 Tauri CLI 行为一致** → 仅在 CI 的 "Build frontend" 步骤中手动设置，不影响 tauri-action 的自动构建流程。
- **[风险] 移除 Google Fonts 影响 Web 端** → 不会。通过 Vite 插件条件化剥离，仅 Tauri 构建受影响。
