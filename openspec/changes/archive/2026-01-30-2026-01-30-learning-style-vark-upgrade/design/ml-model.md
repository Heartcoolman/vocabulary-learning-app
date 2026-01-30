# Spec: VARK ML Model (Online SGD)

## Overview

基于在线 SGD 的 VARK 学习风格 ML 模型，使用 4 个二分类器（one-vs-rest）进行增量学习。

---

## 实现位置

```
packages/backend-rust/src/amas/modeling/
├── learning_style.rs     # 主入口
└── vark/
    ├── mod.rs            # 模块导出
    ├── features.rs       # 特征提取
    ├── classifier.rs     # 在线 SGD 分类器
    └── calibration.rs    # 置信度校准
```

---

## 模型参数

| 参数          | 值              | 约束 ID |
| ------------- | --------------- | ------- |
| 学习率 (η)    | 0.005           | C5      |
| L2 正则化 (λ) | 0.001           | C5      |
| 冷启动阈值    | 50 次交互       | C5      |
| 时间衰减 τ    | 14 天           | C5      |
| 校准周期      | 100 次交互      | C5      |
| 分类器数量    | 4 (one-vs-rest) | -       |

---

## 特征工程

**文件**: `packages/backend-rust/src/amas/modeling/vark/features.rs`

### 特征向量定义

```rust
/// VARK 特征向量，共 16 维
#[derive(Debug, Clone)]
pub struct VarkFeatures {
    // Visual 信号 (4 维)
    pub img_view_normalized: f64,      // imageViewCount / 10
    pub img_zoom_normalized: f64,      // imageZoomCount / 5
    pub img_press_normalized: f64,     // imageLongPressMs / 10000
    pub dwell_for_visual: f64,         // dwellTime / 10000 (视觉停留)

    // Auditory 信号 (4 维)
    pub audio_play_normalized: f64,    // audioPlayCount / 5
    pub audio_replay_normalized: f64,  // audioReplayCount / 3
    pub speed_adjust: f64,             // audioSpeedAdjust ? 1.0 : 0.0
    pub pronunciation_clicks: f64,     // pronunciationClicks / totalInteractions

    // Reading 信号 (4 维)
    pub def_read_normalized: f64,      // definitionReadMs / 10000
    pub example_read_normalized: f64,  // exampleReadMs / 10000
    pub dwell_for_reading: f64,        // max(0, dwellTime - 5000) / 10000
    pub reading_no_audio: f64,         // 阅读时无音频 ? 1.0 : 0.5

    // Kinesthetic 信号 (4 维)
    pub response_speed: f64,           // 1.0 / (1.0 + responseTime / 1000)
    pub response_variance: f64,        // 响应时间变异系数
    pub page_switch_rate: f64,         // pageSwitchCount / totalInteractions
    pub note_write_normalized: f64,    // noteWriteCount / 3
}

impl VarkFeatures {
    pub const DIM: usize = 16;

    pub fn to_vec(&self) -> Vec<f64> {
        vec![
            self.img_view_normalized,
            self.img_zoom_normalized,
            self.img_press_normalized,
            self.dwell_for_visual,
            self.audio_play_normalized,
            self.audio_replay_normalized,
            self.speed_adjust,
            self.pronunciation_clicks,
            self.def_read_normalized,
            self.example_read_normalized,
            self.dwell_for_reading,
            self.reading_no_audio,
            self.response_speed,
            self.response_variance,
            self.page_switch_rate,
            self.note_write_normalized,
        ]
    }

    /// 从单次交互记录提取特征
    pub fn from_interaction(record: &AnswerRecordVark) -> Self {
        Self {
            img_view_normalized: (record.image_view_count as f64 / 10.0).min(1.0),
            img_zoom_normalized: (record.image_zoom_count as f64 / 5.0).min(1.0),
            img_press_normalized: (record.image_long_press_ms as f64 / 10000.0).min(1.0),
            dwell_for_visual: (record.dwell_time as f64 / 10000.0).min(1.0),

            audio_play_normalized: (record.audio_play_count as f64 / 5.0).min(1.0),
            audio_replay_normalized: (record.audio_replay_count as f64 / 3.0).min(1.0),
            speed_adjust: if record.audio_speed_adjust { 1.0 } else { 0.0 },
            pronunciation_clicks: 0.0, // 需从 tracking 统计

            def_read_normalized: (record.definition_read_ms as f64 / 10000.0).min(1.0),
            example_read_normalized: (record.example_read_ms as f64 / 10000.0).min(1.0),
            dwell_for_reading: ((record.dwell_time as f64 - 5000.0).max(0.0) / 10000.0).min(1.0),
            reading_no_audio: if record.audio_play_count == 0 { 1.0 } else { 0.5 },

            response_speed: 1.0 / (1.0 + record.response_time.unwrap_or(0) as f64 / 1000.0),
            response_variance: 0.0, // 需从历史计算
            page_switch_rate: 0.0,  // 需从 tracking 统计
            note_write_normalized: (record.note_write_count as f64 / 3.0).min(1.0),
        }
    }
}
```

