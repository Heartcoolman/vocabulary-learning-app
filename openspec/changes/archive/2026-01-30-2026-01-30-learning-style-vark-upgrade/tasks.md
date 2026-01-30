# VARK Learning Style Upgrade - Tasks

## Phase 1: 数据采集层

### 1.1 数据库迁移

- [x] 创建 `sql/041_add_vark_columns.sql`
- [x] 更新 `sql/sqlite_fallback_schema.sql`
- [x] 运行迁移测试

### 1.2 后端数据接收

- [x] 更新 `AnswerRecord` 结构体，添加 VARK 字段
- [x] 更新答题记录插入逻辑
- [x] 更新 `user_interaction_stats` 统计逻辑

### 1.3 前端埋点

- [x] 创建 `useInteractionTracker.ts` hook
- [x] 集成到 `WordCard` 组件
- [x] 更新 `SubmitAnswerRequest` 类型
- [x] 测试数据采集

---

## Phase 2: VARK 规则引擎

### 2.1 类型定义

- [x] 更新后端 `LearningStyleScores`（添加 reading）
- [x] 更新后端 `LearningStyleProfile`（添加 styleLegacy）
- [x] 更新前端 `cognitive.ts` 类型
- [x] 更新共享类型 `LearningEventInput`（添加 VARK 字段）

### 2.2 规则引擎升级

- [x] 实现 `compute_reading_score`
- [x] 实现 `compute_visual_score_vark`
- [x] 实现 `compute_auditory_score_vark`
- [x] 实现 `compute_kinesthetic_score_vark`
- [x] 实现 `LearningStyleScores::normalize`
- [x] 实现 `LearningStyleScores::variance`
- [x] 实现 `LearningStyleScores::is_multimodal`
- [x] 实现 `LearningStyleScores::dominant_style`
- [x] 实现 `LearningStyleScores::legacy_style`
- [x] 实现 `fetch_vark_stats` 查询
- [x] 更新 `compute_learning_style` 主函数

### 2.3 前端展示

- [x] 更新 `LearningStyleCard` 添加 Reading 维度
- [x] 添加 `BookOpen` 图标
- [x] 处理 `mixed` → `multimodal` 兼容
- [x] 四维进度条展示

### 2.4 测试

- [x] 后端单元测试：分数归一化
- [x] 后端单元测试：方差计算
- [x] 后端单元测试：multimodal 判定
- [x] 后端单元测试：向后兼容映射
- [x] 前端组件测试：四维展示
- [ ] E2E 测试：完整流程

---

## Phase 3: ML 模型

### 3.1 模型实现

- [x] 创建 `src/amas/modeling/vark/` 目录结构
- [x] 实现 `features.rs`：VarkFeatures
- [x] 实现 `classifier.rs`：BinaryClassifier
- [x] 实现 `classifier.rs`：VarkClassifier
- [x] 实现 `calibration.rs`：置信度计算
- [x] 实现 `mod.rs`：模块导出

### 3.2 模型持久化

- [x] 实现 `save_vark_model`
- [x] 实现 `load_vark_model`
- [x] 创建 `user_vark_models` 表（已在迁移中）

### 3.3 模型集成

- [x] 实现 `compute_learning_style_adaptive`
- [x] 实现 `update_learning_style_model`
- [x] 集成到答题流程
- [x] 冷启动逻辑测试

### 3.4 测试

- [x] 单元测试：特征提取
- [x] 单元测试：SGD 更新（classifier.rs 中已包含）
- [x] 单元测试：时间衰减
- [x] 单元测试：模型持久化
- [x] 属性测试：PBT-1 分数归一化
- [x] 属性测试：PBT-2 方差判定一致性
- [x] 属性测试：PBT-3 时间衰减单调性
- [x] 属性测试：PBT-4 冷启动切换
- [x] 属性测试：PBT-5 SGD 更新有界性
- [x] 属性测试：PBT-6 向后兼容映射
- [x] 属性测试：PBT-7 置信度有界性（calibration.rs 中已包含）

---

## 验收标准

- [x] 所有 Phase 任务完成
- [x] 所有 PBT 属性测试通过
- [x] 前端四维展示正常
- [x] 向后兼容测试通过
- [x] ML 模型冷启动/切换正常
- [ ] 生产环境部署验证
