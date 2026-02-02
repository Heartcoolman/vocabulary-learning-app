# AMAS 数据采集拓展方案

## 概述

本提案实现 `/home/liji/danci/danci/data_expansion_plan.md` 中描述的两大数据采集策略：

1. **微观行为数据拓展**（无感采集）：犹豫系数、按键特征
2. **主动元认知交互**（主动采集）：蒙题标记、状态打卡

## 用户决策约束

基于用户确认的关键决策：

| 决策项               | 用户选择                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| 微行为数据存储策略   | **原始事件序列** - 存储完整交互序列（时间戳+坐标/按键），支持后续分析                            |
| 蒙题标记处理逻辑     | **一票否决** - is_guess=true 时强制 is_mastered=false，加入高优先级复习队列                      |
| 状态打卡触发时机     | **仅会话开始** - 每次学习会话开始前询问一次                                                      |
| 状态打卡影响方式     | **作为校准信号** - 用户报告作为 TFM 疲劳模型的校准数据                                           |
| 时间戳格式           | **双字段存储** - 前端提交 epoch ms + relative offset 双字段，后端存储 i64                        |
| 移动端适配           | **检测设备类型，条件采集** - 通过 PointerEvent.pointerType 检测，touch 设备跳过 hover/trajectory |
| 校准常数             | **High=0.6, Normal=1.0, Low=1.4** - 保守校准范围，避免过度调整                                   |
| 蒙题答错处理         | **与普通答错相同** - is_guess && !is_correct 不额外惩罚                                          |
| 数据捕获时机         | **点击选项时** - 用户点击选项时立即快照微行为数据                                                |
| 存储失败处理         | **写入日志后补** - 失败数据写入日志文件，后续批量补入                                            |
| 事件数组上限         | **500/100/50 + 保留最新** - trajectory=500, hover=100, keystroke=50，FIFO 策略                   |
| reactionLatency 定义 | **任何交互** - 首次 pointer move、hover enter 或 keydown 中最早的                                |
| 高优先级复习机制     | **复用 SWD 优先级** - is_guess=true 单词在 SWD 中标记 priority=high                              |
| 数据保留策略         | **永久保留** - 原始事件序列永久存储，不做 TTL                                                    |
| 会话创建时机         | **两种路径并存** - 支持延迟创建（打卡后）和立即创建+后续更新                                     |
| 无效 energy 值       | **拒绝请求 (400)** - 后端严格校验，不接受非法值                                                  |

## 技术约束（来自代码库分析）

### 前端交互层约束

- 现有 `useInteractionTracker` 仅支持 VARK 的 9 个固定字段，无扩展机制
- 无现有鼠标轨迹/悬停追踪基础设施
- 键盘事件处理使用 `stateRef` 模式避免重复监听
- `TrackingService` 捕获全局点击但仅存储元数据，不含坐标

### 后端事件处理约束

- `ProcessEventRequest` → `RawEvent` 转换存在字段丢失（VARK 字段未传入 AMAS 引擎）
- `feature_vector` 硬编码 10 维特征，扩展需修改所有依赖算法
- `answer_records` 表已有 VARK 列但无 micro-behavior 列
- 批量处理 `batch_process` 会丢失所有 micro-behavior 数据

### 掌握度算法约束

- `RawEvent.confidence` 字段已定义但在 `compute_adaptive_mastery` 中未使用
- `is_correct=false` 时 `performance_contribution` 和 `context_contribution` 均为 0
- `MasteryContext` 无 `hover_duration`、`trajectory_length`、`is_guess` 字段

### 疲劳模型约束

- TFM 使用双池机制（fast/slow），校准需要新增 `calibration_input` 接口
- 当前完全依赖行为推断，无用户自报告状态机制
- `SafetyFilterConfig` 阈值全局固定，无个性化校准

### 会话管理约束

- 会话在 `useMasteryLearning.initSession()` 中自动创建，无预会话对话框
- `CreateSessionRequest` 仅接受 `target_mastery_count`，不接受难度/模式参数
- 缓存恢复逻辑假设会话已存在

## 功能范围

### P0 - 核心功能

#### 1. 犹豫系数采集 (Indecision Index)

**前端采集**：

- 在 `TestOptions` 组件中添加 `MicroInteractionTracker`
- 采集字段：
  - `hover_timestamps: Record<optionId, number[]>` - 每个选项的悬停时间序列
  - `trajectory_points: Array<{x, y, t}>` - 鼠标/触摸轨迹（采样率 50ms）
  - `tentative_selections: string[]` - 曾悬停 >500ms 或按下未确认的选项
  - `final_selection_time: number` - 最终选择时间戳

**后端处理**：

- `RawEvent` 新增 `micro_interactions: Option<MicroInteractions>` 字段
- 计算 `indecision_index = trajectory_length / direct_distance * switch_penalty`
- 在 `compute_adaptive_mastery` 中应用犹豫惩罚：
  ```
  performance_contribution *= (1.0 - k * indecision_index)
  ```

#### 2. 按键特征采集 (Keystroke Dynamics)

**前端采集**：

- 在 `TestOptions` 键盘事件处理中添加：
  - `reaction_latency: number` - 题目渲染完成到首次按键的时间
  - `key_hold_time: number` - 按键保持时间（keydown → keyup）
  - `key_sequence: Array<{key, down_time, up_time}>` - 完整按键序列

**后端处理**：

- 根据 `reaction_latency` 和 `key_hold_time` 计算熟练度加权
- 极短延迟 + 极短保持 → Mastery 加成

