# 智能词汇学习应用 (Danci)

一个基于 **AMAS（自适应多维度用户感知智能学习系统）** 的全栈英语单词学习应用，采用 **Monorepo** 架构，支持用户认证、云端同步、智能学习推荐、成就系统等功能。

## 核心特性

### 智能学习系统 (AMAS)
- **自适应学习算法** - 基于 LinUCB 强化学习的多维度用户状态感知系统
- **四维状态监测** - 实时追踪注意力(A)、疲劳度(F)、认知能力(C)、动机(M)
- **学习时机推荐** - 分析 24 小时学习效率，智能推荐黄金学习时段
- **趋势分析报告** - 正确率、响应时间、动机趋势追踪与干预建议
- **延迟奖励系统** - 基于间隔重复的异步奖励更新机制
- **决策可解释性** - 决策解释、学习曲线可视化、反事实分析
- **高性能 Rust 原生模块** - LinUCB 算法核心使用 Rust + napi-rs 实现

### 学习功能
- **间隔重复算法** - SM-2 改进算法，智能安排复习时间
- **自适应难度** - 根据用户表现动态调整题目难度
- **单词评分系统** - 综合准确率、速度、稳定性、熟练度的多维评分
- **优先队列调度** - 智能决定学习顺序，优先复习薄弱单词
- **动态队列优化** - 四因子难度模型（词长、准确率、词频、遗忘曲线）
- **单词掌握度评估** - 基于 ACT-R 记忆模型的掌握度判定

### 用户画像与分析
- **习惯画像** - 生物钟分析、学习风格建模（视觉/听觉/动觉）
- **认知能力画像** - 记忆力、速度、稳定性三维评估
- **状态历史追踪** - 7/30/90 天历史数据，认知成长对比
- **趋势分析** - 正确率、响应时间、动机长期趋势追踪

### 成就与激励
- **徽章系统** - 四类成就徽章（连续学习、正确率、认知提升、里程碑）
- **智能学习计划** - 每日目标、周里程碑、词书分配、自动调整

### 监控与运维
- **Sentry 错误追踪** - 前后端统一的错误监控与追踪
- **Pino 结构化日志** - 高性能 JSON 日志系统
- **告警系统** - 阈值告警、趋势告警、Webhook 通知
- **决策流水线** - 六阶段可视化（感知→建模→学习→决策→评估→优化）

### 实验与优化
- **A/B 测试系统** - Thompson Sampling vs LinUCB 实验框架
- **贝叶斯优化** - 超参数自动调优
- **因果推断** - 学习策略效果评估
- **LLM 顾问** - 基于大语言模型的学习建议系统

### 基础功能
- **用户认证** - JWT 令牌认证，支持注册、登录、会话管理
- **云端同步** - 多设备数据同步，离线优先策略
- **词库管理** - 系统词书 + 用户自定义词书，支持批量导入（CSV/JSON）
- **学习测试** - 选择题测试，实时反馈，键盘快捷键支持
- **发音功能** - 单词发音播放，支持 Web Speech API

### 管理后台
- **用户管理** - 用户列表、统计、数据导出（Excel/CSV）
- **词库管理** - 系统词库创建和维护
- **算法配置** - AMAS 算法参数在线调整
- **配置历史** - 参数变更追踪和审计
- **实验仪表盘** - A/B 测试管理与分析

## 技术栈

### 前端 (@danci/frontend)
| 技术 | 版本 | 说明 |
|------|------|------|
| React | 18.2 | UI 框架 |
| TypeScript | 5.3 | 类型安全 |
| Vite | 5.0 | 构建工具 |
| Tailwind CSS | 3.3 | 样式框架 |
| React Router | v6 | 路由管理 |
| Framer Motion | 12.x | 动画库 |
| @phosphor-icons/react | 2.x | 图标库 |
| @sentry/react | 10.x | 错误监控 |

### 后端 (@danci/backend)
| 技术 | 版本 | 说明 |
|------|------|------|
| Node.js | 20+ | 运行时 |
| Express | 4.18 | Web 框架 |
| TypeScript | 5.3 | 类型安全 |
| PostgreSQL + TimescaleDB | 15 | 数据库 |
| Redis | 7 | 缓存层（可选） |
| Prisma | 5.7 | ORM |
| JWT + bcrypt | - | 认证加密 |
| Zod | 3.22 | 数据验证 |
| node-cron | 4.x | 后台任务 |
| Pino | 10.x | 结构化日志 |
| Piscina | 4.x | Worker 线程池 |

### 原生模块 (@danci/native)
| 技术 | 说明 |
|------|------|
| Rust | 高性能算法实现 |
| napi-rs | Node.js Native Addon |
| LinUCB | 强化学习核心算法 |

