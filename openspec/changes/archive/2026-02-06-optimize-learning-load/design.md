# Design: optimize-learning-load

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Current Flow                              │
├─────────────────────────────────────────────────────────────────┤
│  Route Match → Load Bundle (sync) → Mount → API Call → Render   │
│       │              │                         │                 │
│       │         ~2-3s (blocking)          ~2-3s (blocking)      │
│       └──────────────────────────────────────────────────────────│
│                        Total: 7-7.5s                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                       Optimized Flow                             │
├─────────────────────────────────────────────────────────────────┤
│  Login ──────────────> Prefetch (idle)                          │
│                            │                                     │
│                    ┌───────┴───────┐                            │
│                    │               │                             │
│              Load Chunk      Prefetch Data                       │
│                    │               │                             │
│                    └───────┬───────┘                             │
│                            │                                     │
│  Route Match → Show Skeleton → Mount (cached) → Render          │
│       │              │                │                          │
│       │          ~0.5s            ~0.5s (cache hit)             │
│       └──────────────────────────────────────────────────────────│
│                        Total: ~1.5s                              │
└─────────────────────────────────────────────────────────────────┘
```

## Key Decisions

### D1: Lazy Loading Strategy

**Decision**: 将 LearningPage 改为 lazy 加载，与其他用户页面保持一致。

**Rationale**:

- 当前 LearningPage 是 `user.routes.tsx` 中唯一同步导入的页面
- 同步导入导致所有依赖（28 个直接导入 + 传递依赖）进入主 bundle
- 改为 lazy 后，LearningPage 及其依赖将独立分割

**Trade-off**: 首次访问需要额外网络请求加载 chunk，但通过预加载机制抵消。

### D2: Icon Import Strategy

**Decision**: LearningPage 直接从 `@phosphor-icons/react` 导入所需图标。

**Rationale**:

- `Icon.tsx` 导出 145+ 图标，可能导致 tree-shaking 失效
- 直接导入确保只打包实际使用的 10 个图标
- 保留 `Icon.tsx` 作为其他组件的统一入口

**Trade-off**: 增加少量维护成本，但显著减少 bundle 大小。

### D3: Prefetch Timing

**Decision**: 使用 `requestIdleCallback` 在登录后空闲时预加载。

**Rationale**:

- 不阻塞登录后的首屏渲染
- 利用浏览器空闲时间提前加载
- 已有 `prefetch.ts` 基础设施，只需添加配置

### D4: StateCheckIn Timing

**Decision**: StateCheckIn 立即显示，不等待数据加载。

**Rationale**:

- StateCheckIn 是用户交互组件，不依赖学习数据
- 提前显示可减少 ~1s 感知延迟
- 用户完成选择时，数据大概率已加载完成

## Component Changes

```
packages/frontend/
├── src/
│   ├── routes/
│   │   ├── user.routes.tsx      # 修改: LearningPage lazy 导入
│   │   └── prefetch.ts          # 修改: 添加 /learning 预加载
│   ├── pages/
│   │   └── LearningPage.tsx     # 修改: 图标导入 + StateCheckIn 逻辑
│   └── components/
│       └── skeletons/
│           └── LearningPageSkeleton.tsx  # 新增: 骨架屏组件

packages/backend-rust/
└── src/
    └── services/
        └── mastery_learning.rs  # 修改: 消除冗余查询
```

## Performance Budget

| Resource            | Budget  | Current          |
| ------------------- | ------- | ---------------- |
| LearningPage chunk  | ≤ 150KB | ~300KB (in main) |
| API /study-words    | ≤ 300ms | ~800ms           |
| Time to Interactive | ≤ 2s    | 7-7.5s           |
