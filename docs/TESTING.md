# 测试指南 - 六大测试分类

本项目的测试被组织成六大部分，便于独立运行和维护。

## 📊 测试分类概览

| 分类 | 命令 | 测试数量 | 描述 |
|------|------|----------|------|
| **Part 1** | `pnpm test:1:backend-services` | ~150+ | Backend 服务层单元测试 |
| **Part 2** | `pnpm test:2:backend-amas` | ~260+ | Backend AMAS 智能算法模块测试 |
| **Part 3** | `pnpm test:3:backend-api` | ~200+ | Backend API 路由集成测试 |
| **Part 4** | `pnpm test:4:frontend-components` | ~400+ | Frontend 组件测试 |
| **Part 5** | `pnpm test:5:frontend-pages` | ~300+ | Frontend 页面测试 |
| **Part 6** | `pnpm test:6:e2e` | ~50+ | 端到端测试 |

---

## 🔵 Part 1: Backend Services 单元测试

**命令**: `pnpm test:1:backend-services`

**路径**: `packages/backend/tests/unit/services/`

**包含的测试**:
- `about.service.test.ts` - About 服务
- `admin.service.test.ts` - 管理员服务
- `algorithm-config.service.test.ts` - 算法配置服务
- `amas-config.service.test.ts` - AMAS 配置服务
- `amas.service.test.ts` - AMAS 主服务
- `answer-buffer.service.test.ts` - 答题缓冲服务
- `auth.service.test.ts` - 认证服务
- `badge.service.test.ts` - 徽章服务
- `cache.service.test.ts` - 缓存服务
- `cognitive-profiling.service.test.ts` - 认知画像服务
- `delayed-reward.service.test.ts` - 延迟奖励服务
- `difficulty-cache.service.test.ts` - 难度缓存服务
- `evaluation.service.test.ts` - 评估服务
- `experiment.service.test.ts` - 实验服务
- `explainability.service.test.ts` - 可解释性服务
- `habit-profile.service.test.ts` - 习惯画像服务
- `learning-objectives.service.test.ts` - 学习目标服务
- `llm-weekly-advisor.test.ts` - LLM 顾问服务
- `mastery-learning.service.test.ts` - 掌握学习服务
- `metrics.service.test.ts` - 指标服务
- `optimization.service.test.ts` - 优化服务
- `plan-generator.service.test.ts` - 计划生成服务
- `real-about.service.test.ts` - 真实 About 服务
- `record.service.test.ts` - 记录服务
- `redis-cache.service.test.ts` - Redis 缓存服务
- `state-history.service.test.ts` - 状态历史服务
- `study-config.service.test.ts` - 学习配置服务
- `time-recommend.service.test.ts` - 时间推荐服务
- `trend-analysis.service.test.ts` - 趋势分析服务
- `user.service.test.ts` - 用户服务
- `word-score.service.test.ts` - 单词评分服务
- `word-state.service.test.ts` - 单词状态服务
- `word.service.test.ts` - 单词服务
- `wordbook.service.test.ts` - 词书服务

---

## 🟢 Part 2: Backend AMAS 模块测试

**命令**: `pnpm test:2:backend-amas`

**路径**: `packages/backend/tests/unit/amas/`

**包含的子模块**:

### modeling/ - 认知建模
- `actr-memory.test.ts` - ACT-R 记忆模型
- `attention-monitor.test.ts` - 注意力监测
- `cognitive-profiler.test.ts` - 认知画像器
- `fatigue-estimator.test.ts` - 疲劳估计器
- `forgetting-curve.test.ts` - 遗忘曲线
- `motivation-tracker.test.ts` - 动机追踪器
- `trend-analyzer.test.ts` - 趋势分析器

### learning/ - 在线学习算法
- `coldstart.test.ts` - 冷启动策略
- `linucb.test.ts` - LinUCB 算法
- `linucb-async.test.ts` - 异步 LinUCB
- `thompson-sampling.test.ts` - 汤普森采样

### decision/ - 决策系统
- `ensemble.test.ts` - 集成决策

### engine/ - 引擎核心
- `engine-core.test.ts` - 引擎核心逻辑

### evaluation/ - 评估模块
- `causal-inference.test.ts` - 因果推断
- `delayed-reward-aggregator.test.ts` - 延迟奖励聚合

### monitoring/ - 监控模块
- `alert-engine.test.ts` - 告警引擎
- `metrics-collector.test.ts` - 指标收集器
- `monitoring-service.test.ts` - 监控服务

