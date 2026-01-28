# Spec Delta: UI Consistency

## MODIFIED Requirements

### Requirement: Empty States Consistency

空状态页面 **MUST** 使用统一的图标+文字+操作模式设计。

#### Scenario: 显示空状态

- **Given** 列表无数据
- **When** 页面渲染
- **Then** 应显示 Phosphor Icon（64px）
- **And** 显示标题 + 副标题说明文字
- **And** 显示主要操作按钮（如"添加"/"刷新"）

#### Scenario: 不同类型空状态

- **Given** 不同页面的空状态
- **When** 对比显示
- **Then** 应使用相同的组件结构
- **And** 仅图标、文字、操作按钮内容不同

---

### Requirement: Dark Mode Coverage

深色模式 **SHALL** 覆盖所有组件。

#### Scenario: 检查深色模式适配

- **Given** 用户启用深色模式
- **When** 浏览所有页面
- **Then** 所有组件应有正确的深色样式
- **And** 无白底闪烁问题

#### Scenario: 深色模式切换动画

- **Given** 用户切换主题模式
- **When** 切换发生
- **Then** 应使用 framer-motion Spring 物理动画
- **And** 配置 `{ type: "spring", stiffness: 300, damping: 30 }`
- **And** 尊重 `prefers-reduced-motion` 系统设置

---

### Requirement: Error Page Improvements

错误页面 **MUST** 提供重试功能。

#### Scenario: 显示错误页面

- **Given** 页面加载失败
- **When** 显示错误
- **Then** 应有"重试"按钮
- **And** 显示友好的错误说明

#### Scenario: 点击重试

- **Given** 用户在错误页面
- **When** 点击重试
- **Then** 应重新加载当前页面
- **And** 显示加载状态

---

### Requirement: Offline Support

网络离线 **SHALL** 通过心跳检测提供友好提示。

#### Scenario: 心跳检测机制

- **Given** 应用运行中
- **When** 系统执行心跳检测
- **Then** 每 30 秒 ping `/health` 端点
- **And** 超时时间 5 秒
- **And** 连续 2 次失败触发离线状态

#### Scenario: 检测到离线

- **Given** 心跳检测连续 2 次失败
- **When** 进入离线状态
- **Then** 应显示离线提示条
- **And** 提示"网络已断开，部分功能不可用"

#### Scenario: 网络恢复

- **Given** 处于离线状态
- **When** 心跳检测首次成功
- **Then** 离线提示应自动消失
- **And** 自动重试失败的请求

---

### Requirement: Settings Reset Option

设置页面 **SHALL** 提供重置选项。

#### Scenario: 重置到默认设置

- **Given** 用户在设置页面
- **When** 点击"恢复默认"
- **Then** 应显示确认对话框
- **And** 确认后重置所有设置

#### Scenario: 部分重置

- **Given** 用户在某个设置分组
- **When** 点击该分组的重置
- **Then** 应只重置该分组的设置

---

### Requirement: Search Result Highlighting

搜索结果 **MUST** 使用大小写不敏感匹配高亮词。

#### Scenario: 高亮匹配文本

- **Given** 用户搜索"apple"
- **When** 显示搜索结果
- **Then** 结果中的"apple"/"Apple"/"APPLE"都应高亮
- **And** 使用 `<mark>` 标签 + 背景色
- **And** 原文大小写保持不变

#### Scenario: 多词匹配

- **Given** 用户搜索"red apple"
- **When** 显示搜索结果
- **Then** "red"和"apple"都应独立高亮
- **And** 大小写不敏感匹配

---

### Requirement: List Loading Skeleton

列表加载 **SHALL** 显示骨架屏。

#### Scenario: 列表加载中

- **Given** 用户进入列表页面
- **When** 数据正在加载
- **Then** 应显示骨架屏占位
- **And** 骨架屏样式与实际内容布局一致

#### Scenario: 滚动加载更多

- **Given** 用户滚动到列表底部
- **When** 加载更多数据
- **Then** 应在列表底部显示加载骨架

---

## Related Capabilities

- **User Interface** - 全局UI一致性
- **Theme System** - 深色模式相关
