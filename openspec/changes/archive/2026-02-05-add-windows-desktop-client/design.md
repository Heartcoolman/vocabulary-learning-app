## Context

**当前状态**:

- 项目采用 monorepo 架构 (pnpm + Turborepo)
- 后端: Rust + Axum，强依赖 PostgreSQL + Redis
- 前端: React + Vite，使用 WASM 模块进行视觉疲劳检测
- 部署: Docker Compose，仅支持 Linux 服务器
- Tauri 应用目录存在 (`packages/tauri-app/`)，已有 Android 构建产物和配置，但缺少核心 Rust 源文件

**技术约束**:

- 后端 `DatabaseProxy` 中 SQLite fallback 已被标记为 deprecated
- 完整 SQLite schema 存在于 `sql/sqlite_fallback_schema.sql` (1157+ 行)
- OTA/Restart 功能使用 Unix domain sockets (`#[cfg(unix)]`)
- 健康检查读取 `/proc` 文件系统
- WASM 模块从 `/wasm/` 路径动态加载
- MediaPipe 模型从 CDN 或本地 `/models/` 加载

**利益相关者**:

- 个人用户: 希望无需服务器即可使用
- 服务器用户: 现有功能不受影响

## Goals / Non-Goals

**Goals:**

1. 用户可下载 Windows .exe 安装包，一键安装后开箱即用
2. 桌面客户端完全离线可用，无需网络连接
3. 数据存储在用户本地 SQLite 文件，隐私安全
4. 保持与服务器版本的功能一致性 (学习、复习、统计)
5. 服务器部署模式不受任何影响

**Non-Goals:**

1. 不实现多设备数据同步 (未来可选功能)
2. 不实现 macOS/Linux 桌面客户端 (仅 Windows，未来可扩展)
3. 不实现 Windows Service 后台运行
4. 不实现 OTA 自动更新 (用户手动下载新版本)
5. 不支持 Windows 7/8 (仅 Windows 10+ 含 WebView2)

## Decisions

### D1: 使用 Tauri 2.x 作为桌面框架

**选择**: Tauri 2.x (已有基础配置)

**替代方案**:

- Electron: 体积大 (100MB+)，资源占用高
- 原生 Win32: 开发成本高，无法复用前端代码
- PWA: 离线能力受限，无法访问本地文件系统

**理由**:

- 项目已有 `packages/tauri-app/` 目录和 `tauri.conf.json` 配置
- Tauri 2.x 支持 tauri-plugin-sql (SQLite)
- 打包体积小 (~10MB)，使用系统 WebView2
- Rust 后端代码可直接复用

### D2: SQLite 作为桌面模式唯一存储

**选择**: 使用现有 `sqlite_fallback_schema.sql` 作为 SQLite schema

**替代方案**:

- 嵌入式 PostgreSQL (如 pg_embed): 体积大，配置复杂
- IndexedDB + 前端存储: 数据量受限，无法运行后端算法

**理由**:

- SQLite schema 已存在且完整 (1157+ 行)
- 后端 Cargo.toml 已包含 `sqlx` 的 `sqlite` feature
- SQLite 单文件存储，易于备份和迁移

**迁移兼容策略**:

- PostgreSQL `ENUM` → SQLite `TEXT` + CHECK 约束
- PostgreSQL `JSONB` → SQLite `TEXT` (JSON 存储)
- PostgreSQL `SERIAL` → SQLite `INTEGER PRIMARY KEY AUTOINCREMENT`
- PostgreSQL `DO $$ ... $$` 块 → 拆分为多条语句

### D3: 后端逻辑嵌入 Tauri 命令层

**选择**: 将核心后端逻辑编译为 Tauri 命令，前端通过 `@tauri-apps/api` 调用

**架构**:

