# Design: 管理后台工作流监控 + 项目宣传首页

## Context

当前系统存在两个问题：

1. **管理后台工作流监控**：`AboutDataFlow.tsx` 组件要求管理员手动输入用户邮箱才能监听实时数据流，用户体验差。
2. **缺少宣传首页**：未认证用户直接跳转到登录页，缺少项目介绍和宣传。

### 现有架构

- **RealtimeHub**（`packages/backend-rust/src/routes/realtime.rs`）：
  - `user_index: RwLock<HashMap<String, HashSet<String>>>` 追踪在线用户 ID
  - `online_user_ids()` 返回在线用户 ID 列表
  - 不存储用户邮箱等详细信息

- **OnlineStats API**（`packages/backend-rust/src/routes/admin/broadcast.rs:148-155`）：
  - `GET /api/admin/broadcasts/online-stats` 返回 `{ onlineCount, onlineUserIds }`
  - 不返回用户邮箱

- **AboutDataFlow.tsx**（`packages/frontend/src/pages/about/AboutDataFlow.tsx`）：
  - 支持 `idle`、`demo`、`live` 三种模式
  - `live` 模式需要手动输入邮箱，调用 `/api/realtime/lookup-user` 获取 userId
  - 组件耦合度高，难以复用

## Goals / Non-Goals

### Goals

- 管理员能够在后台看到在线用户列表（包含邮箱），点击即可查看工作流
- 创建项目宣传首页，展示 AMAS 系统核心功能
- 工作流可视化组件可复用于管理后台和宣传页

### Non-Goals

- 不修改 RealtimeHub 的核心数据结构
- 不改变现有 SSE 连接机制
- 不影响现有 About 页面的功能

## Decisions

### D1: Online Users API 设计

**Decision**: 新增 `GET /api/admin/broadcasts/online-users` 端点，返回在线用户详细信息

**Constraints**:

- 在线状态定义：用户存在活跃的 SSE 连接即视为在线，断开即离线
- 分页支持：`page`（默认 1）和 `limit`（默认 20）参数
- 排序：按用户连接时间倒序排列
- 认证：复用现有 admin 认证中间件

**Implementation**:

```rust
// packages/backend-rust/src/routes/admin/broadcast.rs

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineUserDetail {
    pub user_id: String,
    pub email: String,
    pub name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedResponse<T> {
    pub success: bool,
    pub data: Vec<T>,
    pub pagination: Pagination,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pagination {
    pub total: usize,
    pub page: usize,
    pub limit: usize,
    pub total_pages: usize,
}

async fn get_online_users(
    State(state): State<AppState>,
    Query(params): Query<PaginationParams>,
) -> Response {
    let online_ids = realtime::get_online_user_ids_async().await;
    let page = params.page.unwrap_or(1);
    let limit = params.limit.unwrap_or(20);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库不可用").into_response();
    };

    // Batch query user details with pagination
    let users = get_users_by_ids_paginated(proxy.as_ref(), &online_ids, page, limit).await;
    let total = online_ids.len();
    let total_pages = (total + limit - 1) / limit;

    Json(PaginatedResponse {
        success: true,
        data: users,
        pagination: Pagination { total, page, limit, total_pages },
    }).into_response()
}
```

### D2: AMASFlowVisualization 组件重构

**Decision**: 从 `AboutDataFlow.tsx` 提取核心可视化逻辑为独立组件

**Constraints**:

- 保留 `idle` 模式（显示静态初始状态）
- `showControls` prop 控制播放/暂停/重置按钮显示
- `onConnectionChange` 回调参数为 boolean 类型
- Compact 布局隐藏：控制按钮、文字说明、缩小可视化尺寸

**Component Interface**:

```typescript
// packages/frontend/src/components/amas/AMASFlowVisualization.tsx

interface AMASFlowVisualizationProps {
  mode: 'idle' | 'demo' | 'live';
  userId?: string; // Required for live mode
  autoPlay?: boolean; // For demo mode, default true
  showControls?: boolean; // Show play/pause/reset buttons, default true
  compact?: boolean; // Compact layout for embedding, default false
  onConnectionChange?: (connected: boolean) => void;
}
```

**Demo Mode Scenario Script**:

- 循环展示：新词添加 → 记忆建模 → 复习调度 → 学习反馈
- 每阶段持续 3 秒
- 完整循环后自动重新开始

**Animation Policy**:

- 离开视口时暂停动画（使用 IntersectionObserver）

**Live Mode Reconnection**:

- 指数退避策略：初始 1s，最大 30s，最多 5 次

