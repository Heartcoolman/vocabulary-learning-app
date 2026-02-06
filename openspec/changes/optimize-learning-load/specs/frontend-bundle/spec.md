# Spec: frontend-bundle

## MODIFIED Requirements

### Requirement: LearningPage Code Splitting

LearningPage SHALL use lazy loading to ensure independent code splitting.

#### Scenario: LearningPage 独立 chunk

- **Given** 用户访问 `/learning` 路由
- **When** 路由匹配时
- **Then** LearningPage 通过动态 import 加载
- **And** 生成独立的 chunk 文件

#### Scenario: 图标按需导入

- **Given** LearningPage 需要显示图标
- **When** 组件渲染时
- **Then** 只加载实际使用的图标（Confetti, Books, Clock 等 10 个）
- **And** 不加载 Icon.tsx 中其他 135+ 未使用图标

#### Implementation Constraints

- 修改文件: `packages/frontend/src/routes/user.routes.tsx`
- 将第 8 行 `import LearningPage from '../pages/LearningPage'` 改为 `const LearningPage = lazy(() => import('../pages/LearningPage'))`
- 将路由元素从 `<ProtectedRoute>` 改为 `<ProtectedLazy>` 包装
- LearningPage 中图标导入改为: `import { Confetti, Books, Clock, WarningCircle, Brain, ChartPie, Lightbulb, SkipForward, Stop, Trophy } from '@phosphor-icons/react'`

### Requirement: Loading State

Loading state MUST provide good user experience with skeleton screen.

#### Scenario: 显示骨架屏 (Lazy Loading Fallback)

- **Given** LearningPage chunk 正在加载
- **When** 用户等待时
- **Then** 显示 LearningPageSkeleton 骨架屏
- **And** 骨架屏包含完整页面结构：顶部进度条、中央单词卡片、4个选项按钮、底部操作栏

#### Scenario: 显示加载提示 (数据加载中)

- **Given** StateCheckIn 已完成但数据未就绪
- **When** 用户等待学习数据时
- **Then** 显示 Spinner + 文字提示 "正在准备学习内容..."
- **And** 居中显示，保持视觉一致性

#### LearningPageSkeleton 布局规范

```
┌─────────────────────────────────────┐
│  [████████░░░░░░░░░░░░]  进度条     │
├─────────────────────────────────────┤
│                                     │
│     ┌───────────────────┐           │
│     │   ████████████    │  单词区   │
│     │   ██████          │  (脉冲)   │
│     └───────────────────┘           │
│                                     │
│  ┌─────────┐  ┌─────────┐           │
│  │ ██████  │  │ ██████  │  选项区   │
│  └─────────┘  └─────────┘  (4个)    │
│  ┌─────────┐  ┌─────────┐           │
│  │ ██████  │  │ ██████  │           │
│  └─────────┘  └─────────┘           │
│                                     │
│  [跳过]              [提示] [发音]  │  操作栏
└─────────────────────────────────────┘
```

#### Implementation Constraints

- 新建文件: `packages/frontend/src/components/skeletons/LearningPageSkeleton.tsx`
- 使用现有 Skeleton 组件基础样式
- 骨架屏高度与实际页面一致，避免 CLS (Cumulative Layout Shift)
