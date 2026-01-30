# Tasks: UMM Implementation

## Phase 0: 接入准备

- [x] 0.1 扩展 `AlgorithmId` 枚举：新增 `Mdm`, `Ige`, `Swd`, `Msmt`, `Mtp`, `Iad`, `Evm` 变体 (`amas/metrics.rs`)
- [x] 0.2 扩展 `FeatureFlags`：新增独立 flags（无全局开关）
  - `umm_mdm_enabled: bool` (default: false)
  - `umm_ige_enabled: bool` (default: false)
  - `umm_swd_enabled: bool` (default: false)
  - `umm_msmt_enabled: bool` (default: false)
  - `umm_mtp_enabled: bool` (default: false)
  - `umm_iad_enabled: bool` (default: false)
  - `umm_evm_enabled: bool` (default: false)
- [x] 0.3 创建 SQL migration：
  - `word_learning_states` 新增 `umm_strength`, `umm_consolidation`, `umm_last_review_ts` 字段
  - 新增 `context_history` 表（EVM 用）
- [x] 0.4 创建 `packages/backend-rust/src/umm/mod.rs` 模块结构
- [x] 0.5 更新 `learning_state.rs`：`WordStateUpdateData` 新增 UMM 字段
- [x] 0.6 实现 R_target 个性化：7天滑动窗口负担平衡公式

## Phase 1: MSMT (Multi-Scale Memory Trace)

- [x] 1.1 实现 `umm/msmt.rs`：`MSMTModel` 结构体与 `predict_recall` 方法
  - 三尺度时间常数 τ=[1h, 24h, 168h]
  - 无状态重建：从 `word_review_history` 计算 traces
  - 输出 `recall_probability ∈ [0,1]`
  - **参数**: threshold=0.3, slope=1.5, max_history=100
  - **权重**: correct=1.0, incorrect=0.2
- [x] 1.2 单元测试：`msmt.rs` 边界条件（空历史、单次复习、多次复习、超100条）
- [ ] 1.3 PBT 测试：排列不变性、近期单调性
- [x] 1.4 集成测试：`engine.rs` 中替换 `compute_actr_memory` 调用（feature flag 切换）
  - **融合权重**: 0.6*cognitive.mem + 0.4*msmt
- [ ] 1.5 验证：MSMT 输出与 ACT-R 输出对比日志

## Phase 2: IGE + SWD (Decision Layer)

- [x] 2.1 实现 `umm/ige.rs`：`IGEModel` 结构体
  - `select_action(state, feature, candidates)` → 确定性选择
  - `update(strategy, reward)` → 更新统计
  - `get_confidence()` → 置信度输出
  - **架构**: 全局 + context 分层统计
  - **参数**: β=1.0, context_weight=0.7, ess_k=5, min_conf=0.4, max_conf=0.98
  - **平局处理**: 按 strategy key 字典序
- [x] 2.2 实现 `umm/swd.rs`：`SWDModel` 结构体
  - `select_action(state, feature, candidates)` → 相似度加权选择
  - `update(context, strategy, reward)` → 历史记录追加
  - `get_confidence()` → 基于 evidence 的置信度
  - **参数**: γ=0.5, k=5.0, max_history=200, ε=1e-6
  - **淘汰策略**: FIFO
  - **平局处理**: 按 strategy key 字典序
- [x] 2.3 单元测试：IGE/SWD 冷启动、探索/利用平衡、零向量处理
- [ ] 2.4 PBT 测试：确定性、更新可交换性、置信度边界、FIFO 执行
- [x] 2.5 集成 `EnsembleDecision`：新增 "ige"/"swd" 候选来源
- [ ] 2.6 验证：IGE/SWD 与 Thompson/LinUCB 策略选择对比日志

## Phase 3: MTP + IAD + EVM (Vocabulary Specialization)

### 前置依赖（阻塞 EVM）

- [x] 3.0.1 **前端任务**：实现 device_type 检测与上报
  - **检测逻辑**：根据 `navigator.userAgent` 或 `window.innerWidth` 判断设备类型
  - **值域**：`"mobile"` | `"tablet"` | `"desktop"`
  - **判定规则**：
    - `mobile`: 屏幕宽度 < 768px 或 UA 包含 "Mobile"/"Android"/"iPhone"
    - `tablet`: 768px ≤ 屏幕宽度 < 1024px 或 UA 包含 "iPad"/"Tablet"
    - `desktop`: 其他情况
  - **上报位置**：所有学习事件 API 请求中添加 `device_type` 字段
  - **API 变更**：
    - `POST /api/learning/events` 新增可选字段 `device_type: string`
    - `POST /api/words/review` 新增可选字段 `device_type: string`
- [x] 3.0.2 **后端任务**：接收并存储 device_type
  - 更新 `RawEvent` 结构体：新增 `device_type: Option<String>`
  - 更新事件处理逻辑：将 device_type 写入 `context_history` 表
- [ ] 3.0.3 **验证**：确认 device_type 上报覆盖率 > 95%

### MTP

- [x] 3.1 实现 `umm/mtp.rs`：`MTPModel` 结构体
  - `compute_bonus(word_id, morpheme_states)` → `bonus_mtp ∈ [0, 0.30]`
  - 从 `user_morpheme_states` 查询词素掌握度
  - **参数**: α=0.1, max_bonus=0.30, masteryLevel_max=5
  - **模式**: 更新模式（更新 user_morpheme_states）

### IAD

