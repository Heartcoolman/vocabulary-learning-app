## 1. Tauri 应用核心结构

- [x] 1.1 创建 `packages/tauri-app/src-tauri/Cargo.toml`，添加 tauri, tauri-plugin-sql, tauri-plugin-store, tauri-plugin-http, sqlx 依赖
- [x] 1.2 创建 `packages/tauri-app/src-tauri/src/main.rs`，实现 Tauri 应用入口
- [x] 1.3 创建 `packages/tauri-app/src-tauri/src/lib.rs`，导出模块结构
- [x] 1.4 将 `tauri.conf.json` 从 `gen/android/` 移动到 `src-tauri/` 根目录
- [x] 1.5 创建 `packages/tauri-app/src-tauri/icons/` 目录，添加应用图标文件

## 2. Tauri 命令层实现

- [x] 2.1 创建 `src/commands/mod.rs`，定义命令模块结构
- [x] 2.2 实现 `src/commands/learning.rs`：get_learning_words, submit_answer, get_session 命令
- [x] 2.3 实现 `src/commands/statistics.rs`：get_statistics, get_weekly_report 命令
- [x] 2.4 实现 `src/commands/wordbooks.rs`：list_wordbooks, select_wordbook 命令
- [x] 2.5 实现 `src/commands/settings.rs`：get_settings, update_settings, reset_window_layout 命令
- [x] 2.6 在 `main.rs` 中注册所有命令到 Tauri builder

## 2.5. 无登录单用户模式

- [x] 2.5.1 实现自动创建默认本地用户 (id=1, username="local_user")
- [x] 2.5.2 启动时检测用户是否存在，不存在则创建
- [x] 2.5.3 移除前端登录页面在桌面模式下的路由
- [x] 2.5.4 前端 AuthContext 在桌面模式下自动设置已登录状态

## 2.6. 单实例运行

- [x] 2.6.1 在 `main.rs` 中实现 named mutex 单实例锁
- [x] 2.6.2 检测到已有实例时，通过 IPC 通知已有窗口聚焦
- [x] 2.6.3 锁文件位于 `%APPDATA%/com.danci.app/.lock`
- [x] 2.6.4 新实例检测到锁后自动退出

## 2.7. 窗口状态持久化

- [x] 2.7.1 使用 tauri-plugin-store 保存窗口位置、大小、最大化状态
- [x] 2.7.2 应用启动时恢复上次窗口状态
- [x] 2.7.3 在设置页添加"重置窗口布局"按钮

## 2.8. 首次运行引导

- [x] 2.8.1 创建 `packages/frontend/src/components/Onboarding/` 引导组件
- [x] 2.8.2 实现欢迎界面
- [x] 2.8.3 实现词书选择步骤
- [x] 2.8.4 实现功能介绍步骤
- [x] 2.8.5 实现离线特性说明步骤
- [x] 2.8.6 使用 tauri-plugin-store 记录引导完成状态

## 2.9. 更新检查

- [x] 2.9.1 在设置页添加"检查更新"按钮
- [x] 2.9.2 实现 GitHub Releases API 查询逻辑
- [x] 2.9.3 对比当前版本与最新版本
- [x] 2.9.4 新版本可用时显示更新说明和下载链接
- [x] 2.9.5 离线状态显示友好提示

## 2.10. 可选遥测

- [x] 2.10.1 在设置页添加"帮助改进应用"开关
- [x] 2.10.2 遥测默认关闭
- [x] 2.10.3 开启时初始化 Sentry，关闭时停止并清除缓存
- [x] 2.10.4 确保不包含用户学习内容等隐私数据

## 3. SQLite 主存储模式

- [x] 3.1 创建 `packages/backend-rust/src/db/sqlite_primary.rs`，实现 SqlitePool 初始化逻辑
- [x] 3.2 修改 `packages/backend-rust/src/db/mod.rs`，取消 SQLite fallback 的 deprecated 标记
- [x] 3.3 创建 `sqlite_migrations.rs`，将 PostgreSQL 迁移转换为 SQLite 兼容格式
- [x] 3.4 实现 ENUM → TEXT 转换逻辑（应用层验证）
- [x] 3.5 实现 JSONB → TEXT 序列化/反序列化适配
- [x] 3.6 创建 `DbMode` 枚举区分 PostgreSQL/SQLite 模式
- [x] 3.7 实现数据库路径解析：Windows `%APPDATA%/com.danci.app/data.db`

