# Proposal: optimize-learning-load

## Summary

优化学习界面 (`/learning`) 首次加载性能，从 7-7.5 秒降至 2 秒以内。

## Problem Statement

学习界面是用户最常访问的核心页面，当前首次加载耗时 7-7.5 秒（本地部署），严重影响用户体验。

### Root Causes

| 瓶颈                  | 位置                    | 影响                             |
| --------------------- | ----------------------- | -------------------------------- |
| LearningPage 同步导入 | `user.routes.tsx:8`     | Bundle 过大，阻塞首屏            |
| Icon.tsx 全量导出     | `components/Icon.tsx`   | 145+ 图标打包，tree-shaking 失效 |
| 数据串行加载          | `useMasteryLearning.ts` | API 调用无预加载                 |
| 后端冗余查询          | `mastery_learning.rs`   | 7 次 DB 查询含 1 次重复          |
| StateCheckIn 阻塞     | `LearningPage.tsx:348`  | 等待数据加载完成才显示           |

## Proposed Solution

### Phase 1: Frontend Bundle Optimization

- 将 LearningPage 改为 lazy 加载
- 图标直接从 `@phosphor-icons/react` 导入

### Phase 2: Data Prefetch

- 添加 `/learning` 到预加载路由列表
- 登录后预热学习数据

### Phase 3: Backend Query Optimization

- 消除 `select_user_study_config` 冗余调用
- 传递 config 参数避免重复查询

### Phase 4: Perceived Performance

- StateCheckIn 立即显示，不等待数据
- 使用骨架屏替代 Spinner

## Success Criteria

| Metric             | Current   | Target     |
| ------------------ | --------- | ---------- |
| 首次加载时间       | 7-7.5s    | ≤ 2s       |
| LearningPage chunk | 主 bundle | 独立 chunk |
| API 响应时间       | ~800ms    | ≤ 300ms    |
| 感知加载时间       | 7s+       | ≤ 1.5s     |

## Scope

### In Scope

- `packages/frontend/src/routes/user.routes.tsx`
- `packages/frontend/src/pages/LearningPage.tsx`
- `packages/frontend/src/routes/prefetch.ts`
- `packages/backend-rust/src/services/mastery_learning.rs`

### Out of Scope

- 其他页面性能优化
- 网络层优化（CDN、压缩等）
- 数据库索引优化

## Risks

| Risk                   | Mitigation               |
| ---------------------- | ------------------------ |
| 懒加载导致路由切换闪烁 | 使用 Suspense + 骨架屏   |
| 预加载增加登录后请求   | 使用 requestIdleCallback |
