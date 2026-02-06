# state-checkin-calibration Specification

## Purpose

TBD - created by archiving change 2026-02-02-amas-data-expansion-micro-behavior. Update Purpose after archive.

## Requirements

### Requirement: 状态打卡组件 (REQ-CHECKIN-001)

前端 SHALL 提供 `StateCheckIn` 组件，在会话开始时询问用户当前精力状态。

#### Scenario: 用户选择精力状态

- Given 用户进入 LearningPage
- When 题目列表加载完成且尚未作答
- Then 显示状态打卡浮层
- And 用户点击 "精力充沛"/"平平淡淡"/"精疲力尽" 中任一选项
- And 浮层关闭，记录选择到 localStorage，开始学习

### Requirement: 自动跳过与默认值 (REQ-CHECKIN-002)

打卡组件 SHALL 支持 3 秒自动跳过，使用上次选择或默认值 `normal`。

#### Scenario: 3 秒无操作自动跳过

- Given 打卡浮层显示
- When 用户 3 秒内无任何操作
- Then 自动使用默认值 `normal` 关闭浮层
- And 开始学习

### Requirement: TFM 疲劳校准 (REQ-CHECKIN-003)

后端 SHALL 根据用户报告的精力状态校准 TFM 疲劳模型。

#### Scenario: Low 能量校准

- Given 用户选择 "精疲力尽" (low)
- When 创建学习会话时传递 `selfReportedEnergy: "low"`
- Then TFM 应用校准因子 1.4 (提高疲劳检测灵敏度)
- And 难度上限约束为 Easy
- And 新词比例上限约束为 0

### Requirement: API 严格校验 (REQ-CHECKIN-004)

后端 MUST 对 energy level 进行严格校验，拒绝非法值。

#### Scenario: 非法 energy 值返回 400

- Given 请求包含 `selfReportedEnergy: "medium"`
- When 调用创建会话 API
- Then 返回 400 Bad Request
- And 错误消息说明有效值为 'high', 'normal', 'low'
