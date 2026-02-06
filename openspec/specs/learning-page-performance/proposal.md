# OpenSpec Proposal: 学习界面首次加载性能优化

## 1. 需求概述

**问题描述**: 学习界面 (`/learning`) 首次加载需要 7-7.5 秒，这是在本地部署、不考虑网络波动的情况下测得的时间。

**目标**: 将首次加载时间优化至 2 秒以内。

**涉及文件**:

- `packages/frontend/src/pages/LearningPage.tsx` - 学习页面主组件 (719行)
- `packages/frontend/src/routes/user.routes.tsx` - 路由配置
- `packages/frontend/src/components/Icon.tsx` - 图标导出模块 (145+ 图标)
- `packages/frontend/src/hooks/useMasteryLearning.ts` - 核心数据加载 hook
- `packages/backend-rust/src/services/mastery_learning.rs` - 后端单词获取服务

---

## 2. 约束集合 (Constraint Sets)

### 2.1 硬约束 (Hard Constraints)

| ID   | 约束                                                                           | 来源     |
| ---- | ------------------------------------------------------------------------------ | -------- |
| HC-1 | LearningPage 是同步导入，位于 `user.routes.tsx:8`，导致所有依赖进入初始 bundle | 代码分析 |
| HC-2 | Icon.tsx 从 `@phosphor-icons/react` 导出 145+ 图标，28 个文件依赖此模块        | 代码分析 |
| HC-3 | LearningPage 有 28 个直接导入，包含 10+ hooks 和 8+ 组件                       | 代码分析 |
| HC-4 | `useMasteryLearning` 在 mount 时串行执行: 缓存检查 → API 调用 → 队列初始化     | 代码分析 |
| HC-5 | 后端 `get_words_for_mastery_mode` 执行 7 次数据库查询，其中 1 次冗余           | 代码分析 |
| HC-6 | StateCheckIn 组件在数据加载完成后显示，增加感知延迟                            | 代码分析 |
| HC-7 | vite.config.ts 已配置 manualChunks，但 LearningPage 未参与代码分割             | 代码分析 |

### 2.2 软约束 (Soft Constraints)

| ID   | 约束                                                     | 来源     |
| ---- | -------------------------------------------------------- | -------- |
| SC-1 | 项目使用 React Query 进行数据缓存，可利用 prefetch 机制  | 代码分析 |
| SC-2 | 已有 `prefetch.ts` 预加载机制，但未包含 `/learning` 路由 | 代码分析 |
| SC-3 | 后端已使用 `tokio::try_join!` 并行化部分查询             | 代码分析 |
| SC-4 | AMAS 引擎有内存缓存，首次调用有冷启动惩罚                | 代码分析 |

---

## 3. 性能瓶颈分析

### 3.1 前端瓶颈 (预估占比 60%)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Bundle 加载 (~2-3s)                                      │
│    ├─ LearningPage 同步导入 (非 lazy)                       │
│    ├─ 145+ 图标全量打包 (Icon.tsx)                          │
│    └─ 28 个直接依赖 + 传递依赖                              │
├─────────────────────────────────────────────────────────────┤
│ 2. 组件初始化 (~0.5s)                                       │
│    ├─ 10+ hooks 初始化                                      │
│    ├─ useVisualFatigueStore 状态订阅                        │
│    └─ microBehaviorTracker 初始化                           │
├─────────────────────────────────────────────────────────────┤
│ 3. 数据加载 (~2-3s)                                         │
│    ├─ useMasteryLearning.initSession()                      │
│    │   ├─ 缓存检查 (localStorage)                           │
│    │   ├─ getMasteryStudyWords() API 调用                   │
│    │   └─ createMasterySession() API 调用                   │
│    └─ useStudyConfig() 配置加载                             │
├─────────────────────────────────────────────────────────────┤
│ 4. StateCheckIn 显示 (~1s 感知延迟)                         │
│    └─ 数据加载完成后才显示，用户需额外交互                  │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 后端瓶颈 (预估占比 40%)

