## ADDED Requirements

### Requirement: 桌面模式检测

系统 SHALL 通过环境变量 `JWT_SECRET` 的存在性判断运行模式。

#### Scenario: 无 JWT_SECRET 进入桌面模式

- **WHEN** backend-rust 启动且 `JWT_SECRET` 环境变量未设置
- **THEN** 标记为桌面模式（desktop mode）
- **AND** 跳过所有用户认证中间件
- **AND** 跳过所有管理员认证中间件

#### Scenario: 有 JWT_SECRET 进入服务器模式

- **WHEN** backend-rust 启动且 `JWT_SECRET` 环境变量已设置
- **THEN** 标记为服务器模式（server mode）
- **AND** 所有认证中间件正常执行，行为与当前完全一致

### Requirement: 用户认证绕过

系统 SHALL 在桌面模式下将所有请求视为固定本地用户。

#### Scenario: require_auth 中间件绕过

- **WHEN** 桌面模式下请求经过 `require_auth` 中间件
- **THEN** 不检查 Authorization header
- **AND** 直接向请求扩展中注入固定用户：`id=1, username="local_user"`
- **AND** 请求正常传递给后续 handler

#### Scenario: optional_auth 中间件绕过

- **WHEN** 桌面模式下请求经过 `optional_auth` 中间件
- **THEN** 直接向请求扩展中注入固定用户：`id=1, username="local_user"`
- **AND** 请求正常传递给后续 handler

#### Scenario: 固定用户数据一致性

- **WHEN** 桌面模式下任意 API 读取当前用户信息
- **THEN** 始终返回 `id=1, username="local_user"`
- **AND** 该用户在 SQLite 数据库中自动创建（若不存在）

### Requirement: 管理员认证绕过

系统 SHALL 在桌面模式下绕过管理员认证，本地用户即管理员。

#### Scenario: require_admin_auth 中间件绕过

- **WHEN** 桌面模式下请求经过 `require_admin_auth` 中间件
- **THEN** 不检查管理员 token
- **AND** 直接向请求扩展中注入管理员用户信息
- **AND** 请求正常传递给后续 handler

### Requirement: 后台 Worker 禁用

系统 SHALL 在桌面模式下禁用所有后台 Worker。

#### Scenario: Worker 不启动

- **WHEN** backend-rust 以桌面模式启动
- **THEN** 不初始化 `WorkerManager`
- **AND** 不启动延迟奖励、遗忘预警、优化周期、LLM 顾问等后台任务

#### Scenario: Worker 相关 API 降级

- **WHEN** 桌面模式下前端调用 Worker 状态查询 API
- **THEN** 返回空结果或"桌面模式不支持"的提示
- **AND** 不返回 500 错误

### Requirement: Redis 缺失降级

系统 SHALL 在桌面模式下无 Redis 时正常运行。

#### Scenario: 无 Redis 连接

- **WHEN** 桌面模式下 `REDIS_URL` 环境变量未设置
- **THEN** 缓存功能降级为无缓存
- **AND** 所有依赖缓存的逻辑正常执行（cache miss 路径）
- **AND** 不输出错误级别日志
