# 智能词汇学习应用

一个基于 **AMAS 自适应学习算法** 的全栈英语单词学习应用，支持用户认证、云端同步、智能学习推荐、成就系统等功能。

## 核心特性

### 智能学习系统 (AMAS)
- **自适应学习算法** - 基于 LinUCB 强化学习的多维度用户状态感知系统
- **四维状态监测** - 实时追踪注意力(A)、疲劳度(F)、认知能力(C)、动机(M)
- **学习时机推荐** - 分析 24 小时学习效率，智能推荐黄金学习时段
- **趋势分析报告** - 正确率、响应时间、动机趋势追踪与干预建议
- **延迟奖励系统** - 基于间隔重复的异步奖励更新机制
- **决策可解释性** - 决策解释、学习曲线可视化、反事实分析

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
- **Prometheus 指标** - 决策延迟、错误率、队列深度等核心指标
- **告警系统** - 阈值告警、趋势告警、Webhook 通知
- **决策流水线** - 六阶段可视化（感知→建模→学习→决策→评估→优化）

### 实验与优化
- **A/B 测试系统** - Thompson Sampling vs LinUCB 实验框架
- **贝叶斯优化** - 超参数自动调优
- **因果推断** - 学习策略效果评估

### 基础功能
- **用户认证** - JWT 令牌认证，支持注册、登录、会话管理
- **云端同步** - 多设备数据同步，离线优先策略
- **词库管理** - 系统词书 + 用户自定义词书，支持批量导入
- **学习测试** - 选择题测试，实时反馈，键盘快捷键支持
- **发音功能** - 单词发音播放，支持 Web Speech API

### 管理后台
- **用户管理** - 用户列表、统计、数据导出
- **词库管理** - 系统词库创建和维护
- **算法配置** - AMAS 算法参数在线调整
- **配置历史** - 参数变更追踪和审计
- **实验仪表盘** - A/B 测试管理与分析

## 技术栈

### 前端
| 技术 | 说明 |
|------|------|
| React 18 | UI 框架 |
| TypeScript | 类型安全 |
| Vite | 构建工具 |
| Tailwind CSS | 样式框架 |
| React Router v6 | 路由管理 |
| IndexedDB (Dexie.js) | 本地存储 |
| Vitest | 单元测试 |

### 后端
| 技术 | 说明 |
|------|------|
| Node.js 20+ | 运行时 |
| Express | Web 框架 |
| TypeScript | 类型安全 |
| PostgreSQL 15 + TimescaleDB | 数据库 |
| Redis 7 | 缓存层 |
| Prisma | ORM |
| JWT + bcrypt | 认证加密 |
| Zod | 数据验证 |
| node-cron | 后台任务 |
| Pino | 结构化日志 |

### 测试
| 技术 | 说明 |
|------|------|
| Vitest | 单元/集成测试 |
| Playwright | E2E 测试 |
| Testing Library | React 组件测试 |
| Supertest | API 测试 |
| MSW | Mock Service Worker |

## 快速开始

### 方式一：Docker Compose（推荐）

```bash
# 启动所有服务（PostgreSQL + Redis + 后端 + 前端）
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

服务地址：
- 前端：`http://localhost:5173`
- 后端 API：`http://localhost:3000`
- 数据库管理：`npx prisma studio`（需在 backend 目录执行）

### 方式二：本地开发

#### 环境要求
- Node.js 20+
- PostgreSQL 15+
- Redis 7+（可选，用于缓存）
- npm 或 yarn

#### 后端启动

```bash
cd backend
npm install
cp .env.example .env  # 配置数据库连接
npx prisma migrate dev
npx prisma db seed     # 初始化种子数据
npm run dev
```

后端运行在 `http://localhost:3000`

#### 前端启动

```bash
npm install
echo "VITE_API_URL=http://localhost:3000" > .env.local
npm run dev
```

前端运行在 `http://localhost:5173`

## 项目结构

