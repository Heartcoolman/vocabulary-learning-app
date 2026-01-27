# Spec Delta: Admin Enhancements

## MODIFIED Requirements

### Requirement: User Detail Learning Curve

用户详情页 **SHALL** 展示学习曲线图。

#### Scenario: 显示学习曲线

- **Given** 管理员查看用户详情
- **When** 页面加载
- **Then** 应显示该用户的学习曲线
- **And** 包含每日学习量、掌握度变化

#### Scenario: 用户无学习数据

- **Given** 用户是新注册用户
- **When** 查看学习曲线
- **Then** 应显示"暂无学习数据"

---

### Requirement: Algorithm Config Templates

算法配置 **MUST** 提供预设模板。

#### Scenario: 选择预设模板

- **Given** 管理员进入算法配置页
- **When** 选择"平衡模式"模板
- **Then** 应自动填充推荐的参数值
- **And** 参数可进一步调整

#### Scenario: 可用模板列表

- **Given** 管理员查看模板列表
- **When** 列表加载
- **Then** 应包含：保守模式、平衡模式、激进模式
- **And** 每个模板有简短说明

#### Scenario: 预设参数计算规则

- **Given** 选择预设模板
- **When** 应用模板
- **Then** Conservative = 默认值 × 0.7
- **And** Balanced = 默认值
- **And** Aggressive = 默认值 × 1.3
- **And** 枚举/布尔字段保持不变

---

### Requirement: Log Viewer Syntax Highlighting

日志查看器 **SHALL** 支持语法高亮。

#### Scenario: JSON日志高亮

- **Given** 日志内容为JSON格式
- **When** 显示日志
- **Then** 键名、字符串、数字应有不同颜色
- **And** 支持折叠嵌套对象

#### Scenario: 错误日志高亮

- **Given** 日志级别为ERROR
- **When** 显示日志
- **Then** 整行应有红色背景提示

---

### Requirement: System Monitoring Alerts

系统监控 **MUST** 支持警报阈值配置。

#### Scenario: 配置警报阈值

- **Given** 管理员进入监控设置
- **When** 配置CPU使用率警报阈值为80%
- **Then** 当CPU超过80%时应显示警告

#### Scenario: 多级警报

- **Given** 配置了警告和严重两级阈值
- **When** 指标超过阈值
- **Then** 应显示对应级别的警报颜色

---

### Requirement: Task Queue Retry Control

任务队列 **SHALL** 使用指数退避策略支持重试控制。

#### Scenario: 配置最大重试次数

- **Given** 管理员查看任务详情
- **When** 任务失败
- **Then** 应显示已重试次数和最大次数
- **And** 支持手动重试

#### Scenario: 指数退避策略

- **Given** 任务失败需要重试
- **When** 计算重试延迟
- **Then** delay = min(1s × 2^n, 30s) × (1 ± 10%)
- **And** base = 1秒, multiplier = 2, max = 30秒
- **And** jitter = ±10%

#### Scenario: 达到重试上限

- **Given** 任务已达最大重试次数
- **When** 查看任务
- **Then** 应标记为"永久失败"
- **And** 不再自动重试

---

### Requirement: A/B Test Statistical Significance

A/B测试结果 **MUST** 使用贝叶斯方法显示统计显著性。

#### Scenario: 显示贝叶斯概率

- **Given** A/B测试有足够样本量（≥100/组）
- **When** 查看测试结果
- **Then** 应显示 P(B>A) 概率优势值
- **And** 显示"胜出可能性"标签
- **And** 使用 Beta 分布闭式解计算

#### Scenario: 样本量不足

- **Given** A/B测试样本量 < 100/组
- **When** 查看测试结果
- **Then** 应显示"数据不足"警告
- **And** 概率值标记为"仅供参考"

---

### Requirement: Batch Operations

管理列表 **SHALL** 通过异步队列支持批量操作。

#### Scenario: 用户批量操作

- **Given** 管理员在用户列表选择多个用户
- **When** 点击批量禁用
- **Then** 应确认后创建异步任务
- **And** 返回 job_id 用于进度查询
- **And** 无数量限制

#### Scenario: 词书批量导入

- **Given** 管理员有CSV/JSON格式的词书文件
- **When** 使用批量导入功能
- **Then** 应创建异步导入任务
- **And** 前端轮询显示导入进度
- **And** 完成后显示成功/失败统计

#### Scenario: 批量操作进度查询

- **Given** 批量任务已提交
- **When** 前端轮询 `/api/admin/batch/{job_id}`
- **Then** 应返回 Pending/Processing/Succeeded/Failed 计数
- **And** Total = Pending + Processing + Succeeded + Failed

---

### Requirement: Dashboard Auto Refresh

仪表盘数据 **SHALL** 支持可配置的自动刷新。

#### Scenario: 启用自动刷新

- **Given** 管理员在仪表盘页面
- **When** 配置自动刷新间隔
- **Then** 默认间隔为 30 秒
- **And** 可选 10s / 30s / 60s / 关闭
- **And** 最小间隔不得低于 10 秒

#### Scenario: 刷新状态显示

- **Given** 自动刷新已启用
- **When** 数据更新
- **Then** 应显示上次更新时间
- **And** 模态框打开时暂停刷新

#### Scenario: 禁用自动刷新

- **Given** 自动刷新已启用
- **When** 用户选择"关闭"
- **Then** 应停止自动刷新
- **And** 仅允许手动刷新

---

### Requirement: Operation Log Details

操作日志 **MUST** 支持详情展开。

#### Scenario: 展开日志详情

- **Given** 管理员查看操作日志列表
- **When** 点击某条日志
- **Then** 应展开显示完整详情
- **And** 包含请求参数、响应结果、耗时

---

## Related Capabilities

- **Admin Dashboard** - 管理后台增强功能
- **System Monitoring** - 监控和警报配置
