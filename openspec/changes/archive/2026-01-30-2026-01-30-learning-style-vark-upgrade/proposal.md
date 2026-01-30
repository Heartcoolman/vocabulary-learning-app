# Change: Upgrade Learning Style Model from VAK to VARK

## Why

当前 Learning Style 模型仅支持 VAK 三维（visual/auditory/kinesthetic），无法识别"读写型"学习者。需升级为 VARK 四维模型并引入机器学习评分，提升学习风格判定的准确性和个性化建议质量。

## What Changes

- **MODIFIED**: LearningStyleScores 添加 `reading` 维度
- **MODIFIED**: LearningStyleType 添加 `reading` 和 `multimodal` 类型
- **MODIFIED**: multimodal 判定逻辑改为基于方差 (var < 0.01)
- **ADDED**: 9 个新的交互数据采集字段 (`answer_records` 表)
- **ADDED**: 7 个新的统计字段 (`user_interaction_stats` 表)
- **ADDED**: `user_vark_models` 表存储 ML 模型权重
- **ADDED**: 在线 SGD 分类器 (4 个二分类器, one-vs-rest)
- **ADDED**: 前端交互追踪 hook (`useInteractionTracker`)
- **ADDED**: API 向后兼容字段 (`styleLegacy`)

## Impact

- **Affected specs**: learning-style
- **Affected code**:
  - `packages/backend-rust/src/services/user_profile.rs`
  - `packages/backend-rust/src/amas/modeling/vark/` (新增)
  - `packages/frontend/src/types/cognitive.ts`
  - `packages/frontend/src/components/LearningStyleCard.tsx`
  - `packages/frontend/src/hooks/useInteractionTracker.ts` (新增)
  - `packages/backend-rust/sql/041_add_vark_columns.sql` (新增)

---

## 详细设计

### 1. 数据指标扩展

#### 1.1 新增采集字段

**`answer_records` 表扩展**:
| 字段 | 类型 | 说明 |
|------|------|------|
| `imageViewCount` | INT | 图片查看次数 |
| `imageZoomCount` | INT | 图片缩放次数 |
| `imageLongPressMs` | BIGINT | 图片长按总时长 |
| `audioPlayCount` | INT | 发音播放次数 |
| `audioReplayCount` | INT | 重复播放次数 |
| `audioSpeedAdjust` | BOOLEAN | 是否调节语速 |
| `definitionReadMs` | BIGINT | 释义阅读时长 |
| `exampleReadMs` | BIGINT | 例句阅读时长 |
| `noteWriteCount` | INT | 笔记/标注次数 |

**`user_interaction_stats` 表扩展**:
| 字段 | 类型 | 说明 |
|------|------|------|
| `avgSessionDurationMs` | BIGINT | 平均 session 时长 |
| `sessionBreakCount` | INT | session 中断次数 |
| `preferredReviewInterval` | INT | 偏好复习间隔(小时) |
| `totalImageInteractions` | INT | 图片交互总次数 |
| `totalAudioInteractions` | INT | 音频交互总次数 |
| `totalReadingMs` | BIGINT | 阅读总时长 |
| `totalWritingActions` | INT | 书写/标注总次数 |

#### 1.2 学习节奏信号

从现有数据衍生:

- `sessionConsistency`: session 时长方差 → 学习稳定性
- `breakFrequency`: 中断频率 → 注意力持续度
- `reviewPatternType`: 复习间隔分布 → 学习节奏类型

### 2. VARK 四维模型

#### 2.1 类型定义更新

```rust
// packages/backend-rust/src/services/user_profile.rs
pub struct LearningStyleScores {
    pub visual: f64,      // V - 视觉学习
    pub auditory: f64,    // A - 听觉学习
    pub reading: f64,     // R - 读写学习 (新增)
    pub kinesthetic: f64, // K - 动觉学习
}

pub type LearningStyleType = "visual" | "auditory" | "reading" | "kinesthetic" | "multimodal";
```

```typescript
// packages/frontend/src/types/cognitive.ts
export interface LearningStyleScores {
  visual: number;
  auditory: number;
  reading: number; // 新增
  kinesthetic: number;
}

export type LearningStyleType = 'visual' | 'auditory' | 'reading' | 'kinesthetic' | 'multimodal';
```

#### 2.2 各维度评分信号

| 维度            | 主要信号                                               | 辅助信号                 |
| --------------- | ------------------------------------------------------ | ------------------------ |
| **Visual**      | imageViewCount, imageZoomCount, imageLongPressMs       | dwellTime on image cards |
| **Auditory**    | audioPlayCount, audioReplayCount, audioSpeedAdjust     | pronunciationClicks      |
| **Reading**     | definitionReadMs, exampleReadMs, avgDwellTime on text  | scrollDepth              |
| **Kinesthetic** | responseTime variance, pageSwitchCount, noteWriteCount | sessionBreakCount        |

