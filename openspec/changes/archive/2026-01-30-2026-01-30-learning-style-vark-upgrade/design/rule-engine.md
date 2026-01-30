# Spec: VARK Rule Engine

## Overview

VARK 四维规则引擎，基于用户交互数据计算学习风格分数。

---

## 实现位置

**文件**: `packages/backend-rust/src/services/user_profile.rs`

修改现有的 `compute_learning_style` 函数。

---

## Reading 维度计算

### 信号来源

复用 `dwellTime` 字段推断阅读行为：

```rust
fn compute_reading_score(
    avg_dwell_time: f64,
    audio_play_count: i64,
) -> f64 {
    // 当 dwellTime > 5000ms 时开始计算 reading 分数
    if avg_dwell_time <= 5000.0 {
        return 0.0;
    }

    // 基础分数：(dwellTime - 5000) / 10000，上限 1.0
    let base_score = ((avg_dwell_time - 5000.0) / 10000.0).min(1.0);

    // 音频折扣因子：有音频播放时减半
    let audio_factor = if audio_play_count > 0 { 0.5 } else { 1.0 };

    base_score * audio_factor
}
```

### 约束

| 约束 ID | 描述                                        |
| ------- | ------------------------------------------- |
| R1      | `dwellTime <= 5000ms` 时，reading_score = 0 |
| R2      | reading_score 上限为 1.0                    |
| R3      | 有音频播放时，reading_score 减半            |

---

## 四维分数计算

```rust
pub async fn compute_learning_style_vark(
    pool: &PgPool,
    user_id: &str,
) -> Result<LearningStyleProfile, String> {
    let interactions = fetch_records_for_learning_style(pool, user_id).await?;
    let tracking = fetch_tracking_stats(pool, user_id).await;
    let vark_stats = fetch_vark_stats(pool, user_id).await;
    let sample_count = interactions.len() as i64;

    // 冷启动：样本不足时返回均匀分布
    if sample_count < 20 {
        return Ok(LearningStyleProfile {
            style: "multimodal",
            style_legacy: "mixed",
            confidence: 0.3,
            sample_count,
            scores: LearningStyleScores {
                visual: 0.25,
                auditory: 0.25,
                reading: 0.25,
                kinesthetic: 0.25,
            },
            ..default_profile()
        });
    }

    // 1. 计算各维度原始分数
    let visual_raw = compute_visual_score_vark(&vark_stats, &interactions);
    let auditory_raw = compute_auditory_score_vark(&vark_stats, &tracking);
    let reading_raw = compute_reading_score(
        avg_dwell_time(&interactions),
        vark_stats.total_audio_play_count,
    );
    let kinesthetic_raw = compute_kinesthetic_score_vark(&interactions, &tracking);

    // 2. 归一化
    let mut scores = LearningStyleScores {
        visual: visual_raw,
        auditory: auditory_raw,
        reading: reading_raw,
        kinesthetic: kinesthetic_raw,
    };
    scores.normalize();

    // 3. 判定主导风格
    let style = scores.dominant_style();
    let style_legacy = scores.legacy_style();

    // 4. 计算置信度
    let confidence = compute_confidence(&scores, sample_count);

    Ok(LearningStyleProfile {
        style,
        style_legacy,
        confidence,
        sample_count,
        scores,
        interaction_patterns: compute_interaction_patterns(&interactions, &tracking),
        model_type: "rule_engine",
    })
}
```

---

## Visual 维度计算

```rust
fn compute_visual_score_vark(
    vark_stats: &VarkStats,
    interactions: &[AnswerRecordInteraction],
) -> f64 {
    // 基于新字段
    let img_view_score = (vark_stats.total_image_view as f64 / 50.0).min(0.4);
    let img_zoom_score = (vark_stats.total_image_zoom as f64 / 20.0).min(0.3);
    let img_press_score = (vark_stats.total_image_press_ms as f64 / 30000.0).min(0.3);

    // 兼容旧逻辑：基于 dwellTime
    let avg_dwell = avg_dwell_time(interactions);
    let dwell_score = (avg_dwell / 5000.0).min(1.0) * 0.2;

    (img_view_score + img_zoom_score + img_press_score + dwell_score).min(1.0)
}
```

---

## Auditory 维度计算

```rust
fn compute_auditory_score_vark(
    vark_stats: &VarkStats,
    tracking: &Option<TrackingStats>,
) -> f64 {
    // 基于新字段
    let play_score = (vark_stats.total_audio_play as f64 / 50.0).min(0.35);
    let replay_score = (vark_stats.total_audio_replay as f64 / 30.0).min(0.25);
    let speed_score = if vark_stats.has_speed_adjust { 0.15 } else { 0.0 };

    // 兼容旧逻辑：pronunciationClicks
    let pronunciation_score = match tracking {
        Some(t) if t.total_interactions >= 10 => {
            let ratio = t.pronunciation_clicks as f64 / t.total_interactions as f64;
            (ratio / 0.25).min(1.0) * 0.25
        }
        _ => 0.0,
    };

    (play_score + replay_score + speed_score + pronunciation_score).min(1.0)
}
```