```
├── src/                    # 前端源码
│   ├── components/         # React 组件
│   │   └── __tests__/      # 组件测试
│   ├── pages/              # 页面组件
│   │   ├── about/          # AMAS 仪表盘、模拟、统计
│   │   ├── admin/          # 管理后台页面
│   │   └── __tests__/      # 页面测试
│   ├── services/           # 业务服务
│   │   └── algorithms/     # 学习算法引擎
│   ├── hooks/              # 自定义 Hooks
│   ├── contexts/           # React Context
│   └── types/              # 类型定义
├── backend/                # 后端源码
│   ├── src/
│   │   ├── amas/           # AMAS 智能学习算法
│   │   │   ├── modeling/   # 状态建模（注意力、疲劳、动机）
│   │   │   ├── learning/   # 学习算法（LinUCB、Thompson）
│   │   │   ├── decision/   # 决策引擎
│   │   │   └── evaluation/ # 评估与优化
│   │   ├── routes/         # API 路由
│   │   ├── services/       # 业务服务
│   │   ├── monitoring/     # 监控与告警
│   │   ├── middleware/     # 中间件
│   │   └── validators/     # 数据验证
│   ├── tests/              # 后端测试
│   │   ├── unit/           # 单元测试
│   │   └── integration/    # 集成测试
│   └── prisma/             # 数据库模型
├── tests/                  # E2E 测试
│   └── e2e/                # Playwright 测试用例
├── docker/                 # Docker 配置
├── docs/                   # 项目文档
│   ├── operations/         # 运维文档
│   └── tech-debt/          # 技术债务追踪
└── scripts/                # 部署脚本
```

## 前端页面路由

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | LearningPage | 主学习页面 |
| `/vocabulary` | VocabularyPage | 词库管理 |
| `/wordbook/:id` | WordBookDetailPage | 词书详情 |
| `/statistics` | StatisticsPage | 学习统计 |
| `/profile` | ProfilePage | 个人中心（含习惯画像） |
| `/word-mastery` | WordMasteryPage | 单词掌握度分析 |
| `/habit-profile` | HabitProfilePage | 习惯画像详情 |
| `/trend-report` | TrendReportPage | 趋势报告 |
| `/learning-time` | LearningTimePage | 学习时间推荐 |
| `/plan` | PlanPage | 智能学习计划 |
| `/achievement` | AchievementPage | 成就徽章 |
| `/about` | AboutHomePage | AMAS 引擎介绍 |
| `/about/dashboard` | DashboardPage | 决策仪表盘 |
| `/about/simulation` | SimulationPage | 决策模拟器 |
| `/about/stats` | StatsPage | 系统统计 |
| `/admin` | AdminDashboard | 管理后台首页 |
| `/admin/users` | AdminUsers | 用户管理 |
| `/admin/wordbooks` | AdminWordBooks | 词库管理 |
| `/admin/algorithm-config` | AlgorithmConfigPage | 算法配置 |
| `/admin/experiment-dashboard` | ExperimentDashboard | A/B 测试仪表盘 |

## 文档

| 文档 | 说明 |
|------|------|
| [backend/API.md](./backend/API.md) | API 接口文档 |
| [backend/DEPLOYMENT.md](./backend/DEPLOYMENT.md) | 部署指南 |
| [backend/SETUP.md](./backend/SETUP.md) | 开发环境配置 |
| [docs/AMAS-Technical-Documentation.md](./docs/AMAS-Technical-Documentation.md) | AMAS 技术文档 |
| [docs/AMAS_ARCHITECTURE.md](./docs/AMAS_ARCHITECTURE.md) | AMAS 架构蓝图 |
| [docs/queue-optimization-design.md](./docs/queue-optimization-design.md) | 队列优化设计 |
| [docs/monitoring-sampling-strategy.md](./docs/monitoring-sampling-strategy.md) | 监控采样策略 |
| [docs/batch-import-guide.md](./docs/batch-import-guide.md) | 词库批量导入指南 |
| [docs/operations/operations-runbook.md](./docs/operations/operations-runbook.md) | 运维手册 |
| [docs/operations/deployment-checklist.md](./docs/operations/deployment-checklist.md) | 部署检查清单 |

## 开发命令

```bash
# 前端
npm run dev              # 开发服务器
npm run build            # 生产构建
npm test                 # 运行单元测试
npm run test:watch       # 监听模式测试
npm run test:coverage    # 测试覆盖率
npm run test:e2e         # E2E 测试（无头模式）
npm run test:e2e:ui      # E2E 测试（UI 模式）

# 后端
cd backend
npm run dev              # 开发服务器
npm run build            # 生产构建
npm test                 # 运行所有测试
npm run test:unit        # 仅单元测试
npm run test:integration # 仅集成测试
npm run test:coverage    # 测试覆盖率
npx prisma studio        # 数据库管理界面
npx prisma db seed       # 运行种子脚本
```

## 测试覆盖

| 层级 | 测试文件数 | 说明 |
|------|-----------|------|
| 前端单元测试 | 71 | Pages、Components、Hooks、Services |
| 后端测试 | 107 | Unit + Integration（AMAS、Services、Routes） |
| E2E 测试 | 8 | 用户流程全链路测试 |

运行完整测试套件：

```bash
# 前端 + 后端单元测试
npm test && cd backend && npm test

# E2E 测试（需先启动后端）
npm run test:e2e
```

## 许可证

MIT License
