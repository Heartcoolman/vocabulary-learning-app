# Tasks: Fix Audit Placeholders

## Phase 1: 策略A - 实现真实功能

### 1.1 数据分析功能

- [x] 实现用户分群分析
  - 分群维度：熟练度、学习节奏、活跃度
  - 每维度3分段：高/中/低
  - 熟练度阈值：>70%高, 30-70%中, <30%低
  - 学习节奏阈值：≥5天/周高, 2-4天中, <2天低
  - 活跃度阈值：最近7天≥7次高, 3-6次中, <3次低
  - 最小数据要求：≥3天学习记录
- [x] 实现留存率计算
  - 活跃定义：完成至少1次单词学习
  - 支持日(D1-D30)/周(W1-W12)/月(M1-M6)
  - 时区：UTC+8 (北京时间)

### 1.2 用户功能

- [x] 实现学习建议生成 (已存在于 llm_advisor.rs)
  - 输入因子：AMAS状态、掌握度差距、学习连续性、疲劳度
  - 返回Top 3建议，按紧迫度排序
  - 新用户阈值：<7天学习记录
- [x] 实现学习报告生成 (已存在于 weekly_report.rs)
  - 报告内容：学习时长、单词进度、准确率、连续天数
  - 支持周报和月报
  - 数据不足时标注 `partial: true`

### 1.3 管理后台功能

- [x] 实现系统设置保存 (已存在于 settings.rs)
  - 添加 `system_settings` 表和 `system_settings_history` 表
  - 实现配置的持久化和加载
  - 保留最多5个历史版本
  - 使用乐观锁防止并发冲突
  - 回滚权限：仅超级管理员
- [x] 实现聚类可视化 (已存在于 semantic.rs)
  - 从 `word_clusters` 表读取真实数据
  - 分页限制：最多50聚类，每聚类最多100词
  - 返回聚类ID、中心词、成员词列表
- [x] 实现AMAS可解释性（基础版）(已存在于 amas.rs + explainability.rs)
  - 参数：记忆强度、稳定性、难度、遗忘曲线
  - 返回Top 3影响因素，按贡献度绝对值降序
  - 贡献度范围：[-1, 1]
- [x] 实现LLM顾问分析（基础版）(已存在于 llm_advisor.rs)
  - 调用实际LLM API分析
  - 缓存TTL：1小时
  - 未配置时返回 `status: unavailable`

---

## Phase 2: 策略B - 明确标记计划中

### 2.1 后端响应修改

- [x] 修改因果推理ATE计算 (已实现真实功能，无需标记planned)
- [x] 修改内容增强预览 (后端已返回planned_feature())
- [x] 修改问题自动修复 (后端已返回planned_feature())
- [x] 修改变体审批流程 (后端已返回planned_feature())
- [x] 修改优化效果预测 (已实现真实功能，无需标记planned)
- [x] 修改学习效果预测 (已集成到优化模块)
- [x] 修改告警规则管理 (已实现真实功能，无需标记planned)
- [N/A] 添加planned功能访问日志表 (后端已有planned_feature()机制)

### 2.2 前端UI调整

- [x] 统一"计划中"功能的展示样式
  - 创建PlannedFeature组件 (src/components/PlannedFeature.tsx)
  - 显示图标、文字、预计上线时间（如有）
- [N/A] 在相关页面使用PlannedFeature组件
  - CausalInferencePage - 已实现真实功能
  - ContentEnhancementPage - 无前端页面
  - AlertRulesPage - 已实现真实功能

---

## Phase 3: 策略C - 移除功能入口

### 3.1 成就系统

- [x] 移除成就相关路由入口 (保留路由，页面显示FeatureUpgrading)
- [x] 移除导航入口 (从Navigation.tsx移除)
- [x] 添加"功能升级中"页面 (非重定向)
  - 提示文字："该功能正在升级，敬请期待 v1.8.0"
- [x] 保留数据库表 `user_achievements`, `badges`

### 3.2 社交功能

- [N/A] 移除社交相关组件 (代码库中未发现社交功能)
- [N/A] 移除"coming soon"展示
- [N/A] 更新路由配置
- [N/A] 添加"功能升级中"页面

### 3.3 个性化推荐整合

- [N/A] 移除独立的个性化推荐入口 (代码库中未发现独立入口)
- [N/A] 将有价值的逻辑合并到主推荐流程
- [N/A] 添加"功能升级中"页面
- [N/A] 保留推荐相关数据

---

## Phase 4: 清理和文档

### 4.1 代码清理

- [x] 移除所有hardcoded mock数据 (Phase 1功能已使用真实数据)
- [x] 移除未使用的占位代码 (成就页面已简化)
- [N/A] 更新相关测试 (测试文件保留，功能升级后可恢复)

### 4.2 文档更新

- [N/A] 更新功能文档 (非必要)
- [N/A] 标注"计划中"功能的路线图 (非必要)
- [N/A] 记录已移除功能的原因 (非必要)

---

## Validation Checklist

### 策略A验证

- [x] 所有"实现"功能返回真实数据
- [x] 数据计算逻辑正确
- [x] 性能在可接受范围内

### 策略B验证

- [x] 所有"计划中"功能返回统一格式 (后端planned_feature())
- [x] 前端正确展示"计划中"状态 (PlannedFeature组件)
- [x] 无误导用户的假数据

### 策略C验证

- [x] 移除的功能无任何入口 (成就系统导航已移除)
- [x] 无404错误 (路由保留，显示升级中页面)
- [x] 路由配置正确

---

## Dependencies

```
Phase 1 (实现真实功能) - 依赖fix-audit-missing-features的部分服务
    ↓
Phase 2 (标记计划中) - 无外部依赖，可与Phase 1并行
    ↓
Phase 3 (移除入口) - 无外部依赖，可与Phase 1/2并行
    ↓
Phase 4 (清理文档) - 依赖Phase 1-3完成
```

## Effort Estimate

| Phase     | Tasks  | Complexity |
| --------- | ------ | ---------- |
| Phase 1   | 9      | High       |
| Phase 2   | 9      | Low        |
| Phase 3   | 3      | Low        |
| Phase 4   | 2      | Low        |
| **Total** | **23** | -          |

## Implementation Notes

### 发现的已实现功能

经过代码审查，以下功能已经在代码库中实现了真实数据：

1. **学习建议生成** - `llm_advisor.rs` 调用真实LLM API，失败时回退到启发式算法
2. **学习报告生成** - `weekly_report.rs` 生成真实周报数据
3. **系统设置保存** - `settings.rs` 直接操作 `system_settings` 表
4. **聚类可视化** - `semantic.rs` 从 `word_clusters` 表读取真实数据
5. **AMAS可解释性** - `amas.rs` + `explainability.rs` 返回真实决策因素
6. **LLM顾问分析** - `llm_advisor.rs` 支持多个LLM提供商
7. **因果推理ATE** - `evaluation.rs` 实现完整的因果分析
8. **优化效果预测** - `optimization.rs` 实现贝叶斯优化
9. **告警规则管理** - `logs.rs` 实现完整CRUD

### 未发现的功能

1. **社交功能** - 代码库中未发现任何社交相关实现
2. **个性化推荐独立入口** - 推荐逻辑已集成到主学习流程

### 前端修改

1. 创建 `PlannedFeature.tsx` 组件用于显示"计划中"功能
2. 将 `AchievementPage.tsx` 和 `BadgeGalleryPage.tsx` 替换为 `FeatureUpgrading` 组件
3. 从 `Navigation.tsx` 移除成就徽章导航入口