```
┌────────────────────────────────────────────┐
│  Tauri 应用 (packages/tauri-app)           │
│  ┌──────────────────────────────────────┐  │
│  │  Frontend (packages/frontend/dist)   │  │
│  │  - React UI                          │  │
│  │  - 调用 invoke("command_name")       │  │
│  └──────────────────────────────────────┘  │
│                    │                        │
│                    ▼                        │
│  ┌──────────────────────────────────────┐  │
│  │  Tauri Commands (src/commands/*.rs)  │  │
│  │  - 桥接前端请求到后端服务            │  │
│  └──────────────────────────────────────┘  │
│                    │                        │
│                    ▼                        │
│  ┌──────────────────────────────────────┐  │
│  │  Backend Core (依赖 backend-rust)    │  │
│  │  - 服务层: AMAS, Learning, etc.      │  │
│  │  - 数据层: SQLite via sqlx           │  │
│  └──────────────────────────────────────┘  │
│                    │                        │
│                    ▼                        │
│  ┌──────────────────────────────────────┐  │
│  │  SQLite Database                     │  │
│  │  - 路径: %APPDATA%/com.danci.app/    │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

**替代方案**:

- 前端直接使用 tauri-plugin-sql: 无法运行 AMAS 算法等后端逻辑
- 嵌入完整 HTTP 服务器: 端口冲突风险，架构复杂

### D4: 离线资源打包策略

**WASM 模块**:

- 将 `public/wasm/*.wasm` 和 `*.js` 嵌入 Tauri 资源
- 修改加载路径为 Tauri asset 协议

**MediaPipe 模型**:

- 将 `public/models/mediapipe/face_landmarker.task` (~5MB) 嵌入资源
- 使用 `tauri://localhost/models/...` 协议加载

**CSP 配置**:

```json
"csp": "default-src 'self' tauri:; script-src 'self' 'wasm-unsafe-eval'; ..."
```

### D5: Windows 平台适配

**禁用功能**:

- OTA 更新: 使用 `#[cfg(not(target_os = "windows"))]` 条件编译
- Unix sockets: 已有 `#[cfg(unix)]` 保护
- /proc 健康检查: 返回默认值或使用 `sysinfo` crate

**保留功能**:

- 信号处理: `tokio::signal::ctrl_c()` 已跨平台
- 文件系统操作: Rust `std::fs` 跨平台

## Risks / Trade-offs

| 风险                       | 影响               | 缓解措施                         |
| -------------------------- | ------------------ | -------------------------------- |
| SQLite 性能不如 PostgreSQL | 大数据量时可能变慢 | 添加适当索引，限制单文件大小警告 |
| WASM/MediaPipe 加载失败    | 视觉疲劳检测不可用 | 优雅降级，功能可选禁用           |
| WebView2 未安装            | 应用无法启动       | NSIS 安装包自动安装 WebView2     |
| 数据库迁移不兼容           | 版本升级失败       | 版本号检查 + 备份提示            |
| Tauri 插件版本冲突         | 构建失败           | 锁定依赖版本，CI 测试            |

## Migration Plan

**部署步骤**:

1. 完成 Tauri 应用核心代码
2. 配置 GitHub Actions 构建 Windows 安装包
3. 创建 Release 页面提供下载
4. 更新 README 添加桌面客户端说明

**回滚策略**:

- 桌面客户端为独立产品，不影响服务器版本
- 如有重大问题，可从 Release 页面移除

## Open Questions

1. ~~数据库策略~~ → 已确认: 纯 SQLite
2. ~~离线支持~~ → 已确认: 完全离线
3. ~~数据导入/导出功能~~ → 已确认: V1 不支持，桌面版与服务器版数据独立
4. ~~安装包代码签名~~ → 已确认: V1 接受未签名警告，未来可考虑 EV 证书

## Confirmed Constraints

### 用户认证模型

- **决策**: 无登录单用户模式
- 启动即进入学习界面，自动创建本地用户
- 无密码，无登录流程，隐私安全

### WebView2 策略

- **决策**: 捆绑固定版本 (~150MB)
- 安装包含 WebView2 运行时，确保完全离线可用
- 安装包总大小约 160-180MB

### 系统最低要求

- Windows 10 版本 1903+ (Build 18362)
- RAM ≥ 4GB
- 磁盘空间 ≥ 500MB
- 屏幕分辨率 ≥ 1024x768

### 单实例运行

- **决策**: 强制单实例
- 使用 named mutex 防止多开
- 第二次启动聚焦已有窗口

### 窗口状态

- **决策**: 保存并恢复
- 记住位置、大小、最大化状态
- 提供"重置窗口布局"选项

### 首次运行

- **决策**: 引导向导
- 欢迎界面 → 词书选择 → 功能介绍 → 离线说明

### 更新检查

- **决策**: 手动检查按钮
- 设置页提供"检查更新"，查询 GitHub Releases API
- 不做 OTA 自动更新

### 遥测策略

- **决策**: 用户可选开启
- 默认关闭，符合"完全离线"承诺
- 用户可在设置中开启 Sentry 错误上报

### MediaPipe GPU 回退

- **决策**: 默认后端 + 优雅降级
- 不显式检测 GPU，失败时禁用视觉疲劳检测功能

### 崩溃恢复

- **决策**: 不做特殊处理
- 正常启动流程，无安全模式或自动修复