```
┌─────────────────────────────────────────────────────────────┐
│ /api/learning/study-words 请求处理                          │
├─────────────────────────────────────────────────────────────┤
│ Query 1: select_user_study_config()          ~50ms          │
│ Query 2: AMAS engine.get_current_strategy()  ~100ms (冷启动)│
│ Query 3: select_due_word_states()            ~80ms          │
│ Query 4: select_words_by_ids() [并行]        ~60ms          │
│ Query 5: select_word_scores() [并行]         ~60ms          │
│ Query 6: select_user_study_config() [冗余]   ~50ms          │
│ Query 7: select_candidate_words()            ~100ms         │
├─────────────────────────────────────────────────────────────┤
│ 总计: ~500-800ms (不含网络延迟)                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 优化方案

### Phase 1: 前端代码分割 (预期收益: -2s)

**P1-1: LearningPage 懒加载**

```typescript
// user.routes.tsx 修改
const LearningPage = lazy(() => import('../pages/LearningPage'));

// 路由配置
{
  path: '/learning',
  element: (
    <ProtectedLazy>
      <LearningPage />
    </ProtectedLazy>
  ),
}
```

**P1-2: 图标按需导入**

```typescript
// LearningPage.tsx 直接从 @phosphor-icons/react 导入
import { Confetti, Books, Clock } from '@phosphor-icons/react';
// 而非从 Icon.tsx 导入
```

### Phase 2: 数据预加载 (预期收益: -1.5s)

**P2-1: 添加 /learning 到预加载列表**

```typescript
// prefetch.ts
export const PRIORITY_ROUTES = [
  '/learning', // 新增
  '/vocabulary',
  // ...
];

export const routeDataPrefetchers = {
  '/learning': () => {
    queryClient.prefetchQuery({
      queryKey: ['masteryStudyWords'],
      queryFn: () => learningClient.getMasteryStudyWords(),
      staleTime: 60 * 1000,
    });
  },
};
```

**P2-2: 登录后预热 AMAS 引擎**

```typescript
// AuthContext.tsx 登录成功后
await apiClient.warmupAmasEngine();
```

### Phase 3: 后端优化 (预期收益: -0.5s)

**P3-1: 消除冗余查询**

```rust
// mastery_learning.rs
// 将 config 作为参数传递，避免重复查询
async fn fetch_words_with_strategy(
    proxy: &DatabaseProxy,
    user_id: &str,
    config: &UserStudyConfig,  // 传入而非重新查询
    // ...
)
```

**P3-2: 添加 AMAS 预热端点**

```rust
// routes/learning.rs
#[get("/warmup")]
async fn warmup_amas(state: State<AppState>, user_id: UserId) {
    state.amas_engine().get_current_strategy(&user_id).await;
}
```

### Phase 4: 感知优化 (预期收益: -1s)

**P4-1: StateCheckIn 并行显示**

```typescript
// LearningPage.tsx
// 在数据加载时就显示 StateCheckIn，而非等待加载完成
if (showStateCheckIn) {
  return <StateCheckIn onSelect={handleEnergySelect} onSkip={handleEnergySkip} />;
}
```

**P4-2: 骨架屏替代 Spinner**

```typescript
// 使用 LearningPageSkeleton 替代简单的 Spinner
if (isLoading) {
  return <LearningPageSkeleton />;
}
```

---

## 5. 成功判据 (Verifiable Success Criteria)

| ID    | 判据                              | 测量方法                    |
| ----- | --------------------------------- | --------------------------- |
| VSC-1 | 首次加载时间 ≤ 2s                 | Chrome DevTools Performance |
| VSC-2 | LearningPage chunk 独立分割       | dist/stats.html 分析        |
| VSC-3 | Icon chunk 不包含未使用图标       | Bundle 大小对比             |
| VSC-4 | /api/learning/study-words ≤ 300ms | 后端日志                    |
| VSC-5 | 用户感知加载时间 ≤ 1.5s           | StateCheckIn 立即显示       |

---

## 6. 风险与依赖

| 风险                       | 缓解措施                        |
| -------------------------- | ------------------------------- |
| 懒加载可能导致路由切换闪烁 | 使用 Suspense + 骨架屏          |
| 图标直接导入增加维护成本   | 保留 Icon.tsx 作为类型导出      |
| 预加载增加登录后网络请求   | 使用 requestIdleCallback        |
| AMAS 预热增加服务器负载    | 添加节流，每用户每小时最多 1 次 |

---

## 7. 实施优先级

1. **P1-1 + P1-2** (代码分割) - 最高 ROI，预期 -2s
2. **P4-1** (StateCheckIn 并行) - 零成本，预期 -1s 感知
3. **P2-1** (数据预加载) - 中等复杂度，预期 -1s
4. **P3-1** (后端冗余消除) - 低风险，预期 -0.3s
5. **P2-2 + P3-2** (AMAS 预热) - 需要新端点，预期 -0.2s