### 3. 机器学习评分模型

#### 3.1 模型架构

采用轻量级在线学习模型:

```
┌─────────────────────────────────────────────────────────┐
│                  VARK Scorer (Online)                   │
├─────────────────────────────────────────────────────────┤
│  Input Features (per interaction):                      │
│  - visual_signals: [img_view, img_zoom, img_press, ...] │
│  - audio_signals: [play, replay, speed_adj, ...]        │
│  - reading_signals: [def_read, ex_read, dwell, ...]     │
│  - kinesthetic_signals: [resp_var, switch, write, ...]  │
│  - temporal: [hour, session_duration, break_count]      │
├─────────────────────────────────────────────────────────┤
│  Model: Incremental Logistic Regression / Online SGD    │
│  - 4 binary classifiers (one-vs-rest)                   │
│  - Exponential decay for temporal weighting             │
│  - L2 regularization for stability                      │
├─────────────────────────────────────────────────────────┤
│  Output:                                                │
│  - scores: {V: 0.35, A: 0.25, R: 0.30, K: 0.10}        │
│  - dominant_style: "visual" | "multimodal"              │
│  - confidence: 0.72                                     │
└─────────────────────────────────────────────────────────┘
```

#### 3.2 实现位置

```
packages/backend-rust/src/amas/modeling/
├── cognitive.rs          # 现有认知建模
├── learning_style.rs     # 新增: VARK 评分模型
└── vark/
    ├── mod.rs
    ├── features.rs       # 特征提取
    ├── classifier.rs     # 在线分类器
    └── calibration.rs    # 置信度校准
```

#### 3.3 训练策略

- **冷启动**: 使用规则引擎 (现有逻辑) 直到样本 >= 50
- **在线学习**: 每次交互后增量更新模型权重
- **定期校准**: 每 100 次交互重新计算 confidence threshold
- **衰减机制**: 旧数据权重随时间指数衰减 (τ = 14 days)

### 4. 前端更新

#### 4.1 LearningStyleCard 组件

新增 Reading 维度展示:

- 图标: `BookOpen` 或 `FileText`
- 颜色: `text-amber-600` / `bg-amber-50`
- 描述: "你对文字阅读和书写有较强偏好。建议多查看例句和释义，尝试做笔记。"

#### 4.2 交互数据采集

在 `packages/frontend/src/hooks/` 中新增:

```typescript
// useInteractionTracker.ts
- trackImageView(wordId: string)
- trackImageZoom(wordId: string)
- trackAudioPlay(wordId: string, isReplay: boolean)
- trackReadingTime(wordId: string, durationMs: number, type: 'definition' | 'example')
- trackNote(wordId: string)
```

### 5. 迁移计划

#### Phase 1: 数据采集层

1. 添加数据库迁移 (新字段)
2. 前端埋点 hook 实现
3. 后端接收新字段并存储

#### Phase 2: VARK 规则引擎

1. 后端 `compute_learning_style` 升级为四维
2. 前端类型定义更新
3. LearningStyleCard 组件适配

#### Phase 3: ML 模型

1. 特征工程模块
2. 在线分类器实现
3. 置信度校准
4. A/B 测试规则引擎 vs ML 模型

### 6. 兼容性

- 旧版客户端: 返回 `reading: 0` 确保向后兼容
- `mixed` 类型重命名为 `multimodal` (保留 `mixed` 作为别名)
- 置信度计算方式变更，需更新前端展示逻辑

## 文件变更清单

### 后端

- `sql/041_add_vark_columns.sql` (新增)
- `src/services/user_profile.rs` (修改)
- `src/amas/modeling/learning_style.rs` (新增)
- `src/amas/modeling/vark/` (新增目录)
- `src/routes/user.rs` (可能修改)

### 前端

- `src/types/cognitive.ts` (修改)
- `src/components/LearningStyleCard.tsx` (修改)
- `src/hooks/useInteractionTracker.ts` (新增)
- `src/services/client/amas/AmasClient.ts` (可能修改)

### 共享

- `packages/shared/src/types/cognitive.ts` (如存在则修改)

---

## 约束规范 (Constraints Specification)

本节记录所有经用户确认的明确约束，消除实现过程中的决策点。

### C1. 实现范围

**范围**: 全部 Phase（完整实现）

- Phase 1: 数据采集层（数据库迁移、前端埋点、后端存储）
- Phase 2: VARK 规则引擎（四维模型升级）
- Phase 3: ML 模型（在线分类器、特征工程、置信度校准）

### C2. Reading 维度信号采集

**策略**: 复用 dwellTime

