//! 数据模型定义
//!
//! 定义 SQLite 存储所需的所有数据结构，以及与数据库交互的方法。

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, Result as SqliteResult, Row};
use serde::{Deserialize, Serialize};

use crate::storage::StorageResult;

// ============================================================
// WordBook - 词书元信息
// ============================================================

/// 词书元信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordBook {
    /// 词书唯一标识 (UUID)
    pub id: String,
    /// 词书名称
    pub name: String,
    /// 词书描述
    pub description: Option<String>,
    /// 封面图片 URL
    pub cover_url: Option<String>,
    /// 单词总数
    pub word_count: i32,
    /// 分类 (如: CET4, CET6, IELTS)
    pub category: Option<String>,
    /// 难度等级 (1-5)
    pub difficulty_level: i32,
    /// 是否为默认词书
    pub is_default: bool,
    /// 是否已下载到本地
    pub is_downloaded: bool,
    /// 数据版本号
    pub version: i32,
    /// 创建时间
    pub created_at: DateTime<Utc>,
    /// 更新时间
    pub updated_at: DateTime<Utc>,
    /// 最后同步时间
    pub synced_at: Option<DateTime<Utc>>,
    /// 云端版本号
    pub cloud_version: i32,
}

impl WordBook {
    /// 从数据库行解析
    pub fn from_row(row: &Row) -> SqliteResult<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            description: row.get("description")?,
            cover_url: row.get("cover_url")?,
            word_count: row.get("word_count")?,
            category: row.get("category")?,
            difficulty_level: row.get("difficulty_level")?,
            is_default: row.get::<_, i32>("is_default")? != 0,
            is_downloaded: row.get::<_, i32>("is_downloaded")? != 0,
            version: row.get("version")?,
            created_at: parse_datetime(row.get::<_, String>("created_at")?),
            updated_at: parse_datetime(row.get::<_, String>("updated_at")?),
            synced_at: row
                .get::<_, Option<String>>("synced_at")?
                .map(parse_datetime),
            cloud_version: row.get("cloud_version")?,
        })
    }

    /// 插入到数据库
    pub fn insert(&self, conn: &Connection) -> StorageResult<()> {
        conn.execute(
            r#"
            INSERT INTO word_book (
                id, name, description, cover_url, word_count, category,
                difficulty_level, is_default, is_downloaded, version,
                created_at, updated_at, synced_at, cloud_version
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
            )
            "#,
            params![
                self.id,
                self.name,
                self.description,
                self.cover_url,
                self.word_count,
                self.category,
                self.difficulty_level,
                self.is_default as i32,
                self.is_downloaded as i32,
                self.version,
                format_datetime(self.created_at),
                format_datetime(self.updated_at),
                self.synced_at.map(format_datetime),
                self.cloud_version,
            ],
        )?;
        Ok(())
    }

    /// 更新数据库记录
    pub fn update(&self, conn: &Connection) -> StorageResult<()> {
        conn.execute(
            r#"
            UPDATE word_book SET
                name = ?2, description = ?3, cover_url = ?4,
                word_count = ?5, category = ?6, difficulty_level = ?7,
                is_default = ?8, is_downloaded = ?9, version = ?10,
                synced_at = ?11, cloud_version = ?12
            WHERE id = ?1
            "#,
            params![
                self.id,
                self.name,
                self.description,
                self.cover_url,
                self.word_count,
                self.category,
                self.difficulty_level,
                self.is_default as i32,
                self.is_downloaded as i32,
                self.version,
                self.synced_at.map(format_datetime),
                self.cloud_version,
            ],
        )?;
        Ok(())
    }
}

// ============================================================
// Word - 单词数据
// ============================================================

/// 单词数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Word {
    /// 单词唯一标识 (UUID)
    pub id: String,
    /// 所属词书 ID
    pub word_book_id: String,
    /// 单词拼写
    pub word: String,
    /// 英式音标
    pub phonetic_uk: Option<String>,
    /// 美式音标
    pub phonetic_us: Option<String>,
    /// 英式发音 URL
    pub audio_uk_url: Option<String>,
    /// 美式发音 URL
    pub audio_us_url: Option<String>,
    /// 中文释义 (JSON 格式)
    pub definition: String,
    /// 英文释义
    pub definition_en: Option<String>,
    /// 例句 (JSON 数组)
    pub example_sentences: Option<String>,
    /// 词形变化 (JSON 对象)
    pub word_forms: Option<String>,
    /// 同义词 (JSON 数组)
    pub synonyms: Option<String>,
    /// 反义词 (JSON 数组)
    pub antonyms: Option<String>,
    /// 标签 (JSON 数组)
    pub tags: Option<String>,
    /// 词频排名
    pub frequency_rank: Option<i32>,
    /// 难度分数 (0-1)
    pub difficulty_score: f64,
    /// 在词书中的排序
    pub sort_order: i32,
    /// 数据版本号
    pub version: i32,
    /// 创建时间
    pub created_at: DateTime<Utc>,
    /// 更新时间
    pub updated_at: DateTime<Utc>,
    /// 最后同步时间
    pub synced_at: Option<DateTime<Utc>>,
    /// 云端版本号
    pub cloud_version: i32,
}

