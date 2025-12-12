//! Tauri Storage Commands - 存储功能命令
//!
//! 暴露存储功能给前端，包括：
//! - 数据库初始化
//! - 单词查询与下载
//! - 学习状态管理
//! - 答题记录
//! - 云端同步

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

use crate::storage::models::{AnswerRecord, Word, WordLearningState};
use crate::storage::sync::SyncResult;
use crate::storage::{StorageError, StorageService};

// ============================================================
// 应用状态管理
// ============================================================

/// 应用存储状态
pub struct AppStorageState {
    pub service: Mutex<Option<StorageService>>,
}

impl Default for AppStorageState {
    fn default() -> Self {
        Self {
            service: Mutex::new(None),
        }
    }
}

// ============================================================
// 响应类型定义
// ============================================================

/// 学习统计数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LearningStats {
    /// 总学习单词数
    pub total_words: i32,
    /// 已掌握单词数
    pub mastered_words: i32,
    /// 学习中单词数
    pub learning_words: i32,
    /// 待复习单词数
    pub due_words: i32,
    /// 今日学习数
    pub today_learned: i32,
    /// 今日复习数
    pub today_reviewed: i32,
    /// 总正确率
    pub accuracy_rate: f64,
    /// 连续学习天数
    pub streak_days: i32,
}

/// 每日统计数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyStats {
    /// 日期
    pub date: String,
    /// 学习新词数
    pub new_words: i32,
    /// 复习单词数
    pub reviewed_words: i32,
    /// 正确次数
    pub correct_count: i32,
    /// 错误次数
    pub wrong_count: i32,
    /// 正确率
    pub accuracy_rate: f64,
    /// 总学习时长(秒)
    pub total_time_secs: i64,
}

/// 同步状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    /// 是否已连接
    pub is_connected: bool,
    /// 上次同步时间
    pub last_sync_time: Option<String>,
    /// 待上传数量
    pub pending_uploads: i32,
    /// 待下载数量
    pub pending_downloads: i32,
    /// 是否正在同步
    pub is_syncing: bool,
    /// 同步错误信息
    pub last_error: Option<String>,
}

// ============================================================
// 辅助函数
// ============================================================

/// 将 StorageError 转换为用户友好的错误消息
fn map_storage_error(e: StorageError) -> String {
    match e {
        StorageError::Database(e) => format!("数据库错误: {}", e),
        StorageError::Migration(e) => format!("数据库迁移错误: {}", e),
        StorageError::Sync(e) => format!("同步错误: {}", e),
        StorageError::Serialization(e) => format!("序列化错误: {}", e),
        StorageError::Network(e) => format!("网络错误: {}", e),
        StorageError::ConflictResolution(e) => format!("冲突解决失败: {}", e),
        StorageError::NotFound(e) => format!("数据未找到: {}", e),
        StorageError::LockError(e) => format!("锁错误: {}", e),
    }
}

/// 获取存储服务引用
fn get_service<'a>(
    state: &'a State<'_, AppStorageState>,
) -> Result<std::sync::MutexGuard<'a, Option<StorageService>>, String> {
    state
        .service
        .lock()
        .map_err(|e| format!("获取存储服务失败: {}", e))
}

// ============================================================
// 1. 数据库初始化命令
// ============================================================

/// 初始化数据库
///
/// 在应用启动时调用，创建数据库连接并运行迁移
#[tauri::command]
pub async fn init_database(
    app: AppHandle,
    state: State<'_, AppStorageState>,
) -> Result<(), String> {
    // 获取应用数据目录
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;

    // 确保目录存在
    std::fs::create_dir_all(&app_data_dir).map_err(|e| format!("创建数据目录失败: {}", e))?;

    // 数据库文件路径
    let db_path = app_data_dir.join("danci.db");

    // 获取 API 基础 URL（从配置或环境变量）
    let api_base_url =
        std::env::var("API_BASE_URL").unwrap_or_else(|_| "https://api.danci.app".to_string());

    // 创建存储服务
    let service = StorageService::new(&db_path, api_base_url).map_err(map_storage_error)?;

    // 保存到状态
    let mut guard = state
        .service
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;
    *guard = Some(service);

    log::info!("数据库初始化成功: {:?}", db_path);
    Ok(())
}