### 测试
| 技术 | 说明 |
|------|------|
| Vitest | 单元/集成测试 |
| Playwright | E2E 测试 |
| Testing Library | React 组件测试 |
| Supertest | API 测试 |
| MSW | Mock Service Worker |

### 构建与部署
| 技术 | 说明 |
|------|------|
| pnpm | 10.24.0 包管理器 |
| Turborepo | Monorepo 构建编排 |
| Docker | 容器化部署 |
| GitHub Actions | CI/CD |

## 快速开始

### 方式一：Docker Compose（推荐）

```bash
# 启动所有服务（PostgreSQL + Redis + 后端 + 前端）
docker-compose up -d

# 或使用部署脚本
./scripts/docker-start.sh up

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

服务地址：
- 前端：`http://localhost:5173`
- 后端 API：`http://localhost:3000`
- 数据库管理：`pnpm prisma:studio`

### 方式二：本地开发

#### 环境要求
- Node.js 20+
- pnpm 10.24.0+
- PostgreSQL 15+
- Redis 7+（可选，用于缓存）

#### 使用开发脚本（推荐）

```bash
# 完整启动流程（启动数据库 + 迁移）
./scripts/dev-start.sh all

# 导入种子数据（可选）
./scripts/dev-start.sh seed

# 启动后端
./scripts/dev-start.sh backend

# 启动前端（新终端）
./scripts/dev-start.sh frontend
```

#### 手动启动

```bash
# 1. 安装依赖
pnpm install

# 2. 启动数据库（使用 Docker）
docker-compose -f docker-compose.dev.yml up -d

# 3. 配置环境变量
cp packages/backend/.env.example packages/backend/.env

# 4. 数据库迁移
pnpm prisma:migrate

# 5. 生成 Prisma Client
pnpm prisma:generate

# 6. 导入种子数据（可选）
pnpm --filter @danci/backend prisma:seed

# 7. 启动开发服务器
pnpm dev
```

服务地址：
- 前端：`http://localhost:5173`
- 后端：`http://localhost:3000`

## 项目结构

```
danci/
├── packages/
│   ├── frontend/           # 前端应用 (@danci/frontend)
│   │   ├── src/
│   │   │   ├── components/ # React 组件
│   │   │   ├── pages/      # 页面组件
│   │   │   ├── services/   # 业务服务 + 算法引擎
│   │   │   ├── hooks/      # 自定义 Hooks
│   │   │   ├── contexts/   # React Context
│   │   │   └── types/      # 类型定义
│   │   └── vite.config.ts
│   │
│   ├── backend/            # 后端服务 (@danci/backend)
│   │   ├── src/
│   │   │   ├── amas/       # AMAS 智能学习算法
│   │   │   │   ├── perception/   # 感知层
│   │   │   │   ├── modeling/     # 建模层（注意力、疲劳、动机）
│   │   │   │   ├── learning/     # 学习层（LinUCB、Thompson）
│   │   │   │   ├── decision/     # 决策层
│   │   │   │   ├── evaluation/   # 评估层
│   │   │   │   └── optimization/ # 优化层（贝叶斯优化）
│   │   │   ├── routes/     # API 路由（32 个模块）
│   │   │   ├── services/   # 业务服务（41 个服务）
│   │   │   ├── middleware/ # 中间件
│   │   │   ├── validators/ # Zod 数据验证
│   │   │   ├── workers/    # 后台任务
│   │   │   ├── monitoring/ # 监控与告警
│   │   │   └── logger/     # Pino 日志系统
│   │   ├── tests/          # 后端测试
│   │   └── prisma/         # 数据库模型
│   │
│   ├── native/             # Rust 原生模块 (@danci/native)
│   │   ├── src/            # Rust 源码
│   │   └── __test__/       # Native 模块测试
│   │
│   └── shared/             # 共享代码 (@danci/shared)
│       └── src/types/      # 共享类型定义
│
├── tests/
│   └── e2e/                # Playwright E2E 测试
│
├── docs/                   # 项目文档
│   ├── operations/         # 运维文档
│   └── tech-debt/          # 技术债务追踪
│
├── scripts/                # 部署脚本
│   ├── dev-start.sh        # 开发环境启动脚本
│   ├── docker-start.sh     # Docker 部署脚本
│   ├── deploy-backend.sh   # 后端部署脚本
│   └── deploy-frontend.sh  # 前端部署脚本
│
├── infrastructure/         # 基础设施配置
│
├── docker-compose.yml      # 生产环境 Docker 配置
├── docker-compose.dev.yml  # 开发环境数据库配置
├── docker-compose.test.yml # 测试环境配置
├── turbo.json              # Turborepo 配置
├── pnpm-workspace.yaml     # pnpm 工作空间配置
└── playwright.config.ts    # Playwright 配置
```

