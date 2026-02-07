## ADDED Requirements

### Requirement: Sidecar 进程启动

系统 SHALL 在 Tauri 应用启动时自动拉起 backend-rust 作为 sidecar 进程。

#### Scenario: 正常启动

- **WHEN** Tauri 应用启动
- **THEN** 通过 `tauri-plugin-shell` 的 `Command::sidecar()` 拉起 `binaries/danci-backend` 可执行文件
- **AND** 传递环境变量 `HOST=127.0.0.1` 和 `PORT=0`（操作系统分配随机可用端口）
- **AND** 不传递 `DATABASE_URL`（触发 SQLite 模式）
- **AND** 不传递 `JWT_SECRET`（触发认证绕过）

#### Scenario: Sidecar 二进制声明

- **WHEN** 检查 `tauri.conf.json`
- **THEN** `bundle.externalBin` 包含 `"binaries/danci-backend"`
- **AND** 构建时在 `src-tauri/binaries/` 目录存在 `danci-backend-<target-triple>` 可执行文件

#### Scenario: Shell 插件权限

- **WHEN** 检查 `capabilities/default.json`
- **THEN** 包含 `shell:allow-spawn` 权限
- **AND** allow 列表包含 `{ "name": "binaries/danci-backend", "sidecar": true }`

### Requirement: 动态端口通信

系统 SHALL 通过 stdout 解析获取 sidecar 绑定的动态端口。

#### Scenario: Sidecar 输出端口信息

- **WHEN** backend-rust 以 `PORT=0` 启动并完成端口绑定
- **THEN** 在 stdout 输出一行 `LISTENING_PORT=<port>` 格式的文本
- **AND** 此行在 HTTP server 开始监听后立即输出

#### Scenario: Tauri 解析端口

- **WHEN** Tauri 主进程监听 sidecar 的 stdout
- **THEN** 逐行解析，匹配 `LISTENING_PORT=(\d+)` 正则
- **AND** 提取端口号存入应用状态
- **AND** 若 10 秒内未收到端口行，视为启动失败

### Requirement: 启动健康检查

系统 SHALL 在解析到端口后对 sidecar 执行 HTTP 健康检查，确认服务就绪。

#### Scenario: 健康检查成功

- **WHEN** Tauri 解析到 sidecar 端口号
- **THEN** 对 `http://127.0.0.1:<port>/api/health` 发送 GET 请求
- **AND** 单次请求超时 3 秒
- **AND** 每 200ms 重试一次，总等待上限 10 秒
- **AND** 收到 HTTP 200 响应后标记 sidecar 就绪

#### Scenario: 健康检查失败

- **WHEN** 10 秒内所有健康检查请求均失败
- **THEN** 视为启动失败，触发崩溃恢复策略

### Requirement: 前端端口获取

系统 SHALL 提供 Tauri Command 供前端查询 sidecar 端口。

#### Scenario: 前端查询端口

- **WHEN** 前端调用 `invoke('get_sidecar_port')`
- **THEN** 返回 sidecar 绑定的端口号（u16）
- **AND** 前端据此构造 `http://127.0.0.1:<port>` 作为 API baseUrl

#### Scenario: Sidecar 未就绪时查询

- **WHEN** 前端在 sidecar 就绪前调用 `invoke('get_sidecar_port')`
- **THEN** 返回错误，提示 sidecar 尚未启动完成

### Requirement: 崩溃恢复

系统 SHALL 在 sidecar 进程异常退出时自动重启，超出限制后通知用户。

#### Scenario: 自动重启

- **WHEN** sidecar 进程异常退出（exit code ≠ 0）
- **THEN** 等待 2 秒后自动重启 sidecar
- **AND** 最多重启 3 次

#### Scenario: 超出重启限制

- **WHEN** sidecar 在 3 次自动重启后仍然崩溃
- **THEN** 弹出系统对话框提示"后端服务启动失败，请重启应用或联系支持"
- **AND** 不再尝试重启

#### Scenario: 正常退出不触发恢复

- **WHEN** sidecar 进程正常退出（exit code = 0）
- **THEN** 不触发自动重启（属于预期关闭）

### Requirement: 优雅关闭

系统 SHALL 在应用退出时优雅终止 sidecar 进程。

#### Scenario: 正常关闭

- **WHEN** 用户关闭 Tauri 应用窗口
- **THEN** 向 sidecar 进程发送终止信号（Windows: taskkill, Unix: SIGTERM）
- **AND** 等待最多 5 秒让 sidecar 完成 graceful shutdown
- **AND** 若 5 秒后进程仍存在，强制 kill

#### Scenario: 关闭期间数据安全

- **WHEN** sidecar 收到终止信号
- **THEN** backend-rust 的 graceful shutdown 逻辑正常执行
- **AND** 确保 SQLite 数据库正确关闭，无数据损坏
