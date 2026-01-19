# Danci - 智能单词学习系统

<p align="center">
  <strong>基于 AMAS (Adaptive Multi-dimensional Awareness System) 的自适应单词学习平台</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Frontend-React%2018-61dafb?style=flat-square&logo=react" alt="React 18">
  <img src="https://img.shields.io/badge/Backend-Rust%20%2B%20Axum-orange?style=flat-square&logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/Database-PostgreSQL-336791?style=flat-square&logo=postgresql" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Cache-Redis-dc382d?style=flat-square&logo=redis" alt="Redis">
  <img src="https://img.shields.io/badge/Build-Turborepo-000000?style=flat-square&logo=turborepo" alt="Turborepo">
</p>

---

## 目录

- [项目介绍](#项目介绍)
  - [核心特性](#核心特性)
  - [技术栈](#技术栈)
  - [系统架构](#系统架构)
- [快速开始](#快速开始)
  - [环境要求](#环境要求)
  - [Docker 部署](#docker-部署推荐)
  - [本地开发](#本地开发)
- [使用教程](#使用教程)
  - [用户功能](#用户功能)
  - [管理后台](#管理后台)
  - [API 接口](#api-接口)
- [项目结构](#项目结构)
- [开发指南](#开发指南)
  - [常用命令](#常用命令)
  - [测试](#测试)
  - [代码规范](#代码规范)
- [更新时间轴](#更新时间轴)
- [贡献指南](#贡献指南)
- [许可证](#许可证)

---

## 项目介绍

Danci 是一个现代化的智能单词学习系统，采用先进的 **AMAS (Adaptive Multi-dimensional Awareness System)** 自适应学习引擎，能够实时监测用户的学习状态，动态调整学习策略，提供个性化的单词学习体验。

### 核心特性

#### 🧠 AMAS 智能学习引擎

- **四维状态监测**: 实时追踪注意力、疲劳度、认知能力、学习动机
- **LinUCB 算法**: 基于上下文的多臂老虎机算法，优化单词选择策略
- **Thompson 采样**: 贝叶斯方法实现探索与利用的平衡
- **FSRS 调度器**: 自由间隔重复调度算法，基于遗忘曲线智能安排复习

#### 👁️ 视觉疲劳检测

- **Rust WASM 加速**: 所有检测算法使用 Rust 编写并编译为 WASM，帧率达 10FPS
- **EAR 计算**: 增强版 34 点眼睛纵横比计算，含虹膜可见度分析
- **PERCLOS 检测**: 滑动窗口 PERCLOS 疲劳指标计算
- **眨眼与哈欠检测**: 状态机眨眼检测 + MAR 打哈欠检测
- **头部姿态估计**: 矩阵/关键点头部姿态分析

#### 📚 词汇学习功能

- **智能单词卡片**: 支持发音、例句、词源分析
- **词源词根分析**: 深入理解单词构成，增强记忆
- **掌握度追踪**: 多维度评估单词掌握程度
- **学习会话管理**: 支持会话恢复和进度同步

#### 🎨 用户体验

- **暗黑模式**: 全站支持暗黑模式，自动跟随系统偏好
- **响应式设计**: 适配桌面端和移动端
- **流畅动画**: Framer Motion 驱动的精致过渡动画
- **实时反馈**: SSE 实时通信，即时同步学习状态

#### 🔧 管理后台

- **用户管理**: 用户列表、详情、统计分析
- **算法配置**: AMAS 参数调优、A/B 实验管理
- **词库管理**: 系统词书和用户词书管理
- **数据分析**: 学习趋势、LLM 任务监控

### 技术栈

| 层级          | 技术                                                   |
| ------------- | ------------------------------------------------------ |
| **前端**      | React 18, TypeScript, Vite, TailwindCSS, Framer Motion |
| **后端**      | Rust, Axum, SQLx, Tokio                                |
| **数据库**    | PostgreSQL, Redis                                      |
| **原生模块**  | Rust + napi-rs (LinUCB, Thompson Sampling)             |
| **WASM 模块** | Rust + wasm-bindgen (视觉疲劳检测算法)                 |
| **构建工具**  | pnpm, Turborepo                                        |
| **测试**      | Vitest, Playwright, Cargo Test                         |
| **CI/CD**     | GitHub Actions, Docker                                 |

### 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Pages     │  │  Components │  │   Visual Fatigue WASM   │  │
│  │  Learning   │  │  WordCard   │  │  EAR/PERCLOS/Blink/Yawn │  │
│  │  Vocabulary │  │  Charts     │  │  HeadPose/Fatigue Score │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ REST API / SSE
┌───────────────────────────▼─────────────────────────────────────┐
│                      Backend (Rust + Axum)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Routes    │  │  Services   │  │      AMAS Engine        │  │
│  │  35 modules │  │  27 modules │  │  LinUCB/Thompson/FSRS   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Workers   │  │    Cache    │  │       Database          │  │
│  │  Background │  │    Redis    │  │      PostgreSQL         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 快速开始

### 环境要求

- **Node.js**: >= 20.x
- **pnpm**: >= 10.24.0
- **Rust**: >= 1.75 (用于后端和原生模块)
- **PostgreSQL**: >= 14
- **Redis**: >= 6
- **Docker** (可选，推荐用于部署)

### Zeabur 一键部署（最简单）

[![Deploy on Zeabur](https://zeabur.com/button.svg)](https://zeabur.com/templates/2K1A1P)

点击按钮后：

1. 填写 **应用域名**（自动分配或绑定自定义）
2. 填写 **JWT 密钥**（64+ 字符）
3. 点击部署，等待完成

Zeabur 会自动创建 PostgreSQL、Redis、后端、前端四个服务。

### 服务器一键部署（推荐）

在全新 Linux 服务器上，只需一条命令即可完成部署：

```bash
curl -fsSL https://raw.githubusercontent.com/heartcoolman/vocabulary-learning-app/main/deploy/deploy.sh | sudo bash
```

此脚本会自动：

- 安装 Docker 和 Docker Compose
- 下载生产环境配置文件
- 生成安全的随机密钥（JWT、数据库密码）
- 拉取预构建的 Docker 镜像
- 启动所有服务并执行数据库迁移
- 校验迁移完成状态

部署完成后，访问 `http://服务器IP:5173` 即可使用。

**部署后管理：**

```bash
cd /opt/danci
docker compose ps          # 查看状态
docker compose logs -f     # 查看日志
docker compose down        # 停止服务
docker compose pull && docker compose up -d  # 更新版本
```

### Docker 部署（推荐）

#### 1. 配置环境变量

```bash
cp infrastructure/docker/.env.docker .env
```

编辑 `.env` 文件，**生产环境必须修改**：

```env
# 数据库密码（改为强密码）
POSTGRES_PASSWORD=your_secure_password

# JWT 密钥（64+ 字符随机串）
JWT_SECRET=your_random_64_char_secret

# 前端域名（生产环境改为实际域名）
CORS_ORIGIN=https://your-domain.com
```

#### 2. 启动服务

```bash
# 构建并启动
docker compose up -d

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f
```

#### 3. 访问服务

| 服务     | 地址                      |
| -------- | ------------------------- |
| 前端     | http://localhost:5173     |
| API      | http://localhost:5173/api |
| 后端直连 | http://localhost:3001     |

#### 4. 常用命令

```bash
# 停止服务
docker compose down

# 重建镜像
docker compose build --no-cache

# 重启后端
docker compose restart backend-rust

# 进入数据库
docker compose exec postgres psql -U danci -d vocabulary_db

# 备份数据库
docker compose exec postgres pg_dump -U danci vocabulary_db > backup.sql
```

#### 5. 服务架构

```
Nginx (:5173) → Rust Backend (:3000) → PostgreSQL + Redis
     ↓
前端静态资源 + API 反向代理 (/api)
```

详细配置说明见 [docs/DOCKER.md](docs/DOCKER.md)

### 本地开发

#### 1. 安装依赖

```bash
# 安装 pnpm（如未安装）
npm install -g pnpm@10.24.0

# 安装项目依赖
pnpm install
```

#### 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑配置（数据库、Redis 等）
vim .env
```

主要配置项：

```env
# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/danci

# Redis
REDIS_URL=redis://localhost:6379

# 后端
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8080
LOG_LEVEL=info

# JWT
JWT_SECRET=your-secret-key
```

#### 3. 数据库迁移

```bash
# 运行数据库迁移
pnpm db:migrate
```

#### 4. 启动开发服务

```bash
# 启动前端开发服务器
pnpm dev:frontend

# 在另一个终端启动后端
pnpm dev:backend
```

或使用 Turborepo 同时启动：

```bash
pnpm dev
```

---

## 使用教程

### 用户功能

#### 注册与登录

1. 访问首页，点击「注册」创建账户
2. 填写邮箱、密码完成注册
3. 使用注册的账户登录系统

#### 词库管理

1. 进入「词库」页面
2. 浏览系统词书或创建个人词书
3. 可以从系统词书导入单词到个人词库
4. 支持搜索、筛选和批量操作

#### 学习模式

1. 进入「学习」页面开始学习会话
2. 系统根据 AMAS 引擎智能选词
3. 查看单词卡片，包含：
   - 单词拼写和音标
   - 释义和例句
   - 词源分析（如有）
   - 发音播放
4. 回答后系统记录响应时间和正确率
5. 达到掌握目标后会话结束

#### 视觉疲劳检测

1. 在学习页面启用摄像头
2. 系统实时监测眼部疲劳指标
3. 疲劳度超过阈值时弹出休息提醒
4. 建议休息后疲劳度会自动重置

#### 统计分析

1. 进入「统计」页面
2. 查看学习趋势图表
3. 了解单词掌握分布
4. 追踪学习目标完成情况

### 管理后台

管理员账户可访问 `/admin` 路径进入管理后台。

#### 用户管理

- 查看所有用户列表
- 查看用户学习详情和统计
- 管理用户权限

#### 算法配置

- 调整 AMAS 引擎参数
- 配置 LinUCB/Thompson 采样参数
- 管理 A/B 实验

#### 词书管理

- 管理系统词书
- 审核用户词书
- 单词质量检查

#### LLM 任务

- 查看词源分析任务状态
- 监控 LLM 调用情况

### API 接口

后端提供完整的 RESTful API，主要端点：

| 模块 | 端点               | 说明                 |
| ---- | ------------------ | -------------------- |
| 认证 | `/api/v1/auth/*`   | 登录、注册、刷新令牌 |
| 用户 | `/api/users/*`     | 用户信息、偏好设置   |
| 单词 | `/api/words/*`     | 单词 CRUD、搜索      |
| 词书 | `/api/wordbooks/*` | 词书管理             |
| 学习 | `/api/learning/*`  | 学习会话、获取单词   |
| AMAS | `/api/amas/*`      | 状态、策略、趋势     |
| 管理 | `/api/admin/*`     | 管理后台接口         |

详细 API 文档请参考 [docs/API.md](docs/API.md)。

---

## 项目结构

```
danci/
├── packages/
│   ├── backend-rust/          # Rust 后端服务
│   │   ├── src/
│   │   │   ├── amas/          # AMAS 智能学习引擎
│   │   │   ├── auth/          # 认证模块
│   │   │   ├── cache/         # Redis 缓存层
│   │   │   ├── config/        # 配置管理
│   │   │   ├── db/            # 数据库操作 (SQLx)
│   │   │   ├── routes/        # API 路由 (35个模块)
│   │   │   ├── services/      # 业务服务 (27个模块)
│   │   │   └── workers/       # 后台任务
│   │   └── sql/               # 数据库迁移文件
│   │
│   ├── frontend/              # React 前端应用
│   │   └── src/
│   │       ├── components/    # UI 组件库
│   │       │   ├── ui/        # 基础组件
│   │       │   ├── etymology/ # 词源组件
│   │       │   └── ...
│   │       ├── pages/         # 页面组件
│   │       ├── hooks/         # React Hooks
│   │       ├── services/      # API 客户端
│   │       │   ├── client/    # HTTP 客户端
│   │       │   └── visual-fatigue/  # 视觉疲劳服务
│   │       ├── contexts/      # React Context
│   │       └── routes/        # 路由配置
│   │
│   ├── native/                # Rust 原生模块 (napi-rs)
│   │   └── src/
│   │       ├── linucb/        # LinUCB 算法
│   │       ├── thompson/      # Thompson 采样
│   │       └── actr/          # ACT-R 认知模型
│   │
│   ├── shared/                # 共享类型定义
│   │   └── src/
│   │       ├── types/         # TypeScript 类型
│   │       └── api/           # API 适配器
│   │
│   └── crates/
│       └── visual-fatigue-wasm/  # 视觉疲劳 WASM 模块
│
├── e2e/                       # E2E 测试 (Playwright)
├── docs/                      # 项目文档
├── .github/workflows/         # GitHub Actions CI/CD
└── docker-compose.yml         # Docker 编排配置
```

---

## 开发指南

### 常用命令

```bash
# 开发
pnpm dev                    # 启动所有开发服务
pnpm dev:frontend           # 仅启动前端
pnpm dev:backend            # 仅启动后端

# 构建
pnpm build                  # 构建所有包
pnpm docker:build           # 构建 Docker 镜像

# 测试
pnpm test                   # 运行所有测试
pnpm test:frontend          # 前端测试
pnpm test:backend           # 后端测试 (cargo test)
pnpm test:e2e               # E2E 测试 (Playwright)

# 代码质量
pnpm lint                   # ESLint 检查
pnpm format                 # Prettier 格式化
pnpm format:check           # 检查格式

# 数据库
pnpm db:migrate             # 运行迁移

# Docker
pnpm docker:up              # 启动容器
pnpm docker:down            # 停止容器

# 性能
pnpm lighthouse             # Lighthouse 性能测试
```

### 测试

项目包含多层次测试：

- **单元测试**: Vitest (前端) / Cargo Test (后端)
- **组件测试**: React Testing Library
- **集成测试**: API 接口测试
- **E2E 测试**: Playwright

运行测试覆盖率报告：

```bash
pnpm test:coverage
```

### 代码规范

项目使用以下工具保证代码质量：

- **ESLint**: JavaScript/TypeScript 代码检查
- **Prettier**: 代码格式化
- **Commitlint**: Git 提交信息规范
- **Husky**: Git Hooks
- **lint-staged**: 暂存文件检查

提交信息格式遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <subject>

feat(frontend): 添加暗黑模式主题系统
fix(backend): 修复用户认证问题
docs: 更新 README 文档
```

---

## 更新时间轴

### 2026 年 1 月

#### 2026-01-19 - 一键部署脚本与 CI/CD 优化

**一键部署脚本**

- 新增 `deploy/deploy.sh` 中文一键部署脚本
- 自动安装 Docker 和 Docker Compose
- 自动生成安全密钥（JWT、数据库密码）
- 使用 GitHub 预构建镜像，无需本地编译
- 等待数据库就绪并校验迁移完成状态

**CI/CD 优化**

- 移除 CI 中的数据库迁移步骤（迁移在后端启动时自动执行）
- 修复 SQLite 文件在 PostgreSQL 环境执行的问题
- 修复 Windows 构建时文件名包含冒号的问题
- 添加 pnpm overrides 解决 zod 版本冲突

**文档更新**

- 更新 `docs/DOCKER.md` 添加一键部署说明
- 更新 README 添加服务器一键部署指南

---

#### 2026-01-08 - CI/CD 增强与 Native 模块升级 ([PR #52](https://github.com/Heartcoolman/vocabulary-learning-app/pull/52))

**CI/CD 增强**

- 新增 Rust CI 工作流：检查 native 和 backend-rust 包的编译、测试、clippy 和格式
- 新增 E2E 测试：使用 Playwright 运行端到端测试，集成 PostgreSQL 和 Redis 服务
- 新增覆盖率检查：设置 45% 阈值，计划逐步提升至 80%
- CI 状态摘要：在 GitHub Actions 中显示详细的检查状态表格

**Native 模块升级**

- napi/napi-derive 从 2.16 升级到 3.x
- @napi-rs/cli 从 2.18.4 升级到 3.5.1
- 配置格式更新：`name` → `binaryName`, `triples` → `targets`
- 宏兼容性修复：移除不支持的字段级 `napi(js_name)` 宏

**Lighthouse CI 优化**

- 添加构建输出验证、Chrome 安装、独立 LHCI 配置

**其他修复**

- 移除对不存在的 @danci/backend 包的引用
- 更新 Docker 镜像到 Node.js 20+
- 修复 Native Module 交叉编译问题

---

#### 2026-01-07 - 词源分析与 FSRS 调度器

**新功能**

- **词源分析服务**: 实现词源路由、服务和后台工作器，支持单词起源和词素分析
- **FSRS 调度器**: 实现自由间隔重复调度算法 (Free Spaced Repetition Scheduler)
- **缓存层**: 添加缓存基础设施以提升性能
- **前端词源组件**: 新增 WordCardWithEtymology、词源 UI 组件、useEtymology 钩子

**数据库迁移 (008-016)**

- 会话类型字段、上下文切换支持、AMAS 字段扩展、FSRS 支持、词素分析表

**重构**

- 更新 AMAS 决策引擎和多臂老虎机算法（LinUCB、Thompson 采样）
- 更新后端核心模块、前端 AMAS 客户端和学习模块

---

### 2025 年 12 月

#### 2025-12-29 - 分析、LLM 和部署优化

**后端**

- 添加分析和 LLM 数据库操作及管理端路由
- 扩展 admin service、insight generator、learning state、quality service
- 优化 Dockerfile

**前端**

- 新页面：PreferencesPage、LLMTasksPage、WordDetailModal
- 路由扩展：LLM 任务和偏好设置路由
- AdminClient 扩展：分析和 LLM 管理 API
- UI 组件增强：Alert、Checkbox、Modal、Progress、Select、Toast

---

#### 2025-12-28 - 暗黑模式全面支持

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

#### 2025-12-27 - AMAS 算法增强与数据库简化

**AMAS 决策算法**

- LinUCB 上下文探索算法
- Thompson 采样概率选择算法
- 更新 ensemble 和 coldstart 决策模块

**数据库层简化**

- 移除旧版同步模块：dual-write manager, conflict resolver, sync manager

**前端重构**

- 移除已迁移到 Rust 后端的算法模块：AdaptiveDifficultyEngine, PriorityQueueScheduler, SpacedRepetitionEngine 等

**后端优化**

- 添加 quality management、emergency 路由、insight generator、quality service

---

#### 2025-12-18 - Rust 后端迁移完成 & 视觉疲劳 WASM ([PR #31](https://github.com/Heartcoolman/vocabulary-learning-app/pull/31))

**后端迁移**

- 删除 Node.js 后端 (`packages/backend/`)
- 更新 docker-compose.yml 和 nginx.conf
- 更新 package.json 脚本指向 Rust 后端

**视觉疲劳 WASM 模块** (`crates/visual-fatigue-wasm/`)

| 模块                   | 功能                                |
| ---------------------- | ----------------------------------- |
| EARCalculator          | 增强版 34 点 EAR 计算，含虹膜可见度 |
| PERCLOSCalculator      | 滑动窗口 PERCLOS 计算               |
| BlinkDetector          | 状态机眨眼检测                      |
| YawnDetector           | MAR 计算和打哈欠检测                |
| HeadPoseEstimator      | 矩阵/关键点头部姿态估计             |
| BlendshapeAnalyzer     | 表情疲劳特征分析                    |
| FatigueScoreCalculator | 加权综合疲劳评分                    |

**性能提升**

- 帧率从 **5FPS 提升至 10FPS** (detectionIntervalMs: 200 → 100)
- 删除 TypeScript 算法实现，Worker 完全使用 WASM

---

#### 2025-12-16 - SQLite 支持与项目清理 ([PR #28](https://github.com/Heartcoolman/vocabulary-learning-app/pull/28))

- 新增 SQLite 数据库模块和同步脚本
- 项目清理：删除 136 个临时文件，更新 .gitignore

---

#### 2025-12-14 ~ 2025-12-15 - 前端稳定化与功能合并

- 稳定前端 UX 和 AMAS 后端
- 合并视觉疲劳检测系统、LLM 内容增强服务
- 新管理页面：SystemDebug、WeeklyReport、WordQuality
- AMAS 文件结构重组

---

#### 2025-12-10 ~ 2025-12-12 - 视觉疲劳检测系统

- 实现视觉疲劳检测系统
- 新增认知视觉融合模块、动态权重计算器、阈值学习器
- AMAS 并发优化：禁用 in-memory 延迟奖励聚合器，增加用户锁

---

#### 2025-12-08 ~ 2025-12-09 - 前端重构与 CI/CD ([PR #7](https://github.com/Heartcoolman/vocabulary-learning-app/pull/7))

- 新组件：FlashCard、ReverseWordCard、FlashcardPage
- 路由优化：预取 (usePrefetch)、骨架屏
- CI/CD 配置：更新分支名称，修复 TypeScript 错误

---

#### 2025-12-07 - Plan B 重构完成 (Month 1-7)

**完成任务**

- Month 1: AuthContext 优化、开发工具链、Toast Store (Zustand)、ApiClient 模块化
- Month 2: TypeScript 类型统一、Zod schemas、React.memo 优化、UI Store
- Month 3: 页面组件拆分、VirtualWordList (react-window)
- Month 4-5: React Query 迁移 (33+ hooks)、Storybook 配置
- Month 6-7: CI workflow、Lighthouse CI、Deploy workflow

---

#### 2025-12-06 - Native 模块与测试增强

- 实现 Native LinUCB 模块 (Rust + napi-rs)
- 测试全面增强：后端单元测试、API 集成测试、前端组件/页面/hooks 测试
- CI/CD 配置：GitHub Actions 工作流、Dockerfile 更新

---

#### 2025-12-05 - Monorepo 重构

- 完成 Monorepo 基础结构迁移
- AMAS 引擎模块化重构、测试精简

---

### 2025 年 11 月

#### 2025-11-20 - 项目创建

- 初始化词汇学习应用项目

---

## 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feat/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feat/amazing-feature`)
5. 创建 Pull Request

请确保：

- 代码通过所有测试和 lint 检查
- 提交信息遵循 Conventional Commits 规范
- 新功能包含相应的测试

---

## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

---

<p align="center">
  Made with ❤️ by the Danci Team
</p>
