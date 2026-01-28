# Spec Delta: Placeholder Strategy

## ADDED Requirements

### Requirement: Planned Feature Response Format

"计划中"功能 **MUST** 返回统一格式响应。

#### Constraints

- **expectedVersion**: `"1.8.0"` (固定值)
- **HTTP状态码**: 200 (非错误状态)
- **访问日志**: 记录所有planned功能的访问，用于需求分析
- **日志字段**: `{ endpoint, user_id, timestamp, user_agent }`

#### Scenario: 调用计划中功能

- **Given** 某端点功能处于"计划中"状态
- **When** 客户端调用该端点
- **Then** 应返回HTTP 200
- **And** 响应体为:
  ```json
  {
    "success": true,
    "data": {
      "status": "planned",
      "message": "此功能正在开发中，预计后续版本支持",
      "expectedVersion": "1.8.0"
    }
  }
  ```
- **And** 应记录访问日志到 `planned_feature_access_logs` 表

#### Scenario: 前端展示计划中状态

- **Given** 后端返回planned状态
- **When** 前端渲染
- **Then** 应显示PlannedFeature组件
- **And** 显示友好提示和预计版本 v1.8.0

#### PBT Properties

- [INVARIANT] 所有planned端点始终返回HTTP 200且 `data.status === "planned"`
- [INVARIANT] `expectedVersion` 始终为有效语义版本字符串 "1.8.0"
- [INVARIANT] 响应幂等：相同请求返回相同数据结构

---

### Requirement: Real Data Calculation

数据分析功能 **SHALL** 返回基于真实数据的计算结果。

#### Constraints - 用户分群

- **分群维度**: 熟练度、学习节奏、活跃度 (3个维度)
- **分段数量**: 每个维度分为 3 个分段 (高/中/低)
- **熟练度分段**: 基于词汇掌握率 (>70%高, 30-70%中, <30%低)
- **学习节奏分段**: 基于每周学习天数 (≥5天高, 2-4天中, <2天低)
- **活跃度分段**: 基于最近7天学习次数 (≥7次高, 3-6次中, <3次低)
- **最小数据要求**: 用户至少有 3 天学习记录才纳入分群

#### Constraints - 留存率

- **活跃定义**: 用户完成至少 1 次单词学习即视为当日活跃
- **时间粒度**: 支持日(D1-D30)/周(W1-W12)/月(M1-M6)
- **Cohort窗口**: 默认以用户注册日为cohort起始日
- **时区**: 使用 UTC+8 (北京时间) 计算日期边界

#### Scenario: 用户分群分析

- **Given** 系统有用户学习数据
- **When** 请求分群分析 `GET /api/admin/analytics/segments`
- **Then** 应返回基于真实数据计算的分群
- **And** 每个分群包含用户数、平均指标
- **And** 响应结构:
  ```json
  {
    "dimensions": [
      { "name": "proficiency", "segments": [
        { "level": "high", "count": 120, "avgMastery": 0.85 },
        { "level": "medium", "count": 350, "avgMastery": 0.52 },
        { "level": "low", "count": 180, "avgMastery": 0.18 }
      ]},
      { "name": "rhythm", "segments": [...] },
      { "name": "activity", "segments": [...] }
    ]
  }
  ```

#### Scenario: 留存率计算

- **Given** 系统有用户活跃记录
- **When** 请求留存率 `GET /api/admin/analytics/retention?granularity=day`
- **Then** 应返回基于真实活跃数据的留存率
- **And** 支持日/周/月粒度
- **And** 留存率范围: 0.00 - 1.00

#### Scenario: 数据不足时的处理

- **Given** 数据量不足以进行有意义的分析 (用户数 < 10 或 cohort < 3天)
- **When** 请求分析
- **Then** 应返回空结果
- **And** 提示 `{ "insufficient_data": true, "message": "需要更多数据进行分析" }`

#### PBT Properties

- [INVARIANT] 分群用户数之和 = 总有效用户数 (无重复、无遗漏)
- [INVARIANT] 分群结果对输入顺序无关 (置换不变性)
- [INVARIANT] 留存率恒为 0 ≤ rate ≤ 1
- [INVARIANT] 空数据集返回 `insufficient_data: true`

---

### Requirement: Learning Suggestions Generation

学习建议 **MUST** 基于用户真实数据生成。

#### Constraints

- **输入因子**: AMAS状态(记忆强度/稳定性)、掌握度差距、学习连续性、疲劳度
- **排序逻辑**: 按影响用户学习效果的紧迫度排序
- **建议数量**: 返回 Top 3 最重要的建议
- **新用户阈值**: 学习记录 < 7 天视为新用户

#### Scenario: 生成学习建议

- **Given** 用户有学习历史 (≥7天记录)
- **When** 请求学习建议 `GET /api/amas/suggestions`
- **Then** 应分析用户学习模式
- **And** 返回个性化建议
- **And** 响应结构:
  ```json
  {
    "suggestions": [
      { "type": "review_weak", "priority": 1, "message": "复习薄弱词汇", "wordCount": 15 },
      { "type": "maintain_streak", "priority": 2, "message": "保持连续学习" },
      { "type": "expand_vocabulary", "priority": 3, "message": "学习新词汇" }
    ],
    "personalized": true
  }
  ```

#### Scenario: 新用户无建议

- **Given** 新用户学习记录 < 7 天
- **When** 请求学习建议
- **Then** 应返回通用入门建议
- **And** 标注 `{ "personalized": false, "message": "继续学习后将生成个性化建议" }`

#### PBT Properties

