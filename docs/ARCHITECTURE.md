# 单词学习系统架构文档

## 概述

本项目是一个基于自适应学习算法（AMAS）的单词学习系统，采用前后端分离架构。

## 技术栈

### 后端
- **框架**: Express.js + TypeScript
- **数据库**: PostgreSQL + TimescaleDB (时序数据)
- **缓存**: Redis
- **ORM**: Prisma
- **测试**: Vitest

### 前端
- **框架**: React 18 + TypeScript
- **状态管理**: React Context + Custom Hooks
- **路由**: React Router v6
- **UI**: Tailwind CSS + Framer Motion
- **测试**: Vitest + React Testing Library

## 项目结构

```
packages/
├── backend/
│   ├── src/
│   │   ├── amas/                 # AMAS 自适应学习算法
│   │   │   ├── engine/           # 核心引擎（已模块化拆分）
│   │   │   │   ├── engine-core.ts           # Facade 入口
│   │   │   │   ├── engine-persistence.ts    # 状态持久化
│   │   │   │   ├── engine-decision-trace.ts # 决策轨迹记录
│   │   │   │   ├── engine-reward-cache.ts   # 奖励配置缓存
│   │   │   │   ├── engine-feature-vector.ts # 特征向量构建
│   │   │   │   ├── engine-resilience.ts     # 弹性保护
│   │   │   │   ├── engine-isolation.ts      # 用户隔离
│   │   │   │   ├── engine-modeling.ts       # 建模层协调
│   │   │   │   └── engine-learning.ts       # 学习层协调
│   │   │   ├── learning/         # 学习算法
│   │   │   │   ├── linucb.ts               # LinUCB 算法
│   │   │   │   ├── linucb-async.ts         # LinUCB 异步版本
│   │   │   │   ├── thompson-sampling.ts    # Thompson Sampling
│   │   │   │   └── coldstart.ts            # 冷启动管理
│   │   │   ├── workers/          # Worker 池
│   │   │   │   ├── pool.ts                 # Piscina 池配置
│   │   │   │   └── compute.worker.ts       # 计算 Worker
│   │   │   └── ...
│   │   ├── services/             # 业务服务
│   │   │   ├── redis-cache.service.ts      # Redis 缓存（含防护策略）
│   │   │   ├── answer-buffer.service.ts    # 答题缓冲写入
│   │   │   └── ...
│   │   └── routes/               # API 路由
│   └── tests/
│       ├── unit/                 # 单元测试
│       ├── integration/          # 集成测试
│       └── performance/          # 性能测试
│
└── frontend/
    ├── src/
    │   ├── routes/               # 路由配置（已外置）
    │   │   ├── types.ts
    │   │   ├── public.routes.tsx
    │   │   ├── user.routes.tsx
    │   │   ├── admin.routes.tsx
    │   │   └── about.routes.tsx
    │   ├── hooks/                # 自定义 Hooks
    │   │   ├── useDialogPauseTracking.ts
    │   │   ├── useTestOptions.ts
    │   │   ├── useAutoPlayPronunciation.ts
    │   │   └── ...
    │   ├── pages/                # 页面组件
    │   └── components/           # 通用组件
    └── tests/                    # 前端测试

tests/
└── e2e/                          # E2E 测试 (Playwright)
    ├── learning-flow.spec.ts
    └── amas-decision.spec.ts
```

## 核心模块

### 1. AMAS Engine

AMAS (Adaptive Memory Acquisition System) 是核心的自适应学习引擎。

#### 架构设计原则
- **Facade 模式**: `engine-core.ts` 作为统一入口
- **依赖注入**: 所有子模块通过构造函数注入
- **职责分离**: 每个模块专注单一职责

#### 6 层 Pipeline 流程
1. **感知层** - 特征提取
2. **建模层** - 状态推断
3. **学习层** - 动作选择
4. **决策层** - 策略映射
5. **执行层** - 返回结果
6. **反馈层** - 模型更新

### 2. 学习算法

| 算法 | 用途 | 复杂度 |
|------|------|--------|
| LinUCB | 上下文赌博机，探索-利用平衡 | O(d²) |
| Thompson Sampling | 贝叶斯采样，概率选择 | O(k) |
| ColdStart | 新用户快速分类 | O(1) |

### 3. Redis 缓存策略

实现了三重防护：

```typescript
// 穿透防护 - 空值缓存
getOrSet(key, fetcher, ttl)

// 击穿防护 - 分布式锁
getOrSetWithLock(key, fetcher, ttl)

// 雪崩防护 - TTL 抖动
setWithJitter(key, value, baseTTL)  // ±10% TTL
```

### 4. 批量写入优化

```typescript
// 答题记录缓冲服务
AnswerBufferService
- 阈值: 100 条或 5 秒
- Redis Stream 暂存
- 批量写入数据库
- 优雅关闭支持
```

## 性能指标

| 操作 | 阈值 | 实测 |
|------|------|------|
| ColdStart Select | < 5ms | ~0.002ms |
| ColdStart Update | < 10ms | ~0.001ms |
| Feature Vector Build | < 2ms | ~0.002ms |
| Matrix-Vector Multiply | < 1ms | ~0.005ms |
| Rank-1 Update | < 2ms | ~0.002ms |

## 测试覆盖

| 包 | 测试文件 | 测试用例 | 通过率 |
|----|---------|---------|--------|
| backend | 60 | 1245+ | 100% |
| frontend | 41 | 740+ | 100% |

## 数据库优化

### TimescaleDB 配置
- 分区策略: 7 天
- 压缩策略: 7 天后
- 数据保留: 365 天

### 索引优化
优化后的 AnswerRecord 索引：
```sql
@@id([id, timestamp])                  -- 复合主键
@@unique([userId, wordId, timestamp])  -- 幂等性
@@index([wordId])                      -- 单词查询
@@index([userId, timestamp])           -- 用户时间范围
@@index([sessionId, timestamp])        -- 会话查询
@@index([userId, wordId, isCorrect])   -- 统计覆盖索引
```

## 开发指南

### 运行测试
```bash
# 后端测试
pnpm --filter @danci/backend test

# 前端测试
pnpm --filter @danci/frontend test

# 性能测试
pnpm --filter @danci/backend test tests/performance

# E2E 测试
pnpm test:e2e
```

### 添加新功能
1. 在相应模块添加实现
2. 编写单元测试
3. 更新集成测试
4. 运行完整测试套件

## 部署注意事项

1. **TimescaleDB**: 生产执行前评审外键删除影响
2. **Redis**: 确保 SCAN 命令支持（已从 KEYS 迁移）
3. **Worker 池**: 根据 CPU 核心数调整池大小