// ============================================================
// 2. Word 命令
// ============================================================

/// 获取单个单词
#[tauri::command]
pub async fn get_word(
    id: String,
    state: State<'_, AppStorageState>,
) -> Result<Option<Word>, String> {
    let guard = get_service(&state)?;
    let service = guard
        .as_ref()
        .ok_or("数据库未初始化，请先调用 init_database")?;

    let conn = service
        .db()
        .connection()
        .lock()
        .map_err(|e| format!("获取数据库连接失败: {}", e))?;

    let word: Option<Word> = conn
        .query_row("SELECT * FROM word WHERE id = ?1", [&id], |row| {
            Word::from_row(row)
        })
        .ok();

    Ok(word)
}

/// 获取词书中的所有单词
#[tauri::command]
pub async fn get_words_by_book(
    book_id: String,
    state: State<'_, AppStorageState>,
) -> Result<Vec<Word>, String> {
    let guard = get_service(&state)?;
    let service = guard
        .as_ref()
        .ok_or("数据库未初始化，请先调用 init_database")?;

    let conn = service
        .db()
        .connection()
        .lock()
        .map_err(|e| format!("获取数据库连接失败: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT * FROM word WHERE word_book_id = ?1 ORDER BY sort_order ASC")
        .map_err(|e| format!("准备查询失败: {}", e))?;

    let words: Vec<Word> = stmt
        .query_map([&book_id], |row| Word::from_row(row))
        .map_err(|e| format!("查询失败: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(words)
}

/// 搜索单词
#[tauri::command]
pub async fn search_words(
    query: String,
    limit: i32,
    state: State<'_, AppStorageState>,
) -> Result<Vec<Word>, String> {
    let guard = get_service(&state)?;
    let service = guard
        .as_ref()
        .ok_or("数据库未初始化，请先调用 init_database")?;

    let conn = service
        .db()
        .connection()
        .lock()
        .map_err(|e| format!("获取数据库连接失败: {}", e))?;

    let search_pattern = format!("%{}%", query);

    let mut stmt = conn
        .prepare(
            r#"
            SELECT * FROM word
            WHERE word LIKE ?1 OR definition LIKE ?1
            ORDER BY
                CASE
                    WHEN word = ?2 THEN 0
                    WHEN word LIKE ?3 THEN 1
                    ELSE 2
                END,
                word ASC
            LIMIT ?4
            "#,
        )
        .map_err(|e| format!("准备查询失败: {}", e))?;

    let exact_match = &query;
    let prefix_pattern = format!("{}%", query);

    let words: Vec<Word> = stmt
        .query_map(
            rusqlite::params![search_pattern, exact_match, prefix_pattern, limit],
            |row| Word::from_row(row),
        )
        .map_err(|e| format!("查询失败: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(words)
}

/// 下载词书
///
/// 从云端下载词书数据到本地
#[tauri::command]
pub async fn download_word_book(
    book_id: String,
    state: State<'_, AppStorageState>,
) -> Result<(), String> {
    let guard = get_service(&state)?;
    let service = guard
        .as_ref()
        .ok_or("数据库未初始化，请先调用 init_database")?;

    // TODO: 实现从云端下载词书的逻辑
    // 这里需要调用 API 获取词书数据，然后保存到本地数据库
    log::info!("下载词书: {}", book_id);

    // 暂时返回成功，实际实现需要：
    // 1. 从云端 API 获取词书元信息
    // 2. 获取词书中的所有单词
    // 3. 批量插入到本地数据库
    // 4. 更新词书的 is_downloaded 状态

    Ok(())
}

// ============================================================
// 3. 学习状态命令
// ============================================================

/// 获取单词学习状态
#[tauri::command]
pub async fn get_learning_state(
    user_id: String,
    word_id: String,
    state: State<'_, AppStorageState>,
) -> Result<Option<WordLearningState>, String> {
    let guard = get_service(&state)?;
    let service = guard
        .as_ref()
        .ok_or("数据库未初始化，请先调用 init_database")?;

    let conn = service
        .db()
        .connection()
        .lock()
        .map_err(|e| format!("获取数据库连接失败: {}", e))?;

    let learning_state: Option<WordLearningState> = conn
        .query_row(
            "SELECT * FROM word_learning_state WHERE user_id = ?1 AND word_id = ?2",
            [&user_id, &word_id],
            |row| WordLearningState::from_row(row),
        )
        .ok();

    Ok(learning_state)
}

/// 保存学习状态
#[tauri::command]
pub async fn save_learning_state(
    learning_state: WordLearningState,
    state: State<'_, AppStorageState>,
) -> Result<(), String> {
    let guard = get_service(&state)?;
    let service = guard
        .as_ref()
        .ok_or("数据库未初始化，请先调用 init_database")?;

    let conn = service
        .db()
        .connection()
        .lock()
        .map_err(|e| format!("获取数据库连接失败: {}", e))?;

    learning_state.upsert(&conn).map_err(map_storage_error)?;

    Ok(())
}

/// 获取待复习单词
#[tauri::command]
pub async fn get_due_words(
    user_id: String,
    limit: i32,
    state: State<'_, AppStorageState>,
) -> Result<Vec<WordLearningState>, String> {
    let guard = get_service(&state)?;
    let service = guard
        .as_ref()
        .ok_or("数据库未初始化，请先调用 init_database")?;

    let conn = service
        .db()
        .connection()
        .lock()
        .map_err(|e| format!("获取数据库连接失败: {}", e))?;

    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let mut stmt = conn
        .prepare(
            r#"
            SELECT * FROM word_learning_state
            WHERE user_id = ?1
              AND (next_review_at IS NULL OR next_review_at <= ?2)
              AND is_mastered = 0
            ORDER BY
                CASE WHEN next_review_at IS NULL THEN 0 ELSE 1 END,
                next_review_at ASC
            LIMIT ?3
            "#,
        )
        .map_err(|e| format!("准备查询失败: {}", e))?;

    let states: Vec<WordLearningState> = stmt
        .query_map(rusqlite::params![user_id, now, limit], |row| {
            WordLearningState::from_row(row)
        })
        .map_err(|e| format!("查询失败: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(states)
}

/// 获取学习统计
#[tauri::command]
pub async fn get_learning_stats(
    user_id: String,
    state: State<'_, AppStorageState>,
) -> Result<LearningStats, String> {
    let guard = get_service(&state)?;
    let service = guard
        .as_ref()
        .ok_or("数据库未初始化，请先调用 init_database")?;

    let conn = service
        .db()
        .connection()
        .lock()
        .map_err(|e| format!("获取数据库连接失败: {}", e))?;

    // 总学习单词数
    let total_words: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM word_learning_state WHERE user_id = ?1 AND first_learned_at IS NOT NULL",
            [&user_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // 已掌握单词数
    let mastered_words: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM word_learning_state WHERE user_id = ?1 AND is_mastered = 1",
            [&user_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // 学习中单词数
    let learning_words: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM word_learning_state WHERE user_id = ?1 AND state IN (1, 3)",
            [&user_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // 待复习单词数
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let due_words: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM word_learning_state WHERE user_id = ?1 AND next_review_at <= ?2 AND is_mastered = 0",
            rusqlite::params![user_id, now],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // 今日学习数（首次学习在今天的单词）
    let today = Utc::now().format("%Y-%m-%d").to_string();
    let today_learned: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM word_learning_state WHERE user_id = ?1 AND DATE(first_learned_at) = ?2",
            rusqlite::params![user_id, today],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // 今日复习数
    let today_reviewed: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM answer_record WHERE user_id = ?1 AND DATE(created_at) = ?2",
            rusqlite::params![user_id, today],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // 总正确率
    let (total_correct, total_wrong): (i32, i32) = conn
        .query_row(
            "SELECT COALESCE(SUM(correct_count), 0), COALESCE(SUM(wrong_count), 0) FROM word_learning_state WHERE user_id = ?1",
            [&user_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap_or((0, 0));

    let accuracy_rate = if total_correct + total_wrong > 0 {
        total_correct as f64 / (total_correct + total_wrong) as f64
    } else {
        0.0
    };

    // 连续学习天数（简化计算）
    let streak_days: i32 = conn
        .query_row(
            r#"
            WITH RECURSIVE dates AS (
                SELECT DATE('now') as d, 0 as streak
                UNION ALL
                SELECT DATE(d, '-1 day'), streak + 1
                FROM dates
                WHERE EXISTS (
                    SELECT 1 FROM answer_record
                    WHERE user_id = ?1 AND DATE(created_at) = DATE(d, '-1 day')
                )
            )
            SELECT MAX(streak) FROM dates
            WHERE EXISTS (
                SELECT 1 FROM answer_record
                WHERE user_id = ?1 AND DATE(created_at) = DATE('now')
            ) OR streak > 0
            "#,
            [&user_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(LearningStats {
        total_words,
        mastered_words,
        learning_words,
        due_words,
        today_learned,
        today_reviewed,
        accuracy_rate,
        streak_days,
    })
}

// ============================================================
// 4. 答题记录命令
// ============================================================

/// 保存答题记录
#[tauri::command]
pub async fn save_answer_record(
    record: AnswerRecord,
    state: State<'_, AppStorageState>,
) -> Result<(), String> {
    let guard = get_service(&state)?;
    let service = guard
        .as_ref()
        .ok_or("数据库未初始化，请先调用 init_database")?;

    let conn = service
        .db()
        .connection()
        .lock()
        .map_err(|e| format!("获取数据库连接失败: {}", e))?;

    record.insert(&conn).map_err(map_storage_error)?;

    Ok(())
}

/// 获取今日统计
#[tauri::command]
pub async fn get_today_stats(
    user_id: String,
    state: State<'_, AppStorageState>,
) -> Result<DailyStats, String> {
    let guard = get_service(&state)?;
    let service = guard
        .as_ref()
        .ok_or("数据库未初始化，请先调用 init_database")?;

    let conn = service
        .db()
        .connection()
        .lock()
        .map_err(|e| format!("获取数据库连接失败: {}", e))?;

    let today = Utc::now().format("%Y-%m-%d").to_string();

    // 今日新学单词数
    let new_words: i32 = conn
        .query_row(
            "SELECT COUNT(DISTINCT word_id) FROM answer_record WHERE user_id = ?1 AND DATE(created_at) = ?2 AND study_mode = 'learn'",
            rusqlite::params![user_id, today],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // 今日复习单词数
    let reviewed_words: i32 = conn
        .query_row(
            "SELECT COUNT(DISTINCT word_id) FROM answer_record WHERE user_id = ?1 AND DATE(created_at) = ?2 AND study_mode = 'review'",
            rusqlite::params![user_id, today],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // 正确/错误次数
    let correct_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM answer_record WHERE user_id = ?1 AND DATE(created_at) = ?2 AND is_correct = 1",
            rusqlite::params![user_id, today],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let wrong_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM answer_record WHERE user_id = ?1 AND DATE(created_at) = ?2 AND is_correct = 0",
            rusqlite::params![user_id, today],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let accuracy_rate = if correct_count + wrong_count > 0 {
        correct_count as f64 / (correct_count + wrong_count) as f64
    } else {
        0.0
    };

    // 总学习时长
    let total_time_ms: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(response_time), 0) FROM answer_record WHERE user_id = ?1 AND DATE(created_at) = ?2",
            rusqlite::params![user_id, today],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(DailyStats {
        date: today,
        new_words,
        reviewed_words,
        correct_count,
        wrong_count,
        accuracy_rate,
        total_time_secs: total_time_ms / 1000,
    })
}

// ============================================================
// 5. 同步命令
// ============================================================

/// 同步到云端
///
/// 注意：目前同步功能处于开发状态，返回占位结果
#[tauri::command]
pub fn sync_to_cloud(
    auth_token: String,
    state: State<'_, AppStorageState>,
) -> Result<SyncResult, String> {
    let guard = get_service(&state)?;
    let _service = guard
        .as_ref()
        .ok_or("数据库未初始化，请先调用 init_database")?;

    // TODO: 实现实际同步逻辑
    // 目前返回占位结果，实际的 async 同步将在后续版本实现
    Ok(SyncResult {
        success: true,
        uploaded_count: 0,
        downloaded_count: 0,
        conflicts_resolved: 0,
        errors: vec!["同步功能正在开发中".to_string()],
        sync_time: chrono::Utc::now(),
    })
}

/// 从云端同步
///
/// 注意：目前同步功能处于开发状态，返回占位结果
#[tauri::command]
pub fn sync_from_cloud(
    auth_token: String,
    state: State<'_, AppStorageState>,
) -> Result<SyncResult, String> {
    let guard = get_service(&state)?;
    let _service = guard
        .as_ref()
        .ok_or("数据库未初始化，请先调用 init_database")?;

    // TODO: 实现实际同步逻辑
    // 目前返回占位结果，实际的 async 同步将在后续版本实现
    Ok(SyncResult {
        success: true,
        uploaded_count: 0,
        downloaded_count: 0,
        conflicts_resolved: 0,
        errors: vec!["同步功能正在开发中".to_string()],
        sync_time: chrono::Utc::now(),
    })
}

/// 获取同步状态
#[tauri::command]
pub async fn get_sync_status(state: State<'_, AppStorageState>) -> Result<SyncStatus, String> {
    let guard = get_service(&state)?;
    let service = guard
        .as_ref()
        .ok_or("数据库未初始化，请先调用 init_database")?;

    let conn = service
        .db()
        .connection()
        .lock()
        .map_err(|e| format!("获取数据库连接失败: {}", e))?;

    // 获取上次同步时间
    let last_sync_time: Option<String> = conn
        .query_row(
            "SELECT value FROM sync_metadata WHERE key = 'last_sync_time'",
            [],
            |row| row.get(0),
        )
        .ok();

    // 待上传数量
    let pending_uploads: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM word_learning_state WHERE is_dirty = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // 待同步答题记录数量
    let pending_answers: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM answer_record WHERE is_synced = 0",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(SyncStatus {
        is_connected: true, // 简化处理，实际需要检查网络状态
        last_sync_time,
        pending_uploads: pending_uploads + pending_answers,
        pending_downloads: 0, // 需要从服务端获取
        is_syncing: false,    // 需要实现同步状态追踪
        last_error: None,
    })
}

// ============================================================
// 测试
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_learning_stats_default() {
        let stats = LearningStats {
            total_words: 100,
            mastered_words: 50,
            learning_words: 30,
            due_words: 20,
            today_learned: 10,
            today_reviewed: 15,
            accuracy_rate: 0.85,
            streak_days: 7,
        };

        assert_eq!(stats.total_words, 100);
        assert_eq!(stats.accuracy_rate, 0.85);
    }

    #[test]
    fn test_daily_stats() {
        let stats = DailyStats {
            date: "2024-01-15".to_string(),
            new_words: 20,
            reviewed_words: 30,
            correct_count: 45,
            wrong_count: 5,
            accuracy_rate: 0.9,
            total_time_secs: 1800,
        };

        assert_eq!(stats.new_words, 20);
        assert_eq!(stats.accuracy_rate, 0.9);
    }

    #[test]
    fn test_sync_status() {
        let status = SyncStatus {
            is_connected: true,
            last_sync_time: Some("2024-01-15T10:30:00Z".to_string()),
            pending_uploads: 5,
            pending_downloads: 0,
            is_syncing: false,
            last_error: None,
        };

        assert!(status.is_connected);
        assert_eq!(status.pending_uploads, 5);
    }
}