---

## 在线 SGD 分类器

**文件**: `packages/backend-rust/src/amas/modeling/vark/classifier.rs`

```rust
use std::time::{SystemTime, UNIX_EPOCH};

/// 单个二分类器（one-vs-rest）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryClassifier {
    pub weights: Vec<f64>,
    pub bias: f64,
}

impl BinaryClassifier {
    pub fn new(dim: usize) -> Self {
        Self {
            weights: vec![0.0; dim],
            bias: 0.0,
        }
    }

    /// Sigmoid 激活
    fn sigmoid(x: f64) -> f64 {
        1.0 / (1.0 + (-x).exp())
    }

    /// 预测概率
    pub fn predict_proba(&self, features: &[f64]) -> f64 {
        let z: f64 = self.weights.iter()
            .zip(features.iter())
            .map(|(w, x)| w * x)
            .sum::<f64>() + self.bias;
        Self::sigmoid(z)
    }

    /// SGD 更新
    pub fn update(
        &mut self,
        features: &[f64],
        label: f64,          // 1.0 or 0.0
        weight: f64,         // 时间衰减权重
        learning_rate: f64,  // η = 0.005
        l2_lambda: f64,      // λ = 0.001
    ) {
        let pred = self.predict_proba(features);
        let error = label - pred;

        // 权重更新：w += η * weight * error * x - η * λ * w
        for (i, w) in self.weights.iter_mut().enumerate() {
            let grad = weight * error * features[i] - l2_lambda * *w;
            *w += learning_rate * grad;
        }

        // 偏置更新
        self.bias += learning_rate * weight * error;
    }
}

/// VARK 四分类器
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VarkClassifier {
    pub visual: BinaryClassifier,
    pub auditory: BinaryClassifier,
    pub reading: BinaryClassifier,
    pub kinesthetic: BinaryClassifier,
    pub sample_count: i64,
    pub last_calibration: i64,
}

impl VarkClassifier {
    pub fn new() -> Self {
        Self {
            visual: BinaryClassifier::new(VarkFeatures::DIM),
            auditory: BinaryClassifier::new(VarkFeatures::DIM),
            reading: BinaryClassifier::new(VarkFeatures::DIM),
            kinesthetic: BinaryClassifier::new(VarkFeatures::DIM),
            sample_count: 0,
            last_calibration: 0,
        }
    }

    /// 预测四维分数
    pub fn predict(&self, features: &[f64]) -> LearningStyleScores {
        let v = self.visual.predict_proba(features);
        let a = self.auditory.predict_proba(features);
        let r = self.reading.predict_proba(features);
        let k = self.kinesthetic.predict_proba(features);

        let mut scores = LearningStyleScores {
            visual: v,
            auditory: a,
            reading: r,
            kinesthetic: k,
        };
        scores.normalize();
        scores
    }

    /// 增量更新（每次交互后调用）
    pub fn update(
        &mut self,
        features: &[f64],
        timestamp_ms: i64,
        inferred_labels: &VarkLabels,
    ) {
        const LEARNING_RATE: f64 = 0.005;
        const L2_LAMBDA: f64 = 0.001;
        const TAU_MS: f64 = 14.0 * 24.0 * 3600.0 * 1000.0; // 14 天

        // 计算时间衰减权重
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as f64;
        let age = now_ms - timestamp_ms as f64;
        let weight = (-age / TAU_MS).exp();

        // 更新各分类器
        self.visual.update(features, inferred_labels.visual, weight, LEARNING_RATE, L2_LAMBDA);
        self.auditory.update(features, inferred_labels.auditory, weight, LEARNING_RATE, L2_LAMBDA);
        self.reading.update(features, inferred_labels.reading, weight, LEARNING_RATE, L2_LAMBDA);
        self.kinesthetic.update(features, inferred_labels.kinesthetic, weight, LEARNING_RATE, L2_LAMBDA);

        self.sample_count += 1;
    }

    /// 是否启用 ML 模型
    pub fn is_enabled(&self) -> bool {
        self.sample_count >= 50
    }

    /// 是否需要重新校准
    pub fn needs_calibration(&self) -> bool {
        self.sample_count - self.last_calibration >= 100
    }
}

/// 推断标签（基于当次交互的主要行为）
#[derive(Debug, Clone)]
pub struct VarkLabels {
    pub visual: f64,
    pub auditory: f64,
    pub reading: f64,
    pub kinesthetic: f64,
}

impl VarkLabels {
    /// 从交互记录推断标签
    pub fn infer(record: &AnswerRecordVark) -> Self {
        let has_visual = record.image_view_count > 0
            || record.image_zoom_count > 0
            || record.image_long_press_ms > 500;

        let has_auditory = record.audio_play_count > 0
            || record.audio_replay_count > 0;

        let has_reading = record.dwell_time > 5000
            && record.audio_play_count == 0;

        let has_kinesthetic = record.note_write_count > 0
            || record.response_time.map(|t| t < 2000).unwrap_or(false);

        Self {
            visual: if has_visual { 1.0 } else { 0.0 },
            auditory: if has_auditory { 1.0 } else { 0.0 },
            reading: if has_reading { 1.0 } else { 0.0 },
            kinesthetic: if has_kinesthetic { 1.0 } else { 0.0 },
        }
    }
}
```

