# Change: 管理后台工作流监控 + 项目宣传首页

## Why

1. **管理后台工作流监控**：当前 About 页面的 AMAS 数据流可视化组件（`packages/frontend/src/pages/about/AboutDataFlow.tsx`）需要管理员手动输入用户邮箱才能监听实时数据流。这对管理员不友好，应该能够直接看到在线用户列表并点击选择。

2. **项目宣传首页**：当前未认证用户直接跳转到登录页（`/login`），缺少一个介绍和宣传项目的首页。需要创建一个宣传页面，展示 AMAS 系统的核心功能，并将工作流可视化作为自动播放的宣传动画。

## What Changes

### 需求 1：管理后台工作流监控

- **新增 API 端点** `GET /api/admin/broadcasts/online-users`：返回在线用户列表，包含 `userId`、`email`、`name`
- **新增管理后台页面** `/admin/workflow-monitor`：
  - 显示在线用户列表（卡片形式，包含邮箱和用户名）
  - 点击用户卡片后展示该用户的实时 AMAS 工作流数据
  - 复用 `AboutDataFlow.tsx` 的可视化组件（重构为可复用组件）
- **重构 `AboutDataFlow.tsx`**：
  - 提取核心可视化逻辑为独立组件 `AMASFlowVisualization`
  - 支持 `demo` 模式（模拟数据自动播放）和 `live` 模式（SSE 实时数据）
  - 管理后台使用 `live` 模式，宣传页使用 `demo` 模式

### 需求 2：项目宣传首页

- **新增公开页面** `/` 或 `/home`：
  - 项目介绍和核心功能展示
  - AMAS 四层架构（感知、建模、学习、决策）的可视化宣传
  - 工作流动画自动播放（使用模拟数据）
  - 登录/注册入口
- **路由调整**：
  - 未认证用户访问 `/` 显示宣传首页
  - 已认证用户访问 `/` 显示学习页面（保持现有行为）

## Impact

- **Affected specs**: `amas-ui`（新增 admin-workflow-monitor、landing-page）
- **Affected code**:
  - `packages/backend-rust/src/routes/admin/broadcast.rs`：新增 online-users 端点
  - `packages/backend-rust/src/routes/realtime.rs`：扩展 RealtimeHub 支持用户信息查询
  - `packages/frontend/src/pages/about/AboutDataFlow.tsx`：重构为可复用组件
  - `packages/frontend/src/pages/admin/`：新增 WorkflowMonitorPage
  - `packages/frontend/src/pages/`：新增 LandingPage
  - `packages/frontend/src/routes/`：调整路由配置
  - `packages/frontend/src/components/admin/`：新增 OnlineUserList 组件
