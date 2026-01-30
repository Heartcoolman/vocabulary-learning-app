# Spec: VARK Confidence Calibration

## Overview

置信度校准模块，确保模型输出的置信度分数准确反映预测可靠性。

---

## 实现位置

**文件**: `packages/backend-rust/src/amas/modeling/vark/calibration.rs`

---

## 置信度计算公式

根据约束 C7：

```
confidence = min(0.95, sample_confidence + model_confidence)
sample_confidence = min(0.5, sample_count / 100)
model_confidence = max_score - second_max_score
```

---

## 实现

```rust
/// 计算学习风格的置信度
pub fn compute_confidence(scores: &LearningStyleScores, sample_count: i64) -> f64 {
    // 1. 样本置信度：样本越多越可信
    // sample_count / 100，上限 0.5
    let sample_confidence = (sample_count as f64 / 100.0).min(0.5);

    // 2. 模型置信度：主导风格与次高风格的分数差
    // 差距越大，判定越明确
    let model_confidence = compute_score_gap(scores);

    // 3. 总置信度：两者之和，上限 0.95
    (sample_confidence + model_confidence).min(0.95)
}

/// 计算分数间隙（最高分与次高分的差值）
fn compute_score_gap(scores: &LearningStyleScores) -> f64 {
    let mut sorted = [
        scores.visual,
        scores.auditory,
        scores.reading,
        scores.kinesthetic,
    ];

    // 降序排列
    sorted.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));

    // 最高分 - 次高分
    sorted[0] - sorted[1]
}

/// ML 模型专用置信度计算
pub fn compute_ml_confidence(scores: &LearningStyleScores, sample_count: i64) -> f64 {
    let base_confidence = compute_confidence(scores, sample_count);

    // ML 模型额外奖励：样本足够多时增加置信度
    let ml_bonus = if sample_count >= 100 {
        0.05
    } else if sample_count >= 50 {
        0.02
    } else {
        0.0
    };

    (base_confidence + ml_bonus).min(0.95)
}
```

---

## 校准周期

每 100 次交互重新校准：

```rust
impl VarkClassifier {
    /// 检查是否需要校准
    pub fn needs_calibration(&self) -> bool {
        self.sample_count - self.last_calibration >= 100
    }

    /// 执行校准
    pub fn calibrate(&mut self) {
        // 当前实现：更新 last_calibration 时间戳
        // 未来可扩展：基于历史预测准确率调整阈值
        self.last_calibration = self.sample_count;
    }
}
```

---

## 置信度阈值

| 置信度范围 | 含义       | 前端展示建议         |
| ---------- | ---------- | -------------------- |
| 0.0 - 0.3  | 低置信度   | 显示 "数据不足" 提示 |
| 0.3 - 0.5  | 中低置信度 | 显示 "初步判断"      |
| 0.5 - 0.7  | 中等置信度 | 正常展示             |
| 0.7 - 0.9  | 较高置信度 | 显示 "较可靠"        |
| 0.9 - 0.95 | 高置信度   | 显示 "非常可靠"      |

---

## 约束

| 约束 ID | 描述                                      |
| ------- | ----------------------------------------- |
| CAL-1   | 置信度始终在 [0, 0.95] 区间               |
| CAL-2   | 样本置信度上限为 0.5                      |
| CAL-3   | 模型置信度 = max_score - second_max_score |
| CAL-4   | 每 100 次交互触发一次校准检查             |

---

## PBT 属性

### PBT-7: 置信度有界性

**[INVARIANT]** 置信度始终在 [0, 0.95] 区间

```
∀ result: 0 ≤ result.confidence ≤ 0.95
```

**[FALSIFICATION STRATEGY]**

- 生成极端样本数（0, 1, 10000）
- 生成极端分数分布（全相等、单一极大）
- 生成边界条件（sample_count = 99, 100, 101）
