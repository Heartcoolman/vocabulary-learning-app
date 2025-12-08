# 项目架构文档

## 概述

Danci 是一个基于 AMAS（Adaptive Memory Acquisition System，自适应记忆习得系统）的智能单词学习应用。采用 Monorepo 架构，前后端分离设计，支持自适应学习、用户画像、成就系统等高级功能。

## 技术栈概览

| 层级     | 技术选型                        |
| -------- | ------------------------------- |
| 前端框架 | React 18 + TypeScript           |
| 状态管理 | React Query + Zustand + Context |
| 样式方案 | Tailwind CSS + Framer Motion    |
| 后端框架 | Express.js + TypeScript         |
| 数据库   | PostgreSQL + TimescaleDB        |
| 缓存     | Redis                           |
| ORM      | Prisma                          |
| 原生模块 | Rust + napi-rs                  |
| 构建工具 | Turborepo + Vite + pnpm         |

## 目录结构

```
danci/
├── packages/                    # Monorepo 包目录
│   ├── frontend/               # 前端应用 (@danci/frontend)
│   │   ├── src/
│   │   │   ├── components/     # React 组件
│   │   │   │   ├── ui/         # 基础 UI 组件（Modal, Toast）
│   │   │   │   ├── admin/      # 管理后台组件
│   │   │   │   ├── badges/     # 徽章相关组件
│   │   │   │   ├── dashboard/  # 仪表盘组件
│   │   │   │   ├── explainability/ # 可解释性组件
│   │   │   │   ├── profile/    # 用户画像组件
│   │   │   │   ├── progress/   # 进度相关组件
│   │   │   │   └── word-mastery/ # 单词掌握度组件
│   │   │   ├── pages/          # 页面组件
│   │   │   ├── hooks/          # 自定义 Hooks
│   │   │   │   ├── queries/    # React Query 查询 Hooks
│   │   │   │   └── mutations/  # React Query 变更 Hooks
│   │   │   ├── services/       # 业务服务
│   │   │   │   ├── client/     # 模块化 API 客户端
│   │   │   │   ├── algorithms/ # 前端算法引擎
│   │   │   │   └── learning/   # 学习队列管理
│   │   │   ├── contexts/       # React Context
│   │   │   ├── routes/         # 路由配置
│   │   │   ├── types/          # TypeScript 类型定义
│   │   │   ├── lib/            # 库配置（queryClient）
│   │   │   ├── config/         # 应用配置
│   │   │   └── utils/          # 工具函数
│   │   └── tests/              # 前端测试
│   │
│   ├── backend/                # 后端服务 (@danci/backend)
│   │   ├── src/
│   │   │   ├── amas/           # AMAS 智能学习引擎
│   │   │   │   ├── engine/     # 核心引擎（模块化拆分）
│   │   │   │   ├── perception/ # 感知层
│   │   │   │   ├── modeling/   # 建模层
│   │   │   │   ├── learning/   # 学习层（LinUCB, Thompson Sampling）
│   │   │   │   ├── decision/   # 决策层
│   │   │   │   ├─��� evaluation/ # 评估层
│   │   │   │   ├── optimization/ # 优化层（贝叶斯优化）
│   │   │   │   ├── monitoring/ # 监控层
│   │   │   │   ├── versioning/ # 模型版本管理
│   │   │   │   ├── workers/    # Worker 线程池
│   │   │   │   └── repositories/ # 数据仓库
│   │   │   ├── routes/         # API 路由（32+ 模块）
│   │   │   ├── services/       # 业务服务（41+ 服务）
│   │   │   ├── middleware/     # Express 中间件
│   │   │   ├── validators/     # Zod 数据验证器
│   │   │   ├── monitoring/     # 系统监控
│   │   │   ├── logger/         # Pino 日志系统
│   │   │   └── config/         # 配置管理
│   │   ├── tests/              # 后端测试
│   │   │   ├── unit/           # 单元测试
│   │   │   ├── integration/    # 集成测试
│   │   │   └── performance/    # 性能测试
│   │   └── prisma/             # 数据库模型
│   │
│   ├── native/                 # Rust 原生模块 (@danci/native)
│   │   └── src/                # LinUCB 高性能实现
│   │
│   └── shared/                 # 共享代码 (@danci/shared)
│       └── src/types/          # 共享类型定义
│
├── tests/
│   └── e2e/                    # Playwright E2E 测试
│
├── docs/                       # 项目文档
├── scripts/                    # 部署脚本
├── infrastructure/             # 基础设施配置
└── docker/                     # Docker 配置
```

