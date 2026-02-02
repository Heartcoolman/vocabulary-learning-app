# micro-behavior-collection Specification

## Purpose

TBD - created by archiving change 2026-02-02-amas-data-expansion-micro-behavior. Update Purpose after archive.

## Requirements

### Requirement: 微行为数据采集服务 (REQ-MICRO-001)

前端 SHALL 提供 `MicroBehaviorTracker` 服务类，采集用户答题过程中的微观行为数据。

#### Scenario: 初始化并采集轨迹数据

- Given 用户进入答题页面
- When 题目选项渲染完成
- Then 调用 `microBehaviorTracker.init(containerElement)` 初始化采集
- And 采集 pointer move 事件并记录轨迹点 (x, y, t, epochMs)
- And 轨迹点数量不超过 500 条 (FIFO 策略)

### Requirement: 犹豫系数计算 (REQ-MICRO-002)

后端 SHALL 根据轨迹长度和直线距离计算犹豫系数，用于掌握度惩罚。

#### Scenario: 计算犹豫系数并应用惩罚

- Given 用户提交答案时包含微行为数据
- When 后端计算 `indecision_index = (trajectory_length / direct_distance - 1) * switch_penalty`
- Then 对 `direct_distance < 10` 或 `ratio < 1.5` 返回 None (视为无犹豫)
- And 在 `compute_adaptive_mastery` 中应用最大 30% 的惩罚

### Requirement: 按键熟练度计算 (REQ-MICRO-003)

后端 SHALL 根据反应延迟和按键保持时间计算熟练度加权。

#### Scenario: 计算按键熟练度并应用加成

- Given 用户通过键盘选择答案
- When 后端计算 `keystroke_fluency` (sigmoid 映射)
- Then 反应快 + 保持时间短 = 高熟练度
- And 在 `compute_adaptive_mastery` 中应用最大 10% 的加成

### Requirement: 蒙题标记一票否决 (REQ-MICRO-004)

系统 MUST 在用户标记 "不确定/蒙的" 且答对时，强制 `is_mastered = false`。

#### Scenario: 蒙题正确触发否决

- Given 用户勾选 "不确定/蒙的" 复选框
- When 用户选择正确答案
- Then 后端设置 `is_mastered = false` 无论得分多高
- And 该单词进入高优先级复习队列

### Requirement: 原始事件序列持久化 (REQ-MICRO-005)

后端 SHALL 将原始微行为事件序列存入 `micro_behavior_events` 表。

#### Scenario: 存储原始轨迹/悬停/按键事件

- Given 答案记录创建成功
- When 请求包含 `micro_interaction` 数据
- Then 将 trajectory_points 存为 eventType='trajectory'
- And 将 hover_events 存为 eventType='hover'
- And 将 keystroke_events 存为 eventType='keystroke'
