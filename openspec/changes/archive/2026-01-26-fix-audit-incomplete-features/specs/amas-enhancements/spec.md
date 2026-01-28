# Spec Delta: AMAS System Enhancements

## MODIFIED Requirements

### Requirement: Fatigue Detection Configuration

疲劳检测参数 **SHALL** 完全可由用户配置，超出推荐范围时显示警告。

#### Scenario: 查看疲劳检测设置

- **Given** 用户进入学习设置页面
- **When** 展开疲劳检测设置
- **Then** 应显示当前参数值
- **And** 参数包含：检测阈值、恢复时间

#### Scenario: 参数范围定义

- **Given** 配置疲劳检测参数
- **When** 显示参数控件
- **Then** 疲劳阈值范围: 0.1 - 0.95（推荐 0.3-0.9）
- **And** 恢复时间范围: 30s - 600s（推荐 60s-300s）

#### Scenario: 超出推荐范围警告

- **Given** 用户设置参数超出推荐范围
- **When** 保存设置
- **Then** 允许保存
- **And** 显示橙色警告标签提示风险

#### Scenario: 调整疲劳阈值

- **Given** 用户调整疲劳检测阈值
- **When** 保存设置
- **Then** 新阈值应立即生效
- **And** 显示保存成功提示

#### Scenario: 参数越界拒绝

- **Given** 用户输入超出硬限制的值（<0.1 或 >0.95）
- **When** 尝试保存
- **Then** 应显示验证错误
- **And** 拒绝保存

---

### Requirement: Attention Model Confidence

注意力模型 **MUST** 显示置信度。

#### Scenario: 显示注意力置信度

- **Given** AMAS计算出注意力分数
- **When** 显示结果
- **Then** 应同时显示置信度百分比
- **And** 低置信度（<60%）时有提示

#### Scenario: 置信度计算

- **Given** 系统收集用户行为数据
- **When** 计算注意力分数
- **Then** 置信度应基于数据量和一致性计算

---

### Requirement: Adaptive Difficulty Bounds

自适应难度 **SHALL** 有可配置的上下限，超出推荐范围时显示警告。

#### Scenario: 难度范围定义

- **Given** 配置自适应难度参数
- **When** 显示参数控件
- **Then** 难度范围硬限制: 0.05 - 0.98
- **And** 超出推荐范围时显示警告

#### Scenario: 设置难度上限

- **Given** 用户设置最大难度为"中等"
- **When** 自适应算法运行
- **Then** 推荐难度不应超过"中等"

#### Scenario: 设置难度下限

- **Given** 用户设置最小难度为"简单"
- **When** 即使表现很好
- **Then** 推荐难度不应低于"简单"

#### Scenario: 显示当前难度范围

- **Given** 用户查看学习设置
- **When** 页面加载
- **Then** 应显示当前配置的难度范围

---

### Requirement: Learning Suggestions Priority

学习建议 **MUST** 有优先级排序。

#### Scenario: 显示优先级标签

- **Given** AMAS生成多条学习建议
- **When** 显示建议列表
- **Then** 应按优先级排序
- **And** 高优先级建议有"重要"标签

#### Scenario: 优先级计算

- **Given** 系统分析用户学习状态
- **When** 生成建议
- **Then** 优先级应基于：紧迫性、影响度、可操作性

#### Scenario: 建议详细原因

- **Given** 用户查看某条建议
- **When** 点击展开
- **Then** 应显示为何有此建议
- **And** 提供具体行动指导

---

## Related Capabilities

- **AMAS Learning Engine** - AMAS核心功能增强
- **User Settings** - 参数配置集成
