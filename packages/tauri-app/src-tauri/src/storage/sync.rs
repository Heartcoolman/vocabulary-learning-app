//! 同步引擎模块
//!
//! 负责本地数据与云端的双向同步，包括：
//! - 冲突检测与解决
//! - 增量同步
//! - 离线队列处理

use chrono::{DateTime, Utc};
use reqwest::Client;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::storage::models::{AnswerRecord, WordLearningState};
use crate::storage::{DatabaseManager, StorageError, StorageResult};

/// 同步配置
#[derive(Debug, Clone)]
pub struct SyncConfig {
    /// API 基础 URL
    pub api_base_url: String,
    /// 同步批次大小
    pub batch_size: usize,
    /// 最大重试次数
    pub max_retries: u32,
    /// 重试间隔（毫秒）
    pub retry_delay_ms: u64,
    /// 同步超时（秒）
    pub timeout_secs: u64,
}

impl Default for SyncConfig {
    fn default() -> Self {
        Self {
            api_base_url: String::new(),
            batch_size: 100,
            max_retries: 3,
            retry_delay_ms: 1000,
            timeout_secs: 30,
        }
    }
}

/// 同步方向
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncDirection {
    /// 上传到云端
    Upload,
    /// 从云端下载
    Download,
    /// 双向同步
    Bidirectional,
}

/// 冲突解决策略
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConflictStrategy {
    /// 本地优先
    LocalWins,
    /// 云端优先
    CloudWins,
    /// 学习进度取高值
    HigherProgressWins,
    /// 最新修改优先
    LatestWins,
}

impl Default for ConflictStrategy {
    fn default() -> Self {
        Self::HigherProgressWins
    }
}

/// 同步状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncState {
    pub last_sync_time: Option<DateTime<Utc>>,
    pub sync_token: Option<String>,
    pub pending_uploads: usize,
    pub pending_downloads: usize,
}

/// 同步结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub success: bool,
    pub uploaded_count: usize,
    pub downloaded_count: usize,
    pub conflicts_resolved: usize,
    pub errors: Vec<String>,
    pub sync_time: DateTime<Utc>,
}

impl Default for SyncResult {
    fn default() -> Self {
        Self {
            success: true,
            uploaded_count: 0,
            downloaded_count: 0,
            conflicts_resolved: 0,
            errors: Vec::new(),
            sync_time: Utc::now(),
        }
    }
}

/// 同步队列项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncQueueItem {
    pub id: i64,
    pub operation: SyncOperation,
    pub table_name: String,
    pub record_id: String,
    pub payload: String,
    pub priority: i32,
    pub retry_count: i32,
    pub status: SyncQueueStatus,
    pub created_at: DateTime<Utc>,
}

/// 同步操作类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SyncOperation {
    Insert,
    Update,
    Delete,
}

/// 同步队列状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SyncQueueStatus {
    Pending,
    Processing,
    Completed,
    Failed,
}

/// 冲突信息
#[derive(Debug, Clone)]
pub struct ConflictInfo<T> {
    pub local: T,
    pub cloud: T,
    pub resolved: Option<T>,
}

/// 同步数据载荷
///
/// 用于增量同步的数据传输结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncPayload {
    /// 目标表名
    pub table: String,
    /// 操作类型: insert/update/delete
    pub operation: String,
    /// 记录唯一标识
    pub record_id: String,
    /// 数据内容 (JSON 格式)
    pub data: String,
    /// 数据版本号
    pub version: i64,
    /// 时间戳 (Unix timestamp in milliseconds)
    pub timestamp: i64,
}

impl SyncPayload {
    /// 创建新的同步载荷
    pub fn new(table: &str, operation: &str, record_id: &str, data: String, version: i64) -> Self {
        Self {
            table: table.to_string(),
            operation: operation.to_string(),
            record_id: record_id.to_string(),
            data,
            version,
            timestamp: Utc::now().timestamp_millis(),
        }
    }

    /// 从 WordLearningState 创建同步载荷
    pub fn from_learning_state(state: &WordLearningState, operation: &str) -> StorageResult<Self> {
        let data =
            serde_json::to_string(state).map_err(|e| StorageError::Serialization(e.to_string()))?;

        Ok(Self::new(
            "word_learning_state",
            operation,
            &state.id,
            data,
            state.version as i64,
        ))
    }

    /// 从 AnswerRecord 创建同步载荷
    pub fn from_answer_record(record: &AnswerRecord, operation: &str) -> StorageResult<Self> {
        let data = serde_json::to_string(record)
            .map_err(|e| StorageError::Serialization(e.to_string()))?;

        Ok(Self::new(
            "answer_record",
            operation,
            &record.id,
            data,
            record.version as i64,
        ))
    }

    /// 解析为 WordLearningState
    pub fn to_learning_state(&self) -> StorageResult<WordLearningState> {
        serde_json::from_str(&self.data).map_err(|e| StorageError::Serialization(e.to_string()))
    }

    /// 解析为 AnswerRecord
    pub fn to_answer_record(&self) -> StorageResult<AnswerRecord> {
        serde_json::from_str(&self.data).map_err(|e| StorageError::Serialization(e.to_string()))
    }
}

/// 同步引擎
pub struct SyncEngine {
    config: SyncConfig,
    client: Client,
    conflict_strategy: ConflictStrategy,
    /// 可选的数据库连接（用于独立操作模式）
    db: Option<Arc<Mutex<Connection>>>,
}