## 核心模块关系

### 前端架构

```
┌─────────────────────────────────────────────────────────────┐
│                        App.tsx                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  QueryClientProvider (React Query)                       ││
│  │  ├── BrowserRouter (React Router)                        ││
│  │  │   ├── AuthProvider (认证上下文)                        ││
│  │  │   │   └── ToastProvider (通知上下文)                   ││
│  │  │   │       └── AppContent (应用主体)                    ││
│  │  │   │           ├── Navigation                          ││
│  │  │   │           └── AppRoutes                           ││
└──┴───┴───┴───────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     数据流架构                                │
├─────────────────────────────────────────────────────────────┤
│  Pages (页面)                                                │
│    ↓ 使用                                                    │
│  Hooks (queries/mutations)                                   │
│    ↓ 调用                                                    │
│  Services/Client (API 客户端)                                │
│    ↓ HTTP                                                    │
│  Backend API                                                 │
└─────────────────────────────────────────────────────────────┘
```

### 后端架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Express Application                       │
├─────────────────────────────────────────────────────────────┤
│  Middleware 层                                               │
│  ├── 认证中间件 (auth.middleware)                            │
│  ├── 验证中间件 (validate.middleware)                        │
│  ├── 错误处理中间件 (error.middleware)                       │
│  ├── 管理员中间件 (admin.middleware)                         │
│  └── 指标中间件 (metrics.middleware)                         │
├─────────────────────────────────────────────────────────────┤
│  Routes 层 (32+ 路由模块)                                    │
│  ├── auth, users, words, wordbooks                          │
│  ├── learning, amas, records                                │
│  ├── admin, algorithm-config, experiments                   │
│  ├── badges, plan, habit-profile                            │
│  └── evaluation, optimization, llm-advisor                  │
├─────────────────────────────────────────────────────────────┤
│  Services 层 (41+ 业务服务)                                  │
│  ├── 核心服务: auth, user, word, learning                   │
│  ├── AMAS 服务: amas-engine, decision-recorder              │
│  └── 支撑服务: redis-cache, answer-buffer                   │
├─────────────────────────────────────────────────────────────┤
│  AMAS Engine (核心引擎)                                      │
│  详见下方 AMAS 架构图                                        │
├─────────────────────────────────────────────────────────────┤
│  Data Layer                                                  │
│  ├── Prisma ORM                                              │
│  ├── PostgreSQL + TimescaleDB                               │
│  └── Redis Cache                                             │
└─────────────────────────────────────────────────────────────┘
```

### AMAS 六层 Pipeline 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    AMAS Engine Core                          │
│                   (engine-core.ts - Facade)                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 感知层 (Perception)                                      │
│     └── feature-builder.ts - 特征向量构建                    │
│                    ↓                                         │
│  2. 建模层 (Modeling)                                        │
│     ├── attention-monitor.ts - 注意力监测                    │
│     ├── fatigue-estimator.ts - 疲劳度估计                    │
│     ├── motivation-tracker.ts - 动机追踪                     │
│     ├── chronotype.ts - 生物钟分析                           │
│     ├── learning-style.ts - 学习风格建模                     │
│     ├── cognitive-profiler.ts - 认知能力画像                 │
│     ├── habit-recognizer.ts - 习惯识别                       │
│     └── forgetting-curve.ts - 遗忘曲线                       │
│                    ↓                                         │
│  3. 学习层 (Learning)                                        │
│     ├── linucb.ts - LinUCB 算法                             │
│     ├── linucb-async.ts - 异步 LinUCB                       │
│     ├── thompson-sampling.ts - Thompson Sampling             │
│     └── coldstart.ts - 冷启动管理                            │
│                    ↓                                         │
│  4. 决策层 (Decision)                                        │
│     ├── mapper.ts - 策略映射                                 │
│     ├── guardrails.ts - 安全护栏                             │
│     ├── ensemble.ts - 集成决策                               │
│     ├── fallback.ts - 降级策略                               │
│     └── explain.ts - 决策解释                                │
│                    ↓                                         │
│  5. 评估层 (Evaluation)                                      │
│     ├── word-mastery-evaluator.ts - 掌握度评估               │
│     ├── delayed-reward-aggregator.ts - 延迟奖励              │
│     └── causal-inference.ts - 因果推断                       │
│                    ↓                                         │
│  6. 优化层 (Optimization)                                    │
│     ├── bayesian-optimizer.ts - 贝叶斯优化                   │
│     ├── multi-objective-optimizer.ts - 多目标优化            │
│     └── llm-advisor/ - LLM 顾问系统                          │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  支撑模块                                                    │
│  ├── monitoring/ - 监控与告警                                │
│  ├── versioning/ - 模型版本管理                              │
│  ├── workers/ - Worker 线程池 (Piscina)                      │
│  └── repositories/ - 数据仓库（缓存策略）                     │
└─────────────────────────────────────────────────────────────┘
```

