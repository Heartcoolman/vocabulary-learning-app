# confusion-batch-learning Specification

## Purpose

实现按主题分组的批量连续学习模式，用户选择一个主题后自主决定学习数量，无需反复跳转。

## ADDED Requirements

### Requirement: Theme-Based Confusion Display

易混淆词页面 **MUST** 按主题分组展示混淆词对。

#### Scenario: 显示主题列表

- **Given** 用户进入易混淆词页面
- **When** 页面加载完成
- **Then** 应显示主题列表（来自 word_clusters）
- **And** 每个主题应显示其内部混淆词对数量
- **And** 主题按混淆词对数量降序排列

#### Scenario: 展开主题详情

- **Given** 主题列表已加载
- **When** 用户点击某主题（如"🐾 动物类"）
- **Then** 应展开显示该主题内的混淆词对列表
- **And** 词对应按相似度（distance）升序排列

#### Scenario: 无聚类数据

- **Given** 系统尚未完成聚类
- **When** 加载主题列表
- **Then** 应显示提示"暂无主题分组，请等待系统处理"
- **And** 可降级显示全局混淆词对列表

---

### Requirement: User-Controlled Learning Count

用户 **MUST** 能够自主选择学习的词对数量。

#### Scenario: 数量选择器

- **Given** 用户展开某主题（该主题有 12 对混淆词）
- **When** 查看数量选择器
- **Then** 应显示滑块或数字输入框
- **And** 范围应为 1 ~ 12（该主题总对数）
- **And** 默认值应为 min(5, 总对数)

#### Scenario: 调整学习数量

- **Given** 数量选择器显示默认值 5
- **When** 用户调整为 8
- **Then** 选择器应显示 8
- **And** "开始学习"按钮应可用

#### Scenario: 超出范围限制

- **Given** 主题内有 6 对混淆词
- **When** 用户尝试输入 10
- **Then** 应自动限制为 6（最大值）

---

### Requirement: Batch Learning Queue

学习页面 **SHALL** 支持混淆词批量学习队列。

#### Scenario: 启动批量学习

- **Given** 用户在"动物类"主题下选择学习 5 对
- **When** 点击"开始学习"
- **Then** 应导航至学习页
- **And** seedSource 应为 'confusion-batch'
- **And** 队列应包含 10 个单词（5 对 × 2）
- **And** 应显示主题标签"🐾 动物类"

#### Scenario: 显示学习进度

- **Given** 正在批量学习第 2 对（共 5 对）
- **When** 查看进度指示器
- **Then** 应显示主题标签
- **And** 应显示 "第 2/5 对"
- **And** 应显示当前对的两个词

#### Scenario: 自动推进到下一对

- **Given** 完成当前对的两个词学习
- **When** 自动推进
- **Then** 应加载下一对
- **And** 进度指示器应更新

#### Scenario: 完成所有对

- **Given** 完成最后一对学习
- **When** 自动推进
- **Then** 应显示批量学习完成界面
- **And** 应显示学习统计（正确率、用时等）

---

### Requirement: Batch Learning Controls

批量学习模式 **MUST** 提供快捷控制操作。

#### Scenario: 跳过当前对

- **Given** 正在学习第 3 对
- **When** 用户点击"跳过这对"
- **Then** 应直接进入第 4 对
- **And** 被跳过的对不计入学习统计

#### Scenario: 结束批量学习

- **Given** 正在学习第 2 对（共 5 对）
- **When** 用户点击"结束学习"
- **Then** 应显示确认对话框
- **And** 确认后显示已完成部分的统计

#### Scenario: 返回选择更多

- **Given** 完成批量学习
- **When** 用户点击"继续选择"
- **Then** 应返回易混淆词页面
- **And** 应展开之前选择的主题

---

### Requirement: Confusion Pair Comparison Display

学习页面 **SHALL** 提供混淆词对比展示模式。

#### Scenario: 并排对比模式

- **Given** 正在学习混淆词对
- **When** 答题界面加载
- **Then** 应并排显示两个词的拼写
- **And** 当前测试词应高亮

#### Scenario: 释义对比

- **Given** 用户答题后
- **When** 显示结果
- **Then** 应同时展示两词的释义
- **And** 应标注易混淆点（如词根相似）

---