### D3: 路由策略

**Decision**: 使用条件渲染而非路由分离

**Constraints**:

- 认证检查期间显示全屏骨架屏加载状态
- 不出现页面闪烁

**Implementation**:

```typescript
// packages/frontend/src/routes/user.routes.tsx

{
  path: '/',
  element: (
    <AuthAwareRoute
      loading={<FullPageSkeleton />}
      authenticated={<LearningPage />}
      unauthenticated={<LandingPage />}
    />
  ),
  meta: { title: '首页', requireAuth: false },
}
```

### D4: 宣传页设计

**Decision**: 采用单页滚动式设计，使用全局 Navigation 组件

**Constraints**:

- 使用全局 Navigation 组件
- 复用现有设计系统的组件和图标

**Sections**:

1. **Hero**: 项目名称、标语、登录/注册按钮
2. **Features**: AMAS 四层架构介绍（感知、建模、学习、决策）
3. **Demo**: 工作流动画展示（自动播放）
4. **Statistics**: 实时统计数据
5. **CTA**: 行动号召，引导注册

### D5: 多语言支持

**Decision**: 使用 react-i18next 框架支持中英文切换

**Constraints**:

- 使用 react-i18next 库
- 翻译文件存储在 `locales/landing.json`
- 语言偏好持久化到 localStorage
- 默认中文

**Implementation**:

- 在 LandingPage 组件中使用 `useTranslation` hook
- 添加语言切换按钮

### D6: 多用户同时监控

**Decision**: 支持管理员同时监控最多 4 个在线用户的工作流

**Constraints**:

- 使用 Checkbox 多选交互
- 依赖 HTTP/2 多路复用处理多个 SSE 连接
- 最大同时监控 4 个用户
- 超过限制时禁用未选中用户的 checkbox
- 无在线用户时不提供 demo 入口
- 不适配移动端

**Implementation**:

- 使用 CSS Grid 布局展示多个 `AMASFlowVisualization` 组件
- 每个组件独立管理自己的 SSE 连接

### D7: 实时统计数据

**Decision**: 在宣传页展示系统实时统计数据

**Constraints**:

- 通过 SSE 实时推送更新
- "今日学习记录"使用服务器时区 UTC+8 计算
- 复用现有的 `GET /api/about/stats/overview` 端点

**Implementation**:

- 展示：总用户数、今日学习记录数
- 使用动画数字滚动效果

## Risks / Trade-offs

| Risk                            | Mitigation                                            |
| ------------------------------- | ----------------------------------------------------- |
| 在线用户数量大时批量查询性能    | 分页支持，每页 20 个                                  |
| 组件重构可能影响现有 About 页面 | 保持 `AboutDataFlow.tsx` 作为包装组件，内部使用新组件 |
| 宣传页动画可能影响性能          | 离开视口时暂停动画                                    |
| 浏览器 SSE 连接限制             | 依赖 HTTP/2 多路复用                                  |

## Migration Plan

1. **Phase 1**: 后端 API 开发（新增端点，不影响现有功能）
2. **Phase 2**: 前端组件重构（提取 `AMASFlowVisualization`）
3. **Phase 3**: 管理后台页面开发
4. **Phase 4**: 宣传首页开发
5. **Phase 5**: 路由调整和集成测试

## Confirmed Requirements

- [x] 宣传页需要支持多语言（中/英）
- [x] 管理后台工作流监控需要支持同时监控多个用户
- [x] 宣传页需要展示实时统计数据（用户数、学习记录数等）
- [x] 在线状态定义：SSE 连接存在即在线
- [x] API 分页：每页 20 个，按连接时间倒序
- [x] SSE 连接：依赖 HTTP/2，保持独立连接
- [x] Landing 布局：使用全局 Navigation
- [x] 统计更新：SSE 实时推送
- [x] 时区：服务器时区 UTC+8
- [x] i18n：react-i18next，localStorage 持久化
- [x] 加载状态：骨架屏
- [x] 组件 props：保留 showControls，保留 idle 模式
- [x] 回调签名：boolean
- [x] 多选交互：Checkbox
- [x] Demo 场景：完整学习流程循环
- [x] Compact 布局：隐藏控制按钮、文字说明、缩小尺寸
- [x] 重连策略：指数退避，最多 5 次
- [x] 动效策略：离开视口暂停
- [x] 空状态：无 demo 入口
- [x] 设计资源：复用现有设计系统
- [x] 移动端：暂不适配
- [x] Admin 认证：复用现有 admin 中间件