impl SyncEngine {
    /// 创建新的同步引擎
    pub fn new(api_base_url: String) -> Self {
        let config = SyncConfig {
            api_base_url,
            ..Default::default()
        };

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(config.timeout_secs))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            config,
            client,
            conflict_strategy: ConflictStrategy::default(),
            db: None,
        }
    }

    /// 使用自定义配置创建同步引擎
    pub fn with_config(config: SyncConfig) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(config.timeout_secs))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            config,
            client,
            conflict_strategy: ConflictStrategy::default(),
            db: None,
        }
    }

    /// 使用数据库连接创建同步引擎
    ///
    /// 此构造函数允许直接使用数据库连接进行同步操作，
    /// 适用于独立模式下的增量同步场景。
    pub fn with_db(db: Arc<Mutex<Connection>>) -> Self {
        let config = SyncConfig::default();
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(config.timeout_secs))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            config,
            client,
            conflict_strategy: ConflictStrategy::default(),
            db: Some(db),
        }
    }

    /// 使用数据库连接和配置创建同步引擎
    pub fn with_db_and_config(db: Arc<Mutex<Connection>>, config: SyncConfig) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(config.timeout_secs))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            config,
            client,
            conflict_strategy: ConflictStrategy::default(),
            db: Some(db),
        }
    }

    /// 设置冲突解决策略
    pub fn set_conflict_strategy(&mut self, strategy: ConflictStrategy) {
        self.conflict_strategy = strategy;
    }

    /// 解决学习状态冲突
    ///
    /// 学习进度取高值策略：
    /// - mastery_level 取最大值
    /// - total_reviews 取最大值
    /// - correct_count/wrong_count 取最大值
    /// - stability/difficulty 基于最新的复习结果
    pub fn resolve_conflict(
        &self,
        local: &WordLearningState,
        cloud: &WordLearningState,
    ) -> WordLearningState {
        match self.conflict_strategy {
            ConflictStrategy::LocalWins => local.clone(),
            ConflictStrategy::CloudWins => cloud.clone(),
            ConflictStrategy::LatestWins => {
                if local.updated_at > cloud.updated_at {
                    local.clone()
                } else {
                    cloud.clone()
                }
            }
            ConflictStrategy::HigherProgressWins => {
                self.merge_learning_state_higher_progress(local, cloud)
            }
        }
    }

    /// 合并学习状态 - 学习进度取高值
    fn merge_learning_state_higher_progress(
        &self,
        local: &WordLearningState,
        cloud: &WordLearningState,
    ) -> WordLearningState {
        // 确定哪个版本更"新"（基于最后复习时间）
        let (newer, older) = if local.last_reviewed_at >= cloud.last_reviewed_at {
            (local, cloud)
        } else {
            (cloud, local)
        };

        WordLearningState {
            id: local.id.clone(),
            user_id: local.user_id.clone(),
            word_id: local.word_id.clone(),
            word_book_id: local.word_book_id.clone(),

            // FSRS 参数：使用更新版本的值
            stability: newer.stability,
            difficulty: newer.difficulty,
            elapsed_days: newer.elapsed_days,
            scheduled_days: newer.scheduled_days,
            reps: newer.reps.max(older.reps),
            lapses: newer.lapses.max(older.lapses),
            state: newer.state,

            // 学习进度：取最高值
            mastery_level: local.mastery_level.max(cloud.mastery_level),
            retention_score: local.retention_score.max(cloud.retention_score),
            is_mastered: local.is_mastered || cloud.is_mastered,
            is_difficult: local.is_difficult || cloud.is_difficult,
            is_favorite: local.is_favorite || cloud.is_favorite,

            // 时间记录：取更早的首次学习时间，更晚的最后复习时间
            first_learned_at: match (&local.first_learned_at, &cloud.first_learned_at) {
                (Some(l), Some(c)) => Some((*l).min(*c)),
                (Some(l), None) => Some(*l),
                (None, Some(c)) => Some(*c),
                (None, None) => None,
            },
            last_reviewed_at: local.last_reviewed_at.max(cloud.last_reviewed_at),
            next_review_at: newer.next_review_at,
            due_date: newer.due_date.clone(),

            // 统计数据：取最大值
            total_reviews: local.total_reviews.max(cloud.total_reviews),
            correct_count: local.correct_count.max(cloud.correct_count),
            wrong_count: local.wrong_count.max(cloud.wrong_count),
            total_time_spent: local.total_time_spent.max(cloud.total_time_spent),
            avg_response_time: newer.avg_response_time,

            // 元数据：使用合并后的版本
            version: local.version.max(cloud.version) + 1,
            cloud_version: cloud.cloud_version,
            is_dirty: true,
            created_at: local.created_at.min(cloud.created_at),
            updated_at: Utc::now(),
            synced_at: None,
        }
    }

    /// 上传本地变更到云端
    pub async fn sync_to_cloud(
        &self,
        db: &DatabaseManager,
        auth_token: &str,
    ) -> StorageResult<SyncResult> {
        let mut result = SyncResult::default();

        // 获取待同步的学习状态
        let dirty_states = self.get_dirty_learning_states(db)?;
        log::info!("待上传学习状态: {} 条", dirty_states.len());

        // 分批上传
        for chunk in dirty_states.chunks(self.config.batch_size) {
            match self.upload_learning_states(chunk, auth_token).await {
                Ok(uploaded) => {
                    result.uploaded_count += uploaded;

                    // 更新本地同步状态
                    for state in chunk {
                        self.mark_state_synced(db, &state.id)?;
                    }
                }
                Err(e) => {
                    result.errors.push(format!("上传学习状态失败: {}", e));
                    result.success = false;
                }
            }
        }

        // 上传待同步的答题记录
        let unsynced_answers = self.get_unsynced_answers(db)?;
        log::info!("待上传答题记录: {} 条", unsynced_answers.len());

        for chunk in unsynced_answers.chunks(self.config.batch_size) {
            match self.upload_answer_records(chunk, auth_token).await {
                Ok(uploaded) => {
                    result.uploaded_count += uploaded;

                    // 更新本地同步状态
                    for record in chunk {
                        self.mark_answer_synced(db, &record.id)?;
                    }
                }
                Err(e) => {
                    result.errors.push(format!("上传答题记录失败: {}", e));
                    result.success = false;
                }
            }
        }

        result.sync_time = Utc::now();
        Ok(result)
    }

    /// 从云端拉取数据
    pub async fn sync_from_cloud(
        &self,
        db: &DatabaseManager,
        auth_token: &str,
    ) -> StorageResult<SyncResult> {
        let mut result = SyncResult::default();

        // 获取上次同步时间
        let last_sync = self.get_last_sync_time(db)?;
        log::info!("上次同步时间: {:?}", last_sync);

        // 拉取云端变更
        match self.fetch_cloud_changes(auth_token, last_sync).await {
            Ok(changes) => {
                // 处理学习状态变更
                for cloud_state in changes.learning_states {
                    match self.process_cloud_learning_state(db, cloud_state) {
                        Ok(had_conflict) => {
                            result.downloaded_count += 1;
                            if had_conflict {
                                result.conflicts_resolved += 1;
                            }
                        }
                        Err(e) => {
                            result.errors.push(format!("处理云端学习状态失败: {}", e));
                        }
                    }
                }

                // 处理单词数据变更
                for cloud_word in changes.words {
                    match self.process_cloud_word(db, cloud_word) {
                        Ok(_) => result.downloaded_count += 1,
                        Err(e) => {
                            result.errors.push(format!("处理云端单词数据失败: {}", e));
                        }
                    }
                }

                // 更新同步时间
                self.update_last_sync_time(db)?;
            }
            Err(e) => {
                result.errors.push(format!("拉取云端数据失败: {}", e));
                result.success = false;
            }
        }

        result.sync_time = Utc::now();
        Ok(result)
    }

    /// 执行完整同步（双向）
    pub async fn full_sync(
        &self,
        db: &DatabaseManager,
        auth_token: &str,
    ) -> StorageResult<SyncResult> {
        log::info!("开始完整同步...");

        // 先拉取云端变更
        let mut download_result = self.sync_from_cloud(db, auth_token).await?;

        // 再上传本地变更
        let upload_result = self.sync_to_cloud(db, auth_token).await?;

        // 合并结果
        download_result.uploaded_count = upload_result.uploaded_count;
        download_result
            .errors
            .extend(upload_result.errors.into_iter());
        download_result.success = download_result.success && upload_result.success;

        log::info!(
            "同步完成: 上传 {} 条, 下载 {} 条, 解决冲突 {} 个",
            download_result.uploaded_count,
            download_result.downloaded_count,
            download_result.conflicts_resolved
        );

        Ok(download_result)
    }

    // ========== 基于 Arc<Mutex<Connection>> 的独立操作方法 ==========

    /// 同步学习状态（本地与云端合并）
    ///
    /// 使用"学习进度取高值"策略合并本地和云端的学习状态，
    /// 返回合并后的最终状态。
    pub fn sync_learning_state(
        &self,
        local: &WordLearningState,
        cloud: &WordLearningState,
    ) -> WordLearningState {
        self.resolve_conflict(local, cloud)
    }

    /// 准备上传批次
    ///
    /// 从数据库中获取所有待同步的数据，转换为 SyncPayload 格式。
    /// 需要先通过 with_db 构造函数设置数据库连接。
    pub fn prepare_upload_batch(&self) -> StorageResult<Vec<SyncPayload>> {
        let db = self.db.as_ref().ok_or_else(|| {
            StorageError::Sync("数据库连接未设置，请使用 with_db 构造函数".to_string())
        })?;

        let conn = db.lock().map_err(|e| {
            StorageError::Database(rusqlite::Error::InvalidParameterName(e.to_string()))
        })?;

        let mut payloads = Vec::new();

        // 获取待同步的学习状态
        let mut stmt = conn.prepare(
            "SELECT * FROM word_learning_state WHERE is_dirty = 1 ORDER BY updated_at ASC",
        )?;

        let learning_states: Vec<WordLearningState> = stmt
            .query_map([], |row| WordLearningState::from_row(row))?
            .filter_map(|r| r.ok())
            .collect();

        for state in &learning_states {
            let payload = SyncPayload::from_learning_state(state, "upsert")?;
            payloads.push(payload);
        }

        // 获取待同步的答题记录
        let mut stmt = conn
            .prepare("SELECT * FROM answer_record WHERE is_synced = 0 ORDER BY created_at ASC")?;

        let answer_records: Vec<AnswerRecord> = stmt
            .query_map([], |row| AnswerRecord::from_row(row))?
            .filter_map(|r| r.ok())
            .collect();

        for record in &answer_records {
            let payload = SyncPayload::from_answer_record(record, "insert")?;
            payloads.push(payload);
        }

        log::info!(
            "准备上传批次: {} 条学习状态, {} 条答题记录",
            learning_states.len(),
            answer_records.len()
        );

        Ok(payloads)
    }

    /// 应用下载批次
    ///
    /// 将从云端下载的数据应用到本地数据库。
    /// 需要先通过 with_db 构造函数设置数据库连接。
    pub fn apply_download_batch(&self, items: &[SyncPayload]) -> StorageResult<SyncResult> {
        let db = self.db.as_ref().ok_or_else(|| {
            StorageError::Sync("数据库连接未设置，请使用 with_db 构造函数".to_string())
        })?;

        let conn = db.lock().map_err(|e| {
            StorageError::Database(rusqlite::Error::InvalidParameterName(e.to_string()))
        })?;

        let mut result = SyncResult::default();

        for item in items {
            match item.table.as_str() {
                "word_learning_state" => match self.apply_learning_state_payload(&conn, item) {
                    Ok(had_conflict) => {
                        result.downloaded_count += 1;
                        if had_conflict {
                            result.conflicts_resolved += 1;
                        }
                    }
                    Err(e) => {
                        result
                            .errors
                            .push(format!("应用学习状态失败 [{}]: {}", item.record_id, e));
                    }
                },
                "answer_record" => match self.apply_answer_record_payload(&conn, item) {
                    Ok(_) => {
                        result.downloaded_count += 1;
                    }
                    Err(e) => {
                        result
                            .errors
                            .push(format!("应用答题记录失败 [{}]: {}", item.record_id, e));
                    }
                },
                _ => {
                    result.errors.push(format!("未知的表类型: {}", item.table));
                }
            }
        }

        result.success = result.errors.is_empty();
        result.sync_time = Utc::now();

        log::info!(
            "应用下载批次完成: 成功 {} 条, 冲突解决 {} 个, 错误 {} 个",
            result.downloaded_count,
            result.conflicts_resolved,
            result.errors.len()
        );

        Ok(result)
    }

    /// 应用学习状态载荷
    fn apply_learning_state_payload(
        &self,
        conn: &Connection,
        payload: &SyncPayload,
    ) -> StorageResult<bool> {
        let cloud_state: WordLearningState = payload.to_learning_state()?;

        // 检查操作类型
        if payload.operation == "delete" {
            conn.execute(
                "DELETE FROM word_learning_state WHERE id = ?1",
                [&payload.record_id],
            )?;
            return Ok(false);
        }

        // 查找本地记录
        let local_state: Option<WordLearningState> = conn
            .query_row(
                "SELECT * FROM word_learning_state WHERE user_id = ?1 AND word_id = ?2",
                [&cloud_state.user_id, &cloud_state.word_id],
                |row| WordLearningState::from_row(row),
            )
            .ok();

        let had_conflict;
        let final_state;

        match local_state {
            Some(local) if local.is_dirty => {
                // 有本地未同步的修改，需要解决冲突
                had_conflict = true;
                final_state = self.resolve_conflict(&local, &cloud_state);
                log::info!(
                    "解决冲突: word_id={}, 本地版本={}, 云端版本={}",
                    local.word_id,
                    local.version,
                    cloud_state.version
                );
            }
            Some(_) => {
                // 本地没有未同步修改，直接使用云端版本
                had_conflict = false;
                final_state = cloud_state;
            }
            None => {
                // 本地没有记录，直接插入
                had_conflict = false;
                final_state = cloud_state;
            }
        }

        // 更新或插入记录
        final_state.upsert(conn)?;

        Ok(had_conflict)
    }

    /// 应用答题记录载荷
    fn apply_answer_record_payload(
        &self,
        conn: &Connection,
        payload: &SyncPayload,
    ) -> StorageResult<()> {
        let record: AnswerRecord = payload.to_answer_record()?;

        // 检查操作类型
        if payload.operation == "delete" {
            conn.execute(
                "DELETE FROM answer_record WHERE id = ?1",
                [&payload.record_id],
            )?;
            return Ok(());
        }

        // 答题记录不需要冲突解决，直接插入或更新
        record.insert(conn)?;
        Ok(())
    }

    /// 获取上次同步时间戳（Unix 时间戳，毫秒）
    ///
    /// 需要先通过 with_db 构造函数设置数据库连接。
    pub fn get_last_sync_time_ts(&self) -> StorageResult<i64> {
        let db = self.db.as_ref().ok_or_else(|| {
            StorageError::Sync("数据库连接未设置，请使用 with_db 构造函数".to_string())
        })?;

        let conn = db.lock().map_err(|e| {
            StorageError::Database(rusqlite::Error::InvalidParameterName(e.to_string()))
        })?;

        let value: Option<i64> = conn
            .query_row(
                "SELECT CAST(value AS INTEGER) FROM sync_metadata WHERE key = 'last_sync_timestamp'",
                [],
                |row| row.get(0),
            )
            .ok();

        Ok(value.unwrap_or(0))
    }

    /// 设置上次同步时间戳（Unix 时间戳，毫秒）
    ///
    /// 需要先通过 with_db 构造函数设置数据库连接。
    pub fn set_last_sync_time_ts(&self, ts: i64) -> StorageResult<()> {
        let db = self.db.as_ref().ok_or_else(|| {
            StorageError::Sync("数据库连接未设置，请使用 with_db 构造函数".to_string())
        })?;

        let conn = db.lock().map_err(|e| {
            StorageError::Database(rusqlite::Error::InvalidParameterName(e.to_string()))
        })?;

        conn.execute(
            r#"
            INSERT INTO sync_metadata (key, value, updated_at)
            VALUES ('last_sync_timestamp', ?1, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            "#,
            [ts.to_string()],
        )?;

        Ok(())
    }

    // ========== 增量同步方法 ==========

    /// 获取指定版本之后的变更
    ///
    /// 返回从指定版本号之后的所有变更，用于增量同步。
    /// 需要先通过 with_db 构造函数设置数据库连接。
    pub fn get_changes_since(&self, table: &str, version: i64) -> StorageResult<Vec<SyncPayload>> {
        let db = self.db.as_ref().ok_or_else(|| {
            StorageError::Sync("数据库连接未设置，请使用 with_db 构造函数".to_string())
        })?;

        let conn = db.lock().map_err(|e| {
            StorageError::Database(rusqlite::Error::InvalidParameterName(e.to_string()))
        })?;

        let mut payloads = Vec::new();

        match table {
            "word_learning_state" => {
                let mut stmt = conn.prepare(
                    "SELECT * FROM word_learning_state WHERE version > ?1 ORDER BY version ASC",
                )?;

                let states: Vec<WordLearningState> = stmt
                    .query_map([version], |row| WordLearningState::from_row(row))?
                    .filter_map(|r| r.ok())
                    .collect();

                for state in &states {
                    let payload = SyncPayload::from_learning_state(state, "upsert")?;
                    payloads.push(payload);
                }
            }
            "answer_record" => {
                let mut stmt = conn.prepare(
                    "SELECT * FROM answer_record WHERE version > ?1 ORDER BY version ASC",
                )?;

                let records: Vec<AnswerRecord> = stmt
                    .query_map([version], |row| AnswerRecord::from_row(row))?
                    .filter_map(|r| r.ok())
                    .collect();

                for record in &records {
                    let payload = SyncPayload::from_answer_record(record, "insert")?;
                    payloads.push(payload);
                }
            }
            _ => {
                return Err(StorageError::Sync(format!("不支持的表类型: {}", table)));
            }
        }

        log::info!(
            "获取增量变更: 表={}, 版本>{}, 共 {} 条",
            table,
            version,
            payloads.len()
        );

        Ok(payloads)
    }

    /// 应用增量变更
    ///
    /// 将增量变更应用到本地数据库，返回同步结果。
    /// 需要先通过 with_db 构造函数设置数据库连接。
    pub fn apply_changes(&self, changes: &[SyncPayload]) -> StorageResult<SyncResult> {
        // 复用 apply_download_batch 的逻辑
        self.apply_download_batch(changes)
    }

    /// 获取所有表的变更（指定时间戳之后）
    ///
    /// 返回从指定时间戳之后的所有表的变更。
    /// 需要先通过 with_db 构造函数设置数据库连接。
    pub fn get_all_changes_since_timestamp(
        &self,
        timestamp: i64,
    ) -> StorageResult<Vec<SyncPayload>> {
        let db = self.db.as_ref().ok_or_else(|| {
            StorageError::Sync("数据库连接未设置，请使用 with_db 构造函数".to_string())
        })?;

        let conn = db.lock().map_err(|e| {
            StorageError::Database(rusqlite::Error::InvalidParameterName(e.to_string()))
        })?;

        let mut payloads = Vec::new();

        // 转换时间戳为日期时间字符串
        let datetime_str = DateTime::from_timestamp_millis(timestamp)
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_else(|| "1970-01-01 00:00:00".to_string());

        // 获取学习状态变更
        let mut stmt = conn.prepare(
            "SELECT * FROM word_learning_state WHERE updated_at > ?1 ORDER BY updated_at ASC",
        )?;

        let states: Vec<WordLearningState> = stmt
            .query_map([&datetime_str], |row| WordLearningState::from_row(row))?
            .filter_map(|r| r.ok())
            .collect();

        for state in &states {
            let payload = SyncPayload::from_learning_state(state, "upsert")?;
            payloads.push(payload);
        }

        // 获取答题记录变更
        let mut stmt = conn
            .prepare("SELECT * FROM answer_record WHERE created_at > ?1 ORDER BY created_at ASC")?;

        let records: Vec<AnswerRecord> = stmt
            .query_map([&datetime_str], |row| AnswerRecord::from_row(row))?
            .filter_map(|r| r.ok())
            .collect();

        for record in &records {
            let payload = SyncPayload::from_answer_record(record, "insert")?;
            payloads.push(payload);
        }

        log::info!(
            "获取时间戳之后的变更: timestamp={}, 共 {} 条",
            timestamp,
            payloads.len()
        );

        Ok(payloads)
    }

    /// 标记上传批次为已同步
    ///
    /// 上传成功后调用此方法，将相关记录标记为已同步。
    /// 需要先通过 with_db 构造函数设置数据库连接。
    pub fn mark_upload_batch_synced(&self, payloads: &[SyncPayload]) -> StorageResult<()> {
        let db = self.db.as_ref().ok_or_else(|| {
            StorageError::Sync("数据库连接未设置，请使用 with_db 构造函数".to_string())
        })?;

        let conn = db.lock().map_err(|e| {
            StorageError::Database(rusqlite::Error::InvalidParameterName(e.to_string()))
        })?;

        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

        for payload in payloads {
            match payload.table.as_str() {
                "word_learning_state" => {
                    conn.execute(
                        "UPDATE word_learning_state SET is_dirty = 0, synced_at = ?1 WHERE id = ?2",
                        [&now, &payload.record_id],
                    )?;
                }
                "answer_record" => {
                    conn.execute(
                        "UPDATE answer_record SET is_synced = 1, synced_at = ?1 WHERE id = ?2",
                        [&now, &payload.record_id],
                    )?;
                }
                _ => {
                    log::warn!("未知的表类型: {}", payload.table);
                }
            }
        }

        Ok(())
    }

    // ========== 内部辅助方法 ==========

    /// 获取待同步的学习状态
    fn get_dirty_learning_states(
        &self,
        db: &DatabaseManager,
    ) -> StorageResult<Vec<WordLearningState>> {
        let conn = db.connection().lock().map_err(|e| {
            StorageError::Database(rusqlite::Error::InvalidParameterName(e.to_string()))
        })?;

        let mut stmt = conn.prepare(
            "SELECT * FROM word_learning_state WHERE is_dirty = 1 ORDER BY updated_at ASC",
        )?;

        let states: Vec<WordLearningState> = stmt
            .query_map([], |row| WordLearningState::from_row(row))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(states)
    }

    /// 获取未同步的答题记录
    fn get_unsynced_answers(&self, db: &DatabaseManager) -> StorageResult<Vec<AnswerRecord>> {
        let conn = db.connection().lock().map_err(|e| {
            StorageError::Database(rusqlite::Error::InvalidParameterName(e.to_string()))
        })?;

        let mut stmt = conn
            .prepare("SELECT * FROM answer_record WHERE is_synced = 0 ORDER BY created_at ASC")?;

        let records: Vec<AnswerRecord> = stmt
            .query_map([], |row| AnswerRecord::from_row(row))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(records)
    }

    /// 上传学习状态到云端
    async fn upload_learning_states(
        &self,
        states: &[WordLearningState],
        auth_token: &str,
    ) -> StorageResult<usize> {
        let url = format!("{}/api/sync/learning-states", self.config.api_base_url);

        let response = self
            .client
            .post(&url)
            .bearer_auth(auth_token)
            .json(states)
            .send()
            .await
            .map_err(|e| StorageError::Network(e.to_string()))?;

        if response.status().is_success() {
            Ok(states.len())
        } else {
            Err(StorageError::Sync(format!(
                "上传失败: HTTP {}",
                response.status()
            )))
        }
    }

    /// 上传答题记录到云端
    async fn upload_answer_records(
        &self,
        records: &[AnswerRecord],
        auth_token: &str,
    ) -> StorageResult<usize> {
        let url = format!("{}/api/sync/answer-records", self.config.api_base_url);

        let response = self
            .client
            .post(&url)
            .bearer_auth(auth_token)
            .json(records)
            .send()
            .await
            .map_err(|e| StorageError::Network(e.to_string()))?;

        if response.status().is_success() {
            Ok(records.len())
        } else {
            Err(StorageError::Sync(format!(
                "上传失败: HTTP {}",
                response.status()
            )))
        }
    }

    /// 标记学习状态已同步
    fn mark_state_synced(&self, db: &DatabaseManager, state_id: &str) -> StorageResult<()> {
        let conn = db.connection().lock().map_err(|e| {
            StorageError::Database(rusqlite::Error::InvalidParameterName(e.to_string()))
        })?;

        conn.execute(
            "UPDATE word_learning_state SET is_dirty = 0, synced_at = datetime('now') WHERE id = ?1",
            [state_id],
        )?;

        Ok(())
    }

    /// 标记答题记录已同步
    fn mark_answer_synced(&self, db: &DatabaseManager, record_id: &str) -> StorageResult<()> {
        let conn = db.connection().lock().map_err(|e| {
            StorageError::Database(rusqlite::Error::InvalidParameterName(e.to_string()))
        })?;

        conn.execute(
            "UPDATE answer_record SET is_synced = 1, synced_at = datetime('now') WHERE id = ?1",
            [record_id],
        )?;

        Ok(())
    }

    /// 获取上次同步时间
    fn get_last_sync_time(&self, db: &DatabaseManager) -> StorageResult<Option<DateTime<Utc>>> {
        let conn = db.connection().lock().map_err(|e| {
            StorageError::Database(rusqlite::Error::InvalidParameterName(e.to_string()))
        })?;

        let value: Option<String> = conn
            .query_row(
                "SELECT value FROM sync_metadata WHERE key = 'last_sync_time'",
                [],
                |row| row.get(0),
            )
            .ok();

        match value {
            Some(s) if !s.is_empty() => {
                let dt = DateTime::parse_from_rfc3339(&s)
                    .map_err(|e| StorageError::Sync(format!("解析同步时间失败: {}", e)))?;
                Ok(Some(dt.with_timezone(&Utc)))
            }
            _ => Ok(None),
        }
    }

    /// 更新同步时间
    fn update_last_sync_time(&self, db: &DatabaseManager) -> StorageResult<()> {
        let conn = db.connection().lock().map_err(|e| {
            StorageError::Database(rusqlite::Error::InvalidParameterName(e.to_string()))
        })?;

        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE sync_metadata SET value = ?1, updated_at = datetime('now') WHERE key = 'last_sync_time'",
            [&now],
        )?;

        Ok(())
    }

    /// 从云端获取变更
    async fn fetch_cloud_changes(
        &self,
        auth_token: &str,
        since: Option<DateTime<Utc>>,
    ) -> StorageResult<CloudChanges> {
        let mut url = format!("{}/api/sync/changes", self.config.api_base_url);

        if let Some(since) = since {
            url = format!("{}?since={}", url, since.to_rfc3339());
        }

        let response = self
            .client
            .get(&url)
            .bearer_auth(auth_token)
            .send()
            .await
            .map_err(|e| StorageError::Network(e.to_string()))?;

        if response.status().is_success() {
            response
                .json::<CloudChanges>()
                .await
                .map_err(|e| StorageError::Serialization(e.to_string()))
        } else {
            Err(StorageError::Sync(format!(
                "获取云端变更失败: HTTP {}",
                response.status()
            )))
        }
    }

    /// 处理云端学习状态变更
    fn process_cloud_learning_state(
        &self,
        db: &DatabaseManager,
        cloud_state: WordLearningState,
    ) -> StorageResult<bool> {
        let conn = db.connection().lock().map_err(|e| {
            StorageError::Database(rusqlite::Error::InvalidParameterName(e.to_string()))
        })?;

        // 查找本地记录
        let local_state: Option<WordLearningState> = conn
            .query_row(
                "SELECT * FROM word_learning_state WHERE user_id = ?1 AND word_id = ?2",
                [&cloud_state.user_id, &cloud_state.word_id],
                |row| WordLearningState::from_row(row),
            )
            .ok();

        let had_conflict;
        let final_state;

        match local_state {
            Some(local) if local.is_dirty => {
                // 有本地未同步的修改，需要解决冲突
                had_conflict = true;
                final_state = self.resolve_conflict(&local, &cloud_state);
                log::info!(
                    "解决冲突: word_id={}, 本地版本={}, 云端版本={}",
                    local.word_id,
                    local.version,
                    cloud_state.cloud_version
                );
            }
            Some(_) => {
                // 本地没有未同步修改，直接使用云端版本
                had_conflict = false;
                final_state = cloud_state;
            }
            None => {
                // 本地没有记录，直接插入
                had_conflict = false;
                final_state = cloud_state;
            }
        }

        // 更新或插入记录
        final_state.upsert(&conn)?;

        Ok(had_conflict)
    }

    /// 处理云端单词数据变更
    fn process_cloud_word(&self, db: &DatabaseManager, cloud_word: CloudWord) -> StorageResult<()> {
        let conn = db.connection().lock().map_err(|e| {
            StorageError::Database(rusqlite::Error::InvalidParameterName(e.to_string()))
        })?;

        // 单词数据不需要冲突解决，云端为准
        conn.execute(
            r#"
            INSERT OR REPLACE INTO word (
                id, word_book_id, word, phonetic_uk, phonetic_us,
                audio_uk_url, audio_us_url, definition, definition_en,
                example_sentences, word_forms, synonyms, antonyms, tags,
                frequency_rank, difficulty_score, sort_order, version,
                cloud_version, synced_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, datetime('now')
            )
            "#,
            rusqlite::params![
                cloud_word.id,
                cloud_word.word_book_id,
                cloud_word.word,
                cloud_word.phonetic_uk,
                cloud_word.phonetic_us,
                cloud_word.audio_uk_url,
                cloud_word.audio_us_url,
                cloud_word.definition,
                cloud_word.definition_en,
                cloud_word.example_sentences,
                cloud_word.word_forms,
                cloud_word.synonyms,
                cloud_word.antonyms,
                cloud_word.tags,
                cloud_word.frequency_rank,
                cloud_word.difficulty_score,
                cloud_word.sort_order,
                cloud_word.version,
                cloud_word.cloud_version,
            ],
        )?;

        Ok(())
    }
}