#### 3. 蒙题标记 (Uncertainty Flag)

**前端实现**：

- 在选项区域下方添加低调的"不确定/蒙的"复选框
- 状态存储在 `SubmitAnswerParams.isGuess`

**后端处理**：

- `ProcessEventRequest` 新增 `is_guess: bool` 字段
- 在 `compute_adaptive_mastery` 中：
  ```rust
  if is_guess && is_correct {
      return AdaptiveMasteryResult {
          is_mastered: false,  // 一票否决
          confidence: 0.0,
          // ...
      };
  }
  ```
- 触发高优先级复习：在当前 Session 结束前或次日复现

#### 4. 状态打卡 (State Check-in)

**前端实现**：

- 在 `LearningPage` 首次加载时显示状态询问浮层
- 三个选项：
  - 🤯 **精力充沛** → `energy_level: "high"`
  - 😐 **平平淡淡** → `energy_level: "normal"`
  - 😫 **精疲力尽** → `energy_level: "low"`

**后端处理**：

- `CreateSessionRequest` 新增 `self_reported_energy: Option<String>` 字段
- 在 TFM 初始化时使用该值校准：
  ```rust
  fn calibrate_fatigue_model(
      tfm_state: &mut TriPoolFatigueState,
      reported_energy: EnergyLevel,
  ) {
      let calibration_factor = match reported_energy {
          EnergyLevel::High => 0.3,   // 用户报告精力充沛，降低检测到的疲劳
          EnergyLevel::Normal => 1.0, // 无校准
          EnergyLevel::Low => 1.5,    // 用户报告疲倦，放大检测到的疲劳
      };
      // 应用到 TFM 状态
  }
  ```

### P1 - 数据持久化

#### 数据库 Schema 扩展

**新增表 `micro_behavior_events`**：

```sql
CREATE TABLE micro_behavior_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    answer_record_id UUID NOT NULL REFERENCES answer_records(id),
    event_type VARCHAR(32) NOT NULL,  -- 'hover', 'keypress', 'trajectory'
    event_data JSONB NOT NULL,         -- 完整事件序列
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_mbe_answer_record ON micro_behavior_events(answer_record_id);
```

**扩展 `answer_records` 表**：

```sql
ALTER TABLE answer_records ADD COLUMN is_guess BOOLEAN DEFAULT FALSE;
ALTER TABLE answer_records ADD COLUMN indecision_index REAL;
ALTER TABLE answer_records ADD COLUMN reaction_latency_ms INTEGER;
ALTER TABLE answer_records ADD COLUMN key_hold_time_ms INTEGER;
```

**扩展 `learning_sessions` 表**：

```sql
ALTER TABLE learning_sessions ADD COLUMN self_reported_energy VARCHAR(16);
```

## 成功标准

1. **犹豫惩罚可观测**：用户答对但犹豫 → 掌握度分数低于快速答对
2. **蒙题一票否决生效**：`is_guess=true` 且答对 → `is_mastered=false`
3. **状态打卡影响策略**：报告"精疲力尽"后，系统给出更简单的题目
4. **数据完整持久化**：`micro_behavior_events` 表成功存储原始事件序列
5. **无性能退化**：`process_event` 平均延迟增加不超过 20%
6. **向后兼容**：未提供新字段的旧客户端仍可正常调用 API

## 风险与缓解

| 风险                 | 缓解措施                                       |
| -------------------- | ---------------------------------------------- |
| 高频事件导致性能问题 | 使用 `requestAnimationFrame` 节流，50ms 采样率 |
| 原始事件序列存储量大 | 设置单次答题事件上限（500 个点），超出时采样   |
| 用户可能滥用蒙题标记 | 记录使用频率，异常高频时提示用户               |
| 状态打卡打断心流     | 设计为非阻塞浮层，3 秒无操作自动使用默认值     |

## 实现顺序

1. **Phase 1**：后端 Schema 迁移 + API 字段扩展
2. **Phase 2**：前端微行为采集基础设施
3. **Phase 3**：蒙题标记 UI + 后端一票否决逻辑
4. **Phase 4**：状态打卡 UI + TFM 校准集成
5. **Phase 5**：犹豫惩罚算法集成
6. **Phase 6**：按键特征采集与熟练度加权

## 文件变更清单

### 前端

- `packages/frontend/src/hooks/useTestOptions.ts` - 添加微行为追踪
- `packages/frontend/src/hooks/useSubmitAnswer.ts` - 扩展提交参数
- `packages/frontend/src/components/TestOptions.tsx` - 添加蒙题复选框
- `packages/frontend/src/pages/LearningPage.tsx` - 添加状态打卡浮层
- `packages/frontend/src/services/MicroBehaviorTracker.ts` - **新增**
- `packages/shared/src/types/amas.ts` - 类型定义扩展

### 后端

- `packages/backend-rust/src/routes/amas.rs` - ProcessEventRequest 扩展
- `packages/backend-rust/src/routes/learning_sessions.rs` - CreateSessionRequest 扩展
- `packages/backend-rust/src/amas/types.rs` - RawEvent/MicroInteractions 扩展
- `packages/backend-rust/src/amas/memory/adaptive_mastery.rs` - 一票否决/犹豫惩罚
- `packages/backend-rust/src/amas/modeling/tfm.rs` - 校准接口
- `packages/backend-rust/src/services/record.rs` - CreateRecordInput 扩展
- `packages/backend-rust/src/db/operations/micro_behavior.rs` - **新增**
- `packages/backend-rust/sql/048_add_micro_behavior_tables.sql` - **新增**
