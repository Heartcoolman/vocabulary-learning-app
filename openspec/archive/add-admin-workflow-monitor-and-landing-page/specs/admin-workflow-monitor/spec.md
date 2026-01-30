## ADDED Requirements

### Requirement: Admin Workflow Monitor

管理员 **MUST** 能够在管理后台查看在线用户的实时 AMAS 工作流数据。

#### Constraint: Online Status Definition

- 用户"在线"状态 **MUST** 定义为：用户存在活跃的 SSE 连接
- 用户断开 SSE 连接时 **MUST** 立即视为离线

#### Constraint: Mobile Viewport

- 页面 **MUST NOT** 适配移动端
- 当视口宽度 < 1024px 时，页面 **MAY** 显示"请使用桌面端访问"提示

#### Scenario: View online users list

- **GIVEN** 管理员已登录管理后台
- **WHEN** 管理员访问 `/admin/workflow-monitor` 页面
- **THEN** 系统 **MUST** 显示当前在线用户列表
- **AND** 每个用户卡片 **MUST** 显示用户邮箱和用户名
- **AND** 每个用户卡片 **MUST** 包含 checkbox 用于多选

#### Scenario: Select single user to monitor

- **GIVEN** 管理员在工作流监控页面
- **WHEN** 管理员勾选某个在线用户的 checkbox
- **THEN** 系统 **MUST** 建立与该用户的 SSE 连接
- **AND** 系统 **MUST** 实时显示该用户的 AMAS 工作流数据

#### Scenario: Select multiple users to monitor

- **GIVEN** 管理员在工作流监控页面
- **WHEN** 管理员勾选多个在线用户的 checkbox（最多 4 个）
- **THEN** 系统 **MUST** 为每个用户建立独立的 SSE 连接
- **AND** 系统 **MUST** 使用 CSS Grid 网格布局同时显示多个工作流面板
- **AND** 每个面板 **MUST** 独立显示对应用户的实时数据
- **AND** 系统 **MUST** 依赖 HTTP/2 多路复用处理多个 SSE 连接

#### Scenario: Exceed maximum monitored users

- **GIVEN** 管理员已选择 4 个用户进行监控
- **WHEN** 管理员尝试勾选第 5 个用户的 checkbox
- **THEN** 系统 **MUST** 显示提示信息"最多同时监控 4 个用户"
- **AND** 系统 **MUST** 禁用未选中用户的 checkbox

#### Scenario: No online users

- **GIVEN** 管理员在工作流监控页面
- **WHEN** 当前没有在线用户
- **THEN** 系统 **MUST** 显示空状态提示"当前无在线用户"
- **AND** 系统 **MUST NOT** 提供 demo 模式入口

#### Scenario: User goes offline during monitoring

- **GIVEN** 管理员正在监控某用户的工作流
- **WHEN** 该用户断开 SSE 连接
- **THEN** 系统 **MUST** 显示连接断开状态
- **AND** 系统 **MUST** 保留最后接收的数据帧
- **AND** 系统 **MUST** 自动取消该用户的选中状态

---

### Requirement: Online Users API

系统 **MUST** 提供 API 端点返回在线用户的详细信息。

#### Constraint: Pagination

- API **MUST** 支持分页参数 `page`（默认 1）和 `limit`（默认 20）
- API **MUST** 按用户连接时间倒序排列（最新连接的用户排在前面）
- 响应 **MUST** 包含分页元数据 `{ total, page, limit, totalPages }`

#### Constraint: Authentication

- API **MUST** 复用现有的 admin 认证中间件
- 管理员 **MUST** 能够通过现有 admin token 访问任意用户的 SSE stream

#### Scenario: Get online users with details

- **GIVEN** 管理员已通过管理员认证
- **WHEN** 调用 `GET /api/admin/broadcasts/online-users?page=1&limit=20`
- **THEN** 响应 **MUST** 包含 `{ success: true, data: OnlineUserDetail[], pagination: { total, page, limit, totalPages } }`
- **AND** 每个 `OnlineUserDetail` **MUST** 包含 `userId`、`email`、`name`

#### Scenario: No online users