impl Word {
    /// 从数据库行解析
    pub fn from_row(row: &Row) -> SqliteResult<Self> {
        Ok(Self {
            id: row.get("id")?,
            word_book_id: row.get("word_book_id")?,
            word: row.get("word")?,
            phonetic_uk: row.get("phonetic_uk")?,
            phonetic_us: row.get("phonetic_us")?,
            audio_uk_url: row.get("audio_uk_url")?,
            audio_us_url: row.get("audio_us_url")?,
            definition: row.get("definition")?,
            definition_en: row.get("definition_en")?,
            example_sentences: row.get("example_sentences")?,
            word_forms: row.get("word_forms")?,
            synonyms: row.get("synonyms")?,
            antonyms: row.get("antonyms")?,
            tags: row.get("tags")?,
            frequency_rank: row.get("frequency_rank")?,
            difficulty_score: row.get("difficulty_score")?,
            sort_order: row.get("sort_order")?,
            version: row.get("version")?,
            created_at: parse_datetime(row.get::<_, String>("created_at")?),
            updated_at: parse_datetime(row.get::<_, String>("updated_at")?),
            synced_at: row
                .get::<_, Option<String>>("synced_at")?
                .map(parse_datetime),
            cloud_version: row.get("cloud_version")?,
        })
    }

    /// 插入到数据库
    pub fn insert(&self, conn: &Connection) -> StorageResult<()> {
        conn.execute(
            r#"
            INSERT INTO word (
                id, word_book_id, word, phonetic_uk, phonetic_us,
                audio_uk_url, audio_us_url, definition, definition_en,
                example_sentences, word_forms, synonyms, antonyms, tags,
                frequency_rank, difficulty_score, sort_order, version,
                created_at, updated_at, synced_at, cloud_version
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22
            )
            "#,
            params![
                self.id,
                self.word_book_id,
                self.word,
                self.phonetic_uk,
                self.phonetic_us,
                self.audio_uk_url,
                self.audio_us_url,
                self.definition,
                self.definition_en,
                self.example_sentences,
                self.word_forms,
                self.synonyms,
                self.antonyms,
                self.tags,
                self.frequency_rank,
                self.difficulty_score,
                self.sort_order,
                self.version,
                format_datetime(self.created_at),
                format_datetime(self.updated_at),
                self.synced_at.map(format_datetime),
                self.cloud_version,
            ],
        )?;
        Ok(())
    }
}

// ============================================================
// WordLearningState - 核心学习状态
// ============================================================

/// 单词学习状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordLearningState {
    /// 状态记录唯一标识 (UUID)
    pub id: String,
    /// 用户 ID
    pub user_id: String,
    /// 单词 ID
    pub word_id: String,
    /// 词书 ID
    pub word_book_id: String,

    // FSRS 算法核心参数
    /// 稳定性 (S)
    pub stability: f64,
    /// 难度 (D)
    pub difficulty: f64,
    /// 已过天数
    pub elapsed_days: f64,
    /// 计划间隔天数
    pub scheduled_days: f64,
    /// 复习次数
    pub reps: i32,
    /// 遗忘次数
    pub lapses: i32,
    /// 状态: 0=New, 1=Learning, 2=Review, 3=Relearning
    pub state: i32,

    // 学习进度
    /// 掌握等级 (0-5)
    pub mastery_level: i32,
    /// 记忆保持率 (0-1)
    pub retention_score: f64,
    /// 是否已掌握
    pub is_mastered: bool,
    /// 是否标记为难词
    pub is_difficult: bool,
    /// 是否收藏
    pub is_favorite: bool,

    // 时间记录
    /// 首次学习时间
    pub first_learned_at: Option<DateTime<Utc>>,
    /// 最后复习时间
    pub last_reviewed_at: Option<DateTime<Utc>>,
    /// 下次复习时间
    pub next_review_at: Option<DateTime<Utc>>,
    /// 到期日期
    pub due_date: Option<String>,

    // 统计数据
    /// 总复习次数
    pub total_reviews: i32,
    /// 正确次数
    pub correct_count: i32,
    /// 错误次数
    pub wrong_count: i32,
    /// 总花费时间(毫秒)
    pub total_time_spent: i64,
    /// 平均响应时间(毫秒)
    pub avg_response_time: i32,

    // 同步相关
    /// 本地版本号
    pub version: i32,
    /// 云端版本号
    pub cloud_version: i32,
    /// 是否有未同步的修改
    pub is_dirty: bool,
    /// 创建时间
    pub created_at: DateTime<Utc>,
    /// 更新时间
    pub updated_at: DateTime<Utc>,
    /// 最后同步时间
    pub synced_at: Option<DateTime<Utc>>,
}

