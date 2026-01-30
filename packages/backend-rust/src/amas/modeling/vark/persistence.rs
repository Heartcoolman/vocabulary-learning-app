use sqlx::PgPool;

use super::classifier::{BinaryClassifier, VarkClassifier};
use super::features::VarkFeatures;

pub async fn save_vark_model(
    pool: &PgPool,
    user_id: &str,
    classifier: &VarkClassifier,
) -> Result<(), sqlx::Error> {
    let id = format!("vark:{}", user_id);
    let now = chrono::Utc::now();

    sqlx::query(
        r#"
        INSERT INTO "user_vark_models" (
            "id", "userId", "sampleCount", "isMLEnabled",
            "visualWeights", "auditoryWeights", "readingWeights", "kinestheticWeights",
            "visualBias", "auditoryBias", "readingBias", "kinestheticBias",
            "lastCalibration", "lastTrainedAt", "createdAt", "updatedAt"
        ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, $11, $12,
            $13, $14, $15, $16
        )
        ON CONFLICT ("userId") DO UPDATE SET
            "sampleCount" = EXCLUDED."sampleCount",
            "isMLEnabled" = EXCLUDED."isMLEnabled",
            "visualWeights" = EXCLUDED."visualWeights",
            "auditoryWeights" = EXCLUDED."auditoryWeights",
            "readingWeights" = EXCLUDED."readingWeights",
            "kinestheticWeights" = EXCLUDED."kinestheticWeights",
            "visualBias" = EXCLUDED."visualBias",
            "auditoryBias" = EXCLUDED."auditoryBias",
            "readingBias" = EXCLUDED."readingBias",
            "kinestheticBias" = EXCLUDED."kinestheticBias",
            "lastCalibration" = EXCLUDED."lastCalibration",
            "lastTrainedAt" = EXCLUDED."lastTrainedAt",
            "updatedAt" = EXCLUDED."updatedAt"
        "#,
    )
    .bind(&id)
    .bind(user_id)
    .bind(classifier.sample_count as i32)
    .bind(classifier.is_enabled())
    .bind(&classifier.visual.weights)
    .bind(&classifier.auditory.weights)
    .bind(&classifier.reading.weights)
    .bind(&classifier.kinesthetic.weights)
    .bind(classifier.visual.bias)
    .bind(classifier.auditory.bias)
    .bind(classifier.reading.bias)
    .bind(classifier.kinesthetic.bias)
    .bind(classifier.last_calibration as i32)
    .bind(now)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn load_vark_model(
    pool: &PgPool,
    user_id: &str,
) -> Result<Option<VarkClassifier>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT
            "sampleCount", "lastCalibration",
            "visualWeights", "auditoryWeights", "readingWeights", "kinestheticWeights",
            "visualBias", "auditoryBias", "readingBias", "kinestheticBias"
        FROM "user_vark_models"
        WHERE "userId" = $1
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };

    use sqlx::Row;

    let sample_count: i32 = row.try_get("sampleCount").unwrap_or(0);
    let last_calibration: i32 = row.try_get("lastCalibration").unwrap_or(0);

    let visual_weights: Vec<f64> = row
        .try_get("visualWeights")
        .unwrap_or_else(|_| vec![0.0; VarkFeatures::DIM]);
    let auditory_weights: Vec<f64> = row
        .try_get("auditoryWeights")
        .unwrap_or_else(|_| vec![0.0; VarkFeatures::DIM]);
    let reading_weights: Vec<f64> = row
        .try_get("readingWeights")
        .unwrap_or_else(|_| vec![0.0; VarkFeatures::DIM]);
    let kinesthetic_weights: Vec<f64> = row
        .try_get("kinestheticWeights")
        .unwrap_or_else(|_| vec![0.0; VarkFeatures::DIM]);

    let visual_bias: f64 = row.try_get("visualBias").unwrap_or(0.0);
    let auditory_bias: f64 = row.try_get("auditoryBias").unwrap_or(0.0);
    let reading_bias: f64 = row.try_get("readingBias").unwrap_or(0.0);
    let kinesthetic_bias: f64 = row.try_get("kinestheticBias").unwrap_or(0.0);

    let classifier = VarkClassifier {
        visual: BinaryClassifier {
            weights: pad_or_truncate(visual_weights, VarkFeatures::DIM),
            bias: visual_bias,
        },
        auditory: BinaryClassifier {
            weights: pad_or_truncate(auditory_weights, VarkFeatures::DIM),
            bias: auditory_bias,
        },
        reading: BinaryClassifier {
            weights: pad_or_truncate(reading_weights, VarkFeatures::DIM),
            bias: reading_bias,
        },
        kinesthetic: BinaryClassifier {
            weights: pad_or_truncate(kinesthetic_weights, VarkFeatures::DIM),
            bias: kinesthetic_bias,
        },
        sample_count: sample_count as i64,
        last_calibration: last_calibration as i64,
    };

    Ok(Some(classifier))
}

fn pad_or_truncate(mut v: Vec<f64>, len: usize) -> Vec<f64> {
    v.resize(len, 0.0);
    v
}