## API 路由概览

### 认证 `/api/auth`
- `POST /register` - 用户注册
- `POST /login` - 用户登录
- `POST /logout` - 退出登录

### 用户 `/api/users`
- `GET /me` - 获取当前用户信息
- `PUT /me/password` - 修改密码
- `GET /me/statistics` - 获取用户统计

### 单词 `/api/words`
- `GET /` - 获取用户单词列表
- `POST /` - 添加单词
- `POST /batch` - 批量添加单词

### AMAS `/api/amas`
- `POST /process` - 处理学习事件
- `GET /state` - 获取用户 AMAS 状态
- `GET /strategy` - 获取学习策略

### 学习 `/api/learning`
- `GET /study-words` - 获取学习单词
- `POST /next-words` - 获取下一批单词
- `POST /session` - 创建学习会话

> 完整 API 文档请参考 [packages/backend/API.md](./packages/backend/API.md)

## 前端页面路由

### 公开路由
| 路由 | 页面 | 说明 |
|------|------|------|
| `/login` | LoginPage | 登录页面 |
| `/register` | RegisterPage | 注册页面 |

### AMAS 公开展示路由（无需登录）
| 路由 | 页面 | 说明 |
|------|------|------|
| `/about` | AboutHomePage | AMAS 引擎介绍 |
| `/about/dashboard` | DashboardPage | 决策仪表盘 |
| `/about/simulation` | SimulationPage | 决策模拟器 |
| `/about/stats` | StatsPage | 系统统计 |
| `/about/system-status` | SystemStatusPage | 系统状态 |

### 受保护路由（需要认证）
| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | LearningPage | 主学习页面 |
| `/vocabulary` | VocabularyPage | 词库管理 |
| `/wordbooks/:id` | WordBookDetailPage | 词书详情 |
| `/word-list` | WordListPage | 单词列表 |
| `/word-mastery` | WordMasteryPage | 单词掌握度分析 |
| `/history` | HistoryPage | 学习历史 |
| `/statistics` | StatisticsPage | 学习统计 |
| `/profile` | ProfilePage | 个人中心 |
| `/study-settings` | StudySettingsPage | 学习设置 |
| `/learning-objectives` | LearningObjectivesPage | 学习目标 |
| `/today-words` | TodayWordsPage | 今日单词 |
| `/progress` | StudyProgressPage | 学习进度 |

### AMAS 增强功能路由（需要认证）
| 路由 | 页面 | 说明 |
|------|------|------|
| `/learning-time` | LearningTimePage | 学习时间推荐 |
| `/trend-report` | TrendReportPage | 趋势报告 |
| `/achievements` | AchievementPage | 成就徽章 |
| `/badges` | BadgeGalleryPage | 徽章画廊 |
| `/plan` | PlanPage | 智能学习计划 |
| `/habit-profile` | HabitProfilePage | 习惯画像 |
| `/learning-profile` | LearningProfilePage | 学习画像 |

### 管理员后台路由（需要管理员权限）
| 路由 | 页面 | 说明 |
|------|------|------|
| `/admin` | AdminDashboard | 管理后台首页 |
| `/admin/users` | UserManagementPage | 用户管理 |
| `/admin/users/:userId` | UserDetailPage | 用户详情 |
| `/admin/users/:userId/words` | WordDetailPage | 用户单词详情 |
| `/admin/wordbooks` | AdminWordBooks | 词库管理 |
| `/admin/batch-import` | BatchImportPage | 批量导入 |
| `/admin/algorithm-config` | AlgorithmConfigPage | 算法配置 |
| `/admin/config-history` | ConfigHistoryPage | 配置历史 |
| `/admin/experiments` | ExperimentDashboard | A/B 测试仪表盘 |
| `/admin/logs` | LogViewerPage | 日志查看器 |
| `/admin/log-alerts` | LogAlertsPage | 日志告警 |
| `/admin/optimization` | OptimizationDashboard | 优化仪表盘 |
| `/admin/causal-analysis` | CausalInferencePage | 因果推断分析 |
| `/admin/llm-advisor` | LLMAdvisorPage | LLM 顾问 |
| `/admin/amas-explainability` | AMASExplainabilityPage | AMAS 可解释性 |

## 开发命令

### 根目录命令（Turborepo）