impl WordLearningState {
    /// 创建新的学习状态
    pub fn new(user_id: String, word_id: String, word_book_id: String) -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            user_id,
            word_id,
            word_book_id,
            stability: 0.0,
            difficulty: 0.0,
            elapsed_days: 0.0,
            scheduled_days: 0.0,
            reps: 0,
            lapses: 0,
            state: 0, // New
            mastery_level: 0,
            retention_score: 0.0,
            is_mastered: false,
            is_difficult: false,
            is_favorite: false,
            first_learned_at: None,
            last_reviewed_at: None,
            next_review_at: None,
            due_date: None,
            total_reviews: 0,
            correct_count: 0,
            wrong_count: 0,
            total_time_spent: 0,
            avg_response_time: 0,
            version: 1,
            cloud_version: 0,
            is_dirty: true,
            created_at: now,
            updated_at: now,
            synced_at: None,
        }
    }

    /// 从数据库行解析
    pub fn from_row(row: &Row) -> SqliteResult<Self> {
        Ok(Self {
            id: row.get("id")?,
            user_id: row.get("user_id")?,
            word_id: row.get("word_id")?,
            word_book_id: row.get("word_book_id")?,
            stability: row.get("stability")?,
            difficulty: row.get("difficulty")?,
            elapsed_days: row.get("elapsed_days")?,
            scheduled_days: row.get("scheduled_days")?,
            reps: row.get("reps")?,
            lapses: row.get("lapses")?,
            state: row.get("state")?,
            mastery_level: row.get("mastery_level")?,
            retention_score: row.get("retention_score")?,
            is_mastered: row.get::<_, i32>("is_mastered")? != 0,
            is_difficult: row.get::<_, i32>("is_difficult")? != 0,
            is_favorite: row.get::<_, i32>("is_favorite")? != 0,
            first_learned_at: row
                .get::<_, Option<String>>("first_learned_at")?
                .map(parse_datetime),
            last_reviewed_at: row
                .get::<_, Option<String>>("last_reviewed_at")?
                .map(parse_datetime),
            next_review_at: row
                .get::<_, Option<String>>("next_review_at")?
                .map(parse_datetime),
            due_date: row.get("due_date")?,
            total_reviews: row.get("total_reviews")?,
            correct_count: row.get("correct_count")?,
            wrong_count: row.get("wrong_count")?,
            total_time_spent: row.get("total_time_spent")?,
            avg_response_time: row.get("avg_response_time")?,
            version: row.get("version")?,
            cloud_version: row.get("cloud_version")?,
            is_dirty: row.get::<_, i32>("is_dirty")? != 0,
            created_at: parse_datetime(row.get::<_, String>("created_at")?),
            updated_at: parse_datetime(row.get::<_, String>("updated_at")?),
            synced_at: row
                .get::<_, Option<String>>("synced_at")?
                .map(parse_datetime),
        })
    }

    /// 插入或更新 (upsert)
    pub fn upsert(&self, conn: &Connection) -> StorageResult<()> {
        conn.execute(
            r#"
            INSERT INTO word_learning_state (
                id, user_id, word_id, word_book_id,
                stability, difficulty, elapsed_days, scheduled_days,
                reps, lapses, state,
                mastery_level, retention_score, is_mastered, is_difficult, is_favorite,
                first_learned_at, last_reviewed_at, next_review_at, due_date,
                total_reviews, correct_count, wrong_count, total_time_spent, avg_response_time,
                version, cloud_version, is_dirty, created_at, updated_at, synced_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
                ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25,
                ?26, ?27, ?28, ?29, ?30, ?31
            )
            ON CONFLICT(user_id, word_id) DO UPDATE SET
                stability = excluded.stability,
                difficulty = excluded.difficulty,
                elapsed_days = excluded.elapsed_days,
                scheduled_days = excluded.scheduled_days,
                reps = excluded.reps,
                lapses = excluded.lapses,
                state = excluded.state,
                mastery_level = excluded.mastery_level,
                retention_score = excluded.retention_score,
                is_mastered = excluded.is_mastered,
                is_difficult = excluded.is_difficult,
                is_favorite = excluded.is_favorite,
                first_learned_at = excluded.first_learned_at,
                last_reviewed_at = excluded.last_reviewed_at,
                next_review_at = excluded.next_review_at,
                due_date = excluded.due_date,
                total_reviews = excluded.total_reviews,
                correct_count = excluded.correct_count,
                wrong_count = excluded.wrong_count,
                total_time_spent = excluded.total_time_spent,
                avg_response_time = excluded.avg_response_time,
                version = excluded.version,
                cloud_version = excluded.cloud_version,
                is_dirty = excluded.is_dirty,
                updated_at = excluded.updated_at,
                synced_at = excluded.synced_at
            "#,
            params![
                self.id,
                self.user_id,
                self.word_id,
                self.word_book_id,
                self.stability,
                self.difficulty,
                self.elapsed_days,
                self.scheduled_days,
                self.reps,
                self.lapses,
                self.state,
                self.mastery_level,
                self.retention_score,
                self.is_mastered as i32,
                self.is_difficult as i32,
                self.is_favorite as i32,
                self.first_learned_at.map(format_datetime),
                self.last_reviewed_at.map(format_datetime),
                self.next_review_at.map(format_datetime),
                self.due_date,
                self.total_reviews,
                self.correct_count,
                self.wrong_count,
                self.total_time_spent,
                self.avg_response_time,
                self.version,
                self.cloud_version,
                self.is_dirty as i32,
                format_datetime(self.created_at),
                format_datetime(self.updated_at),
                self.synced_at.map(format_datetime),
            ],
        )?;
        Ok(())
    }

    /// 记录复习结果
    pub fn record_review(&mut self, is_correct: bool, response_time_ms: i32) {
        self.total_reviews += 1;
        if is_correct {
            self.correct_count += 1;
        } else {
            self.wrong_count += 1;
        }

        self.total_time_spent += response_time_ms as i64;
        self.avg_response_time = (self.total_time_spent / self.total_reviews as i64) as i32;

        self.last_reviewed_at = Some(Utc::now());
        self.is_dirty = true;
        self.version += 1;
        self.updated_at = Utc::now();

        if self.first_learned_at.is_none() {
            self.first_learned_at = Some(Utc::now());
        }
    }
}