### optimization/ - 优化模块
- `bayesian-optimizer.test.ts` - 贝叶斯优化器
- `multi-objective-optimizer.test.ts` - 多目标优化器

### config/ - 配置模块
- `action-space.test.ts` - 动作空间配置
- `feature-flags.test.ts` - 特性标志
- `reward-profiles.test.ts` - 奖励配置
- `user-params.test.ts` - 用户参数

---

## 🟡 Part 3: Backend API 集成测试

**命令**: `pnpm test:3:backend-api`

**路径**: `packages/backend/tests/integration/api/`

**包含的测试** (31个路由):
- `about.routes.test.ts`
- `admin.routes.test.ts`
- `alerts.routes.test.ts`
- `algorithm-config.routes.test.ts`
- `amas-explain.routes.test.ts`
- `amas.routes.test.ts`
- `auth.routes.test.ts`
- `badge.routes.test.ts`
- `evaluation.routes.test.ts`
- `experiment.routes.test.ts`
- `habit-profile.routes.test.ts`
- `learning-objectives.routes.test.ts`
- `learning.routes.test.ts`
- `llm-advisor.routes.test.ts`
- `log-viewer.routes.test.ts`
- `logs.routes.test.ts`
- `optimization.routes.test.ts`
- `plan.routes.test.ts`
- `profile.routes.test.ts`
- `records.routes.test.ts`
- `state-history.routes.test.ts`
- `study-config.routes.test.ts`
- `time-recommend.routes.test.ts`
- `tracking.routes.test.ts`
- `trend-analysis.routes.test.ts`
- `user.routes.test.ts`
- `word-mastery.routes.test.ts`
- `word-score.routes.test.ts`
- `word-state.routes.test.ts`
- `word.routes.test.ts`
- `wordbook.routes.test.ts`

---

## 🟠 Part 4: Frontend 组件测试

**命令**: `pnpm test:4:frontend-components`

**路径**: `packages/frontend/src/components/`

**包含的组件目录**:

### 根目录组件
- `AmasStatus.test.tsx`
- `AmasSuggestion.test.tsx`
- `BadgeCelebration.test.tsx`
- `BatchImportModal.test.tsx`
- `DecisionTooltip.test.tsx`
- `FileUpload.test.tsx`
- `Icon.test.tsx`
- `LearningModeSelector.test.tsx`
- `LearningStyleCard.test.tsx`
- `LineChart.test.tsx`
- `MasteryProgress.test.tsx`
- `Navigation.test.tsx`
- `ProgressBarChart.test.tsx`
- `ProtectedRoute.test.tsx`
- `StatusModal.test.tsx`
- `SuggestionModal.test.tsx`
- `SyncIndicator.test.tsx`
- `TestOptions.test.tsx`
- `WordCard.test.tsx`

### admin/
- `AMASDecisionsTab.test.tsx`

### dashboard/
- `DailyMissionCard.test.tsx`
- `ProgressOverviewCard.test.tsx`

### explainability/
- `CounterfactualPanel.test.tsx`
- `DecisionFactors.test.tsx`
- `ExplainabilityModal.test.tsx`
- `LearningCurveChart.test.tsx`
- `WeightRadarChart.test.tsx`

### profile/
- `ChronotypeCard.test.tsx`
- `HabitHeatmap.test.tsx`

### progress/
- `GoalTracker.test.tsx`
- `MasteryDistributionChart.test.tsx`
- `MilestoneCard.test.tsx`

### ui/
- `Modal.test.tsx`
- `Toast.test.tsx`

### word-mastery/
- `MasteryStatsCard.test.tsx`
- `MasteryWordItem.test.tsx`
- `MemoryTraceChart.test.tsx`
- `WordMasteryDetailModal.test.tsx`

---

## 🔴 Part 5: Frontend 页面测试

**命令**: `pnpm test:5:frontend-pages`

**路径**: `packages/frontend/src/pages/`

**包含的页面**:

### 根目录页面
- `AchievementPage.test.tsx`
- `BadgeGalleryPage.test.tsx`
- `BatchImportPage.test.tsx`
- `HabitProfilePage.test.tsx`
- `HistoryPage.test.tsx`
- `LearningObjectivesPage.test.tsx`
- `LearningPage.test.tsx`
- `LearningProfilePage.test.tsx`
- `LearningTimePage.test.tsx`
- `LoginPage.test.tsx`
- `PlanPage.test.tsx`
- `ProfilePage.test.tsx`
- `RegisterPage.test.tsx`
- `StatisticsPage.test.tsx`
- `StudyProgressPage.test.tsx`
- `StudySettingsPage.test.tsx`
- `TodayWordsPage.test.tsx`
- `TrendReportPage.test.tsx`
- `VocabularyPage.test.tsx`
- `WordBookDetailPage.test.tsx`
- `WordListPage.test.tsx`
- `WordMasteryPage.test.tsx`