```bash
# 开发
pnpm dev                    # 启动所有服务开发模式
pnpm dev:frontend           # 仅启动前端
pnpm dev:backend            # 仅启动后端

# 构建
pnpm build                  # 构建所有包
pnpm clean                  # 清理所有构建产物

# 测试
pnpm test                   # 运行所有测试
pnpm test:coverage          # 运行测试并生成覆盖率

# 按包测试
pnpm test:frontend          # 前端测试
pnpm test:backend           # 后端测试
pnpm test:e2e               # E2E 测试

# CI 分步测试
pnpm test:1:backend-services    # Step 1: 后端服务测试
pnpm test:2:backend-amas        # Step 2: AMAS 模块测试
pnpm test:3:backend-api         # Step 3: API 集成测试
pnpm test:4:frontend-components # Step 4: 前端组件测试
pnpm test:5:frontend-pages      # Step 5: 前端页面测试
pnpm test:6:e2e                 # Step 6: E2E 测试

# 数据库
pnpm prisma:generate        # 生成 Prisma Client
pnpm prisma:migrate         # 运行数据库迁移
pnpm prisma:studio          # 打开 Prisma Studio

# Docker
pnpm docker:build           # 构建 Docker 镜像
pnpm docker:up              # 启动容器
pnpm docker:down            # 停止容器
```

### 前端包命令

```bash
pnpm --filter @danci/frontend dev           # 开发服务器
pnpm --filter @danci/frontend build         # 生产构建
pnpm --filter @danci/frontend test          # 运行测试
pnpm --filter @danci/frontend test:watch    # 监听模式
pnpm --filter @danci/frontend test:components  # 组件测试
pnpm --filter @danci/frontend test:pages       # 页面测试
```

### 后端包命令

```bash
pnpm --filter @danci/backend dev            # 开发服务器
pnpm --filter @danci/backend build          # 生产构建
pnpm --filter @danci/backend test           # 运行所有测试
pnpm --filter @danci/backend test:unit      # 单元测试
pnpm --filter @danci/backend test:integration # 集成测试
pnpm --filter @danci/backend test:performance # 性能测试
pnpm --filter @danci/backend prisma:studio    # 数据库管理
```

## 测试覆盖

| 层级 | 测试类型 | 说明 |
|------|----------|------|
| **后端单元测试** | Services, AMAS, Middleware | 业务逻辑、算法、中间件 |
| **后端集成测试** | API Routes | RESTful API 完整测试 |
| **后端性能测试** | Performance | 性能基准测试 |
| **前端组件测试** | Components | UI 组件测试 |
| **前端页面测试** | Pages | 页面级测试 |
| **前端服务测试** | Services, Hooks | 业务逻辑、Hooks |
| **E2E 测试** | Playwright | 用户流程全链路测试 |
| **Native 测试** | Rust Module | LinUCB 算法测试 |

运行完整测试套件：

```bash
# 所有单元测试
pnpm test

# E2E 测试（需先启动服务）
pnpm test:e2e

# 带覆盖率
pnpm test:coverage
```

## 环境变量配置

### 后端核心配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接串 | **必需** |
| `JWT_SECRET` | JWT 签名密钥 | **生产必需** |
| `PORT` | 服务端口 | `3000` |
| `NODE_ENV` | 运行环境 | `development` |
| `REDIS_URL` | Redis 连接串 | `redis://localhost:6379` |
| `CORS_ORIGIN` | CORS 来源 | `http://localhost:5173` |

### 前端配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_API_URL` | 后端 API 地址 | - |
| `VITE_SENTRY_DSN` | Sentry DSN（可选） | - |

> 完整环境变量说明请参考各包目录下的 `.env.example` 文件

## 文档

| 文档 | 说明 |
|------|------|
| [packages/backend/API.md](./packages/backend/API.md) | API 接口文档 |
| [packages/backend/DEPLOYMENT.md](./packages/backend/DEPLOYMENT.md) | 部署指南 |
| [packages/backend/SETUP.md](./packages/backend/SETUP.md) | 开发环境配置 |
| [docs/AMAS-Technical-Documentation.md](./docs/AMAS-Technical-Documentation.md) | AMAS 技术文档 |
| [docs/AMAS_ARCHITECTURE.md](./docs/AMAS_ARCHITECTURE.md) | AMAS 架构蓝图 |
| [docs/TESTING.md](./docs/TESTING.md) | 测试文档 |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 系统架构 |
| [docs/queue-optimization-design.md](./docs/queue-optimization-design.md) | 队列优化设计 |
| [docs/monitoring-sampling-strategy.md](./docs/monitoring-sampling-strategy.md) | 监控采样策略 |
| [docs/batch-import-guide.md](./docs/batch-import-guide.md) | 词库批量导入指南 |
| [docs/operations/operations-runbook.md](./docs/operations/operations-runbook.md) | 运维手册 |
| [docs/operations/deployment-checklist.md](./docs/operations/deployment-checklist.md) | 部署检查清单 |

## 许可证

MIT License