// ============================================================
// AnswerRecord - 答题记录
// ============================================================

/// 答题记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnswerRecord {
    /// 记录唯一标识 (UUID)
    pub id: String,
    /// 用户 ID
    pub user_id: String,
    /// 单词 ID
    pub word_id: String,
    /// 词书 ID
    pub word_book_id: String,
    /// 关联的学习状态 ID
    pub learning_state_id: Option<String>,

    // 答题信息
    /// 题型: recognition/recall/spelling/listening
    pub question_type: QuestionType,
    /// 题目内容 (JSON)
    pub question_content: Option<String>,
    /// 用户答案
    pub user_answer: Option<String>,
    /// 正确答案
    pub correct_answer: Option<String>,
    /// 是否正确
    pub is_correct: bool,

    // FSRS 评分
    /// 评分: 1=Again, 2=Hard, 3=Good, 4=Easy
    pub rating: i32,

    // 性能数据
    /// 响应时间(毫秒)
    pub response_time: i32,
    /// 犹豫时间(毫秒)
    pub hesitation_time: Option<i32>,

    // 上下文信息
    /// 学习会话 ID
    pub session_id: Option<String>,
    /// 学习模式: learn/review/test
    pub study_mode: Option<String>,
    /// 设备信息 (JSON)
    pub device_info: Option<String>,

    // 同步相关
    /// 数据版本号
    pub version: i32,
    /// 云端版本号
    pub cloud_version: i32,
    /// 是否已同步到云端
    pub is_synced: bool,
    /// 创建时间
    pub created_at: DateTime<Utc>,
    /// 同步时间
    pub synced_at: Option<DateTime<Utc>>,
}

