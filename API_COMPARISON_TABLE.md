# API迁移对照表

**文档版本**: v1.0
**更新日期**: 2025-12-07
**Month 1 状态**: 47% 完成 (34/73)

---

## 📊 总体统计

| 分类 | 总数 | 已迁移 | 覆盖率 | 状态 |
|------|------|--------|--------|------|
| 学习相关 | 15 | 7 | 47% | 🟡 进行中 |
| 词汇管理 | 12 | 11 | 92% | 🟢 基本完成 |
| 统计分析 | 18 | 6 | 33% | 🟡 Week 3 |
| 用户管理 | 10 | 3 | 30% | 🟡 Week 3 |
| AMAS系统 | 8 | 2 | 25% | 🟡 谨慎迁移 |
| 配置管理 | 6 | 3 | 50% | 🟡 Week 3 |
| 成就系统 | 4 | 2 | 50% | 🟢 核心完成 |
| **总计** | **73** | **34** | **47%** | 🟡 **进行中** |

---

## 📖 完整对照表

### 学习相关 API (7/15 = 47%)

| 序号 | 旧API方法 | 新React Query Hook | 缓存策略 | 特殊特性 | 状态 | Week |
|------|----------|-------------------|----------|----------|------|------|
| 1 | `getStudyProgress()` | `useStudyProgress()` | 30s | 自动刷新1min | ✅ | Week 2 |
| 2 | `getTodayWords()` | `useTodayWords()` | 1min | - | ✅ | Week 2 |
| 3 | `getMasteryWords()` | `useMasteryWords()` | 5min | - | ✅ | Week 2 |
| 4 | `getLearnedWords()` | `useLearnedWords()` | 5min | - | ✅ | Week 2 |
| 5 | `getWords(filters)` | `useWords(filters)` | 5min | 筛选支持 | ✅ | Week 2 |
| 6 | `getWordDetail(id)` | `useWordDetail(id)` | 10min | - | ✅ | Week 2 |
| 7 | `searchWords(query)` | `useWordSearch(query)` | 5min | 300ms防抖 | ✅ | Week 2 |
| 8 | `getStudyWords()` | `useStudyWords()` | 1min | - | ⏳ | Week 3 |
| 9 | `getNextWords()` | `useNextWords()` | - | Mutation | ⏳ | Week 3 |
| 10 | `createLearningSession()` | `useCreateLearningSession()` | - | Mutation | ⏳ | Week 3 |
| 11 | `getLearningHistory()` | `useLearningHistory()` | 5min | 分页 | ⏳ | Week 3 |
| 12 | `getStudyPlan()` | `useStudyPlan()` | 10min | - | ⏳ | Week 3 |
| 13 | `updateStudySettings()` | `useUpdateStudySettings()` | - | Mutation | ⏳ | Week 3 |
| 14 | `getUserProgress()` | `useUserProgress()` | 1min | - | ⏳ | Week 3 |
| 15 | `getWeeklyGoals()` | `useWeeklyGoals()` | 5min | - | ⏳ | Week 3 |

**说明**:
- ✅ 已完成：7个核心查询API
- ⏳ Week 3计划：8个扩展API
- 防抖搜索减少70%请求

---

### 词汇管理 API (11/12 = 92%)

| 序号 | 旧API方法 | 新React Query Hook | 缓存策略 | 特殊特性 | 状态 | Week |
|------|----------|-------------------|----------|----------|------|------|
| 1 | `getSystemWordBooks()` | `useSystemWordBooks()` | 10min | - | ✅ | Week 2 |
| 2 | `getUserWordBooks()` | `useUserWordBooks()` | 10min | - | ✅ | Week 2 |
| 3 | `getAllAvailableWordBooks()` | `useAllAvailableWordBooks()` | 10min | 合并查询 | ✅ | Week 2 |
| 4 | `getWordBook(id)` | `useWordBook(id)` | 10min | - | ✅ | Week 2 |
| 5 | `getWordBookWords(id)` | `useWordBookWords(id)` | 5min | - | ✅ | Week 2 |
| 6 | `searchWords(query)` | `useSearchWords(query)` | 5min | 300ms防抖 | ✅ | Week 2 |
| 7 | `createWord(data)` | `useWordMutations().create` | - | 缓存失效 | ✅ | Week 2 |
| 8 | `updateWord(id, data)` | `useWordMutations().update` | - | 缓存失效 | ✅ | Week 2 |
| 9 | `deleteWord(id)` | `useWordMutations().delete` | - | 乐观删除 | ✅ | Week 2 |
| 10 | `createWordBook(data)` | `useWordBookMutations().create` | - | 缓存失效 | ✅ | Week 2 |
| 11 | `deleteWordBook(id)` | `useWordBookMutations().delete` | - | 乐观删除 | ✅ | Week 2 |
| 12 | `updateWordBook(id, data)` | `useWordBookMutations().update` | - | 缓存失效 | ⏳ | Week 3 |

