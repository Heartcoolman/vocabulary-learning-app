## ADDED Requirements

### Requirement: Landing Page

系统 **MUST** 为未认证用户提供项目宣传首页。

#### Constraint: Layout

- 页面 **MUST** 使用全局 Navigation 组件
- 页面 **MUST** 复用现有设计系统的组件和图标

#### Constraint: Auth Loading State

- 当认证状态检查中时，页面 **MUST** 显示全屏骨架屏加载状态
- 认证状态确定后 **MUST** 立即渲染对应页面（Landing 或 Learning）
- **MUST NOT** 出现页面闪烁

#### Scenario: Unauthenticated user visits home

- **GIVEN** 用户未登录
- **WHEN** 用户访问 `/` 路径
- **THEN** 系统 **MUST** 显示项目宣传首页
- **AND** 页面 **MUST** 包含项目介绍
- **AND** 页面 **MUST** 包含登录/注册入口

#### Scenario: Authenticated user visits home

- **GIVEN** 用户已登录
- **WHEN** 用户访问 `/` 路径
- **THEN** 系统 **MUST** 显示学习页面（保持现有行为）

#### Scenario: AMAS workflow demo animation

- **GIVEN** 用户在宣传首页
- **WHEN** 页面加载完成
- **THEN** 系统 **MUST** 自动播放 AMAS 工作流动画
- **AND** 动画 **MUST** 使用模拟数据
- **AND** 动画 **MUST** 循环播放

#### Scenario: Navigate to login

- **GIVEN** 用户在宣传首页
- **WHEN** 用户点击登录按钮
- **THEN** 系统 **MUST** 导航到 `/login` 页面

#### Scenario: Navigate to register

- **GIVEN** 用户在宣传首页
- **WHEN** 用户点击注册按钮
- **THEN** 系统 **MUST** 导航到 `/register` 页面

---

### Requirement: Landing Page Content

宣传首页 **MUST** 包含以下内容区域。

#### Scenario: Hero section

- **GIVEN** 用户在宣传首页
- **WHEN** 页面渲染完成
- **THEN** Hero 区域 **MUST** 显示项目名称
- **AND** Hero 区域 **MUST** 显示项目标语
- **AND** Hero 区域 **MUST** 包含 CTA 按钮

#### Scenario: Features section

- **GIVEN** 用户在宣传首页
- **WHEN** 用户滚动到功能介绍区域
- **THEN** 系统 **MUST** 展示 AMAS 四层架构
- **AND** 每层 **MUST** 包含图标、标题、描述

#### Scenario: Demo section

- **GIVEN** 用户在宣传首页
- **WHEN** 用户滚动到演示区域
- **THEN** 系统 **MUST** 显示 AMAS 工作流可视化组件
- **AND** 组件 **MUST** 以 demo 模式运行
- **AND** 组件 **MUST** 自动播放

#### Scenario: Statistics section

- **GIVEN** 用户在宣传首页
- **WHEN** 页面加载完成
- **THEN** 系统 **MUST** 显示实时统计数据
- **AND** 统计数据 **MUST** 包含总用户数
- **AND** 统计数据 **MUST** 包含今日学习记录数
- **AND** 统计数据 **MUST** 使用动画数字滚动效果

#### Constraint: Statistics Data Source

- 统计数据 **MUST** 通过 SSE 实时推送更新
- "今日学习记录" **MUST** 使用服务器时区 UTC+8 计算
- 统计数据 API **MUST** 复用现有的 `GET /api/about/stats/overview` 端点

---

### Requirement: Landing Page i18n

宣传首页 **MUST** 支持多语言（中文/英文）。

#### Constraint: i18n Implementation

- **MUST** 使用 react-i18next 库实现多语言
- 翻译文件 **MUST** 存储在 `locales/landing.json`
- 语言偏好 **MUST** 持久化到 localStorage

#### Scenario: Default language