### about/
- `AboutHomePage.test.tsx`
- `AboutLayout.test.tsx`
- `DashboardPage.test.tsx`
- `SimulationPage.test.tsx`
- `StatsPage.test.tsx`
- `SystemStatusPage.test.tsx`

### admin/
- `AdminDashboard.test.tsx`
- `AdminLayout.test.tsx`
- `AdminUsers.test.tsx`
- `AdminWordBooks.test.tsx`
- `AlgorithmConfigPage.test.tsx`
- `AMASExplainabilityPage.test.tsx`
- `CausalInferencePage.test.tsx`
- `ConfigHistoryPage.test.tsx`
- `ExperimentDashboard.test.tsx`
- `LLMAdvisorPage.test.tsx`
- `LogAlertsPage.test.tsx`
- `LogViewerPage.test.tsx`
- `OptimizationDashboard.test.tsx`
- `UserDetailPage.test.tsx`
- `UserManagementPage.test.tsx`
- `WordDetailPage.test.tsx`

---

## 🟣 Part 6: E2E 端到端测试

**命令**: `pnpm test:6:e2e`

**路径**: `tests/e2e/`

**包含的测试**:
- `admin.spec.ts` - 管理员功能
- `amas-decision.spec.ts` - AMAS 决策流程
- `auth.spec.ts` - 认证流程
- `dashboard.spec.ts` - 仪表盘
- `explainability.spec.ts` - 可解释性功能
- `learning-flow.spec.ts` - 学习流程
- `learning-session.spec.ts` - 学习会话
- `navigation.spec.ts` - 导航
- `profile.spec.ts` - 用户资料
- `wordbook.spec.ts` - 词书管理

---

## 🚀 常用命令

```bash
# 运行所有测试
pnpm test

# 运行六大测试分类
pnpm test:1:backend-services    # Part 1
pnpm test:2:backend-amas        # Part 2
pnpm test:3:backend-api         # Part 3
pnpm test:4:frontend-components # Part 4
pnpm test:5:frontend-pages      # Part 5
pnpm test:6:e2e                 # Part 6

# 按包运行测试
pnpm test:backend               # 所有 backend 测试
pnpm test:frontend              # 所有 frontend 测试
pnpm test:native                # Native 模块测试
pnpm test:shared                # Shared 包测试

# 运行测试覆盖率
pnpm test:coverage

# 监听模式
pnpm --filter @danci/backend test:watch
pnpm --filter @danci/frontend test:watch
```

---

## 📁 测试文件结构

```
danci/
├── packages/
│   ├── backend/
│   │   └── tests/
│   │       ├── unit/
│   │       │   ├── services/      # Part 1
│   │       │   ├── amas/          # Part 2
│   │       │   └── middleware/    # (包含在 Part 1)
│   │       ├── integration/
│   │       │   └── api/           # Part 3
│   │       └── performance/       # 性能测试
│   │
│   ├── frontend/
│   │   └── src/
│   │       ├── components/
│   │       │   └── __tests__/     # Part 4
│   │       ├── pages/
│   │       │   └── __tests__/     # Part 5
│   │       ├── services/
│   │       │   └── __tests__/     # (包含在 Part 4)
│   │       ├── hooks/
│   │       │   └── __tests__/     # (包含在 Part 4)
│   │       └── contexts/
│   │           └── __tests__/     # (包含在 Part 4)
│   │
│   ├── native/
│   │   └── __test__/              # Native 模块测试
│   │
│   └── shared/
│       └── src/__tests__/         # Shared 包测试
│
└── tests/
    └── e2e/                       # Part 6
```

---

## 🔧 CI/CD 配置建议

在 CI/CD 中可以并行运行六大测试分类：

```yaml
jobs:
  test-part1:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test:1:backend-services

  test-part2:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test:2:backend-amas

  test-part3:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test:3:backend-api

  test-part4:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test:4:frontend-components

  test-part5:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test:5:frontend-pages

  test-part6:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test:6:e2e
```
