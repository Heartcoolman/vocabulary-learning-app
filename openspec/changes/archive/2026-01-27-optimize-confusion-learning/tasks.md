# Tasks: optimize-confusion-learning

## Phase 1: Database & Cache Infrastructure

### Task 1.1: Create confusion_pairs_cache migration

- [x] 新增 SQL migration 文件 `036_add_confusion_pairs_cache.sql`
- [x] 创建表结构：word1Id, word2Id, wordBookId, clusterId, distance, model
- [x] 创建索引：(clusterId, distance), (wordBookId, distance)
- [x] 验证：`sqlx migrate run` 成功

### Task 1.2: Implement cache DB operations

- [x] 新增 `src/db/operations/confusion_cache.rs`
- [x] 实现 `insert_confusion_pair`, `delete_by_word_id`, `find_by_cluster`, `find_by_wordbook`
- [x] 实现 `get_cluster_confusion_counts` 汇总各聚类混淆词对数
- [x] 验证：单元测试覆盖 CRUD

### Task 1.3: Implement ConfusionCacheWorker

- [x] 新增 `src/workers/confusion_cache.rs`
- [x] 实现增量更新逻辑（监听 embedding 变更，关联 cluster_id）
- [x] 实现批量初始化逻辑
- [x] 验证：embedding 新增/删除时缓存正确更新

---

## Phase 2: Backend API Changes

### Task 2.1: Add confusion-by-cluster API

- [x] 新增 `GET /api/semantic/confusion-by-cluster`
- [x] 返回各聚类 + 其内部混淆词对数量
- [x] 验证：返回按 confusionPairCount 降序排列

### Task 2.2: Modify confusion-pairs endpoint

- [x] 修改 `routes/semantic.rs` 的 `confusion_pairs` 函数
- [x] 支持 clusterId 参数（按主题查询）
- [x] 支持 limit 参数（用户指定数量）
- [x] 保持 wordBookId 兼容
- [x] 验证：响应时间 < 500ms

### Task 2.3: Add cache status endpoint

- [x] 新增 `GET /api/semantic/confusion-cache/status`
- [x] 返回缓存状态（各聚类缓存进度、最后更新时间）
- [x] 验证：前端可查询缓存状态

---

## Phase 3: Frontend - Theme-Based Display

### Task 3.1: Refactor ConfusionWordsPage to theme-based layout

- [x] 获取聚类列表 + 各聚类混淆词对数
- [x] 渲染可折叠的主题卡片列表
- [x] 点击主题展开显示该主题内的混淆词对
- [x] 验证：主题列表正确显示

### Task 3.2: Implement learning count selector

- [x] 在展开的主题区域添加数量选择器（滑块 + 输入框）
- [x] 范围限制：1 ~ 该主题总对数
- [x] 默认值：min(5, 总对数)
- [x] 验证：数量可调整，边界正确

### Task 3.3: Implement batch learning navigation

- [x] 扩展 `LearningSeedState` 增加 `themeLabel` 字段
- [x] "开始学习"按钮传递用户选定数量的 pairs + themeLabel
- [x] 验证：选择 N 对后正确导航到学习页

---

## Phase 4: Frontend - Batch Learning Mode

### Task 4.1: Add confusion batch queue hook

- [x] 新增 `hooks/useConfusionBatchLearning.ts`
- [x] 管理当前对索引、总对数、主题标签
- [x] 实现 skipPair, endSession 方法
- [x] 验证：队列状态正确管理

### Task 4.2: Modify LearningPage for batch mode

- [x] 识别 `seedSource === 'confusion-batch'`
- [x] 显示主题标签 + 对进度指示器（第 X/Y 对）
- [x] 添加"跳过这对""结束学习"按钮
- [x] 验证：批量学习流程完整

### Task 4.3: Add batch completion UI

- [x] 设计批量学习完成界面
- [x] 显示统计：完成对数、正确率、用时
- [x] 添加"继续选择"按钮返回易混淆词页
- [x] 验证：完成后 UI 正确显示

---

## Phase 5: Polish & Optimization

### Task 5.1: Add loading skeleton for theme list

- [x] 在 ConfusionWordsPage 添加骨架屏
- [x] 缓存未就绪时显示"正在生成中"提示
- [x] 验证：加载体验平滑

### Task 5.2: Comparison display enhancement (Optional)

- [ ] 实现并排对比 UI 组件
- [ ] 答题结果页显示两词释义对比
- [ ] 验证：对比信息清晰
- [x] **跳过**: 非核心功能，当前批量学习流程已足够清晰

### Task 5.3: Fallback for no clusters

- [x] 无聚类时降级显示全局混淆词列表
- [x] 保持原有的阈值选择器和词书筛选
- [x] 验证：无聚类场景可用

---

## Dependencies

- Task 2.1, 2.2 depend on 1.1, 1.2
- Task 3.1 depends on 2.1
- Task 3.2, 3.3 depend on 3.1
- Task 4.2 depends on 4.1
- Phase 3-4 can parallel with Phase 2 (mock API)

## Parallelizable

- 1.1, 1.2 可并行
- 3.1, 4.1 可并行（前端状态管理独立）
- Phase 3 和 Phase 4 整体可并行开发（共享类型定义后）