- **GIVEN** 用户首次访问宣传首页
- **WHEN** 页面加载完成
- **THEN** 系统 **MUST** 默认显示中文内容

#### Scenario: Switch to English

- **GIVEN** 用户在宣传首页
- **WHEN** 用户点击语言切换按钮选择英文
- **THEN** 系统 **MUST** 将所有文案切换为英文
- **AND** 系统 **MUST** 保存用户的语言偏好到 localStorage

#### Scenario: Switch to Chinese

- **GIVEN** 用户在宣传首页且当前语言为英文
- **WHEN** 用户点击语言切换按钮选择中文
- **THEN** 系统 **MUST** 将所有文案切换为中文
- **AND** 系统 **MUST** 保存用户的语言偏好到 localStorage

#### Scenario: Persist language preference

- **GIVEN** 用户之前选择了英文
- **WHEN** 用户再次访问宣传首页
- **THEN** 系统 **MUST** 从 localStorage 读取语言偏好
- **AND** 系统 **MUST** 自动显示英文内容

---

### Property-Based Testing Properties

#### PBT: Daily Accumulator Monotonicity

- **INVARIANT**: Let `Count(t)` be the learning record count at time `t`. IF `Date(t1, UTC+8) == Date(t2, UTC+8)` AND `t2 > t1`: `Count(t2) ≥ Count(t1)`. IF `Date(t1, UTC+8) < Date(t2, UTC+8)` (Day changed): `Count(t2)` starts at 0 (or new day's initial value).
- **FALSIFICATION STRATEGY**: Generate a stream of learning events with strictly increasing timestamps. Focus generation around the UTC+8 midnight boundary (e.g., 15:59 UTC to 16:01 UTC). Verify the counter increases monotonically then resets to 0 exactly at the boundary.
- **BOUNDARY CONDITIONS**: `t` = 23:59:59 (UTC+8), `t` = 00:00:00 (UTC+8), `t` = 00:00:01 (UTC+8)

#### PBT: Timezone Round-trip Consistency

- **INVARIANT**: "Today" is defined by UTC+8: a record is counted in today iff `start_of_day_utc+8 <= ts < start_of_day_utc+8 + 24h`
- **FALSIFICATION STRATEGY**: Generate records around the UTC+8 midnight boundary (just before/after), and around UTC midnight to detect 8h offset errors; compare to a reference computation.
- **BOUNDARY CONDITIONS**: Timestamps at hour boundaries, Timestamps with non-zero milliseconds, UTC midnight vs UTC+8 midnight

#### PBT: Statistics Internal Consistency

- **INVARIANT**: Stats are internally consistent: `0 <= correct_records <= total_records`, `correct_rate == correct_records / total_records` when total_records > 0 else 0, and all rates in [0,1]
- **FALSIFICATION STRATEGY**: Generate randomized record batches with mixed correctness and timestamps; verify API and SSE payloads.
- **BOUNDARY CONDITIONS**: Zero records, All correct records, All incorrect records, Mixed records

#### PBT: SSE Stats Eventual Consistency

- **INVARIANT**: Real-time SSE stats eventually match API stats after any sequence of record inserts; totals are monotonic non-decreasing across SSE updates
- **FALSIFICATION STRATEGY**: Generate random sequences of record inserts (including out-of-order timestamps), interleave SSE disconnect/reconnect, and compare final SSE payload to API.
- **BOUNDARY CONDITIONS**: Rapid consecutive inserts, SSE reconnection during updates, Out-of-order event delivery

#### PBT: Language Preference Idempotency

- **INVARIANT**: Setting language preference to the same value multiple times results in the same stored value and UI state
- **FALSIFICATION STRATEGY**: Generate sequence of language switches including repeated same-language selections; verify localStorage value and UI consistency.
- **BOUNDARY CONDITIONS**: Switch to same language, Rapid language toggles, localStorage cleared between switches