/// 云端变更数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudChanges {
    pub learning_states: Vec<WordLearningState>,
    pub words: Vec<CloudWord>,
    pub word_books: Vec<CloudWordBook>,
    pub sync_token: Option<String>,
}

/// 云端单词数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudWord {
    pub id: String,
    pub word_book_id: String,
    pub word: String,
    pub phonetic_uk: Option<String>,
    pub phonetic_us: Option<String>,
    pub audio_uk_url: Option<String>,
    pub audio_us_url: Option<String>,
    pub definition: String,
    pub definition_en: Option<String>,
    pub example_sentences: Option<String>,
    pub word_forms: Option<String>,
    pub synonyms: Option<String>,
    pub antonyms: Option<String>,
    pub tags: Option<String>,
    pub frequency_rank: Option<i32>,
    pub difficulty_score: f64,
    pub sort_order: i32,
    pub version: i32,
    pub cloud_version: i32,
}

/// 云端词书数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudWordBook {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub cover_url: Option<String>,
    pub word_count: i32,
    pub category: Option<String>,
    pub difficulty_level: i32,
    pub version: i32,
    pub cloud_version: i32,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_state(word_id: &str, mastery: i32, reviews: i32) -> WordLearningState {
        WordLearningState {
            id: format!("state-{}", word_id),
            user_id: "user-1".to_string(),
            word_id: word_id.to_string(),
            word_book_id: "book-1".to_string(),
            stability: 1.0,
            difficulty: 0.5,
            elapsed_days: 1.0,
            scheduled_days: 3.0,
            reps: reviews,
            lapses: 0,
            state: 2,
            mastery_level: mastery,
            retention_score: 0.8,
            is_mastered: mastery >= 5,
            is_difficult: false,
            is_favorite: false,
            first_learned_at: Some(Utc::now() - chrono::Duration::days(7)),
            last_reviewed_at: Some(Utc::now()),
            next_review_at: Some(Utc::now() + chrono::Duration::days(3)),
            due_date: None,
            total_reviews: reviews,
            correct_count: reviews - 1,
            wrong_count: 1,
            total_time_spent: 30000,
            avg_response_time: 3000,
            version: 1,
            cloud_version: 0,
            is_dirty: true,
            created_at: Utc::now() - chrono::Duration::days(7),
            updated_at: Utc::now(),
            synced_at: None,
        }
    }

    #[test]
    fn test_conflict_resolution_higher_progress() {
        let engine = SyncEngine::new("http://localhost".to_string());

        let local = create_test_state("word-1", 3, 5);
        let mut cloud = create_test_state("word-1", 4, 3);
        cloud.updated_at = Utc::now() - chrono::Duration::hours(1);

        let resolved = engine.resolve_conflict(&local, &cloud);

        // mastery_level 应该取最大值
        assert_eq!(resolved.mastery_level, 4);
        // total_reviews 应该取最大值
        assert_eq!(resolved.total_reviews, 5);
    }

    #[test]
    fn test_conflict_resolution_local_wins() {
        let mut engine = SyncEngine::new("http://localhost".to_string());
        engine.set_conflict_strategy(ConflictStrategy::LocalWins);

        let local = create_test_state("word-1", 3, 5);
        let cloud = create_test_state("word-1", 4, 3);

        let resolved = engine.resolve_conflict(&local, &cloud);

        assert_eq!(resolved.mastery_level, 3);
        assert_eq!(resolved.total_reviews, 5);
    }

    #[test]
    fn test_conflict_resolution_cloud_wins() {
        let mut engine = SyncEngine::new("http://localhost".to_string());
        engine.set_conflict_strategy(ConflictStrategy::CloudWins);

        let local = create_test_state("word-1", 3, 5);
        let cloud = create_test_state("word-1", 4, 3);

        let resolved = engine.resolve_conflict(&local, &cloud);

        assert_eq!(resolved.mastery_level, 4);
        assert_eq!(resolved.total_reviews, 3);
    }

    #[test]
    fn test_conflict_resolution_latest_wins() {
        let mut engine = SyncEngine::new("http://localhost".to_string());
        engine.set_conflict_strategy(ConflictStrategy::LatestWins);

        let local = create_test_state("word-1", 3, 5);
        let mut cloud = create_test_state("word-1", 4, 3);
        cloud.updated_at = Utc::now() - chrono::Duration::hours(1);

        let resolved = engine.resolve_conflict(&local, &cloud);

        // 本地版本更新，应该使用本地版本
        assert_eq!(resolved.mastery_level, 3);
        assert_eq!(resolved.total_reviews, 5);
    }

    #[test]
    fn test_sync_learning_state() {
        let engine = SyncEngine::new("http://localhost".to_string());

        let local = create_test_state("word-1", 3, 5);
        let mut cloud = create_test_state("word-1", 4, 8);
        cloud.correct_count = 6;
        cloud.stability = 2.5;
        cloud.difficulty = 0.3;
        cloud.last_reviewed_at = Some(Utc::now() + chrono::Duration::hours(1));

        let synced = engine.sync_learning_state(&local, &cloud);

        // mastery_level 取最大值
        assert_eq!(synced.mastery_level, 4);
        // total_reviews 取最大值
        assert_eq!(synced.total_reviews, 8);
        // correct_count 取最大值
        assert_eq!(synced.correct_count, 6);
        // stability/difficulty 使用更新版本的值
        assert_eq!(synced.stability, 2.5);
        assert_eq!(synced.difficulty, 0.3);
        // version 应该是 max + 1
        assert_eq!(synced.version, 2);
    }

    #[test]
    fn test_sync_payload_creation() {
        let state = create_test_state("word-1", 3, 5);

        let payload = SyncPayload::from_learning_state(&state, "upsert").unwrap();

        assert_eq!(payload.table, "word_learning_state");
        assert_eq!(payload.operation, "upsert");
        assert_eq!(payload.record_id, "state-word-1");
        assert_eq!(payload.version, 1);
        assert!(payload.timestamp > 0);
    }

    #[test]
    fn test_sync_payload_roundtrip() {
        let original = create_test_state("word-1", 3, 5);

        let payload = SyncPayload::from_learning_state(&original, "upsert").unwrap();
        let restored = payload.to_learning_state().unwrap();

        assert_eq!(restored.id, original.id);
        assert_eq!(restored.word_id, original.word_id);
        assert_eq!(restored.mastery_level, original.mastery_level);
        assert_eq!(restored.total_reviews, original.total_reviews);
    }

    #[test]
    fn test_merge_preserves_first_learned_time() {
        let engine = SyncEngine::new("http://localhost".to_string());

        let mut local = create_test_state("word-1", 3, 5);
        let mut cloud = create_test_state("word-1", 4, 3);

        // 设置不同的首次学习时间
        local.first_learned_at = Some(Utc::now() - chrono::Duration::days(10));
        cloud.first_learned_at = Some(Utc::now() - chrono::Duration::days(5));

        let resolved = engine.resolve_conflict(&local, &cloud);

        // 应该保留更早的首次学习时间
        assert!(resolved.first_learned_at.unwrap() < cloud.first_learned_at.unwrap());
    }

    #[test]
    fn test_merge_preserves_flags() {
        let engine = SyncEngine::new("http://localhost".to_string());

        let mut local = create_test_state("word-1", 3, 5);
        let mut cloud = create_test_state("word-1", 4, 3);

        local.is_favorite = true;
        local.is_difficult = false;
        cloud.is_favorite = false;
        cloud.is_difficult = true;

        let resolved = engine.resolve_conflict(&local, &cloud);

        // 标志位应该使用 OR 逻辑
        assert!(resolved.is_favorite);
        assert!(resolved.is_difficult);
    }
}
