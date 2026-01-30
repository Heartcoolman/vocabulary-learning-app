# Tasks

## 1. Backend: Online Users API

- [x] 1.1 在 `packages/backend-rust/src/routes/admin/broadcast.rs` 新增 `GET /online-users` 端点
- [x] 1.2 实现 `get_online_users_with_details` 函数，查询在线用户的 email 和 name
- [x] 1.3 扩展 `OnlineStats` 结构体或创建新的 `OnlineUserDetail` 结构体

## 2. Frontend: 重构 AMAS 工作流可视化组件

- [x] 2.1 从 `AboutDataFlow.tsx` 提取核心可视化逻辑为 `AMASFlowVisualization` 组件
- [x] 2.2 定义组件 props 接口：`mode: 'demo' | 'live'`、`userId?: string`、`autoPlay?: boolean`
- [x] 2.3 重构 demo 模式逻辑，支持自动播放和循环
- [x] 2.4 重构 live 模式逻辑，接收外部传入的 userId
- [x] 2.5 更新 `AboutDataFlow.tsx` 使用新的 `AMASFlowVisualization` 组件（保持原有完整展示页面，AMASFlowVisualization 作为精简版可复用组件）

## 3. Frontend: 管理后台工作流监控页面

- [x] 3.1 创建 `OnlineUserList` 组件，显示在线用户卡片列表（支持多选）
- [x] 3.2 创建 `WorkflowMonitorPage` 页面，集成 OnlineUserList 和 AMASFlowVisualization
- [x] 3.3 实现多用户选择逻辑：支持同时监控最多 4 个用户
- [x] 3.4 使用 CSS Grid 布局展示多个工作流面板
- [x] 3.5 在 `admin.routes.tsx` 添加 `/admin/workflow-monitor` 路由
- [x] 3.6 在 `AdminLayout.tsx` 添加导航菜单项

## 4. Frontend: 项目宣传首页

- [x] 4.1 创建 `LandingPage` 组件，包含项目介绍和核心功能展示
- [x] 4.2 集成 `AMASFlowVisualization` 组件（demo 模式，自动播放）
- [x] 4.3 设计 Hero 区域、功能介绍区域、工作流动画区域
- [x] 4.4 添加登录/注册入口按钮
- [x] 4.5 添加实时统计数据展示（用户数、学习记录数等）
- [x] 4.6 在路由配置中添加 `/` 路由
- [x] 4.7 调整路由逻辑：未认证用户显示 LandingPage，已认证用户显示 LearningPage

## 5. Frontend: 多语言支持

- [x] 5.1 创建 `locales/landing.json` 存储宣传页中英文文案
- [x] 5.2 在 LandingPage 组件中集成 i18n
- [x] 5.3 添加语言切换按钮（中/英）

## 6. API Service Layer

- [x] 6.1 在 `packages/frontend/src/services/` 添加 `getOnlineUsersWithDetails` API 调用
- [x] 6.2 创建 React Query hook `useOnlineUsersWithDetails`
- [x] 6.3 复用 `getOverviewStatsWithSource` API 获取统计数据

## 7. Testing & Validation

- [x] 7.1 验证管理后台工作流监控功能（单用户、多用户）
- [x] 7.2 验证宣传首页展示效果
- [x] 7.3 验证路由切换逻辑（认证/未认证用户）
- [x] 7.4 验证多语言切换功能
