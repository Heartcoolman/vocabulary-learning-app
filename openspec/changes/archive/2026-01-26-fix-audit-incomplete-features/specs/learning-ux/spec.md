# Spec Delta: Learning UX Improvements

## MODIFIED Requirements

### Requirement: Learning Mode Transitions

学习模式切换 **SHALL** 使用 framer-motion Spring 物理动画实现平滑过渡。

#### Scenario: 切换学习模式

- **Given** 用户在学习页面
- **When** 切换学习模式（如从选择到填空）
- **Then** 应使用 Spring 物理动画过渡
- **And** 配置 `{ type: "spring", stiffness: 300, damping: 30 }`
- **And** 尊重 `prefers-reduced-motion` 系统设置

#### Scenario: 进入下一题

- **Given** 用户回答完当前题目
- **When** 进入下一题
- **Then** 应使用 Spring 物理动画过渡

---

### Requirement: Error Answer Explanation

错误答案 **MUST** 提供详细解析。

#### Scenario: 显示错误解析

- **Given** 用户回答错误
- **When** 显示结果
- **Then** 应显示正确答案
- **And** 显示解析说明（如词根、用法区别）
- **And** 支持点击展开更多

#### Scenario: 无解析数据

- **Given** 单词没有解析数据
- **When** 显示结果
- **Then** 应只显示正确答案
- **And** 不显示空的解析区域

---

### Requirement: Progress Indicators

学习进度指示器 **SHALL** 有动画和详细信息。

#### Scenario: 进度条动画

- **Given** 用户完成一个单词学习
- **When** 进度更新
- **Then** 进度条应有平滑增长动画
- **And** 显示数字进度（如 5/20）

#### Scenario: 目标进度显示

- **Given** 用户设置了每日学习目标
- **When** 查看进度
- **Then** 应显示百分比（如 60%）
- **And** 显示剩余数量

#### Scenario: 学习时间统计

- **Given** 用户查看学习时间
- **When** 切换视图
- **Then** 应支持日视图和周视图切换
- **And** 周视图显示每日对比图

---

### Requirement: Audio Playback

音频播放 **MUST** 有加载状态指示。

#### Scenario: 音频加载中

- **Given** 用户点击播放发音
- **When** 音频正在加载
- **Then** 应显示加载动画
- **And** 按钮不可重复点击

#### Scenario: 音频加载失败

- **Given** 音频加载失败
- **When** 显示结果
- **Then** 应显示错误图标
- **And** 支持点击重试

---

### Requirement: Review Queue Display

复习队列 **SHALL** 清晰展示优先级。

#### Scenario: 显示复习原因

- **Given** 用户查看复习队列
- **When** 列表加载完成
- **Then** 每个单词应显示为何需要复习
- **And** 如"距上次复习7天"或"错误率高"

---

### Requirement: Mastery Trend Display

掌握度变化 **SHALL** 使用 Recharts 动态自适应时间窗口展示趋势图。

#### Scenario: 显示掌握度趋势

- **Given** 用户查看某单词详情
- **When** 页面加载
- **Then** 应使用 Recharts 显示掌握度变化趋势图
- **And** 图表支持深色模式（CSS变量）

#### Scenario: 动态时间窗口

- **Given** 用户有不同量级的学习数据
- **When** 渲染趋势图
- **Then** 数据 < 7 天时显示全部
- **And** 数据 7-30 天时默认显示近 7 天
- **And** 数据 > 30 天时默认显示近 14 天
- **And** 支持切换 7/14/30/全部 视图

#### Scenario: 移动端适配

- **Given** 屏幕宽度 < 640px
- **When** 显示趋势图
- **Then** 默认显示简化视图
- **And** 点击可展开完整图表模态框

---

## Related Capabilities

- **Word Learning** - 学习体验的核心改进
- **User Statistics** - 进度和时间统计展示
