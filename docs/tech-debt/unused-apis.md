# 未使用的 API 方法清单

本文档记录 `src/services/ApiClient.ts` 中未被前端使用的 API 方法。

## 执行摘要

- **总方法数**: 123 个 async 方法
- **未使用方法**: 30 个
- **已删除**: 1 个 (getAllRecords - 已废弃)
- **待实现 UI**: 29 个
- **内部方法**: 1 个

---

## 🗑️ 已删除方法（1个）

| 方法名 | 原位置 | 类别 | 删除原因 | 删除日期 |
|--------|--------|------|---------|---------|
| `getAllRecords` | ApiClient.ts:963 | 已废弃 | 代码注释标明已废弃，已被分页的 `getRecords` 替代 | 2025-12-03 |

**状态**: ✅ 已完成删除，无引用破坏

---

## 📋 待实现 UI 的方法（29个）

这些方法的后端 API 已完整实现并测试通过，但前端尚未构建对应的用户界面。

### 1. AMAS 增强功能（5个）

| 方法名 | 位置 | 说明 | 优先级 |
|--------|------|------|--------|
| `getAmasStrategy` | ApiClient.ts:1880 | 获取当前 AMAS 策略配置 | Medium |
| `resetAmasState` | ApiClient.ts:1896 | 重置 AMAS 状态（管理员调试用） | Low |
| `batchProcessEvents` | ApiClient.ts:1922 | 批量处理事件（离线回放） | Low |
| `getChronotypeProfile` | ApiClient.ts:2849 | 获取用户生物钟档案 | Medium |
| `getLearningStyleProfile` | ApiClient.ts:2866 | 获取学习风格档案 | Medium |

**说明**:
- `getChronotypeProfile` 和 `getLearningStyleProfile` 与 `getCognitiveProfile` 有重叠，但可用于构建专门的档案视图
- `batchProcessEvents` 用于离线数据回放和批量导入场景

### 2. 单词本管理（2个）

| 方法名 | 位置 | 说明 | 优先级 |
|--------|------|------|--------|
| `batchCreateWords` | ApiClient.ts:893 | 批量创建单词 | High |
| `updateWordBook` | ApiClient.ts:1036 | 更新单词本信息 | High |

**说明**:
- 后端已实现完整的单词本 CRUD API
- 前端缺少单词本编辑和批量导入功能
- 建议优先实现，提升用户体验

### 3. 优化与因果分析（10个）

| 方法名 | 位置 | 说明 | 优先级 |
|--------|------|------|--------|
| `getOptimizationSuggestion` | ApiClient.ts:2637 | 获取优化建议 | Low |
| `recordOptimizationEvaluation` | ApiClient.ts:2648 | 记录优化评估 | Low |
| `getBestOptimizationParams` | ApiClient.ts:2662 | 获取最佳优化参数 | Low |
| `getOptimizationHistory` | ApiClient.ts:2673 | 获取优化历史 | Low |
| `triggerOptimization` | ApiClient.ts:2685 | 手动触发优化 | Low |
| `resetOptimizer` | ApiClient.ts:2696 | 重置优化器 | Low |
| `getOptimizationDiagnostics` | ApiClient.ts:2704 | 获取优化诊断信息 | Low |
| `recordCausalObservation` | ApiClient.ts:2714 | 记录因果观察数据 | Low |
| `getCausalATE` | ApiClient.ts:2734 | 获取因果平均处理效应 | Low |
| `compareStrategies` | ApiClient.ts:2746 | 比较不同学习策略 | Low |

**说明**:
- 这些是高级分析和调优功能，面向管理员和研究人员
- 后端已集成贝叶斯优化器和因果推断引擎
- 前端尚未构建对应的管理界面
- 属于"Nice-to-have"功能，不影响核心学习流程

### 4. 单词掌握度分析（1个）

| 方法名 | 位置 | 说明 | 优先级 |
|--------|------|------|--------|
| `getWordMasteryDetail` | ApiClient.ts:2340 | 获取单个单词的详细掌握度信息 | Medium |

**说明**:
- `getWordMasteryStats` 已被 WordMasteryPage 调用
- 此方法可用于构建单词详情模态框，展示更细粒度的掌握度分析

### 5. 管理员 API（4个）

| 方法名 | 位置 | 说明 | 优先级 |
|--------|------|------|--------|
| `adminGetUserById` | ApiClient.ts:1142 | 获取用户详情（管理员） | Low |
| `adminGetUserLearningData` | ApiClient.ts:1149 | 获取用户学习数据（管理员） | Medium |
| `adminUpdateSystemWordBook` | ApiClient.ts:1277 | 更新系统单词本（管理员） | Medium |
| `adminBatchAddWordsToSystemWordBook` | ApiClient.ts:1301 | 批量添加单词到系统单词本 | Medium |

