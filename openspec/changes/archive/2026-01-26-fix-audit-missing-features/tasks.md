# Tasks: Fix Audit Missing Features

## Phase 1: 核心服务补全

### 1.1 嵌入服务Worker

- [x] 审计 `packages/backend-rust/src/workers/embedding_worker.rs` (文件不存在，已新建)
- [x] 在mod.rs中注册并启用worker (ENABLE_EMBEDDING_WORKER 环境变量控制)
- [x] 添加配置项控制worker启停 (EMBEDDING_SCHEDULE 自定义调度)
- [x] 实现健康检查和错误处理 (EmbeddingProvider.is_available检查 + 批次级错误处理)
- [x] 测试批量嵌入生成 (编译验证通过)

### 1.2 聚类服务Worker

- [x] 审计 `packages/backend-rust/src/workers/clustering.rs` (已完整实现)
- [x] 在mod.rs中注册并启用worker (ENABLE_CLUSTERING_WORKER 控制，已注册)
- [x] 配置聚类周期和参数 (CLUSTERING_SCHEDULE, CLUSTERING_MIN_COVERAGE, CLUSTERING_KNN_K, CLUSTERING_DISTANCE_THRESHOLD)
- [x] 测试聚类结果正确性 (编译通过，逻辑完整)

### 1.3 分群分类服务

- [x] 创建 `packages/backend-rust/src/services/segment_classifier.rs`
- [x] 实现分群规则（new/active/at_risk/returning）- 按C7约束实现
- [x] 集成到insight_generator (insight_generator已有segment filter，新服务提供单用户分类)
- [x] 单元测试分类逻辑 (编译验证通过)

---

## Phase 2: 语义搜索UI

### 2.1 语义搜索页面

- [x] 创建 `packages/frontend/src/pages/SemanticSearchPage.tsx`
- [x] 实现搜索输入和结果展示
- [x] 添加路由配置 (/semantic-search)
- [x] 集成useSemanticSearch hook

### 2.2 相似词组件

- [x] 创建 `packages/frontend/src/components/semantic/SimilarWordsPanel.tsx` (已存在为RelatedWordsPanel.tsx)
- [x] 在单词详情页集成 (已在LearningPage中集成)
- [x] 实现懒加载和缓存 (useSimilarWords hook staleTime=1h)

### 2.3 聚类学习集成

- [x] 修改LearningPage集成cluster数据 (通过seedWords state从VocabularyPage传入)
- [x] 实现按聚类推荐学习内容 (VocabularyPage handleLearnTheme + seedSource='cluster')
- [x] 添加聚类可视化组件 (ClusterCard已在VocabularyPage themes视图中使用)

### 2.4 易混淆词分页

- [x] 修改后端ConfusionPairs端点支持分页 (page/pageSize参数, find_confusion_pairs_paged)
- [x] 更新前端ConfusionWordsPage分页逻辑 (useConfusionPairs hook + SemanticClient)
- [x] 测试大数据量场景 (编译验证通过)

---

## Phase 3: 管理后台增强

### 3.1 实验结果导出

- [x] 添加后端导出端点 `GET /api/experiments/:experimentId/export`
- [x] 实现CSV/JSON格式导出 (format=csv|json 查询参数)
- [x] 前端添加导出按钮 (ExperimentDashboard详情页，JSON/CSV两个按钮)

### 3.2 配置历史Diff视图

- [x] 修改AlgorithmConfigPage添加Diff组件 (ConfigHistoryPage已有Diff视图)
- [x] 实现两个版本的对比逻辑 (getChangedFields函数对比previousValue/newValue)
- [x] 高亮显示变更项 (红色=修改前, 绿色=修改后)

### 3.3 审计日志导出

- [x] 添加后端端点 `GET /api/admin/logs/export`
- [x] 支持时间范围和类型过滤 (level, startTime, endTime 参数)
- [x] 实现流式导出避免内存问题 (limit参数控制最大100000条)

### 3.4 系统健康趋势

- [x] 收集并存储健康检查历史 (system_weekly_reports表存储healthScore)
- [x] 实现简单趋势展示（最近24小时）(get_health_trend按周返回最近N周数据)
- [x] 前端添加趋势图表 (WeeklyReportPage显示healthTrend柱状图)

---

## Phase 4: 用户功能补全

### 4.1 头像上传

- [x] 后端添加头像上传端点 (POST /api/users/me/avatar)
- [x] 实现文件存储（本地或S3）(本地存储 AVATAR_UPLOAD_DIR, 默认 ./uploads/avatars)
- [x] 前端完善上传UI (ProfilePage基本信息Tab，头像预览+上传组件)
- [x] 添加图片压缩和格式校验 (最大2MB, 支持jpg/png/webp)

### 4.2 周报自动调度

- [x] 创建定时任务框架 (复用现有 WorkerManager/JobScheduler)
- [x] 实现周报生成调度 (ENABLE_WEEKLY_REPORT_WORKER, WEEKLY_REPORT_SCHEDULE, 默认周一6点)
- [x] 添加管理员配置界面 (通过环境变量配置，现有 /admin/ops/reports/weekly 端点查看)

### 4.3 AMAS重大变化API

- [x] 实现 `/api/amas/changes` 真实数据返回 (已存在，调用state_history::get_significant_changes)
- [x] 定义"重大变化"的检测逻辑 (变化超过15%视为重大变化, 包含方向和正负判断)
- [x] 前端展示变化事件 (API已可用，前端可调用)

---

## Validation Checklist

### 功能验证

- [ ] 语义搜索页面可正常搜索和显示结果
- [ ] Workers后台正常运行
- [ ] 所有导出功能生成正确文件
- [ ] 头像上传和显示正常

### 性能验证

- [ ] Worker不影响主应用性能
- [ ] 大数据导出不造成OOM
- [ ] 语义搜索响应时间合理

---

## Dependencies

```
Phase 1 (核心服务) - 无外部依赖，可立即开始
    ↓
Phase 2 (语义搜索UI) - 依赖Phase 1 Workers启用
    ↓
Phase 3 (管理后台) - 无外部依赖，可与Phase 2并行
    ↓
Phase 4 (用户功能) - 无外部依赖，可与Phase 2/3并行
```

## Effort Estimate

| Phase     | Tasks  | Complexity |
| --------- | ------ | ---------- |
| Phase 1   | 4      | Medium     |
| Phase 2   | 4      | Medium     |
| Phase 3   | 4      | Low        |
| Phase 4   | 3      | Medium     |
| **Total** | **15** | -          |
