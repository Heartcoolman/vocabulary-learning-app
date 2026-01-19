# 更新日志

## 2026 年 1 月

### 2026-01-19 - 一键部署脚本与 CI/CD 优化

**一键部署脚本**

- 新增 `deploy/deploy.sh` 中文一键部署脚本
- 自动安装 Docker 和 Docker Compose
- 自动生成安全密钥（JWT、数据库密码）
- 使用 GitHub 预构建镜像，无需本地编译
- 等待数据库就绪并校验迁移完成状态

**词书更新检测**

- 词书中心支持检测远程词书更新
- 添加词书软删除功能，支持单词恢复

**CI/CD 优化**

- 移除 CI 中的数据库迁移步骤（迁移在后端启动时自动执行）
- 修复 SQLite 文件在 PostgreSQL 环境执行的问题
- 修复 Windows 构建时文件名包含冒号的问题
- 添加 pnpm overrides 解决 zod 版本冲突

---

### 2026-01-18 - 词书中心增强

**词书列表优化**

- 在词书列表页显示作者和版本号
- 长作者名自动截断处理
- 添加实时下载次数统计（Cloudflare Worker）

**后端修复**

- 修复 CORS 配置支持 credentials 模式
- 注册缺失的数据库迁移并修复默认 URL

---

### 2026-01-17 - 词书加载修复

- 修复词书只加载前 100 个单词的问题，现在获取全部单词

---

### 2026-01-15 - 词书中心静态托管支持

**静态托管**

- 词书中心支持 GitHub/jsDelivr 静态托管
- 适配远程分页 API 并修复类型错误

**界面优化**

- 优化界面尺寸与内容密度

---

### 2026-01-14 - 词书中心与数据库增强

**词书中心**

- 新增词书中心页面，支持浏览和导入远程词书
- 实现基于角色的访问控制
- 添加缺失的 Download 和 Tag 图标导出

**数据库增强**

- SQLx 编译时查询检查基础设施
- 迁移 db/operations 到编译时查询宏
- 添加 SQL 迁移验证到 CI/CD 流程
- 修复缺失的枚举类型和列类型定义
- 添加缺失的 habit_profiles 表

---

### 2026-01-08 - CI/CD 增强与 Native 模块升级

**CI/CD 增强**

- 新增 Rust CI 工作流：检查 native 和 backend-rust 包的编译、测试、clippy 和格式
- 新增 E2E 测试：使用 Playwright 运行端到端测试，集成 PostgreSQL 和 Redis 服务
- 新增覆盖率检查：设置 45% 阈值，计划逐步提升至 80%

**Native 模块升级**

- napi/napi-derive 从 2.16 升级到 3.x
- @napi-rs/cli 从 2.18.4 升级到 3.5.1
- 配置格式更新：`name` → `binaryName`, `triples` → `targets`

---

### 2026-01-07 - 词源分析与 FSRS 调度器

**新功能**

- **词源分析服务**: 实现词源路由、服务和后台工作器，支持单词起源和词素分析
- **FSRS 调度器**: 实现自由间隔重复调度算法 (Free Spaced Repetition Scheduler)
- **缓存层**: 添加缓存基础设施以提升性能
- **前端词源组件**: 新增 WordCardWithEtymology、词源 UI 组件、useEtymology 钩子

---

## 2025 年 12 月

### 2025-12-29 - 分析、LLM 和部署优化

**后端**

- 添加分析和 LLM 数据库操作及管理端路由
- 扩展 admin service、insight generator、learning state、quality service
- 优化 Dockerfile

**前端**

- 新页面：PreferencesPage、LLMTasksPage、WordDetailModal
- 路由扩展：LLM 任务和偏好设置路由
- UI 组件增强：Alert、Checkbox、Modal、Progress、Select、Toast

---

### 2025-12-28 - 暗黑模式全面支持

**主题系统**

- ThemeContext + 系统偏好检测
- ThemeToggle 手动切换组件
- Tailwind `darkMode: 'class'` 配置

**组件暗黑模式覆盖**

- UI 基础组件：Alert, Avatar, Badge, Button, Card, Input, Modal, Table 等 30+ 组件
- 图表组件：PerformanceTrendChart, WeightRadarChart, LearningCurveChart 等
- 业务组件：FloatingEyeIndicator, 视觉疲劳组件, 徽章/掌握度组件
- 页面组件：认证、主页面、管理、关于页面全覆盖

---

### 2025-12-27 - AMAS 算法增强与数据库简化

**AMAS 决策算法**

- LinUCB 上下文探索算法
- Thompson 采样概率选择算法
- 更新 ensemble 和 coldstart 决策模块

**数据库层简化**

- 移除旧版同步模块：dual-write manager, conflict resolver, sync manager

---

### 2025-12-18 - Rust 后端迁移完成 & 视觉疲劳 WASM

**后端迁移**

- 删除 Node.js 后端 (`packages/backend/`)
- 更新 docker-compose.yml 和 nginx.conf
- 更新 package.json 脚本指向 Rust 后端

**视觉疲劳 WASM 模块**

| 模块                   | 功能                                |
| ---------------------- | ----------------------------------- |
| EARCalculator          | 增强版 34 点 EAR 计算，含虹膜可见度 |
| PERCLOSCalculator      | 滑动窗口 PERCLOS 计算               |
| BlinkDetector          | 状态机眨眼检测                      |
| YawnDetector           | MAR 计算和打哈欠检测                |
| HeadPoseEstimator      | 矩阵/关键点头部姿态估计             |
| FatigueScoreCalculator | 加权综合疲劳评分                    |

**性能提升**

- 帧率从 5FPS 提升至 10FPS

---

### 2025-12-16 - SQLite 支持与项目清理

- 新增 SQLite 数据库模块和同步脚本
- 项目清理：删除 136 个临时文件，更新 .gitignore

---

### 2025-12-06 - Native 模块与测试增强

- 实现 Native LinUCB 模块 (Rust + napi-rs)
- 测试全面增强：后端单元测试、API 集成测试、前端组件/页面/hooks 测试
- CI/CD 配置：GitHub Actions 工作流、Dockerfile 更新

---

### 2025-12-05 - Monorepo 重构

- 完成 Monorepo 基础结构迁移
- AMAS 引擎模块化重构、测试精简

---

## 2025 年 11 月

### 2025-11-20 - 项目创建

- 初始化词汇学习应用项目