- [INVARIANT] 相同用户历史数据返回相同建议 (确定性)
- [INVARIANT] 新用户始终返回 `personalized: false`
- [INVARIANT] 建议按 priority 升序排列

---

### Requirement: System Settings Persistence

系统设置 **MUST** 正确持久化存储。

#### Constraints

- **版本保留数**: 最多保留 5 个历史版本
- **快照粒度**: 每次保存创建完整快照
- **并发控制**: 使用乐观锁 (version字段) 防止覆盖冲突
- **回滚权限**: 仅超级管理员可执行回滚
- **存储表**: `system_settings` (当前) + `system_settings_history` (历史)

#### Scenario: 保存系统设置

- **Given** 管理员修改系统设置
- **When** 点击保存
- **Then** 设置应持久化到 `system_settings` 表
- **And** 旧值移入 `system_settings_history`
- **And** 返回保存成功确认及新版本号

#### Scenario: 加载系统设置

- **Given** 系统有已保存的设置
- **When** 应用启动或页面加载
- **Then** 应从 `system_settings` 表加载设置
- **And** 应用这些设置

#### Scenario: 设置回滚

- **Given** 管理员误操作保存了错误设置
- **When** 请求回滚到上一版本 `POST /api/admin/settings/rollback`
- **Then** 应从 `system_settings_history` 恢复指定版本
- **And** 当前设置移入历史
- **And** 返回回滚确认

#### Scenario: 历史版本清理

- **Given** 历史版本数 > 5
- **When** 保存新设置
- **Then** 删除最旧的历史版本，保持总数 ≤ 5

#### PBT Properties

- [INVARIANT] Save→Load 往返一致: `load(save(S)) === S`
- [INVARIANT] 历史版本数 ≤ 5
- [INVARIANT] Rollback 恢复精确匹配历史版本
- [INVARIANT] 并发保存时乐观锁冲突返回 409 Conflict

---

## REMOVED Requirements

### Requirement: Mock Data Responses

系统 **MUST** 移除所有硬编码mock数据响应。

#### Scenario: 不再返回hardcoded数据

- **Given** 任何之前返回mock数据的端点
- **When** 调用该端点
- **Then** 应返回真实数据或planned状态
- **And** 不应返回固定的模拟值

#### PBT Properties

- [INVARIANT] 所有端点响应中不含hardcoded mock数据标记

---

### Requirement: Achievement System Removal

成就系统 **SHALL** 临时移除直到重新设计。

#### Constraints

- **URL处理**: 显示"功能升级中"页面 (非重定向)
- **数据保留**: 完整保留所有成就相关数据
- **入口移除**: 从导航和侧边栏完全移除入口

#### Scenario: 访问成就页面

- **Given** 用户尝试访问成就相关路由 `/achievements`, `/badges`
- **When** 路由解析
- **Then** 应显示"功能升级中"页面
- **And** 页面提示"该功能正在升级，敬请期待 v1.8.0"

#### Scenario: 成就数据保留

- **Given** 用户已有成就记录
- **When** 功能移除
- **Then** 数据库 `user_achievements`, `badges` 表数据保留
- **And** 功能重新上线后可恢复

#### PBT Properties

- [INVARIANT] 移除功能后相关数据表记录数不变
- [INVARIANT] 直接URL访问返回200 (升级页面) 而非404

---

### Requirement: Social Features Removal

社交功能 **SHALL** 移除"即将上线"入口。

#### Constraints

- **URL处理**: 显示"功能升级中"页面
- **数据保留**: 完整保留所有社交相关数据
- **入口移除**: 移除所有"coming soon"展示

#### Scenario: 移除社交入口

- **Given** 导航或页面中有社交功能入口
- **When** 功能移除
- **Then** 相关入口应完全移除
- **And** 不显示"coming soon"

#### Scenario: 访问社交页面URL

- **Given** 用户直接访问社交相关URL `/social`, `/friends`
- **When** 路由解析
- **Then** 应显示"功能升级中"页面

---

### Requirement: Personalized Recommendations Removal

个性化推荐功能 **SHALL** 移除独立入口。

#### Constraints

- **URL处理**: 显示"功能升级中"页面
- **数据保留**: 完整保留推荐相关数据
- **逻辑整合**: 将有价值的推荐逻辑合并到主学习流程

#### Scenario: 访问独立推荐页面

- **Given** 用户访问 `/recommendations`
- **When** 路由解析
- **Then** 应显示"功能升级中"页面

---

### Requirement: Learning Report Generation

学习报告 **MUST** 基于真实数据生成。

#### Constraints

- **报告类型**: 支持周报和月报
- **报告内容**: 学习时长、单词进度、准确率、连续天数
- **学习时长**: 统计周期内总学习时间 (分钟)
- **单词进度**: 新学/复习/已掌握单词数
- **准确率**: 答题正确率百分比
- **连续天数**: 当前连续学习天数

#### Scenario: 生成周报

- **Given** 用户有7天学习数据
- **When** 请求周报 `GET /api/reports/weekly`
- **Then** 应返回包含上述4项指标的报告
- **And** 数据范围为最近7天

#### Scenario: 数据不足

- **Given** 用户学习数据 < 7 天
- **When** 请求周报
- **Then** 返回可用天数的数据
- **And** 标注 `{ "partial": true, "availableDays": N }`

#### PBT Properties

- [INVARIANT] 报告生成幂等：相同时间窗口返回相同结果
- [INVARIANT] 时间桶互不重叠且覆盖完整周期

---

## Related Capabilities

- **Admin Dashboard** - 管理后台占位功能处理
- **User Features** - 用户端占位功能处理
- **Analytics** - 数据分析真实实现