**说明**:
- 现有管理员页面直接调用其他 API 获取统计数据
- 这些 API 可用于构建更丰富的管理员工具

### 6. 实验/A/B 测试（2个）

| 方法名 | 位置 | 说明 | 优先级 |
|--------|------|------|--------|
| `getExperimentVariant` | ApiClient.ts:2761 | 获取用户的实验分组 | Low |
| `recordExperimentMetric` | ApiClient.ts:2774 | 记录实验指标 | Low |

**说明**:
- `ExperimentDashboard` 组件存在但未完全集成这些 API
- 后端支持 A/B 测试但前端缺少分组分配和指标追踪

### 7. 其他功能（5个）

| 方法名 | 位置 | 说明 | 优先级 |
|--------|------|------|--------|
| `batchCreateRecords` | ApiClient.ts:981 | 批量创建答题记录 | Low |
| `getTodayWords` | ApiClient.ts:1109 | 获取今日单词列表 | Medium |
| `getStudyProgress` | ApiClient.ts:1120 | 获取学习进度概览 | Medium |
| `getUserBadges` | ApiClient.ts:2043 | 获取用户徽章列表（轻量版） | Low |
| `getBadgeDetails` | ApiClient.ts:2078 | 获取徽章详情 | Low |

**说明**:
- `getTodayWords` 和 `getStudyProgress` 可用于构建学习日历或进度仪表板
- 徽章相关 API 可用于构建成就系统的详情视图

---

## ⚙️ 内部方法（保留）

| 方法名 | 位置 | 说明 |
|--------|------|------|
| `extractErrorMessage` | ApiClient.ts:593 | 内部错误处理助手，被 ApiClient 自身使用 |

**说明**: 此方法不是公共 API，而是 ApiClient 内部使用的工具函数，应保留。

---

## 📊 统计摘要

### 按类别分布

```
AMAS 增强功能:          5 个
单词本管理:            2 个
优化与因果分析:        10 个
单词掌握度分析:         1 个
管理员 API:            4 个
实验/A/B 测试:         2 个
其他功能:              5 个
已删除（已完成）:       1 个
内部方法（保留）:       1 个
----------------------------------------
总计:                 31 个 → 30个（当前）
```

### 优先级分布

- **High**: 2 个（单词本管理）
- **Medium**: 7 个（档案、掌握度、学习进度等）
- **Low**: 21 个（优化分析、实验、管理工具）
- **DELETE**: 1 个（已废弃方法）

---

## 🎯 建议的实施路线图

### 阶段 1: 立即清理（已完成 ✅）
- [x] 删除 `getAllRecords` 方法
- [x] 创建详细的未使用API文档（本文件）

### 阶段 2: 高优先级功能（建议时间：2-3周）
- [ ] 实现单词本编辑界面（`updateWordBook`）
- [ ] 实现批量导入功能（`batchCreateWords`）
- [ ] 创建单词详情模态框（`getWordMasteryDetail`）

### 阶段 3: 中优先级功能（可选）
- [ ] 构建学习日历视图（`getTodayWords`, `getStudyProgress`）
- [ ] 创建专门的生物钟和学习风格页面
- [ ] 增强管理员工具（单词本管理、批量操作）

### 阶段 4: 低优先级功能（长期规划）
- [ ] 构建贝叶斯优化器管理界面
- [ ] 实现因果分析仪表板
- [ ] 完善 A/B 测试集成

---

## 📝 维护指南

### 如何检查方法是否被使用

```bash
# 在项目根目录运行
cd /home/liji/danci/danci

# 搜索方法调用（排除 ApiClient.ts 本身）
rg "methodName" src/ --glob '!src/services/ApiClient.ts'

# 如果输出为空，则该方法未被使用
```

### 删除未使用方法的步骤

1. 确认方法确实未被使用（参考上面的搜索命令）
2. 检查方法是否有 JSDoc 注释说明其用途
3. 如果确认永久不需要，从 ApiClient.ts 中删除
4. 更新此文档，从列表中移除该方法
5. 提交时在 commit message 中说明删除原因

### 实现新 UI 时的步骤

1. 从此文档中选择要实现的方法
2. 阅读 ApiClient.ts 中的 JSDoc 了解 API 用法
3. 实现前端 UI 并调用该方法
4. 测试功能正常工作后，更新此文档，将方法标记为"已实现"
5. 如果方法被广泛使用，可从此文档中移除

---

## 🔄 最后更新

- **日期**: 2025-12-03
- **检查方式**: Codex 自动分析 + ripgrep 全局搜索
- **ApiClient 版本**: 当前 dev 分支
- **未使用方法数**: 30 个（已删除 getAllRecords）

---

## 相关文档

- [incomplete-features.md](incomplete-features.md) - 整体功能完成度报告
- [项目功能审查计划](./.claude/plans/sleepy-dreaming-widget.md) - 完整审查报告