- 当 `dwellTime > 5000ms` 且无音频播放时，判定为阅读行为
- Reading 分数计算公式：`reading_score = min(1.0, (dwellTime - 5000) / 10000) * has_no_audio_factor`
- `has_no_audio_factor`: 若当次交互有 audioPlayCount > 0，则为 0.5，否则为 1.0

### C3. 向后兼容策略

**策略**: 双字段兼容

- API 响应同时包含 `style` 和 `styleLegacy` 字段
- `styleLegacy`: 返回原有值（`visual` | `auditory` | `kinesthetic` | `mixed`）
- `style`: 返回新值（`visual` | `auditory` | `reading` | `kinesthetic` | `multimodal`）
- 当新模型判定为 `reading` 时，`styleLegacy` 返回 `mixed`
- 当新模型判定为 `multimodal` 时，`styleLegacy` 返回 `mixed`

### C4. multimodal 判定条件

**策略**: 基于方差判定

- 四维分数归一化后（V + A + R + K = 1.0）
- 当方差 `var(V, A, R, K) < 0.01` 时，判定为 `multimodal`
- 方差计算：`var = Σ(score - 0.25)² / 4`

### C5. ML 模型参数

| 参数       | 值       | 说明                        |
| ---------- | -------- | --------------------------- |
| 算法       | 在线 SGD | 4 个二分类器，one-vs-rest   |
| 学习率     | 0.005    | 初始学习率                  |
| L2 正则化  | 0.001    | 防止过拟合                  |
| 冷启动阈值 | 50       | 总交互次数 >= 50 后启用 ML  |
| 时间衰减 τ | 14 天    | 旧数据权重指数衰减          |
| 校准周期   | 100      | 每 100 次交互重新校准置信度 |

### C6. 特征权重衰减公式

```
weight(t) = exp(-(now - t) / (τ * 24 * 3600 * 1000))
```

其中 `t` 为交互时间戳（毫秒），`τ = 14` 天。

### C7. 置信度计算

```
confidence = min(0.95, sample_confidence + model_confidence)
sample_confidence = min(0.5, sample_count / 100)
model_confidence = max_score - second_max_score  // 最高分与次高分的差值
```

---

## Property-Based Testing (PBT) 属性

### PBT-1: 分数归一化不变量

**[INVARIANT]** 四维分数总和恒等于 1.0

```
∀ scores: LearningStyleScores,
  abs(scores.visual + scores.auditory + scores.reading + scores.kinesthetic - 1.0) < 1e-9
```

**[FALSIFICATION STRATEGY]**

- 生成随机交互序列，验证每次计算后分数总和
- 边界条件：所有信号为 0、单一信号极大值、负值输入

### PBT-2: 方差判定一致性

**[INVARIANT]** multimodal 判定与方差阈值一致

```
∀ scores: LearningStyleScores,
  is_multimodal(scores) ⟺ variance(scores) < 0.01
```

**[FALSIFICATION STRATEGY]**

- 生成方差恰好在 0.009-0.011 边界的分数组合
- 验证判定结果与预期一致

### PBT-3: 时间衰减单调性

**[INVARIANT]** 权重随时间单调递减

```
∀ t1 < t2: weight(t1) > weight(t2)
```

**[FALSIFICATION STRATEGY]**

- 生成随机时间序列，验证权重序列单调性
- 边界条件：相同时间戳、跨 τ 周期的时间差

### PBT-4: 冷启动切换幂等性

**[INVARIANT]** 规则引擎与 ML 模型在阈值处平滑过渡

```
∀ user with sample_count = 49:
  rule_engine_scores ≈ ml_scores (差异 < 0.1)
```

**[FALSIFICATION STRATEGY]**

- 在 sample_count = 49, 50, 51 附近生成测试用例
- 验证切换前后分数无剧烈跳变

### PBT-5: SGD 更新有界性

**[INVARIANT]** 单次 SGD 更新后权重变化有界

```
∀ update: |weight_after - weight_before| < learning_rate * max_gradient
```

**[FALSIFICATION STRATEGY]**

- 生成极端特征值（全 0、全 1、极大值）
- 验证权重更新不会导致数值溢出

### PBT-6: 向后兼容映射一致性

**[INVARIANT]** styleLegacy 映射规则一致

```
∀ style ∈ {visual, auditory, kinesthetic}: styleLegacy = style
style = reading ⟹ styleLegacy = mixed
style = multimodal ⟹ styleLegacy = mixed
```

**[FALSIFICATION STRATEGY]**

- 遍历所有 style 值，验证 styleLegacy 映射

### PBT-7: 置信度有界性

**[INVARIANT]** 置信度始终在 [0, 0.95] 区间

```
∀ result: 0 ≤ result.confidence ≤ 0.95
```

**[FALSIFICATION STRATEGY]**

- 生成极端样本数（0, 1, 10000）
- 生成极端分数分布（全相等、单一极大）
