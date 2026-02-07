# data-prefetch Specification

## Purpose

TBD - created by archiving change optimize-learning-load. Update Purpose after archive.

## Requirements

### Requirement: Learning Route Prefetch

System SHALL prefetch learning page resources after user login.

#### Scenario: 预加载页面代码

- **Given** 用户已登录且首页组件已加载
- **When** 浏览器空闲时 (requestIdleCallback)
- **Then** 预加载 LearningPage chunk
- **And** `/learning` 位于 PRIORITY_ROUTES 首位

#### Scenario: 预取学习数据

- **Given** 用户已登录且首页组件已加载
- **When** 浏览器空闲时
- **Then** 预取 `/api/learning/study-words` 通用数据（默认策略）
- **And** 缓存 staleTime = 60 秒

#### Implementation Constraints

- 触发位置: 首页组件 (Dashboard/HomePage) 的 useEffect 中调用 `prefetchPriorityRoutes()`
- 修改文件: `packages/frontend/src/routes/prefetch.ts`
- PRIORITY_ROUTES 调整为: `['/learning', '/vocabulary', '/statistics', '/flashcard', '/today-words', '/progress']`
- 添加 `/learning` 到 `routeDataPrefetchers`:
  ```typescript
  '/learning': () => {
    queryClient.prefetchQuery({
      queryKey: ['masteryStudyWords'],
      queryFn: () => learningClient.getMasteryStudyWords(),
      staleTime: 60 * 1000,
    });
  },
  ```

#### Cache Strategy

- 预取使用默认 AMAS 策略，不依赖用户能量选择
- 用户选择能量后，若策略变化显著，由 useMasteryLearning 判断是否重新请求
- Query Key 必须与 useMasteryLearning 中使用的 key 一致以命中缓存

### Requirement: StateCheckIn Immediate Display

StateCheckIn MUST display immediately without waiting for data loading.

#### Scenario: 立即显示状态打卡

- **Given** 用户访问 `/learning`
- **When** LearningPage 组件挂载时
- **Then** 立即显示 StateCheckIn 组件
- **And** 数据加载在后台并行进行
- **And** 移除当前 `!isLoading && allWords.length > 0` 条件

#### Scenario: 状态选择后数据未就绪

- **Given** StateCheckIn 正在显示
- **When** 用户选择能量状态或跳过
- **And** 学习数据尚未加载完成
- **Then** 显示 Spinner + "正在准备学习内容..."
- **And** 数据就绪后自动切换到学习界面

#### Scenario: 状态选择后数据已就绪

- **Given** StateCheckIn 正在显示
- **When** 用户选择能量状态或跳过
- **And** 学习数据已加载完成
- **Then** 立即显示学习内容，无额外等待

#### Implementation Constraints

- 修改文件: `packages/frontend/src/pages/LearningPage.tsx`
- 移除第 348 行附近的 `!isLoading && allWords.length > 0` 条件
- 新增状态: `stateCheckInCompleted` 追踪用户是否完成能量选择
- 渲染逻辑:
  ```
  if (showStateCheckIn && !stateCheckInCompleted) → 显示 StateCheckIn
  if (stateCheckInCompleted && isLoading) → 显示 Spinner + 文字
  if (stateCheckInCompleted && !isLoading) → 显示学习内容
  ```