---

## 模型持久化

```rust
/// 保存模型到数据库
pub async fn save_vark_model(
    pool: &PgPool,
    user_id: &str,
    classifier: &VarkClassifier,
) -> Result<(), String> {
    let id = format!("vark-{}", user_id);
    let now = chrono::Utc::now().naive_utc();

    sqlx::query(r#"
        INSERT INTO "user_vark_models"
        ("id", "userId", "sampleCount", "isMLEnabled",
         "visualWeights", "auditoryWeights", "readingWeights", "kinestheticWeights",
         "lastTrainedAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
        ON CONFLICT ("userId") DO UPDATE SET
            "sampleCount" = $3,
            "isMLEnabled" = $4,
            "visualWeights" = $5,
            "auditoryWeights" = $6,
            "readingWeights" = $7,
            "kinestheticWeights" = $8,
            "lastTrainedAt" = $9,
            "updatedAt" = $9
    "#)
    .bind(&id)
    .bind(user_id)
    .bind(classifier.sample_count)
    .bind(classifier.is_enabled())
    .bind(&classifier.visual.weights)
    .bind(&classifier.auditory.weights)
    .bind(&classifier.reading.weights)
    .bind(&classifier.kinesthetic.weights)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| format!("保存失败: {e}"))?;

    Ok(())
}

/// 加载模型
pub async fn load_vark_model(
    pool: &PgPool,
    user_id: &str,
) -> Option<VarkClassifier> {
    let row = sqlx::query(r#"
        SELECT "sampleCount", "visualWeights", "auditoryWeights",
               "readingWeights", "kinestheticWeights"
        FROM "user_vark_models"
        WHERE "userId" = $1
    "#)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .ok()??;

    Some(VarkClassifier {
        sample_count: row.try_get("sampleCount").unwrap_or(0),
        visual: BinaryClassifier {
            weights: row.try_get("visualWeights").unwrap_or_default(),
            bias: 0.0,
        },
        auditory: BinaryClassifier {
            weights: row.try_get("auditoryWeights").unwrap_or_default(),
            bias: 0.0,
        },
        reading: BinaryClassifier {
            weights: row.try_get("readingWeights").unwrap_or_default(),
            bias: 0.0,
        },
        kinesthetic: BinaryClassifier {
            weights: row.try_get("kinestheticWeights").unwrap_or_default(),
            bias: 0.0,
        },
        last_calibration: 0,
    })
}
```

---

## 主入口

**文件**: `packages/backend-rust/src/amas/modeling/learning_style.rs`

```rust
/// 计算学习风格（自动选择规则引擎或 ML）
pub async fn compute_learning_style_adaptive(
    pool: &PgPool,
    user_id: &str,
) -> Result<LearningStyleProfile, String> {
    // 尝试加载 ML 模型
    let classifier = load_vark_model(pool, user_id).await;

    match classifier {
        Some(c) if c.is_enabled() => {
            // 使用 ML 模型
            let recent_features = compute_aggregated_features(pool, user_id).await?;
            let scores = c.predict(&recent_features.to_vec());

            Ok(LearningStyleProfile {
                style: scores.dominant_style(),
                style_legacy: scores.legacy_style(),
                confidence: compute_ml_confidence(&scores, c.sample_count),
                sample_count: c.sample_count,
                scores,
                interaction_patterns: compute_interaction_patterns(pool, user_id).await,
                model_type: "ml_sgd",
            })
        }
        _ => {
            // 使用规则引擎
            compute_learning_style_vark(pool, user_id).await
        }
    }
}

/// 每次交互后更新模型
pub async fn update_learning_style_model(
    pool: &PgPool,
    user_id: &str,
    record: &AnswerRecordVark,
) -> Result<(), String> {
    // 加载或创建模型
    let mut classifier = load_vark_model(pool, user_id)
        .await
        .unwrap_or_else(VarkClassifier::new);

    // 提取特征
    let features = VarkFeatures::from_interaction(record);

    // 推断标签
    let labels = VarkLabels::infer(record);

    // 更新模型
    classifier.update(
        &features.to_vec(),
        record.timestamp_ms,
        &labels,
    );

    // 保存模型
    save_vark_model(pool, user_id, &classifier).await
}
```