- [x] 3.2 实现 `umm/iad.rs`：`IADModel` 结构体
  - `compute_penalty(word_id, recent_words)` → `penalty_iad ∈ [0, 0.50]`
  - 从 `confusion_pairs_cache` 查询易混淆词
  - **参数**: max_penalty=0.50, window_size=20, max_distance=1.0
  - **窗口**: 会话内最近 20 个
  - **权重**: 基于 distance 线性映射
  - **查找**: 双向

### EVM

- [x] 3.3 实现 `umm/evm.rs`：`EVMModel` 结构体
  - `compute_bonus(word_id, context_history)` → `bonus_evm ∈ [0, 0.15]`
  - 从 `context_history` 表查询情境历史
  - **参数**: β=0.15, max_bonus=0.15, max_history=50
  - **维度**: hour_of_day, day_of_week, question_type, device_type
  - **device_type**: 前端必须上报，无 fallback

### 测试与集成

- [x] 3.4 单元测试：MTP/IAD/EVM 边界条件
- [ ] 3.5 PBT 测试：边界、排列不变性、单调性、重复敏感性
- [x] 3.6 影子计算集成：仅计算并记录指标，不影响实际调度
- [ ] 3.7 验证：MTP/IAD/EVM 输出分布统计

## Phase 4: MDM (Memory Dynamics Model)

- [x] 4.1 实现 `umm/mdm.rs`：`MemoryDynamics` 结构体
  - `retrievability(Δt_days)` → 严格微分方程解（Newton/Lambert W）
  - `update(rating)` → 强化 M，更新 C
  - `interval_for_target(R_target)` → 最优间隔
  - **参数**: λ_0=0.3, α=0.5, η=0.4, M_max=10.0, κ=0.2, μ=0.25
  - **边界**: M ∈ [0.1, 10.0], C ∈ [0, 1]
  - **存储语义**: 存复习时刻 M，查询时实时计算衰减
- [x] 4.2 实现 quality 映射：
  - 公式: quality = clamp(0.5 + 0.3*(1-RT/30) + 0.2*(1-hints/3), 0, 1)
  - 错误答案: quality = 0.0
- [x] 4.3 单元测试：MDM 衰减曲线、强化饱和、间隔计算
- [ ] 4.4 PBT 测试：边界、单调遗忘、更新保持边界、往返一致性
- [x] 4.5 实现 FSRS 迁移映射：M = ln(stability+1), C = 1 - difficulty/10
- [x] 4.6 影子计算集成：与 FSRS 并行运行，记录对比指标
- [x] 4.7 切主准备：`engine.rs` 中 `fsrs_next_interval_with_root` 替换为 MDM 调用（feature flag）
- [ ] 4.8 验证：MDM vs FSRS 预测准确率对比

## Phase 5: 统一引擎收敛

- [x] 5.1 实现 `umm/engine.rs`：`UMMEngine` 统一入口
  - 组合 MDM + MTP/IAD/EVM 计算最终 retrievability
  - 组合 IGE + SWD 作为 EnsembleDecision 候选
  - 组合 MSMT 作为 cognitive.mem 替代
- [x] 5.2 实现统一公式：
  - mult = clamp((1+bonus_mtp)×(1+bonus_evm)×(1-penalty_iad), 0.5, 2.0)
  - R = clamp(R_base × mult, 0, 1)
- [x] 5.3 边界处理：ε=1e-6 除零保护、R_base_target ∈ [0.05, 0.97]
- [x] 5.4 集成测试：完整 UMM 流程端到端验证
- [x] 5.5 性能测试：单次 `process_event` 延迟 < 10ms

## Phase 6: A/B 测试

- [x] 6.1 创建 `umm_shadow_results` 表：存储影子计算结果
- [x] 6.2 实现 A/B 分流：用户级别 feature flag
- [x] 6.3 指标收集脚本：保持率、负担、学习效率、混淆率
  - 已集成到管理后台实验框架 (`experiment.rs`)
  - 通过 `record_umm_experiment_metric` 自动记录学习效果指标
- [ ] 6.4 分析报告：UMM vs 现有算法效果对比
- [ ] 6.5 文档更新：`UMM_ORIGINAL_ALGORITHMS.md` 实验结果附录

## 决策汇总

| 决策项             | 确认值                       |
| ------------------ | ---------------------------- |
| R_target 来源      | 用户级个性化 + 动态负担平衡  |
| R_base_target 边界 | [0.05, 0.97]                 |
| mult 边界          | [0.5, 2.0]                   |
| Feature flags      | 各模块独立，无全局开关       |
| MDM 衰减方法       | 严格微分方程解               |
| M 存储语义         | 存复习时刻 M                 |
| 新词初始值         | M=1.0, C=0.1                 |
| C 更新参数         | κ=0.2, μ=0.25                |
| quality 映射       | 连续映射 (RT/hints)          |
| M 边界             | [0.1, 10.0]                  |
| MSMT max_history   | 100                          |
| MSMT sigmoid       | threshold=0.3, slope=1.5     |
| MSMT 融合          | 0.6*cognitive.mem + 0.4*msmt |
| IGE 分层           | 全局 + context               |
| IGE context_weight | 0.7                          |
| IGE 置信度         | ess_k=5, min=0.4, max=0.98   |
| SWD max_history    | 200                          |
| 平局处理           | strategy key 字典序          |
| IAD 窗口           | 会话内最近 20 个             |
| IAD 权重           | 基于 distance 线性映射       |
| EVM 维度           | hour, day, type, device      |
| EVM device_type    | 前端必须上报                 |
| EVM 存储           | context_history 表           |
| MTP 模式           | 更新模式                     |
| 负担公式           | 线性组合                     |
| 负担窗口           | 7 天                         |
| R_target 范围      | [0.75, 0.95]                 |
| 迁移方式           | 从 FSRS 映射                 |
