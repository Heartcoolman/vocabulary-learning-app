# amas-ui Specification

## Purpose

TBD - created by archiving change add-notification-and-amas-enhancements. Update Purpose after archive.

## Requirements

### Requirement: Confidence Badge Component

AMAS 状态展示 **MUST** 包含置信度徽章。

#### Scenario: 显示高置信度

- **Given** AMAS 返回 `state.confidence = 0.85`
- **When** 渲染 ConfidenceBadge
- **Then** 应显示绿色徽章
- **And** 文本为 "85%"

#### Scenario: 显示中置信度

- **Given** AMAS 返回 `state.confidence = 0.65`
- **When** 渲染 ConfidenceBadge
- **Then** 应显示黄色徽章
- **And** 文本为 "65%"

#### Scenario: 显示低置信度

- **Given** AMAS 返回 `state.confidence = 0.35`
- **When** 渲染 ConfidenceBadge
- **Then** 应显示红色徽章
- **And** 文本为 "35%"
- **And** 显示低置信度提示信息

#### Scenario: 处理缺失置信度

- **Given** AMAS 返回 `state.confidence = undefined`
- **When** 渲染 ConfidenceBadge
- **Then** 应显示灰色徽章
- **And** 文本为 "—"

---

### Requirement: Fatigue Detection Settings

用户 **SHALL** 能够在设置页配置疲劳检测参数。

#### Scenario: 显示疲劳灵敏度选项

- **Given** 用户访问学习设置页
- **When** 页面加载
- **Then** 应显示"疲劳检测"配置区
- **And** 包含灵敏度滑块（低/中/高）

#### Scenario: 选择低灵敏度

- **Given** 用户在疲劳检测设置区
- **When** 选择"低"灵敏度
- **Then** 应将 EAR 阈值设为 0.15
- **And** 保存到 visualFatigueStore

#### Scenario: 选择中灵敏度

- **Given** 用户在疲劳检测设置区
- **When** 选择"中"灵敏度
- **Then** 应将 EAR 阈值设为 0.25

#### Scenario: 选择高灵敏度

- **Given** 用户在疲劳检测设置区
- **When** 选择"高"灵敏度
- **Then** 应将 EAR 阈值设为 0.35

---

### Requirement: Difficulty Range Configuration

用户 **MUST** 能够配置自适应难度的上下限。

#### Scenario: 显示难度范围滑块

- **Given** 用户访问学习设置页
- **When** 页面加载
- **Then** 应显示双滑块组件
- **And** 默认值为 min=0.3, max=0.8

#### Scenario: 调整最小难度

- **Given** 当前 min=0.3, max=0.8
- **When** 用户拖动最小滑块到 0.4
- **Then** min 应更新为 0.4
- **And** max 保持 0.8

#### Scenario: 防止交叉

- **Given** 当前 min=0.5, max=0.6
- **When** 用户尝试将 min 拖动到 0.7
- **Then** min **MUST NOT** 超过 max
- **And** min 应停在 0.6 或与 max 交换

#### Scenario: 步长限制

- **Given** 用户拖动滑块
- **When** 释放滑块
- **Then** 值应对齐到 0.1 的倍数

#### Scenario: 显示难度标签

- **Given** min=0.2, max=0.9
- **When** 渲染滑块
- **Then** min 区域显示"简单"标签
- **And** max 区域显示"困难"标签

---

### Requirement: State Change Reason Display

学习过程中状态变化 **SHALL** 展示详细原因。

#### Scenario: 显示状态变化原因卡片

- **Given** AMAS 处理事件后疲劳值突变
- **When** 返回 `explanation.factors` 非空
- **Then** 应弹出状态变化原因卡片
- **And** 显示所有影响因素

#### Scenario: 渲染因素权重条形图

- **Given** `explanation.factors` 包含 3 个因素
- **And** 各因素 percentage 为 [50, 30, 20]
- **When** 渲染 StateChangeReason 组件
- **Then** 应显示 3 个横向条形
- **And** 宽度按 percentage 比例 (50%, 30%, 20%)

#### Scenario: 处理空因素列表

- **Given** `explanation.factors` 为空数组
- **When** 渲染 StateChangeReason 组件
- **Then** 应显示"暂无详细原因"
- **And** 不渲染条形图

#### Scenario: 非重要变化不显示

- **Given** AMAS 处理事件
- **And** 状态变化不显著（疲劳变化 < 0.1）
- **When** 事件处理完成
- **Then** **MUST NOT** 弹出原因卡片

---

### Requirement: Config Preview Component

参数调整时 **SHALL** 展示即时预览。

#### Scenario: 显示变更前后对比

- **Given** 用户修改了疲劳灵敏度从"中"到"高"
- **When** ConfigPreview 组件渲染
- **Then** 应显示"变更前: EAR=0.25"
- **And** 显示"变更后: EAR=0.35"

#### Scenario: 防抖更新预览

- **Given** 用户快速拖动滑块
- **When** 滑块值变化
- **Then** 预览应在 200ms 防抖后更新
- **And** 避免频繁重新渲染

---

### Requirement: Settings Persistence

AMAS 设置 **MUST** 持久化到本地存储。

#### Scenario: 保存设置到本地

- **Given** 用户修改了难度范围
- **When** 点击"保存"按钮
- **Then** 应保存到 amasSettingsStore
- **And** 数据持久化到 localStorage

#### Scenario: 加载已保存设置

- **Given** 之前保存了 min=0.4, max=0.7
- **When** 用户重新访问设置页
- **Then** 滑块应显示 min=0.4, max=0.7

#### Scenario: 设置立即生效

- **Given** 用户保存了新的疲劳灵敏度
- **When** 保存成功
- **Then** 疲劳检测器应立即使用新参数
