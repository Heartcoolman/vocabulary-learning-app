# notification-ui Specification

## Purpose

TBD - created by archiving change add-notification-and-amas-enhancements. Update Purpose after archive.

## Requirements

### Requirement: Notification Bell Component

导航栏 **MUST** 显示通知铃铛图标，带未读计数徽章。

#### Scenario: 显示未读计数徽章

- **Given** 用户已登录
- **And** 存在 5 条未读通知
- **When** 页面加载完成
- **Then** 导航栏应显示铃铛图标
- **And** 徽章显示数字 "5"

#### Scenario: 隐藏零未读徽章

- **Given** 用户已登录
- **And** 未读通知数为 0
- **When** 页面加载完成
- **Then** 铃铛图标应显示
- **And** 徽章 **MUST NOT** 渲染

#### Scenario: 封顶显示 99+

- **Given** 用户已登录
- **And** 未读通知数为 150
- **When** 页面加载完成
- **Then** 徽章应显示 "99+"

#### Scenario: 定时刷新未读数

- **Given** 页面已加载
- **When** 60 秒后
- **Then** 应自动调用 `getStats` 刷新未读数

---

### Requirement: Notification Dropdown Panel

铃铛点击后 **SHALL** 展开下拉面板预览通知。

#### Scenario: 展开下拉面板

- **Given** 用户点击铃铛图标
- **When** 下拉面板打开
- **Then** 应显示最多 5 条最新通知
- **And** 通知按 `createdAt` 降序排列
- **And** 不包含 `status=archived` 的通知

#### Scenario: 点击通知项

- **Given** 下拉面板已展开
- **And** 存在未读通知
- **When** 用户点击某条通知
- **Then** 应立即导航到相关页面（乐观更新）
- **And** 异步调用 `markAsRead` 标记已读
- **And** 下拉面板关闭

#### Scenario: 全部标记已读

- **Given** 下拉面板已展开
- **When** 用户点击"全部标记已读"
- **Then** 应调用 `markAllAsRead`
- **And** 所有通知状态变为已读
- **And** 徽章数字更新为 0（隐藏）

#### Scenario: 关闭下拉面板

- **Given** 下拉面板已展开
- **When** 用户点击面板外部或按 Escape
- **Then** 下拉面板应关闭

---

### Requirement: Notification Center Page

用户 **MUST** 能够访问通知中心管理所有通知。

#### Scenario: 访问通知中心

- **Given** 用户已登录
- **When** 访问 `/notifications`
- **Then** 应显示通知中心页面
- **And** 包含统计概览、筛选栏、通知列表

#### Scenario: 分页加载通知

- **Given** 用户访问通知中心
- **And** 存在 50 条通知
- **When** 页面加载
- **Then** 应显示第一页 20 条通知
- **And** 分页参数为 `limit=20, offset=0`

#### Scenario: 切换页面

- **Given** 用户在通知中心第 1 页
- **When** 点击第 2 页
- **Then** 应请求 `limit=20, offset=20`
- **And** 当前页选择状态清空

---

### Requirement: Batch Operations

通知中心 **SHALL** 支持批量操作。

#### Scenario: 全选当前页

- **Given** 用户在通知中心
- **And** 当前页有 20 条通知
- **When** 点击"全选"复选框
- **Then** 应选中当前页所有 20 条
- **And** 不选中其他页面的通知

#### Scenario: 批量标记已读

- **Given** 用户选中了 5 条未读通知
- **When** 点击"标记已读"
- **Then** 应调用 `batchMarkAsRead` 传入选中 ID
- **And** 选中通知状态变为已读
- **And** 未读计数徽章更新

#### Scenario: 批量删除确认

- **Given** 用户选中了 3 条通知
- **When** 点击"删除"按钮
- **Then** 应弹出确认对话框
- **And** 显示 "确定要删除选中的 3 条通知吗？此操作不可撤销。"

#### Scenario: 确认删除

- **Given** 删除确认对话框已显示
- **When** 用户点击"确定"
- **Then** 应调用 `batchDelete` 传入选中 ID
- **And** 通知从列表中移除
- **And** 选择状态清空

#### Scenario: 取消删除

- **Given** 删除确认对话框已显示
- **When** 用户点击"取消"
- **Then** 对话框关闭
- **And** 不执行删除操作

---

### Requirement: Empty and Error States

通知 UI **MUST** 正确处理空状态和错误。

#### Scenario: 空通知列表

- **Given** 用户访问通知中心
- **And** 没有任何通知
- **When** 页面加载完成
- **Then** 应显示 `Empty` 组件 `type="notification"`
- **And** 显示"暂无通知"提示

#### Scenario: 加载失败

- **Given** 网络请求失败
- **When** 获取通知列表失败
- **Then** 应显示 Toast 错误提示
- **And** 徽章保持上次成功的值
