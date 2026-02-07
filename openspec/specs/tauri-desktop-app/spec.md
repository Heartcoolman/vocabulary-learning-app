# tauri-desktop-app Specification

## Purpose

Tauri 2.x 桌面应用结构与配置规范。

## Requirements

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

### Requirement: Tauri 命令层桥接

系统 SHALL 提供 Tauri 命令层，将前端请求桥接到后端服务。

#### Scenario: 学习相关命令可用

- **WHEN** 前端调用 `invoke("get_learning_words")`
- **THEN** 返回当前学习会话的单词列表

#### Scenario: 统计命令可用

- **WHEN** 前端调用 `invoke("get_statistics")`
- **THEN** 返回用户学习统计数据

### Requirement: 无登录单用户模式

系统 SHALL 采用无登录单用户模式，启动即进入学习界面。

#### Scenario: 首次启动自动创建用户

- **WHEN** 用户首次启动应用
- **THEN** 自动创建默认本地用户 (id=1, username="local_user")
- **AND** 无需密码或登录流程
- **AND** 数据存储在本地 SQLite，隐私安全

#### Scenario: 后续启动复用用户

- **WHEN** 用户再次启动应用
- **THEN** 自动使用已有本地用户
- **AND** 无任何认证提示

### Requirement: 数据库初始化

系统 SHALL 在应用首次启动时自动初始化 SQLite 数据库。

#### Scenario: 首次启动创建数据库

- **WHEN** 用户首次启动应用
- **THEN** 在 `%APPDATA%/com.danci.app/data.db` 创建 SQLite 数据库
- **AND** 执行完整 schema 初始化

#### Scenario: 已有数据库直接使用

- **WHEN** 用户启动应用且数据库已存在
- **THEN** 直接连接现有数据库
- **AND** 检查并执行必要的迁移

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

### Requirement: 应用窗口配置

系统 SHALL 提供合适的默认窗口配置。

#### Scenario: 窗口尺寸合理

- **WHEN** 应用启动
- **THEN** 窗口默认尺寸为 1024x768
- **AND** 最小尺寸为 375x667 (移动端适配)
- **AND** 窗口居中显示

#### Scenario: 窗口标题正确

- **WHEN** 应用运行
- **THEN** 窗口标题显示 "Danci"

### Requirement: 单实例运行

系统 SHALL 强制单实例运行，防止 SQLite 并发访问冲突。

#### Scenario: 阻止多实例启动

- **WHEN** 用户尝试启动第二个应用实例
- **THEN** 新实例检测到已有实例运行
- **AND** 聚焦到已有窗口
- **AND** 新实例自动退出

#### Scenario: 单实例锁实现

- **WHEN** 应用启动
- **THEN** 使用 named mutex 或 lock file 实现单实例锁
- **AND** 锁文件位于 `%APPDATA%/com.danci.app/.lock`

### Requirement: 窗口状态持久化

系统 SHALL 记住用户的窗口状态。

#### Scenario: 保存窗口状态

- **WHEN** 用户关闭应用
- **THEN** 保存窗口位置、大小、最大化状态到 settings store
- **AND** 下次启动恢复上次状态

#### Scenario: 重置窗口布局

- **WHEN** 用户在设置中选择"重置窗口布局"
- **THEN** 删除保存的窗口状态
- **AND** 下次启动使用默认 1024x768 居中

### Requirement: 首次运行引导

系统 SHALL 提供首次运行引导向导。

#### Scenario: 引导流程

- **WHEN** 用户首次启动应用
- **THEN** 显示欢迎界面
- **AND** 引导用户选择词书
- **AND** 介绍核心功能（学习、复习、统计）
- **AND** 说明桌面版离线特性
- **AND** 完成后进入主学习界面

#### Scenario: 跳过引导

- **WHEN** 用户点击"跳过"
- **THEN** 使用默认词书设置
- **AND** 直接进入主学习界面

### Requirement: 更新检查

系统 SHALL 提供手动更新检查功能。

#### Scenario: 检查更新按钮

- **WHEN** 用户在设置中点击"检查更新"
- **WHEN** 网络可用
- **THEN** 查询 GitHub Releases API 获取最新版本
- **AND** 对比当前版本显示结果

#### Scenario: 发现新版本

- **WHEN** 检测到新版本可用
- **THEN** 显示新版本号和更新说明
- **AND** 提供"前往下载"链接跳转到 GitHub Release 页面

#### Scenario: 离线状态

- **WHEN** 用户点击"检查更新"但网络不可用
- **THEN** 显示"当前处于离线状态，无法检查更新"

### Requirement: 可选遥测

系统 SHALL 支持用户可选的错误遥测功能。

#### Scenario: 遥测默认关闭

- **WHEN** 用户首次启动应用
- **THEN** 错误遥测默认关闭
- **AND** 不发送任何网络请求

#### Scenario: 用户开启遥测

- **WHEN** 用户在设置中开启"帮助改进应用"选项
- **THEN** 启用 Sentry 错误上报
- **AND** 仅在网络可用时发送
- **AND** 不包含用户学习内容等隐私数据

#### Scenario: 用户关闭遥测

- **WHEN** 用户关闭遥测选项
- **THEN** 立即停止所有错误上报
- **AND** 清除本地缓存的未发送事件

## Property-Based Testing Invariants

### PBT: Desktop Mode Detection Determinism

- **INVARIANT**: `detect_mode(env, runtime)` 是确定性的，相同输入 ⇒ 相同 `DbMode`
- **FALSIFICATION**: 生成随机 env 组合 (DATABASE_URL 存在/缺失/格式错误)，重复调用断言结果一致

### PBT: Mode Exclusivity

- **INVARIANT**: `DbMode ∈ {DesktopSqlite, ServerPostgres}`，两者互斥；下游配置与模式匹配
- **FALSIFICATION**: Instrument 连接构造器，模糊测试 env 组合，断言仅有一方计数器非零

### PBT: Single Instance Mutual Exclusion

- **INVARIANT**: 并发尝试中，至多一个实例可持有 named mutex
- **FALSIFICATION**: 并行启动多个争用者，随机交错，断言 `success_count ≤ 1`

### PBT: Lock Release Enables Progress

- **INVARIANT**: 如果持有者退出/释放，后续争用者可获取锁
- **FALSIFICATION**: 进程 A 获取后退出，进程 B 以随机延迟重试，断言最终成功
