# Tasks: Notification System & AMAS Enhancements

## Implementation Constraints Reference

所有实现必须严格遵循 `proposal.md` 中的 **Explicit Constraints (C1-C13)** 和 **PBT Properties (P1-P6)**。

---

## Phase 1: 通知系统基础

### 1.1 React Query Hooks

- [x] 创建 `useNotifications` hook（列表查询，支持筛选参数）
- [x] 创建 `useNotificationStats` hook（`refetchInterval: 60000`，遵循 C1）
- [x] 创建 `useMarkAsRead` / `useBatchMarkAsRead` / `useMarkAllAsRead` mutation hooks
- [x] 创建 `useDeleteNotification` / `useBatchDeleteNotifications` mutation hooks
- [x] 在 `queryKeys.ts` 添加 `notifications` query key 命名空间

### 1.2 通知组件

- [x] 创建 `NotificationBell` 组件（遵循 C2：0 隐藏，>99 显示 "99+"）
- [x] 创建 `NotificationDropdown` 下拉面板（遵循 C3：最多 5 条，createdAt DESC）
- [x] 创建 `NotificationItem` 组件（已读/未读圆点、标题、摘要、时间、操作菜单）

---

## Phase 2: 通知中心页面

### 2.1 页面与路由

- [x] 创建 `NotificationCenterPage`（统计概览 + 筛选栏 + 列表）
- [x] 添加 `/notifications` 路由到用户路由配置
- [x] 在 AdminLayout 和用户导航栏集成 `NotificationBell`

### 2.2 列表与批量操作

- [x] 添加批量选择复选框 + 全选/取消全选（遵循 C5：仅当前页）
- [x] 添加批量操作工具栏（标记已读、删除）
- [x] 添加删除确认弹窗（遵循 C6：硬删除 + 确认）
- [x] 添加分页控件（遵循 C4：limit=20, offset=pageIndex\*20）
- [x] 空状态使用 `Empty` 组件（type="notification"，遵循 C7）

---

## Phase 3: AMAS 参数可配置

### 3.1 疲劳检测参数

- [x] 在 StudySettingsPage 添加"疲劳检测"高级配置区
- [x] 添加疲劳灵敏度滑块（遵循 C9：低=0.15, 中=0.25, 高=0.35）
- [x] 添加疲劳提醒方式选择（弹窗/状态栏）
- [x] 配置持久化到 visualFatigueStore（遵循 C11：本地存储）

### 3.2 自适应难度配置

- [x] 创建 `amasSettingsStore` Zustand store（难度范围 + 调整速度）
- [x] 创建 `DifficultyRangeSlider` 双滑块组件（遵循 C10：0.1-1.0, 步长 0.1, min≤max）
- [x] 在 StudySettingsPage 添加"难度范围"配置区
- [x] 添加难度调整速度选择（保守/正常/激进）

### 3.3 参数变更即时预览

- [x] 创建 `ConfigPreview` 组件（变更前后对比卡片）
- [x] 在参数调整时实时计算并展示效果预览

---

## Phase 4: AMAS 结果展示增强

### 4.1 注意力模型置信度

- [x] 创建 `ConfidenceBadge` 组件（遵循 C8：<0.5 红, 0.5-0.8 黄, >0.8 绿, undefined 灰）
- [x] 在 AmasStatus 组件中集成置信度显示（读取 state.confidence）
- [x] 低置信度时显示提示信息

### 4.2 学习建议优先级排序

- [x] 增强 `AmasSuggestion` 组件支持优先级显示
- [x] 根据 factors 和状态推断优先级（高/中/低）
- [x] 添加优先级徽章（重要/建议/提示）

### 4.3 状态变化详细原因

- [x] 创建 `StateChangeReason` 组件（遵循 C12：全部 factors，横向条形图）
- [x] 显示影响因素权重分布（宽度按 percentage 比例）
- [x] 在 `AmasSuggestion` 中集成 factors 显示（转换 API 格式为 DecisionFactor）

---

## Phase 5: 测试与适配

### 5.1 通知系统测试

- [x] NotificationBell 组件测试
- [x] NotificationDropdown 组件测试
- [x] NotificationCenterPage 页面测试
- [x] 通知 hooks 测试

### 5.2 AMAS 增强测试

- [x] DifficultyRangeSlider 组件测试
- [x] ConfigPreview 组件测试
- [x] ConfidenceBadge 组件测试
- [x] StateChangeReason 组件测试

### 5.3 样式验证

- [x] 深色模式全覆盖
- [x] 移动端响应式适配

---

## Dependencies

```
Phase 1 (通知 Hooks + 组件)
    ↓
Phase 2 (通知页面 + 集成) ← 依赖 Phase 1
    |
Phase 3 (AMAS 参数) ← 可与 Phase 1/2 并行
    |
Phase 4 (AMAS 展示) ← 可与 Phase 3 并行
    ↓
Phase 5 (测试) ← 依赖 Phase 1–4
```

## Effort Estimate

| Phase     | Tasks  | Complexity |
| --------- | ------ | ---------- |
| Phase 1   | 7      | Low        |
| Phase 2   | 7      | Medium     |
| Phase 3   | 8      | Medium     |
| Phase 4   | 5      | Medium     |
| Phase 5   | 10     | Low        |
| **Total** | **37** | -          |
