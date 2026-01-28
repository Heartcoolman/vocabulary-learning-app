# Proposal: Add Notification System & AMAS Enhancements

## Summary

补全 `fix-audit-incomplete-features` 中剩余的两组前端功能：通知系统 UI（已读/未读、批量操作）和 AMAS 系统增强（参数可配置、结果展示优化）。

## Motivation

- 通知系统后端 API 已完整（NotificationClient），但前端缺少对应 UI，用户无法查看和管理通知。
- AMAS 参数硬编码，用户无法调整疲劳检测灵敏度和难度范围；决策结果缺乏置信度和原因透明度。

## Scope

### In Scope

**通知系统**

- 导航栏通知铃铛图标（带未读计数徽章）
- 通知下拉面板（快速预览）
- 通知中心页面（列表、筛选）
- 已读/未读状态视觉区分
- 批量标记已读 / 批量删除

**AMAS 增强**

- 疲劳检测参数暴露到设置页
- 自适应难度上下限配置
- 参数变更即时预览
- 注意力模型置信度显示
- 学习建议优先级排序
- 状态变化详细原因展示

### Out of Scope

- 后端 API 新增（仅消费现有接口）
- 实时推送（WebSocket）/ 浏览器推送通知
- AMAS 核心算法修改

## Existing Infrastructure

### 通知系统（API 已就绪）

- `NotificationClient.getNotifications()` — 列表查询
- `NotificationClient.getStats()` — 统计（unread/read/archived）
- `NotificationClient.markAsRead(id)` — 单条标记已读
- `NotificationClient.markAllAsRead()` — 全部标记已读
- `NotificationClient.batchMarkAsRead(ids)` — 批量标记已读
- `NotificationClient.deleteNotification(id)` / `batchDelete(ids)` — 删除

### AMAS 系统（部分字段已存在）

- `AmasClient.processEvent()` → `state.conf` 置信度字段已存在
- `explanation.factors[]` / `explanation.changes[]` 已有决策因素和变化说明
- `VisualFatigueDetector` 有 `DetectorConfig`（detectionIntervalMs、enableBlendshapes）
- `visualFatigueStore` 已有 `enabled` / `setEnabled`

## Explicit Constraints (Zero-Decision Specification)

### 通知系统约束

#### C1: 未读数刷新策略

- **策略**: 定时轮询 60 秒
- **实现**: `useNotificationStats` with `refetchInterval: 60000`
- **触发**: 标记已读/删除操作后立即 invalidate

#### C2: 徽章显示规则

- **零值**: 隐藏徽章（不渲染 DOM 节点）
- **封顶**: `count > 99` 显示 "99+"
- **格式**: 1-99 显示精确数字

#### C3: 下拉面板行为

- **列表大小**: 最多 5 条，`min(5, total)`
- **筛选**: `status != 'archived'`，按 `createdAt DESC` 排序
- **点击行为**: 乐观导航（立即跳转）+ 异步标记已读
- **关闭触发**: 点击外部、按 Escape 键

#### C4: 通知中心分页

- **页大小**: 固定 20 条/页
- **参数**: `limit=20, offset=pageIndex*20`

#### C5: 批量选择范围

- **范围**: 仅当前页
- **清空**: 切换页面时自动清空选择

#### C6: 删除行为

- **类型**: 硬删除（不可恢复）
- **确认**: 必须弹窗确认
- **文案**: "确定要删除选中的 N 条通知吗？此操作不可撤销。"

#### C7: 空状态/错误处理

- **空列表**: 使用 `Empty` 组件 `type="notification"`
- **加载失败**: 显示 Toast 错误，徽章保持上次值
- **未知类型**: 降级渲染通用标题/内容

### AMAS 增强约束

#### C8: 置信度阈值

- **低**: `confidence < 0.5` → 红色
- **中**: `0.5 <= confidence <= 0.8` → 黄色
- **高**: `confidence > 0.8` → 绿色
- **缺失**: `confidence === undefined` → 显示 "—" 灰色

#### C9: 疲劳灵敏度映射

| 级别 | EAR 阈值 |
| ---- | -------- |
| 低   | 0.15     |
| 中   | 0.25     |
| 高   | 0.35     |

#### C10: 难度范围配置

- **取值范围**: [0.1, 1.0]
- **步长**: 0.1
- **默认值**: min=0.3, max=0.8
- **约束**: `min <= max` 始终成立（滑块互斥或交换）
- **标签映射**: 0.1-0.3 (简单), 0.4-0.6 (适中), 0.7-1.0 (困难)

#### C11: 参数存储

- **位置**: Zustand 本地存储（visualFatigueStore + 新增 amasSettingsStore）
- **同步**: 仅本地，不跨设备
- **生效时机**: 保存按钮点击后立即生效

#### C12: 状态变化原因

- **显示触发**: 仅重要状态变化时（疲劳突变、难度调整）
- **因素数量**: 显示全部 factors
- **可视化**: 横向条形图，宽度按 percentage 比例

#### C13: 学习建议优先级

- **当前状态**: 暂不实现（等待后端扩展 API 返回优先级数据）
- **占位**: 保持现有单条 suggestion 展示

---

## Property-Based Testing (PBT) Properties

### P1: Badge Rendering Invariant

```
∀n ∈ Z:
  n ≤ 0 → badge = hidden
  1 ≤ n ≤ 99 → badge.text = String(n)
  n > 99 → badge.text = "99+"
```

**Falsification**: Fuzz with [-1000, 0, 1, 99, 100, 10000, NaN]

### P2: Confidence Classification Monotonicity

```
∀c₁ < c₂: category(c₁) ≤ category(c₂)
where low < medium < high
```

**Falsification**: Generate increasing sequences, verify non-decreasing category

### P3: Difficulty Range Integrity

```
∀op ∈ {setMin, setMax}:
  post(op).min ≤ post(op).max ∧
  0.1 ≤ post(op).min ≤ 1.0 ∧
  0.1 ≤ post(op).max ≤ 1.0
```

**Falsification**: Random operation sequences attempting crossover

### P4: Batch Selection Scope Safety

```
∀selection after SelectAll on page P:
  |selection| ≤ pageSize ∧
  selection ⊆ IdsInPage(data, P, pageSize)
```

**Falsification**: Verify no ID from other pages in selection set

### P5: MarkAsRead Idempotence

```
∀ids, state:
  markAsRead(markAsRead(state, ids), ids) = markAsRead(state, ids)
```

**Falsification**: Apply twice, compare states

### P6: Local Storage Determinism

```
∀config: save(config) → reload() → current = config
```

**Falsification**: Random valid configs, save/reload/compare

---

## Acceptance Criteria

- [ ] 导航栏显示通知图标和未读计数
- [ ] 通知中心页面支持已读/未读筛选与批量操作
- [ ] 疲劳检测参数可在设置页调整
- [ ] 自适应难度有上下限可配置
- [ ] 注意力模型展示置信度
- [ ] ~~学习建议按优先级排序~~ (待后端支持)
- [ ] 状态变化展示详细原因
- [ ] 深色模式全覆盖
