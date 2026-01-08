use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MorphemeType {
    Prefix,
    Root,
    Suffix,
}

impl MorphemeType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Prefix => "prefix",
            Self::Root => "root",
            Self::Suffix => "suffix",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "prefix" => Some(Self::Prefix),
            "root" => Some(Self::Root),
            "suffix" => Some(Self::Suffix),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Morpheme {
    pub id: String,
    pub surface: String,
    #[serde(rename = "type")]
    pub morpheme_type: MorphemeType,
    pub meaning: Option<String>,
    pub meaning_zh: Option<String>,
    pub language: String,
    pub etymology: Option<String>,
    pub aliases: Vec<String>,
    pub frequency: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordMorpheme {
    pub word_id: String,
    pub morpheme_id: String,
    pub role: MorphemeType,
    pub position: i32,
    pub weight: f64,
    pub confidence: f64,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordPart {
    pub part: String,
    #[serde(rename = "type")]
    pub part_type: MorphemeType,
    pub meaning: Option<String>,
    pub meaning_zh: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordEtymology {
    pub word_id: String,
    pub decomposition: Vec<WordPart>,
    pub roots: Vec<Morpheme>,
    pub confidence: f64,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelatedWord {
    pub id: String,
    pub spelling: String,
    pub meaning: Option<String>,
    pub shared_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordFamily {
    pub root: Morpheme,
    pub words: Vec<RelatedWord>,
    pub total_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserMorphemeState {
    pub id: String,
    pub user_id: String,
    pub morpheme_id: String,
    pub mastery_level: f64,
    pub stability: f64,
    pub difficulty: f64,
    pub exposure_count: i32,
    pub correct_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RootFeatures {
    pub root_count: i32,
    pub known_root_ratio: f64,
    pub avg_root_mastery: f64,
    pub max_root_mastery: f64,
}

pub async fn get_or_create_morpheme(
    pool: &PgPool,
    surface: &str,
    morpheme_type: MorphemeType,
    meaning: Option<&str>,
    meaning_zh: Option<&str>,
    language: &str,
) -> Result<Morpheme, sqlx::Error> {
    let existing = sqlx::query(
        r#"SELECT "id", "surface", "type", "meaning", "meaningZh", "language", "etymology", "aliases", "frequency"
           FROM "morphemes" WHERE "surface" = $1 AND "type" = $2 AND "language" = $3"#
    )
    .bind(surface)
    .bind(morpheme_type.as_str())
    .bind(language)
    .fetch_optional(pool)
    .await?;

    if let Some(row) = existing {
        return Ok(Morpheme {
            id: row.get("id"),
            surface: row.get("surface"),
            morpheme_type,
            meaning: row.get("meaning"),
            meaning_zh: row.get("meaningZh"),
            language: row.get("language"),
            etymology: row.get("etymology"),
            aliases: row.get::<Vec<String>, _>("aliases"),
            frequency: row.get("frequency"),
        });
    }

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        r#"INSERT INTO "morphemes" ("id", "surface", "type", "meaning", "meaningZh", "language")
           VALUES ($1, $2, $3, $4, $5, $6)"#,
    )
    .bind(&id)
    .bind(surface)
    .bind(morpheme_type.as_str())
    .bind(meaning)
    .bind(meaning_zh)
    .bind(language)
    .execute(pool)
    .await?;

    Ok(Morpheme {
        id,
        surface: surface.to_string(),
        morpheme_type,
        meaning: meaning.map(String::from),
        meaning_zh: meaning_zh.map(String::from),
        language: language.to_string(),
        etymology: None,
        aliases: vec![],
        frequency: 0,
    })
}

pub async fn link_word_morpheme(
    pool: &PgPool,
    word_id: &str,
    morpheme_id: &str,
    role: MorphemeType,
    position: i32,
    confidence: f64,
    source: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "word_morphemes" ("wordId", "morphemeId", "role", "position", "confidence", "source")
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT ("wordId", "morphemeId", "role", "position") DO UPDATE
           SET "confidence" = EXCLUDED."confidence", "source" = EXCLUDED."source""#
    )
    .bind(word_id)
    .bind(morpheme_id)
    .bind(role.as_str())
    .bind(position)
    .bind(confidence)
    .bind(source)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_word_etymology(
    pool: &PgPool,
    word_id: &str,
) -> Result<Option<WordEtymology>, sqlx::Error> {
    let rows = sqlx::query(
        r#"SELECT wm."role", wm."position", wm."confidence", wm."source",
                  m."id", m."surface", m."type", m."meaning", m."meaningZh", m."language", m."etymology", m."aliases", m."frequency"
           FROM "word_morphemes" wm
           JOIN "morphemes" m ON m."id" = wm."morphemeId"
           WHERE wm."wordId" = $1
           ORDER BY wm."position""#
    )
    .bind(word_id)
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        return Ok(None);
    }

    let mut decomposition = Vec::new();
    let mut roots = Vec::new();
    let mut total_confidence = 0.0;
    let mut source = String::from("unknown");

    for row in &rows {
        let morpheme_type_str: String = row.get("type");
        let morpheme_type =
            MorphemeType::from_str(&morpheme_type_str).unwrap_or(MorphemeType::Root);
        let surface: String = row.get("surface");
        let meaning: Option<String> = row.get("meaning");
        let meaning_zh: Option<String> = row.get("meaningZh");
        let conf: f64 = row.get("confidence");
        let src: String = row.get("source");

        decomposition.push(WordPart {
            part: surface.clone(),
            part_type: morpheme_type,
            meaning: meaning.clone(),
            meaning_zh: meaning_zh.clone(),
        });

        if morpheme_type == MorphemeType::Root {
            roots.push(Morpheme {
                id: row.get("id"),
                surface,
                morpheme_type,
                meaning,
                meaning_zh,
                language: row.get("language"),
                etymology: row.get("etymology"),
                aliases: row.get::<Vec<String>, _>("aliases"),
                frequency: row.get("frequency"),
            });
        }

        total_confidence += conf;
        source = src;
    }

    let avg_confidence = if !rows.is_empty() {
        total_confidence / rows.len() as f64
    } else {
        0.0
    };

    Ok(Some(WordEtymology {
        word_id: word_id.to_string(),
        decomposition,
        roots,
        confidence: avg_confidence,
        source,
    }))
}

pub async fn get_word_family(
    pool: &PgPool,
    morpheme_id: &str,
    limit: i32,
) -> Result<WordFamily, sqlx::Error> {
    let morpheme_row = sqlx::query(
        r#"SELECT "id", "surface", "type", "meaning", "meaningZh", "language", "etymology", "aliases", "frequency"
           FROM "morphemes" WHERE "id" = $1"#
    )
    .bind(morpheme_id)
    .fetch_one(pool)
    .await?;

    let morpheme_type_str: String = morpheme_row.get("type");
    let root = Morpheme {
        id: morpheme_row.get("id"),
        surface: morpheme_row.get("surface"),
        morpheme_type: MorphemeType::from_str(&morpheme_type_str).unwrap_or(MorphemeType::Root),
        meaning: morpheme_row.get("meaning"),
        meaning_zh: morpheme_row.get("meaningZh"),
        language: morpheme_row.get("language"),
        etymology: morpheme_row.get("etymology"),
        aliases: morpheme_row.get::<Vec<String>, _>("aliases"),
        frequency: morpheme_row.get("frequency"),
    };

    let word_rows = sqlx::query(
        r#"SELECT w."id", w."spelling", w."meanings"[1] AS meaning
           FROM "word_morphemes" wm
           JOIN "words" w ON w."id" = wm."wordId"
           WHERE wm."morphemeId" = $1
           ORDER BY w."frequency" DESC NULLS LAST
           LIMIT $2"#,
    )
    .bind(morpheme_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    let words: Vec<RelatedWord> = word_rows
        .iter()
        .map(|r| RelatedWord {
            id: r.get("id"),
            spelling: r.get("spelling"),
            meaning: r.get("meaning"),
            shared_root: root.surface.clone(),
        })
        .collect();

    let count_row =
        sqlx::query(r#"SELECT COUNT(*) as cnt FROM "word_morphemes" WHERE "morphemeId" = $1"#)
            .bind(morpheme_id)
            .fetch_one(pool)
            .await?;
    let total_count: i64 = count_row.get("cnt");

    Ok(WordFamily {
        root,
        words,
        total_count: total_count as i32,
    })
}

pub async fn compute_root_features(
    pool: &PgPool,
    user_id: &str,
    word_id: &str,
) -> Result<RootFeatures, sqlx::Error> {
    let row = sqlx::query(
        r#"
        WITH word_roots AS (
            SELECT wm."morphemeId"
            FROM "word_morphemes" wm
            WHERE wm."wordId" = $1 AND wm."role" = 'root'
        ),
        related_words AS (
            SELECT DISTINCT wm2."wordId"
            FROM "word_morphemes" wm2
            JOIN word_roots wr ON wr."morphemeId" = wm2."morphemeId"
            WHERE wm2."wordId" != $1
        ),
        user_mastery AS (
            SELECT
                wls."masteryLevel",
                CASE WHEN wls."masteryLevel" >= 3.0 THEN 1.0 ELSE 0.0 END AS is_known
            FROM related_words rw
            JOIN "word_learning_states" wls ON wls."wordId" = rw."wordId" AND wls."userId" = $2
        )
        SELECT
            (SELECT COUNT(*) FROM word_roots)::int AS root_count,
            COALESCE(AVG(um."masteryLevel"), 0.0) AS avg_mastery,
            COALESCE(MAX(um."masteryLevel"), 0.0) AS max_mastery,
            COALESCE(AVG(um.is_known), 0.0) AS known_ratio
        FROM (SELECT 1) AS seed
        LEFT JOIN user_mastery um ON true
        "#,
    )
    .bind(word_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(RootFeatures {
        root_count: row.try_get::<i32, _>("root_count").unwrap_or(0),
        avg_root_mastery: row.try_get::<f64, _>("avg_mastery").unwrap_or(0.0),
        max_root_mastery: row.try_get::<f64, _>("max_mastery").unwrap_or(0.0),
        known_root_ratio: row.try_get::<f64, _>("known_ratio").unwrap_or(0.0),
    })
}

pub async fn update_user_morpheme_exposure(
    pool: &PgPool,
    user_id: &str,
    word_id: &str,
    is_correct: bool,
) -> Result<(), sqlx::Error> {
    let morpheme_ids: Vec<String> = sqlx::query_scalar(
        r#"SELECT "morphemeId" FROM "word_morphemes" WHERE "wordId" = $1 AND "role" = 'root'"#,
    )
    .bind(word_id)
    .fetch_all(pool)
    .await?;

    for morpheme_id in morpheme_ids {
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"INSERT INTO "user_morpheme_states" ("id", "userId", "morphemeId", "exposureCount", "correctCount", "lastSeenAt")
               VALUES ($1, $2, $3, 1, $4, NOW())
               ON CONFLICT ("userId", "morphemeId") DO UPDATE SET
                   "exposureCount" = "user_morpheme_states"."exposureCount" + 1,
                   "correctCount" = "user_morpheme_states"."correctCount" + $4,
                   "lastSeenAt" = NOW(),
                   "updatedAt" = NOW()"#
        )
        .bind(&id)
        .bind(user_id)
        .bind(&morpheme_id)
        .bind(if is_correct { 1 } else { 0 })
        .execute(pool)
        .await?;
    }

    Ok(())
}

pub async fn recalculate_morpheme_mastery(
    pool: &PgPool,
    user_id: &str,
    morpheme_id: &str,
) -> Result<f64, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT
            COALESCE(AVG(wls."masteryLevel"), 0.0) AS avg_mastery,
            COUNT(CASE WHEN wls."masteryLevel" >= 3.0 THEN 1 END)::float / NULLIF(COUNT(*), 0) AS mastery_ratio
        FROM "word_morphemes" wm
        JOIN "word_learning_states" wls ON wls."wordId" = wm."wordId" AND wls."userId" = $1
        WHERE wm."morphemeId" = $2
        "#
    )
    .bind(user_id)
    .bind(morpheme_id)
    .fetch_one(pool)
    .await?;

    let avg_mastery: f64 = row.try_get("avg_mastery").unwrap_or(0.0);
    let mastery_ratio: f64 = row.try_get("mastery_ratio").unwrap_or(0.0);
    let combined_mastery = avg_mastery * 0.7 + mastery_ratio * 5.0 * 0.3;

    sqlx::query(
        r#"UPDATE "user_morpheme_states" SET "masteryLevel" = $1, "updatedAt" = NOW()
           WHERE "userId" = $2 AND "morphemeId" = $3"#,
    )
    .bind(combined_mastery)
    .bind(user_id)
    .bind(morpheme_id)
    .execute(pool)
    .await?;

    Ok(combined_mastery)
}

pub async fn increment_morpheme_frequency(
    pool: &PgPool,
    morpheme_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(r#"UPDATE "morphemes" SET "frequency" = "frequency" + 1 WHERE "id" = $1"#)
        .bind(morpheme_id)
        .execute(pool)
        .await?;
    Ok(())
}
