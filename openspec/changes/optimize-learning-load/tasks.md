# Tasks: optimize-learning-load

## Phase 1: Frontend Bundle Optimization

- [x] **T1.1** 修改 `user.routes.tsx`，将 LearningPage 改为 lazy 导入
  - 文件: `packages/frontend/src/routes/user.routes.tsx`
  - 操作:
    - 删除第 8 行 `import LearningPage from '../pages/LearningPage'`
    - 添加 `const LearningPage = lazy(() => import('../pages/LearningPage'))`
    - 将 `/learning` 路由的 `<ProtectedRoute>` 改为 `<ProtectedLearningLazy>`
  - 验证: `npm run build` 后确认 LearningPage 独立 chunk (120.05 kB)

- [x] **T1.2** 修改 `LearningPage.tsx`，图标直接从 `@phosphor-icons/react` 导入
  - 文件: `packages/frontend/src/pages/LearningPage.tsx`
  - 操作: 将 Icon 导入改为直接从 `@phosphor-icons/react` 导入
  - 验证: Bundle 大小减少

## Phase 2: Perceived Performance

- [x] **T2.1** 修改 StateCheckIn 显示逻辑，立即显示不等待数据
  - 文件: `packages/frontend/src/pages/LearningPage.tsx`
  - 操作:
    - 新增状态 `stateCheckInCompleted` 追踪用户是否完成能量选择
    - 实现渲染逻辑:
      - `showStateCheckIn && !stateCheckInCompleted` → 显示 StateCheckIn
      - `stateCheckInCompleted && isLoading` → 显示 Spinner + "正在准备学习内容..."
      - `stateCheckInCompleted && !isLoading` → 显示学习内容
  - 验证: StateCheckIn 立即显示，数据未就绪时显示加载提示

- [x] **T2.2** 创建 LearningPageSkeleton 组件 (Lazy Loading Fallback)
  - 文件: `packages/frontend/src/components/skeletons/LearningPageSkeleton.tsx`
  - 布局: 完整页面结构（进度条 + 单词卡片 + 4选项）
  - 验证: Lazy 加载时显示骨架屏

## Phase 3: Data Prefetch

- [x] **T3.1** 添加 `/learning` 到 PRIORITY_ROUTES 首位
  - 文件: `packages/frontend/src/routes/prefetch.ts`
  - 操作: 修改 PRIORITY_ROUTES 为 `['/learning', '/vocabulary', '/statistics', '/flashcard', '/today-words', '/progress']`
  - 验证: `/learning` 优先预加载

- [x] **T3.2** 添加 `/learning` 数据预取配置
  - 文件: `packages/frontend/src/routes/prefetch.ts`
  - 操作: 在 `routeDataPrefetchers` 和 `routePrefetchers` 中添加 `/learning` 配置
  - 验证: 登录后预取 masteryStudyWords 数据

- [x] **T3.3** 在首页触发预加载
  - 文件: `packages/frontend/src/App.tsx` (已有实现)
  - 操作: 更新 `prefetchPriorityData()` 包含 `/learning`
  - 验证: 登录后触发预加载

## Phase 4: Backend Optimization

- [x] **T4.1** 消除 `fetch_words_in_difficulty_range` 中的冗余 config 查询
  - 文件: `packages/backend-rust/src/services/mastery_learning.rs`
  - 操作:
    - 修改 `fetch_new_words_in_range` 函数签名，添加 `config: &UserStudyConfig` 参数
    - 修改 `fetch_words_with_strategy` 函数签名，添加 `config: &UserStudyConfig` 参数
    - 修改 `fetch_words_in_difficulty_range` 函数签名，添加 `config: &UserStudyConfig` 参数
    - 更新所有调用方传递 config
  - 验证: cargo check 通过

## Validation

- [ ] **T5.1** 性能测试：首次加载时间 ≤ 2s
  - 工具: Chrome DevTools Performance
  - 条件: 清除缓存，本地部署

- [x] **T5.2** Bundle 分析：确认 LearningPage 独立分割
  - 工具: `npm run build`
  - 结果: LearningPage-BawFKEFR.js (120.05 kB)

- [ ] **T5.3** PBT 测试：验证后端重构正确性
  - 验证 Equivalence、Query Bounds、Config Immutability