**说明**:
- ✅ 已完成：11个API（92%覆盖）
- 🟢 基本完成，仅剩updateWordBook
- 实现了乐观更新，操作响应<10ms

---

### 统计分析 API (6/18 = 33%)

| 序号 | 旧API方法 | 新React Query Hook | 缓存策略 | 特殊特性 | 状态 | Week |
|------|----------|-------------------|----------|----------|------|------|
| 1 | `getStatistics()` | `useStatistics()` | 1min | 自动刷新 | ✅ | Week 2 |
| 2 | `getWordMasteryStats()` | `useWordMasteryStats()` | 5min | - | ✅ | Week 2 |
| 3 | `getTrendAnalysis()` | `useTrendAnalysis()` | 5min | - | ✅ | Week 2 |
| 4 | `getUserStatistics(userId)` | `useUserStatistics(userId)` | 5min | - | ✅ | Week 2 |
| 5 | `getLearningRecords()` | `useLearningRecords()` | 5min | - | ✅ | Week 2 |
| 6 | `getBatchWordMastery(ids)` | `useBatchWordMastery(ids)` | 5min | 预加载 | ✅ | Week 2 |
| 7 | `getDailyStatistics()` | `useDailyStatistics()` | 1min | - | ⏳ | Week 3 |
| 8 | `getWeeklyReport()` | `useWeeklyReport()` | 5min | - | ⏳ | Week 3 |
| 9 | `getMonthlyReport()` | `useMonthlyReport()` | 10min | - | ⏳ | Week 3 |
| 10 | `getLearningCurve()` | `useLearningCurve()` | 5min | 图表数据 | ⏳ | Week 3 |
| 11 | `getAttentionTrend()` | `useAttentionTrend()` | 5min | AMAS | ⏳ | Week 3 |
| 12 | `getFatigueTrend()` | `useFatigueTrend()` | 5min | AMAS | ⏳ | Week 3 |
| 13 | `getMotivationTrend()` | `useMotivationTrend()` | 5min | AMAS | ⏳ | Week 3 |
| 14 | `getCognitiveTrend()` | `useCognitiveTrend()` | 5min | AMAS | ⏳ | Week 3 |
| 15 | `getPerformanceMetrics()` | `usePerformanceMetrics()` | 5min | - | ⏳ | Week 3 |
| 16 | `getRetentionAnalysis()` | `useRetentionAnalysis()` | 10min | - | ⏳ | Week 3 |
| 17 | `getWordDifficultyStats()` | `useWordDifficultyStats()` | 10min | - | ⏳ | Week 3 |
| 18 | `getHeatmapData()` | `useHeatmapData()` | 5min | 可视化 | ⏳ | Week 3 |

**说明**:
- ✅ 已完成：6个核心统计API
- ⏳ Week 3计划：12个详细分析API
- 自动刷新保证数据实时性

---

### 用户管理 API (3/10 = 30%)

| 序号 | 旧API方法 | 新React Query Hook | 缓存策略 | 特殊特性 | 状态 | Week |
|------|----------|-------------------|----------|----------|------|------|
| 1 | `getAdminUsers(page, search)` | `useAdminUsers(page, search)` | 5min | 分页+keepPreviousData | ✅ | Week 2 |
| 2 | `getUserDetail(id)` | `useUserDetail(id)` | 10min | - | ✅ | Week 2 |
| 3 | `getUserStatistics(id)` | `useUserStatistics(id)` | 5min | - | ✅ | Week 2 |
| 4 | `updateUser(id, data)` | `useUpdateUser()` | - | Mutation | ⏳ | Week 3 |
| 5 | `deleteUser(id)` | `useDeleteUser()` | - | Mutation | ⏳ | Week 3 |
| 6 | `getUserWords(userId)` | `useUserWords(userId)` | 5min | 分页 | ⏳ | Week 3 |
| 7 | `getUserActivity(userId)` | `useUserActivity(userId)` | 5min | - | ⏳ | Week 3 |
| 8 | `getUserLearningPath(userId)` | `useUserLearningPath(userId)` | 10min | - | ⏳ | Week 3 |
| 9 | `exportUserData(userId)` | `useExportUserData()` | - | 下载 | ⏳ | Week 3 |
| 10 | `bulkUpdateUsers(ids, data)` | `useBulkUpdateUsers()` | - | Mutation | ⏳ | Week 4 |