/// 题目类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum QuestionType {
    /// 认读 (选择题)
    Recognition,
    /// 回忆 (看中文写英文)
    Recall,
    /// 拼写
    Spelling,
    /// 听力
    Listening,
}

impl QuestionType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Recognition => "recognition",
            Self::Recall => "recall",
            Self::Spelling => "spelling",
            Self::Listening => "listening",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "recognition" => Some(Self::Recognition),
            "recall" => Some(Self::Recall),
            "spelling" => Some(Self::Spelling),
            "listening" => Some(Self::Listening),
            _ => None,
        }
    }
}

impl AnswerRecord {
    /// 创建新的答题记录
    pub fn new(
        user_id: String,
        word_id: String,
        word_book_id: String,
        question_type: QuestionType,
        is_correct: bool,
        rating: i32,
        response_time: i32,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            user_id,
            word_id,
            word_book_id,
            learning_state_id: None,
            question_type,
            question_content: None,
            user_answer: None,
            correct_answer: None,
            is_correct,
            rating,
            response_time,
            hesitation_time: None,
            session_id: None,
            study_mode: None,
            device_info: None,
            version: 1,
            cloud_version: 0,
            is_synced: false,
            created_at: Utc::now(),
            synced_at: None,
        }
    }

    /// 从数据库行解析
    pub fn from_row(row: &Row) -> SqliteResult<Self> {
        let question_type_str: String = row.get("question_type")?;
        let question_type =
            QuestionType::from_str(&question_type_str).unwrap_or(QuestionType::Recognition);

        Ok(Self {
            id: row.get("id")?,
            user_id: row.get("user_id")?,
            word_id: row.get("word_id")?,
            word_book_id: row.get("word_book_id")?,
            learning_state_id: row.get("learning_state_id")?,
            question_type,
            question_content: row.get("question_content")?,
            user_answer: row.get("user_answer")?,
            correct_answer: row.get("correct_answer")?,
            is_correct: row.get::<_, i32>("is_correct")? != 0,
            rating: row.get("rating")?,
            response_time: row.get("response_time")?,
            hesitation_time: row.get("hesitation_time")?,
            session_id: row.get("session_id")?,
            study_mode: row.get("study_mode")?,
            device_info: row.get("device_info")?,
            version: row.get("version")?,
            cloud_version: row.get("cloud_version")?,
            is_synced: row.get::<_, i32>("is_synced")? != 0,
            created_at: parse_datetime(row.get::<_, String>("created_at")?),
            synced_at: row
                .get::<_, Option<String>>("synced_at")?
                .map(parse_datetime),
        })
    }

    /// 插入到数据库
    pub fn insert(&self, conn: &Connection) -> StorageResult<()> {
        conn.execute(
            r#"
            INSERT INTO answer_record (
                id, user_id, word_id, word_book_id, learning_state_id,
                question_type, question_content, user_answer, correct_answer, is_correct,
                rating, response_time, hesitation_time,
                session_id, study_mode, device_info,
                version, cloud_version, is_synced, created_at, synced_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21
            )
            "#,
            params![
                self.id,
                self.user_id,
                self.word_id,
                self.word_book_id,
                self.learning_state_id,
                self.question_type.as_str(),
                self.question_content,
                self.user_answer,
                self.correct_answer,
                self.is_correct as i32,
                self.rating,
                self.response_time,
                self.hesitation_time,
                self.session_id,
                self.study_mode,
                self.device_info,
                self.version,
                self.cloud_version,
                self.is_synced as i32,
                format_datetime(self.created_at),
                self.synced_at.map(format_datetime),
            ],
        )?;
        Ok(())
    }
}

// ============================================================
// SyncQueueItem - 同步队列项
// ============================================================

/// 同步队列项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncQueueItem {
    /// 队列项 ID
    pub id: i64,
    /// 操作类型
    pub operation: String,
    /// 目标表名
    pub table_name: String,
    /// 记录 ID
    pub record_id: String,
    /// 变更数据 (JSON)
    pub payload: String,
    /// 优先级 (1-10)
    pub priority: i32,
    /// 重试次数
    pub retry_count: i32,
    /// 最大重试次数
    pub max_retries: i32,
    /// 最后一次错误信息
    pub last_error: Option<String>,
    /// 状态
    pub status: String,
    /// 创建时间
    pub created_at: DateTime<Utc>,
    /// 更新时间
    pub updated_at: DateTime<Utc>,
    /// 计划执行时间
    pub scheduled_at: Option<DateTime<Utc>>,
    /// 完成时间
    pub completed_at: Option<DateTime<Utc>>,
}

