## 1. Tauri ACL Capabilities 配置

- [x] 1.1 创建 `packages/tauri-app/src-tauri/capabilities/default.json`，声明 `main` 窗口的 capability，包含 `core:default`、`store:default`、`sql:default`、`http:default`、`window-state:default` 权限（`single-instance` 为纯后端插件，无需声明 IPC 权限）
- [x] 1.2 验证 `tauri.conf.json` 的 `security.capabilities` 字段无需额外修改（capabilities 目录下文件自动启用）

## 2. CI 前端构建环境变量修复

- [x] 2.1 修改 `.github/workflows/build-desktop.yml`，在 "Build frontend" 步骤添加 `env: TAURI_ENV_PLATFORM: windows`
- [x] 2.2 验证修改后 Vite 构建产物的 `index.html` 中资源引用为相对路径 `./assets/...`

## 3. 离线环境外部请求消除

- [x] 3.1 在 `packages/frontend/vite.config.ts` 中新增独立 Vite 插件 `strip-external-fonts`，当 `isTauri` 为 `true` 时通过 `transformIndexHtml` 剥离 `index.html` 中的 Google Fonts `<link>` 标签
- [x] 3.2 验证 Web 模式构建不受影响，Google Fonts 标签保留

## 4. 验证

- [ ] 4.1 触发 CI 构建，确认 Windows 安装包正常生成
- [ ] 4.2 安装并启动客户端，确认窗口正常显示且进入学习界面