---

## Kinesthetic 维度计算

```rust
fn compute_kinesthetic_score_vark(
    interactions: &[AnswerRecordInteraction],
    tracking: &Option<TrackingStats>,
) -> f64 {
    let avg_response = avg_response_time(interactions);
    let response_variance = response_time_variance(interactions, avg_response);

    // 快速响应得分
    let speed_score = if avg_response < 2000.0 {
        0.35
    } else if avg_response < 3000.0 {
        0.25
    } else {
        0.15
    };

    // 响应时间变异性得分
    let cv = if avg_response > 0.0 {
        response_variance.sqrt() / avg_response
    } else {
        0.0
    };
    let variability_score = if cv > 0.5 { 0.2 } else { 0.1 };

    // 页面切换得分
    let switch_score = match tracking {
        Some(t) if t.total_interactions >= 10 => {
            let ratio = t.page_switch_count as f64 / t.total_interactions as f64;
            (ratio / 0.3).min(1.0) * 0.2
        }
        _ => 0.0,
    };

    // 笔记得分（基于新字段）
    let note_score = match tracking {
        Some(t) if t.total_writing_actions > 0 => {
            (t.total_writing_actions as f64 / 20.0).min(0.25)
        }
        _ => 0.0,
    };

    (speed_score + variability_score + switch_score + note_score).min(1.0)
}
```

---

## multimodal 判定

```rust
impl LearningStyleScores {
    pub fn is_multimodal(&self) -> bool {
        // 基于方差判定
        // 四维归一化后，如果分布均匀，方差应接近 0
        // 阈值：var < 0.01
        self.variance() < 0.01
    }

    pub fn variance(&self) -> f64 {
        // 均值为 0.25（四维归一化后）
        let mean = 0.25;
        let sum_sq = (self.visual - mean).powi(2)
            + (self.auditory - mean).powi(2)
            + (self.reading - mean).powi(2)
            + (self.kinesthetic - mean).powi(2);
        sum_sq / 4.0
    }
}
```

---

## 置信度计算

```rust
fn compute_confidence(scores: &LearningStyleScores, sample_count: i64) -> f64 {
    // 样本置信度：sample_count / 100，上限 0.5
    let sample_confidence = (sample_count as f64 / 100.0).min(0.5);

    // 模型置信度：最高分与次高分的差值
    let mut sorted = [scores.visual, scores.auditory, scores.reading, scores.kinesthetic];
    sorted.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
    let model_confidence = sorted[0] - sorted[1];

    // 总置信度：两者之和，上限 0.95
    (sample_confidence + model_confidence).min(0.95)
}
```

---

## 数据查询函数

```rust
struct VarkStats {
    total_image_view: i64,
    total_image_zoom: i64,
    total_image_press_ms: i64,
    total_audio_play: i64,
    total_audio_replay: i64,
    has_speed_adjust: bool,
    total_reading_ms: i64,
    total_note_count: i64,
}

async fn fetch_vark_stats(pool: &PgPool, user_id: &str) -> VarkStats {
    let row = sqlx::query(r#"
        SELECT
            COALESCE(SUM("imageViewCount"), 0) as total_image_view,
            COALESCE(SUM("imageZoomCount"), 0) as total_image_zoom,
            COALESCE(SUM("imageLongPressMs"), 0) as total_image_press,
            COALESCE(SUM("audioPlayCount"), 0) as total_audio_play,
            COALESCE(SUM("audioReplayCount"), 0) as total_audio_replay,
            COALESCE(bool_or("audioSpeedAdjust"), false) as has_speed_adjust,
            COALESCE(SUM("definitionReadMs") + SUM("exampleReadMs"), 0) as total_reading_ms,
            COALESCE(SUM("noteWriteCount"), 0) as total_note_count
        FROM "answer_records"
        WHERE "userId" = $1
          AND "timestamp" > NOW() - INTERVAL '30 days'
    "#)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    match row {
        Some(r) => VarkStats {
            total_image_view: r.try_get("total_image_view").unwrap_or(0),
            total_image_zoom: r.try_get("total_image_zoom").unwrap_or(0),
            total_image_press_ms: r.try_get("total_image_press").unwrap_or(0),
            total_audio_play: r.try_get("total_audio_play").unwrap_or(0),
            total_audio_replay: r.try_get("total_audio_replay").unwrap_or(0),
            has_speed_adjust: r.try_get("has_speed_adjust").unwrap_or(false),
            total_reading_ms: r.try_get("total_reading_ms").unwrap_or(0),
            total_note_count: r.try_get("total_note_count").unwrap_or(0),
        },
        None => VarkStats::default(),
    }
}
```