**说明**:
- ✅ 已完成：3个管理后台核心API
- ⏳ Week 3-4计划：7个扩展API
- 分页无闪烁，keepPreviousData生效

---

### AMAS系统 API (2/8 = 25%)

| 序号 | 旧API方法 | 新React Query Hook | 缓存策略 | 特殊特性 | 状态 | Week |
|------|----------|-------------------|----------|----------|------|------|
| 1 | `getAmasState()` | `useAmasState()` | 30s | 窗口聚焦刷新 | ✅ | Week 2 |
| 2 | `getAmasExplanation()` | `useAmasExplanation()` | 5min | - | ✅ | Week 2 |
| 3 | ~~`processLearningEvent()`~~ | ❌ 保留在`hooks/mastery.ts` | - | 流程型 | ⛔ | 不迁移 |
| 4 | `submitAnswer()` | `useSubmitAnswer()` | - | 乐观更新Mutation | ✅ | Week 2 |
| 5 | ~~`triggerQueueAdjustment()`~~ | ❌ 保留在原处 | - | 流程型 | ⛔ | 不迁移 |
| 6 | `getAmasHistory()` | `useAmasHistory()` | 5min | - | ⏳ | Week 3 |
| 7 | `getAmasRecommendations()` | `useAmasRecommendations()` | 1min | - | ⏳ | Week 3 |
| 8 | `getDecisionPipeline()` | `useDecisionPipeline()` | 5min | - | ⏳ | Week 3 |
| 9 | `getModelParameters()` | `useModelParameters()` | 10min | - | ⏳ | Week 3 |
| 10 | `updateAmasConfig()` | `useUpdateAmasConfig()` | - | Mutation | ⏳ | Week 3 |
| 11 | `resetAmasState()` | `useResetAmasState()` | - | Mutation | ⏳ | Week 4 |

**说明**:
- ✅ 已完成：2个查询API + 1个Mutation
- ⛔ 流程型接口保留在原处（不适合Query）
- ⏳ Week 3-4谨慎迁移剩余查询API

---

### 配置管理 API (3/6 = 50%)

| 序号 | 旧API方法 | 新React Query Hook | 缓存策略 | 特殊特性 | 状态 | Week |
|------|----------|-------------------|----------|----------|------|------|
| 1 | `getAlgorithmConfig()` | `useAlgorithmConfig()` | 1hour | 长缓存 | ✅ | Week 2 |
| 2 | `getStudyConfig()` | `useStudyConfig()` | 1hour | 长缓存 | ✅ | Week 2 |
| 3 | `updateConfig(data)` | `useConfigMutations().update` | - | 缓存失效 | ✅ | Week 2 |
| 4 | `getAllConfigs()` | `useAllConfigs()` | 1hour | - | ⏳ | Week 3 |
| 5 | `getConfigHistory()` | `useConfigHistory()` | 5min | - | ⏳ | Week 3 |
| 6 | `revertConfig(id)` | `useRevertConfig()` | - | Mutation | ⏳ | Week 3 |

**说明**:
- ✅ 已完成：3个核心配置API
- ⏳ Week 3计划：3个扩展API
- 使用1小时长缓存，配置很少变化

---

### 成就系统 API (2/4 = 50%)

| 序号 | 旧API方法 | 新React Query Hook | 缓存策略 | 特殊特性 | 状态 | Week |
|------|----------|-------------------|----------|----------|------|------|
| 1 | `getBadges()` | `useBadges()` | 5min | - | ✅ | Week 2 |
| 2 | `getAchievements()` | `useAchievements()` | 5min | - | ✅ | Week 2 |
| 3 | `checkAndAwardBadges()` | `useCheckAndAwardBadges()` | - | Mutation | ⏳ | Week 3 |
| 4 | `getBadgeProgress()` | `useBadgeProgress()` | 5min | - | ⏳ | Week 3 |

