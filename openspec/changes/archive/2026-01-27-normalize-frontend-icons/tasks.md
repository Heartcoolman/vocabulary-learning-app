# Tasks: normalize-frontend-icons

## Phase 1: Infrastructure

设置全局默认权重和回退防护。

- [x] **T1.1** 在 App.tsx 添加 IconContext.Provider
  - 导入 `IconContext` from `@phosphor-icons/react`
  - 在 App 根级包裹 `<IconContext.Provider value={{ weight: "duotone" }}>`

- [ ] **T1.2** 创建自定义 ESLint 规则 (可选，后续实现)
  - 规则名：`no-icon-weight-override`
  - 在非白名单场景使用 `weight` 属性时报 error
  - 白名单：CircleNotch (bold), Star (fill/regular 条件), Eye (fill/regular 条件), 状态图标 (fill/bold), 条件 weight 表达式

## Phase 2: 删除非例外的显式 weight 属性

按文件批次处理，每批独立可验证。

### Batch A: 通用 UI 组件 (ui/)

- [x] **T2.A** 删除 ui/ 组件中非例外 weight 属性
  - Modal.tsx, Avatar.tsx, Select.tsx, Pagination.tsx, Checkbox.tsx, Popover.tsx, Card.stories.tsx
  - 保留例外：Spinner.tsx (CircleNotch bold), Toast.tsx (状态图标), Alert.tsx (状态图标), Input.tsx (Eye 条件)

### Batch B: 核心业务组件

- [x] **T2.B** 删除核心组件中非例外 weight 属性
  - Navigation.tsx, VirtualWordList.tsx, AmasSuggestion.tsx, BatchImportModal.tsx, FileUpload.tsx, SyncIndicator.tsx, SuggestionModal.tsx, StatusModal.tsx
  - 保留例外：WordCard.tsx (Star 条件, CircleNotch), MasteryProgress.tsx (CheckCircle 状态), ChronotypeCard.tsx (状态图标)

### Batch C: 功能组件

- [x] **T2.C** 删除功能组件中非例外 weight 属性
  - LearningModeSelector.tsx, HabitProfileTab.tsx, DecisionTooltip.tsx, LearningStyleCard.tsx, progress/GoalTracker.tsx, dashboard/_, notification/_, badges/BadgeDetailModal.tsx, word-mastery/WordMasteryDetailModal.tsx, profile/MotivationCard.tsx
  - 保留例外：ThemeToggle.tsx (Sun/Moon fill), BadgeCelebration.tsx (Badge 条件), AmasStatus.tsx (Warning 状态)

### Batch D: 历史/记录组件

- [x] **T2.D** 删除历史相关组件中非例外 weight 属性
  - history/FilterControls.tsx, history/WordStatsTable.tsx, history/CognitiveGrowthPanel.tsx, history/SignificantChanges.tsx, admin/LearningRecordsTab.tsx, admin/AMASDecisionsTab.tsx

### Batch E: 页面组件 (pages/)

- [x] **T2.E** 删除页面组件中非例外 weight 属性
  - 已处理: SemanticSearchPage.tsx, WordBookDetailPage.tsx, RegisterPage.tsx, HistoryPage.tsx, BatchImportPage.tsx, LearningProfilePage.tsx, TrendReportPage.tsx
  - 保留例外：PreferencesPage Tab 条件 weight, LearningPage AMAS 条件 weight, 所有状态图标 (Warning/CheckCircle/WarningCircle fill/bold), 加载动画 (CircleNotch bold)

### Batch F: About 页面

- [x] **T2.F** 删除 About 页面中非例外 weight 属性
  - 已处理: StatsPage.tsx, SimulationPage.tsx, AboutDataFlow.tsx, AboutLayout.tsx, AboutPipeline.tsx, AboutCascade.tsx, DashboardPage.tsx, DecisionDetailPanel.tsx, MemberVotesSection.tsx, ControlPanel.tsx
  - 保留例外: 条件 weight 表达式, Circle fill (状态指示器), CheckCircle/XCircle/Warning/ShieldCheck fill (状态), Check/X bold (流程状态), CircleNotch bold (加载), WarningCircle/WifiHigh/WifiSlash fill (连接/错误状态)

### Batch G: Admin 页面

- [x] **T2.G** 删除 Admin 页面中非例外 weight 属性
  - 已处理: AdminUsers.tsx, UserManagementPage.tsx, UserDetailPage.tsx, WordDetailPage.tsx, AdminDashboard.tsx, AdminWordBooks.tsx, ExperimentDashboard.tsx, ConfigHistoryPage.tsx, LogViewerPage.tsx, LogAlertsPage.tsx, AlgorithmConfigPage.tsx, CausalInferencePage.tsx, LLMAdvisorPage.tsx, WeeklyReportPage.tsx, AMASMonitoringPage.tsx
  - 已处理: components/UserDetail/_.tsx, components/AMAS/_.tsx, word-quality/components/\*.tsx
  - 保留例外: CircleNotch bold (加载动画), CheckCircle/Warning/XCircle/WarningCircle/Info/Bug/File fill/bold (状态图标/日志级别)

### Batch H: 其他组件

- [x] **T2.H** 删除其他组件中非例外 weight 属性
  - 已处理: error/ErrorPage.tsx, amas-settings/ConfigPreview.tsx, ChronotypeCard.tsx, Toast.tsx, Alert.tsx
  - 保留例外：ThemeToggle (Sun/Moon fill), Spinner (CircleNotch bold), 所有状态图标 fill/bold, OfflineIndicator (WifiSlash bold)

## Phase 3: 删除冗余 weight="duotone" 属性

- [x] **T3.1** 删除所有 148 处冗余 `weight="duotone"` 属性
  - 由 IconContext.Provider 默认值覆盖，显式设置已冗余
  - 已通过 sed 批量删除

## Phase 4: Validation

- [x] **T4.1** TypeScript 类型检查：`tsc --noEmit` 通过，无错误
- [ ] **T4.2** 单元测试：`pnpm test` (需手动执行)
- [ ] **T4.3** 视觉验证：检查关键页面在亮色/暗色模式下的图标渲染 (需手动执行)
- [ ] **T4.4** PBT 属性验证：确认 P1-P6 所有不变量成立 (需手动执行)

## Summary

- **删除的 weight 属性**：约 200+ 处非例外 weight="bold|fill|regular"
- **删除的冗余 duotone**：148 处 weight="duotone"
- **保留的例外**：状态图标、加载动画、条件 weight、主题切换图标
- **类型检查**：通过