## 数据流说明

### 学习事件处理流程

```
用户答题
    ↓
前端 useMasteryLearning Hook
    ↓
useSubmitAnswer Mutation
    ↓
POST /api/amas/process
    ↓
AMAS Engine.process()
    ├── 1. 感知：构建特征向量
    ├── 2. 建模：更新用户状态（注意力、疲劳、动机）
    ├── 3. 学习：LinUCB/Thompson Sampling 选择动作
    ├── 4. 决策：映射为具体学习策略
    ├── 5. 评估：计算奖励，更新掌握度
    └── 6. 优化：异步模型优化
    ↓
返回 LearningStrategy
    ↓
前端更新 UI 和状态
```

### 缓存策略数据流

```
┌─────────────────────────────────────────────────────────────┐
│                      读请求流程                              │
├���────────────────────────────────────────────────────────────┤
│  Client Request                                              │
│       ↓                                                      │
│  Redis 缓存检查                                              │
│       ├── 命中 → 返回缓存数据                                │
│       └── 未命中 ↓                                           │
│            获取分布式锁（防止缓存击穿）                       │
│                 ↓                                            │
│            查询数据库                                        │
│                 ↓                                            │
│            写入缓存（带 TTL 抖动防雪崩）                      │
│                 ↓                                            │
│            释放锁 → 返回数据                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────��───────────────────────────────────────┐
│                      写请求流程                              │
├─────────────────────────────────────────────────────────────┤
│  Client Request                                              │
│       ↓                                                      │
│  AnswerBufferService（答题记录缓冲）                         │
│       ↓                                                      │
│  累积到阈值（100条）或超时（5秒）                            │
│       ↓                                                      │
│  批量写入 PostgreSQL                                         │
│       ↓                                                      │
│  失效相关缓存                                                │
└─────────────────────────────────────────────────────────────┘
```

## 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Production Environment                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐           │
│  │  Nginx   │ →    │ Frontend │      │ Sentry   │           │
│  │  (CDN)   │      │ (Static) │      │(Monitoring)│          │
│  └──────────┘      └──────────┘      └──────────┘           │
│       ↓                                                      │
│  ┌──────────────────────────────────────────────────┐       │
│  │              Backend Service                      │       │
│  │  ┌────────┐  ┌────────┐  ┌────────┐             │       │
│  │  │Express │  │ AMAS   │  │ Worker │             │       │
│  │  │ Server │  │ Engine │  │  Pool  │             │       │
│  │  └────────┘  └────────┘  └────────┘             │       │
│  └──────────────────────────────────────────────────┘       │
│       ↓                    ↓                                 │
│  ┌──────────┐      ┌──────────────────┐                     │
│  │  Redis   │      │   PostgreSQL     │                     │
│  │  Cache   │      │  + TimescaleDB   │                     │
│  └──────────┘      └──────────────────┘                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 性能指标

| 操作                   | 目标阈值 | 实际性能 |
| ---------------------- | -------- | -------- |
| ColdStart Select       | < 5ms    | ~0.002ms |
| ColdStart Update       | < 10ms   | ~0.001ms |
| Feature Vector Build   | < 2ms    | ~0.002ms |
| Matrix-Vector Multiply | < 1ms    | ~0.005ms |
| Rank-1 Update          | < 2ms    | ~0.002ms |
| API P95 响应           | < 100ms  | ~50ms    |

## 扩展性设计

### 水平扩展

- **无状态后端**：会话数据存储在 Redis，支持多实例部署
- **Worker 池**：计算密集型任务分离到 Worker 线程
- **数据库分片**：TimescaleDB 自动按时间分区

### 垂直扩展

- **算法热插拔**：支持在运行时切换学习算法
- **模块化引擎**：各层独立，便于单独优化
- **配置化策略**：核心参数支持在线调整

## 相关文档

- [API 文档](./API.md)
- [组件文档](./COMPONENTS.md)
- [状态管理文档](./STATE_MANAGEMENT.md)
- [开发指南](./DEVELOPMENT.md)
- [AMAS 技术文档](./AMAS-Technical-Documentation.md)