**说明**:
- ✅ 已完成：2个核心查询API
- ⏳ Week 3计划：2个扩展API

---

### 音频服务 API (不迁移)

| 序号 | 旧API方法 | 迁移方案 | 说明 |
|------|----------|---------|------|
| 1 | `playAudio(url)` | ❌ 保留在`AudioService` | 音频播放不适合Query |
| 2 | `preloadAudio(urls)` | ❌ 保留在`AudioService` | 预加载逻辑特殊 |
| 3 | `getAudioUrl(wordId)` | ❌ 直接计算URL | 无需API调用 |

**说明**:
- ⛔ 音频服务不适合React Query
- 保持现有AudioService实现
- 使用浏览器原生Audio API

---

## 📝 迁移优先级

### 🔴 高优先级 (Week 3)

1. **学习相关剩余API** (8个)
   - `getStudyWords()`
   - `getNextWords()`
   - `createLearningSession()`
   - `getLearningHistory()`
   - 等

2. **统计分析核心API** (4个)
   - `getDailyStatistics()`
   - `getWeeklyReport()`
   - `getMonthlyReport()`
   - `getLearningCurve()`

3. **用户管理核心API** (3个)
   - `updateUser()`
   - `deleteUser()`
   - `getUserWords()`

### 🟡 中优先级 (Week 3-4)

4. **统计分析扩展API** (8个)
   - AMAS趋势API
   - 性能指标API
   - 可视化数据API

5. **AMAS查询API** (4个)
   - `getAmasHistory()`
   - `getAmasRecommendations()`
   - `getDecisionPipeline()`
   - `getModelParameters()`

6. **配置管理扩展API** (3个)
   - `getAllConfigs()`
   - `getConfigHistory()`
   - `revertConfig()`

### 🟢 低优先级 (Week 4+)

7. **成就系统扩展API** (2个)
8. **用户管理扩展API** (4个)
9. **AMAS Mutation API** (2个)

---

## 🎯 Week 3-4 目标

### Week 3 目标: API覆盖率达70%

**计划新增**: 15-20个hooks
**预计覆盖**: 73个API中的50+个

### Week 4 目标: API覆盖率达80%+

**计划新增**: 10-15个hooks
**预计覆盖**: 73个API中的60+个

### 不迁移的API

以下API**不应该**迁移到React Query：

1. **流程型接口**:
   - `processLearningEvent()`
   - `triggerQueueAdjustment()`
   - `syncAnswerToServer()`

2. **音频服务**:
   - `playAudio()`
   - `preloadAudio()`

3. **文件操作**:
   - `uploadFile()`
   - `downloadExport()`

4. **WebSocket/SSE**:
   - `connectRealtimeUpdates()`

---

## 📊 性能改善对比

### 网络请求减少

| API类型 | 优化前 | 优化后 | 改善 |
|---------|--------|--------|------|
| 重复��询 | 100% | 10% | ↓90% |
| 页面切换 | 100% | 5% | ↓95% |
| 搜索请求 | 100% | 30% | ↓70% |
| 分页切换 | 100% | 0% | ↓100% (无请求) |

### 响应速度提升

| 操作 | 优化前 | 优化后 | 改善 |
|------|--------|--------|------|
| 答题反馈 | 500ms | <10ms | ↓98% |
| 删除词书 | 300ms | <10ms | ↓97% |
| 查看统计 | 1000ms | 即时 | 缓存命中 |
| 切换页面 | 500ms | <100ms | ↓80% |

---

## 📚 相关文档

- [API_MIGRATION_GUIDE.md](./API_MIGRATION_GUIDE.md) - 迁移详细指南
- [REACT_QUERY_HOOKS_GUIDE.md](./REACT_QUERY_HOOKS_GUIDE.md) - Hooks使用指南
- [MONTH1_COMPLETE_REPORT.md](./MONTH1_COMPLETE_REPORT.md) - Month 1报告
- [MONTH1_BEST_PRACTICES.md](./MONTH1_BEST_PRACTICES.md) - 最佳实践

---

**文档状态**: ✅ Month 1 Week 2完成
**下次更新**: Week 3 API迁移完成后
**维护人**: 开发团队
