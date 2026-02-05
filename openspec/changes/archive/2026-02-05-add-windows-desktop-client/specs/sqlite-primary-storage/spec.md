## ADDED Requirements

### Requirement: SQLite 作为主存储模式

系统 SHALL 支持使用 SQLite 作为唯一数据存储，无需 PostgreSQL。

#### Scenario: 桌面模式启动

- **WHEN** 应用以桌面模式启动
- **THEN** 使用 SQLite 数据库
- **AND** 不尝试连接 PostgreSQL

#### Scenario: 服务器模式兼容

- **WHEN** 设置了 `DATABASE_URL` 环境变量
- **THEN** 继续使用 PostgreSQL 作为主存储
- **AND** 行为与现有服务器模式一致

### Requirement: SQLite 迁移兼容层

系统 SHALL 提供 PostgreSQL 到 SQLite 的 schema 兼容转换。

#### Scenario: ENUM 类型转换

- **WHEN** PostgreSQL schema 包含 `ENUM` 类型
- **THEN** SQLite 使用 `TEXT` 类型存储
- **AND** 应用层验证枚举值有效性

#### Scenario: JSONB 类型转换

- **WHEN** PostgreSQL schema 包含 `JSONB` 类型
- **THEN** SQLite 使用 `TEXT` 类型存储 JSON 字符串
- **AND** 应用层正确序列化/反序列化

#### Scenario: SERIAL 类型转换

- **WHEN** PostgreSQL schema 包含 `SERIAL` 主键
- **THEN** SQLite 使用 `INTEGER PRIMARY KEY AUTOINCREMENT`

### Requirement: 数据库文件管理

系统 SHALL 将 SQLite 数据库存储在标准应用数据目录。

#### Scenario: Windows 数据路径

- **WHEN** 应用在 Windows 上运行
- **THEN** 数据库存储在 `%APPDATA%/com.danci.app/data.db`

#### Scenario: 数据库备份

- **WHEN** 用户请求备份数据
- **THEN** 复制当前数据库文件到指定位置

### Requirement: 数据导入导出限制

系统 SHALL 在 V1 版本不支持服务器版数据导入导出。

#### Scenario: 无导入功能

- **WHEN** 用户查看设置
- **THEN** 不提供"从服务器版导入数据"选项
- **AND** 桌面版与服务器版数据独立，不互通

#### Scenario: 无导出功能

- **WHEN** 用户查看设置
- **THEN** 不提供"导出数据到服务器版"选项

#### Scenario: 未来扩展

- **WHEN** 未来版本需要数据迁移
- **THEN** 可通过 JSON 格式实现导入导出
- **AND** 需定义冲突处理策略

## Property-Based Testing Invariants

### PBT: Migration Idempotency

- **INVARIANT**: `apply_migrations(apply_migrations(db))` 不改变 schema 或 `_migrations` 表
- **FALSIFICATION**: 运行 N 次迁移 (N ∈ [0, 10])，对比 `sqlite_schema` 和 `_migrations` 行快照

### PBT: Migration Monotonicity

- **INVARIANT**: `|applied(S_after)| ≥ |applied(S_before)|`，已应用迁移集合只增不减
- **FALSIFICATION**: 生成随机"已应用"集合，运行迁移两次，断言第二次为 no-op

### PBT: JSONB→TEXT Round-trip

- **INVARIANT**: `decode_json(encode_json(x)) = x` 对所有合法 JSON 值成立
- **FALSIFICATION**: 使用 arbitrary JSON generator（深层嵌套、unicode key、大整数字符串）验证往返相等

### PBT: ENUM→TEXT Validity

- **INVARIANT**: 持久化的枚举字符串必须在允许集合 E 中，无效值被拒绝
- **FALSIFICATION**: 生成随机字符串（大小写变体、空串、超长）尝试插入，断言 success iff in E

### PBT: Init Idempotency

- **INVARIANT**: `init_db(path)` 是幂等的，多次调用不改变用户数据或重复 schema
- **FALSIFICATION**: 在 init 调用之间插入随机用户写入，对比行数/校验和

### Requirement: 迁移版本管理

系统 SHALL 跟踪 SQLite 数据库的迁移版本。

#### Scenario: 版本表存在

- **WHEN** 数据库初始化完成
- **THEN** 存在 `_migrations` 表记录已应用的迁移

#### Scenario: 增量迁移执行

- **WHEN** 应用升级且有新迁移
- **THEN** 仅执行未应用的迁移
- **AND** 记录到 `_migrations` 表

### Requirement: Redis 依赖可选

系统 SHALL 在桌面模式下不要求 Redis。

#### Scenario: 无 Redis 启动

- **WHEN** 桌面模式启动且未配置 `REDIS_URL`
- **THEN** 应用正常启动
- **AND** 缓存功能使用内存缓存替代