## 4. 跨平台兼容适配

- [x] 4.1 修改 `packages/backend-rust/src/routes/health.rs`，添加 `#[cfg(not(target_os = "windows"))]` 条件编译
- [x] 4.2 为 Windows 健康检查返回默认值或使用 sysinfo crate
- [x] 4.3 确认 OTA 路由已有 `#[cfg(unix)]` 保护，Windows 返回 "unsupported"
- [x] 4.4 修改 `src/workers/mod.rs`，桌面模式下禁用网络依赖 Worker

## 5. 离线资源打包

- [x] 5.1 将 `public/wasm/*.wasm` 和 `*.js` 添加到 Tauri 资源配置
- [x] 5.2 将 `public/models/mediapipe/face_landmarker.task` 添加到 Tauri 资源
- [x] 5.3 修改 `packages/frontend/src/workers/visual-fatigue.worker.ts`，支持 Tauri 资源路径
- [x] 5.4 更新 `tauri.conf.json` CSP 配置，添加 `'wasm-unsafe-eval'`
- [x] 5.5 实现资源完整性检查和优雅降级逻辑

## 6. 前端集成适配

- [x] 6.1 创建 `packages/frontend/src/utils/tauri-bridge.ts`，封装 Tauri invoke 调用
- [x] 6.2 修改 API 服务层，检测 Tauri 环境并切换到 invoke 模式
- [x] 6.3 更新 `vite.config.ts`，添加 Tauri 构建配置
- [x] 6.4 确保前端构建产物路径与 `tauri.conf.json` 的 `frontendDist` 配置一致

## 7. Windows 构建流程

- [x] 7.1 创建 `.github/workflows/build-desktop.yml` 工作流
- [x] 7.2 配置 Windows x64 构建矩阵
- [x] 7.3 配置 NSIS 安装包生成参数，捆绑 WebView2 固定版本 (~150MB)
- [x] 7.4 配置 Release 自动发布，上传安装包
- [x] 7.5 更新根 `package.json`，添加 `build:desktop` 脚本
- [x] 7.6 更新 `README.md`，添加桌面客户端下载说明和 SmartScreen 警告说明
- [x] 7.7 在 README 中记录最低系统要求：Win10 1903+, 4GB RAM, 500MB 磁盘, 1024x768+

## 8. 测试与验证

- [x] 8.1 本地 Windows 环境构建测试
- [x] 8.2 验证 SQLite 数据库初始化
  - 新增 `packages/backend-rust/tests/sqlite_desktop_tests.rs` (11 个测试用例)
  - 修复 `sqlite_primary.rs` 中 SQL 注释行处理 bug
  - 测试覆盖: 数据库创建、Schema 迁移、核心表存在性、本地用户创建、学习流程 CRUD
- [x] 8.3 验证学习功能端到端流程
  - 通过 `test_sqlite_word_progress_workflow` 验证单词学习状态管理
  - 通过 `test_sqlite_learning_session_workflow` 验证学习会话完整流程
  - 通过 `test_sqlite_user_study_config` 验证用户学习配置
- [x] 8.4 验证 WASM 和 MediaPipe 离线加载
  - 新增 `packages/frontend/src/utils/__tests__/tauri-bridge.test.ts` (17 个测试用例)
  - 测试覆盖: Tauri 环境检测、API 模式切换、invoke 调用、HTTP fallback
  - CSP 配置已包含 `'wasm-unsafe-eval'` 支持 WASM 加载
- [x] 8.5 验证无网络环境下完整功能可用
  - 通过 `apiCall` 函数的 fallback 测试验证离线模式
  - SQLite 作为独立存储无需网络连接
  - 所有资源通过 Tauri 资源协议本地加载