impl SyncQueueItem {
    /// 创建新的同步队列项
    pub fn new(operation: &str, table_name: &str, record_id: &str, payload: &str) -> Self {
        let now = Utc::now();
        Self {
            id: 0, // 由数据库自动生成
            operation: operation.to_string(),
            table_name: table_name.to_string(),
            record_id: record_id.to_string(),
            payload: payload.to_string(),
            priority: 5,
            retry_count: 0,
            max_retries: 3,
            last_error: None,
            status: "pending".to_string(),
            created_at: now,
            updated_at: now,
            scheduled_at: None,
            completed_at: None,
        }
    }

    /// 从数据库行解析
    pub fn from_row(row: &Row) -> SqliteResult<Self> {
        Ok(Self {
            id: row.get("id")?,
            operation: row.get("operation")?,
            table_name: row.get("table_name")?,
            record_id: row.get("record_id")?,
            payload: row.get("payload")?,
            priority: row.get("priority")?,
            retry_count: row.get("retry_count")?,
            max_retries: row.get("max_retries")?,
            last_error: row.get("last_error")?,
            status: row.get("status")?,
            created_at: parse_datetime(row.get::<_, String>("created_at")?),
            updated_at: parse_datetime(row.get::<_, String>("updated_at")?),
            scheduled_at: row
                .get::<_, Option<String>>("scheduled_at")?
                .map(parse_datetime),
            completed_at: row
                .get::<_, Option<String>>("completed_at")?
                .map(parse_datetime),
        })
    }

    /// 入队
    pub fn enqueue(&self, conn: &Connection) -> StorageResult<i64> {
        conn.execute(
            r#"
            INSERT INTO sync_queue (
                operation, table_name, record_id, payload, priority,
                retry_count, max_retries, last_error, status,
                created_at, updated_at, scheduled_at, completed_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13
            )
            "#,
            params![
                self.operation,
                self.table_name,
                self.record_id,
                self.payload,
                self.priority,
                self.retry_count,
                self.max_retries,
                self.last_error,
                self.status,
                format_datetime(self.created_at),
                format_datetime(self.updated_at),
                self.scheduled_at.map(format_datetime),
                self.completed_at.map(format_datetime),
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }
}

// ============================================================
// 辅助函数
// ============================================================

/// 解析日期时间字符串
fn parse_datetime(s: String) -> DateTime<Utc> {
    // 尝试多种格式
    if let Ok(dt) = DateTime::parse_from_rfc3339(&s) {
        return dt.with_timezone(&Utc);
    }

    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S") {
        return DateTime::from_naive_utc_and_offset(dt, Utc);
    }

    // 默认返回当前时间
    Utc::now()
}

/// 格式化日期时间为字符串
fn format_datetime(dt: DateTime<Utc>) -> String {
    dt.format("%Y-%m-%d %H:%M:%S").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_word_learning_state_new() {
        let state = WordLearningState::new(
            "user-1".to_string(),
            "word-1".to_string(),
            "book-1".to_string(),
        );

        assert_eq!(state.user_id, "user-1");
        assert_eq!(state.word_id, "word-1");
        assert_eq!(state.mastery_level, 0);
        assert_eq!(state.state, 0);
        assert!(state.is_dirty);
    }

    #[test]
    fn test_record_review() {
        let mut state = WordLearningState::new(
            "user-1".to_string(),
            "word-1".to_string(),
            "book-1".to_string(),
        );

        state.record_review(true, 2000);
        assert_eq!(state.total_reviews, 1);
        assert_eq!(state.correct_count, 1);
        assert!(state.first_learned_at.is_some());

        state.record_review(false, 3000);
        assert_eq!(state.total_reviews, 2);
        assert_eq!(state.wrong_count, 1);
    }

    #[test]
    fn test_question_type() {
        assert_eq!(QuestionType::Recognition.as_str(), "recognition");
        assert_eq!(QuestionType::from_str("recall"), Some(QuestionType::Recall));
        assert_eq!(QuestionType::from_str("invalid"), None);
    }

    #[test]
    fn test_answer_record_new() {
        let record = AnswerRecord::new(
            "user-1".to_string(),
            "word-1".to_string(),
            "book-1".to_string(),
            QuestionType::Recognition,
            true,
            3,
            2000,
        );

        assert_eq!(record.user_id, "user-1");
        assert!(record.is_correct);
        assert_eq!(record.rating, 3);
        assert!(!record.is_synced);
    }
}
