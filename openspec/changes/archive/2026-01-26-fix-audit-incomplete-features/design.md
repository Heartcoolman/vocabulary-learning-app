# Design: Fix Audit Incomplete Features

## Context

本提案涵盖35个P2级不完整功能的完善，涉及学习体验、数据展示、管理后台、AMAS系统和UI一致性五个领域。

## Confirmed Constraints

### 1. Algorithm Presets

- **Conservative**: 所有数值参数 = 默认值 × 0.7
- **Balanced**: 所有数值参数 = 默认值
- **Aggressive**: 所有数值参数 = 默认值 × 1.3
- 枚举/布尔字段保持不变

### 2. A/B Test Statistics

- **Method**: 贝叶斯方法 (Bayesian)
- **Output**: P(B>A) 概率优势计算
- **Display**: 概率值 + "胜出可能性"标签
- **Warning**: 样本量 < 100 时显示"数据不足"

### 3. Batch Operations

- **Limit**: 无数量限制
- **Processing**: 全部通过异步任务队列处理
- **Progress**: 前端轮询进度状态
- **Endpoint**: `POST /api/admin/batch` 返回 job_id

### 4. Permission Hierarchy

- **Structure**: `SUPER_ADMIN > ADMIN > USER`
- **Rule**: `permitted(Lower) ⇒ permitted(Higher)`
- **Implementation**: 硬编码层级，无自定义角色

### 5. Animation Standard

- **Library**: framer-motion
- **Type**: Spring 物理动画
- **Config**: `{ type: "spring", stiffness: 300, damping: 30 }`
- **Reduced Motion**: 尊重 `prefers-reduced-motion`

### 6. Auto-Refresh

- **Default**: 30 秒
- **Options**: 10s / 30s / 60s / 关闭
- **Min Interval**: 10 秒（防止后端压力）
- **Pause**: 模态框打开时暂停刷新

### 7. Offline Detection

- **Method**: 心跳检测
- **Endpoint**: `GET /health`
- **Interval**: 30 秒
- **Threshold**: 连续 2 次失败触发离线状态
- **Recovery**: 首次成功恢复在线

### 8. Charts Library

- **Library**: Recharts
- **Theme**: 使用 CSS 变量适配深色模式
- **Mobile**: 简化视图 + 点击展开完整图表

### 9. AMAS Parameters

- **Exposure**: 完全可调
- **Warning**: 超出推荐范围时显示警告标签
- **Ranges**:
  - 疲劳阈值: 0.1 - 0.95 (推荐 0.3-0.9)
  - 恢复时间: 30s - 600s (推荐 60s-300s)
  - 难度范围: 0.05 - 0.98

### 10. Retry Strategy

- **Type**: 指数退避
- **Base**: 1 秒
- **Multiplier**: 2
- **Max Delay**: 30 秒
- **Jitter**: ±10%
- **Formula**: `delay = min(1s × 2^n, 30s) × (1 ± 0.1)`

### 11. Empty State Pattern

- **Structure**: Phosphor Icon + 文字说明 + 操作按钮
- **Icon Size**: 64px
- **Text**: 标题 + 副标题描述
- **Action**: 主要操作按钮（如"添加"/"刷新"）

### 12. Search Highlight

- **Mode**: 大小写不敏感
- **Method**: 正则匹配 `new RegExp(query, 'gi')`
- **Highlight**: `<mark>` 标签 + 背景色

### 13. Trend Chart Time Window

- **Mode**: 动态自适应
- **Rule**:
  - 数据 < 7 天: 显示全部
  - 数据 7-30 天: 默认显示近 7 天
  - 数据 > 30 天: 默认显示近 14 天
- **Toggle**: 支持切换 7/14/30/全部

### 14. Log Viewer

- **Highlight**: JSON 语法高亮（键/字符串/数字/布尔）
- **Size Limit**: 50KB，超过截断 + 提示
- **Nesting**: 支持折叠，最大展开深度 10 层

### 15. Mobile Charts

- **Breakpoint**: < 640px
- **Default**: 简化视图（仅关键数据点）
- **Expand**: 点击展开完整图表模态框

### 16. Heartbeat

- **Interval**: 30 秒
- **Timeout**: 5 秒
- **Failure Threshold**: 2 次连续失败

---

## Property-Based Testing Properties

### Idempotency

| Property            | Definition                           | Falsification                       |
| ------------------- | ------------------------------------ | ----------------------------------- |
| PresetIdempotency   | 同一预设应用 N 次 = 应用 1 次        | 随机配置 → 多次应用 → 断言状态相等  |
| BatchJobIdempotency | 相同 job_id 提交 N 次仅创建 1 个任务 | 相同 UUID 多次提交 → 断言队列长度=1 |

### Monotonicity

| Property              | Definition                                      | Falsification                    |
| --------------------- | ----------------------------------------------- | -------------------------------- |
| PermissionContainment | `Perm(User) ⊆ Perm(Admin) ⊆ Perm(SuperAdmin)`   | 随机动作+资源 → 断言层级包含关系 |
| BackoffGrowth         | `delay(n) ≥ delay(n-1) × 1.8` (除去抖动重叠)    | n∈[1..5] → 断言严格递增          |
| PresetOrdering        | `Conservative[i] ≤ Balanced[i] ≤ Aggressive[i]` | 遍历所有数值字段 → 断言单调性    |

### Bounds

| Property        | Definition                          | Falsification                          |
| --------------- | ----------------------------------- | -------------------------------------- |
| RetryCap        | `delay ≤ 30s × 1.1` 无论重试次数    | n=50,100,MAX_INT → 断言上限            |
| LogSizeLimit    | `rendered_size ≤ 51200 bytes`       | 生成 1KB/40KB/60KB/1MB 日志 → 断言截断 |
| AMASParamBounds | 所有参数必须在定义的 min/max 范围内 | 随机值 → 断言验证拒绝越界              |

### State Consistency

| Property          | Definition                                          | Falsification                   |
| ----------------- | --------------------------------------------------- | ------------------------------- |
| BatchConservation | `Total = Pending + Processing + Succeeded + Failed` | 随机模拟处理步骤 → 断言总数守恒 |
| OfflineTransition | 仅当连续 2 次心跳失败时进入离线状态                 | 生成随机序列 → 断言状态转换正确 |
| RefreshInterval   | 刷新间隔 ∈ {10s, 30s, 60s, off} 且默认=30s          | 随机输入 → 断言无效值被拒绝     |

### Round-trip

| Property              | Definition                                  | Falsification                     |
| --------------------- | ------------------------------------------- | --------------------------------- |
| HighlightPreservation | `removeTags(highlight(text, query)) ≡ text` | 随机文本+查询 → 断言原文保留      |
| ConfigSerialization   | `load(save(config)) ≈ config` (浮点容差 ε)  | 随机有效配置 → 断言序列化往返一致 |

---

## Risks & Mitigations

| Risk                          | Mitigation                         |
| ----------------------------- | ---------------------------------- |
| AMAS 参数极端值导致算法不稳定 | 警告标签 + 范围验证 + 重置按钮     |
| 批量操作超时                  | 异步队列 + 进度轮询 + 部分失败处理 |
| 心跳检测假阳性                | 2 次失败阈值 + 网络恢复自动重试    |
| 贝叶斯计算复杂度              | 使用 Beta 分布闭式解，避免 MCMC    |
| 深色模式遗漏组件              | 组件审计清单 + 自动化视觉测试      |

---

## Open Questions

无 - 所有决策点已由用户确认。