- **GIVEN** 当前没有在线用户
- **WHEN** 调用 `GET /api/admin/broadcasts/online-users`
- **THEN** 响应 **MUST** 返回 `{ success: true, data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }`

#### Scenario: Database unavailable

- **GIVEN** 数据库连接不可用
- **WHEN** 调用 `GET /api/admin/broadcasts/online-users`
- **THEN** 响应 **MUST** 返回 503 状态码
- **AND** 响应 **MUST** 包含错误信息 `DATABASE_UNAVAILABLE`

---

### Property-Based Testing Properties

#### PBT: Pagination Invariant Preservation

- **INVARIANT**: `∀ (page, limit) ∈ ℕ⁺`: `response.data.length ≤ limit` AND `response.pagination.totalPages == ⌈response.pagination.total / limit⌉` AND IF `page > totalPages` THEN `response.data.length == 0`
- **FALSIFICATION STRATEGY**: Generate random tuples of `(total_users, page, limit)` where `limit` ranges from 1 to `total_users + 10`. Verify the relationship between the returned data size and the calculated pagination metadata.
- **BOUNDARY CONDITIONS**: `page=1`, `limit=1`, `limit=MAX_INT`, `page > totalPages`, `total=0` (empty online users)

#### PBT: Data Length Consistency

- **INVARIANT**: For fixed snapshot, `data.length <= limit` and if `1 <= page <= totalPages`, then `data.length == min(limit, total - (page-1)*limit)`; if `page > totalPages`, `data.length == 0`
- **FALSIFICATION STRATEGY**: Randomize page across boundary values and large values; random limit; check lengths.
- **BOUNDARY CONDITIONS**: First page, last page, page beyond total pages, single item per page

#### PBT: User ID Uniqueness

- **INVARIANT**: Returned `userId`s are unique and subset of online users; each element has `email` and `name` matching the user record
- **FALSIFICATION STRATEGY**: Randomize online users with duplicates and missing DB users; simulate concurrent deletes; check duplicates or mismatches.
- **BOUNDARY CONDITIONS**: User deleted from DB while online, duplicate SSE connections from same user

#### PBT: Temporal Sorting Monotonicity

- **INVARIANT**: `∀ i ∈ [0, response.data.length - 2]`: `response.data[i].connectionTime ≥ response.data[i+1].connectionTime`
- **FALSIFICATION STRATEGY**: Seed with N users having random connection timestamps (including duplicates). Request page 1. Check if the returned array is sorted descending.
- **BOUNDARY CONDITIONS**: List size 0, List size 1, List with all identical connection times, List size > limit

#### PBT: Connection State Bijection

- **INVARIANT**: `Set(Active_SSE_Sockets) ≡ Set(Online_Users_API_List)`. A user appearing in the API list implies an active socket exists in memory, and vice-versa.
- **FALSIFICATION STRATEGY**: Run a state machine model: (1) `state = {}`, (2) Randomly apply `Connect(user)` or `Disconnect(user)`, (3) Update `state`, (4) Assert `API_Response` matches `state`. Look for desynchronization where the API reports a user online who has already disconnected.
- **BOUNDARY CONDITIONS**: Simultaneous connect/disconnect (race conditions), User connecting from multiple tabs, Immediate disconnect after connect

#### PBT: Offline Transition Immediacy

- **INVARIANT**: When the last SSE connection for a user closes, the user is absent from online users in the next observable state
- **FALSIFICATION STRATEGY**: Close connections using clean close, timeout, and network drop; query immediately after close and verify removal.
- **BOUNDARY CONDITIONS**: Clean WebSocket close, Network timeout, Abrupt connection drop

#### PBT: Admin Authorization Boundary

- **INVARIANT**: Admin token can open any user's SSE stream; non-admin tokens are rejected or constrained to their own user
- **FALSIFICATION STRATEGY**: Generate tokens with random roles and user IDs; attempt to open `/users/:userId/stream`; assert accept/reject behavior and that events belong to the requested user.
- **BOUNDARY CONDITIONS**: Valid admin token, Expired admin token, Non-admin token accessing other user, Non-admin token accessing own stream
